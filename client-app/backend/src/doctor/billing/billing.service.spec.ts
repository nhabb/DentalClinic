import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingService, deriveInvoiceStatus } from './billing.service';
import { clinicTodayIso } from '../../shared/common/date-only';

type Row = { amount: number; kind: 'payment' | 'refund' };

/**
 * A fake transaction: the invoice row, the payment and refund rows already
 * recorded, and the statements the service runs against them. The two raw
 * queries are told apart by their SQL: the row lock and the net-paid sum.
 */
function build(
  invoice: {
    id: bigint;
    total_amount: number;
    amount_paid: number;
    status?: string;
  },
  rows: Row[],
) {
  const status = invoice.status ?? 'open';
  const net = rows.reduce(
    (s, r) => s + (r.kind === 'refund' ? -r.amount : r.amount),
    0,
  );
  const full = {
    ...invoice,
    status,
    patient_id: 7n,
    line_items: [],
    invoice_payments: rows.map((r, i) => ({ id: BigInt(i + 1), ...r })),
  };
  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (/FOR UPDATE/.test(sql)) {
        return Promise.resolve([
          { id: invoice.id, total_amount: invoice.total_amount, status },
        ]);
      }
      return Promise.resolve([{ net }]);
    }),
    invoice_payments: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(rows.length),
      delete: jest.fn().mockResolvedValue({}),
    },
    patient_records: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    treatment_invoices: {
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...full, ...args.data }),
      ),
      delete: jest.fn().mockResolvedValue(full),
    },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    treatment_invoices: {
      findUnique: jest.fn().mockResolvedValue(full),
    },
    invoice_payments: {
      findUnique: jest.fn().mockResolvedValue({
        id: 1n,
        invoice_id: invoice.id,
        kind: 'payment',
        amount: 30,
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingService(prisma as never, audit as never);
  return { service, tx, prisma, audit };
}

const ACTOR = 21n;

describe('BillingService.recordPayment', () => {
  it('derives the new totals from the payments table, not from the invoice row', async () => {
    // The row says 0 paid, but the payments table already holds 40: the table wins.
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 0 },
      [{ amount: 40, kind: 'payment' }],
    );
    const result = (await service.recordPayment(
      1n,
      {
        amount: 60,
        payment_method: 'cash',
      },
      ACTOR,
    )) as unknown as {
      amount_paid: number;
      remaining_amount: number;
      status: string;
    };
    expect(tx.invoice_payments.create).toHaveBeenCalledTimes(1);
    expect(result.amount_paid).toBe(100);
    expect(result.remaining_amount).toBe(0);
    expect(result.status).toBe('paid');
  });

  it('counts earlier refunds against what was paid', async () => {
    // 100 paid then 100 refunded: the invoice is open again and takes a new payment.
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 0 },
      [
        { amount: 100, kind: 'payment' },
        { amount: 100, kind: 'refund' },
      ],
    );
    const result = (await service.recordPayment(
      1n,
      {
        amount: 25,
        payment_method: 'cash',
      },
      ACTOR,
    )) as unknown as { amount_paid: number; status: string };
    expect(tx.invoice_payments.create).toHaveBeenCalledTimes(1);
    expect(result.amount_paid).toBe(25);
    expect(result.status).toBe('partial');
  });

  it('refuses a payment beyond the remaining balance', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 40 },
      [{ amount: 40, kind: 'payment' }],
    );
    await expect(
      service.recordPayment(1n, { amount: 61, payment_method: 'cash' }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.invoice_payments.create).not.toHaveBeenCalled();
  });

  it('refuses a payment on a fully paid invoice (the double-submit case)', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 100 },
      [{ amount: 100, kind: 'payment' }],
    );
    await expect(
      service.recordPayment(1n, { amount: 100, payment_method: 'cash' }, ACTOR),
    ).rejects.toThrow(/already fully paid/);
    expect(tx.invoice_payments.create).not.toHaveBeenCalled();
  });

  it('refuses a payment on a cancelled invoice', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 0, status: 'cancelled' },
      [],
    );
    await expect(
      service.recordPayment(1n, { amount: 10, payment_method: 'cash' }, ACTOR),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.invoice_payments.create).not.toHaveBeenCalled();
  });

  it('locks the invoice row for the duration of the transaction', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 0 },
      [],
    );
    await service.recordPayment(
      1n,
      { amount: 10, payment_method: 'card' },
      ACTOR,
    );
    const calls = tx.$queryRaw.mock.calls as unknown as [
      TemplateStringsArray,
    ][];
    const sql = calls[0][0].join('?');
    expect(sql).toMatch(/FOR UPDATE/);
  });
});

