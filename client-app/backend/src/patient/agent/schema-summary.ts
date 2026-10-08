import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { isSensitiveColumn } from './agent-access';

/**
 * "table: column (type), …" for every public table, loaded once at startup so
 * the model writes SQL with real column names. Credential columns are left
 * out: the assistant can never read them, so it need not know they exist.
 */
@Injectable()
export class SchemaSummary implements OnModuleInit {
  private readonly logger = new Logger(SchemaSummary.name);

  /** Empty until loaded, and empty for the whole run if loading failed. */
  text = '';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      this.text = await this.load();
    } catch (err) {
      // Not fatal: the model then works without column names until a restart.
      const e = err as Error & { code?: string; meta?: unknown };
      this.logger.warn(
        `Could not load DB schema (${e.code ?? e.name}): ${e.message.trim()} ${e.meta ? JSON.stringify(e.meta) : ''}`,
      );
    }
  }

  private async load(): Promise<string> {
    const rows = await this.prisma.$queryRaw<
      { table_name: string; column_name: string; data_type: string }[]
    >`
      SELECT table_name::text, column_name::text, data_type::text
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `;
    const tables = new Map<string, string[]>();
    for (const row of rows) {
      if (isSensitiveColumn(row.column_name)) continue;
      const cols = tables.get(row.table_name) ?? [];
      cols.push(`${row.column_name} (${row.data_type})`);
      tables.set(row.table_name, cols);
    }
    return [...tables]
      .map(([table, cols]) => `  ${table}: ${cols.join(', ')}`)
      .join('\n');
  }
}
