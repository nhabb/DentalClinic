import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, Tx } from '../../shared/prisma/prisma.service';
import { AuditService } from '../../shared/audit/audit.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RefundDto } from './dto/refund.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';

const invoiceInclude = {
  patient: {
    select: {
      id: true,
      users: {
        select: { id: true, first_name: true, last_name: true, email: true },
      },
    },
  },
  creator: {
    select: { id: true, first_name: true, last_name: true },
  },
  canceller: {
    select: { id: true, first_name: true, last_name: true },
  },
  quote: {
    select: { id: true, version: true, status: true, quoted_total: true },
  },
  line_items: {
    orderBy: { created_at: 'asc' as const },
  },
  invoice_payments: {
    include: {
      creator: { select: { id: true, first_name: true, last_name: true } },
    },
    orderBy: { created_at: 'asc' as const },
  },
};

// Tolerance for floating point comparisons on 2-decimal money values.
const EPSILON = 0.005;

const round2 = (n: number): number => Math.round(n * 100) / 100;


export type InvoiceStatus = 'open' | 'partial' | 'paid' | 'cancelled';

/** Statuses of invoices that are still owed (or settled); cancelled is neither. */
export const LIVE_STATUSES: readonly InvoiceStatus[] = [
  'open',
  'partial',
  'paid',
];

/** The status an invoice's payments imply (never cancelled: that is a decision, not arithmetic). */
export function deriveInvoiceStatus(
  total: number,
  paid: number,
): Exclude<InvoiceStatus, 'cancelled'> {
  if (total - paid <= EPSILON) return 'paid';
  if (paid > EPSILON) return 'partial';
  return 'open';
}

