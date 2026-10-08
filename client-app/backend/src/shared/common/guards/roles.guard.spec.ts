import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function contextFor(
  role: string | undefined,
  required: string[] | undefined,
): ExecutionContext {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === ROLES_KEY ? required : undefined,
    ),
  } as unknown as Reflector;
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  } as unknown as ExecutionContext;
  return Object.assign(ctx, { reflector });
}

describe('RolesGuard', () => {
  const guardFor = (ctx: ExecutionContext) =>
    new RolesGuard((ctx as any).reflector);

  it('allows routes without @Roles()', () => {
    const ctx = contextFor('patient', undefined);
    expect(guardFor(ctx).canActivate(ctx)).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    const ctx = contextFor('admin', ['admin', 'superadmin']);
    expect(guardFor(ctx).canActivate(ctx)).toBe(true);
  });

  it('rejects a user whose role is not listed', () => {
    const ctx = contextFor('doctor', ['admin', 'superadmin']);
    expect(() => guardFor(ctx).canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects requests without an authenticated user', () => {
    const ctx = contextFor(undefined, ['admin']);
    expect(() => guardFor(ctx).canActivate(ctx)).toThrow(ForbiddenException);
  });
});
