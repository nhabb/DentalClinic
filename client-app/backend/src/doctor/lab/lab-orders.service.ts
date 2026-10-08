import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  toDateOnly,
  toDateOnlyOrNull,
  todayIso,
} from '../../shared/common/date-only';
import { CaseLinksService } from '../case-links/case-links.service';
import { LabsService } from './labs.service';
import { CreateLabOrderDto, LabOrderStatus } from './dto/create-lab-order.dto';
import { UpdateLabOrderDto } from './dto/update-lab-order.dto';

const labOrderInclude = {
  lab: { select: { id: true, name: true, phone: true } },
  patient: {
    select: {
      id: true,
      users: { select: { first_name: true, last_name: true } },
    },
  },
  appointment: {
    select: { id: true, appointment_date: true, start_time: true },
  },
  record: { select: { id: true, title: true, record_type: true } },
  orderer: { select: { id: true, first_name: true, last_name: true } },
};

/** Once the work is fitted or the order cancelled, its status is history. */
const TERMINAL_STATUSES: ReadonlySet<LabOrderStatus> = new Set([
  'fitted',
  'cancelled',
]);

/** Statuses that still wait on the lab; an order past its due date in one of these is overdue. */
export const OPEN_STATUSES: readonly LabOrderStatus[] = ['ordered', 'sent'];

/** Moving to one of these statuses stamps its date when none was given. */
const DATE_FOR_STATUS: Partial<
  Record<LabOrderStatus, 'sent_at' | 'received_at' | 'fitted_at'>
> = { sent: 'sent_at', received: 'received_at', fitted: 'fitted_at' };

