import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

const expenseInclude = {
  creator: {
    select: { id: true, first_name: true, last_name: true },
  },
};

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExpenseDto) {
    return this.prisma.expenses.create({
      data: {
        title: dto.title,
        category: dto.category ?? 'other',
        status: dto.status ?? 'pending',
        amount: dto.amount,
        description: dto.description,
        expense_date: new Date(
          `${dto.expense_date.split('T')[0]}T12:00:00.000Z`,
        ),
        created_by: dto.created_by ? BigInt(dto.created_by) : null,
      },
      include: expenseInclude,
    });
  }

  async findAll(filters: {
    category?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { category, from, to, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (category) where.category = category;
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
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const expense = await this.prisma.expenses.findUnique({
      where: { id },
      include: expenseInclude,
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async update(id: bigint, dto: UpdateExpenseDto) {
    await this.findOne(id);

    const data: any = { updated_at: new Date() };
    if (typeof dto.title === 'string') data.title = dto.title;
    if (typeof dto.category === 'string') data.category = dto.category;
    if (typeof dto.status === 'string') data.status = dto.status;
    if (typeof dto.amount === 'number') data.amount = dto.amount;
    if (typeof dto.description === 'string') data.description = dto.description;
    if (typeof dto.expense_date === 'string') {
      const dateOnly = dto.expense_date.split('T')[0];
      data.expense_date = new Date(`${dateOnly}T12:00:00.000Z`);
    }
    if (dto.created_by !== undefined)
      data.created_by = dto.created_by ? BigInt(dto.created_by) : null;

    return this.prisma.expenses.update({
      where: { id },
      data,
      include: expenseInclude,
    });
  }

  async remove(id: bigint) {
    await this.findOne(id);
    return this.prisma.expenses.delete({ where: { id } });
  }

  async getAnalytics(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const expenses = await this.prisma.expenses.findMany({
      where: { expense_date: { gte: since } },
      select: { amount: true, category: true, expense_date: true },
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

    return {
      period_months: months,
      total,
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
