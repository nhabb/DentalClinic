import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { isSensitiveColumn } from './agent-access';

/** One row of information_schema.columns plus the Postgres comments. */
export interface ColumnRow {
  table_name: string;
  table_comment: string | null;
  column_name: string;
  data_type: string;
  column_comment: string | null;
}

/**
 * Every public table with its columns and the comments stored on them, loaded
 * once at startup so the model writes SQL with real column names and reads
 * each status and amount the way the app means it. The comments live in the
 * database (migration 20261009120000_table_and_column_comments), so Supabase,
 * psql and the assistant all see the same definitions. Credential columns are
 * left out: the assistant can never read them, so it need not know they exist.
 */
@Injectable()
export class SchemaSummary implements OnModuleInit {
  private readonly logger = new Logger(SchemaSummary.name);

  /** Empty until loaded, and empty for the whole run if loading failed. */
  text = '';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      this.text = formatSchema(await this.load());
    } catch (err) {
      // Not fatal: the model then works without column names until a restart.
      const e = err as Error & { code?: string; meta?: unknown };
      this.logger.warn(
        `Could not load DB schema (${e.code ?? e.name}): ${e.message.trim()} ${e.meta ? JSON.stringify(e.meta) : ''}`,
      );
    }
  }

  private load(): Promise<ColumnRow[]> {
    return this.prisma.$queryRaw<ColumnRow[]>`
      SELECT c.table_name::text,
             obj_description(t.oid, 'pg_class') AS table_comment,
             c.column_name::text,
             c.data_type::text,
             col_description(t.oid, c.ordinal_position) AS column_comment
      FROM information_schema.columns c
      JOIN pg_class t ON t.relname = c.table_name
      JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = c.table_schema
      WHERE c.table_schema = 'public' AND t.relkind = 'r'
      ORDER BY c.table_name, c.ordinal_position
    `;
  }
}

/**
 * Text for the prompt:
 *
 *   table: what the table is
 *     column (type): what the column means
 *
 * Tables or columns without a comment print without the description.
 */
export function formatSchema(rows: readonly ColumnRow[]): string {
  const tables = new Map<string, { comment: string | null; cols: string[] }>();
  for (const row of rows) {
    if (isSensitiveColumn(row.column_name)) continue;
    const table = tables.get(row.table_name) ?? {
      comment: row.table_comment,
      cols: [],
    };
    table.cols.push(
      describe(`${row.column_name} (${row.data_type})`, row.column_comment),
    );
    tables.set(row.table_name, table);
  }
  return [...tables]
    .map(
      ([name, { comment, cols }]) =>
        `  ${describe(name, comment)}\n${cols.map((c) => `    ${c}`).join('\n')}`,
    )
    .join('\n');
}

const describe = (subject: string, comment: string | null): string =>
  comment ? `${subject}: ${comment.trim()}` : subject;