describe('BillingService.refund', () => {
  const dto = { amount: 30, payment_method: 'cash', reason: 'Crown remade' };

  it('records a refund row with its reason and lowers the totals', async () => {
    const { service, tx, audit } = build(
      { id: 1n, total_amount: 100, amount_paid: 100 },
      [{ amount: 100, kind: 'payment' }],
    );
    const result = (await service.refund(1n, dto, ACTOR)) as unknown as {
      amount_paid: number;
      remaining_amount: number;
      status: string;
    };
    const created = tx.invoice_payments.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(created.data).toMatchObject({
      kind: 'refund',
      amount: 30,
      reason: 'Crown remade',
      created_by: ACTOR,
    });
    expect(result.amount_paid).toBe(70);
    expect(result.remaining_amount).toBe(30);
    expect(result.status).toBe('partial');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'billing.invoice.refund',
        actorId: ACTOR,
      }),
    );
  });

  it('never refunds more than was received, net of earlier refunds', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 50 },
      [
        { amount: 100, kind: 'payment' },
        { amount: 50, kind: 'refund' },
      ],
    );
    await expect(
      service.refund(1n, { ...dto, amount: 60 }, ACTOR),
    ).rejects.toThrow(/exceeds what was received/);
    expect(tx.invoice_payments.create).not.toHaveBeenCalled();
  });

  it('refuses a refund when nothing was paid', async () => {
    const { service } = build(
      { id: 1n, total_amount: 100, amount_paid: 0 },
      [],
    );
    await expect(service.refund(1n, dto, ACTOR)).rejects.toThrow(
      /Nothing has been paid/,
    );
  });

  it('refuses a refund on a cancelled invoice', async () => {
    const { service } = build(
      { id: 1n, total_amount: 100, amount_paid: 0, status: 'cancelled' },
      [],
    );
    await expect(service.refund(1n, dto, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('BillingService.voidInvoice', () => {
  const dto = { reason: 'Billed to the wrong patient' };

  it('refuses while money is still held on the invoice', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 40 },
      [{ amount: 40, kind: 'payment' }],
    );
    await expect(service.voidInvoice(1n, dto, ACTOR)).rejects.toThrow(
      /Refund the 40/,
    );
    expect(tx.treatment_invoices.update).not.toHaveBeenCalled();
  });

  it('cancels an invoice with nothing net-paid, releases its chart records and audits it', async () => {
    const { service, tx, audit } = build(
      { id: 1n, total_amount: 100, amount_paid: 0 },
      [
        { amount: 100, kind: 'payment' },
        { amount: 100, kind: 'refund' },
      ],
    );
    const result = (await service.voidInvoice(1n, dto, ACTOR)) as unknown as {
      status: string;
      cancelled_by: bigint;
      cancel_reason: string;
    };
    expect(result.status).toBe('cancelled');
    expect(result.cancelled_by).toBe(ACTOR);
    expect(result.cancel_reason).toBe(dto.reason);
    expect(tx.patient_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { invoice_id: 1n },
        data: expect.objectContaining({ invoice_id: null }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'billing.invoice.void' }),
    );
  });

  it('refuses to cancel twice', async () => {
    const { service } = build(
      { id: 1n, total_amount: 100, amount_paid: 0, status: 'cancelled' },
      [],
    );
    await expect(service.voidInvoice(1n, dto, ACTOR)).rejects.toThrow(
      /already cancelled/,
    );
  });
});

describe('BillingService.deleteInvoice', () => {
  it('refuses to delete an invoice that has any payment or refund row, even if they net to zero', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 0 },
      [
        { amount: 30, kind: 'payment' },
        { amount: 30, kind: 'refund' },
      ],
    );
    await expect(service.deleteInvoice(1n, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.treatment_invoices.delete).not.toHaveBeenCalled();
  });

  it('deletes an invoice with no money on it and audits what was deleted', async () => {
    const { service, tx, audit } = build(
      { id: 1n, total_amount: 100, amount_paid: 0 },
      [],
    );
    await expect(service.deleteInvoice(1n, ACTOR)).resolves.toEqual({
      success: true,
    });
    expect(tx.treatment_invoices.delete).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'billing.invoice.delete',
        recordId: 1n,
        actorId: ACTOR,
      }),
    );
  });
});

