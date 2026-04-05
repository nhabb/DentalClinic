import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientRecordDto } from './dto/create-record.dto';
import { UpdatePatientRecordDto } from './dto/update-record.dto';

const recordInclude = {
  patient_profile: {
    select: {
      id: true,
      users: { select: { id: true, first_name: true, last_name: true } },
    },
  },
  created_by_user: {
    select: { id: true, first_name: true, last_name: true },
  },
  appointment: {
    select: { id: true, appointment_date: true, status: true },
  },
};

@Injectable()
export class PatientRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePatientRecordDto) {
    const patient = await this.prisma.patient_profiles.findUnique({
      where: { id: BigInt(dto.patient_id) },
    });
    if (!patient) throw new NotFoundException('Patient profile not found');

    return this.prisma.patient_records.create({
      data: {
        patient_id: BigInt(dto.patient_id),
        appointment_id: dto.appointment_id ? BigInt(dto.appointment_id) : undefined,
        record_type: dto.record_type,
        title: dto.title,
        description: dto.description,
        tooth_number: dto.tooth_number,
        treatment_date: dto.treatment_date ? new Date(dto.treatment_date) : undefined,
        created_by: BigInt(dto.created_by),
      },
      include: recordInclude,
    });
  }

  async findAll(filters: {
    patient_id?: number;
    record_type?: string;
    page?: number;
    limit?: number;
  }) {
    const { patient_id, record_type, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (patient_id) where.patient_id = BigInt(patient_id);
    if (record_type) where.record_type = record_type;

    const [data, total] = await Promise.all([
      this.prisma.patient_records.findMany({
        where,
        include: recordInclude,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.patient_records.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const record = await this.prisma.patient_records.findUnique({
      where: { id },
      include: recordInclude,
    });
    if (!record) throw new NotFoundException('Patient record not found');
    return record;
  }

  async update(id: bigint, dto: UpdatePatientRecordDto) {
    await this.findOne(id);

    return this.prisma.patient_records.update({
      where: { id },
      data: {
        ...dto,
        treatment_date: dto.treatment_date ? new Date(dto.treatment_date) : undefined,
        updated_at: new Date(),
      },
      include: recordInclude,
    });
  }

  async remove(id: bigint) {
    await this.findOne(id);
    await this.prisma.patient_records.delete({ where: { id } });
    return { message: 'Patient record deleted successfully' };
  }
}