/** Work sent to a dental lab for a case. */
@Injectable()
export class LabOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseLinks: CaseLinksService,
    private readonly labs: LabsService,
  ) {}

  async findAll(filters: {
    patient_id?: number;
    lab_id?: number;
    status?: string;
    work_type?: string;
    branch_id?: number;
    overdue?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const where = {
      ...(filters.patient_id ? { patient_id: BigInt(filters.patient_id) } : {}),
      ...(filters.lab_id ? { lab_id: BigInt(filters.lab_id) } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.work_type ? { work_type: filters.work_type } : {}),
      ...(filters.branch_id ? { branch_id: BigInt(filters.branch_id) } : {}),
      ...(filters.overdue ? overdueWhere() : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.lab_orders.findMany({
        where,
        include: labOrderInclude,
        orderBy: [{ due_at: 'asc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lab_orders.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const order = await this.prisma.lab_orders.findUnique({
      where: { id },
      include: labOrderInclude,
    });
    if (!order) throw new NotFoundException('Lab order not found');
    return order;
  }

  async create(dto: CreateLabOrderDto, orderedBy: bigint) {
    await this.caseLinks.assertValid(dto);
    await this.labs.assertActive(BigInt(dto.lab_id));
    const status = dto.status ?? 'ordered';

    return this.prisma.lab_orders.create({
      data: {
        // Omitted = database default (home branch, then the organization's default branch).
        ...(dto.branch_id ? { branch_id: BigInt(dto.branch_id) } : {}),
        patient_id: BigInt(dto.patient_id),
        lab_id: BigInt(dto.lab_id),
        appointment_id: dto.appointment_id ? BigInt(dto.appointment_id) : null,
        record_id: dto.record_id ? BigInt(dto.record_id) : null,
        ordered_by: orderedBy,
        work_type: dto.work_type,
        description: dto.description,
        tooth_numbers: dto.tooth_numbers,
        shade: dto.shade,
        status,
        ...stampedDates(status, dto),
        cost: dto.cost,
        notes: dto.notes,
      },
      include: labOrderInclude,
    });
  }

  async update(id: bigint, dto: UpdateLabOrderDto) {
    const current = await this.findOne(id);

    const statusChanges =
      dto.status !== undefined && dto.status !== current.status;
    if (
      statusChanges &&
      TERMINAL_STATUSES.has(current.status as LabOrderStatus)
    ) {
      throw new BadRequestException(
        `A ${current.status} lab order cannot change status`,
      );
    }

    const linksChanged =
      dto.patient_id !== undefined ||
      dto.appointment_id !== undefined ||
      dto.record_id !== undefined;
    if (linksChanged) {
      await this.caseLinks.assertValid({
        patient_id: dto.patient_id ?? Number(current.patient_id),
        appointment_id: dto.appointment_id ?? toNumber(current.appointment_id),
        record_id: dto.record_id ?? toNumber(current.record_id),
      });
    }
    if (dto.lab_id !== undefined) {
      await this.labs.assertActive(BigInt(dto.lab_id));
    }

    return this.prisma.lab_orders.update({
      where: { id },
      data: {
        ...(dto.branch_id !== undefined
          ? { branch_id: BigInt(dto.branch_id) }
          : {}),
        ...(dto.patient_id !== undefined
          ? { patient_id: BigInt(dto.patient_id) }
          : {}),
        ...(dto.lab_id !== undefined ? { lab_id: BigInt(dto.lab_id) } : {}),
        ...(dto.appointment_id !== undefined
          ? {
              appointment_id: dto.appointment_id
                ? BigInt(dto.appointment_id)
                : null,
            }
          : {}),
        ...(dto.record_id !== undefined
          ? { record_id: dto.record_id ? BigInt(dto.record_id) : null }
          : {}),
        ...(dto.work_type !== undefined ? { work_type: dto.work_type } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.tooth_numbers !== undefined
          ? { tooth_numbers: dto.tooth_numbers }
          : {}),
        ...(dto.shade !== undefined ? { shade: dto.shade } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(statusChanges
          ? stampedDates(dto.status as LabOrderStatus, dto)
          : {}),
        ...(dto.sent_at !== undefined
          ? { sent_at: toDateOnlyOrNull(dto.sent_at) }
          : {}),
        ...(dto.due_at !== undefined
          ? { due_at: toDateOnlyOrNull(dto.due_at) }
          : {}),
        ...(dto.received_at !== undefined
          ? { received_at: toDateOnlyOrNull(dto.received_at) }
          : {}),
        ...(dto.fitted_at !== undefined
          ? { fitted_at: toDateOnlyOrNull(dto.fitted_at) }
          : {}),
        ...(dto.cost !== undefined ? { cost: dto.cost } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        updated_at: new Date(),
      },
      include: labOrderInclude,
    });
  }

  async remove(id: bigint) {
    await this.findOne(id);
    await this.prisma.lab_orders.delete({ where: { id } });
    return { message: 'Lab order deleted' };
  }
}

/** Still waiting on the lab and past the expected date. */
export function overdueWhere() {
  return {
    status: { in: [...OPEN_STATUSES] },
    due_at: { lt: toDateOnly(todayIso()) },
  };
}

/**
 * The dates the DTO gives, plus today's date for the status being entered
 * when the DTO did not give one (sent -> sent_at, received -> received_at,
 * fitted -> fitted_at).
 */
export function stampedDates(
  status: LabOrderStatus,
  dto: {
    sent_at?: string;
    due_at?: string;
    received_at?: string;
    fitted_at?: string;
  },
): {
  sent_at?: Date | null;
  due_at?: Date | null;
  received_at?: Date | null;
  fitted_at?: Date | null;
} {
  const dates = {
    ...(dto.sent_at !== undefined
      ? { sent_at: toDateOnlyOrNull(dto.sent_at) }
      : {}),
    ...(dto.due_at !== undefined
      ? { due_at: toDateOnlyOrNull(dto.due_at) }
      : {}),
    ...(dto.received_at !== undefined
      ? { received_at: toDateOnlyOrNull(dto.received_at) }
      : {}),
    ...(dto.fitted_at !== undefined
      ? { fitted_at: toDateOnlyOrNull(dto.fitted_at) }
      : {}),
  };
  const field = DATE_FOR_STATUS[status];
  if (field && dates[field] === undefined)
    dates[field] = toDateOnly(todayIso());
  return dates;
}

const toNumber = (v: bigint | null): number | null =>
  v === null ? null : Number(v);
