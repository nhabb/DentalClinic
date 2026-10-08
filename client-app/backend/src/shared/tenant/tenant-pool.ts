import { Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { TenantContext, currentTenant } from './tenant-context';

/**
 * Database role the backend switches every connection into. It has NOBYPASSRLS,
 * unlike the Supabase `postgres` login, so row-level security actually applies.
 * Set DB_APP_ROLE to an empty string to skip the switch (local databases without
 * the role) — RLS is then NOT enforced if the login role bypasses it.
 */
export function configuredAppRole(): string {
  return process.env.DB_APP_ROLE === undefined
    ? 'dental_app'
    : process.env.DB_APP_ROLE.trim();
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

type PrimedClient = PoolClient & {
  /** SET ROLE already issued on this physical connection. */
  __tenantRoleSet?: boolean;
  /** Last settings applied, to skip redundant set_config calls. */
  __tenantKey?: string;
};

type ConnectCallback = (
  err: Error | undefined,
  client: PoolClient | undefined,
  release: (release?: unknown) => void,
) => void;

/** The PostgreSQL settings the RLS policies and column defaults read ('' = unset). */
export interface TenantSettings {
  /** app.current_org: tenant whose rows are visible. */
  org: string;
  /** app.home_branch: default branch for new rows (app.default_branch_id()). */
  homeBranch: string;
  /** app.branch_scope: when set, only this branch's rows are visible/writable. */
  branchScope: string;
  /** app.bypass_rls: 'on' lets the connection see every tenant. */
  bypass: 'on' | 'off';
}

export function tenantSettings(ctx: TenantContext): TenantSettings {
  return {
    org: ctx.organizationId?.toString() ?? '',
    homeBranch: ctx.homeBranchId?.toString() ?? '',
    branchScope: ctx.branchScopeId?.toString() ?? '',
    bypass: ctx.system ? 'on' : 'off',
  };
}

/**
 * A pg Pool that tags every checked-out connection with the current request's
 * tenant before anyone can run a query on it.
 *
 * Prisma's pg adapter acquires connections through `pool.connect()` (for
 * transactions) and `pool.query()` (which calls `connect()` internally), so
 * overriding `connect` covers every statement. The settings are session-level,
 * so they survive BEGIN/ROLLBACK and are overwritten on the next checkout.
 *
 * Requires a session-mode connection (direct :5432 or Supavisor session mode).
 * Transaction-mode poolers would not keep SET ROLE / set_config between statements.
 */
export class TenantPool extends Pool {
  private static readonly logger = new Logger('TenantPool');
  private static warnedNoRole = false;

  connect(): Promise<PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    if (callback) {
      super.connect((err, client, release) => {
        if (err || !client) return callback(err, client, release);
        this.prime(client as PrimedClient).then(
          () => callback(undefined, client, release),
          (primeErr: Error) => {
            release(primeErr);
            callback(primeErr, undefined, release);
          },
        );
      });
      return;
    }
    return super.connect().then(async (client) => {
      try {
        await this.prime(client as PrimedClient);
        return client;
      } catch (primeErr) {
        client.release(primeErr as Error);
        throw primeErr;
      }
    });
  }

  /** Apply the current request's tenant to a freshly checked-out connection. */
  protected async prime(client: PrimedClient): Promise<void> {
    const s = tenantSettings(currentTenant());
    const role = configuredAppRole();

    if (role && !client.__tenantRoleSet) {
      try {
        await client.query(`SET ROLE ${quoteIdent(role)}`);
      } catch (err) {
        TenantPool.logger.error(
          `Could not SET ROLE ${role}: ${(err as Error).message}. ` +
            'Apply the multi-tenant migrations or set DB_APP_ROLE="" for a database without the role.',
        );
        throw err;
      }
      client.__tenantRoleSet = true;
    } else if (!role && !TenantPool.warnedNoRole) {
      TenantPool.warnedNoRole = true;
      TenantPool.logger.warn(
        'DB_APP_ROLE is empty: not switching roles; RLS is only enforced if the login role lacks BYPASSRLS.',
      );
    }

    const key = `${s.org}|${s.homeBranch}|${s.branchScope}|${s.bypass}`;
    if (client.__tenantKey === key) return;
    await client.query(
      'SELECT set_config($1, $2, false), set_config($3, $4, false), set_config($5, $6, false), set_config($7, $8, false)',
      [
        'app.current_org',
        s.org,
        'app.home_branch',
        s.homeBranch,
        'app.branch_scope',
        s.branchScope,
        'app.bypass_rls',
        s.bypass,
      ],
    );
    client.__tenantKey = key;
  }
}
