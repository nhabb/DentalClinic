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
import { dateRange, toDateOnly } from '../../shared/common/date-only';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RefundDto } from './dto/refund.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import {
  daysOverdue,
  dueDateFor,
  EPSILON,
  invoiceFigures,
  isNotYetDue,
  LIVE_STATUSES,
  paymentDateFor,
  round2,
} from './invoice-math';
import {
  BILLED_INVOICES,
  figuresFromRows,
  moneyMoved,
  moneyMovedByMethod,
  moneyMovedFromRows,
  OWED_INVOICES,
  type MoneyMoved,
} from './money-figures';
import { invoiceInclude, withAppliedPayments } from './invoice-shape';
import { MoneyService } from './money.service';
import { PLAN_RECORD_TYPES } from '../quotes/plan-record-types';

export { deriveInvoiceStatus, LIVE_STATUSES } from './invoice-math';
export type { InvoiceStatus } from './invoice-math';

// The invoice shape lives in invoice-shape.ts so the money writer can return
// an invoice without importing this service. Re-exported here because the
// quotes module has always imported it from billing.service.
export { invoiceInclude, withAppliedPayments } from './invoice-shape';
export type { AppliedPayment } from './invoice-shape';

// `MoneyMoved` and the payments-minus-refunds rule moved to money-figures.ts,
// which is now the one place any money figure is defined. Re-exported because
// the type was public from here.
export type { MoneyFigures, MoneyMoved } from './money-figures';

/**
 * Outstanding balances by how far past due they are. "Not yet due" is current
 * (a balance due today is not late); the others count whole days overdue.
 */
export const AGING_BUCKETS = [
  'not_yet_due',
  '0_30_days',
  '31_60_days',
  '61_90_days',
  '90_plus_days',
] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function agingBucketFor(overdueDays: number, notYetDue: boolean) {
  if (notYetDue || overdueDays === 0) return 'not_yet_due';
  if (overdueDays <= 30) return '0_30_days';
  if (overdueDays <= 60) return '31_60_days';
  if (overdueDays <= 90) return '61_90_days';
  return '90_plus_days';
}

