import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { verifyPlatformToken } from './platform-token';

describe('AuthService', () => {
  let prisma: { users: { findUnique: jest.Mock; findFirst: jest.Mock } };
  let service: AuthService;
  let hash: string;

  beforeAll(async () => {
    process.env.PLATFORM_JWT_SECRET = 'platform-test-secret-long-enough';
    hash = await bcrypt.hash('Secret123', 4);
  });

  beforeEach(() => {
    prisma = { users: { findUnique: jest.fn(), findFirst: jest.fn() } };
    service = new AuthService(prisma as any);
  });

  const admin = () => ({
    id: 1n,
    email: 'ops@platform.com',
    first_name: 'Ops',
    last_name: 'Admin',
    role: 'superadmin',
    organization_id: null,
    is_active: true,
    password_hash: hash,
  });

  it('signs a platform token for an active platform admin', async () => {
    prisma.users.findUnique.mockResolvedValue(admin());
    const result = await service.login('Ops@Platform.com', 'Secret123');
    expect(prisma.users.findUnique).toHaveBeenCalledWith({ where: { email: 'ops@platform.com' } });
    expect(verifyPlatformToken(result.token)).toMatchObject({ sub: '1', aud: 'platform' });
    expect(result.user).toEqual({ id: 1n, email: 'ops@platform.com', first_name: 'Ops', last_name: 'Admin' });
  });

  it('rejects a wrong password', async () => {
    prisma.users.findUnique.mockResolvedValue(admin());
    await expect(service.login('ops@platform.com', 'nope')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects clinic users even with the right password', async () => {
    prisma.users.findUnique.mockResolvedValue({ ...admin(), role: 'admin', organization_id: 1n });
    await expect(service.login('ops@platform.com', 'Secret123')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects superadmins that are attached to an organization or inactive', async () => {
    prisma.users.findUnique.mockResolvedValueOnce({ ...admin(), organization_id: 3n });
    await expect(service.login('ops@platform.com', 'Secret123')).rejects.toThrow(UnauthorizedException);
    prisma.users.findUnique.mockResolvedValueOnce({ ...admin(), is_active: false });
    await expect(service.login('ops@platform.com', 'Secret123')).rejects.toThrow(UnauthorizedException);
  });

  it('caches the active-admin lookup and forgets it on invalidate', async () => {
    prisma.users.findFirst.mockResolvedValue({ id: 1n, email: 'a', first_name: 'A', last_name: 'B' });
    await service.activeAdmin(1n);
    await service.activeAdmin(1n);
    expect(prisma.users.findFirst).toHaveBeenCalledTimes(1);
    service.invalidate(1n);
    await service.activeAdmin(1n);
    expect(prisma.users.findFirst).toHaveBeenCalledTimes(2);
  });
});
