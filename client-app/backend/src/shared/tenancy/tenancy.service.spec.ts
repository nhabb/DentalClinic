import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TenancyService } from './tenancy.service';
import { EMPTY_TENANT, runWithTenant } from '../tenant/tenant-context';

const inOrg = <T>(fn: () => Promise<T>) =>
  runWithTenant({ ...EMPTY_TENANT, organizationId: 1n, source: 'jwt' }, fn);

describe('TenancyService', () => {
  let prisma: any;
  let accountSetup: { issueAndSend: jest.Mock };
  let resolver: { invalidate: jest.Mock };
  let userAccess: { invalidate: jest.Mock };
  let service: TenancyService;

  beforeEach(() => {
    const tx = {
      branches: { updateMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      organizations: { create: jest.fn() },
      users: { create: jest.fn() },
    };
    prisma = {
      tx,
      organizations: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      branches: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      users: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    accountSetup = {
      issueAndSend: jest.fn().mockResolvedValue({
        link: 'http://x/set-password?token=t',
        emailed: false,
      }),
    };
    resolver = { invalidate: jest.fn() };
    userAccess = { invalidate: jest.fn() };
    service = new TenancyService(
      prisma,
      accountSetup as any,
      resolver as any,
      userAccess as any,
    );
  });

  describe('getCurrentOrganization', () => {
    it('requires a tenant', async () => {
      await expect(service.getCurrentOrganization()).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns the organization with its branches', async () => {
      prisma.organizations.findFirst.mockResolvedValue({
        id: 1n,
        branches: [],
      });
      await expect(
        inOrg(() => service.getCurrentOrganization()),
      ).resolves.toEqual({ id: 1n, branches: [] });
      expect(prisma.organizations.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1n } }),
      );
    });
  });

  describe('createBranch', () => {
    it('makes the first branch of an organization the default', async () => {
      prisma.branches.count.mockResolvedValue(0);
      prisma.tx.branches.create.mockImplementation(async ({ data }: any) => ({
        id: 1n,
        ...data,
      }));

      const branch = await inOrg(() => service.createBranch({ name: 'Main' }));
      expect(branch).toMatchObject({
        name: 'Main',
        organization_id: 1n,
        is_default: true,
      });
      expect(prisma.tx.branches.updateMany).toHaveBeenCalled();
    });

    it('adds further branches as non-default unless asked', async () => {
      prisma.branches.count.mockResolvedValue(1);
      prisma.tx.branches.create.mockImplementation(async ({ data }: any) => ({
        id: 2n,
        ...data,
      }));

      const branch = await inOrg(() => service.createBranch({ name: 'Tyre' }));
      expect(branch.is_default).toBe(false);
      expect(prisma.tx.branches.updateMany).not.toHaveBeenCalled();
    });

    it('moves the default flag when a new branch is created as default', async () => {
      prisma.branches.count.mockResolvedValue(1);
      prisma.tx.branches.create.mockImplementation(async ({ data }: any) => ({
        id: 2n,
        ...data,
      }));

      await inOrg(() =>
        service.createBranch({ name: 'Tyre', is_default: true }),
      );
      expect(prisma.tx.branches.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { is_default: true },
          data: expect.objectContaining({ is_default: false }),
        }),
      );
    });

    it('reports duplicate names as a conflict', async () => {
      prisma.branches.count.mockResolvedValue(1);
      prisma.tx.branches.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        inOrg(() => service.createBranch({ name: 'Tyre' })),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateBranch', () => {
    it('refuses to deactivate the default branch', async () => {
      prisma.branches.findFirst.mockResolvedValue({ id: 1n, is_default: true });
      await expect(
        service.updateBranch(1n, { is_active: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('404s for a branch outside the visible organization', async () => {
      prisma.branches.findFirst.mockResolvedValue(null);
      await expect(service.updateBranch(99n, { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeBranch', () => {
    it('refuses to delete the default branch', async () => {
      prisma.branches.findFirst.mockResolvedValue({ id: 1n, is_default: true });
      await expect(service.removeBranch(1n)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('explains when the branch still has data (foreign key restrict)', async () => {
      prisma.branches.findFirst.mockResolvedValue({
        id: 2n,
        is_default: false,
      });
      prisma.branches.delete.mockRejectedValue({ code: 'P2003' });
      await expect(service.removeBranch(2n)).rejects.toThrow(ConflictException);
    });

    it('deletes an empty non-default branch', async () => {
      prisma.branches.findFirst.mockResolvedValue({
        id: 2n,
        is_default: false,
      });
      prisma.branches.delete.mockResolvedValue({});
      await expect(service.removeBranch(2n)).resolves.toEqual({
        message: 'Branch deleted',
      });
    });
  });

  describe('createOrganization (superadmin)', () => {
    it('creates the organization, its default branch and the owner, then sends the setup link', async () => {
      prisma.users.findUnique.mockResolvedValue(null);
      prisma.tx.organizations.create.mockImplementation(
        async ({ data }: any) => ({ id: 2n, ...data }),
      );
      prisma.tx.branches.create.mockImplementation(async ({ data }: any) => ({
        id: 5n,
        ...data,
      }));
      prisma.tx.users.create.mockResolvedValue({
        id: 70n,
        email: 'owner@x.com',
        first_name: 'Lina',
      });

      const result = await service.createOrganization({
        name: 'Smile Center',
        slug: 'Smile-Center',
        owner: { email: 'Owner@x.com', first_name: 'Lina', last_name: 'H' },
      });

      expect(prisma.tx.organizations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'smile-center' }),
        }),
      );
      expect(prisma.tx.branches.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organization_id: 2n,
            is_default: true,
            name: 'Main Branch',
          }),
        }),
      );
      expect(prisma.tx.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organization_id: 2n,
            branch_id: 5n,
            email: 'owner@x.com',
            role: 'admin',
            must_set_password: true,
          }),
        }),
      );
      expect(accountSetup.issueAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ id: 70n }),
      );
      expect(resolver.invalidate).toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 2n,
        branches: [{ id: 5n }],
        invite: { emailed: false },
      });
    });

    it('rejects an owner email that already exists anywhere', async () => {
      prisma.users.findUnique.mockResolvedValue({ id: 1n });
      await expect(
        service.createOrganization({
          name: 'X',
          slug: 'x',
          owner: { email: 'a@b.c', first_name: 'A', last_name: 'B' },
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reports a duplicate slug as a conflict', async () => {
      prisma.tx.organizations.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.createOrganization({ name: 'X', slug: 'brightsmile' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('setOrganizationActive', () => {
    it('locks members out by dropping the access cache', async () => {
      prisma.organizations.findUnique.mockResolvedValue({ id: 2n });
      prisma.organizations.update.mockResolvedValue({
        id: 2n,
        is_active: false,
      });
      await service.setOrganizationActive(2n, false);
      expect(userAccess.invalidate).toHaveBeenCalledWith();
      expect(resolver.invalidate).toHaveBeenCalled();
    });
  });
});
