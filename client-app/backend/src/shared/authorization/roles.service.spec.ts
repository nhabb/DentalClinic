import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { ALL_PERMISSIONS, DEFAULT_ROLES } from './permissions';
import { EMPTY_TENANT, runWithTenant } from '../tenant/tenant-context';

const inOrg = <T>(fn: () => Promise<T>) =>
  runWithTenant({ ...EMPTY_TENANT, organizationId: 1n, source: 'jwt' }, fn);

const roleRow = (
  key: string,
  permissions: string[],
  over: Record<string, unknown> = {},
) => ({
  id: 10n,
  key,
  name: key,
  description: null,
  is_system: true,
  role_permissions: permissions.map((permission) => ({ permission })),
  ...over,
});

describe('RolesService', () => {
  let prisma: any;
  let service: RolesService;

  beforeEach(() => {
    const tx = {
      roles: { update: jest.fn() },
      role_permissions: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    prisma = {
      tx,
      roles: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      users: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    service = new RolesService(prisma);
  });

  describe('permissionsFor', () => {
    it('gives admin every permission and patients none, without touching the database', async () => {
      await expect(service.permissionsFor(1n, 'admin')).resolves.toEqual([
        ...ALL_PERMISSIONS,
      ]);
      await expect(service.permissionsFor(1n, 'patient')).resolves.toEqual([]);
      expect(prisma.roles.findUnique).not.toHaveBeenCalled();
    });

    it('reads other roles from the database and caches them', async () => {
      prisma.roles.findMany.mockResolvedValue(
        DEFAULT_ROLES.map((r) => ({ key: r.key })),
      );
      prisma.roles.findUnique.mockResolvedValue(
        roleRow('doctor', ['appointments:read']),
      );
      await expect(service.permissionsFor(1n, 'doctor')).resolves.toEqual([
        'appointments:read',
      ]);
      await service.permissionsFor(1n, 'doctor');
      expect(prisma.roles.findUnique).toHaveBeenCalledTimes(1);

      service.invalidate(1n);
      await service.permissionsFor(1n, 'doctor');
      expect(prisma.roles.findUnique).toHaveBeenCalledTimes(2);
    });

    it('returns no permissions for a role the clinic does not have', async () => {
      prisma.roles.findMany.mockResolvedValue(
        DEFAULT_ROLES.map((r) => ({ key: r.key })),
      );
      prisma.roles.findUnique.mockResolvedValue(null);
      await expect(service.permissionsFor(1n, 'ghost')).resolves.toEqual([]);
    });
  });

  describe('ensureDefaults', () => {
    it('creates only the default roles that are missing', async () => {
      prisma.roles.findMany.mockResolvedValue([
        { key: 'admin' },
        { key: 'patient' },
      ]);
      await service.ensureDefaults(1n);
      const created = prisma.roles.create.mock.calls.map(
        (c: any) => c[0].data.key,
      );
      expect(created).toEqual(['doctor', 'secretary']);
      const doctor = prisma.roles.create.mock.calls[0][0].data;
      expect(doctor.is_system).toBe(true);
      expect(doctor.role_permissions.create.length).toBeGreaterThan(5);
      expect(doctor.role_permissions.create[0]).toMatchObject({
        organization_id: 1n,
      });
    });

    it('does nothing when all defaults exist', async () => {
      prisma.roles.findMany.mockResolvedValue(
        DEFAULT_ROLES.map((r) => ({ key: r.key })),
      );
      await service.ensureDefaults(1n);
      expect(prisma.roles.create).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates a custom role with known permissions only', async () => {
      prisma.roles.create.mockImplementation(async ({ data }: any) =>
        roleRow(
          data.key,
          data.role_permissions.create.map((p: any) => p.permission),
          { is_system: false, name: data.name },
        ),
      );
      const role = await inOrg(() =>
        service.create({
          key: 'Hygienist',
          name: 'Hygienist',
          permissions: ['records:read', 'records:read'],
        }),
      );
      expect(role).toMatchObject({
        key: 'hygienist',
        is_system: false,
        locked: false,
        permissions: ['records:read'],
      });
    });

    it('rejects unknown permissions, bad keys and duplicates', async () => {
      await expect(
        inOrg(() =>
          service.create({ key: 'x1', name: 'X', permissions: ['nope:all'] }),
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        inOrg(() =>
          service.create({ key: 'Bad Key!', name: 'X', permissions: [] }),
        ),
      ).rejects.toThrow(BadRequestException);
      prisma.roles.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        inOrg(() =>
          service.create({ key: 'doctor', name: 'X', permissions: [] }),
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('replaces the permission set of an editable role', async () => {
      prisma.roles.findUnique.mockResolvedValue(
        roleRow('secretary', ['billing:read']),
      );
      await inOrg(() =>
        service.update('secretary', {
          permissions: ['billing:read', 'billing:write'],
        }),
      );
      expect(prisma.tx.role_permissions.deleteMany).toHaveBeenCalledWith({
        where: { role_id: 10n },
      });
      expect(prisma.tx.role_permissions.createMany).toHaveBeenCalledWith({
        data: [
          { role_id: 10n, organization_id: 1n, permission: 'billing:read' },
          { role_id: 10n, organization_id: 1n, permission: 'billing:write' },
        ],
      });
    });

    it('keeps admin locked to every permission and patients to none', async () => {
      prisma.roles.findUnique.mockResolvedValue(roleRow('admin', []));
      await expect(
        inOrg(() => service.update('admin', { permissions: ['billing:read'] })),
      ).rejects.toThrow(BadRequestException);
      prisma.roles.findUnique.mockResolvedValue(roleRow('patient', []));
      await expect(
        inOrg(() =>
          service.update('patient', { permissions: ['billing:read'] }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('404s for roles of other clinics', async () => {
      prisma.roles.findUnique.mockResolvedValue(null);
      await expect(
        inOrg(() => service.update('ghost', { name: 'x' })),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('refuses built-in roles and roles still in use', async () => {
      prisma.roles.findUnique.mockResolvedValue(roleRow('doctor', []));
      await expect(inOrg(() => service.remove('doctor'))).rejects.toThrow(
        BadRequestException,
      );

      prisma.roles.findUnique.mockResolvedValue(
        roleRow('hygienist', [], { is_system: false }),
      );
      prisma.users.count.mockResolvedValue(2);
      await expect(inOrg(() => service.remove('hygienist'))).rejects.toThrow(
        ConflictException,
      );
    });

    it('deletes an unused custom role', async () => {
      prisma.roles.findUnique.mockResolvedValue(
        roleRow('hygienist', [], { is_system: false }),
      );
      prisma.users.count.mockResolvedValue(0);
      await expect(inOrg(() => service.remove('hygienist'))).resolves.toEqual({
        message: 'Role deleted',
      });
      expect(prisma.roles.delete).toHaveBeenCalledWith({ where: { id: 10n } });
    });
  });

  describe('isAssignableStaffRole', () => {
    it('never allows patient or superadmin, and checks the clinic for the rest', async () => {
      await expect(
        inOrg(() => service.isAssignableStaffRole('patient')),
      ).resolves.toBe(false);
      await expect(
        inOrg(() => service.isAssignableStaffRole('superadmin')),
      ).resolves.toBe(false);
      prisma.roles.findMany.mockResolvedValue(
        DEFAULT_ROLES.map((r) => ({ key: r.key })),
      );
      prisma.roles.findUnique.mockResolvedValueOnce({ id: 1n });
      await expect(
        inOrg(() => service.isAssignableStaffRole('doctor')),
      ).resolves.toBe(true);
      prisma.roles.findUnique.mockResolvedValueOnce(null);
      await expect(
        inOrg(() => service.isAssignableStaffRole('ghost')),
      ).resolves.toBe(false);
    });
  });
});
