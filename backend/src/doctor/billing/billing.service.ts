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
