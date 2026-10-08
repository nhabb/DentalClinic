import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newPasswordSetup, unusablePasswordHash } from '../common/password-setup';
import {
  CreateBranchDto,
  CreateOrganizationDto,
  CreateStaffDto,
  UpdateBranchDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';

const STAFF_ROLES = ['doctor', 'secretary', 'admin'];

/** One row of the clinics table: the organization plus the numbers an operator watches. */
export interface OrganizationSummary {
  id: bigint;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: Date;
  branches: number;
  staff: number;
  patients: number;
  appointments: number;
  revenue_collected: number;
  last_activity_at: Date | null;
}

/**
 * Clinics (organizations) as seen by the operator. Reads span every tenant;
 * writes always set organization_id explicitly because this connection has no
 * request tenant to default from.
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<OrganizationSummary[]> {
    const [orgs, revenue, activity, staff] = await Promise.all([
      this.prisma.organizations.findMany({
        orderBy: { created_at: 'asc' },
        include: { _count: { select: { branches: true, patient_profiles: true, appointments: true } } },
      }),
      this.prisma.invoice_payments.groupBy({ by: ['organization_id'], _sum: { amount: true } }),
      this.prisma.appointments.groupBy({ by: ['organization_id'], _max: { created_at: true } }),
      this.prisma.users.groupBy({
        by: ['organization_id'],
        where: { role: { in: STAFF_ROLES }, is_active: true },
        _count: { _all: true },
      }),
    ]);

    const byOrg = <T extends { organization_id: bigint | null }>(rows: T[]) =>
      new Map(rows.map((r) => [r.organization_id?.toString(), r]));
    const revenueByOrg = byOrg(revenue);
    const activityByOrg = byOrg(activity);
    const staffByOrg = byOrg(staff);

    return orgs.map((org) => {
      const key = org.id.toString();
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        is_active: org.is_active,
        created_at: org.created_at,
        branches: org._count.branches,
        staff: staffByOrg.get(key)?._count._all ?? 0,
        patients: org._count.patient_profiles,
        appointments: org._count.appointments,
        revenue_collected: Number(revenueByOrg.get(key)?._sum.amount ?? 0),
        last_activity_at: activityByOrg.get(key)?._max.created_at ?? null,
      };
    });
  }

  async getOne(id: bigint) {
    const org = await this.prisma.organizations.findUnique({
      where: { id },
      include: {
        branches: { orderBy: [{ is_default: 'desc' }, { name: 'asc' }] },
        _count: { select: { patient_profiles: true, appointments: true, treatment_invoices: true } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const [staff, revenue, outstanding, monthly] = await Promise.all([
      this.prisma.users.findMany({
        where: { organization_id: id, role: { in: STAFF_ROLES } },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          role: true,
          is_active: true,
          must_set_password: true,
          branch_id: true,
          restrict_to_branch: true,
          created_at: true,
        },
        orderBy: [{ role: 'asc' }, { created_at: 'asc' }],
      }),
      this.prisma.invoice_payments.aggregate({ where: { organization_id: id }, _sum: { amount: true } }),
      this.prisma.treatment_invoices.aggregate({
        where: { organization_id: id, status: { in: ['open', 'partial'] } },
        _sum: { remaining_amount: true },
      }),
      this.monthlyActivity(id),
    ]);

    return {
      ...org,
      staff,
      stats: {
        patients: org._count.patient_profiles,
        appointments: org._count.appointments,
        invoices: org._count.treatment_invoices,
        revenue_collected: Number(revenue._sum.amount ?? 0),
        outstanding: Number(outstanding._sum.remaining_amount ?? 0),
      },
      monthly,
    };
  }

  /** Last six months of appointments and collected payments for one clinic. */
  private async monthlyActivity(organizationId: bigint) {
    const rows = await this.prisma.$queryRaw<{ month: Date; appointments: number; collected: number }[]>`
      WITH months AS (
        SELECT date_trunc('month', now()) - (interval '1 month' * g) AS month
        FROM generate_series(0, 5) AS g
      )
      SELECT m.month,
             (SELECT count(*)::int FROM appointments a
               WHERE a.organization_id = ${organizationId} AND date_trunc('month', a.created_at) = m.month) AS appointments,
             (SELECT coalesce(sum(p.amount), 0)::float FROM invoice_payments p
               WHERE p.organization_id = ${organizationId} AND date_trunc('month', p.created_at) = m.month) AS collected
      FROM months m
      ORDER BY m.month`;
    return rows.map((r) => ({
      month: r.month.toISOString().slice(0, 7),
      appointments: r.appointments,
      collected: r.collected,
    }));
  }

  /**
   * Onboard a clinic: organization + default branch + public clinic profile +
   * (optionally) its first admin, who gets a link to set a password in the
   * clinic app. The link is returned so the operator can also hand it over
   * directly.
   */
  async create(dto: CreateOrganizationDto) {
    const { default_branch, owner, ...profile } = dto;
    const slug = dto.slug.toLowerCase();

    if (await this.prisma.organizations.findUnique({ where: { slug } })) {
      throw new ConflictException(`The slug "${slug}" is already taken`);
    }
    if (owner) await this.assertEmailFree(owner.email);

    const setup = owner ? newPasswordSetup() : null;
    const passwordHash = owner ? await unusablePasswordHash() : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organizations.create({ data: { ...profile, slug } });
      const branch = await tx.branches.create({
        data: { ...(default_branch ?? { name: 'Main Branch' }), organization_id: org.id, is_default: true },
      });
      await tx.clinic_profile.create({
        data: {
          organization_id: org.id,
          name: org.name,
          email: org.email,
          phone: org.phone,
          website_url: org.website_url,
          description: org.description,
          address: branch.address,
          opening_hours: branch.opening_hours,
        },
      });
      const ownerUser = owner
        ? await tx.users.create({
            data: {
              organization_id: org.id,
              branch_id: branch.id,
              email: owner.email.toLowerCase(),
              first_name: owner.first_name.trim(),
              last_name: owner.last_name.trim(),
              phone: owner.phone ?? null,
              role: 'admin',
              password_hash: passwordHash!,
              must_set_password: true,
              password_setup_token_hash: setup!.tokenHash,
              password_setup_expires_at: setup!.expiresAt,
              password_setup_sent_at: new Date(),
            },
            select: { id: true, email: true, first_name: true, last_name: true, role: true },
          })
        : null;
      return { org, branch, ownerUser };
    });

    return {
      ...created.org,
      branches: [created.branch],
      owner: created.ownerUser,
      invite: setup ? { link: setup.link, expires_at: setup.expiresAt } : null,
    };
  }

  async update(id: bigint, dto: UpdateOrganizationDto) {
    await this.requireOrganization(id);
    return this.prisma.organizations.update({ where: { id }, data: { ...dto, updated_at: new Date() } });
  }

  async setActive(id: bigint, isActive: boolean) {
    await this.requireOrganization(id);
    return this.prisma.organizations.update({
      where: { id },
      data: { is_active: isActive, updated_at: new Date() },
    });
  }

  /** Add a staff account to a clinic; returns the password setup link. */
  async createStaff(organizationId: bigint, dto: CreateStaffDto) {
    await this.requireOrganization(organizationId);
    await this.assertEmailFree(dto.email);
    const branch = await this.prisma.branches.findFirst({
      where: { organization_id: organizationId, is_default: true },
      select: { id: true },
    });
    const setup = newPasswordSetup();
    const user = await this.prisma.users.create({
      data: {
        organization_id: organizationId,
        branch_id: branch?.id ?? null,
        email: dto.email.toLowerCase(),
        first_name: dto.first_name.trim(),
        last_name: dto.last_name.trim(),
        phone: dto.phone ?? null,
        role: dto.role ?? 'admin',
        password_hash: await unusablePasswordHash(),
        must_set_password: true,
        password_setup_token_hash: setup.tokenHash,
        password_setup_expires_at: setup.expiresAt,
        password_setup_sent_at: new Date(),
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        must_set_password: true,
      },
    });
    return { ...user, invite: { link: setup.link, expires_at: setup.expiresAt } };
  }

  /** Issue a fresh password setup link for a clinic user (lost invite, locked out owner). */
  async resendInvite(organizationId: bigint, userId: bigint) {
    const user = await this.prisma.users.findFirst({
      where: { id: userId, organization_id: organizationId },
      select: { id: true, email: true, first_name: true },
    });
    if (!user) throw new NotFoundException('User not found in this organization');
    const setup = newPasswordSetup();
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        must_set_password: true,
        password_setup_token_hash: setup.tokenHash,
        password_setup_expires_at: setup.expiresAt,
        password_setup_sent_at: new Date(),
        updated_at: new Date(),
      },
    });
    return { user, invite: { link: setup.link, expires_at: setup.expiresAt } };
  }

  // ── Branches ─────────────────────────────────────────────────────────────────

  /** Open a branch for a clinic; the first branch, or one flagged default, becomes the default. */
  async createBranch(organizationId: bigint, dto: CreateBranchDto) {
    await this.requireOrganization(organizationId);
    const existing = await this.prisma.branches.count({ where: { organization_id: organizationId } });
    const makeDefault = dto.is_default === true || existing === 0;
    const { is_default: _ignored, ...data } = dto;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (makeDefault) await this.clearDefault(tx, organizationId);
        return tx.branches.create({
          data: { ...data, organization_id: organizationId, is_default: makeDefault },
        });
      });
    } catch (err) {
      throw this.branchNameConflict(err, dto.name);
    }
  }

  async updateBranch(organizationId: bigint, branchId: bigint, dto: UpdateBranchDto) {
    const branch = await this.requireBranch(organizationId, branchId);
    if (dto.is_active === false && branch.is_default) {
      throw new BadRequestException('Make another branch the default before deactivating this one');
    }
    try {
      return await this.prisma.branches.update({
        where: { id: branchId },
        data: { ...dto, updated_at: new Date() },
      });
    } catch (err) {
      throw this.branchNameConflict(err, dto.name ?? branch.name);
    }
  }

  /** New slots, stock and invoices without an explicit branch land on the default one. */
  async setDefaultBranch(organizationId: bigint, branchId: bigint) {
    const branch = await this.requireBranch(organizationId, branchId);
    if (!branch.is_active) throw new BadRequestException('An inactive branch cannot be the default');
    return this.prisma.$transaction(async (tx) => {
      await this.clearDefault(tx, organizationId);
      return tx.branches.update({
        where: { id: branchId },
        data: { is_default: true, updated_at: new Date() },
      });
    });
  }

  private clearDefault(
    tx: { branches: { updateMany: PrismaService['branches']['updateMany'] } },
    organizationId: bigint,
  ) {
    return tx.branches.updateMany({
      where: { organization_id: organizationId, is_default: true },
      data: { is_default: false, updated_at: new Date() },
    });
  }

  private async requireBranch(organizationId: bigint, branchId: bigint) {
    const branch = await this.prisma.branches.findFirst({
      where: { id: branchId, organization_id: organizationId },
    });
    if (!branch) throw new NotFoundException('Branch not found in this organization');
    return branch;
  }

  /** Branch names are unique per organization (database constraint). */
  private branchNameConflict(err: unknown, name: string): unknown {
    return (err as { code?: string })?.code === 'P2002'
      ? new ConflictException(`This clinic already has a branch named "${name}"`)
      : err;
  }

  private async requireOrganization(id: bigint) {
    const org = await this.prisma.organizations.findUnique({ where: { id }, select: { id: true } });
    if (!org) throw new NotFoundException('Organization not found');
  }

  private async assertEmailFree(email: string) {
    const taken = await this.prisma.users.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (taken) throw new ConflictException(`A user with the email ${email} already exists`);
  }
}
