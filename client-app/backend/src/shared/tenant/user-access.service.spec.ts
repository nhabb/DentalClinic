import { UserAccess, UserAccessService } from './user-access.service';
import { ALL_PERMISSIONS } from '../authorization/permissions';

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 7n,
  organization_id: 1n,
  role: 'doctor',
  is_active: true,
  branch_id: 3n,
  restrict_to_branch: false,
  organization: { is_active: true },
  ...over,
});

describe('UserAccessService', () => {
  let prisma: { users: { findUnique: jest.Mock } };
  let roles: { permissionsFor: jest.Mock };
  let service: UserAccessService;

  beforeEach(() => {
    prisma = { users: { findUnique: jest.fn() } };
    roles = {
      permissionsFor: jest.fn().mockResolvedValue(['appointments:read']),
    };
    service = new UserAccessService(prisma as any, roles as any);
  });

  it('maps the user row and the role permissions to an access record', async () => {
    prisma.users.findUnique.mockResolvedValue(row());
    await expect(service.load(7n)).resolves.toEqual<UserAccess>({
      userId: 7n,
      organizationId: 1n,
      organizationActive: true,
      role: 'doctor',
      permissions: ['appointments:read'],
      isActive: true,
      homeBranchId: 3n,
      restrictToBranch: false,
    });
    expect(roles.permissionsFor).toHaveBeenCalledWith(1n, 'doctor');
  });

  it('returns null for unknown users', async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    await expect(service.load(99n)).resolves.toBeNull();
  });

  it('gives platform accounts no clinic permissions and treats them as active', async () => {
    prisma.users.findUnique.mockResolvedValue(
      row({ organization_id: null, organization: null, role: 'superadmin' }),
    );
    await expect(service.load(7n)).resolves.toMatchObject({
      organizationActive: true,
      permissions: [],
    });
    expect(roles.permissionsFor).not.toHaveBeenCalled();
  });

  it('caches lookups and forgets them on invalidate', async () => {
    prisma.users.findUnique.mockResolvedValue(row());
    await service.load(7n);
    await service.load(7n);
    expect(prisma.users.findUnique).toHaveBeenCalledTimes(1);

    service.invalidate(7n);
    await service.load(7n);
    expect(prisma.users.findUnique).toHaveBeenCalledTimes(2);

    service.invalidate();
    await service.load(7n);
    expect(prisma.users.findUnique).toHaveBeenCalledTimes(3);
  });

  describe('branchScopeOf', () => {
    const access = (over: Partial<UserAccess>): UserAccess => ({
      userId: 1n,
      organizationId: 1n,
      organizationActive: true,
      role: 'secretary',
      permissions: [],
      isActive: true,
      homeBranchId: 5n,
      restrictToBranch: true,
      ...over,
    });

    it('confines restricted non-admin staff to their home branch', () => {
      expect(UserAccessService.branchScopeOf(access({}))).toBe(5n);
      expect(
        UserAccessService.branchScopeOf(
          access({ role: 'hygienist', permissions: [...ALL_PERMISSIONS] }),
        ),
      ).toBe(5n);
    });

    it('never confines the administrator role', () => {
      expect(
        UserAccessService.branchScopeOf(access({ role: 'admin' })),
      ).toBeNull();
    });

    it('does not confine staff without the flag or without a home branch', () => {
      expect(
        UserAccessService.branchScopeOf(access({ restrictToBranch: false })),
      ).toBeNull();
      expect(
        UserAccessService.branchScopeOf(access({ homeBranchId: null })),
      ).toBeNull();
    });
  });
});
