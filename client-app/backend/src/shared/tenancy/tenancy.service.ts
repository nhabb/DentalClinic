import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AccountSetupService } from '../account-setup/account-setup.service';
import { TenantResolverService } from '../tenant/tenant-resolver.service';
import { UserAccessService } from '../tenant/user-access.service';
import { requireOrganizationId, runAsSystem } from '../tenant/tenant-context';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

const branchOrder = [{ is_default: 'desc' as const }, { name: 'asc' as const }];

/**
 * Organizations (tenants) and their branches.
 *
 * Everything here runs under the caller's tenant context, so a clinic admin can
 * only ever see and change their own organization and branches: RLS filters the
 * rows, this service only adds the business rules (one default branch, no
 * deleting a branch that still has data, ...).
 */
@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountSetup: AccountSetupService,
    private readonly resolver: TenantResolverService,
    private readonly userAccess: UserAccessService,
  ) {}

  // ── Current organization ────────────────────────────────────────────────────

  async getCurrentOrganization() {
    const id = requireOrganizationId();
    const org = await this.prisma.organizations.findFirst({
      where: { id },
      include: { branches: { orderBy: branchOrder } },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateCurrentOrganization(dto: UpdateOrganizationDto) {
    const id = requireOrganizationId();
    const updated = await this.prisma.organizations.update({
      where: { id },
      data: { ...dto, settings: dto.settings as any, updated_at: new Date() },
      include: { branches: { orderBy: branchOrder } },
    });
    this.resolver.invalidate();
    return updated;
  }

  // ── Branches of the current organization ───────────────────────────────────

  listBranches(includeInactive = false) {
    return this.prisma.branches.findMany({
      where: includeInactive ? undefined : { is_active: true },
      orderBy: branchOrder,
    });
  }

  async getBranch(id: bigint) {
    const branch = await this.prisma.branches.findFirst({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async createBranch(dto: CreateBranchDto) {
    const organization_id = requireOrganizationId();
    const existingCount = await this.prisma.branches.count();
    // The first branch of an organization is always its default.
    const makeDefault = dto.is_default === true || existingCount === 0;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (makeDefault) {
          await tx.branches.updateMany({
            where: { is_default: true },
            data: { is_default: false, updated_at: new Date() },
          });
        }
        return tx.branches.create({
          data: { ...dto, organization_id, is_default: makeDefault },
        });
      });
    } catch (err: any) {
      if (err?.code === 'P2002')
        throw new ConflictException('A branch with this name already exists');
      throw err;
    }
  }

  async updateBranch(id: bigint, dto: UpdateBranchDto) {
    const branch = await this.getBranch(id);
    if (dto.is_active === false && branch.is_default) {
      throw new BadRequestException(
        'Make another branch the default before deactivating this one',
      );
    }
    try {
      return await this.prisma.branches.update({
        where: { id },
        data: { ...dto, updated_at: new Date() },
      });
    } catch (err: any) {
      if (err?.code === 'P2002')
        throw new ConflictException('A branch with this name already exists');
      throw err;
    }
  }

  async setDefaultBranch(id: bigint) {
    const branch = await this.getBranch(id);
    if (!branch.is_active)
      throw new BadRequestException('An inactive branch cannot be the default');
    return this.prisma.$transaction(async (tx) => {
      await tx.branches.updateMany({
        where: { is_default: true },
        data: { is_default: false, updated_at: new Date() },
      });
      return tx.branches.update({
        where: { id },
        data: { is_default: true, updated_at: new Date() },
      });
    });
  }

  async removeBranch(id: bigint) {
    const branch = await this.getBranch(id);
    if (branch.is_default) {
      throw new BadRequestException(
        'The default branch cannot be deleted; make another branch the default first',
      );
    }
    try {
      await this.prisma.branches.delete({ where: { id } });
    } catch (err: any) {
      // Slots, appointments and stock reference the branch with ON DELETE RESTRICT.
      if (err?.code === 'P2003') {
        throw new ConflictException(
          'This branch still has appointments, slots or inventory. Deactivate it instead of deleting it.',
        );
      }
      throw err;
    }
    return { message: 'Branch deleted' };
  }

  // ── Platform level (superadmin) ─────────────────────────────────────────────

  listOrganizations() {
    return runAsSystem(() =>
      this.prisma.organizations.findMany({
        include: {
          branches: { orderBy: branchOrder },
          _count: { select: { users: true, patient_profiles: true } },
        },
        orderBy: { created_at: 'asc' },
      }),
    );
  }

  async getOrganization(id: bigint) {
    const org = await runAsSystem(() =>
      this.prisma.organizations.findUnique({
        where: { id },
        include: {
          branches: { orderBy: branchOrder },
          _count: { select: { users: true, patient_profiles: true } },
        },
      }),
    );
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /**
   * Create a tenant with its default branch and, optionally, its first admin.
   * Runs with RLS bypassed and sets organization_id explicitly on every row
   * because the new organization is not the caller's tenant.
   */
  async createOrganization(dto: CreateOrganizationDto) {
    const { default_branch, owner, ...orgData } = dto;
    const slug = dto.slug.toLowerCase();

    if (owner?.email) {
      const taken = await runAsSystem(() =>
        this.prisma.users.findUnique({
          where: { email: owner.email.toLowerCase() },
          select: { id: true },
        }),
      );
      if (taken)
        throw new ConflictException(
          'A user with the owner email already exists',
        );
    }

    const created = await runAsSystem(() =>
      this.prisma.$transaction(async (tx) => {
        let org;
        try {
          org = await tx.organizations.create({
            data: { ...orgData, slug, settings: (dto.settings ?? {}) as any },
          });
        } catch (err: any) {
          if (err?.code === 'P2002')
            throw new ConflictException(
              'An organization with this slug already exists',
            );
          throw err;
        }

        const branch = await tx.branches.create({
          data: {
            ...(default_branch ?? { name: 'Main Branch' }),
            organization_id: org.id,
            is_default: true,
          },
        });

        let ownerUser: {
          id: bigint;
          email: string | null;
          first_name: string;
        } | null = null;
        if (owner) {
          ownerUser = await tx.users.create({
            data: {
              organization_id: org.id,
              branch_id: branch.id,
              email: owner.email.toLowerCase(),
              first_name: owner.first_name.trim(),
              last_name: owner.last_name.trim(),
              phone: owner.phone ?? null,
              role: owner.role ?? 'admin',
              password_hash: await bcrypt.hash(
                randomBytes(24).toString('hex'),
                10,
              ),
              must_set_password: true,
            },
            select: { id: true, email: true, first_name: true },
          });
        }
        return { org, branch, ownerUser };
      }),
    );

    this.resolver.invalidate();

    const invite = created.ownerUser
      ? await runAsSystem(() =>
          this.accountSetup.issueAndSend({
            id: created.ownerUser!.id,
            email: created.ownerUser!.email,
            first_name: created.ownerUser!.first_name,
          }),
        )
      : null;

    return {
      ...created.org,
      branches: [created.branch],
      owner: created.ownerUser,
      invite,
    };
  }

  async setOrganizationActive(id: bigint, isActive: boolean) {
    await this.getOrganization(id);
    const org = await runAsSystem(() =>
      this.prisma.organizations.update({
        where: { id },
        data: { is_active: isActive, updated_at: new Date() },
      }),
    );
    this.resolver.invalidate();
    // Members of a deactivated clinic are locked out on their next request.
    this.userAccess.invalidate();
    return org;
  }
}
