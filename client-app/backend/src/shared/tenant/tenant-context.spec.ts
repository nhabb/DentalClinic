import { ForbiddenException } from '@nestjs/common';
import {
  EMPTY_TENANT,
  TenantContext,
  currentTenant,
  requireOrganizationId,
  runAsSystem,
  runWithTenant,
  toBigIntOrNull,
} from './tenant-context';

const tenant = (overrides: Partial<TenantContext> = {}): TenantContext => ({
  ...EMPTY_TENANT,
  organizationId: 1n,
  source: 'jwt',
  ...overrides,
});

/** A promise that, like a Prisma query, only does its work when awaited. */
function lazy<T>(work: () => T): PromiseLike<T> {
  return {
    then(onFulfilled, onRejected) {
      return Promise.resolve().then(work).then(onFulfilled, onRejected);
    },
  };
}

describe('tenant context', () => {
  it('is empty outside a request', () => {
    expect(currentTenant()).toEqual(EMPTY_TENANT);
  });

  it('is visible to everything awaited inside runWithTenant', async () => {
    const seen = await runWithTenant(
      tenant({ organizationId: 7n }),
      async () => {
        await new Promise((r) => setTimeout(r, 1));
        return currentTenant().organizationId;
      },
    );
    expect(seen).toBe(7n);
    expect(currentTenant()).toEqual(EMPTY_TENANT);
  });

  it('runs lazy (Prisma-like) promises inside the scope, not in the caller', async () => {
    // Regression: a lazy query returned from the callback must still see the tenant.
    const seen = await runWithTenant(tenant({ organizationId: 9n }), () =>
      lazy(() => currentTenant().organizationId),
    );
    expect(seen).toBe(9n);
  });

  it('runAsSystem bypasses RLS but keeps the current organization and branches', async () => {
    const seen = await runWithTenant(
      tenant({ organizationId: 3n, homeBranchId: 4n, branchScopeId: 4n }),
      () => runAsSystem(() => currentTenant()),
    );
    expect(seen).toMatchObject({
      organizationId: 3n,
      homeBranchId: 4n,
      branchScopeId: 4n,
      system: true,
      source: 'system',
    });
  });

  it('runAsSystem accepts overrides', async () => {
    const seen = await runAsSystem(() => currentTenant(), {
      organizationId: 12n,
    });
    expect(seen).toMatchObject({ organizationId: 12n, system: true });
  });

  it('isolates concurrent scopes from each other', async () => {
    const [a, b] = await Promise.all([
      runWithTenant(tenant({ organizationId: 1n }), async () => {
        await new Promise((r) => setTimeout(r, 5));
        return currentTenant().organizationId;
      }),
      runWithTenant(
        tenant({ organizationId: 2n }),
        async () => currentTenant().organizationId,
      ),
    ]);
    expect([a, b]).toEqual([1n, 2n]);
  });

  describe('requireOrganizationId', () => {
    it('returns the organization inside a tenant scope', async () => {
      await expect(
        runWithTenant(tenant({ organizationId: 5n }), () =>
          requireOrganizationId(),
        ),
      ).resolves.toBe(5n);
    });

    it('rejects requests without a tenant', () => {
      expect(() => requireOrganizationId()).toThrow(ForbiddenException);
    });
  });

  describe('toBigIntOrNull', () => {
    it.each([
      ['42', 42n],
      [42, 42n],
      [7n, 7n],
      [null, null],
      [undefined, null],
      ['', null],
      ['abc', null],
    ])('%p -> %p', (input, expected) => {
      expect(toBigIntOrNull(input)).toBe(expected);
    });
  });
});
