import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, Tx } from '../../shared/prisma/prisma.service';
import { AuditService } from '../../shared/audit/audit.service';
import {
  CreateQuoteDto,
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
    select: { id: true, status: true, total_amount: true, created_at: true },
  },
};


/** Today as a date-only value, the way valid_until is stored. */
const today = () => new Date(new Date().toISOString().slice(0, 10));

const toDateOnly = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

/**
 * Quotes: priced treatment plans. A quote is not money. It can be edited while
 * it is a draft, is frozen once sent, and ends accepted, declined or expired.
 * A revision is a new row (version + 1) that supersedes the old one, so what
 * the patient was told is never rewritten. Accepting a quote writes its
 * prices onto the planned chart records, so completing that work bills the
 * agreed amount and links the invoice back to the quote.
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

    return this.prisma.quotes.create({
      data: {
        patient_id: patientId,
        version: 1,
        status: 'draft',
        valid_until: dto.valid_until ? toDateOnly(dto.valid_until) : null,
        notes: dto.notes?.trim() || null,
        quoted_total: sumOf(dto.items),
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

    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.quote_items.deleteMany({ where: { quote_id: id } });
        await tx.quote_items.createMany({
          data: dto.items.map((i) => ({ quote_id: id, ...itemData(i) })),
        });
      }
      return tx.quotes.update({
        where: { id },
        data: {
          ...(dto.valid_until !== undefined
            ? {
                valid_until: dto.valid_until
                  ? toDateOnly(dto.valid_until)
                  : null,
              }
            : {}),
          ...(dto.notes !== undefined
            ? { notes: dto.notes.trim() || null }
            : {}),
          ...(dto.items ? { quoted_total: sumOf(dto.items) } : {}),
          updated_at: new Date(),
        },
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
   * versions still in play are closed as expired.
   */
  async accept(id: bigint, actorId: bigint) {
    const quote = await this.requireStatus(id, ['draft', 'sent'], 'accept');
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of quote.items) {
        if (item.record_id === null) continue;
        await tx.patient_records.updateMany({
          where: { id: item.record_id, record_type: 'treatment_plan' },
          data: { quoted_amount: item.quoted_amount, updated_at: new Date() },
        });
      }
      await this.closeCompetingQuotes(tx, quote);
      return tx.quotes.update({
        where: { id },
        data: {
          status: 'accepted',
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
      after: { version: quote.version, quoted_total: quote.quoted_total },
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
      select: { id: true, version: true },
    });
    if (pending) {
      throw new ConflictException(
        `Version ${pending.version} of this quote is already a draft (quote #${pending.id}); edit or delete it instead`,
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
        version: quote.version,
        quoted_total: quote.quoted_total,
        items: quote.items,
      },
    });
    return { success: true };
  }

  /** A sent quote past its validity date is expired; swept before lists and status changes. */
  private async expireOverdue(): Promise<void> {
    await this.prisma.quotes.updateMany({
      where: { status: 'sent', valid_until: { lt: today() } },
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
    quote: { id: bigint; patient_id: bigint; supersedes_id: bigint | null; items: { record_id: bigint | null }[] },
  ) {
    const recordIds = quote.items
      .map((i) => i.record_id)
      .filter((r): r is bigint => r !== null);
    await tx.quotes.updateMany({
      where: {
        patient_id: quote.patient_id,
        id: { not: quote.id },
        status: { in: ['sent', 'accepted'] },
        OR: [
          { supersedes_id: quote.id },
          ...(quote.supersedes_id !== null ? [{ id: quote.supersedes_id }] : []),
          ...(recordIds.length ? [{ items: { some: { record_id: { in: recordIds } } } }] : []),
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
}

const sumOf = (items: QuoteItemDto[]) =>
  Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;

const itemData = (i: QuoteItemDto) => ({
  record_id: i.record_id != null ? BigInt(i.record_id) : null,
  procedure_name: i.procedure_name,
  tooth_number: i.tooth_number ?? null,
  description: i.description?.trim() || null,
  quoted_amount: i.amount,
});
