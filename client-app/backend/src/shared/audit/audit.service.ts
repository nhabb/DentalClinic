import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  /** Staff member who did it (users.id). */
  actorId: bigint;
  /** Dotted, past-tense-free verb path: "billing.invoice.void", "billing.payment.delete". */
  action: string;
  table: string;
  recordId?: bigint | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes irreversible or sensitive actions (voids, refunds, deletions) into
 * the clinic's audit_logs. The row takes its organization from the request's
 * tenant setting like every tenant row. Never throws: a failed audit write
 * must not undo the action it describes, so it is logged instead.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.audit_logs.create({
        data: {
          user_id: entry.actorId,
          action: entry.action,
          table_name: entry.table,
          record_id: entry.recordId ?? null,
          old_data:
            entry.before === undefined ? undefined : toJson(entry.before),
          new_data: entry.after === undefined ? undefined : toJson(entry.after),
        },
      });
    } catch (err) {
      this.logger.error(
        `Could not write audit entry ${entry.action}: ${(err as Error).message}`,
      );
    }
  }
}

/** JSON-safe copy: BigInt ids become strings, Dates ISO strings, Decimals strings. */
function toJson(value: unknown): object {
  return JSON.parse(
    JSON.stringify(value, (_, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  ) as object;
}
