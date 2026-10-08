/**
 * Runs the assistant's SELECT inside a read-only transaction that is rolled
 * back if the statement changed any session setting, and caps the rows.
 *
 * Why: the tenant pool scopes a pooled connection with session-level settings
 * (app.current_org, app.bypass_rls, …) that row-level security reads. A SELECT
 * could call set_config() and flip them, and the connection would then serve
 * other requests with the wrong tenant. sql-policy.ts refuses such calls by
 * parsing the SQL; this is the second, database-level layer in case the first
 * is ever wrong. PostgreSQL discards setting changes made inside a rolled-back
 * transaction, so throwing here leaves the connection exactly as it was.
 */

/** Settings the RLS policies and defaults read (see tenant-pool.ts). */
const SESSION_SETTINGS = [
  'app.current_org',
  'app.home_branch',
  'app.branch_scope',
  'app.bypass_rls',
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

export async function runGuardedSelect(
  prisma: TransactionRunner,
  sql: string,
): Promise<GuardedResult> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
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

/** One row beyond the cap tells us whether anything was dropped. */
function capped(sql: string): string {
  return `SELECT * FROM (${sql}) AS agent_query LIMIT ${MAX_ROWS + 1}`;
}

async function snapshot(tx: SqlRunner): Promise<string> {
  const rows = (await tx.$queryRawUnsafe(SNAPSHOT_SQL)) as unknown[];
  return JSON.stringify(rows[0] ?? null);
}
