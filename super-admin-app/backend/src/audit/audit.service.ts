import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  /** Clinic the change belongs to (audit_logs rows are tenant rows). */
  organizationId: bigint;
  /** Platform admin who made the change. */
  actorId: bigint;
  /** e.g. "platform.account.update", "platform.role.create" */
  action: string;
  table: string;
  recordId?: bigint | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes what the platform console changed inside a clinic into that clinic's
 * audit_logs, so the clinic's own admins can see it. Never throws: an audit
 * failure must not undo the change it describes, so it is logged instead.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.audit_logs.create({
        data: {
          organization_id: entry.organizationId,
          user_id: entry.actorId,
          action: entry.action,
          table_name: entry.table,
          record_id: entry.recordId ?? null,
          old_data: entry.before === undefined ? undefined : toJson(entry.before),
          new_data: entry.after === undefined ? undefined : toJson(entry.after),
        },
      });
    } catch (err) {
      this.logger.error(`Could not write audit entry ${entry.action}: ${(err as Error).message}`);
    }
  }
}

/** JSON-safe copy: BigInt ids become strings, Dates ISO strings. */
function toJson(value: unknown): object {
  return JSON.parse(
    JSON.stringify(value, (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as object;
}
