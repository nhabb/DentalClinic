import {
  BadRequestException,
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
import { PlanQuoteService } from '../quotes/plan-quote.service';

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

/** " on tooth 16", or nothing for work that is not about one tooth. */
const onTooth = (tooth: string | null | undefined) =>
  tooth ? ` on tooth ${tooth}` : '';

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
 * becomes one patient_records row (record_type `treatment` or `treatment_plan`).
 * The chart is clinical only: a price here is noted on the record
 * (quoted_amount) for the billing page, which is the one place invoices are
 * created and money is taken.
 */
@Injectable()
export class PatientWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planQuote: PlanQuoteService,
  ) {}

  /**
   * Reprice one planned item from the chart, and let the quote follow.
   * Only planned, unbilled work can be repriced: once it is on an invoice the
   * figure belongs to that invoice.
   */
  async repriceRecord(recordId: bigint, amount: number, actorId: bigint) {
    const record = await this.prisma.patient_records.findFirst({
      where: { id: recordId },
      select: {
        id: true,
        patient_id: true,
        record_type: true,
        invoice_id: true,
      },
    });
    if (!record) throw new NotFoundException('Work record not found');
    if (record.record_type !== 'treatment_plan') {
      throw new BadRequestException(
        'Only planned work is priced on the chart; completed work is priced when it is billed',
      );
    }
    if (record.invoice_id) {
      throw new BadRequestException(
        'This work is already on an invoice; its price belongs to that invoice',
      );
    }
    await this.prisma.patient_records.update({
      where: { id: recordId },
      data: { quoted_amount: round2(amount), updated_at: new Date() },
    });
    await this.planQuote.sync(record.patient_id, actorId);
    return { chart: await this.getChart(record.patient_id) };
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
        record_type: { in: WORK_RECORD_TYPES },
      },
      include: historyInclude,
      orderBy: [{ treatment_date: 'asc' }, { id: 'asc' }],
    });

    const teeth: Record<string, ToothSummary> = {};
    for (const r of records) {
      // Work that is not about one tooth (a consultation, a product, a fee)
      // belongs in the history but colours no tooth on the chart.
      if (!r.tooth_number) continue;
      const tooth = r.tooth_number;
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

    const recordData = (item: RecordWorkDto['items'][number]) => {
      const title =
        item.status === 'missing'
          ? MISSING_TITLE
          : (item.procedure_name as string);
      const defaultDescription =
        item.status === 'missing'
          ? `Tooth ${item.tooth_number} recorded as missing`
          : `${title}${onTooth(item.tooth_number)}${item.status === 'planned' ? ' (planned)' : ''}`;
      return {
        patient_id: patientId,
        appointment_id: appointmentId,
        record_type: RECORD_TYPE_FOR_STATUS[item.status],
        title,
        description:
          item.notes?.trim() || dto.notes?.trim() || defaultDescription,
        tooth_number: item.tooth_number ?? null,
        treatment_date: treatmentDate,
        created_by: createdBy,
        // The price planned at the chair; the patient's quote follows it.
        quoted_amount:
          item.status !== 'missing' && item.amount != null
            ? round2(item.amount)
            : null,
      };
    };

    await this.prisma.patient_records.createMany({
      data: dto.items.map(recordData),
    });
    // Planning priced work changes the plan, so the quote follows it.
    await this.planQuote.sync(patientId, actorId);

    const chart = await this.getChart(patientId);
    return {
      records_created: dto.items.length,
      chart,
    };
  }

  /**
   * Turn planned records into completed treatments: the work was done. No
   * money is involved and no price is given here; an agreed price reaches the
   * record from an accepted quote, and the billing page prices and bills the
   * completed work.
   */
  async completePlanned(dto: CompleteWorkDto) {
    const patientId = BigInt(dto.patient_id);
    await this.requirePatient(patientId);

    const ids = dto.items.map((i) => BigInt(i.record_id));
    const records = await this.prisma.patient_records.findMany({
      where: {
        id: { in: ids },
        patient_id: patientId,
        record_type: 'treatment_plan',
      },
    });
    if (records.length !== ids.length) {
      throw new BadRequestException(
        "Every item must be this patient's planned work",
      );
    }

    const treatmentDate = dto.treatment_date
      ? toDateOnly(dto.treatment_date)
      : toDateOnly(clinicTodayIso());

    // Interactive transaction on purpose: the array form is started from a
    // shared tick and can run under another request's tenant (see tenant-pool.ts).
    const ops: TxOp[] = [];
    for (const r of records) {
      // Drop the "(planned)" suffix from the auto-generated note; keep custom notes as they are.
      const autoPlanned = `${r.title}${onTooth(r.tooth_number)} (planned)`;
      ops.push((tx) =>
        tx.patient_records.update({
          where: { id: r.id },
          data: {
            record_type: 'treatment',
            treatment_date: treatmentDate,
            updated_at: new Date(),
            ...(r.description === autoPlanned
              ? { description: `${r.title}${onTooth(r.tooth_number)}` }
              : {}),
          },
        }),
      );
    }

    await this.runOps(ops);
    // Completed work is no longer planned, so it leaves the quote.
    await this.planQuote.sync(patientId, null);
    return {
      completed: records.length,
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
    await this.planQuote.sync(record.patient_id, null);
    return { removed: true, chart: await this.getChart(record.patient_id) };
  }
}
