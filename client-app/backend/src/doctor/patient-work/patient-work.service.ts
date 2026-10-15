import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { clinicTodayIso } from '../../shared/common/date-only';
import {
  PrismaService,
  REMOTE_TX_OPTIONS,
  Tx,
} from '../../shared/prisma/prisma.service';
import { RecordWorkDto, WorkStatus } from './dto/record-work.dto';
import { CompleteWorkDto } from './dto/complete-work.dto';
import { dueDateFor, invoiceFigures } from '../billing/invoice-math';

export type ToothStatus = 'healthy' | 'treated' | 'planned' | 'missing';

export interface ToothSummary {
  status: ToothStatus;
  last_procedure: string | null;
  last_date: string | null;
  count: number;
}

const RECORD_TYPE_FOR_STATUS: Record<WorkStatus, string> = {
  completed: 'treatment',
  planned: 'treatment_plan',
  missing: 'missing_tooth',
};

const MISSING_TITLE = 'Missing tooth';

const WORK_RECORD_TYPES = Object.values(RECORD_TYPE_FOR_STATUS);

const REMOVES_TOOTH = new Set(['Tooth Extraction']);
const RESTORES_TOOTH = new Set(['Implant', 'Bridge']);

const historyInclude = {
  users: { select: { id: true, first_name: true, last_name: true } },
  invoice: {
    select: {
      id: true,
      status: true,
      total_amount: true,
      remaining_amount: true,
    },
  },
};

