import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';
import { StaffAssignmentDto } from './dto/staff-assignment.dto';
import { requireOrganizationId, runAsSystem } from '../tenant/tenant-context';
import { UserAccessService } from '../tenant/user-access.service';
import {
  ORG_ADMIN_ROLES,
  STAFF_ROLES,
} from '../common/decorators/roles.decorator';
import { uploadLimit, formatMb } from '../common/uploads/upload-limit';

const PROFILE_BUCKET = 'profile-photos';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = uploadLimit(5 * 1024 * 1024);

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
    private readonly userAccess: UserAccessService,
  ) {}

  async create(data: {
    email: string;
    first_name: string;
    last_name: string;
    phone?: string;
    role?: string;
    /** Home branch for staff; omitted = works across all branches. */
    branch_id?: number | string | null;
    /** Confine the account to its home branch (non-admin staff only). */
    restrict_to_branch?: boolean;
  }) {
    // Accounts always belong to the request's organization.
    const organization_id = requireOrganizationId();

    // Email is optional for clinic-created patients, so only look up when present.
    // Emails are unique across all tenants, so the lookup must see every tenant.
    const existing = data.email
      ? await runAsSystem(() =>
          this.prisma.users.findUnique({ where: { email: data.email } }),
        )
      : null;
    if (existing) return existing;

    const password_hash = await bcrypt.hash(Math.random().toString(36), 10);

    const user = await this.prisma.users.create({
      data: {
        organization_id,
        branch_id: data.branch_id ? BigInt(data.branch_id) : null,
        restrict_to_branch: Boolean(data.restrict_to_branch && data.branch_id),
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone || null,
        role: (data.role as any) || 'patient',
        password_hash,
        is_active: true,
      },
    });

    if (user.role === 'patient') {
      await this.prisma.patient_profiles.create({
        data: { user_id: user.id, organization_id },
      });
    }

    return user;
  }

  async findById(id: bigint) {
    const user = await this.prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        date_of_birth: true,
        gender: true,
        address: true,
        role: true,
        avatar_url: true,
        is_active: true,
        organization_id: true,
        branch_id: true,
        restrict_to_branch: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string) {
    // Public endpoint used by the admin UI before it has a token, so it carries
    // no tenant. Emails are globally unique; expose only identity fields.
    const user = await runAsSystem(() =>
      this.prisma.users.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          role: true,
          first_name: true,
          last_name: true,
          organization_id: true,
        },
      }),
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll(role?: string) {
    return this.prisma.users.findMany({
      where: role ? { role } : undefined,
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        role: true,
        is_active: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /** Active staff of the organization; shown publicly on the booking page. */
  async findStaff() {
    return this.prisma.users.findMany({
      where: { role: { in: STAFF_ROLES }, is_active: true },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        role: true,
        is_active: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async remove(id: bigint) {
    await this.findById(id);
    await this.prisma.users.delete({ where: { id } });
    this.userAccess.invalidate(id);
    return { message: 'User deleted successfully' };
  }

  /**
   * Admin changes to how a staff account may work. Takes effect for the user's
   * next request (the access cache is dropped), not when their token expires.
   */
  async updateAssignment(id: bigint, dto: StaffAssignmentDto) {
    const user = await this.findById(id);
    if (user.role === 'patient') {
      throw new BadRequestException('Patients have no staff assignment');
    }

    const role = dto.role ?? user.role;
    const branch_id =
      dto.branch_id === undefined
        ? user.branch_id
        : dto.branch_id === null
          ? null
          : BigInt(dto.branch_id);
    if (branch_id !== null) {
      // RLS only shows branches of the caller's organization.
      const branch = await this.prisma.branches.findFirst({
        where: { id: branch_id, is_active: true },
      });
      if (!branch)
        throw new NotFoundException('Branch not found in this organization');
    }

    const restrict_to_branch =
      dto.restrict_to_branch ?? user.restrict_to_branch;
    if (restrict_to_branch && branch_id === null) {
      throw new BadRequestException(
        'A home branch is required to restrict the account to it',
      );
    }
    if (restrict_to_branch && ORG_ADMIN_ROLES.includes(role)) {
      throw new BadRequestException(
        'Organization admins cannot be restricted to a branch',
      );
    }

    const updated = await this.prisma.users.update({
      where: { id },
      data: {
        role,
        branch_id,
        restrict_to_branch,
        ...(dto.is_active === undefined ? {} : { is_active: dto.is_active }),
        updated_at: new Date(),
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        is_active: true,
        branch_id: true,
        restrict_to_branch: true,
        branch: { select: { id: true, name: true } },
      },
    });
    this.userAccess.invalidate(id);
    return updated;
  }

  async update(id: bigint, dto: UpdateUserDto) {
    await this.findById(id);

    return this.prisma.users.update({
      where: { id },
      data: {
        ...dto,
        date_of_birth: dto.date_of_birth
          ? new Date(dto.date_of_birth)
          : undefined,
        updated_at: new Date(),
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        date_of_birth: true,
        gender: true,
        address: true,
        role: true,
        updated_at: true,
      },
    });
  }

  async updateAvatar(id: bigint, file: Express.Multer.File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPEG, PNG, and WebP images are allowed',
      );
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException(
        `Image must be under ${formatMb(MAX_SIZE)}`,
      );
    }

    const user = await this.prisma.users.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // Delete old avatar if one exists
    if (user.avatar_url) {
      const oldPath = this.extractPath(user.avatar_url);
      if (oldPath)
        await this.storage.delete(PROFILE_BUCKET, oldPath).catch(() => null);
    }

    const ext = file.mimetype.split('/')[1];
    const storagePath = `users/${id}/${Date.now()}.${ext}`;
    const publicUrl = await this.storage.upload(
      PROFILE_BUCKET,
      storagePath,
      file.buffer,
      file.mimetype,
    );

    return this.prisma.users.update({
      where: { id },
      data: { avatar_url: publicUrl, updated_at: new Date() },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        avatar_url: true,
        updated_at: true,
      },
    });
  }

  async changePassword(id: bigint, dto: ChangePasswordDto) {
    const user = await this.prisma.users.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.old_password, user.password_hash);
    if (!valid) throw new BadRequestException('Old password is incorrect');

    const password_hash = await bcrypt.hash(dto.new_password, 10);

    await this.prisma.users.update({
      where: { id },
      data: { password_hash, updated_at: new Date() },
    });

    return { message: 'Password updated successfully' };
  }

  private extractPath(publicUrl: string): string | null {
    try {
      const url = new URL(publicUrl);
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