/** Payments and refunds of a set of invoice_payments rows, as the reports need them. */
export interface MoneyMoved {
  /** Money received. */
  payments: number;
  /** Money returned. */
  refunds: number;
  /** payments - refunds: what the clinic actually kept. */
  net: number;
  payment_count: number;
  refund_count: number;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateInvoiceDto) {
    // Accept either patient_profiles.id or users.id
    let profile = await this.prisma.patient_profiles.findUnique({
      where: { id: BigInt(dto.patient_id) },
    });
    if (!profile) {
      profile = await this.prisma.patient_profiles.findUnique({
        where: { user_id: BigInt(dto.patient_id) },
      });
    }
    if (!profile) throw new NotFoundException('Patient profile not found');

    const total_amount = dto.line_items.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    return this.prisma.treatment_invoices.create({
      data: {
        // Omitted = database default (home branch, then the organization's default branch).
        ...(dto.branch_id ? { branch_id: BigInt(dto.branch_id) } : {}),
        patient_id: profile.id,
        procedure_date: new Date(dto.procedure_date),
        notes: dto.notes,
        total_amount,
        remaining_amount: total_amount,
        status: 'open',
        created_by: dto.created_by ? BigInt(dto.created_by) : null,
        line_items: {
          create: dto.line_items.map((item) => ({
            procedure_name: item.procedure_name,
            amount: item.amount,
          })),
        },
      },
      include: invoiceInclude,
    });
  }

  async findAll(filters: {
    patient_id?: number;
    branch_id?: number;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      patient_id,
      branch_id,
      status,
      from,
      to,
      page = 1,
      limit = 20,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (patient_id) where.patient_id = BigInt(patient_id);
    if (branch_id) where.branch_id = BigInt(branch_id);
    if (status) where.status = status;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) where.created_at.lte = new Date(`${to}T23:59:59.999Z`);
    }

    const [data, total] = await Promise.all([
      this.prisma.treatment_invoices.findMany({
        where,
        include: invoiceInclude,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.treatment_invoices.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const invoice = await this.prisma.treatment_invoices.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Treatment invoice not found');
    return invoice;
  }

  // ── Corrections: refund, void, delete ─────────────────────────────────────

  /**
   * Money received is recorded in exactly one place, invoice_payments. The
   * invoice's totals are re-derived from that table inside one transaction
   * with the invoice row locked, so two payments posted at the same moment (a
   * double click, two desks) cannot both pass the balance check or leave the
   * totals out of step with the payments. The database enforces the same rule
   * with constraints and a trigger (migration 20261009010000_payment_integrity).
   */
  async recordPayment(invoiceId: bigint, dto: RecordPaymentDto) {
    const amount = round2(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockInvoice(tx, invoiceId);
      if (locked.status === 'cancelled') {
        throw new ConflictException(
          'This invoice is cancelled and takes no payments',
        );
      }
      const total = Number(locked.total_amount);
      const alreadyPaid = await this.netPaid(tx, invoiceId);
      const remaining = round2(total - alreadyPaid);
      if (remaining <= EPSILON) {
        throw new BadRequestException('This invoice is already fully paid');
      }
      if (amount > remaining + EPSILON) {
        throw new BadRequestException(
          `Payment amount (${amount}) exceeds remaining balance (${remaining})`,
        );
      }

      await tx.invoice_payments.create({
        data: {
          invoice_id: invoiceId,
          kind: 'payment',
          amount,
          payment_method: dto.payment_method,
          notes: dto.notes,
          created_by: dto.created_by ? BigInt(dto.created_by) : null,
        },
      });
      return this.writeTotals(tx, invoiceId, total, alreadyPaid + amount);
    });
  }

  /**
   * Money returned to the patient. A refund is its own row (kind = refund)
   * with a reason: the original payment stays as it was. It can never exceed
   * what was actually received, net of earlier refunds.
   */
  async refund(invoiceId: bigint, dto: RefundDto, actorId: bigint) {
    const amount = round2(dto.amount);
    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockInvoice(tx, invoiceId);
      if (locked.status === 'cancelled') {
        throw new ConflictException(
          'This invoice is cancelled; nothing to refund',
        );
      }
      const total = Number(locked.total_amount);
      const received = await this.netPaid(tx, invoiceId);
      if (received <= EPSILON) {
        throw new BadRequestException('Nothing has been paid on this invoice');
      }
      if (amount > received + EPSILON) {
        throw new BadRequestException(
          `Refund (${amount}) exceeds what was received on this invoice (${round2(received)})`,
        );
      }
      await tx.invoice_payments.create({
        data: {
          invoice_id: invoiceId,
          kind: 'refund',
          amount,
          payment_method: dto.payment_method,
          reason: dto.reason.trim(),
          created_by: actorId,
        },
      });
      return this.writeTotals(tx, invoiceId, total, received - amount);
    });
    await this.audit.record({
      actorId,
      action: 'billing.invoice.refund',
      table: 'treatment_invoices',
      recordId: invoiceId,
      after: { amount, payment_method: dto.payment_method, reason: dto.reason },
    });
    return updated;
  }

  /**
   * An invoice that is not owed after all. The row stays, marked cancelled
   * with who, when and why; reports stop counting it as outstanding. Money
   * must be settled first (refund what was received), so a void never hides
   * cash. Chart records it billed are released so the work can be billed
   * again correctly.
   */
  async voidInvoice(invoiceId: bigint, dto: VoidInvoiceDto, actorId: bigint) {
    const before = await this.findOne(invoiceId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockInvoice(tx, invoiceId);
      if (locked.status === 'cancelled') {
        throw new ConflictException('This invoice is already cancelled');
      }
      const received = await this.netPaid(tx, invoiceId);
      if (received > EPSILON) {
        throw new ConflictException(
          `Refund the ${round2(received)} received on this invoice before cancelling it`,
        );
      }
      await tx.patient_records.updateMany({
        where: { invoice_id: invoiceId },
        data: { invoice_id: null, updated_at: new Date() },
      });
      return tx.treatment_invoices.update({
        where: { id: invoiceId },
        data: {
          status: 'cancelled',
          cancelled_at: new Date(),
          cancelled_by: actorId,
          cancel_reason: dto.reason.trim(),
          updated_at: new Date(),
        },
        include: invoiceInclude,
      });
    });
    await this.audit.record({
      actorId,
      action: 'billing.invoice.void',
      table: 'treatment_invoices',
      recordId: invoiceId,
      before: {
        status: before.status,
        total_amount: before.total_amount,
        patient_id: before.patient_id,
      },
      after: { status: 'cancelled', reason: dto.reason },
    });
    return updated;
  }

  /**
   * Removes an invoice outright. Only for mistakes with no money on them: an
   * invoice with any payment or refund row is refused (void it instead). The
   * route demands the admin's password; what was deleted goes to the audit log.
   */
  async deleteInvoice(id: bigint, actorId: bigint) {
    const invoice = await this.findOne(id);
    await this.prisma.$transaction(async (tx) => {
      // Locked, and the payments re-counted under the lock: a payment posted
      // between the read and the delete must not be cascaded away.
      await this.lockInvoice(tx, id);
      const rows = await tx.invoice_payments.count({
        where: { invoice_id: id },
      });
      if (rows > 0) {
        throw new ConflictException(
          'This invoice has payment or refund records and cannot be deleted: cancel it instead so the money stays on the books',
        );
      }
      await tx.treatment_invoices.delete({ where: { id } });
    });
    await this.audit.record({
      actorId,
      action: 'billing.invoice.delete',
      table: 'treatment_invoices',
      recordId: id,
      before: {
        patient_id: invoice.patient_id,
        total_amount: invoice.total_amount,
        status: invoice.status,
        line_items: invoice.line_items,
      },
    });
    return { success: true };
  }

  /**
   * Removes one payment or refund row, for a wrongly entered amount. The
   * invoice totals follow by trigger; the database refuses a result that
   * would leave the invoice over-refunded. Never on a cancelled invoice: a
   * void means "nothing is held here", and removing a refund row would make
   * that false. Admin plus password at the route.
   */
  async deletePayment(paymentId: bigint, actorId: bigint) {
    const payment = await this.prisma.invoice_payments.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockInvoice(tx, payment.invoice_id);
      if (locked.status === 'cancelled') {
        throw new ConflictException(
          'This invoice is cancelled; its payment history stays as it is',
        );
      }
      try {
        await tx.invoice_payments.delete({ where: { id: paymentId } });
      } catch (err) {
        // The totals check refuses a delete that would leave the invoice over-refunded.
        if (/paid_within_total/.test((err as Error).message)) {
          throw new ConflictException(
            'This payment cannot be removed while refunds depend on it: remove the refund rows first',
          );
        }
        throw err;
      }
    });
    await this.audit.record({
      actorId,
      action: `billing.${payment.kind}.delete`,
      table: 'invoice_payments',
      recordId: paymentId,
      before: payment,
    });
    return this.findOne(payment.invoice_id);
  }

  /** The invoice row, locked for the rest of the transaction. */
  private async lockInvoice(tx: Tx, invoiceId: bigint) {
    const [locked] = await tx.$queryRaw<
      { id: bigint; total_amount: unknown; status: string }[]
    >`SELECT id, total_amount, status FROM treatment_invoices WHERE id = ${invoiceId} FOR UPDATE`;
    if (!locked) throw new NotFoundException('Treatment invoice not found');
    return locked;
  }

  /** payments - refunds recorded on the invoice, from the payments table. */
  private async netPaid(tx: Tx, invoiceId: bigint): Promise<number> {
    const [row] = await tx.$queryRaw<{ net: unknown }[]>`
      SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END), 0) AS net
        FROM invoice_payments WHERE invoice_id = ${invoiceId}`;
    return Number(row?.net ?? 0);
  }

  /** Store the totals the payments imply (the trigger does the same; this keeps the response exact). */
  private writeTotals(tx: Tx, invoiceId: bigint, total: number, paid: number) {
    const net = round2(paid);
    return tx.treatment_invoices.update({
      where: { id: invoiceId },
      data: {
        amount_paid: net,
        remaining_amount: round2(total - net),
        status: deriveInvoiceStatus(total, net),
        updated_at: new Date(),
      },
      include: invoiceInclude,
    });
  }

  /** Payments and refunds matching `where`, split by kind. */
  private async moneyMoved(
    where: Record<string, unknown>,
  ): Promise<MoneyMoved> {
    const rows = await this.prisma.invoice_payments.groupBy({
      by: ['kind'],
      where,
      _sum: { amount: true },
      _count: { id: true },
    });
    const of = (kind: string) => rows.find((r) => r.kind === kind);
    const payments = Number(of('payment')?._sum.amount ?? 0);
    const refunds = Number(of('refund')?._sum.amount ?? 0);
    return {
      payments,
      refunds,
      net: round2(payments - refunds),
      payment_count: Number(of('payment')?._count.id ?? 0),
      refund_count: Number(of('refund')?._count.id ?? 0),
    };
  }

  // ── Financial summary ────────────────────────────────────────────────────
  async getSummary(filters: { from?: string; to?: string } = {}) {
    const { from, to } = filters;

    const buildRange = () => {
      if (!from && !to) return undefined;
      return {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      };
    };

    const range = buildRange();
    const paymentWhere: any = range ? { created_at: range } : {};
    const expenseWhere: any = range ? { expense_date: range } : {};

    const [money, expenseAgg, outstandingAgg] = await Promise.all([
      // Actual money kept = payments - refunds in the period
      this.moneyMoved(paymentWhere),
      this.prisma.expenses.aggregate({
        where: expenseWhere,
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Outstanding = remaining on all open/partial invoices (always all-time; cancelled never counts)
      this.prisma.treatment_invoices.aggregate({
        where: { status: { in: ['open', 'partial'] } },
        _sum: { remaining_amount: true },
      }),
    ]);

    const totalIncome = money.net;
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
    const totalOutstanding = Number(outstandingAgg._sum.remaining_amount ?? 0);

    return {
      total_income: totalIncome,
      total_refunded: money.refunds,
      total_expenses: totalExpenses,
      net: totalIncome - totalExpenses,
      total_outstanding: totalOutstanding,
      payments_count: money.payment_count,
      refunds_count: money.refund_count,
      expenses_count: Number(expenseAgg._count.id ?? 0),
      ...(from || to ? { period: { from: from ?? null, to: to ?? null } } : {}),
    };
  }

  // ── KPI overview ─────────────────────────────────────────────────────────
  async getKpis() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    const [
      liveInvoices,
      allTime,
      allExpenses,
      thisMonth,
      lastMonth,
      thisMonthExpenses,
      lastMonthExpenses,
    ] = await Promise.all([
      // Live invoices only: a cancelled invoice was never really billed
      this.prisma.treatment_invoices.findMany({
        where: { status: { in: [...LIVE_STATUSES] } },
        select: {
          total_amount: true,
          amount_paid: true,
          remaining_amount: true,
          status: true,
        },
      }),
      this.moneyMoved({}),
      this.prisma.expenses.findMany({ select: { amount: true } }),
      this.moneyMoved({ created_at: { gte: startOfMonth } }),
      this.moneyMoved({
        created_at: { gte: startOfLastMonth, lte: endOfLastMonth },
      }),
      this.prisma.expenses.findMany({
        where: { expense_date: { gte: startOfMonth } },
        select: { amount: true },
      }),
      this.prisma.expenses.findMany({
        where: { expense_date: { gte: startOfLastMonth, lte: endOfLastMonth } },
        select: { amount: true },
      }),
    ]);

    const sumAmt = (rows: { amount: any }[]) =>
      rows.reduce((s, r) => s + Number(r.amount), 0);

    const totalBilled = liveInvoices.reduce(
      (s, i) => s + Number(i.total_amount),
      0,
    );
    const totalCollected = allTime.net;
    const totalOutstanding = liveInvoices
      .filter((i) => i.status === 'open' || i.status === 'partial')
      .reduce((s, i) => s + Number(i.remaining_amount), 0);
    const totalExpenses = sumAmt(allExpenses);
    const collectionRate =
      totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;
    const avgInvoice =
      liveInvoices.length > 0 ? totalBilled / liveInvoices.length : 0;

    const thisMonthIncome = thisMonth.net;
    const lastMonthIncome = lastMonth.net;
    const thisMonthExp = sumAmt(thisMonthExpenses);
    const lastMonthExp = sumAmt(lastMonthExpenses);

    const growth = (cur: number, prev: number) =>
      prev === 0 ? null : Math.round(((cur - prev) / prev) * 100 * 10) / 10;

    return {
      all_time: {
        total_billed: totalBilled,
        total_collected: totalCollected,
        total_refunded: allTime.refunds,
        total_outstanding: totalOutstanding,
        total_expenses: totalExpenses,
        net_profit: totalCollected - totalExpenses,
        collection_rate_pct: Math.round(collectionRate * 10) / 10,
        average_invoice: Math.round(avgInvoice * 100) / 100,
        total_invoices: liveInvoices.length,
      },
      this_month: {
        income: thisMonthIncome,
        refunds: thisMonth.refunds,
        expenses: thisMonthExp,
        net: thisMonthIncome - thisMonthExp,
        payments: thisMonth.payment_count,
      },
      last_month: {
        income: lastMonthIncome,
        refunds: lastMonth.refunds,
        expenses: lastMonthExp,
        net: lastMonthIncome - lastMonthExp,
        payments: lastMonth.payment_count,
      },
      growth: {
        income_pct: growth(thisMonthIncome, lastMonthIncome),
        expenses_pct: growth(thisMonthExp, lastMonthExp),
        net_pct: growth(
          thisMonthIncome - thisMonthExp,
          lastMonthIncome - lastMonthExp,
        ),
      },
    };
  }

  // ── Outstanding invoices ────────────────────────────────────────────────
  async getOutstandingPayments() {
    const invoices = await this.prisma.treatment_invoices.findMany({
      where: { status: { in: ['open', 'partial'] } },
      include: {
        patient: {
          select: {
            id: true,
            users: { select: { first_name: true, last_name: true } },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return invoices.map((inv) => ({
      id: Number(inv.id),
      patient_id: Number(inv.patient_id),
      patient_name: inv.patient?.users
        ? `${inv.patient.users.first_name} ${inv.patient.users.last_name}`
        : `Patient #${inv.patient_id}`,
      total_amount: Number(inv.total_amount),
      amount_paid: Number(inv.amount_paid),
      remaining: Number(inv.remaining_amount),
      status: inv.status,
      created_at: inv.created_at,
    }));
  }

  // ── A/R aging report ────────────────────────────────────────────────────
  async getAgingReport() {
    const invoices = await this.prisma.treatment_invoices.findMany({
      where: { status: { in: ['open', 'partial'] } },
      select: { id: true, remaining_amount: true, created_at: true },
    });

    const now = new Date();
    const buckets = {
      '0_30_days': 0,
      '31_60_days': 0,
      '61_90_days': 0,
      '90_plus_days': 0,
    };
    const counts = {
      '0_30_days': 0,
      '31_60_days': 0,
      '61_90_days': 0,
      '90_plus_days': 0,
    };

    for (const inv of invoices) {
      const days = Math.floor(
        (now.getTime() - new Date(inv.created_at).getTime()) / 86_400_000,
      );
      const amount = Number(inv.remaining_amount);
      const key =
        days <= 30
          ? '0_30_days'
          : days <= 60
            ? '31_60_days'
            : days <= 90
              ? '61_90_days'
              : '90_plus_days';
      buckets[key] += amount;
      counts[key]++;
    }

    return {
      buckets,
      invoice_counts: counts,
      total_outstanding: Object.values(buckets).reduce((s, v) => s + v, 0),
    };
  }

  // ── Per-patient financial summary ───────────────────────────────────────
  async getPatientFinancials(patient_id?: number) {
    const where: any = { status: { in: [...LIVE_STATUSES] } };
    if (patient_id) where.patient_id = BigInt(patient_id);

    const invoices = await this.prisma.treatment_invoices.findMany({
      where,
      select: {
        patient_id: true,
        total_amount: true,
        amount_paid: true,
        remaining_amount: true,
        patient: {
          select: { users: { select: { first_name: true, last_name: true } } },
        },
      },
    });

    const byPatient: Record<
      string,
      {
        patient_id: string;
        patient_name: string;
        total_billed: number;
        total_paid: number;
        outstanding: number;
        invoice_count: number;
      }
    > = {};

    for (const inv of invoices) {
      const pid = String(inv.patient_id);
      if (!byPatient[pid]) {
        byPatient[pid] = {
          patient_id: pid,
          patient_name: inv.patient?.users
            ? `${inv.patient.users.first_name} ${inv.patient.users.last_name}`
            : `Patient #${pid}`,
          total_billed: 0,
          total_paid: 0,
          outstanding: 0,
          invoice_count: 0,
        };
      }
      byPatient[pid].total_billed += Number(inv.total_amount);
      byPatient[pid].total_paid += Number(inv.amount_paid);
      byPatient[pid].outstanding += Number(inv.remaining_amount);
      byPatient[pid].invoice_count++;
    }

    return Object.values(byPatient).map((p) => ({
      ...p,
      collection_rate_pct:
        p.total_billed > 0
          ? Math.round((p.total_paid / p.total_billed) * 1000) / 10
          : 0,
    }));
  }

  // ── Monthly trends + payment method breakdown ────────────────────────────
  async getPaymentsAnalytics(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const [rows, expenses] = await Promise.all([
      this.prisma.invoice_payments.findMany({
        where: { created_at: { gte: since } },
        select: {
          amount: true,
          kind: true,
          payment_method: true,
          created_at: true,
        },
      }),
      this.prisma.expenses.findMany({
        where: { expense_date: { gte: since } },
        select: { amount: true, expense_date: true },
      }),
    ]);

    // A refund is money going back out: it reduces the month and the method it came from.
    const signed = (r: { amount: unknown; kind: string }) =>
      r.kind === 'refund' ? -Number(r.amount) : Number(r.amount);

    const monthly: Record<
      string,
      { income: number; refunds: number; expenses: number }
    > = {};
    const bucket = (key: string) =>
      (monthly[key] ??= { income: 0, refunds: 0, expenses: 0 });

    for (const p of rows) {
      const b = bucket(p.created_at.toISOString().slice(0, 7));
      b.income += signed(p);
      if (p.kind === 'refund') b.refunds += Number(p.amount);
    }
    for (const e of expenses) {
      bucket(e.expense_date.toISOString().slice(0, 7)).expenses += Number(
        e.amount,
      );
    }

    const methods: Record<string, number> = {};
    for (const p of rows) {
      const m = p.payment_method ?? 'unknown';
      methods[m] = (methods[m] ?? 0) + signed(p);
    }

    return {
      monthly_trends: Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          ...data,
          net: data.income - data.expenses,
        })),
      payment_methods: methods,
      total_payments: rows.filter((r) => r.kind === 'payment').length,
      total_refunds: rows.filter((r) => r.kind === 'refund').length,
    };
  }

  // ── Raw invoice payments list for charts ─────────────────────────────────
  async listInvoicePayments(limit = 500) {
    return this.prisma.invoice_payments.findMany({
      take: limit,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        kind: true,
        amount: true,
        payment_method: true,
        reason: true,
        created_at: true,
        invoice_id: true,
      },
    });
  }
}
