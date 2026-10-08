import { UserAccess, UserAccessService } from './user-access.service';

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
  let service: UserAccessService;

  beforeEach(() => {
    prisma = { users: { findUnique: jest.fn() } };
    service = new UserAccessService(prisma as any);
  });

  it('maps the user row to an access record', async () => {
    prisma.users.findUnique.mockResolvedValue(row());
    await expect(service.load(7n)).resolves.toEqual<UserAccess>({
      userId: 7n,
      organizationId: 1n,
      organizationActive: true,
      role: 'doctor',
      isActive: true,
      homeBranchId: 3n,
      restrictToBranch: false,
    });
  });

  it('returns null for unknown users', async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    await expect(service.load(99n)).resolves.toBeNull();
  });

  it('treats platform accounts without an organization as active', async () => {
    prisma.users.findUnique.mockResolvedValue(
      row({ organization_id: null, organization: null, role: 'superadmin' }),
    );
    await expect(service.load(7n)).resolves.toMatchObject({
      organizationActive: true,
    });
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
      isActive: true,
      homeBranchId: 5n,
      restrictToBranch: true,
      ...over,
    });

    it('confines restricted non-admin staff to their home branch', () => {
      expect(UserAccessService.branchScopeOf(access({}))).toBe(5n);
    });

    it('never confines organization admins', () => {
      expect(
        UserAccessService.branchScopeOf(access({ role: 'admin' })),
      ).toBeNull();
      expect(
        UserAccessService.branchScopeOf(access({ role: 'superadmin' })),
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
