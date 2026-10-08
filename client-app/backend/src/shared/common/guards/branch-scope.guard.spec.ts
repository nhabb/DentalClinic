import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BranchScopeGuard } from './branch-scope.guard';
import { EMPTY_TENANT, runWithTenant } from '../../tenant/tenant-context';

function contextWith(body: unknown, query: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body, query }) }),
  } as unknown as ExecutionContext;
}

const scopedTo = (branch: bigint) => ({
  ...EMPTY_TENANT,
  organizationId: 1n,
  branchScopeId: branch,
  source: 'jwt' as const,
});

describe('BranchScopeGuard', () => {
  const guard = new BranchScopeGuard();

  it('lets unconfined users name any branch', () => {
    expect(guard.canActivate(contextWith({ branch_id: 9 }, {}))).toBe(true);
  });

  it('lets confined users omit the branch or name their own', async () => {
    await expect(
      runWithTenant(scopedTo(2n), () => guard.canActivate(contextWith({}, {}))),
    ).resolves.toBe(true);
    await expect(
      runWithTenant(scopedTo(2n), () =>
        guard.canActivate(contextWith({ branch_id: 2 }, { branch_id: '2' })),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a confined user naming another branch in the body', async () => {
    await expect(
      runWithTenant(scopedTo(2n), () =>
        guard.canActivate(contextWith({ branch_id: 3 }, {})),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a confined user naming another branch in the query', async () => {
    await expect(
      runWithTenant(scopedTo(2n), () =>
        guard.canActivate(contextWith(undefined, { branch_id: '3' })),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
