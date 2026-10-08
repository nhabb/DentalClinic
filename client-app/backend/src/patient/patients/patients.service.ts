import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SupabaseStorageService } from '../../shared/storage/supabase-storage.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { AccountSetupService } from '../../shared/account-setup/account-setup.service';
import {
  requireOrganizationId,
  runAsSystem,
} from '../../shared/tenant/tenant-context';
import { UserAccessService } from '../../shared/tenant/user-access.service';

const PROFILE_BUCKET = 'profile-photos';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
    private readonly accountSetup: AccountSetupService,
    private readonly userAccess: UserAccessService,
  ) {}

  /**
   * Admin-side creation. Creates the user row and its patient profile in one
   * nested write. The account starts with an unusable random password and
   * `must_set_password = true`. If an email was given, a one-time password
   * setup link is emailed to the patient (and returned to staff as `invite`).
   */
  async create(dto: CreatePatientDto) {
    const clean = (v?: string) => (v && v.trim() ? v.trim() : null);
    const email = dto.email ? dto.email.trim().toLowerCase() : null;
    const phone = clean(dto.phone);

    if (!email && !phone) {
      throw new BadRequestException(
        'Provide an email address or a phone number for the patient',
      );
    }
    const organization_id = requireOrganizationId();
    if (email) {
      // Emails are unique across all tenants, so look globally for a clear error.
      const existing = await runAsSystem(() =>
        this.prisma.users.findUnique({ where: { email } }),
      );
      if (existing) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    const password_hash = await bcrypt.hash(
      randomBytes(24).toString('hex'),
      10,
    );

    let user: {
      id: bigint;
      first_name: string;
      patient_profiles: { id: bigint } | null;
    };
    try {
      user = await this.prisma.users.create({
        data: {
          organization_id,
          email,
          first_name: dto.first_name.trim(),
          last_name: dto.last_name.trim(),
          phone,
          date_of_birth: dto.date_of_birth
            ? new Date(`${dto.date_of_birth.split('T')[0]}T12:00:00.000Z`)
            : null,
          gender: dto.gender ?? null,
          address: clean(dto.address),
          role: 'patient',
          password_hash,
          is_active: true,
          must_set_password: true,
          patient_profiles: {
            create: {
              organization_id,
              blood_type: dto.blood_type ?? null,
              allergies: clean(dto.allergies),
              insurance_provider: clean(dto.insurance_provider),
              medical_notes: clean(dto.medical_notes),
            },
          },
        },
        select: {
          id: true,
          first_name: true,
          patient_profiles: { select: { id: true } },
        },
      });
    } catch (err: any) {
      // Unique violation if two requests race on the same email.
      if (err?.code === 'P2002') {
        throw new ConflictException('A user with this email already exists');
      }
      throw err;
    }

    const profile = await this.findById(user.patient_profiles!.id);
    const invite = email
      ? await this.accountSetup.issueAndSend({
          id: user.id,
          email,
          first_name: user.first_name,
        })
      : null;
    return { ...profile, invite };
  }

  /**
   * (Re)send the password setup link to a patient. Also works as a staff-triggered
   * password reset for patients who already have a password.
   */
  async sendInvite(profileId: bigint) {
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { id: profileId },
      select: {
        users: {
          select: { id: true, email: true, first_name: true, is_active: true },
        },
      },
    });
    if (!profile) throw new NotFoundException('Patient profile not found');
    const user = profile.users;
    if (!user.email) {
      throw new BadRequestException(
        'This patient has no email address. Add one first, then send the link.',
      );
    }
    if (!user.is_active) {
      throw new BadRequestException('This patient account is inactive');
    }
    return this.accountSetup.issueAndSend({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
    });
  }

  private patientSelect = {
    id: true,
    user_id: true,
    photo_url: true,
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
        is_active: true,
        must_set_password: true,
        password_setup_sent_at: true,
        created_at: true,
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
                  {
                    first_name: {
                      contains: words[0],
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    last_name: {
                      contains: words.slice(1).join(' '),
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
              {
                AND: [
                  {
                    first_name: {
                      contains: words[words.length - 1],
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    last_name: {
                      contains: words.slice(0, -1).join(' '),
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
              ...words.map((w) => ({
                email: { contains: w, mode: 'insensitive' as const },
              })),
            ],
          },
        };
      } else {
        where = {
          users: {
            OR: [
              {
                first_name: { contains: search, mode: 'insensitive' as const },
              },
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
      create: { user_id: userId, organization_id: requireOrganizationId() },
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

  async updatePhoto(id: bigint, file: Express.Multer.File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPEG, PNG, and WebP images are allowed',
      );
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('Image must be under 5 MB');
    }

    const profile = await this.prisma.patient_profiles.findUnique({
      where: { id },
    });
    if (!profile) throw new NotFoundException('Patient profile not found');

    // Delete old photo if one exists
    if (profile.photo_url) {
      const oldPath = this.extractPath(profile.photo_url);
      if (oldPath)
        await this.storage.delete(PROFILE_BUCKET, oldPath).catch(() => null);
    }

    const ext = file.mimetype.split('/')[1];
    const storagePath = `patients/${id}/${Date.now()}.${ext}`;
    const publicUrl = await this.storage.upload(
      PROFILE_BUCKET,
      storagePath,
      file.buffer,
      file.mimetype,
    );

    return this.prisma.patient_profiles.update({
      where: { id },
      data: { photo_url: publicUrl, updated_at: new Date() },
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

  async setStatus(id: bigint, isActive: boolean) {
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { id },
    });
    if (!profile) throw new NotFoundException('Patient profile not found');
    await this.prisma.users.update({
      where: { id: profile.user_id },
      data: { is_active: isActive, updated_at: new Date() },
    });
    // A deactivated patient is locked out on their next request, not at token expiry.
    this.userAccess.invalidate(profile.user_id);
    return { id: Number(id), is_active: isActive };
  }

  async remove(id: bigint) {
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { id },
    });
    if (!profile) throw new NotFoundException('Patient profile not found');
    const userId = profile.user_id;

    // Nullify all nullable FKs that reference this user but have no onDelete cascade,
    // so the subsequent user deletion doesn't hit FK constraint violations.
    await this.prisma.$transaction([
      this.prisma.audit_logs.updateMany({
        where: { user_id: userId },
        data: { user_id: null },
      }),
      this.prisma.inventory_movements.updateMany({
        where: { performed_by: userId },
        data: { performed_by: null },
      }),
      this.prisma.appointments.updateMany({
        where: { created_by: userId },
        data: { created_by: null },
      }),
      this.prisma.patient_documents.updateMany({
        where: { uploaded_by: userId },
        data: { uploaded_by: null },
      }),
      this.prisma.patient_records.updateMany({
        where: { created_by: userId },
        data: { created_by: null },
      }),
      this.prisma.expenses.updateMany({
        where: { created_by: userId },
        data: { created_by: null },
      }),
      this.prisma.treatment_invoices.updateMany({
        where: { created_by: userId },
        data: { created_by: null },
      }),
      this.prisma.invoice_payments.updateMany({
        where: { created_by: userId },
        data: { created_by: null },
      }),
      // Delete the user — cascades to: patient_profiles → appointments, records, docs, invoices, payments
      this.prisma.users.delete({ where: { id: userId } }),
    ]);

    return { message: 'Patient deleted successfully' };
  }

  /** Extract the storage path from a full Supabase public URL */
  private extractPath(publicUrl: string): string | null {
    try {
      const url = new URL(publicUrl);
      // URL format: .../storage/v1/object/public/<bucket>/<path>
      const parts = url.pathname.split('/object/public/');
      if (parts.length < 2) return null;
      const withBucket = parts[1];
      const slashIdx = withBucket.indexOf('/');
      return slashIdx === -1 ? null : withBucket.slice(slashIdx + 1);
    } catch {
      return null;
    }
  }
}
