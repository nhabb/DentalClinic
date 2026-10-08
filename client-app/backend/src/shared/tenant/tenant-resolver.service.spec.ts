import { NotFoundException } from '@nestjs/common';
import { TenantResolverService } from './tenant-resolver.service';
import { EMPTY_TENANT, runWithTenant } from './tenant-context';

describe('TenantResolverService', () => {
  let prisma: {
    organizations: { findFirst: jest.Mock; findMany: jest.Mock };
    branches: { findFirst: jest.Mock };
  };
  let service: TenantResolverService;

  beforeEach(() => {
    delete process.env.DEFAULT_ORGANIZATION_SLUG;
    prisma = {
      organizations: { findFirst: jest.fn(), findMany: jest.fn() },
      branches: { findFirst: jest.fn() },
    };
    service = new TenantResolverService(prisma as any);
  });

  describe('organizationIdBySlug', () => {
    it('finds active organizations case-insensitively and caches the answer', async () => {
      prisma.organizations.findFirst.mockResolvedValue({ id: 4n });
      await expect(service.organizationIdBySlug('BrightSmile')).resolves.toBe(
        4n,
      );
      await expect(service.organizationIdBySlug('brightsmile')).resolves.toBe(
        4n,
      );
      expect(prisma.organizations.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.organizations.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'brightsmile', is_active: true },
        }),
      );
    });

    it('returns null for unknown slugs', async () => {
      prisma.organizations.findFirst.mockResolvedValue(null);
      await expect(service.organizationIdBySlug('nope')).resolves.toBeNull();
    });

    it('forgets cached answers on invalidate()', async () => {
      prisma.organizations.findFirst.mockResolvedValue(null);
      await service.organizationIdBySlug('x');
      service.invalidate();
      await service.organizationIdBySlug('x');
      expect(prisma.organizations.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('defaultOrganizationId', () => {
    it('prefers DEFAULT_ORGANIZATION_SLUG', async () => {
      process.env.DEFAULT_ORGANIZATION_SLUG = 'brightsmile';
      prisma.organizations.findFirst.mockResolvedValue({ id: 1n });
      await expect(service.defaultOrganizationId()).resolves.toBe(1n);
      expect(prisma.organizations.findMany).not.toHaveBeenCalled();
    });

    it('falls back to the only active organization', async () => {
      prisma.organizations.findMany.mockResolvedValue([{ id: 9n }]);
      await expect(service.defaultOrganizationId()).resolves.toBe(9n);
    });

    it('refuses to guess when several organizations exist', async () => {
      prisma.organizations.findMany.mockResolvedValue([{ id: 1n }, { id: 2n }]);
      await expect(service.defaultOrganizationId()).resolves.toBeNull();
    });
  });

  describe('resolveBranchId', () => {
    it('validates an explicit branch (RLS restricts the lookup to the current organization)', async () => {
      prisma.branches.findFirst.mockResolvedValue({ id: 3n });
      await expect(service.resolveBranchId(3)).resolves.toBe(3n);
      expect(prisma.branches.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 3n, is_active: true } }),
      );
    });

    it('rejects an explicit branch that is not visible', async () => {
      prisma.branches.findFirst.mockResolvedValue(null);
      await expect(service.resolveBranchId(99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("uses the current user's home branch when no branch is given", async () => {
      await expect(
        runWithTenant(
          {
            ...EMPTY_TENANT,
            organizationId: 1n,
            homeBranchId: 6n,
            source: 'jwt',
          },
          () => service.resolveBranchId(),
        ),
      ).resolves.toBe(6n);
      expect(prisma.branches.findFirst).not.toHaveBeenCalled();
    });

    it("falls back to the organization's default branch, then its first active branch", async () => {
      prisma.branches.findFirst.mockResolvedValueOnce({ id: 1n });
      await expect(service.resolveBranchId()).resolves.toBe(1n);

      prisma.branches.findFirst.mockReset();
      prisma.branches.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 2n });
      await expect(service.resolveBranchId()).resolves.toBe(2n);
    });

    it('fails when the organization has no active branch', async () => {
      prisma.branches.findFirst.mockResolvedValue(null);
      await expect(service.resolveBranchId()).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
