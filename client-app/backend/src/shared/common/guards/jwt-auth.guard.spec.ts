import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  AccountStatus,
  EMPTY_TENANT,
  runWithTenant,
} from '../../tenant/tenant-context';

const SECRET = 'guard-secret';

function setup(opts: { isPublic?: boolean; authorization?: string }) {
  const request: {
    headers: Record<string, string | undefined>;
    user?: unknown;
  } = {
    headers: { authorization: opts.authorization },
  };
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === IS_PUBLIC_KEY ? opts.isPublic : undefined,
    ),
  } as unknown as Reflector;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard: new JwtAuthGuard(reflector), context, request };
}

const token = () => `Bearer ${jwt.sign({ sub: '7', role: 'doctor' }, SECRET)}`;

const asAccount = (accountStatus: AccountStatus) => ({
  ...EMPTY_TENANT,
  userId: 7n,
  role: 'doctor',
  organizationId: 1n,
  homeBranchId: 2n,
  accountStatus,
  source: 'jwt' as const,
});

describe('JwtAuthGuard', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it('rejects requests without a token', () => {
    const { guard, context } = setup({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects forged tokens', () => {
    const forged = `Bearer ${jwt.sign({ sub: '7' }, 'other')}`;
    const { guard, context } = setup({ authorization: forged });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('accepts an active account and exposes it as request.user', async () => {
    const { guard, context, request } = setup({ authorization: token() });
    await expect(
      runWithTenant(asAccount('active'), () => guard.canActivate(context)),
    ).resolves.toBe(true);
    expect(request.user).toEqual({
      id: '7',
      role: 'doctor',
      organization_id: '1',
      branch_id: '2',
      branch_scope_id: null,
      permissions: [],
    });
  });

  it('rejects a disabled account even with a valid token', async () => {
    const { guard, context } = setup({ authorization: token() });
    await expect(
      runWithTenant(asAccount('inactive'), () => guard.canActivate(context)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects members of a deactivated clinic', async () => {
    const { guard, context } = setup({ authorization: token() });
    await expect(
      runWithTenant(asAccount('organization_inactive'), () =>
        guard.canActivate(context),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects tokens for accounts that no longer exist', async () => {
    const { guard, context } = setup({ authorization: token() });
    await expect(
      runWithTenant(asAccount('unknown'), () => guard.canActivate(context)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('lets anonymous requests through on public routes', () => {
    const { guard, context, request } = setup({ isPublic: true });
    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('still identifies an active caller on public routes', async () => {
    const { guard, context, request } = setup({
      isPublic: true,
      authorization: token(),
    });
    await runWithTenant(asAccount('active'), () => guard.canActivate(context));
    expect(request.user).toMatchObject({ id: '7', role: 'doctor' });
  });
});
