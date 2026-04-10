import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment.dto';

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

  async updateStatus(id: bigint, dto: UpdatePaymentStatusDto) {
    const payment = await this.findOne(id);

    const data: any = { updated_at: new Date() };

    if (dto.amount_paid !== undefined) {
      const total = Number(payment.amount);
      const alreadyPaid = Number(payment.amount_paid);
      const newTotal = alreadyPaid + dto.amount_paid;

      if (newTotal > total) {
        throw new Error(`Payment of ${dto.amount_paid} would exceed remaining balance (${total - alreadyPaid})`);
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
}
