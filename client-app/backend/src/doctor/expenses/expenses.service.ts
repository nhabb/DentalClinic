import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { RecordExpensePaymentDto } from './dto/record-expense-payment.dto';

const creatorSelect = {
  select: { id: true, first_name: true, last_name: true },
};

const expenseInclude = {
  creator: creatorSelect,
};

const paymentInclude = {
  creator: creatorSelect,
};

const paymentOrder = [
  { payment_date: 'desc' as const },
  { id: 'desc' as const },
];

// Tolerance for floating point comparisons on 2-decimal money values.
const EPSILON = 0.005;

export type ExpenseStatus = 'pending' | 'partial' | 'paid';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function deriveStatus(amount: number, paid: number): ExpenseStatus {
  if (paid <= EPSILON) return 'pending';
  if (paid + EPSILON >= amount) return 'paid';
  return 'partial';
}

function toDateOnly(value: string): Date {
  return new Date(`${value.split('T')[0]}T12:00:00.000Z`);
}

/** Attach the computed remaining balance so clients never have to derive it. */
function withRemaining<T extends { amount: unknown; amount_paid: unknown }>(
  expense: T,
) {
  const amount = Number(expense.amount);
  const paid = Number(expense.amount_paid);
  return { ...expense, remaining_amount: round2(Math.max(0, amount - paid)) };
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExpenseDto) {
    const amount = round2(dto.amount);
    const expenseDate = toDateOnly(dto.expense_date);
    const createdBy = dto.created_by ? BigInt(dto.created_by) : null;
    // "paid" at creation means paid in full: record a matching payment so history stays consistent.
    const payInFull = dto.status === 'paid' && amount > 0;

    const expense = await this.prisma.expenses.create({
      data: {
        // Omitted = database default (home branch, then the organization's default branch).
        ...(dto.branch_id ? { branch_id: BigInt(dto.branch_id) } : {}),
        title: dto.title,
        category: dto.category ?? 'other',
        status: payInFull ? 'paid' : 'pending',
        amount,
        amount_paid: payInFull ? amount : 0,
        description: dto.description,
        expense_date: expenseDate,
        created_by: createdBy,
        ...(payInFull
          ? {
              payments: {
                create: {
                  amount,
                  payment_method: 'cash',
                  payment_date: expenseDate,
                  created_by: createdBy,
                },
              },
            }
          : {}),
      },
      include: expenseInclude,
    });
    return withRemaining(expense);
  }

  async findAll(filters: {
    category?: string;
    branch_id?: number;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { category, branch_id, from, to, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (category) where.category = category;
    if (branch_id) where.branch_id = BigInt(branch_id);
    if (from || to) {
      where.expense_date = {};
      if (from) where.expense_date.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) where.expense_date.lte = new Date(`${to}T23:59:59.999Z`);
    }

    const [data, total] = await Promise.all([
      this.prisma.expenses.findMany({
        where,
        include: expenseInclude,
        skip,
        take: limit,
        orderBy: { expense_date: 'desc' },
      }),
      this.prisma.expenses.count({ where }),
    ]);

    return {
      data: data.map(withRemaining),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const expense = await this.prisma.expenses.findUnique({
      where: { id },
      include: {
        ...expenseInclude,
        payments: { include: paymentInclude, orderBy: paymentOrder },
      },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return withRemaining(expense);
  }

  async update(id: bigint, dto: UpdateExpenseDto) {
    const existing = await this.findOne(id);
    const currentPaid = Number(existing.amount_paid);

    const data: any = { updated_at: new Date() };
    if (typeof dto.title === 'string') data.title = dto.title;
    if (typeof dto.category === 'string') data.category = dto.category;
    if (typeof dto.description === 'string') data.description = dto.description;
    if (typeof dto.expense_date === 'string')
      data.expense_date = toDateOnly(dto.expense_date);
    if (dto.created_by !== undefined)
      data.created_by = dto.created_by ? BigInt(dto.created_by) : null;

    let amount = Number(existing.amount);
    if (typeof dto.amount === 'number') {
      amount = round2(dto.amount);
      if (amount + EPSILON < currentPaid) {
        throw new BadRequestException(
          `Amount (${amount}) cannot be less than what has already been paid (${currentPaid})`,
        );
      }
      data.amount = amount;
    }

    // Status is derived from payments. The only explicit transition honoured is
    // "paid", which settles the remaining balance with a payment record.
    let paid = currentPaid;
    if (dto.status === 'paid' && paid + EPSILON < amount) {
      const settle = round2(amount - paid);
      paid = amount;
      data.payments = {
        create: {
          amount: settle,
          payment_method: 'cash',
          notes: 'Marked as paid',
          created_by: dto.created_by ? BigInt(dto.created_by) : null,
        },
      };
    }
    data.amount_paid = paid;
    data.status = deriveStatus(amount, paid);

    const updated = await this.prisma.expenses.update({
      where: { id },
      data,
      include: expenseInclude,
    });
    return withRemaining(updated);
  }

  async remove(id: bigint) {
    await this.findOne(id);
    return this.prisma.expenses.delete({ where: { id } });
  }

  // ── Partial payments ────────────────────────────────────────────────────────

  async listPayments(expenseId: bigint) {
    await this.findOne(expenseId);
    return this.prisma.expense_payments.findMany({
      where: { expense_id: expenseId },
      include: paymentInclude,
      orderBy: paymentOrder,
    });
  }

  async recordPayment(expenseId: bigint, dto: RecordExpensePaymentDto) {
    const expense = await this.findOne(expenseId);
    const amount = Number(expense.amount);
    const paid = Number(expense.amount_paid);
    const remaining = round2(Math.max(0, amount - paid));

    if (remaining <= 0) {
      throw new BadRequestException('This expense is already fully paid');
    }
    if (dto.amount > remaining + EPSILON) {
      throw new BadRequestException(
        `Payment amount (${dto.amount}) exceeds the remaining balance (${remaining})`,
      );
    }

    const newPaid = round2(paid + dto.amount);

    // Nested create keeps the payment row and the running total in one atomic write.
    const updated = await this.prisma.expenses.update({
      where: { id: expenseId },
      data: {
        amount_paid: newPaid,
        status: deriveStatus(amount, newPaid),
        updated_at: new Date(),
        payments: {
          create: {
            amount: round2(dto.amount),
            payment_method: dto.payment_method ?? 'cash',
            notes: dto.notes,
            ...(dto.payment_date
              ? { payment_date: toDateOnly(dto.payment_date) }
              : {}),
            created_by: dto.created_by ? BigInt(dto.created_by) : null,
          },
        },
      },
      include: {
        ...expenseInclude,
        payments: { include: paymentInclude, orderBy: paymentOrder },
      },
    });
    return withRemaining(updated);
  }

  async deletePayment(expenseId: bigint, paymentId: bigint) {
    const expense = await this.findOne(expenseId);
    const payment = await this.prisma.expense_payments.findFirst({
      where: { id: paymentId, expense_id: expenseId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const amount = Number(expense.amount);
    const newPaid = round2(
      Math.max(0, Number(expense.amount_paid) - Number(payment.amount)),
    );

    const [, updated] = await this.prisma.$transaction([
      this.prisma.expense_payments.delete({ where: { id: paymentId } }),
      this.prisma.expenses.update({
        where: { id: expenseId },
        data: {
          amount_paid: newPaid,
          status: deriveStatus(amount, newPaid),
          updated_at: new Date(),
        },
        include: {
          ...expenseInclude,
          payments: { include: paymentInclude, orderBy: paymentOrder },
        },
      }),
    ]);
    return withRemaining(updated);
  }

  // ── Analytics ───────────────────────────────────────────────────────────────

  async getAnalytics(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const expenses = await this.prisma.expenses.findMany({
      where: { expense_date: { gte: since } },
      select: {
        amount: true,
        amount_paid: true,
        category: true,
        expense_date: true,
      },
    });

    // Monthly totals
    const monthlyMap: Record<string, number> = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[key] = 0;
    }

    for (const e of expenses) {
      const key = `${e.expense_date.getFullYear()}-${String(e.expense_date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap[key] !== undefined) monthlyMap[key] += Number(e.amount);
    }

    // By category
    const byCategory: Record<string, { total: number; count: number }> = {};
    for (const e of expenses) {
      if (!byCategory[e.category])
        byCategory[e.category] = { total: 0, count: 0 };
      byCategory[e.category].total += Number(e.amount);
      byCategory[e.category].count++;
    }

    const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalPaid = expenses.reduce((s, e) => s + Number(e.amount_paid), 0);

    return {
      period_months: months,
      total,
      total_paid: round2(totalPaid),
      total_outstanding: round2(Math.max(0, total - totalPaid)),
      monthly: Object.entries(monthlyMap).map(([month, amount]) => ({
        month,
        amount,
      })),
      by_category: Object.entries(byCategory)
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.total - a.total),
    };
  }
}
