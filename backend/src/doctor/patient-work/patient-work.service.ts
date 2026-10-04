import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RecordWorkDto, WorkStatus } from './dto/record-work.dto';
import { CompleteWorkDto } from './dto/complete-work.dto';

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
  invoice: { select: { id: true, status: true, total_amount: true, remaining_amount: true } },
};

function toDateOnly(value: string): Date {
  return new Date(`${value.split('T')[0]}T12:00:00.000Z`);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Work done on teeth, recorded from the dental chart. Each tooth × procedure
 * becomes one patient_records row (record_type `treatment` or `treatment_plan`)
 * and completed, priced items are billed on a single treatment invoice.
 */
@Injectable()
export class PatientWorkService {
  constructor(private readonly prisma: PrismaService) {}

  private async requirePatient(patientId: bigint) {
    const patient = await this.prisma.patient_profiles.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }

  /** Per-tooth summary (for the chart) plus the chronological work history. */
  async getChart(patientId: bigint) {
    await this.requirePatient(patientId);

    const records = await this.prisma.patient_records.findMany({
      where: { patient_id: patientId, tooth_number: { not: null }, record_type: { in: WORK_RECORD_TYPES } },
      include: historyInclude,
      orderBy: [{ treatment_date: 'asc' }, { id: 'asc' }],
    });

    const teeth: Record<string, ToothSummary> = {};
    for (const r of records) {
      const tooth = r.tooth_number as string;
      const entry = teeth[tooth] ?? { status: 'healthy', last_procedure: null, last_date: null, count: 0 };
      entry.count += 1;
      entry.last_procedure = r.title;
      entry.last_date = r.treatment_date ? r.treatment_date.toISOString().split('T')[0] : null;

      if (r.record_type === 'treatment_plan') {
        entry.status = 'planned';
      } else if (r.record_type === 'missing_tooth' || REMOVES_TOOTH.has(r.title)) {
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

  async recordWork(dto: RecordWorkDto) {
    const patientId = BigInt(dto.patient_id);
    await this.requirePatient(patientId);

    const treatmentDate = toDateOnly(dto.treatment_date);
    const createdBy = dto.created_by ? BigInt(dto.created_by) : null;
    const appointmentId = dto.appointment_id ? BigInt(dto.appointment_id) : null;
    const createInvoice = dto.create_invoice !== false;

    const recordData = (item: RecordWorkDto['items'][number]) => {
      const title = item.status === 'missing' ? MISSING_TITLE : (item.procedure_name as string);
      const defaultDescription =
        item.status === 'missing'
          ? `Tooth ${item.tooth_number} recorded as missing`
          : `${title} on tooth ${item.tooth_number}${item.status === 'planned' ? ' (planned)' : ''}`;
      return {
        patient_id: patientId,
        appointment_id: appointmentId,
        record_type: RECORD_TYPE_FOR_STATUS[item.status],
        title,
        description: item.notes?.trim() || dto.notes?.trim() || defaultDescription,
        tooth_number: item.tooth_number,
        treatment_date: treatmentDate,
        created_by: createdBy,
        // Remember the agreed price so completing a plan later bills it, not the default.
        quoted_amount: item.status !== 'missing' && item.amount != null ? round2(item.amount) : null,
      };
    };

    const billable = createInvoice
      ? dto.items.filter((i) => i.status === 'completed' && (i.amount ?? 0) > 0)
      : [];
    const unbilled = dto.items.filter((i) => !billable.includes(i));

    const total = round2(billable.reduce((s, i) => s + (i.amount ?? 0), 0));

    // One batch transaction: the invoice (with its line items and the records it
    // bills) in a single nested write, plus the remaining records.
    const ops: any[] = [];
    if (billable.length > 0) {
      ops.push(
        this.prisma.treatment_invoices.create({
          data: {
            patient_id: patientId,
            procedure_date: treatmentDate,
            notes: dto.notes?.trim() || null,
            total_amount: total,
            amount_paid: 0,
            remaining_amount: total,
            status: 'open',
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
      ops.push(this.prisma.patient_records.createMany({ data: unbilled.map(recordData) }));
    }

    const results = await this.prisma.$transaction(ops);
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
   * that have no invoice yet.
   */
  async completePlanned(dto: CompleteWorkDto) {
    const patientId = BigInt(dto.patient_id);
    await this.requirePatient(patientId);

    const ids = dto.items.map((i) => BigInt(i.record_id));
    const records = await this.prisma.patient_records.findMany({
      where: {
        id: { in: ids },
        patient_id: patientId,
        OR: [{ record_type: 'treatment_plan' }, { record_type: 'treatment', invoice_id: null }],
      },
    });
    if (records.length !== ids.length) {
      throw new BadRequestException('Every item must be planned or not-yet-billed work belonging to this patient');
    }
    const plannedIds = records.filter((r) => r.record_type === 'treatment_plan').map((r) => r.id);

    const treatmentDate = dto.treatment_date ? toDateOnly(dto.treatment_date) : toDateOnly(new Date().toISOString());
    const createdBy = dto.created_by ? BigInt(dto.created_by) : null;
    const amountOf = new Map(dto.items.map((i) => [String(i.record_id), round2(i.amount ?? 0)]));

    const billable = dto.create_invoice !== false ? records.filter((r) => (amountOf.get(String(r.id)) ?? 0) > 0) : [];
    const total = round2(billable.reduce((s, r) => s + (amountOf.get(String(r.id)) ?? 0), 0));

    const ops: any[] = [];
    if (billable.length > 0) {
      ops.push(
        this.prisma.treatment_invoices.create({
          data: {
            patient_id: patientId,
            procedure_date: treatmentDate,
            notes: dto.notes?.trim() || null,
            total_amount: total,
            amount_paid: 0,
            remaining_amount: total,
            status: 'open',
            created_by: createdBy,
            line_items: {
              create: billable.map((r) => ({
                procedure_name: r.title,
                amount: amountOf.get(String(r.id)) ?? 0,
                tooth_number: r.tooth_number,
              })),
            },
            // connect sets invoice_id on the existing planned records
            patient_records: { connect: billable.map((r) => ({ id: r.id })) },
          },
          include: { line_items: true },
        }),
      );
    }
    for (const r of records) {
      const finalAmount = amountOf.get(String(r.id));
      if (r.record_type !== 'treatment_plan') {
        // Unbilled completed work: keep the price used now as the record's quoted price.
        if (finalAmount !== undefined && finalAmount > 0) {
          ops.push(this.prisma.patient_records.update({ where: { id: r.id }, data: { quoted_amount: finalAmount, updated_at: new Date() } }));
        }
        continue;
      }
      // Drop the "(planned)" suffix from the auto-generated note; keep custom notes as they are.
      const autoPlanned = `${r.title} on tooth ${r.tooth_number} (planned)`;
      ops.push(
        this.prisma.patient_records.update({
          where: { id: r.id },
          data: {
            record_type: 'treatment',
            treatment_date: treatmentDate,
            updated_at: new Date(),
            ...(finalAmount !== undefined && finalAmount > 0 ? { quoted_amount: finalAmount } : {}),
            ...(r.description === autoPlanned ? { description: `${r.title} on tooth ${r.tooth_number}` } : {}),
          },
        }),
      );
    }

    const results = ops.length > 0 ? await this.prisma.$transaction(ops) : [];
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
    const record = await this.prisma.patient_records.findUnique({ where: { id: recordId } });
    if (!record || !WORK_RECORD_TYPES.includes(record.record_type)) {
      throw new NotFoundException('Work record not found');
    }
    if (record.invoice_id) {
      throw new BadRequestException('This work is billed on an invoice; delete the invoice first');
    }
    await this.prisma.patient_records.delete({ where: { id: recordId } });
    return { removed: true, chart: await this.getChart(record.patient_id) };
  }
}