/** First day of this month and of last month, and last month's end, as calendar dates (UTC). */
function monthWindows(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    startOfMonth: new Date(Date.UTC(y, m, 1)),
    startOfLastMonth: new Date(Date.UTC(y, m - 1, 1)),
    endOfLastMonth: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
  };
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly money: MoneyService,
  ) {}

  /**
   * An invoice from the billing page, the one place a bill is created. The
   * number comes from the database (sequential per clinic), the figures from
   * invoice-math, the creator from the signed-in user, never from the request
   * body. A line may name a completed, unbilled chart record (record_id);
   * those records are attached to the invoice in the same transaction so the
   * work can never be billed twice.
   */
  async create(dto: CreateInvoiceDto, actorId: bigint) {
    const patientId = BigInt(dto.patient_id);
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Patient profile not found');

    const recordIds = dto.line_items
      .filter((i) => i.record_id != null)
      .map((i) => BigInt(i.record_id as number));
    if (new Set(recordIds.map(String)).size !== recordIds.length) {
      throw new BadRequestException(
        'The same chart record cannot be billed on two lines',
      );
    }
    if (recordIds.length > 0) {
      // Planned work bills as readily as completed work: a patient paying for
      // a crown up front is the ordinary case, and the plan is the only place
      // either kind lives. What may not be billed is work already on a bill.
      const billable = await this.prisma.patient_records.count({
        where: {
          id: { in: recordIds },
          patient_id: patientId,
          record_type: { in: [...PLAN_RECORD_TYPES] },
          invoice_id: null,
        },
      });
      if (billable !== recordIds.length) {
        throw new BadRequestException(
          "Every record_id must be this patient's treatment work that is not on an invoice yet",
        );
      }
    }

    const procedureDate = toDateOnly(dto.procedure_date);
    const figures = invoiceFigures(
      dto.line_items.map((i) => i.amount),
      dto.discount_amount ?? 0,
      dto.discount_reason,
    );

    const data = {
      // Omitted = database default (home branch, then the organization's default branch).
      ...(dto.branch_id ? { branch_id: BigInt(dto.branch_id) } : {}),
      patient_id: profile.id,
      procedure_date: procedureDate,
      due_date: dueDateFor(procedureDate, dto.due_date),
      notes: dto.notes?.trim() || null,
      ...figures,
      created_by: actorId,
      line_items: {
        create: dto.line_items.map((item) => ({
          procedure_name: item.procedure_name,
          amount: round2(item.amount),
          tooth_number: item.tooth_number ?? null,
        })),
      },
    };

    if (recordIds.length === 0) {
      return withAppliedPayments(
        await this.prisma.treatment_invoices.create({
          data,
          include: invoiceInclude,
        }),
      );
    }

    // Interactive transaction on purpose: the array form is started from a
    // shared tick and can run under another request's tenant (see tenant-pool.ts).
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.treatment_invoices.create({
        data,
        include: invoiceInclude,
      });
      // Attach only records that are still this patient's unbilled work:
      // work billed at the same moment from another desk wins the row, and
      // this transaction rolls back instead of billing it twice (the
      // database refuses to move a billed record too). This claim and the
      // check above must stay in step on both filters — patient and record
      // type — or the count would pass on rows the check never approved.
      const attached = await tx.patient_records.updateMany({
        where: {
          id: { in: recordIds },
          invoice_id: null,
          patient_id: patientId,
          record_type: { in: [...PLAN_RECORD_TYPES] },
        },
        data: { invoice_id: invoice.id, updated_at: new Date() },
      });
      if (attached.count !== recordIds.length) {
        throw new ConflictException(
          'Some of this work was billed a moment ago from another desk; refresh and try again',
        );
      }
      return withAppliedPayments(invoice);
    }, REMOTE_TX_OPTIONS);
  }

  /**
   * What the billing page can bill for one patient: their plan work that is
   * not on an invoice yet, planned and completed alike.
   *
   * There is one list and one price. The chart is where work is planned and
   * priced, so its figure is the figure; there is no second store to reconcile
   * and no grouping by document, because a patient has one plan. Each row says
   * where it stands so the desk can see what it is charging for.
   */
  async listBillable(patientId: bigint) {
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Patient profile not found');

    const rows = await this.prisma.patient_records.findMany({
      where: {
        patient_id: patientId,
        record_type: { in: [...PLAN_RECORD_TYPES] },
        invoice_id: null,
      },
      select: {
        id: true,
        title: true,
        tooth_number: true,
        treatment_date: true,
        quoted_amount: true,
        record_type: true,
      },
      orderBy: [{ treatment_date: 'asc' }, { id: 'asc' }],
    });

    const plan_unbilled = rows.map((r) => ({
      id: r.id,
      title: r.title,
      tooth_number: r.tooth_number,
      treatment_date: r.treatment_date,
      quoted_amount: r.quoted_amount,
      state: r.record_type === 'treatment' ? 'done' : 'planned',
    }));

    return {
      plan_unbilled,
      /** Kept so the builder can still show done work first if it wants to. */
      completed_unbilled: plan_unbilled.filter((r) => r.state === 'done'),
      planned: plan_unbilled.filter((r) => r.state === 'planned'),
    };
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

    const where: Record<string, unknown> = {};
    if (patient_id) where.patient_id = BigInt(patient_id);
    if (branch_id) where.branch_id = BigInt(branch_id);
    if (status) where.status = status;
    const issued = dateRange(from, to);
    if (issued) where.created_at = issued;

    const [data, total] = await Promise.all([
      this.prisma.treatment_invoices
        .findMany({
          where,
          include: invoiceInclude,
          skip,
          take: limit,
          orderBy: { created_at: 'desc' },
        })
        .then((rows) => rows.map(withAppliedPayments)),
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
    return withAppliedPayments(invoice);
  }

  // ── Money in, money back, corrections ─────────────────────────────────────

  /**
   * Money received against one named invoice. The desk named the bill, so the
   * payment and its allocation are written in one step — but by the same
   * writer every other money route uses, so the rules cannot drift apart.
   *
   * The invoice row is locked first and its `remaining_amount` is what the
   * balance checks read: the allocation trigger keeps that column, and the
   * lock is what makes it true for the length of the transaction. Two desks
   * posting at the same moment therefore queue on the row instead of both
   * passing their checks.
   */
  async recordPayment(
    invoiceId: bigint,
    dto: RecordPaymentDto,
    actorId: bigint,
  ) {
    const amount = round2(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }
    const paymentDate = paymentDateFor(dto.payment_date);

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.money.lockInvoice(tx, invoiceId);
      if (locked.status === 'cancelled') {
        throw new ConflictException(
          'This invoice is cancelled and takes no payments',
        );
      }
      const remaining = round2(locked.remaining_amount);
      if (remaining <= EPSILON) {
        throw new BadRequestException('This invoice is already fully paid');
      }
      if (amount > remaining + EPSILON) {
        throw new BadRequestException(
          `Payment amount (${amount}) exceeds remaining balance (${remaining})`,
        );
      }

      const payment = await this.money.createPaymentRow(tx, {
        patientId: locked.patient_id,
        kind: 'payment',
        amount,
        paymentMethod: dto.payment_method,
        paymentDate,
        notes: dto.notes?.trim() || null,
        actorId,
      });
      await this.money.allocate(tx, {
        paymentId: payment.id,
        invoiceId,
        amount,
        actorId,
      });
      return this.money.reloadInvoice(tx, invoiceId);
    }, REMOTE_TX_OPTIONS);
  }

  /**
   * Money returned to the patient. A refund is its own row (kind = refund)
   * with a reason: the original payment stays as it was. It can never exceed
   * what was actually received, net of earlier refunds.
   */
  async refund(invoiceId: bigint, dto: RefundDto, actorId: bigint) {
    const amount = round2(dto.amount);
    const paymentDate = paymentDateFor(dto.payment_date);
    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.money.lockInvoice(tx, invoiceId);
      if (locked.status === 'cancelled') {
        throw new ConflictException(
          'This invoice is cancelled; nothing to refund',
        );
      }
      const received = locked.amount_paid;
      if (received <= EPSILON) {
        throw new BadRequestException('Nothing has been paid on this invoice');
      }
      if (amount > received + EPSILON) {
        throw new BadRequestException(
          `Refund (${amount}) exceeds what was received on this invoice (${round2(received)})`,
        );
      }
      const refundRow = await this.money.createPaymentRow(tx, {
        patientId: locked.patient_id,
        kind: 'refund',
        // Money off a named bill: the allocation below is what lowers it.
        refundScope: 'invoice',
        amount,
        paymentMethod: dto.payment_method,
        paymentDate,
        reason: dto.reason.trim(),
        actorId,
      });
      // A refund allocation subtracts from the invoice it is applied to.
      await this.money.allocate(tx, {
        paymentId: refundRow.id,
        invoiceId,
        amount,
        actorId,
      });
      return this.money.reloadInvoice(tx, invoiceId);
    }, REMOTE_TX_OPTIONS);
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
    const updated = await this.prisma
      .$transaction(async (tx) => {
        const locked = await this.money.lockInvoice(tx, invoiceId);
        if (locked.status === 'cancelled') {
          throw new ConflictException('This invoice is already cancelled');
        }
        const received = locked.amount_paid;
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
      }, REMOTE_TX_OPTIONS)
      .then(withAppliedPayments);
    await this.audit.record({
      actorId,
      action: 'billing.invoice.void',
      table: 'treatment_invoices',
      recordId: invoiceId,
      before: {
        invoice_number: before.invoice_number,
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
   * The number it held is not reused: a gap in the sequence is the honest
   * trace of a deletion.
   */
  async deleteInvoice(id: bigint, actorId: bigint) {
    const invoice = await this.findOne(id);
    await this.prisma.$transaction(async (tx) => {
      // Locked, and the payments re-counted under the lock: a payment posted
      // between the read and the delete must not be cascaded away.
      await this.money.lockInvoice(tx, id);
      const rows = await tx.payment_allocations.count({
        where: { invoice_id: id },
      });
      if (rows > 0) {
        throw new ConflictException(
          'This invoice has payment or refund records and cannot be deleted: cancel it instead so the money stays on the books',
        );
      }
      await tx.treatment_invoices.delete({ where: { id } });
    }, REMOTE_TX_OPTIONS);
    await this.audit.record({
      actorId,
      action: 'billing.invoice.delete',
      table: 'treatment_invoices',
      recordId: id,
      before: {
        invoice_number: invoice.invoice_number,
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
      include: { allocations: { select: { invoice_id: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    // One payment can be spread over several invoices. Lock each one it
    // touches, in id order, so two deletions cannot deadlock against each other.
    const touched = [
      ...new Set(payment.allocations.map((a) => a.invoice_id)),
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    await this.prisma.$transaction(async (tx) => {
      for (const invoiceId of touched) {
        const locked = await this.money.lockInvoice(tx, invoiceId);
        if (locked.status === 'cancelled') {
          throw new ConflictException(
            'This invoice is cancelled; its payment history stays as it is',
          );
        }
      }
      // The allocations cascade with the payment; the totals follow by trigger.
      // The totals check refuses a delete that would leave the invoice
      // over-refunded, which here means a refund still depends on this money.
      await this.money.removePayment(tx, paymentId, {
        paid_within_total:
          'This payment cannot be removed while refunds depend on it: remove the refund rows first',
      });
    }, REMOTE_TX_OPTIONS);
    await this.audit.record({
      actorId,
      action: `billing.${payment.kind}.delete`,
      table: 'invoice_payments',
      recordId: paymentId,
      before: payment,
    });
    // Unapplied credit sat on no invoice; then there is nothing to show back.
    return touched.length ? this.findOne(touched[0]) : { success: true };
  }

  // ── Financial summary ────────────────────────────────────────────────────
  // Money is reported on the day it moved (payment_date), expenses on their
  // expense_date, so a late entry lands in the right period.
  async getSummary(filters: { from?: string; to?: string } = {}) {
    const { from, to } = filters;
    const range = dateRange(from, to);
    const paymentWhere = range ? { payment_date: range } : {};
    const expenseWhere = range ? { expense_date: range } : {};

    const [money, byMethod, expenseAgg, outstandingAgg] = await Promise.all([
      // Actual money kept = payments - refunds in the period
      moneyMoved(this.prisma, paymentWhere),
      moneyMovedByMethod(this.prisma, paymentWhere),
      this.prisma.expenses.aggregate({
        where: expenseWhere,
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Outstanding is always all-time, whatever window the money is read in:
      // what is owed today is not a property of a date range.
      this.prisma.treatment_invoices.aggregate({
        where: OWED_INVOICES,
        _sum: { remaining_amount: true },
      }),
    ]);

    const totalIncome = money.net;
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
    const totalOutstanding = round2(
      Number(outstandingAgg._sum.remaining_amount ?? 0),
    );

    return {
      total_income: totalIncome,
      /** The same money split by how it arrived, for counting the drawer. */
      by_method: byMethod,
      total_refunded: money.refunds,
      refunds_on_invoices: money.refunds_on_invoices,
      refunds_of_credit: money.refunds_of_credit,
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
    const { startOfMonth, startOfLastMonth, endOfLastMonth } = monthWindows();

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
          discount_amount: true,
          amount_paid: true,
          remaining_amount: true,
          status: true,
          due_date: true,
        },
      }),
      moneyMoved(this.prisma, {}),
      this.prisma.expenses.findMany({ select: { amount: true } }),
      moneyMoved(this.prisma, { payment_date: { gte: startOfMonth } }),
      moneyMoved(this.prisma, {
        payment_date: { gte: startOfLastMonth, lte: endOfLastMonth },
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

    const sumAmt = (rows: { amount: unknown }[]) =>
      rows.reduce((s, r) => s + Number(r.amount), 0);

    // The rows are already loaded, so the figures come from the shared
    // definitions rather than being summed again here.
    const figures = figuresFromRows(liveInvoices, allTime);
    const totalBilled = figures.billed;
    const totalCollected = figures.received;
    const totalOutstanding = figures.due_now;
    const totalOverdue = figures.overdue;
    const totalDiscounts = liveInvoices.reduce(
      (s, i) => s + Number(i.discount_amount),
      0,
    );
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
        total_discounts: round2(totalDiscounts),
        total_collected: totalCollected,
        /**
         * Of what came in, how much reached a bill — and how much has not.
         * Reported because `billed - collected` is NOT `outstanding` whenever
         * a patient is holding credit, and a screen showing those three
         * figures side by side owes the reader the fourth.
         */
        total_applied: figures.applied,
        total_credit_held: figures.credit_held,
        total_refunded: allTime.refunds,
        total_outstanding: totalOutstanding,
        total_overdue: totalOverdue,
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
  /** Every balance still owed, the longest overdue first. */
  async getOutstandingPayments() {
    const invoices = await this.prisma.treatment_invoices.findMany({
      where: OWED_INVOICES,
      include: {
        patient: {
          select: {
            id: true,
            users: { select: { first_name: true, last_name: true } },
          },
        },
      },
      orderBy: [{ due_date: 'asc' }, { created_at: 'asc' }],
    });

    return invoices.map((inv) => ({
      id: Number(inv.id),
      invoice_number: inv.invoice_number,
      patient_id: Number(inv.patient_id),
      patient_name: inv.patient?.users
        ? `${inv.patient.users.first_name} ${inv.patient.users.last_name}`
        : `Patient #${inv.patient_id}`,
      total_amount: Number(inv.total_amount),
      amount_paid: Number(inv.amount_paid),
      remaining: Number(inv.remaining_amount),
      status: inv.status,
      due_date: inv.due_date,
      days_overdue: daysOverdue(inv.due_date),
      created_at: inv.created_at,
    }));
  }

  // ── A/R aging report ────────────────────────────────────────────────────
  /** Outstanding balances by days past their due date (not days since issue). */
  async getAgingReport() {
    const invoices = await this.prisma.treatment_invoices.findMany({
      where: OWED_INVOICES,
      select: { id: true, remaining_amount: true, due_date: true },
    });

    const now = new Date();
    const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0]));
    const counts = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0]));

    for (const inv of invoices) {
      // Both questions are asked of the clinic's calendar, from one module.
      const overdue = daysOverdue(inv.due_date, now);
      const key = agingBucketFor(overdue, isNotYetDue(inv.due_date, now));
      buckets[key] += Number(inv.remaining_amount);
      counts[key]++;
    }

    return {
      buckets,
      invoice_counts: counts,
      total_outstanding: Object.values(buckets).reduce((s, v) => s + v, 0),
      total_overdue: Object.entries(buckets)
        .filter(([k]) => k !== 'not_yet_due')
        .reduce((s, [, v]) => s + v, 0),
    };
  }

  // ── Per-patient financial summary ───────────────────────────────────────
  /**
   * What each patient was billed, what came in and what is left.
   *
   * It used to report one figure called `total_paid` that was the sum of the
   * invoices' `amount_paid` — money that had reached a bill. A patient who had
   * just handed over a deposit therefore read as having paid nothing, because
   * their money was sitting as credit. The three are now reported apart under
   * the names they deserve: `total_applied` is what reached bills,
   * `total_received` is what came in, and `credit_held` is the difference.
   */
  async getPatientFinancials(patient_id?: number) {
    const where: Record<string, unknown> = { ...BILLED_INVOICES };
    if (patient_id) where.patient_id = BigInt(patient_id);
    const paymentWhere = patient_id
      ? { patient_id: BigInt(patient_id) }
      : undefined;

    const [invoices, paymentRows] = await Promise.all([
      this.prisma.treatment_invoices.findMany({
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
      }),
      this.prisma.invoice_payments.groupBy({
        by: ['patient_id', 'kind', 'refund_scope'],
        where: paymentWhere,
        _sum: { amount: true },
        _count: { id: true },
        orderBy: undefined,
      }),
    ]);

    /** Money in, net of refunds, per patient — the same rule as everywhere. */
    const receivedBy = new Map<string, number>();
    for (const pid of new Set(paymentRows.map((r) => String(r.patient_id)))) {
      receivedBy.set(
        pid,
        moneyMovedFromRows(
          paymentRows.filter((r) => String(r.patient_id) === pid),
        ).net,
      );
    }

    const byPatient: Record<
      string,
      {
        patient_id: string;
        patient_name: string;
        total_billed: number;
        /** Of the money received, what reached a bill. */
        total_applied: number;
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
          total_applied: 0,
          outstanding: 0,
          invoice_count: 0,
        };
      }
      byPatient[pid].total_billed += Number(inv.total_amount);
      byPatient[pid].total_applied += Number(inv.amount_paid);
      byPatient[pid].outstanding += Math.max(0, Number(inv.remaining_amount));
      byPatient[pid].invoice_count++;
    }

    // A patient may have money and no bill yet (a deposit on an agreed plan),
    // so they belong in this list even though no invoice named them.
    for (const pid of receivedBy.keys()) {
      byPatient[pid] ??= {
        patient_id: pid,
        patient_name: `Patient #${pid}`,
        total_billed: 0,
        total_applied: 0,
        outstanding: 0,
        invoice_count: 0,
      };
    }

    return Object.values(byPatient).map((p) => {
      const received = round2(receivedBy.get(p.patient_id) ?? 0);
      const applied = round2(p.total_applied);
      return {
        ...p,
        total_billed: round2(p.total_billed),
        total_applied: applied,
        total_received: received,
        credit_held: round2(received - applied),
        outstanding: round2(p.outstanding),
        /** Of what was billed, how much has reached the bills. */
        collection_rate_pct:
          p.total_billed > 0
            ? Math.round((applied / p.total_billed) * 1000) / 10
            : 0,
      };
    });
  }

  // ── Monthly trends + payment method breakdown ────────────────────────────
  async getPaymentsAnalytics(months = 12) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);

    const [rows, expenses] = await Promise.all([
      this.prisma.invoice_payments.findMany({
        where: { payment_date: { gte: since } },
        select: {
          amount: true,
          kind: true,
          payment_method: true,
          payment_date: true,
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
      const b = bucket(p.payment_date.toISOString().slice(0, 7));
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

  // ── Every payment and refund, as the desk reads them ─────────────────────
  /**
   * The clinic’s money as it moved, which is a different question from what
   * its bills say.
   *
   * It used to return bare ids for the analytics charts. A desk counting the
   * till has to read it: who paid, how, which bills it reached, and who took
   * it. Filtered on `payment_date`, the day the money actually moved, which
   * is the day every other report counts it on.
   */
  async listInvoicePayments(
    limit = 500,
    filters: { from?: string; to?: string; method?: string } = {},
  ) {
    const range = dateRange(filters.from, filters.to);
    const rows = await this.prisma.invoice_payments.findMany({
      where: {
        ...(range ? { payment_date: range } : {}),
        ...(filters.method ? { payment_method: filters.method } : {}),
      },
      take: limit,
      orderBy: [{ payment_date: 'desc' }, { created_at: 'desc' }],
      select: {
        id: true,
        kind: true,
        refund_scope: true,
        amount: true,
        payment_method: true,
        payment_date: true,
        notes: true,
        reason: true,
        created_at: true,
        patient_id: true,
        patient: {
          select: {
            id: true,
            users: { select: { first_name: true, last_name: true } },
          },
        },
        creator: { select: { first_name: true, last_name: true } },
        allocations: {
          select: {
            id: true,
            amount: true,
            invoice: { select: { id: true, invoice_number: true } },
          },
        },
      },
    });

    return rows.map((r) => {
      const applied = r.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
      return {
        ...r,
        patient_name: r.patient?.users
          ? `${r.patient.users.first_name} ${r.patient.users.last_name}`
          : `Patient #${r.patient_id}`,
        taken_by: r.creator
          ? `${r.creator.first_name} ${r.creator.last_name}`
          : null,
        applied: round2(applied),
        /** Reached no bill: this much of it is credit on the account. */
        unapplied: round2(Number(r.amount) - applied),
      };
    });
  }
}
