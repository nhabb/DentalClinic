import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto, UpdatePaymentStatusDto } from './dto/update-payment.dto';

const paymentInclude = {
  patient: {
    select: {
      id: true,
      users: { select: { id: true, first_name: true, last_name: true, email: true } },
    },
  },
  appointment: {
    select: { id: true, appointment_date: true, status: true },
  },
  creator: {
    select: { id: true, first_name: true, last_name: true },
  },
};

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentDto) {
    // Accept either patient_profiles.id or users.id — resolve to patient_profiles.id
    let profile = await this.prisma.patient_profiles.findUnique({
      where: { id: BigInt(dto.patient_id) },
    });
    if (!profile) {
      // Try treating dto.patient_id as a user_id
      profile = await this.prisma.patient_profiles.findUnique({
        where: { user_id: BigInt(dto.patient_id) },
      });
    }
    if (!profile) throw new NotFoundException('Patient profile not found');

    return this.prisma.payments.create({
      data: {
        patient_id: profile.id,
        appointment_id: dto.appointment_id ? BigInt(dto.appointment_id) : null,
        amount: dto.amount,
        payment_method: dto.payment_method ?? 'cash',
        status: 'pending',
        description: dto.description,
        created_by: dto.created_by ? BigInt(dto.created_by) : null,
      },
      include: paymentInclude,
    });
  }

  async findAll(filters: {
    patient_id?: number;
    appointment_id?: number;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { patient_id, appointment_id, status, from, to, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (patient_id) where.patient_id = BigInt(patient_id);
    if (appointment_id) where.appointment_id = BigInt(appointment_id);
    if (status) where.status = status;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) where.created_at.lte = new Date(`${to}T23:59:59.999Z`);
    }

    const [data, total] = await Promise.all([
      this.prisma.payments.findMany({
        where,
        include: paymentInclude,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.payments.count({ where }),
    ]);

    return {
      data: data.map((p) => ({ ...p, remaining_balance: Number(p.amount) - Number(p.amount_paid) })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const payment = await this.prisma.payments.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return { ...payment, remaining_balance: Number(payment.amount) - Number(payment.amount_paid) };
  }

  async update(id: bigint, dto: UpdatePaymentDto) {
    const payment = await this.findOne(id);

    // If the total amount is being reduced below what has already been paid, reject it
    if (dto.amount !== undefined && dto.amount < Number(payment.amount_paid)) {
      throw new BadRequestException(
        `New amount (${dto.amount}) cannot be less than what has already been paid (${payment.amount_paid})`,
      );
    }

    const data: any = { updated_at: new Date() };
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.payment_method !== undefined) data.payment_method = dto.payment_method;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.appointment_id !== undefined) {
      data.appointment_id = dto.appointment_id ? BigInt(dto.appointment_id) : null;
    }

    // Recompute status if amount changed
    if (dto.amount !== undefined) {
      const paid = Number(payment.amount_paid);
      const newTotal = dto.amount;
      if (paid === 0) data.status = 'pending';
      else if (paid < newTotal) data.status = 'partial';
      else data.status = 'paid';
    }

    const updated = await this.prisma.payments.update({
      where: { id },
      data,
      include: paymentInclude,
    });

    return {
      ...updated,
      remaining_balance: Number(updated.amount) - Number(updated.amount_paid),
    };
  }

  async updateStatus(id: bigint, dto: UpdatePaymentStatusDto) {
    const payment = await this.findOne(id);

    const data: any = { updated_at: new Date() };

    if (dto.amount_paid !== undefined) {
      const total = Number(payment.amount);
      const alreadyPaid = Number(payment.amount_paid);
      const newTotal = alreadyPaid + dto.amount_paid;

      if (newTotal > total) {
        throw new BadRequestException(`Payment of ${dto.amount_paid} would exceed remaining balance (${total - alreadyPaid})`);
      }

      data.amount_paid = newTotal;

      if (newTotal === 0) {
        data.status = 'pending';
      } else if (newTotal < total) {
        data.status = 'partial';
        data.paid_at = dto.paid_at ? new Date(dto.paid_at) : new Date();
      } else {
        data.status = 'paid';
        data.paid_at = dto.paid_at ? new Date(dto.paid_at) : new Date();
      }
    } else if (dto.status) {
      data.status = dto.status;
      if (dto.status === 'paid') {
        data.paid_at = dto.paid_at ? new Date(dto.paid_at) : new Date();
      } else if (dto.paid_at) {
        data.paid_at = new Date(dto.paid_at);
      }
    }

    const updated = await this.prisma.payments.update({
      where: { id },
      data,
      include: paymentInclude,
    });

    return {
      ...updated,
      remaining_balance: Number(updated.amount) - Number(updated.amount_paid),
    };
  }

  async getSummary(filters: { from?: string; to?: string }) {
    const { from, to } = filters;

    const dateFilter: any = {};
    if (from || to) {
      if (from) dateFilter.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) dateFilter.lte = new Date(`${to}T23:59:59.999Z`);
    }

    const paymentWhere: any = { status: 'paid' };
    if (Object.keys(dateFilter).length) paymentWhere.paid_at = dateFilter;

    const expenseWhere: any = {};
    if (Object.keys(dateFilter).length) {
      expenseWhere.expense_date = dateFilter;
    }

    const [incomeAgg, expenseAgg, paymentsCount, expensesCount] = await Promise.all([
      this.prisma.payments.aggregate({
        where: paymentWhere,
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.expenses.aggregate({
        where: expenseWhere,
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.payments.count({ where: paymentWhere }),
      this.prisma.expenses.count({ where: expenseWhere }),
    ]);

    const totalIncome = Number(incomeAgg._sum.amount ?? 0);
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0);

    return {
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net: totalIncome - totalExpenses,
      payments_count: paymentsCount,
      expenses_count: expensesCount,
      ...(from || to ? { period: { from: from ?? null, to: to ?? null } } : {}),
    };
  }

  async getOutstanding() {
    const rows = await this.prisma.payments.findMany({
      where: { status: { in: ['pending', 'partial'] } },
      include: paymentInclude,
      orderBy: { created_at: 'asc' },
    });

    return rows.map((p) => ({
      ...p,
      amount_paid: Number(p.amount_paid),
      remaining_balance: Number(p.amount) - Number(p.amount_paid),
    }));
  }

  async getAnalytics(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const [payments, expenses] = await Promise.all([
      this.prisma.payments.findMany({
        where: { created_at: { gte: since } },
        select: { amount: true, amount_paid: true, status: true, payment_method: true, created_at: true, paid_at: true },
      }),
      this.prisma.expenses.findMany({
        where: { expense_date: { gte: since } },
        select: { amount: true, category: true, expense_date: true },
      }),
    ]);

    // Monthly income (paid only)
    const monthlyMap: Record<string, { income: number; expenses: number }> = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[key] = { income: 0, expenses: 0 };
    }

    for (const p of payments) {
      if (p.status === 'paid' || p.status === 'partial') {
        const d = p.paid_at ?? p.created_at;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyMap[key] !== undefined) {
          monthlyMap[key].income += Number(p.amount_paid);
        }
      }
    }

    for (const e of expenses) {
      const key = `${e.expense_date.getFullYear()}-${String(e.expense_date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap[key] !== undefined) {
        monthlyMap[key].expenses += Number(e.amount);
      }
    }

    const monthly = Object.entries(monthlyMap).map(([month, v]) => ({
      month,
      income: v.income,
      expenses: v.expenses,
      net: v.income - v.expenses,
    }));

    // By payment method
    const byMethod: Record<string, number> = {};
    for (const p of payments) {
      if (!byMethod[p.payment_method]) byMethod[p.payment_method] = 0;
      byMethod[p.payment_method] += Number(p.amount_paid);
    }

    // By status count
    const byStatus: Record<string, number> = {};
    for (const p of payments) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    }

    // Expenses by category
    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
    }

    // Totals
    const totalIncome = payments
      .filter((p) => p.status === 'paid' || p.status === 'partial')
      .reduce((s, p) => s + Number(p.amount_paid), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalOutstanding = payments
      .filter((p) => p.status === 'pending' || p.status === 'partial')
      .reduce((s, p) => s + (Number(p.amount) - Number(p.amount_paid)), 0);

    return {
      period_months: months,
      totals: {
        income: totalIncome,
        expenses: totalExpenses,
        net: totalIncome - totalExpenses,
        outstanding: totalOutstanding,
      },
      monthly,
      by_payment_method: byMethod,
      by_status: byStatus,
      expenses_by_category: byCategory,
    };
  }

  // ─── KPI Overview ────────────────────────────────────────────────────────────
  async getKpis() {
    const now = new Date();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [allPayments, allExpenses, thisMonthPayments, lastMonthPayments, thisMonthExpenses, lastMonthExpenses] =
      await Promise.all([
        this.prisma.payments.findMany({ select: { amount: true, amount_paid: true, status: true } }),
        this.prisma.expenses.findMany({ select: { amount: true } }),
        this.prisma.payments.findMany({
          where: { created_at: { gte: startOfMonth } },
          select: { amount: true, amount_paid: true, status: true },
        }),
        this.prisma.payments.findMany({
          where: { created_at: { gte: startOfLastMonth, lte: endOfLastMonth } },
          select: { amount: true, amount_paid: true, status: true },
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

    const sumPaid = (rows: { amount: any; amount_paid: any; status: string }[]) =>
      rows.filter((r) => r.status === 'paid' || r.status === 'partial').reduce((s, r) => s + Number(r.amount_paid), 0);

    const sumBilled = (rows: { amount: any }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);
    const sumExp = (rows: { amount: any }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

    const totalBilled = sumBilled(allPayments);
    const totalCollected = sumPaid(allPayments);
    const totalOutstanding = allPayments
      .filter((p) => p.status === 'pending' || p.status === 'partial')
      .reduce((s, p) => s + (Number(p.amount) - Number(p.amount_paid)), 0);
    const totalExpenses = sumExp(allExpenses);
    const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

    const thisMonthIncome = sumPaid(thisMonthPayments);
    const lastMonthIncome = sumPaid(lastMonthPayments);
    const thisMonthExp = sumExp(thisMonthExpenses);
    const lastMonthExp = sumExp(lastMonthExpenses);

    const growth = (current: number, prev: number) =>
      prev === 0 ? null : Math.round(((current - prev) / prev) * 100 * 10) / 10;

    const avgInvoice =
      allPayments.length > 0 ? totalBilled / allPayments.length : 0;

    return {
      all_time: {
        total_billed: totalBilled,
        total_collected: totalCollected,
        total_outstanding: totalOutstanding,
        total_expenses: totalExpenses,
        net_profit: totalCollected - totalExpenses,
        collection_rate_pct: Math.round(collectionRate * 10) / 10,
        average_invoice: Math.round(avgInvoice * 100) / 100,
        total_invoices: allPayments.length,
      },
      this_month: {
        income: thisMonthIncome,
        expenses: thisMonthExp,
        net: thisMonthIncome - thisMonthExp,
        invoices: thisMonthPayments.length,
      },
      last_month: {
        income: lastMonthIncome,
        expenses: lastMonthExp,
        net: lastMonthIncome - lastMonthExp,
        invoices: lastMonthPayments.length,
      },
      growth: {
        income_pct: growth(thisMonthIncome, lastMonthIncome),
        expenses_pct: growth(thisMonthExp, lastMonthExp),
        net_pct: growth(thisMonthIncome - thisMonthExp, lastMonthIncome - lastMonthExp),
      },
    };
  }

  // ─── Accounts-receivable aging report ────────────────────────────────────────
  async getAging() {
    const now = new Date();

    const rows = await this.prisma.payments.findMany({
      where: { status: { in: ['pending', 'partial'] } },
      include: paymentInclude,
    });

    const buckets: Record<string, typeof rows> = {
      '0-30':  [],
      '31-60': [],
      '61-90': [],
      '90+':   [],
    };

    for (const row of rows) {
      const daysDue = Math.floor((now.getTime() - row.created_at.getTime()) / 86400000);
      const bucket =
        daysDue <= 30 ? '0-30' :
        daysDue <= 60 ? '31-60' :
        daysDue <= 90 ? '61-90' : '90+';
      buckets[bucket].push(row);
    }

    const summarize = (list: typeof rows) => ({
      count: list.length,
      total_outstanding: list.reduce((s, r) => s + Number(r.amount) - Number(r.amount_paid), 0),
      invoices: list.map((r) => ({
        id: r.id,
        patient: r.patient?.users
          ? `${r.patient.users.first_name} ${r.patient.users.last_name}`
          : null,
        amount: Number(r.amount),
        amount_paid: Number(r.amount_paid),
        remaining: Number(r.amount) - Number(r.amount_paid),
        status: r.status,
        created_at: r.created_at,
      })),
    });

    return {
      '0_30_days':  summarize(buckets['0-30']),
      '31_60_days': summarize(buckets['31-60']),
      '61_90_days': summarize(buckets['61-90']),
      '90_plus_days': summarize(buckets['90+']),
      total_outstanding: rows.reduce((s, r) => s + Number(r.amount) - Number(r.amount_paid), 0),
    };
  }

  // ─── Per-patient financial summary ───────────────────────────────────────────
  async getPatientFinancials(patientId?: bigint) {
    const where: any = {};
    if (patientId) where.patient_id = patientId;

    const rows = await this.prisma.payments.findMany({
      where,
      include: paymentInclude,
    });

    // Group by patient
    const map = new Map<string, {
      patient_id: string;
      name: string;
      email: string;
      total_billed: number;
      total_paid: number;
      outstanding: number;
      invoices: number;
      last_payment: Date | null;
    }>();

    for (const r of rows) {
      const pid = r.patient_id.toString();
      const name = r.patient?.users
        ? `${r.patient.users.first_name} ${r.patient.users.last_name}`
        : pid;
      const email = r.patient?.users?.email ?? '';

      if (!map.has(pid)) {
        map.set(pid, { patient_id: pid, name, email, total_billed: 0, total_paid: 0, outstanding: 0, invoices: 0, last_payment: null });
      }

      const entry = map.get(pid)!;
      entry.total_billed += Number(r.amount);
      entry.total_paid += Number(r.amount_paid);
      entry.outstanding += Number(r.amount) - Number(r.amount_paid);
      entry.invoices++;
      if (r.paid_at && (!entry.last_payment || r.paid_at > entry.last_payment)) {
        entry.last_payment = r.paid_at;
      }
    }

    const results = Array.from(map.values()).map((p) => ({
      ...p,
      collection_rate_pct: p.total_billed > 0
        ? Math.round((p.total_paid / p.total_billed) * 1000) / 10
        : 0,
    }));

    results.sort((a, b) => b.total_billed - a.total_billed);
    return results;
  }
}
