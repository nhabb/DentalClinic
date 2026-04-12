import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  private patientSelect = {
    id: true,
    user_id: true,
    city: true,
    governate: true,
    emergency_contact_name: true,
    emergency_contact_phone: true,
    blood_type: true,
    allergies: true,
    medical_notes: true,
    insurance_provider: true,
    insurance_policy: true,
    current_medications: true,
    profile_complete: true,
    created_at: true,
    updated_at: true,
    users: {
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        date_of_birth: true,
        gender: true,
        address: true,
      },
    },
  };

  async findAll(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;

    let where: any = undefined;
    if (search) {
      const words = search.trim().split(/\s+/);
      if (words.length >= 2) {
        where = {
          users: {
            OR: [
              {
                AND: [
                  { first_name: { contains: words[0], mode: 'insensitive' as const } },
                  { last_name: { contains: words.slice(1).join(' '), mode: 'insensitive' as const } },
                ],
              },
              {
                AND: [
                  { first_name: { contains: words[words.length - 1], mode: 'insensitive' as const } },
                  { last_name: { contains: words.slice(0, -1).join(' '), mode: 'insensitive' as const } },
                ],
              },
              ...words.map((w) => ({ email: { contains: w, mode: 'insensitive' as const } })),
            ],
          },
        };
      } else {
        where = {
          users: {
            OR: [
              { first_name: { contains: search, mode: 'insensitive' as const } },
              { last_name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          },
        };
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.patient_profiles.findMany({
        where,
        select: this.patientSelect,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.patient_profiles.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByUserId(userId: bigint) {
    // Use upsert so users whose profile was never created (e.g. due to transaction
    // timeout during signup) get a profile auto-created on first access.
    return this.prisma.patient_profiles.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
      select: this.patientSelect,
    });
  }

  async findById(id: bigint) {
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { id },
      select: this.patientSelect,
    });

    if (!profile) throw new NotFoundException('Patient profile not found');
    return profile;
  }

  async update(id: bigint, dto: UpdatePatientProfileDto) {
    await this.findById(id);

    return this.prisma.patient_profiles.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
      select: this.patientSelect,
    });
  }

  async updateByUserId(userId: bigint, dto: UpdatePatientProfileDto) {
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { user_id: userId },
    });

    if (!profile) throw new NotFoundException('Patient profile not found');

    return this.prisma.patient_profiles.update({
      where: { user_id: userId },
      data: { ...dto, updated_at: new Date() },
      select: this.patientSelect,
    });
  }
}
