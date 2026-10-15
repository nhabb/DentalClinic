import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  REMOTE_TX_OPTIONS,
  Tx,
} from '../../shared/prisma/prisma.service';
import { AuditService } from '../../shared/audit/audit.service';
import { clinicTodayIso, toDateOnly } from '../../shared/common/date-only';
import { invoiceInclude } from '../billing/billing.service';
import { dueDateFor, invoiceFigures, round2 } from '../billing/invoice-math';
import {
  CreateQuoteDto,
  InvoiceFromQuoteDto,
  QuoteItemDto,
  QuoteStatus,
  UpdateQuoteDto,
} from './dto/quote.dto';

const quoteInclude = {
  patient: {
    select: {
      id: true,
      users: { select: { id: true, first_name: true, last_name: true } },
    },
  },
  creator: { select: { id: true, first_name: true, last_name: true } },
  items: { orderBy: { id: 'asc' as const } },
  invoices: {
    select: {
      id: true,
      invoice_number: true,
      status: true,
      total_amount: true,
      created_at: true,
    },
  },
};

/** Midnight UTC of the clinic's today: a valid_until before this is in the past, however it was stored. */
const startOfToday = () => new Date(`${clinicTodayIso()}T00:00:00.000Z`);

/**
 * Quotes: priced treatment plans. A quote is not money. It can be edited while
 * it is a draft, is frozen once sent, and ends accepted, declined or expired.
 * A revision is a new row (version + 1) that supersedes the old one, so what
 * the patient was told is never rewritten. Accepting a quote writes its
 * prices onto the planned chart records, so completing that work bills the
 * agreed amount and links the invoice back to the quote; an accepted quote
 * can also be billed as it stands (treatment paid up front).
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filters: {
    patient_id?: number;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    await this.expireOverdue();
    const { patient_id, status, page = 1, limit = 50 } = filters;
    const where: Record<string, unknown> = {};
    if (patient_id) where.patient_id = BigInt(patient_id);
    if (status) where.status = status;
    const [data, total] = await Promise.all([
      this.prisma.quotes.findMany({
        where,
        include: quoteInclude,
        orderBy: [{ created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.quotes.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const quote = await this.prisma.quotes.findUnique({
      where: { id },
      include: quoteInclude,
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async create(dto: CreateQuoteDto, actorId: bigint) {
    const patientId = BigInt(dto.patient_id);
    const patient = await this.prisma.patient_profiles.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient profile not found');
    await this.assertItemsBelongTo(patientId, dto.items);
    const totals = quoteTotals(
      dto.items.map((i) => i.amount),
      dto.quoted_discount ?? 0,
    );

    return this.prisma.quotes.create({
      data: {
        patient_id: patientId,
        version: 1,
        status: 'draft',
        valid_until: validUntilFrom(dto.valid_until),
        notes: dto.notes?.trim() || null,
        ...totals,
        created_by: actorId,
        items: { create: dto.items.map(itemData) },
      },
      include: quoteInclude,
    });
  }

  /** Only drafts change. Items, when given, replace the whole list. */
  async update(id: bigint, dto: UpdateQuoteDto) {
    const quote = await this.requireStatus(id, ['draft'], 'edit');
    if (dto.items) await this.assertItemsBelongTo(quote.patient_id, dto.items);
    const lineAmounts = dto.items
      ? dto.items.map((i) => i.amount)
      : quote.items.map((i) => Number(i.quoted_amount));
    const totals = quoteTotals(
      lineAmounts,
      dto.quoted_discount ?? Number(quote.quoted_discount),
    );

    return this.prisma.$transaction(async (tx) => {
      // The discount first, so the total trigger never sees a discount without its lines.
      await tx.quotes.update({
        where: { id },
        data: {
          ...(dto.valid_until !== undefined
            ? { valid_until: validUntilFrom(dto.valid_until) }
            : {}),
          ...(dto.notes !== undefined
            ? { notes: dto.notes.trim() || null }
            : {}),
          ...totals,
          updated_at: new Date(),
        },
      });
      if (dto.items) {
        await tx.quote_items.deleteMany({ where: { quote_id: id } });
        await tx.quote_items.createMany({
          data: dto.items.map((i) => ({ quote_id: id, ...itemData(i) })),
        });
      }
      return tx.quotes.findUniqueOrThrow({
        where: { id },
        include: quoteInclude,
      });
    });
  }

  /** Given to the patient: frozen from here on. */
  async send(id: bigint) {
    await this.requireStatus(id, ['draft'], 'send');
    return this.prisma.quotes.update({
      where: { id },
      data: { status: 'sent', sent_at: new Date(), updated_at: new Date() },
      include: quoteInclude,
    });
  }

  /**
   * The patient agreed. The quoted prices become the planned records' quoted
   * amounts, so completing that work bills exactly what was agreed; earlier
   * versions still in play are closed as expired. Work that was billed in the
   * meantime cannot be agreed again at a new price: revise the quote instead.
   */
  async accept(id: bigint, actorId: bigint) {
    const quote = await this.requireStatus(id, ['draft', 'sent'], 'accept');
    await this.assertRecordsUnbilled(quote, 'accepted');
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of quote.items) {
        if (item.record_id === null) continue;
        await tx.patient_records.updateMany({
          where: { id: item.record_id, invoice_id: null },
          data: { quoted_amount: item.quoted_amount, updated_at: new Date() },
        });
      }
      await this.closeCompetingQuotes(tx, quote);
      return tx.quotes.update({
        where: { id },
        data: {
          status: 'accepted',
          // Accepted straight from a draft: it was presented in person.
          sent_at: quote.sent_at ?? new Date(),
          accepted_at: new Date(),
          updated_at: new Date(),
        },
        include: quoteInclude,
      });
    });
    await this.audit.record({
      actorId,
      action: 'billing.quote.accept',
      table: 'quotes',
      recordId: id,
      after: {
        quote_number: quote.quote_number,
        version: quote.version,
        quoted_total: quote.quoted_total,
      },
    });
    return updated;
  }

  async decline(id: bigint) {
    await this.requireStatus(id, ['draft', 'sent'], 'decline');
    return this.prisma.quotes.update({
      where: { id },
      data: {
        status: 'declined',
        declined_at: new Date(),
        updated_at: new Date(),
      },
      include: quoteInclude,
    });
  }

  /**
   * A new draft, version + 1, with the same lines, pointing back at this one.
   * The old quote keeps its status: what the patient saw stays as it was.
   */
  async revise(id: bigint, actorId: bigint) {
    const quote = await this.requireStatus(
      id,
      ['sent', 'accepted', 'declined', 'expired'],
      'revise',
    );
    // One open revision at a time, so two drafts never compete for "version n + 1".
    const pending = await this.prisma.quotes.findFirst({
      where: { supersedes_id: id, status: 'draft' },
      select: { id: true, version: true, quote_number: true },
    });
    if (pending) {
      throw new ConflictException(
        `Version ${pending.version} of this quote is already a draft (${pending.quote_number}); edit or delete it instead`,
      );
    }
    return this.prisma.quotes.create({
      data: {
        patient_id: quote.patient_id,
        branch_id: quote.branch_id,
        version: quote.version + 1,
        supersedes_id: quote.id,
        status: 'draft',
        valid_until: quote.valid_until,
        notes: quote.notes,
        quoted_discount: quote.quoted_discount,
        quoted_total: quote.quoted_total,
        created_by: actorId,
        items: {
          create: quote.items.map((i) => ({
            record_id: i.record_id,
            procedure_name: i.procedure_name,
            tooth_number: i.tooth_number,
            description: i.description,
            quoted_amount: i.quoted_amount,
          })),
        },
      },
      include: quoteInclude,
    });
  }

  /** Drafts only: anything the patient has seen stays on record. */
  async remove(id: bigint, actorId: bigint) {
    const quote = await this.requireStatus(id, ['draft'], 'delete');
    await this.prisma.quotes.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'billing.quote.delete',
      table: 'quotes',
      recordId: id,
      before: {
        quote_number: quote.quote_number,
        version: quote.version,
        quoted_total: quote.quoted_total,
        items: quote.items,
      },
    });
    return { success: true };
  }

  /**
   * Bill an accepted quote as it stands: one invoice with the quote's lines
   * and discount, linked back to it. The planned records it prices are
   * attached to the invoice, so the chart cannot bill them a second time
   * when the work is completed. One live invoice per quote.
   */
  async createInvoice(id: bigint, dto: InvoiceFromQuoteDto, actorId: bigint) {
    const quote = await this.requireStatus(id, ['accepted'], 'invoice');
    const live = quote.invoices.find((inv) => inv.status !== 'cancelled');
    if (live) {
      throw new ConflictException(
        `Invoice ${live.invoice_number} was already issued from this quote; cancel it before issuing another`,
      );
    }
    await this.assertRecordsUnbilled(quote, 'invoiced');

    const procedureDate = toDateOnly(dto.procedure_date ?? clinicTodayIso());
    const figures = invoiceFigures(
      quote.items.map((i) => Number(i.quoted_amount)),
      Number(quote.quoted_discount),
      `Agreed on quote ${quote.quote_number}`,
    );
    const recordIds = plannedRecordIds(quote);

    // One transaction: the invoice, then the records attached only while they
    // are still unbilled. A desk completing the same work from the chart at
    // the same moment loses here instead of billing it a second time; the
    // database backs this with a one-live-invoice-per-quote index and a
    // trigger that refuses to move a billed record (20261015130000).
    const invoice = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.treatment_invoices.create({
          data: {
            ...(quote.branch_id ? { branch_id: quote.branch_id } : {}),
            patient_id: quote.patient_id,
            procedure_date: procedureDate,
            due_date: dueDateFor(procedureDate, dto.due_date),
            notes: dto.notes?.trim() || quote.notes,
            ...figures,
            created_by: actorId,
            quote_id: quote.id,
            line_items: {
              create: quote.items.map((i) => ({
                procedure_name: i.procedure_name,
                amount: i.quoted_amount,
                tooth_number: i.tooth_number,
              })),
            },
          },
          select: { id: true },
        });
        if (recordIds.length > 0) {
          const attached = await tx.patient_records.updateMany({
            where: { id: { in: recordIds }, invoice_id: null },
            data: { invoice_id: created.id, updated_at: new Date() },
          });
          if (attached.count !== recordIds.length) {
            throw new ConflictException(
              'Some of the quoted work was billed from the chart a moment ago; refresh and check the invoices',
            );
          }
        }
        return created.id;
      }, REMOTE_TX_OPTIONS)
      // The full row (with its relations) is read after the commit: fewer
      // round trips inside the transaction on a remote database.
      .then((invoiceId) =>
        this.prisma.treatment_invoices.findUniqueOrThrow({
          where: { id: invoiceId },
          include: invoiceInclude,
        }),
      )
      .catch((err: unknown) => {
        if (/one_live_per_quote/.test((err as Error).message ?? '')) {
          throw new ConflictException(
            'An invoice was issued from this quote a moment ago; refresh and check the invoices',
          );
        }
        throw err;
      });
    await this.audit.record({
      actorId,
      action: 'billing.quote.invoice',
      table: 'quotes',
      recordId: id,
      after: {
        quote_number: quote.quote_number,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        total_amount: invoice.total_amount,
      },
    });
    return invoice;
  }

  /** A sent quote past its validity date is expired; swept before lists and status changes. */
  private async expireOverdue(): Promise<void> {
    await this.prisma.quotes.updateMany({
      where: { status: 'sent', valid_until: { lt: startOfToday() } },
      data: { status: 'expired', updated_at: new Date() },
    });
  }

  /**
   * One accepted quote per piece of work. Every other open (sent or accepted)
   * quote of this patient that is a version of this one, or that prices any
   * of the same planned records, is closed as expired.
   */
  private async closeCompetingQuotes(
    tx: Tx,
    quote: {
      id: bigint;
      patient_id: bigint;
      supersedes_id: bigint | null;
      items: { record_id: bigint | null }[];
    },
  ) {
    const recordIds = plannedRecordIds(quote);
    await tx.quotes.updateMany({
      where: {
        patient_id: quote.patient_id,
        id: { not: quote.id },
        status: { in: ['sent', 'accepted'] },
        OR: [
          { supersedes_id: quote.id },
          ...(quote.supersedes_id !== null
            ? [{ id: quote.supersedes_id }]
            : []),
          ...(recordIds.length
            ? [{ items: { some: { record_id: { in: recordIds } } } }]
            : []),
        ],
      },
      data: { status: 'expired', updated_at: new Date() },
    });
  }

  private async requireStatus(
    id: bigint,
    allowed: QuoteStatus[],
    verb: string,
  ) {
    await this.expireOverdue();
    const quote = await this.findOne(id);
    if (!allowed.includes(quote.status as QuoteStatus)) {
      throw new ConflictException(
        `A ${quote.status} quote cannot be ${verb === 'edit' ? 'edited' : verb + (verb.endsWith('e') ? 'd' : 'ed')}; ${
          verb === 'edit' || verb === 'delete'
            ? 'only drafts can'
            : `allowed from: ${allowed.join(', ')}`
        }`,
      );
    }
    return quote;
  }

  /** Lines that price a chart record must point at a planned record of this patient. */
  private async assertItemsBelongTo(patientId: bigint, items: QuoteItemDto[]) {
    const ids = items
      .filter((i) => i.record_id != null)
      .map((i) => BigInt(i.record_id as number));
    if (ids.length === 0) return;
    const found = await this.prisma.patient_records.count({
      where: {
        id: { in: ids },
        patient_id: patientId,
        record_type: 'treatment_plan',
      },
    });
    if (found !== new Set(ids.map(String)).size) {
      throw new BadRequestException(
        'Every record_id must be a planned chart record of this patient',
      );
    }
  }

  /** Work already on an invoice cannot be priced again by a quote. */
  private async assertRecordsUnbilled(
    quote: { items: { record_id: bigint | null }[] },
    verb: string,
  ) {
    const recordIds = plannedRecordIds(quote);
    if (recordIds.length === 0) return;
    const billed = await this.prisma.patient_records.findMany({
      where: { id: { in: recordIds }, invoice_id: { not: null } },
      select: {
        title: true,
        tooth_number: true,
        invoice: { select: { invoice_number: true } },
      },
    });
    if (billed.length === 0) return;
    const lines = billed
      .map(
        (r) =>
          `${r.title}${r.tooth_number ? ` on tooth ${r.tooth_number}` : ''} (${r.invoice?.invoice_number ?? 'invoice'})`,
      )
      .join(', ');
    throw new ConflictException(
      `This quote cannot be ${verb}: ${lines} already billed. Revise the quote without that work.`,
    );
  }
}

