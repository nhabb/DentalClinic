import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';

/** Outcome of checking the token's account against the database. */
export type AccountStatus =
  | 'active'
  | 'inactive'
  | 'organization_inactive'
  | 'unknown';

/**
 * Who the current request is acting for.
 *
 * Established once per HTTP request by TenantContextMiddleware and read by
 * TenantPool right before a database connection is handed to Prisma, so every
 * SQL statement runs with the `app.*` settings for this tenant. Row-level
 * security does the rest.
 */
export interface TenantContext {
  /** Tenant (organizations.id) the request is scoped to. null = no tenant. */
  organizationId: bigint | null;
  /** The user's home branch: where their new slots/stock/invoices land by default. */
  homeBranchId: bigint | null;
  /**
   * When set, the user may only see and touch rows of this branch (plus
   * organization-wide rows with no branch). null = all branches of the tenant.
   */
  branchScopeId: bigint | null;
  userId: bigint | null;
  role: string | null;
  /** Status of the authenticated account, or null for anonymous requests. */
  accountStatus: AccountStatus | null;
  /**
   * Bypass row-level security. Only for platform superadmins and for the few
   * identity lookups that must see across tenants (login by email, invite tokens).
   */
  system: boolean;
  /** Where the tenant came from; useful in logs. */
  source: 'jwt' | 'header' | 'host' | 'default' | 'system' | 'none';
}

export const EMPTY_TENANT: Readonly<TenantContext> = Object.freeze({
  organizationId: null,
  homeBranchId: null,
  branchScopeId: null,
  userId: null,
  role: null,
  accountStatus: null,
  system: false,
  source: 'none',
});

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/** The tenant context of the current async chain (EMPTY_TENANT outside a request). */
export function currentTenant(): TenantContext {
  return tenantStorage.getStore() ?? EMPTY_TENANT;
}

/**
 * Run `fn` with the given context; everything it awaits inherits it.
 *
 * The callback is awaited *inside* the scope on purpose. Prisma queries are lazy
 * promises that only hit the database when awaited, so returning one from the
 * callback and awaiting it outside would run it with the caller's context, not
 * this one (that was exactly how login first broke under RLS).
 */
export function runWithTenant<T>(
  ctx: TenantContext,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  return tenantStorage.run(ctx, async () => await fn());
}

/**
 * Run `fn` with RLS bypassed. The current organization (if any) is kept so that
 * rows inserted inside still default to the right tenant.
 */
export function runAsSystem<T>(
  fn: () => T | PromiseLike<T>,
  overrides: Partial<TenantContext> = {},
): Promise<T> {
  const cur = currentTenant();
  return runWithTenant(
    { ...cur, ...overrides, system: true, source: 'system' },
    fn,
  );
}

/** The organization of the current request, or 403 if the request has none. */
export function requireOrganizationId(): bigint {
  const { organizationId } = currentTenant();
  if (organizationId === null) {
    throw new ForbiddenException(
      'No clinic organization is associated with this request. Sign in again or pass the X-Organization header.',
    );
  }
  return organizationId;
}

export function toBigIntOrNull(value: unknown): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    return null;
  }
}
