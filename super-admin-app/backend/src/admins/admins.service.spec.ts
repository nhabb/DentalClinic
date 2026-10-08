import { BadRequestException, ConflictException } from '@nestjs/common';
import { AdminsService } from './admins.service';

describe('AdminsService', () => {
  let prisma: any;
  let auth: { invalidate: jest.Mock };
  let service: AdminsService;

  beforeEach(() => {
    prisma = {
      users: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    auth = { invalidate: jest.fn() };
    service = new AdminsService(prisma, auth as any);
  });

  it('creates a platform admin with no organization and a hashed password', async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    prisma.users.create.mockImplementation(async ({ data }: any) => ({ id: 1n, ...data }));
    const created = await service.create({
      email: 'Ops@X.com',
      first_name: 'O',
      last_name: 'P',
      password: 'Secret123',
    });
    expect(prisma.users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organization_id: null, role: 'superadmin', email: 'ops@x.com' }),
      }),
    );
    expect((created as any).password_hash).not.toBe('Secret123');
  });

  it('rejects duplicate emails', async () => {
    prisma.users.findUnique.mockResolvedValue({ id: 1n });
    await expect(
      service.create({ email: 'ops@x.com', first_name: 'O', last_name: 'P', password: 'Secret123' }),
    ).rejects.toThrow(ConflictException);
  });

  it('will not deactivate yourself or the last active admin', async () => {
    await expect(service.setActive(1n, 1n, false)).rejects.toThrow(BadRequestException);

    prisma.users.findFirst.mockResolvedValue({ id: 2n });
    prisma.users.count.mockResolvedValue(0);
    await expect(service.setActive(1n, 2n, false)).rejects.toThrow(BadRequestException);
  });

  it('deactivates another admin and drops their cached access', async () => {
    prisma.users.findFirst.mockResolvedValue({ id: 2n });
    prisma.users.count.mockResolvedValue(1);
    prisma.users.update.mockResolvedValue({ id: 2n, is_active: false });
    await expect(service.setActive(1n, 2n, false)).resolves.toMatchObject({ is_active: false });
    expect(auth.invalidate).toHaveBeenCalledWith(2n);
  });
});
