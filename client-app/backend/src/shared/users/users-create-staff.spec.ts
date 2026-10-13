import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { runWithTenant } from '../tenant/tenant-context';

/**
 * Staff accounts created from the clinic's Roles page: the email must be free
 * across every clinic, the password unusable until the invite is followed,
 * and the response must carry the invite but never a password hash.
 */
type Row = Record<string, unknown>;
type CreateArgs = { data: Row; select: Record<string, boolean> };

describe('UsersService.createStaff', () => {
  const tenant = { organizationId: 7n } as never;

  function build(existing: { id: bigint } | null) {
    const create = jest.fn(({ data, select }: CreateArgs): Promise<Row> => {
      const row: Row = { id: 42n, ...data };
      return Promise.resolve(
        Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])),
      );
    });
    const prisma = {
      users: { findUnique: jest.fn().mockResolvedValue(existing), create },
    };
    const issueAndSend = jest.fn().mockResolvedValue({
      link: 'http://localhost:3000/set-password?token=abc',
      emailed: false,
      email: 'new@clinic.com',
      expires_at: new Date('2026-10-16T00:00:00Z'),
    });
    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { issueAndSend } as never,
    );
    return { service, create, issueAndSend };
  }

  const dto = {
    first_name: ' Nadia ',
    last_name: 'Haddad',
    email: 'New@Clinic.com',
    phone: '',
    role: 'secretary',
  } as never;

  it('creates the account with an unusable password and returns the invite', async () => {
    const { service, create, issueAndSend } = build(null);
    const result = await runWithTenant(tenant, () => service.createStaff(dto));

    const data = create.mock.calls[0][0].data;
    expect(data.organization_id).toBe(7n);
    expect(data.email).toBe('new@clinic.com');
    expect(data.first_name).toBe('Nadia');
    expect(data.phone).toBeNull();
    expect(data.role).toBe('secretary');
    expect(data.must_set_password).toBe(true);
    expect(data.password_hash).toMatch(/^\$2[ab]\$/);

    expect(issueAndSend).toHaveBeenCalledWith(
      { id: 42n, email: 'new@clinic.com', first_name: 'Nadia' },
      'staff',
    );
    expect(result.user).toEqual({
      id: 42n,
      email: 'new@clinic.com',
      first_name: 'Nadia',
      last_name: 'Haddad',
      phone: null,
      role: 'secretary',
      is_active: true,
    });
    expect(result.invite.link).toContain('/set-password?token=');
    const serialized = JSON.stringify(result, (_, v: unknown) =>
      typeof v === 'bigint' ? String(v) : v,
    );
    expect(serialized).not.toContain('password_hash');
  });

  it('refuses an email that any clinic already uses instead of returning that account', async () => {
    const { service, create } = build({ id: 1n });
    await expect(
      runWithTenant(tenant, () => service.createStaff(dto)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });
});
