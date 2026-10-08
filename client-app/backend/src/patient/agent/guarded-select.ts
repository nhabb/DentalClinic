/**
 * Runs the assistant's SELECT the way the database can vouch for it:
 *
 *   1. in a READ ONLY transaction,
 *   2. as the role `dental_agent`, whose restrictive RLS policies require the
 *      caller's permission keys (passed as a transaction-local setting) for
 *      every table they read: see migration 20261008210000_agent_permissions_rls,
 *   3. wrapped with a row cap,
 *   4. rolled back if the statement changed any session setting.
 *
 * Why: the tenant pool scopes a pooled connection with session-level settings
 * (app.current_org, app.bypass_rls, …) that row-level security reads. A SELECT
 * could call set_config() and flip them, and the connection would then serve
 * other requests with the wrong tenant. sql-policy.ts refuses such calls by
 * parsing the SQL; this is the database-level layer in case the first is ever
 * wrong: the role switch and the settings revert at the end of the transaction
 * whatever the statement did, and PostgreSQL discards setting changes made
 * inside a rolled-back transaction.
 */

/** Database role the assistant's SELECT runs as (see the migration). */
export const AGENT_DB_ROLE = 'dental_agent';

/** Transaction-local setting the agent policies read the permission list from. */
export const AGENT_PERMISSIONS_SETTING = 'app.agent_permissions';

/** The caller's permission keys, or '*' for platform superadmins. */
export type AgentPermissions = readonly string[] | '*';

/** Settings the RLS policies and defaults read (see tenant-pool.ts and the migration). */
const SESSION_SETTINGS = [
  'app.current_org',
  'app.home_branch',
  'app.branch_scope',
  'app.bypass_rls',
  AGENT_PERMISSIONS_SETTING,
] as const;

const SNAPSHOT_SQL =
  'SELECT ' +
  SESSION_SETTINGS.map(
    (name, i) => `current_setting('${name}', true) AS s${i}`,
  ).join(', ') +
  ', current_user AS db_role';

/** Rows handed to the model per query; more would not fit a useful answer. */
export const MAX_ROWS = 200;

/** Upper bound for one query, so a heavy SELECT cannot hold a tenant connection. */
export const QUERY_TIMEOUT_MS = 15_000;

/** Permission keys are catalog entries like "billing:read"; anything else is dropped. */
const PERMISSION_KEY = /^[a-z_]+:[a-z_]+$/;

export interface SqlRunner {
  $queryRawUnsafe(sql: string): Promise<unknown>;
  $executeRawUnsafe(sql: string): Promise<number>;
}

export interface TransactionRunner {
  $transaction<T>(
    fn: (tx: SqlRunner) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T>;
}

export interface GuardedResult {
  rows: unknown[];
  /** True when more than MAX_ROWS matched and the rest were dropped. */
  truncated: boolean;
}

export class SessionTamperedError extends Error {
  constructor() {
    super('The query tried to change session settings and was rolled back.');
    this.name = 'SessionTamperedError';
  }
}

/** True for the error PostgreSQL raises when the agent policies refuse a read. */
export function isDatabasePermissionRefusal(err: unknown): boolean {
  const message = (err as Error)?.message ?? '';
  return (
    /permission [a-z_]+:[a-z_]+ is required to read this table/.test(message) ||
    message.includes('agent permissions are not set for this transaction')
  );
}

export async function runGuardedSelect(
  prisma: TransactionRunner,
  sql: string,
  permissions: AgentPermissions,
): Promise<GuardedResult> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${AGENT_DB_ROLE}`);
      await tx.$queryRawUnsafe(
        `SELECT set_config('${AGENT_PERMISSIONS_SETTING}', '${permissionList(permissions)}', true)`,
      );
      const before = await snapshot(tx);
      const rows = (await tx.$queryRawUnsafe(capped(sql))) as unknown[];
      const after = await snapshot(tx);
      if (before !== after) throw new SessionTamperedError();
      return rows.length > MAX_ROWS
        ? { rows: rows.slice(0, MAX_ROWS), truncated: true }
        : { rows, truncated: false };
    },
    { timeout: QUERY_TIMEOUT_MS },
  );
}

/** "a:b,c:d" from catalog-shaped keys only, so the literal is always safe to inline. */
export function permissionList(permissions: AgentPermissions): string {
  if (permissions === '*') return '*';
  return permissions.filter((key) => PERMISSION_KEY.test(key)).join(',');
}

/** One row beyond the cap tells us whether anything was dropped. */
function capped(sql: string): string {
  return `SELECT * FROM (${sql}) AS agent_query LIMIT ${MAX_ROWS + 1}`;
}

async function snapshot(tx: SqlRunner): Promise<string> {
  const rows = (await tx.$queryRawUnsafe(SNAPSHOT_SQL)) as unknown[];
  return JSON.stringify(rows[0] ?? null);
}