function toDateOnly(value: string): Date {
  return new Date(`${value.split('T')[0]}T12:00:00.000Z`);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One write of a patient-work transaction, run in order inside it. */
type TxOp = (tx: Tx) => Promise<unknown>;

/**
 * Work done on teeth, recorded from the dental chart. Each tooth × procedure
 * becomes one patient_records row (record_type `treatment` or `treatment_plan`)
 * and completed, priced items are billed on a single treatment invoice.
 */
@Injectable()
export class PatientWorkService {
  constructor(private readonly prisma: PrismaService) {}

  /** The latest accepted quote that priced any of these chart records, or null. */
  private async acceptedQuoteFor(
    tx: Tx,
    recordIds: bigint[],
  ): Promise<bigint | null> {
    const line = await tx.quote_items.findFirst({
      where: { record_id: { in: recordIds }, quote: { status: 'accepted' } },
      orderBy: { quote: { accepted_at: 'desc' } },
      select: { quote_id: true },
    });
    return line?.quote_id ?? null;
  }

  /** Run the writes in order inside one transaction; nothing to do = no transaction. */
  private runOps(ops: TxOp[]): Promise<unknown[]> {
    if (ops.length === 0) return Promise.resolve([]);
    return this.prisma.$transaction(async (tx) => {
      const results: unknown[] = [];
      for (const op of ops) results.push(await op(tx));
      return results;
    }, REMOTE_TX_OPTIONS);
  }

  private async requirePatient(patientId: bigint) {
    const patient = await this.prisma.patient_profiles.findUnique({
      where: { id: patientId },
    });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }

  /** Per-tooth summary (for the chart) plus the chronological work history. */
  async getChart(patientId: bigint) {
    await this.requirePatient(patientId);

    const records = await this.prisma.patient_records.findMany({
      where: {
        patient_id: patientId,
        tooth_number: { not: null },
        record_type: { in: WORK_RECORD_TYPES },
      },
      include: historyInclude,
      orderBy: [{ treatment_date: 'asc' }, { id: 'asc' }],
    });

    const teeth: Record<string, ToothSummary> = {};
    for (const r of records) {
      const tooth = r.tooth_number as string;
      const entry = teeth[tooth] ?? {
        status: 'healthy',
        last_procedure: null,
        last_date: null,
        count: 0,
      };
      entry.count += 1;
      entry.last_procedure = r.title;
      entry.last_date = r.treatment_date
        ? r.treatment_date.toISOString().split('T')[0]
        : null;

      if (r.record_type === 'treatment_plan') {
        entry.status = 'planned';
      } else if (
        r.record_type === 'missing_tooth' ||
        REMOVES_TOOTH.has(r.title)
      ) {
        entry.status = 'missing';
      } else if (RESTORES_TOOTH.has(r.title) || entry.status !== 'missing') {
        entry.status = 'treated';
      }
      teeth[tooth] = entry;
    }

    return {
      teeth,
      history: [...records].reverse(),
    };
  }

  async recordWork(dto: RecordWorkDto, actorId: bigint) {
    const patientId = BigInt(dto.patient_id);
    await this.requirePatient(patientId);

    const treatmentDate = toDateOnly(dto.treatment_date);
    const createdBy = actorId;
    const appointmentId = dto.appointment_id
      ? BigInt(dto.appointment_id)
      : null;
    const createInvoice = dto.create_invoice !== false;

    const recordData = (item: RecordWorkDto['items'][number]) => {
      const title =
        item.status === 'missing'
          ? MISSING_TITLE
          : (item.procedure_name as string);
      const defaultDescription =
        item.status === 'missing'
          ? `Tooth ${item.tooth_number} recorded as missing`
          : `${title} on tooth ${item.tooth_number}${item.status === 'planned' ? ' (planned)' : ''}`;
      return {
        patient_id: patientId,
        appointment_id: appointmentId,
        record_type: RECORD_TYPE_FOR_STATUS[item.status],
        title,
        description:
          item.notes?.trim() || dto.notes?.trim() || defaultDescription,
        tooth_number: item.tooth_number,
        treatment_date: treatmentDate,
        created_by: createdBy,
        // Remember the agreed price so completing a plan later bills it, not the default.
        quoted_amount:
          item.status !== 'missing' && item.amount != null
            ? round2(item.amount)
            : null,
      };
    };

    const billable = createInvoice
      ? dto.items.filter((i) => i.status === 'completed' && (i.amount ?? 0) > 0)
      : [];
    const unbilled = dto.items.filter((i) => !billable.includes(i));

    // One transaction: the invoice (with its line items and the records it
    // bills) in a single nested write, plus the remaining records.
    // Interactive transaction on purpose: the array form is started from a
    // shared tick and can run under another request's tenant (see tenant-pool.ts).
    const ops: TxOp[] = [];
    if (billable.length > 0) {
      ops.push((tx) =>
        tx.treatment_invoices.create({
          data: {
            patient_id: patientId,
            procedure_date: treatmentDate,
            due_date: dueDateFor(treatmentDate),
            notes: dto.notes?.trim() || null,
            ...invoiceFigures(billable.map((i) => i.amount ?? 0)),
            created_by: createdBy,
            line_items: {
              create: billable.map((i) => ({
                procedure_name: i.procedure_name as string,
                amount: round2(i.amount ?? 0),
                tooth_number: i.tooth_number,
              })),
            },
            patient_records: { create: billable.map(recordData) },
          },
          include: { line_items: true },
        }),
      );
    }
    if (unbilled.length > 0) {
      ops.push((tx) =>
        tx.patient_records.createMany({
          data: unbilled.map(recordData),
        }),
      );
    }

    const results = await this.runOps(ops);
    const invoice = billable.length > 0 ? results[0] : null;

    const chart = await this.getChart(patientId);
    return {
      invoice,
      records_created: dto.items.length,
      chart,
    };
  }

  /**
   * Turn planned records into completed treatments and/or bill work that is
   * not yet on an invoice. Items with a price are billed together on one new
   * invoice and linked to it. Accepts planned records and completed records
   * that have no invoice yet; planned work already invoiced from its quote
   * is completed without a price.
   */
  async completePlanned(dto: CompleteWorkDto, actorId: bigint) {
    const patientId = BigInt(dto.patient_id);
    await this.requirePatient(patientId);

    const ids = dto.items.map((i) => BigInt(i.record_id));
    const records = await this.prisma.patient_records.findMany({
      where: {
        id: { in: ids },
        patient_id: patientId,
        OR: [
          { record_type: 'treatment_plan' },
          { record_type: 'treatment', invoice_id: null },
        ],
      },
    });
    if (records.length !== ids.length) {
      throw new BadRequestException(
        'Every item must be planned or not-yet-billed work belonging to this patient',
      );
    }
    const plannedIds = records
      .filter((r) => r.record_type === 'treatment_plan')
      .map((r) => r.id);

    const treatmentDate = dto.treatment_date
      ? toDateOnly(dto.treatment_date)
      : toDateOnly(clinicTodayIso());
    const createdBy = actorId;
    const amountOf = new Map(
      dto.items.map((i) => [String(i.record_id), round2(i.amount ?? 0)]),
    );

    // Work already on an invoice (billed up front from a quote, or on an
    // earlier visit) is completed here but never billed a second time.
    const priced = records.filter((r) => (amountOf.get(String(r.id)) ?? 0) > 0);
    const alreadyBilled = priced.filter((r) => r.invoice_id !== null);
    if (alreadyBilled.length > 0) {
      const names = alreadyBilled
        .map((r) => `${r.title} on tooth ${r.tooth_number}`)
        .join(', ');
      throw new BadRequestException(
        `Already billed on an invoice, send no amount for: ${names}`,
      );
    }
    const billable = dto.create_invoice !== false ? priced : [];

    // Interactive transaction on purpose: the array form is started from a
    // shared tick and can run under another request's tenant (see tenant-pool.ts).
    const ops: TxOp[] = [];
    if (billable.length > 0) {
      ops.push(async (tx) => {
        const invoice = await tx.treatment_invoices.create({
          data: {
            patient_id: patientId,
            procedure_date: treatmentDate,
            due_date: dueDateFor(treatmentDate),
            notes: dto.notes?.trim() || null,
            ...invoiceFigures(
              billable.map((r) => amountOf.get(String(r.id)) ?? 0),
            ),
            created_by: createdBy,
            // The accepted quote these records were priced on, if any: quoted vs billed stays comparable.
            quote_id: await this.acceptedQuoteFor(
              tx,
              billable.map((r) => r.id),
            ),
            line_items: {
              create: billable.map((r) => ({
                procedure_name: r.title,
                amount: amountOf.get(String(r.id)) ?? 0,
                tooth_number: r.tooth_number,
              })),
            },
          },
          include: { line_items: true },
        });
        // Attach only records that are still unbilled: a quote invoiced at the
        // same moment wins the row, and this transaction rolls back instead of
        // billing the work twice (the database refuses to move a billed record too).
        const attached = await tx.patient_records.updateMany({
          where: { id: { in: billable.map((r) => r.id) }, invoice_id: null },
          data: { invoice_id: invoice.id, updated_at: new Date() },
        });
        if (attached.count !== billable.length) {
          throw new ConflictException(
            'Some of this work was billed a moment ago (from its quote or another desk); refresh the chart',
          );
        }
        return invoice;
      });
    }
    for (const r of records) {
      const finalAmount = amountOf.get(String(r.id));
      if (r.record_type !== 'treatment_plan') {
        // Unbilled completed work: keep the price used now as the record's quoted price.
        if (finalAmount !== undefined && finalAmount > 0) {
          ops.push((tx) =>
            tx.patient_records.update({
              where: { id: r.id },
              data: { quoted_amount: finalAmount, updated_at: new Date() },
            }),
          );
        }
        continue;
      }
      // Drop the "(planned)" suffix from the auto-generated note; keep custom notes as they are.
      const autoPlanned = `${r.title} on tooth ${r.tooth_number} (planned)`;
      ops.push((tx) =>
        tx.patient_records.update({
          where: { id: r.id },
          data: {
            record_type: 'treatment',
            treatment_date: treatmentDate,
            updated_at: new Date(),
            ...(finalAmount !== undefined && finalAmount > 0
              ? { quoted_amount: finalAmount }
              : {}),
            ...(r.description === autoPlanned
              ? { description: `${r.title} on tooth ${r.tooth_number}` }
              : {}),
          },
        }),
      );
    }

    const results = await this.runOps(ops);
    const invoice = billable.length > 0 ? results[0] : null;
    return {
      invoice,
      completed: plannedIds.length,
      billed: billable.length,
      chart: await this.getChart(patientId),
    };
  }

  /** Remove a planned or missing-tooth record. Billed work must be removed via its invoice. */
  async removeRecord(recordId: bigint) {
    const record = await this.prisma.patient_records.findUnique({
      where: { id: recordId },
    });
    if (!record || !WORK_RECORD_TYPES.includes(record.record_type)) {
      throw new NotFoundException('Work record not found');
    }
    if (record.invoice_id) {
      throw new BadRequestException(
        'This work is billed on an invoice; delete the invoice first',
      );
    }
    await this.prisma.patient_records.delete({ where: { id: recordId } });
    return { removed: true, chart: await this.getChart(record.patient_id) };
  }
}