/** The chart records a quote prices (lines without a record are free text). */
const plannedRecordIds = (quote: {
  items: { record_id: bigint | null }[];
}): bigint[] =>
  quote.items.map((i) => i.record_id).filter((r): r is bigint => r !== null);

/** Sum of the lines minus the discount; the discount cannot exceed the lines. */
function quoteTotals(lineAmounts: number[], discount: number) {
  const subtotal = round2(lineAmounts.reduce((s, a) => s + a, 0));
  const quoted_discount = round2(discount);
  if (quoted_discount > subtotal) {
    throw new BadRequestException(
      `The discount (${quoted_discount}) exceeds the lines (${subtotal})`,
    );
  }
  return { quoted_discount, quoted_total: round2(subtotal - quoted_discount) };
}

/** A validity date is a day the prices still hold: today or later, or none. */
function validUntilFrom(value: string | undefined): Date | null {
  if (!value) return null;
  if (value.slice(0, 10) < clinicTodayIso()) {
    throw new BadRequestException('valid_until cannot be in the past');
  }
  return toDateOnly(value);
}

const itemData = (i: QuoteItemDto) => ({
  record_id: i.record_id != null ? BigInt(i.record_id) : null,
  procedure_name: i.procedure_name,
  tooth_number: i.tooth_number ?? null,
  description: i.description?.trim() || null,
  quoted_amount: round2(i.amount),
});
