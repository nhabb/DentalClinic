import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  checkSql,
  redactSensitiveFields,
  type TableCheck,
} from '../agent-access';
import { contentLogsEnabled, logText } from '../agent-log';
import { AGENT_DB_ROLE, runGuardedSelect } from '../guarded-select';
import { ToolRefusedError, type ToolHandlers } from './tool-handler';

const logger = new Logger('query_database');

/** "patient_profiles needs patients:read -> ok; invoice_payments needs billing:read -> MISSING" */
function describeTableCheck(tables: TableCheck[]): string {
  if (tables.length === 0) return '(no tables: refused before parsing)';
  return tables
    .map(({ table, permission, granted }) => {
      if (permission === undefined) return `${table} -> UNKNOWN TABLE`;
      if (permission === null) return `${table} needs nothing -> ok`;
      return `${table} needs ${permission} -> ${granted ? 'ok' : 'MISSING'}`;
    })
    .join('; ');
}

/**
 * The raw SELECT tool. Three layers decide what it may read:
 * the syntax-tree policy (sqlDenial), the database role and policies the
 * guarded transaction switches into, and redaction of credential columns.
 */
export function sqlTools(prisma: PrismaService): ToolHandlers {
  return {
    query_database: async (a, { user }) => {
      const sql = a.strOr('', 'sql');
      const who = `user ${user.id} (${user.role})`;
      if (contentLogsEnabled()) {
        logger.debug(`SQL from ${who}: ${logText(sql)}`);
      }

      const { denial, tables } = checkSql(user, sql);
      logger.debug(`Table check for ${who}: ${describeTableCheck(tables)}`);
      if (denial) {
        logger.debug(`Decision for ${who}: REFUSED in the app - ${denial}`);
        throw new ToolRefusedError(denial);
      }

      const permissions = user.role === 'superadmin' ? '*' : user.permissions;
      logger.debug(
        `Decision for ${who}: allowed, running read-only as ${AGENT_DB_ROLE} with permissions [${
          permissions === '*' ? '*' : permissions.join(', ')
        }]; the database re-checks each table`,
      );
      const { rows, truncated } = await runGuardedSelect(
        prisma,
        sql,
        permissions,
      );
      logger.debug(
        `Database returned ${rows.length} row(s) for ${who}${truncated ? ' (more existed, cut at the cap)' : ''}; secret-looking fields redacted`,
      );
      // { rows, truncated } so the runner can attach coverage (see result-coverage.ts).
      return { rows: redactSensitiveFields(rows), truncated };
    },
  };
}
