import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { RolesService } from '../roles/roles.service';
import { newPasswordSetup } from '../common/password-setup';
import { ADMIN_ROLE_KEY, PATIENT_ROLE_KEY } from '../catalog/permissions';
import { UpdateAccountDto } from './dto/account.dto';

/** Accounts the platform manages: every user of every clinic (never platform admins). */
const NOT_PLATFORM = { role: { not: 'superadmin' } };

const accountSelect = {
  id: true,
  organization_id: true,
  email: true,
  first_name: true,
  last_name: true,
  phone: true,
  role: true,
  is_active: true,
  must_set_password: true,
  password_setup_expires_at: true,
  branch_id: true,
  restrict_to_branch: true,
  created_at: true,
  organization: { select: { id: true, name: true, slug: true } },
  branch: { select: { id: true, name: true } },
} as const;

export interface AccountFilters {
  organizationId?: bigint;
  /** "staff" = everyone but patients, "patients", or all. */
  kind?: 'staff' | 'patients' | 'all';
  role?: string;
  active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Clinic accounts seen and edited from the platform. The rules are the clinic
 * app's own (UsersService.updateAssignment there), plus one the platform must
 * guard because it can see the whole clinic: a clinic always keeps at least
 * one active administrator.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async list(filters: AccountFilters) {
    const { page = 1, limit = 25 } = filters;
    const where = {
      ...NOT_PLATFORM,
      organization_id: filters.organizationId ?? { not: null },
      ...(filters.kind === 'staff' ? { role: { notIn: [PATIENT_ROLE_KEY, 'superadmin'] } } : {}),
      ...(filters.kind === 'patients' ? { role: PATIENT_ROLE_KEY } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.active !== undefined ? { is_active: filters.active } : {}),
      ...(filters.search ? { OR: searchClauses(filters.search) } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        select: accountSelect,
        orderBy: [{ organization_id: 'asc' }, { role: 'asc' }, { last_name: 'asc' }, { first_name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.users.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getOne(organizationId: bigint, userId: bigint) {
    const user = await this.prisma.users.findFirst({
      where: { id: userId, organization_id: organizationId, ...NOT_PLATFORM },
      select: accountSelect,
    });
    if (!user) throw new NotFoundException('Account not found in this clinic');
    return user;
  }

  async update(organizationId: bigint, userId: bigint, dto: UpdateAccountDto, actorId: bigint) {
    const current = await this.getOne(organizationId, userId);
    const isPatient = current.role === PATIENT_ROLE_KEY;

    if (
      isPatient &&
      (dto.role !== undefined || dto.branch_id !== undefined || dto.restrict_to_branch !== undefined)
    ) {
      throw new BadRequestException('Patients have no role or branch assignment');
    }
    if (dto.email !== undefined && dto.email.toLowerCase() !== current.email) {
      await this.assertEmailFree(dto.email);
    }

    const role = dto.role ?? current.role;
    if (dto.role !== undefined && !(await this.roles.isAssignableStaffRole(organizationId, dto.role))) {
      throw new BadRequestException(`"${dto.role}" is not a staff role of this clinic (see its roles)`);
    }

    const branchId =
      dto.branch_id === undefined ? current.branch_id : dto.branch_id === null ? null : BigInt(dto.branch_id);
    if (branchId !== null && branchId !== current.branch_id) {
      const branch = await this.prisma.branches.findFirst({
        where: { id: branchId, organization_id: organizationId, is_active: true },
        select: { id: true },
      });
      if (!branch) throw new NotFoundException('Branch not found in this clinic');
    }

    const restrict = dto.restrict_to_branch ?? current.restrict_to_branch;
    if (restrict && branchId === null) {
      throw new BadRequestException('A home branch is required to restrict the account to it');
    }
    if (restrict && role === ADMIN_ROLE_KEY) {
      throw new BadRequestException('Clinic administrators cannot be restricted to a branch');
    }

    const losesAdmin =
      current.role === ADMIN_ROLE_KEY &&
      current.is_active &&
      (role !== ADMIN_ROLE_KEY || dto.is_active === false);
    if (losesAdmin) await this.assertAnotherActiveAdmin(organizationId, userId);

    // Update the scalars, then re-read with relations: Prisma 7 with the pg
    // adapter fails an update that selects relations in one go.
    await this.prisma.users.update({
      where: { id: userId },
      data: {
        ...(dto.first_name !== undefined ? { first_name: dto.first_name.trim() } : {}),
        ...(dto.last_name !== undefined ? { last_name: dto.last_name.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.toLowerCase() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(isPatient ? {} : { role, branch_id: branchId, restrict_to_branch: restrict }),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        updated_at: new Date(),
      },
      select: { id: true },
    });
    const updated = await this.getOne(organizationId, userId);

    await this.audit.record({
      organizationId,
      actorId,
      action: 'platform.account.update',
      table: 'users',
      recordId: userId,
      before: pick(current),
      after: pick(updated),
    });
    return updated;
  }

  /**
   * Issue a fresh "set your password" link (also how a forgotten password is
   * reset: the old password stops working once the link is used). Emailed when
   * SMTP is configured; always returned so the operator can pass it on.
   */
  async sendPasswordReset(organizationId: bigint, userId: bigint, actorId: bigint) {
    const user = await this.getOne(organizationId, userId);
    const setup = newPasswordSetup();
    await this.prisma.users.update({
      where: { id: userId },
      data: {
        must_set_password: true,
        password_setup_token_hash: setup.tokenHash,
        password_setup_expires_at: setup.expiresAt,
        password_setup_sent_at: new Date(),
        updated_at: new Date(),
      },
    });

    const emailed = user.email
      ? await this.mail.send({
          to: user.email,
          subject: `${user.organization?.name ?? 'Your clinic'}: set your password`,
          text: [
            `Hello ${user.first_name},`,
            '',
            `A new password link was issued for your ${user.organization?.name ?? 'clinic'} account.`,
            `Open it to choose a password (valid until ${setup.expiresAt.toISOString()}):`,
            setup.link,
            '',
            'If you did not expect this, you can ignore it; the old password keeps working until the link is used.',
          ].join('\n'),
        })
      : false;

    await this.audit.record({
      organizationId,
      actorId,
      action: 'platform.account.password_reset',
      table: 'users',
      recordId: userId,
      after: { emailed, expires_at: setup.expiresAt },
    });
    return { user: pick(user), invite: { link: setup.link, expires_at: setup.expiresAt }, emailed };
  }

  private async assertEmailFree(email: string): Promise<void> {
    const taken = await this.prisma.users.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (taken) throw new ConflictException(`A user with the email ${email.toLowerCase()} already exists`);
  }

  private async assertAnotherActiveAdmin(organizationId: bigint, exceptUserId: bigint): Promise<void> {
    const others = await this.prisma.users.count({
      where: {
        organization_id: organizationId,
        role: ADMIN_ROLE_KEY,
        is_active: true,
        NOT: { id: exceptUserId },
      },
    });
    if (others === 0) {
      throw new BadRequestException('A clinic must keep at least one active administrator');
    }
  }
}

function searchClauses(search: string) {
  const q = search.trim();
  const mode = 'insensitive' as const;
  return [
    { first_name: { contains: q, mode } },
    { last_name: { contains: q, mode } },
    { email: { contains: q, mode } },
    { phone: { contains: q, mode } },
  ];
}

/** The fields worth keeping in the audit trail. */
function pick(u: {
  email: string | null;
  first_name: string;
  last_name: string;
  phone?: string | null;
  role: string;
  is_active: boolean;
  branch_id: bigint | null;
  restrict_to_branch: boolean;
}) {
  return {
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    phone: u.phone ?? null,
    role: u.role,
    is_active: u.is_active,
    branch_id: u.branch_id,
    restrict_to_branch: u.restrict_to_branch,
  };
}
