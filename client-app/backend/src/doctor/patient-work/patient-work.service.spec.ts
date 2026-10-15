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
function build(records: Rec[], acceptedQuoteId: bigint | null = null) {
  const tx = {
    treatment_invoices: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 5n,
          invoice_number: 'INV-2026-00005',
          ...data,
          line_items: (data.line_items as { create: unknown[] }).create,
        }),
      ),
    },
    patient_records: {
      update: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn(({ where }: { where: { id: { in: bigint[] } } }) =>
        Promise.resolve({ count: where.id.in.length }),
      ),
    },
    quote_items: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          acceptedQuoteId === null ? null : { quote_id: acceptedQuoteId },
        ),
    },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    patient_profiles: { findUnique: jest.fn().mockResolvedValue({ id: 7n }) },
    patient_records: {
      findMany: jest.fn().mockResolvedValue(records),
    },
  };
  const service = new PatientWorkService(prisma as never);
  return { service, tx, prisma };
}

const ACTOR = 21n;

const invoiceData = (tx: ReturnType<typeof build>['tx']) =>
  tx.treatment_invoices.create.mock.calls[0][0].data;

describe('PatientWorkService.completePlanned', () => {
  it('bills priced work on one invoice with the shared figures, linked to the records and their accepted quote', async () => {
    const { service, tx } = build(
      [
        rec({ id: 500n }),
        rec({ id: 501n, title: 'Filling', tooth_number: '26' }),
      ],
      3n,
    );
    const result = await service.completePlanned(
      {
        patient_id: 7,
        treatment_date: '2026-10-15',
        items: [
          { record_id: 500, amount: 250 },
          { record_id: 501, amount: 80 },
        ],
      },
      ACTOR,
    );
    expect(result.billed).toBe(2);
    expect(result.completed).toBe(2);
    const data = invoiceData(tx);
    expect(data).toMatchObject({
      patient_id: 7n,
      subtotal: 330,
      discount_amount: 0,
      total_amount: 330,
      remaining_amount: 330,
      status: 'open',
      quote_id: 3n,
      created_by: ACTOR,
    });
    // Attached only while still unbilled, never by an unconditional connect.
    expect(tx.patient_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [500n, 501n] }, invoice_id: null },
        data: expect.objectContaining({ invoice_id: 5n }),
      }),
    );
    // Due on the day of the work: the dental norm.
    expect(data.due_date).toEqual(data.procedure_date);
    expect(tx.patient_records.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 500n },
        data: expect.objectContaining({ record_type: 'treatment' }),
      }),
    );
  });

  it('refuses a price for planned work that is already on an invoice', async () => {
    const { service, tx } = build([rec({ id: 500n, invoice_id: 9n })]);
    await expect(
      service.completePlanned(
        { patient_id: 7, items: [{ record_id: 500, amount: 250 }] },
        ACTOR,
      ),
    ).rejects.toThrow(/Already billed.*Crown on tooth 16/);
    expect(tx.treatment_invoices.create).not.toHaveBeenCalled();
    expect(tx.patient_records.update).not.toHaveBeenCalled();
  });

  it('completes planned work billed up front from its quote without billing it again', async () => {
    const { service, tx } = build([rec({ id: 500n, invoice_id: 9n })]);
    const result = await service.completePlanned(
      { patient_id: 7, items: [{ record_id: 500 }] },
      ACTOR,
    );
    expect(result.billed).toBe(0);
    expect(result.completed).toBe(1);
    expect(tx.treatment_invoices.create).not.toHaveBeenCalled();
    expect(tx.patient_records.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 500n },
        data: expect.objectContaining({ record_type: 'treatment' }),
      }),
    );
  });

  it('refuses records that are not this patient’s planned or unbilled work', async () => {
    const { service } = build([]);
    await expect(
      service.completePlanned(
        { patient_id: 7, items: [{ record_id: 500, amount: 1 }] },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PatientWorkService: charges with no tooth', () => {
  it('records a general charge and bills it, colouring no tooth', async () => {
    const { service, tx } = build([]);
    await service.recordWork(
      {
        patient_id: 7,
        treatment_date: '2026-10-16',
        items: [
          { procedure_name: 'Checkup', status: 'completed', amount: 30 },
        ],
      },
      ACTOR,
    );
    const data = invoiceData(tx);
    expect(data).toMatchObject({ subtotal: 30, total_amount: 30 });
    const records = (data.patient_records as { create: { tooth_number: string | null }[] }).create;
    expect(records[0].tooth_number).toBeNull();
  });
});

describe('PatientWorkService.recordWork', () => {
  it('bills completed, priced items on one invoice due on the treatment date and records the rest unbilled', async () => {
    const { service, tx } = build([]);
    await service.recordWork(
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
    const data = invoiceData(tx);
    expect(data).toMatchObject({
      subtotal: 250,
      total_amount: 250,
      remaining_amount: 250,
      status: 'open',
    });
    expect(data.due_date).toEqual(data.procedure_date);
    expect((data.patient_records as { create: unknown[] }).create).toHaveLength(
      1,
    );
    expect(tx.patient_records.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          record_type: 'treatment_plan',
          quoted_amount: 80,
        }),
        expect.objectContaining({
          record_type: 'missing_tooth',
          quoted_amount: null,
        }),
      ],
    });
  });
});
