import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  CONFIRM_PASSWORD_HEADER,
  CONFIRMATION_FAILED,
  CONFIRMATION_REQUIRED,
  CONFIRMATION_UNAVAILABLE,
  ConfirmedAdminGuard,
} from './confirmed-admin.guard';

function context(
  user: object | undefined,
  password?: string,
): ExecutionContext {
  const headers: Record<string, string> = {};
  if (password !== undefined) headers[CONFIRM_PASSWORD_HEADER] = password;
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, headers }) }),
  } as unknown as ExecutionContext;
}

function build(
  result: 'wrong_password' | 'no_password' | 'unknown_user' | null,
) {
  const passwords = { check: jest.fn().mockResolvedValue(result) };
  return { guard: new ConfirmedAdminGuard(passwords as never), passwords };
}

const admin = { id: '21', role: 'admin', permissions: ['billing:delete'] };

async function failure(promise: Promise<boolean>) {
  try {
    await promise;
  } catch (err) {
    return err as ForbiddenException;
  }
  throw new Error('expected a refusal');
}

describe('ConfirmedAdminGuard', () => {
  it('lets a clinic admin through when their own password matches', async () => {
    const { guard, passwords } = build(null);
    await expect(guard.canActivate(context(admin, 'demo123'))).resolves.toBe(
      true,
    );
    expect(passwords.check).toHaveBeenCalledWith(21n, 'demo123');
  });

  it('refuses any role but admin or superadmin, even with the right password', async () => {
    const { guard, passwords } = build(null);
    const err = await failure(
      guard.canActivate(context({ ...admin, role: 'doctor' }, 'demo123')),
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(passwords.check).not.toHaveBeenCalled();
  });

  it('asks for the password when the header is missing', async () => {
    const { guard } = build(null);
    const err = await failure(guard.canActivate(context(admin)));
    expect((err.getResponse() as { code: string }).code).toBe(
      CONFIRMATION_REQUIRED,
    );
  });

  it('refuses a wrong password', async () => {
    const { guard } = build('wrong_password');
    const err = await failure(guard.canActivate(context(admin, 'nope')));
    expect((err.getResponse() as { code: string }).code).toBe(
      CONFIRMATION_FAILED,
    );
  });

  it('explains when the account has no password (Google sign-in)', async () => {
    const { guard } = build('no_password');
    const err = await failure(guard.canActivate(context(admin, 'anything')));
    expect((err.getResponse() as { code: string }).code).toBe(
      CONFIRMATION_UNAVAILABLE,
    );
  });

  it('refuses when nobody is signed in', async () => {
    const { guard } = build(null);
    await expect(
      guard.canActivate(context(undefined, 'x')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
