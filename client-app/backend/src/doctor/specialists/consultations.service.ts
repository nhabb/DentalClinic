import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { dateRange, toDateOnlyOrNull } from '../../shared/common/date-only';
import { CaseLinksService } from '../case-links/case-links.service';
import { SpecialistsService } from './specialists.service';
import {
  ConsultationStatus,
  CreateConsultationDto,
} from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';

const consultationInclude = {
  specialist: {
    select: { id: true, name: true, specialty: true, phone: true },
  },
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
  requester: { select: { id: true, first_name: true, last_name: true } },
};

/** Once a consultation is completed or cancelled its status is history. */
const TERMINAL_STATUSES: ReadonlySet<ConsultationStatus> = new Set([
  'completed',
  'cancelled',
]);

/** Cases on which an outside specialist was asked to help. */
@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseLinks: CaseLinksService,
    private readonly specialists: SpecialistsService,
  ) {}

  async findAll(filters: {
    patient_id?: number;
    specialist_id?: number;
    status?: string;
    branch_id?: number;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const where = {
      ...(filters.patient_id ? { patient_id: BigInt(filters.patient_id) } : {}),
      ...(filters.specialist_id
        ? { specialist_id: BigInt(filters.specialist_id) }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.branch_id ? { branch_id: BigInt(filters.branch_id) } : {}),
      ...(filters.from || filters.to
        ? { consultation_date: dateRange(filters.from, filters.to) }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.specialist_consultations.findMany({
        where,
        include: consultationInclude,
        orderBy: [{ consultation_date: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.specialist_consultations.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const consultation = await this.prisma.specialist_consultations.findUnique({
      where: { id },
      include: consultationInclude,
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    return consultation;
  }

  async create(dto: CreateConsultationDto, requestedBy: bigint) {
    await this.caseLinks.assertValid(dto);
    await this.specialists.assertActive(BigInt(dto.specialist_id));

    return this.prisma.specialist_consultations.create({
      data: {
        // Omitted = database default (home branch, then the organization's default branch).
        ...(dto.branch_id ? { branch_id: BigInt(dto.branch_id) } : {}),
        patient_id: BigInt(dto.patient_id),
        specialist_id: BigInt(dto.specialist_id),
        appointment_id: dto.appointment_id ? BigInt(dto.appointment_id) : null,
        record_id: dto.record_id ? BigInt(dto.record_id) : null,
        requested_by: requestedBy,
        status: dto.status ?? 'requested',
        consultation_date: toDateOnlyOrNull(dto.consultation_date) ?? null,
        reason: dto.reason,
        outcome: dto.outcome,
        fee: dto.fee,
        notes: dto.notes,
      },
      include: consultationInclude,
    });
  }

  async update(id: bigint, dto: UpdateConsultationDto) {
    const current = await this.findOne(id);

    if (
      dto.status !== undefined &&
      dto.status !== current.status &&
      TERMINAL_STATUSES.has(current.status as ConsultationStatus)
    ) {
      throw new BadRequestException(
        `A ${current.status} consultation cannot change status`,
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
    if (dto.specialist_id !== undefined) {
      await this.specialists.assertActive(BigInt(dto.specialist_id));
    }

    return this.prisma.specialist_consultations.update({
      where: { id },
      data: {
        ...(dto.branch_id !== undefined
          ? { branch_id: BigInt(dto.branch_id) }
          : {}),
        ...(dto.patient_id !== undefined
          ? { patient_id: BigInt(dto.patient_id) }
          : {}),
        ...(dto.specialist_id !== undefined
          ? { specialist_id: BigInt(dto.specialist_id) }
          : {}),
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
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.consultation_date !== undefined
          ? { consultation_date: toDateOnlyOrNull(dto.consultation_date) }
          : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        ...(dto.outcome !== undefined ? { outcome: dto.outcome } : {}),
        ...(dto.fee !== undefined ? { fee: dto.fee } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        updated_at: new Date(),
      },
      include: consultationInclude,
    });
  }

  async remove(id: bigint) {
    await this.findOne(id);
    await this.prisma.specialist_consultations.delete({ where: { id } });
    return { message: 'Consultation deleted' };
  }
}

const toNumber = (v: bigint | null): number | null =>
  v === null ? null : Number(v);