describe('BillingService.deletePayment', () => {
  it('refuses to touch the payment history of a cancelled invoice', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 0, status: 'cancelled' },
      [
        { amount: 30, kind: 'payment' },
        { amount: 30, kind: 'refund' },
      ],
    );
    await expect(service.deletePayment(1n, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.invoice_payments.delete).not.toHaveBeenCalled();
  });

  it('deletes the row and audits the full payment that was removed', async () => {
    const { service, tx, audit } = build(
      { id: 1n, total_amount: 100, amount_paid: 30 },
      [{ amount: 30, kind: 'payment' }],
    );
    await service.deletePayment(1n, ACTOR);
    expect(tx.invoice_payments.delete).toHaveBeenCalledWith({
      where: { id: 1n },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'billing.payment.delete',
        before: expect.objectContaining({ amount: 30 }),
      }),
    );
  });
});

describe('deriveInvoiceStatus', () => {
  it('maps paid-so-far to open, partial or paid', () => {
    expect(deriveInvoiceStatus(100, 0)).toBe('open');
    expect(deriveInvoiceStatus(100, 0.5)).toBe('partial');
    expect(deriveInvoiceStatus(100, 99.999)).toBe('paid');
    expect(deriveInvoiceStatus(100, 100)).toBe('paid');
  });
});

/** A fake database for issuing invoices and reading what is owed. */
function buildLedger(
  outstanding: {
    id: bigint;
    invoice_number: string;
    remaining_amount: number;
    due_date: Date;
    patient_id?: bigint;
  }[] = [],
) {
  const prisma = {
    patient_profiles: { findUnique: jest.fn().mockResolvedValue({ id: 7n }) },
    treatment_invoices: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 1n, invoice_number: 'INV-2026-00001', ...data }),
      ),
      findMany: jest
        .fn()
        .mockResolvedValue(
          outstanding.map((o) => ({ status: 'open', patient_id: 7n, ...o })),
        ),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingService(prisma as never, audit as never);
  return { service, prisma };
}

const issued = (prisma: ReturnType<typeof buildLedger>['prisma']) =>
  prisma.treatment_invoices.create.mock.calls[0][0].data;

