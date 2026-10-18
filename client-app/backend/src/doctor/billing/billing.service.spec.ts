import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingService, deriveInvoiceStatus } from './billing.service';
import { MoneyService } from './money.service';
import { clinicTodayIso } from '../../shared/common/date-only';

type Row = { amount: number; kind: 'payment' | 'refund' };

/**
 * A fake transaction: the invoice row, the money already applied to it, and
 * the statements the service runs against them. The two raw queries are told
 * apart by their SQL: the row lock and the net-applied sum.
 *
 * Money reaches an invoice as an allocation of a patient payment, so each
 * `rows` entry stands for one allocation wrapping one payment row.
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
  const total = invoice.total_amount;

  // The allocations on this invoice, as the database would hold them: the
  // seeded history plus anything the service writes during the test.
  const applied: Row[] = [...rows];
  const kindOfPayment = new Map<bigint, 'payment' | 'refund'>();
  let nextPaymentId = 500n;

  /** What `app.recalc_invoice_totals` would compute right now. */
  const net = () =>
    applied.reduce(
      (s, r) => s + (r.kind === 'refund' ? -r.amount : r.amount),
      0,
    );
  /** `cancelled` survives a recompute, exactly as the trigger leaves it. */
  const statusNow = () =>
    status === 'cancelled' ? 'cancelled' : deriveInvoiceStatus(total, net());

  const allocationRows = () =>
    applied.map((r, i) => ({
      id: BigInt(i + 1),
      amount: r.amount,
      payment: {
        id: BigInt(100 + i),
        kind: r.kind,
        payment_method: 'cash',
        payment_date: new Date('2026-10-01'),
        notes: null,
        reason: null,
        created_by: ACTOR,
        creator: null,
      },
    }));

  const full = () => ({
    ...invoice,
    status: statusNow(),
    patient_id: PATIENT,
    line_items: [],
    amount_paid: Math.round(net() * 100) / 100,
    remaining_amount: Math.round((total - net()) * 100) / 100,
    allocations: allocationRows(),
  });

  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (/FOR UPDATE/.test(sql)) {
        // The locked row carries the trigger-maintained figures, which is
        // what the service now reads its balances from.
        return Promise.resolve([
          {
            id: invoice.id,
            patient_id: PATIENT,
            total_amount: total,
            amount_paid: net(),
            remaining_amount: total - net(),
            status,
          },
        ]);
      }
      return Promise.resolve([{ net: net() }]);
    }),
    invoice_payments: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const id = nextPaymentId;
        nextPaymentId += 1n;
        kindOfPayment.set(id, data.kind as 'payment' | 'refund');
        return Promise.resolve({ id, ...data });
      }),
      count: jest.fn(() => Promise.resolve(applied.length)),
      delete: jest.fn().mockResolvedValue({}),
    },
    payment_allocations: {
      // Writing an allocation moves the invoice's totals, by trigger.
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        applied.push({
          amount: Number(data.amount),
          kind: kindOfPayment.get(data.payment_id as bigint) ?? 'payment',
        });
        return Promise.resolve({ id: 1n, ...data });
      }),
      count: jest.fn(() => Promise.resolve(applied.length)),
    },
    patient_records: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    treatment_invoices: {
      findUnique: jest.fn(() => Promise.resolve(full())),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...full(), ...args.data }),
      ),
      delete: jest.fn(() => Promise.resolve(full())),
    },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    treatment_invoices: {
      findUnique: jest.fn(() => Promise.resolve(full())),
    },
    invoice_payments: {
      findUnique: jest.fn().mockResolvedValue({
        id: 1n,
        patient_id: PATIENT,
        kind: 'payment',
        amount: 30,
        allocations: [{ invoice_id: invoice.id }],
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingService(
    prisma as never,
    audit as never,
    new MoneyService(),
  );
  return { service, tx, prisma, audit };
}

const ACTOR = 21n;
const PATIENT = 7n;

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
      // Money off a named bill, not credit handed back: the income report
      // has to be able to tell the two apart.
      refund_scope: 'invoice',
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
        Promise.resolve({
          id: 1n,
          invoice_number: 'INV-2026-00001',
          allocations: [],
          ...data,
        }),
      ),
      findMany: jest
        .fn()
        .mockResolvedValue(
          outstanding.map((o) => ({ status: 'open', patient_id: 7n, ...o })),
        ),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingService(
    prisma as never,
    audit as never,
    new MoneyService(),
  );
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
        Promise.resolve({
          id: 5n,
          invoice_number: 'INV-2026-00005',
          allocations: [],
          ...data,
        }),
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
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    patient_profiles: { findUnique: jest.fn().mockResolvedValue({ id: 7n }) },
    patient_records: {
      count: jest.fn().mockResolvedValue(opts.billableCount),
    },
    treatment_invoices: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 6n,
          invoice_number: 'INV-2026-00006',
          allocations: [],
          ...data,
        }),
      ),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingService(
    prisma as never,
    audit as never,
    new MoneyService(),
  );
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
      created_by: bigint;
    };
    expect(invoice).toMatchObject({
      subtotal: 330,
      total_amount: 330,
      created_by: ACTOR,
    });
    expect(tx.patient_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [500n, 501n] },
          invoice_id: null,
          patient_id: 7n,
          record_type: { in: ['treatment_plan', 'treatment'] },
        },
        data: expect.objectContaining({ invoice_id: 5n }),
      }),
    );
  });

  /*
   * The record is the unit of protection now. There is no quote_id to stamp
   * and no "one live invoice per quote" index: a plan billed visit by visit is
   * the ordinary case, and what stops work being charged twice is that each
   * chart row can only be claimed while its invoice_id is still null.
   */
  it('claims each record on the same filters it checked, so another patient’s work cannot be swept in', async () => {
    const { service, tx } = buildForCreate({ billableCount: 2 });
    await service.create(dtoWithRecords, ACTOR);
    const claim = tx.patient_records.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(claim.where).toMatchObject({
      invoice_id: null,
      patient_id: 7n,
      record_type: { in: ['treatment_plan', 'treatment'] },
    });
  });

  it('bills work that is still only planned, which is what paying up front means', async () => {
    // Nothing in the claim distinguishes planned from done: a patient settling
    // a crown before it is cut gets an invoice, and the row is locked by it.
    const { service, tx } = buildForCreate({ billableCount: 2 });
    const invoice = (await service.create(
      dtoWithRecords,
      ACTOR,
    )) as unknown as { total_amount: number };
    expect(invoice.total_amount).toBe(330);
    expect(tx.patient_records.updateMany).toHaveBeenCalled();
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

/**
 * One set of invoices, four readers.
 *
 * "Outstanding" used to be written out four times — three with
 * `status IN ('open','partial')` and one with `LIVE_STATUSES AND
 * remaining_amount > 0` — so the summary, the KPIs, the aging report and the
 * outstanding list could each quote a different number for the same clinic.
 * The fake below answers every query from one array, applying whatever
 * `where` it is handed, so a reader that goes back to its own predicate shows
 * up here as a disagreement rather than as a plausible number on a screen.
 */
function buildReaders(
  invoices: {
    id: bigint;
    total_amount: number;
    amount_paid: number;
    status: string;
    due_date: Date;
    discount_amount?: number;
  }[],
  payments: { kind: 'payment' | 'refund'; amount: number }[] = [],
) {
  const rows = invoices.map((i) => ({
    invoice_number: `INV-${i.id}`,
    patient_id: 7n,
    created_at: new Date('2026-01-01'),
    discount_amount: 0,
    ...i,
    remaining_amount:
      Math.round((i.total_amount - i.amount_paid) * 100) / 100,
    patient: { id: 7n, users: { first_name: 'Ada', last_name: 'Lovelace' } },
  }));

  /** The handful of Prisma filters these readers use, honestly applied. */
  const matches = (row: (typeof rows)[number], where?: Record<string, any>) => {
    if (!where) return true;
    const status = where.status as { in?: string[] } | string | undefined;
    if (typeof status === 'string' && row.status !== status) return false;
    if (status && typeof status === 'object' && status.in) {
      if (!status.in.includes(row.status)) return false;
    }
    const rem = where.remaining_amount as { gt?: number } | undefined;
    if (rem?.gt !== undefined && !(row.remaining_amount > rem.gt)) return false;
    return true;
  };

  const prisma = {
    treatment_invoices: {
      findMany: jest.fn(({ where }: { where?: Record<string, any> } = {}) =>
        Promise.resolve(rows.filter((r) => matches(r, where))),
      ),
      aggregate: jest.fn(({ where }: { where?: Record<string, any> } = {}) =>
        Promise.resolve({
          _sum: {
            remaining_amount: rows
              .filter((r) => matches(r, where))
              .reduce((s, r) => s + r.remaining_amount, 0),
          },
        }),
      ),
    },
    invoice_payments: {
      groupBy: jest.fn(() =>
        Promise.resolve(
          (['payment', 'refund'] as const)
            .map((kind) => ({
              kind,
              refund_scope: kind === 'refund' ? 'invoice' : null,
              _sum: {
                amount: payments
                  .filter((p) => p.kind === kind)
                  .reduce((s, p) => s + p.amount, 0),
              },
              _count: { id: payments.filter((p) => p.kind === kind).length },
            }))
            .filter((g) => g._count.id > 0),
        ),
      ),
    },
    expenses: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { amount: 0 }, _count: { id: 0 } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new BillingService(
    prisma as never,
    { record: jest.fn() } as never,
    new MoneyService(),
  );
  return { service, prisma };
}

describe('the four readers of "unpaid" agree', () => {
  const daysFromToday = (n: number) =>
    new Date(
      new Date(`${clinicTodayIso()}T12:00:00.000Z`).getTime() + n * 86_400_000,
    );

  const FIXTURE = [
    // Owed and long overdue.
    { id: 1n, total_amount: 300, amount_paid: 0, status: 'open', due_date: daysFromToday(-45) },
    // Part paid, not yet due.
    { id: 2n, total_amount: 500, amount_paid: 200, status: 'partial', due_date: daysFromToday(10) },
    // Settled: owed by nobody.
    { id: 3n, total_amount: 150, amount_paid: 150, status: 'paid', due_date: daysFromToday(-5) },
    // Cancelled: never billed, never owed.
    { id: 4n, total_amount: 900, amount_paid: 0, status: 'cancelled', due_date: daysFromToday(-90) },
    // Status lags the trigger: settled, so it must not be chased.
    { id: 5n, total_amount: 80, amount_paid: 80, status: 'open', due_date: daysFromToday(-2) },
  ];
  const PAYMENTS = [{ kind: 'payment' as const, amount: 430 }];

  it('summary, KPIs, aging and the outstanding list quote one number', async () => {
    const { service } = buildReaders(FIXTURE, PAYMENTS);
    const [summary, kpis, aging, list] = await Promise.all([
      service.getSummary(),
      service.getKpis(),
      service.getAgingReport(),
      service.getOutstandingPayments(),
    ]);
    const listed = list.reduce((s, r) => s + r.remaining, 0);

    // 300 owed on the overdue bill + 300 still owed on the part-paid one.
    expect(summary.total_outstanding).toBe(600);
    expect(kpis.all_time.total_outstanding).toBe(600);
    expect(aging.total_outstanding).toBe(600);
    expect(listed).toBe(600);
  });

  it('and one number for what is overdue', async () => {
    const { service } = buildReaders(FIXTURE, PAYMENTS);
    const [kpis, aging] = await Promise.all([
      service.getKpis(),
      service.getAgingReport(),
    ]);
    // Only the 45-day-old bill: the part-paid one is not due yet, and the two
    // settled ones are owed by nobody however old they are.
    expect(kpis.all_time.total_overdue).toBe(300);
    expect(aging.total_overdue).toBe(300);
  });

  it('keeps a cancelled bill out of billed, unpaid and overdue alike', async () => {
    const { service } = buildReaders(FIXTURE, PAYMENTS);
    const kpis = await service.getKpis();
    // 300 + 500 + 150 + 80: the cancelled 900 is not money anyone was billed.
    expect(kpis.all_time.total_billed).toBe(1030);
    expect(kpis.all_time.total_invoices).toBe(4);
  });

  it('leaves a settled bill whose status lags out of what is chased', async () => {
    const { service } = buildReaders(FIXTURE, PAYMENTS);
    const list = await service.getOutstandingPayments();
    expect(list.map((r) => r.invoice_number)).toEqual(['INV-1', 'INV-2']);
  });
});
