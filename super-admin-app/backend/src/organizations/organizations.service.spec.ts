import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  let prisma: any;
  let service: OrganizationsService;

  beforeEach(() => {
    process.env.CLINIC_APP_URL = 'https://clinic.example.com';
    const tx = {
      organizations: { create: jest.fn() },
      branches: { create: jest.fn() },
      clinic_profile: { create: jest.fn() },
      users: { create: jest.fn() },
    };
    prisma = {
      tx,
      organizations: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      invoice_payments: { groupBy: jest.fn(), aggregate: jest.fn() },
      appointments: { groupBy: jest.fn() },
      users: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      branches: { findFirst: jest.fn() },
      treatment_invoices: { aggregate: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(tx)),
    };
    service = new OrganizationsService(prisma);
  });

  describe('list', () => {
    it('merges counts, revenue, staff and last activity per clinic', async () => {
      prisma.organizations.findMany.mockResolvedValue([
        {
          id: 1n,
          name: 'BrightSmile',
          slug: 'brightsmile',
          is_active: true,
          created_at: new Date('2026-01-01'),
          _count: { branches: 2, patient_profiles: 25, appointments: 45 },
        },
        {
          id: 2n,
          name: 'Smile Center',
          slug: 'smile-center',
          is_active: false,
          created_at: new Date('2026-02-01'),
          _count: { branches: 1, patient_profiles: 0, appointments: 0 },
        },
      ]);
      prisma.invoice_payments.groupBy.mockResolvedValue([{ organization_id: 1n, _sum: { amount: 1234.5 } }]);
      prisma.appointments.groupBy.mockResolvedValue([
        { organization_id: 1n, _max: { created_at: new Date('2026-03-01') } },
      ]);
      prisma.users.groupBy.mockResolvedValue([{ organization_id: 1n, _count: { _all: 3 } }]);

      const rows = await service.list();
      expect(rows).toEqual([
        expect.objectContaining({
          id: 1n,
          branches: 2,
          staff: 3,
          patients: 25,
          appointments: 45,
          revenue_collected: 1234.5,
          last_activity_at: new Date('2026-03-01'),
        }),
        expect.objectContaining({ id: 2n, staff: 0, revenue_collected: 0, last_activity_at: null }),
      ]);
    });
  });

  describe('create', () => {
    it('creates organization, default branch, clinic profile and owner with a setup link', async () => {
      prisma.organizations.findUnique.mockResolvedValue(null);
      prisma.users.findUnique.mockResolvedValue(null);
      prisma.tx.organizations.create.mockImplementation(async ({ data }: any) => ({ id: 9n, ...data }));
      prisma.tx.branches.create.mockImplementation(async ({ data }: any) => ({
        id: 4n,
        address: null,
        opening_hours: null,
        ...data,
      }));
      prisma.tx.users.create.mockImplementation(async ({ data }: any) => ({
        id: 70n,
        email: data.email,
        role: data.role,
      }));

      const result = await service.create({
        name: 'Smile Center',
        slug: 'Smile-Center',
        owner: { email: 'Owner@X.com', first_name: 'Lina', last_name: 'H' },
      });

      expect(prisma.tx.organizations.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slug: 'smile-center' }),
      });
      expect(prisma.tx.branches.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organization_id: 9n, is_default: true, name: 'Main Branch' }),
      });
      expect(prisma.tx.clinic_profile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organization_id: 9n, name: 'Smile Center' }),
      });
      expect(prisma.tx.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organization_id: 9n,
            branch_id: 4n,
            email: 'owner@x.com',
            role: 'admin',
            must_set_password: true,
            password_setup_token_hash: expect.any(String),
          }),
        }),
      );
      expect(result.invite?.link).toMatch(/^https:\/\/clinic\.example\.com\/set-password\?token=/);
      expect(result.owner).toMatchObject({ id: 70n });
    });

    it('rejects a taken slug before touching anything', async () => {
      prisma.organizations.findUnique.mockResolvedValue({ id: 1n });
      await expect(service.create({ name: 'X', slug: 'brightsmile' })).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an owner email that already exists', async () => {
      prisma.organizations.findUnique.mockResolvedValue(null);
      prisma.users.findUnique.mockResolvedValue({ id: 5n });
      await expect(
        service.create({ name: 'X', slug: 'x', owner: { email: 'a@b.c', first_name: 'A', last_name: 'B' } }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('setActive / update', () => {
    it('404s for unknown organizations', async () => {
      prisma.organizations.findUnique.mockResolvedValue(null);
      await expect(service.setActive(99n, false)).rejects.toThrow(NotFoundException);
      await expect(service.update(99n, { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('suspends a clinic', async () => {
      prisma.organizations.findUnique.mockResolvedValue({ id: 1n });
      prisma.organizations.update.mockResolvedValue({ id: 1n, is_active: false });
      await expect(service.setActive(1n, false)).resolves.toMatchObject({ is_active: false });
    });
  });

  describe('branches', () => {
    beforeEach(() => {
      prisma.organizations.findUnique.mockResolvedValue({ id: 1n });
      prisma.branches.count = jest.fn();
      prisma.branches.update = jest.fn();
      prisma.tx.branches.updateMany = jest.fn();
      prisma.tx.branches.update = jest.fn();
    });

    it('creates the first branch as the default', async () => {
      prisma.branches.count.mockResolvedValue(0);
      prisma.tx.branches.create.mockImplementation(async ({ data }: any) => ({ id: 3n, ...data }));
      const branch = await service.createBranch(1n, { name: 'Beirut' });
      expect(branch).toMatchObject({ organization_id: 1n, name: 'Beirut', is_default: true });
      expect(prisma.tx.branches.updateMany).toHaveBeenCalled();
    });

    it('adds later branches as non-default unless asked, and moves the flag when asked', async () => {
      prisma.branches.count.mockResolvedValue(1);
      prisma.tx.branches.create.mockImplementation(async ({ data }: any) => ({ id: 4n, ...data }));
      expect((await service.createBranch(1n, { name: 'Tyre' })).is_default).toBe(false);
      expect(prisma.tx.branches.updateMany).not.toHaveBeenCalled();

      await service.createBranch(1n, { name: 'Saida', is_default: true });
      expect(prisma.tx.branches.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organization_id: 1n, is_default: true } }),
      );
    });

    it('reports a duplicate branch name as a conflict', async () => {
      prisma.branches.count.mockResolvedValue(1);
      prisma.tx.branches.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.createBranch(1n, { name: 'Tyre' })).rejects.toThrow(ConflictException);
    });

    it('refuses to deactivate the default branch and 404s outside the clinic', async () => {
      prisma.branches.findFirst.mockResolvedValueOnce({
        id: 3n,
        name: 'Beirut',
        is_default: true,
        is_active: true,
      });
      await expect(service.updateBranch(1n, 3n, { is_active: false })).rejects.toThrow(BadRequestException);
      prisma.branches.findFirst.mockResolvedValueOnce(null);
      await expect(service.updateBranch(1n, 99n, { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('makes an active branch the default and refuses an inactive one', async () => {
      prisma.branches.findFirst.mockResolvedValueOnce({ id: 4n, is_default: false, is_active: true });
      prisma.tx.branches.update.mockResolvedValue({ id: 4n, is_default: true });
      await expect(service.setDefaultBranch(1n, 4n)).resolves.toMatchObject({ is_default: true });
      expect(prisma.tx.branches.updateMany).toHaveBeenCalled();

      prisma.branches.findFirst.mockResolvedValueOnce({ id: 5n, is_default: false, is_active: false });
      await expect(service.setDefaultBranch(1n, 5n)).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendInvite', () => {
    it('issues a new token for a user of that organization only', async () => {
      prisma.users.findFirst.mockResolvedValue(null);
      await expect(service.resendInvite(1n, 7n)).rejects.toThrow(NotFoundException);

      prisma.users.findFirst.mockResolvedValue({ id: 7n, email: 'u@x.com', first_name: 'U' });
      const result = await service.resendInvite(1n, 7n);
      expect(prisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ must_set_password: true }) }),
      );
      expect(result.invite.link).toContain('/set-password?token=');
    });
  });
});
