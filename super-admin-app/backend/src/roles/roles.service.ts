import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ADMIN_ROLE_KEY,
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  PATIENT_ROLE_KEY,
  PERMISSION_GROUPS,
  isKnownPermission,
} from '../catalog/permissions';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

/** A role as the console shows it. Same shape as the clinic API's GET /roles. */
export interface RoleView {
  id: bigint;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  /** Admin: permissions cannot be edited. Patient: cannot be given to staff. */
  locked: boolean;
  permissions: string[];
  users_count: number;
}

/**
 * Roles and permissions of any clinic, edited by the platform. The rules are
 * the clinic app's (RolesService there): admin always holds everything,
 * patient holds nothing, built-in roles and roles in use cannot be deleted.
 * The clinic backend caches a role's permissions for 60 seconds, so a change
 * made here reaches its users within a minute.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  catalog() {
    return PERMISSION_GROUPS;
  }

  async list(organizationId: bigint): Promise<RoleView[]> {
    await this.ensureDefaults(organizationId);
    const [roles, counts] = await Promise.all([
      this.prisma.roles.findMany({
        where: { organization_id: organizationId },
        include: { role_permissions: { select: { permission: true } } },
        orderBy: [{ is_system: 'desc' }, { created_at: 'asc' }],
      }),
      this.prisma.users.groupBy({
        by: ['role'],
        where: { organization_id: organizationId },
        _count: { _all: true },
      }),
    ]);
    const countByKey = new Map(counts.map((c) => [c.role, c._count._all]));
    return roles.map((r) => toView(r, countByKey.get(r.key) ?? 0));
  }

  async getByKey(organizationId: bigint, key: string): Promise<RoleView> {
    const role = await this.prisma.roles.findUnique({
      where: { organization_id_key: { organization_id: organizationId, key } },
      include: { role_permissions: { select: { permission: true } } },
    });
    if (!role) throw new NotFoundException(`Role "${key}" not found in this clinic`);
    const users = await this.prisma.users.count({ where: { organization_id: organizationId, role: key } });
    return toView(role, users);
  }

  /** True when staff of this clinic may hold the role key. */
  async isAssignableStaffRole(organizationId: bigint, key: string): Promise<boolean> {
    if (key === PATIENT_ROLE_KEY || key === 'superadmin') return false;
    await this.ensureDefaults(organizationId);
    const role = await this.prisma.roles.findUnique({
      where: { organization_id_key: { organization_id: organizationId, key } },
      select: { id: true },
    });
    return role !== null;
  }

  async create(organizationId: bigint, dto: CreateRoleDto, actorId: bigint): Promise<RoleView> {
    const key = dto.key.trim().toLowerCase();
    const permissions = cleanPermissions(dto.permissions);
    try {
      const role = await this.prisma.roles.create({
        data: {
          organization_id: organizationId,
          key,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          is_system: false,
          role_permissions: {
            create: permissions.map((permission) => ({ organization_id: organizationId, permission })),
          },
        },
        include: { role_permissions: { select: { permission: true } } },
      });
      await this.audit.record({
        organizationId,
        actorId,
        action: 'platform.role.create',
        table: 'roles',
        recordId: role.id,
        after: { key, name: role.name, permissions },
      });
      return toView(role, 0);
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException(`A role with the key "${key}" already exists in this clinic`);
      }
      throw err;
    }
  }

  async update(organizationId: bigint, key: string, dto: UpdateRoleDto, actorId: bigint): Promise<RoleView> {
    const current = await this.getByKey(organizationId, key);
    if (key === ADMIN_ROLE_KEY && dto.permissions !== undefined) {
      throw new BadRequestException('The administrator role always has every permission');
    }
    if (key === PATIENT_ROLE_KEY && dto.permissions !== undefined && dto.permissions.length > 0) {
      throw new BadRequestException('Patients are governed by ownership, not permissions');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.roles.update({
        where: { id: current.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          updated_at: new Date(),
        },
      });
      if (dto.permissions !== undefined) {
        const permissions = cleanPermissions(dto.permissions);
        await tx.role_permissions.deleteMany({ where: { role_id: current.id } });
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

    const updated = await this.getByKey(organizationId, key);
    await this.audit.record({
      organizationId,
      actorId,
      action: 'platform.role.update',
      table: 'roles',
      recordId: current.id,
      before: { name: current.name, description: current.description, permissions: current.permissions },
      after: { name: updated.name, description: updated.description, permissions: updated.permissions },
    });
    return updated;
  }

  /** Only custom roles that nobody holds can be deleted. */
  async remove(organizationId: bigint, key: string, actorId: bigint): Promise<{ message: string }> {
    const role = await this.getByKey(organizationId, key);
    if (role.is_system) throw new BadRequestException('Built-in roles cannot be deleted');
    if (role.users_count > 0) {
      throw new ConflictException(`${role.users_count} user(s) still have this role; reassign them first`);
    }
    await this.prisma.roles.delete({ where: { id: role.id } });
    await this.audit.record({
      organizationId,
      actorId,
      action: 'platform.role.delete',
      table: 'roles',
      recordId: role.id,
      before: { key: role.key, name: role.name, permissions: role.permissions },
    });
    return { message: `Role "${key}" deleted` };
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
            create: role.permissions.map((permission) => ({ organization_id: organizationId, permission })),
          },
        },
      });
    }
  }
}

function cleanPermissions(permissions: string[]): string[] {
  const unknown = permissions.filter((p) => !isKnownPermission(p));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unknown permission(s): ${unknown.join(', ')}`);
  }
  return [...new Set(permissions)];
}

function toView(
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
  const isAdmin = role.key === ADMIN_ROLE_KEY;
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    is_system: role.is_system,
    locked: isAdmin || role.key === PATIENT_ROLE_KEY,
    // Admin always holds the whole catalog, whatever the rows say.
    permissions: isAdmin ? [...ALL_PERMISSIONS] : role.role_permissions.map((p) => p.permission).sort(),
    users_count: usersCount,
  };
}
