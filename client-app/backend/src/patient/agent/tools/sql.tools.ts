import type { PrismaService } from '../../../shared/prisma/prisma.service';
import { redactSensitiveFields, sqlDenial } from '../agent-access';
import { MAX_ROWS, runGuardedSelect } from '../guarded-select';
import { ToolRefusedError, type ToolHandlers } from './tool-handler';

/**
 * The raw SELECT tool. Three layers decide what it may read:
 * the syntax-tree policy (sqlDenial), the database role and policies the
 * guarded transaction switches into, and redaction of credential columns.
 */
export function sqlTools(prisma: PrismaService): ToolHandlers {
  return {
    query_database: async (a, { user }) => {
      const sql = a.strOr('', 'sql');
      const refused = sqlDenial(user, sql);
      if (refused) throw new ToolRefusedError(refused);

      const { rows, truncated } = await runGuardedSelect(
        prisma,
        sql,
        user.role === 'superadmin' ? '*' : user.permissions,
      );
      const data = redactSensitiveFields(rows);
      if (!truncated) return data;
      return {
        rows: data,
        truncated: true,
        note: `Only the first ${MAX_ROWS} rows are shown; narrow the query.`,
      };
    },
  };
}
