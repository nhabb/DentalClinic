import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';

function contextFor(
  user: { role: string; permissions: string[] } | undefined,
  required: string[] | undefined,
) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === PERMISSIONS_KEY ? required : undefined,
    ),
  } as unknown as Reflector;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard: new PermissionsGuard(reflector), context };
}

describe('PermissionsGuard', () => {
  it('lets any signed-in user through routes without @RequirePermissions()', () => {
    const { guard, context } = contextFor(
      { role: 'patient', permissions: [] },
      undefined,
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes when the role holds every required permission', () => {
    const { guard, context } = contextFor(
      { role: 'doctor', permissions: ['billing:read', 'billing:write'] },
      ['billing:write'],
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('names the missing permissions when rejecting', () => {
    const { guard, context } = contextFor(
      { role: 'secretary', permissions: ['billing:read'] },
      ['billing:read', 'billing:delete'],
    );
    expect(() => guard.canActivate(context)).toThrow(/billing:delete/);
  });

  it('rejects patients on staff routes', () => {
    const { guard, context } = contextFor(
      { role: 'patient', permissions: [] },
      ['patients:read'],
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('always lets the platform superadmin through', () => {
    const { guard, context } = contextFor(
      { role: 'superadmin', permissions: [] },
      ['roles:manage'],
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects requests without a user', () => {
    const { guard, context } = contextFor(undefined, ['patients:read']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