describe('BillingService.create', () => {
  it('issues an invoice: lines to a subtotal, discount with reason, what is owed, due on the work day, by the signed-in user', async () => {
    const { service, prisma } = buildLedger();
    await service.create(
      {
        patient_id: 7,
        procedure_date: '2026-10-15',
        discount_amount: 30,
        discount_reason: 'Family discount',
        line_items: [
          { procedure_name: 'Crown', amount: 250, tooth_number: '16' },
          { procedure_name: 'X-Ray', amount: 20 },
        ],
      },
      ACTOR,
    );
    const data = issued(prisma) as { due_date: Date; procedure_date: Date };
    expect(data).toMatchObject({
      patient_id: 7n,
      subtotal: 270,
      discount_amount: 30,
      discount_reason: 'Family discount',
      total_amount: 240,
      amount_paid: 0,
      remaining_amount: 240,
      status: 'open',
      created_by: ACTOR,
    });
    expect(data.due_date).toEqual(data.procedure_date);
    expect(issued(prisma)).not.toHaveProperty('invoice_number');
  });

  it('honours payment terms but never a due date before the work', async () => {
    const { service, prisma } = buildLedger();
    await service.create(
      {
        patient_id: 7,
        procedure_date: '2026-10-15',
        due_date: '2026-11-14',
        line_items: [{ procedure_name: 'Crown', amount: 250 }],
      },
      ACTOR,
    );
    const due = (issued(prisma) as { due_date: Date }).due_date;
    expect(due.toISOString().slice(0, 10)).toBe('2026-11-14');
    await expect(
      service.create(
        {
          patient_id: 7,
          procedure_date: '2026-10-15',
          due_date: '2026-10-01',
          line_items: [{ procedure_name: 'Crown', amount: 250 }],
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a discount without a reason or above the lines', async () => {
    const { service, prisma } = buildLedger();
    const base = {
      patient_id: 7,
      procedure_date: '2026-10-15',
      line_items: [{ procedure_name: 'Crown', amount: 250 }],
    };
    await expect(
      service.create({ ...base, discount_amount: 10 }, ACTOR),
    ).rejects.toThrow(/needs a reason/);
    await expect(
      service.create(
        { ...base, discount_amount: 251, discount_reason: 'too much' },
        ACTOR,
      ),
    ).rejects.toThrow(/exceeds the lines/);
    expect(prisma.treatment_invoices.create).not.toHaveBeenCalled();
  });

  it('an invoice that comes to nothing is settled, not open forever', async () => {
    const { service, prisma } = buildLedger();
    await service.create(
      {
        patient_id: 7,
        procedure_date: '2026-10-15',
        line_items: [{ procedure_name: 'Checkup', amount: 0 }],
      },
      ACTOR,
    );
    expect(issued(prisma)).toMatchObject({ total_amount: 0, status: 'paid' });
  });
});

describe('BillingService aging and outstanding (by due date, not by issue date)', () => {
  // Anchored on the clinic calendar day, not the wall clock, so the count of
  // days overdue does not change with the time of day the suite happens to run.
  const daysAgo = (n: number) =>
    new Date(
      new Date(`${clinicTodayIso()}T12:00:00.000Z`).getTime() - n * 86_400_000,
    );

  it('buckets balances by how far past due they are, with not-yet-due apart', async () => {
    const { service } = buildLedger([
      {
        id: 1n,
        invoice_number: 'INV-1',
        remaining_amount: 10,
        due_date: daysAgo(-5),
      },
      {
        id: 2n,
        invoice_number: 'INV-2',
        remaining_amount: 20,
        due_date: daysAgo(15),
      },
      {
        id: 3n,
        invoice_number: 'INV-3',
        remaining_amount: 30,
        due_date: daysAgo(45),
      },
      {
        id: 4n,
        invoice_number: 'INV-4',
        remaining_amount: 40,
        due_date: daysAgo(75),
      },
      {
        id: 5n,
        invoice_number: 'INV-5',
        remaining_amount: 50,
        due_date: daysAgo(200),
      },
    ]);
    const report = await service.getAgingReport();
    expect(report.buckets).toEqual({
      not_yet_due: 10,
      '0_30_days': 20,
      '31_60_days': 30,
      '61_90_days': 40,
      '90_plus_days': 50,
    });
    expect(report.total_outstanding).toBe(150);
    expect(report.total_overdue).toBe(140);
  });

  it('lists what is owed with the invoice number and the days overdue', async () => {
    const { service } = buildLedger([
      {
        id: 3n,
        invoice_number: 'INV-3',
        remaining_amount: 30,
        due_date: daysAgo(45),
      },
    ]);
    const [row] = await service.getOutstandingPayments();
    expect(row).toMatchObject({
      invoice_number: 'INV-3',
      remaining: 30,
      days_overdue: 45,
    });
  });
});

/**
 * A fake database for creating invoices, with and without chart records.
 * `quoteRecordIds` is what the accepted quote priced (default: exactly the two
 * records billed below, i.e. the invoice bills the whole quote); `liveInvoices`
 * is how many live invoices that quote already carries.
 */
function buildForCreate(opts: {
  billableCount: number;
  attachCount?: number;
  quoteRecordIds?: (bigint | null)[];
  liveInvoices?: number;
}) {
  const tx = {
    treatment_invoices: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 5n, invoice_number: 'INV-2026-00005', ...data }),
      ),
      count: jest.fn().mockResolvedValue(opts.liveInvoices ?? 0),
    },
    patient_records: {
      updateMany: jest.fn(({ where }: { where: { id: { in: bigint[] } } }) =>
        Promise.resolve({
          count: opts.attachCount ?? where.id.in.length,
        }),
      ),
    },
    quote_items: {
      findFirst: jest.fn().mockResolvedValue({ quote_id: 3n }),
      findMany: jest.fn().mockResolvedValue(
        (opts.quoteRecordIds ?? [500n, 501n]).map((record_id) => ({
          record_id,
        })),
      ),
    },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    patient_profiles: { findUnique: jest.fn().mockResolvedValue({ id: 7n }) },
    patient_records: {
      count: jest.fn().mockResolvedValue(opts.billableCount),
    },
    treatment_invoices: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 6n, invoice_number: 'INV-2026-00006', ...data }),
      ),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingService(prisma as never, audit as never);
  return { service, tx, prisma };
}

