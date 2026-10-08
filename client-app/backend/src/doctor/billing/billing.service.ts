import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

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

type InvoiceStatus = 'open' | 'partial' | 'paid';

/** The status an invoice's payments imply. */
export function deriveInvoiceStatus(
  total: number,
  paid: number,
): InvoiceStatus {
  if (total - paid <= EPSILON) return 'paid';
  if (paid > EPSILON) return 'partial';
  return 'open';
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

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

    const invoice = await this.prisma.treatment_invoices.create({
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

    return invoice;
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

  async deleteInvoice(id: bigint) {
    const invoice = await this.prisma.treatment_invoices.findUnique({
      where: { id },
    });
    if (!invoice) throw new NotFoundException('Treatment invoice not found');
    if (Number(invoice.amount_paid) > 0) {
      throw new ConflictException(
        'This invoice has recorded payments and cannot be deleted: money received must stay on the books',
      );
    }
    await this.prisma.treatment_invoices.delete({ where: { id } });
    return { success: true };
  }

  // ── Financial summary (replaces payments/summary) ────────────────────────
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

    const [incomeAgg, expenseAgg, outstandingAgg] = await Promise.all([
      // Actual money received = sum of all invoice_payments in period
      this.prisma.invoice_payments.aggregate({
        where: paymentWhere,
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.expenses.aggregate({
        where: expenseWhere,
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Outstanding = remaining on all open/partial invoices (always all-time)
      this.prisma.treatment_invoices.aggregate({
        where: { status: { in: ['open', 'partial'] } },
        _sum: { remaining_amount: true },
      }),
    ]);

    const totalIncome = Number(incomeAgg._sum.amount ?? 0);
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
    const totalOutstanding = Number(outstandingAgg._sum.remaining_amount ?? 0);

    return {
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net: totalIncome - totalExpenses,
      total_outstanding: totalOutstanding,
      payments_count: Number(incomeAgg._count.id),
      expenses_count: Number(expenseAgg._count.id ?? 0),
      ...(from || to ? { period: { from: from ?? null, to: to ?? null } } : {}),
    };
  }

  // ── KPI overview (replaces payments/kpis) ────────────────────────────────
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
      allInvoices,
      allInvoicePayments,
      allExpenses,
      thisMonthPaymentsAgg,
      lastMonthPaymentsAgg,
      thisMonthExpenses,
      lastMonthExpenses,
    ] = await Promise.all([
      // All invoices — for billed / outstanding totals
      this.prisma.treatment_invoices.findMany({
        select: {
          total_amount: true,
          amount_paid: true,
          remaining_amount: true,
          status: true,
        },
      }),
      // All invoice_payments — for total collected
      this.prisma.invoice_payments.aggregate({
        _sum: { amount: true },
        _count: { id: true },
      }),
      // All expenses
      this.prisma.expenses.findMany({ select: { amount: true } }),
      // This month payments received
      this.prisma.invoice_payments.aggregate({
        where: { created_at: { gte: startOfMonth } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Last month payments received
      this.prisma.invoice_payments.aggregate({
        where: { created_at: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { amount: true },
        _count: { id: true },
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

    const totalBilled = allInvoices.reduce(
      (s, i) => s + Number(i.total_amount),
      0,
    );
    const totalCollected = Number(allInvoicePayments._sum.amount ?? 0);
    const totalOutstanding = allInvoices
      .filter((i) => i.status === 'open' || i.status === 'partial')
      .reduce((s, i) => s + Number(i.remaining_amount), 0);
    const totalExpenses = sumAmt(allExpenses);
    const collectionRate =
      totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;
    const avgInvoice =
      allInvoices.length > 0 ? totalBilled / allInvoices.length : 0;

    const thisMonthIncome = Number(thisMonthPaymentsAgg._sum.amount ?? 0);
    const lastMonthIncome = Number(lastMonthPaymentsAgg._sum.amount ?? 0);
    const thisMonthExp = sumAmt(thisMonthExpenses);
    const lastMonthExp = sumAmt(lastMonthExpenses);

    const growth = (cur: number, prev: number) =>
      prev === 0 ? null : Math.round(((cur - prev) / prev) * 100 * 10) / 10;

    return {
      all_time: {
        total_billed: totalBilled,
        total_collected: totalCollected,
        total_outstanding: totalOutstanding,
        total_expenses: totalExpenses,
        net_profit: totalCollected - totalExpenses,
        collection_rate_pct: Math.round(collectionRate * 10) / 10,
        average_invoice: Math.round(avgInvoice * 100) / 100,
        total_invoices: allInvoices.length,
      },
      this_month: {
        income: thisMonthIncome,
        expenses: thisMonthExp,
        net: thisMonthIncome - thisMonthExp,
        payments: Number(thisMonthPaymentsAgg._count.id),
      },
      last_month: {
        income: lastMonthIncome,
        expenses: lastMonthExp,
        net: lastMonthIncome - lastMonthExp,
        payments: Number(lastMonthPaymentsAgg._count.id),
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
    const where: any = {};
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

    const [payments, expenses] = await Promise.all([
      this.prisma.invoice_payments.findMany({
        where: { created_at: { gte: since } },
        select: { amount: true, payment_method: true, created_at: true },
      }),
      this.prisma.expenses.findMany({
        where: { expense_date: { gte: since } },
        select: { amount: true, expense_date: true },
      }),
    ]);

    const monthly: Record<string, { income: number; expenses: number }> = {};

    for (const p of payments) {
      const key = p.created_at.toISOString().slice(0, 7);
      if (!monthly[key]) monthly[key] = { income: 0, expenses: 0 };
      monthly[key].income += Number(p.amount);
    }
    for (const e of expenses) {
      const key = e.expense_date.toISOString().slice(0, 7);
      if (!monthly[key]) monthly[key] = { income: 0, expenses: 0 };
      monthly[key].expenses += Number(e.amount);
    }

    const methods: Record<string, number> = {};
    for (const p of payments) {
      const m = p.payment_method ?? 'unknown';
      methods[m] = (methods[m] ?? 0) + Number(p.amount);
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
      total_payments: payments.length,
    };
  }

  // ── Raw invoice payments list for charts ─────────────────────────────────
  async listInvoicePayments(limit = 500) {
    const rows = await this.prisma.invoice_payments.findMany({
      take: limit,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        amount: true,
        payment_method: true,
        created_at: true,
        invoice_id: true,
      },
    });
    return rows;
  }

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
      const [locked] = await tx.$queryRaw<
        { id: bigint; total_amount: unknown }[]
      >`SELECT id, total_amount FROM treatment_invoices WHERE id = ${invoiceId} FOR UPDATE`;
      if (!locked) throw new NotFoundException('Treatment invoice not found');

      const total = Number(locked.total_amount);
      const paidSoFar = await tx.invoice_payments.aggregate({
        where: { invoice_id: invoiceId },
        _sum: { amount: true },
      });
      const alreadyPaid = Number(paidSoFar._sum.amount ?? 0);
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
          amount,
          payment_method: dto.payment_method,
          notes: dto.notes,
          created_by: dto.created_by ? BigInt(dto.created_by) : null,
        },
      });

      const paid = round2(alreadyPaid + amount);
      return tx.treatment_invoices.update({
        where: { id: invoiceId },
        data: {
          amount_paid: paid,
          remaining_amount: round2(total - paid),
          status: deriveInvoiceStatus(total, paid),
          updated_at: new Date(),
        },
        include: invoiceInclude,
      });
    });
  }
}
