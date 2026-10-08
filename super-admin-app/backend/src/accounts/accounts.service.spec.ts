import { BadRequestException } from '@nestjs/common';
import { AccountsService } from './accounts.service';

function build(
  current: Record<string, unknown>,
  options: { otherActiveAdmins?: number; assignable?: boolean } = {},
) {
  let state: Record<string, unknown> = current;
  const prisma = {
    users: {
      findFirst: jest.fn(() => Promise.resolve(state)),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(options.otherActiveAdmins ?? 1),
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        state = { ...state, ...args.data };
        return Promise.resolve(state);
      }),
    },
    branches: { findFirst: jest.fn().mockResolvedValue({ id: 5n }) },
  };
  const roles = { isAssignableStaffRole: jest.fn().mockResolvedValue(options.assignable ?? true) };
  const mail = { send: jest.fn().mockResolvedValue(false) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AccountsService(prisma as never, roles as never, mail as never, audit as never);
  return { service, prisma, roles, mail, audit };
}

const doctor = {
  id: 7n,
  organization_id: 1n,
  email: 'd@x.com',
  first_name: 'D',
  last_name: 'R',
  phone: null,
  role: 'doctor',
  is_active: true,
  branch_id: 5n,
  restrict_to_branch: false,
  organization: { id: 1n, name: 'Smile', slug: 'smile' },
  branch: { id: 5n, name: 'Main' },
};

describe('AccountsService.update', () => {
  it('changes role and branch after checking them against the clinic', async () => {
    const { service, roles, prisma } = build(doctor);
    await service.update(1n, 7n, { role: 'secretary', branch_id: 5, restrict_to_branch: true }, 99n);
    expect(roles.isAssignableStaffRole).toHaveBeenCalledWith(1n, 'secretary');
    const data = prisma.users.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ role: 'secretary', branch_id: 5n, restrict_to_branch: true });
  });

  it('refuses a role the clinic does not have', async () => {
    const { service } = build(doctor, { assignable: false });
    await expect(service.update(1n, 7n, { role: 'wizard' }, 99n)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses restricting an account that has no home branch, and restricting an admin', async () => {
    const { service } = build({ ...doctor, branch_id: null, branch: null });
    await expect(service.update(1n, 7n, { restrict_to_branch: true }, 99n)).rejects.toThrow(/home branch/);
    const admin = build({ ...doctor, role: 'admin' });
    await expect(admin.service.update(1n, 7n, { restrict_to_branch: true }, 99n)).rejects.toThrow(
      /cannot be restricted/,
    );
  });

  it('refuses taking the last active administrator away from a clinic', async () => {
    const { service } = build({ ...doctor, role: 'admin' }, { otherActiveAdmins: 0 });
    await expect(service.update(1n, 7n, { is_active: false }, 99n)).rejects.toThrow(
      /at least one active administrator/,
    );
    await expect(service.update(1n, 7n, { role: 'doctor' }, 99n)).rejects.toThrow(
      /at least one active administrator/,
    );
  });

  it('lets a patient account change contact details but not role or branch', async () => {
    const patient = { ...doctor, role: 'patient', branch_id: null, branch: null };
    const { service, prisma } = build(patient);
    await service.update(1n, 7n, { phone: '123' }, 99n);
    expect(prisma.users.update.mock.calls[0][0].data).not.toHaveProperty('role');
    await expect(service.update(1n, 7n, { role: 'doctor' }, 99n)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes an audit entry with before and after', async () => {
    const { service, audit } = build(doctor);
    await service.update(1n, 7n, { first_name: 'Dana' }, 99n);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.account.update',
        before: expect.objectContaining({ first_name: 'D' }),
        after: expect.objectContaining({ first_name: 'Dana' }),
      }),
    );
  });
});

describe('AccountsService.sendPasswordReset', () => {
  it('stores only a hash, returns the link, and reports whether it was emailed', async () => {
    const { service, prisma, mail } = build(doctor);
    const result = await service.sendPasswordReset(1n, 7n, 99n);
    const data = prisma.users.update.mock.calls[0][0].data;
    expect(data.must_set_password).toBe(true);
    expect(typeof data.password_setup_token_hash).toBe('string');
    expect(result.invite.link).toMatch(/\/set-password\?token=/);
    expect(result.invite.link).not.toContain(data.password_setup_token_hash as string);
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'd@x.com' }));
    expect(result.emailed).toBe(false);
  });
});
