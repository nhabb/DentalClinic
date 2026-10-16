import { BadRequestException } from '@nestjs/common';
import { PatientWorkService } from './patient-work.service';

type Rec = {
  id: bigint;
  patient_id: bigint;
  record_type: string;
  title: string;
  tooth_number: string | null;
  treatment_date: Date | null;
  description: string;
  invoice_id: bigint | null;
};

const rec = (over: Partial<Rec>): Rec => ({
  id: 500n,
  patient_id: 7n,
  record_type: 'treatment_plan',
  title: 'Crown',
  tooth_number: '16',
  treatment_date: new Date('2026-10-01T12:00:00Z'),
  description: 'Crown on tooth 16 (planned)',
  invoice_id: null,
  ...over,
});

/** A fake database: the patient's chart records, and the writes the service makes. */
function build(records: Rec[]) {
  const tx = {
    treatment_invoices: { create: jest.fn() },
    patient_records: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    patient_profiles: { findUnique: jest.fn().mockResolvedValue({ id: 7n }) },
    patient_records: {
      findMany: jest.fn().mockResolvedValue(records),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const planQuote = { sync: jest.fn().mockResolvedValue(undefined) };
  const service = new PatientWorkService(prisma as never, planQuote as never);
  return { service, tx, prisma, planQuote };
}

const ACTOR = 21n;

/*
 * The chart plans and prices work on teeth, and the patient's quote follows
 * that plan. It still creates no money: invoices and payments are the billing
 * page's business.
 */

describe('PatientWorkService.completePlanned', () => {
  it('marks planned work as done without pricing or billing it', async () => {
    const { service, tx, prisma } = build([
      rec({ id: 500n }),
      rec({ id: 501n, title: 'Filling', tooth_number: '26' }),
    ]);
    const result = await service.completePlanned({
      patient_id: 7,
      treatment_date: '2026-10-15',
      items: [{ record_id: 500 }, { record_id: 501 }],
    });
    expect(result.completed).toBe(2);
    expect(tx.treatment_invoices.create).not.toHaveBeenCalled();
    // Only the planned ones are asked for: completed work is not re-completed.
    expect(prisma.patient_records.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ record_type: 'treatment_plan' }),
      }),
    );
    for (const id of [500n, 501n]) {
      expect(tx.patient_records.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id },
          data: expect.objectContaining({ record_type: 'treatment' }),
        }),
      );
    }
  });

  it('writes no price onto the record it completes', async () => {
    const { service, tx } = build([rec({ id: 500n })]);
    await service.completePlanned({
      patient_id: 7,
      items: [{ record_id: 500 }],
    });
    const [[call]] = tx.patient_records.update.mock.calls as [
      [{ data: Record<string, unknown> }],
    ];
    expect(call.data).not.toHaveProperty('quoted_amount');
  });

  it('drops the "(planned)" suffix it wrote itself, and keeps a custom note', async () => {
    const { service, tx } = build([
      rec({ id: 500n, description: 'Crown on tooth 16 (planned)' }),
      rec({ id: 501n, description: 'Patient asked to wait until June' }),
    ]);
    await service.completePlanned({
      patient_id: 7,
      items: [{ record_id: 500 }, { record_id: 501 }],
    });
    const byId = new Map(
      (
        tx.patient_records.update.mock.calls as [
          { where: { id: bigint }; data: Record<string, unknown> },
        ][]
      ).map(([c]) => [String(c.where.id), c.data]),
    );
    expect(byId.get('500')?.description).toBe('Crown on tooth 16');
    expect(byId.get('501')).not.toHaveProperty('description');
  });

  it('refuses records that are not this patient’s planned work', async () => {
    const { service } = build([]);
    await expect(
      service.completePlanned({ patient_id: 7, items: [{ record_id: 500 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PatientWorkService.recordWork', () => {
  it('keeps the price it was planned at and never creates an invoice', async () => {
    const { service, tx, prisma } = build([]);
    const result = await service.recordWork(
      {
        patient_id: 7,
        treatment_date: '2026-10-15',
        items: [
          {
            tooth_number: '16',
            procedure_name: 'Crown',
            status: 'completed',
            amount: 250,
          },
          {
            tooth_number: '26',
            procedure_name: 'Filling',
            status: 'planned',
            amount: 80,
          },
          { tooth_number: '36', status: 'missing' },
        ],
      },
      ACTOR,
    );
    expect(result.records_created).toBe(3);
    expect(tx.treatment_invoices.create).not.toHaveBeenCalled();
    const [[call]] = prisma.patient_records.createMany.mock.calls as [
      [{ data: Record<string, unknown>[] }],
    ];
    expect(call.data.map((d) => d.record_type)).toEqual([
      'treatment',
      'treatment_plan',
      'missing_tooth',
    ]);
    expect(call.data.map((d) => d.quoted_amount)).toEqual([250, 80, null]);
    for (const row of call.data) expect(row.created_by).toBe(ACTOR);
  });

  it('records a charge with no tooth, colouring no tooth on the chart', async () => {
    const { service, prisma } = build([]);
    await service.recordWork(
      {
        patient_id: 7,
        treatment_date: '2026-10-16',
        items: [{ procedure_name: 'Checkup', status: 'completed' }],
      },
      ACTOR,
    );
    const [[call]] = prisma.patient_records.createMany.mock.calls as [
      [{ data: { tooth_number: string | null }[] }],
    ];
    expect(call.data[0].tooth_number).toBeNull();
  });
});