describe('BillingService.create', () => {
  const dtoWithRecords = {
    patient_id: 7,
    procedure_date: '2026-10-15',
    line_items: [
      {
        record_id: 500,
        procedure_name: 'Crown',
        amount: 250,
        tooth_number: '16',
      },
      {
        record_id: 501,
        procedure_name: 'Filling',
        amount: 80,
        tooth_number: '26',
      },
    ],
  };

  it('bills chart records on one invoice, attaching them only while still unbilled', async () => {
    const { service, tx } = buildForCreate({ billableCount: 2 });
    const invoice = (await service.create(
      dtoWithRecords,
      ACTOR,
    )) as unknown as {
      subtotal: number;
      total_amount: number;
      quote_id: bigint;
      created_by: bigint;
    };
    expect(invoice).toMatchObject({
      subtotal: 330,
      total_amount: 330,
      quote_id: 3n,
      created_by: ACTOR,
    });
    expect(tx.patient_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [500n, 501n] },
          invoice_id: null,
          patient_id: 7n,
          record_type: 'treatment',
        },
        data: expect.objectContaining({ invoice_id: 5n }),
      }),
    );
  });

  /*
   * A quote may carry one live invoice (treatment_invoices_one_live_per_quote).
   * A treatment plan billed visit by visit must therefore leave quote_id unset
   * on each part, or the second visit could never be billed at all.
   */
  it('leaves quote_id unset when it bills only part of an accepted quote', async () => {
    const { service } = buildForCreate({
      billableCount: 1,
      // The quote also priced record 502, which this invoice does not bill.
      quoteRecordIds: [500n, 501n, 502n],
    });
    const invoice = (await service.create(
      { ...dtoWithRecords, line_items: [dtoWithRecords.line_items[0]] },
      ACTOR,
    )) as unknown as { quote_id: bigint | null; total_amount: number };
    expect(invoice.quote_id).toBeNull();
    expect(invoice.total_amount).toBe(250);
  });

  it('leaves quote_id unset when the quote already has a live invoice', async () => {
    const { service } = buildForCreate({ billableCount: 2, liveInvoices: 1 });
    const invoice = (await service.create(
      dtoWithRecords,
      ACTOR,
    )) as unknown as { quote_id: bigint | null };
    expect(invoice.quote_id).toBeNull();
  });

  it('turns a lost race for the quote into a 409, never a 500', async () => {
    const { service, prisma } = buildForCreate({ billableCount: 2 });
    prisma.$transaction = () =>
      Promise.reject(
        new Error(
          'Unique constraint failed on the constraint: `treatment_invoices_one_live_per_quote`',
        ),
      );
    await expect(service.create(dtoWithRecords, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses records that are not this patient’s completed unbilled work', async () => {
    const { service, tx } = buildForCreate({ billableCount: 1 });
    await expect(service.create(dtoWithRecords, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.treatment_invoices.create).not.toHaveBeenCalled();
  });

  it('refuses the same record on two lines', async () => {
    const { service } = buildForCreate({ billableCount: 2 });
    await expect(
      service.create(
        {
          ...dtoWithRecords,
          line_items: dtoWithRecords.line_items.map((l) => ({
            ...l,
            record_id: 500,
          })),
        },
        ACTOR,
      ),
    ).rejects.toThrow(/two lines/);
  });

  it('rolls back when a record was billed a moment ago from another desk', async () => {
    const { service } = buildForCreate({ billableCount: 2, attachCount: 1 });
    await expect(service.create(dtoWithRecords, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates a plain invoice without touching records when no line names one', async () => {
    const { service, tx, prisma } = buildForCreate({ billableCount: 0 });
    const invoice = (await service.create(
      {
        patient_id: 7,
        procedure_date: '2026-10-15',
        line_items: [{ procedure_name: 'Checkup', amount: 30 }],
      },
      ACTOR,
    )) as unknown as { total_amount: number };
    expect(invoice.total_amount).toBe(30);
    expect(prisma.treatment_invoices.create).toHaveBeenCalledTimes(1);
    expect(tx.patient_records.updateMany).not.toHaveBeenCalled();
  });
});
