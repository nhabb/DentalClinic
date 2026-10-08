import { BadRequestException, ConflictException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { ALL_PERMISSIONS } from '../catalog/permissions';

function build(
  roles: { key: string; is_system: boolean; permissions: string[] }[],
  usersByRole: Record<string, number> = {},
) {
  const rows = roles.map((r, i) => ({
    id: BigInt(i + 1),
    organization_id: 1n,
    key: r.key,
    name: r.key,
    description: null,
    is_system: r.is_system,
    created_at: new Date(),
    role_permissions: r.permissions.map((permission) => ({ permission })),
  }));
  const prisma = {
    roles: {
      findMany: jest.fn().mockResolvedValue(rows),
      findUnique: jest.fn(({ where }: { where: { organization_id_key: { key: string } } }) =>
        Promise.resolve(rows.find((r) => r.key === where.organization_id_key.key) ?? null),
      ),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    role_permissions: { deleteMany: jest.fn(), createMany: jest.fn() },
    users: {
      groupBy: jest
        .fn()
        .mockResolvedValue(Object.entries(usersByRole).map(([role, n]) => ({ role, _count: { _all: n } }))),
      count: jest.fn(({ where }: { where: { role: string } }) =>
        Promise.resolve(usersByRole[where.role] ?? 0),
      ),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new RolesService(prisma as never, audit as never), prisma, audit };
}

const defaults = [
  { key: 'admin', is_system: true, permissions: [] },
  { key: 'doctor', is_system: true, permissions: ['appointments:read'] },
  { key: 'secretary', is_system: true, permissions: ['appointments:read'] },
  { key: 'patient', is_system: true, permissions: [] },
];

describe('RolesService', () => {
  it('shows admin with every permission whatever the rows hold, and marks the locked roles', async () => {
    const { service } = build(defaults, { admin: 1, doctor: 2 });
    const list = await service.list(1n);
    const admin = list.find((r) => r.key === 'admin')!;
    expect(admin.permissions).toEqual([...ALL_PERMISSIONS]);
    expect(admin.locked).toBe(true);
    expect(list.find((r) => r.key === 'patient')!.locked).toBe(true);
    expect(list.find((r) => r.key === 'doctor')!.users_count).toBe(2);
  });

  it('refuses to change the admin role permissions', async () => {
    const { service } = build(defaults);
    await expect(service.update(1n, 'admin', { permissions: ['billing:read'] }, 9n)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses unknown permissions', async () => {
    const { service } = build(defaults);
    await expect(
      service.create(1n, { key: 'hygienist', name: 'Hygienist', permissions: ['nope:read'] }, 9n),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses deleting a built-in role or a role in use', async () => {
    const { service } = build([...defaults, { key: 'hygienist', is_system: false, permissions: [] }], {
      hygienist: 1,
    });
    await expect(service.remove(1n, 'doctor', 9n)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.remove(1n, 'hygienist', 9n)).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes an unused custom role and records it', async () => {
    const { service, prisma, audit } = build([
      ...defaults,
      { key: 'hygienist', is_system: false, permissions: [] },
    ]);
    await service.remove(1n, 'hygienist', 9n);
    expect(prisma.roles.delete).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'platform.role.delete' }));
  });

  it('knows which role keys staff may hold', async () => {
    const { service } = build(defaults);
    expect(await service.isAssignableStaffRole(1n, 'doctor')).toBe(true);
    expect(await service.isAssignableStaffRole(1n, 'patient')).toBe(false);
    expect(await service.isAssignableStaffRole(1n, 'superadmin')).toBe(false);
    expect(await service.isAssignableStaffRole(1n, 'unknown')).toBe(false);
  });
});
