import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

const invoiceInclude = {
  patient: {
    select: {
      id: true,
      users: { select: { id: true, first_name: true, last_name: true, email: true } },
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

    const total_amount = dto.line_items.reduce((sum, item) => sum + item.amount, 0);

    const invoice = await this.prisma.treatment_invoices.create({
      data: {
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
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { patient_id, status, from, to, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (patient_id) where.patient_id = BigInt(patient_id);
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

  // ── Financial summary (replaces payments/summary) ────────────────────────
  async getSummary(filters: { from?: string; to?: string } = {}) {
    const { from, to } = filters;

    const buildRange = () => {
      if (!from && !to) return undefined;
      return {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to   ? { lte: new Date(`${to}T23:59:59.999Z`)   } : {}),
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

    const totalIncome      = Number(incomeAgg._sum.amount ?? 0);
    const totalExpenses    = Number(expenseAgg._sum.amount ?? 0);
    const totalOutstanding = Number(outstandingAgg._sum.remaining_amount ?? 0);

    return {
      total_income:      totalIncome,
      total_expenses:    totalExpenses,
      net:               totalIncome - totalExpenses,
      total_outstanding: totalOutstanding,
      payments_count:    Number(incomeAgg._count.id),
      expenses_count:    Number(expenseAgg._count.id ?? 0),
      ...(from || to ? { period: { from: from ?? null, to: to ?? null } } : {}),
    };
  }

  // ── KPI overview (replaces payments/kpis) ────────────────────────────────
  async getKpis() {
    const now              = new Date();
    const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [allInvoices, allInvoicePayments, allExpenses,
           thisMonthPaymentsAgg, lastMonthPaymentsAgg,
           thisMonthExpenses, lastMonthExpenses] = await Promise.all([
      // All invoices — for billed / outstanding totals
      this.prisma.treatment_invoices.findMany({
        select: { total_amount: true, amount_paid: true, remaining_amount: true, status: true },
      }),
      // All invoice_payments — for total collected
      this.prisma.invoice_payments.aggregate({ _sum: { amount: true }, _count: { id: true } }),
      // All expenses
      this.prisma.expenses.findMany({ select: { amount: true } }),
      // This month payments received
      this.prisma.invoice_payments.aggregate({
        where: { created_at: { gte: startOfMonth } },
        _sum: { amount: true }, _count: { id: true },
      }),
      // Last month payments received
      this.prisma.invoice_payments.aggregate({
        where: { created_at: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { amount: true }, _count: { id: true },
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

    const sumAmt = (rows: { amount: any }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

    const totalBilled      = allInvoices.reduce((s, i) => s + Number(i.total_amount), 0);
    const totalCollected   = Number(allInvoicePayments._sum.amount ?? 0);
    const totalOutstanding = allInvoices
      .filter((i) => i.status === 'open' || i.status === 'partial')
      .reduce((s, i) => s + Number(i.remaining_amount), 0);
    const totalExpenses    = sumAmt(allExpenses);
    const collectionRate   = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;
    const avgInvoice       = allInvoices.length > 0 ? totalBilled / allInvoices.length : 0;

    const thisMonthIncome = Number(thisMonthPaymentsAgg._sum.amount ?? 0);
    const lastMonthIncome = Number(lastMonthPaymentsAgg._sum.amount ?? 0);
    const thisMonthExp    = sumAmt(thisMonthExpenses);
    const lastMonthExp    = sumAmt(lastMonthExpenses);

    const growth = (cur: number, prev: number) =>
      prev === 0 ? null : Math.round(((cur - prev) / prev) * 100 * 10) / 10;

    return {
      all_time: {
        total_billed:        totalBilled,
        total_collected:     totalCollected,
        total_outstanding:   totalOutstanding,
        total_expenses:      totalExpenses,
        net_profit:          totalCollected - totalExpenses,
        collection_rate_pct: Math.round(collectionRate * 10) / 10,
        average_invoice:     Math.round(avgInvoice * 100) / 100,
        total_invoices:      allInvoices.length,
      },
      this_month: {
        income:   thisMonthIncome,
        expenses: thisMonthExp,
        net:      thisMonthIncome - thisMonthExp,
        payments: Number(thisMonthPaymentsAgg._count.id),
      },
      last_month: {
        income:   lastMonthIncome,
        expenses: lastMonthExp,
        net:      lastMonthIncome - lastMonthExp,
        payments: Number(lastMonthPaymentsAgg._count.id),
      },
      growth: {
        income_pct:   growth(thisMonthIncome, lastMonthIncome),
        expenses_pct: growth(thisMonthExp, lastMonthExp),
        net_pct:      growth(thisMonthIncome - thisMonthExp, lastMonthIncome - lastMonthExp),
      },
    };
  }

  // ── Raw invoice payments list for charts ─────────────────────────────────
  async listInvoicePayments(limit = 500) {
    const rows = await this.prisma.invoice_payments.findMany({
      take: limit,
      orderBy: { created_at: 'desc' },
      select: { id: true, amount: true, payment_method: true, created_at: true, invoice_id: true },
    });
    return rows;
  }

  async recordPayment(invoiceId: bigint, dto: RecordPaymentDto) {
    const invoice = await this.findOne(invoiceId);

    const remaining = Number(invoice.remaining_amount);
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException(
        `Payment amount (${dto.amount}) exceeds remaining balance (${remaining})`,
      );
    }

    const new_amount_paid = Number(invoice.amount_paid) + dto.amount;
    const new_remaining = Math.max(0, Number(invoice.total_amount) - new_amount_paid);
    const status = new_remaining <= 0 ? 'paid' : new_amount_paid > 0 ? 'partial' : 'open';

    await this.prisma.invoice_payments.create({
      data: {
        invoice_id: invoiceId,
        amount: dto.amount,
        payment_method: dto.payment_method,
        notes: dto.notes,
        created_by: dto.created_by ? BigInt(dto.created_by) : null,
      },
    });

    const updatedInvoice = await this.prisma.treatment_invoices.update({
      where: { id: invoiceId },
      data: {
        amount_paid: new_amount_paid,
        remaining_amount: new_remaining,
        status,
        updated_at: new Date(),
      },
      include: invoiceInclude,
    });

    return updatedInvoice;
  }
}
