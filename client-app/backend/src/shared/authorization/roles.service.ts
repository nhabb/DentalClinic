import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireOrganizationId, runAsSystem } from '../tenant/tenant-context';
import {
  ADMIN_ROLE_KEY,
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  PATIENT_ROLE_KEY,
  isKnownPermission,
} from './permissions';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

const CACHE_TTL_MS = 60_000;
const ROLE_KEY_REGEX = /^[a-z][a-z0-9_-]{1,39}$/;

/** A role as the API returns it. */
export interface RoleView {
  id: bigint;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  /** Admin: permissions cannot be edited. Patient: role cannot be assigned to staff. */
  locked: boolean;
  permissions: string[];
  users_count: number;
}

/**
 * Per-clinic roles and the permissions they hold.
 *
 * Reads for authorization go through `permissionsFor()`, which is cached and
 * self-healing: a clinic that has no roles yet (created before this feature,
 * or onboarded from the console) gets the defaults the first time it is asked.
 * Everything else runs in the caller's tenant context and is RLS-scoped.
 */
@Injectable()
export class RolesService {
  private readonly cache = new Map<
    string,
    { permissions: string[]; expires: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  // ── Authorization lookups ────────────────────────────────────────────────────

  /** Permissions of a role key inside an organization (empty for unknown roles). */
  async permissionsFor(
    organizationId: bigint,
    roleKey: string,
  ): Promise<string[]> {
    if (roleKey === ADMIN_ROLE_KEY) return [...ALL_PERMISSIONS];
    if (roleKey === PATIENT_ROLE_KEY) return [];

    const cacheKey = `${organizationId}:${roleKey}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.permissions;

    const permissions = await runAsSystem(async () => {
      await this.ensureDefaults(organizationId);
      const role = await this.prisma.roles.findUnique({
        where: {
          organization_id_key: {
            organization_id: organizationId,
            key: roleKey,
          },
        },
        select: { role_permissions: { select: { permission: true } } },
      });
      return role ? role.role_permissions.map((p) => p.permission) : [];
    });
    this.cache.set(cacheKey, {
      permissions,
      expires: Date.now() + CACHE_TTL_MS,
    });
    return permissions;
  }

  /** Create the default roles a clinic is missing. Safe to call repeatedly. */
  async ensureDefaults(organizationId: bigint): Promise<void> {
    const existing = await this.prisma.roles.findMany({
      where: { organization_id: organizationId },
      select: { key: true },
    });
    const have = new Set(existing.map((r) => r.key));
    for (const role of DEFAULT_ROLES) {
      if (have.has(role.key)) continue;
      await this.prisma.roles.create({
        data: {
          organization_id: organizationId,
          key: role.key,
          name: role.name,
          description: role.description,
          is_system: true,
          role_permissions: {
            create: role.permissions.map((permission) => ({
              organization_id: organizationId,
              permission,
            })),
          },
        },
      });
    }
  }

  /** Drop cached permissions after a role changed. */
  invalidate(organizationId?: bigint): void {
    if (organizationId === undefined) {
      this.cache.clear();
      return;
    }
    const prefix = `${organizationId}:`;
    for (const key of this.cache.keys())
      if (key.startsWith(prefix)) this.cache.delete(key);
  }

  // ── Management (current organization) ───────────────────────────────────────

  async list(): Promise<RoleView[]> {
    const organizationId = requireOrganizationId();
    await this.ensureDefaults(organizationId);
    const [roles, counts] = await Promise.all([
      this.prisma.roles.findMany({
        where: { organization_id: organizationId },
        include: { role_permissions: { select: { permission: true } } },
        orderBy: [{ is_system: 'desc' }, { created_at: 'asc' }],
      }),
      this.prisma.users.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);
    const countByKey = new Map(counts.map((c) => [c.role, c._count._all]));
    return roles.map((r) => this.toView(r, countByKey.get(r.key) ?? 0));
  }

  async getByKey(key: string): Promise<RoleView> {
    const role = await this.prisma.roles.findUnique({
      where: {
        organization_id_key: { organization_id: requireOrganizationId(), key },
      },
      include: { role_permissions: { select: { permission: true } } },
    });
    if (!role) throw new NotFoundException(`Role "${key}" not found`);
    const users = await this.prisma.users.count({ where: { role: key } });
    return this.toView(role, users);
  }

  /** True when staff may be assigned this role key in the current organization. */
  async isAssignableStaffRole(key: string): Promise<boolean> {
    if (key === PATIENT_ROLE_KEY || key === 'superadmin') return false;
    const organizationId = requireOrganizationId();
    await this.ensureDefaults(organizationId);
    const role = await this.prisma.roles.findUnique({
      where: { organization_id_key: { organization_id: organizationId, key } },
      select: { id: true },
    });
    return role !== null;
  }

  async create(dto: CreateRoleDto): Promise<RoleView> {
    const organizationId = requireOrganizationId();
    const key = dto.key.trim().toLowerCase();
    if (!ROLE_KEY_REGEX.test(key)) {
      throw new BadRequestException(
        'key must be 2-40 lowercase letters, digits, dashes or underscores',
      );
    }
    const permissions = this.cleanPermissions(dto.permissions);
    try {
      const role = await this.prisma.roles.create({
        data: {
          organization_id: organizationId,
          key,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          is_system: false,
          role_permissions: {
            create: permissions.map((permission) => ({
              organization_id: organizationId,
              permission,
            })),
          },
        },
        include: { role_permissions: { select: { permission: true } } },
      });
      return this.toView(role, 0);
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          `A role with the key "${key}" already exists`,
        );
      }
      throw err;
    }
  }

  async update(key: string, dto: UpdateRoleDto): Promise<RoleView> {
    const organizationId = requireOrganizationId();
    const current = await this.getByKey(key);
    if (key === ADMIN_ROLE_KEY && dto.permissions !== undefined) {
      throw new BadRequestException(
        'The administrator role always has every permission',
      );
    }
    if (
      key === PATIENT_ROLE_KEY &&
      dto.permissions !== undefined &&
      dto.permissions.length > 0
    ) {
      throw new BadRequestException(
        'Patients are governed by ownership, not permissions',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.roles.update({
        where: { id: current.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          updated_at: new Date(),
        },
      });
      if (dto.permissions !== undefined) {
        const permissions = this.cleanPermissions(dto.permissions);
        await tx.role_permissions.deleteMany({
          where: { role_id: current.id },
        });
        if (permissions.length > 0) {
          await tx.role_permissions.createMany({
            data: permissions.map((permission) => ({
              role_id: current.id,
              organization_id: organizationId,
              permission,
            })),
          });
        }
      }
    });
    this.invalidate(organizationId);
    return this.getByKey(key);
  }

  /** Only custom roles that nobody holds can be deleted. */
  async remove(key: string): Promise<{ message: string }> {
    const role = await this.getByKey(key);
    if (role.is_system)
      throw new BadRequestException('Built-in roles cannot be deleted');
    if (role.users_count > 0) {
      throw new ConflictException(
        `${role.users_count} user(s) still have this role; reassign them first`,
      );
    }
    await this.prisma.roles.delete({ where: { id: role.id } });
    this.invalidate(requireOrganizationId());
    return { message: 'Role deleted' };
  }

  private cleanPermissions(permissions: string[]): string[] {
    const unknown = permissions.filter((p) => !isKnownPermission(p));
    if (unknown.length > 0)
      throw new BadRequestException(
        `Unknown permission(s): ${unknown.join(', ')}`,
      );
    return [...new Set(permissions)];
  }

  private toView(
    role: {
      id: bigint;
      key: string;
      name: string;
      description: string | null;
      is_system: boolean;
      role_permissions: { permission: string }[];
    },
    usersCount: number,
  ): RoleView {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      is_system: role.is_system,
      locked: role.key === ADMIN_ROLE_KEY || role.key === PATIENT_ROLE_KEY,
      permissions:
        role.key === ADMIN_ROLE_KEY
          ? [...ALL_PERMISSIONS]
          : role.role_permissions.map((p) => p.permission),
      users_count: usersCount,
    };
  }
}
