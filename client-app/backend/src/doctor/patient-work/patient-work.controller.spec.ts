import { ForbiddenException } from '@nestjs/common';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { assertMayBill } from './patient-work.controller';

const access = {
  hasPermission: (actor: RequestUser, permission: string) =>
    actor.role === 'superadmin' || actor.permissions.includes(permission),
};

function userWith(permissions: string[]): RequestUser {
  return {
    id: '7',
    role: 'doctor',
    organization_id: '1',
    branch_id: '1',
    branch_scope_id: null,
    permissions,
  };
}

describe('dental chart billing guard', () => {
  it('lets a role with billing:write bill the work', () => {
    expect(() =>
      assertMayBill(access, userWith(['records:write', 'billing:write']), {}),
    ).not.toThrow();
  });

  it('refuses billing from the chart without billing:write', () => {
    expect(() =>
      assertMayBill(access, userWith(['records:write']), {
        create_invoice: true,
      }),
    ).toThrow(ForbiddenException);
    // The default is to bill, so an omitted flag is refused too.
    expect(() =>
      assertMayBill(access, userWith(['records:write']), {}),
    ).toThrow(ForbiddenException);
  });

  it('still lets that role record the work unbilled', () => {
    expect(() =>
      assertMayBill(access, userWith(['records:write']), {
        create_invoice: false,
      }),
    ).not.toThrow();
  });
});
