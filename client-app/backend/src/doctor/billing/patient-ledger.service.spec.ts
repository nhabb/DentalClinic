import { BadRequestException, ConflictException } from '@nestjs/common';
import { PatientLedgerService } from './patient-ledger.service';
import { MoneyService } from './money.service';

const ACTOR = 21n;
const PATIENT = 7n;
const OTHER_PATIENT = 8n;

type PaymentRow = {
  id: bigint;
  patient_id?: bigint;
  kind: 'payment' | 'refund';
  amount: number;
  /** Allocations of this payment, as {invoice_id, amount}. */
  applied?: { invoice_id: bigint; amount: number }[];
};

type InvoiceRow = {
  id: bigint;
  remaining_amount: number;
  status?: string;
  patient_id?: bigint;
};

/**
 * A fake ledger: the patient's payment rows with what is already applied, and
 * their invoices. The raw queries are told apart by their SQL, the same way
 * the service writes them.
 */
function build(payments: PaymentRow[], invoices: InvoiceRow[]) {
  const pay = payments.map((p) => ({
    patient_id: PATIENT,
    applied: [],
    ...p,
  }));
  const inv = invoices.map((i) => ({
    status: 'open',
    patient_id: PATIENT,
    invoice_number: `INV-${i.id}`,
    due_date: new Date('2026-10-01'),
    total_amount: i.remaining_amount,
    amount_paid: 0,
    ...i,
  }));

  const appliedOf = (id: bigint) =>
    pay.find((p) => p.id === id)!.applied.reduce((s, a) => s + a.amount, 0);

  const credit = pay.reduce((sum, p) => {
    const free = p.amount - appliedOf(p.id);
    return sum + (p.kind === 'refund' ? -free : free);
  }, 0);

  const raw = jest.fn(
    (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<unknown[]> => {
      const sql = strings.join('?');
      if (/AS credit/.test(sql)) return Promise.resolve([{ credit }]);
      if (/AS applied/.test(sql)) return Promise.resolve([{ applied: 0 }]);
      // The invoice row lock. It carries the trigger-maintained figures, which
      // is what the service reads a balance from now that it locks first.
      if (/FROM treatment_invoices/.test(sql)) {
        const row = inv.find((i) => i.id === (values[0] as bigint));
        if (!row) return Promise.resolve([]);
        return Promise.resolve([
          {
            id: row.id,
            patient_id: row.patient_id,
            total_amount: row.total_amount,
            amount_paid: row.amount_paid,
            remaining_amount: row.remaining_amount,
            status: row.status,
          },
        ]);
      }
      // Either the single-payment lock or the whole-account lock.
      return Promise.resolve(pay.map((p) => ({ ...p })));
    },
  );

  const tx = {
    $queryRaw: raw,
    invoice_payments: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 900n, ...data }),
      ),
    },
    payment_allocations: {
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn(),
    },
    treatment_invoices: {
      findMany: jest.fn().mockResolvedValue(inv),
      findUnique: jest.fn(({ where }: { where: { id: bigint } }) =>
        Promise.resolve(inv.find((i) => i.id === where.id) ?? null),
      ),
    },
  };

  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    $queryRaw: raw,
    patient_profiles: {
      findUnique: jest.fn().mockResolvedValue({ id: PATIENT }),
    },
    invoice_payments: {
      findMany: jest.fn().mockResolvedValue(
        pay.map((p) => ({
          ...p,
          creator: null,
          allocations: p.applied.map((a, n) => ({
            id: BigInt(n + 1),
            amount: a.amount,
            invoice: {
              id: a.invoice_id,
              invoice_number: 'INV',
              status: 'open',
            },
          })),
        })),
      ),
    },
    payment_allocations: {
      findUnique: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    treatment_invoices: { findMany: jest.fn().mockResolvedValue(inv) },
  };

  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PatientLedgerService(
    prisma as never,
    audit as never,
    new MoneyService(),
  );
  return { service, prisma, tx, audit };
}

/** The allocations written in one call, as {invoice_id, amount} pairs. */
const allocated = (tx: ReturnType<typeof build>['tx']) =>
  tx.payment_allocations.create.mock.calls.map(
    (c: [{ data: { invoice_id: bigint; amount: number } }]) => ({
      invoice_id: c[0].data.invoice_id,
      amount: c[0].data.amount,
    }),
  );

describe('PatientLedgerService.ledger', () => {
  it('counts money the patient has paid but that sits on no invoice as credit', async () => {
    const { service } = build(
      [
        {
          id: 1n,
          kind: 'payment',
          amount: 5000,
          applied: [{ invoice_id: 10n, amount: 3200 }],
        },
        { id: 2n, kind: 'payment', amount: 400 },
      ],
      [{ id: 10n, remaining_amount: 0 }],
    );
    const ledger = await service.ledger(PATIENT);
    // 5000 - 3200 applied, plus the untouched 400.
    expect(ledger.credit_balance).toBe(2200);
    expect(ledger.payments[0].applied).toBe(3200);
    expect(ledger.payments[0].unapplied).toBe(1800);
  });

  it('a refund taken out of credit lowers the credit, not an invoice', async () => {
    const { service } = build(
      [
        { id: 1n, kind: 'payment', amount: 5000 },
        { id: 2n, kind: 'refund', amount: 1800 },
      ],
      [],
    );
    expect((await service.ledger(PATIENT)).credit_balance).toBe(3200);
  });
});

describe('PatientLedgerService.takePayment', () => {
  it('settles the open invoices oldest first and keeps the rest as credit', async () => {
    const { service, tx } = build(
      [],
      [
        { id: 10n, remaining_amount: 300 },
        { id: 11n, remaining_amount: 500 },
      ],
    );
    await service.takePayment(
      PATIENT,
      { amount: 1000, payment_method: 'cash' },
      ACTOR,
    );
    // 300 then 500; the remaining 200 is left unallocated, which is the credit.
    expect(allocated(tx)).toEqual([
      { invoice_id: 10n, amount: 300 },
      { invoice_id: 11n, amount: 500 },
    ]);
  });

  it('never applies more to an invoice than that invoice still owes', async () => {
    const { service, tx } = build([], [{ id: 10n, remaining_amount: 120 }]);
    await service.takePayment(
      PATIENT,
      { amount: 1000, payment_method: 'cash' },
      ACTOR,
    );
    expect(allocated(tx)).toEqual([{ invoice_id: 10n, amount: 120 }]);
  });

  it('holds the whole payment as credit when the desk says so', async () => {
    const { service, tx } = build([], [{ id: 10n, remaining_amount: 300 }]);
    await service.takePayment(
      PATIENT,
      { amount: 1000, payment_method: 'cash', auto_apply: false },
      ACTOR,
    );
    expect(tx.payment_allocations.create).not.toHaveBeenCalled();
  });

  it('records the money as the patient’s, not an invoice’s', async () => {
    const { service, tx } = build([], []);
    await service.takePayment(
      PATIENT,
      { amount: 500, payment_method: 'card', notes: ' Deposit ' },
      ACTOR,
    );
    expect(tx.invoice_payments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patient_id: PATIENT,
        kind: 'payment',
        amount: 500,
        notes: 'Deposit',
        created_by: ACTOR,
      }),
    });
  });
});

describe('PatientLedgerService.applyCredit', () => {
  const payment: PaymentRow = { id: 1n, kind: 'payment', amount: 5000 };

  it('applies part of a payment to one invoice', async () => {
    const { service, tx } = build(
      [payment],
      [{ id: 10n, remaining_amount: 3200 }],
    );
    await service.applyCredit(1n, { invoice_id: 10, amount: 3200 }, ACTOR);
    expect(allocated(tx)).toEqual([{ invoice_id: 10n, amount: 3200 }]);
  });

  it('refuses to apply more than the payment has left', async () => {
    const { service, tx } = build(
      [payment],
      [{ id: 10n, remaining_amount: 9000 }],
    );
    tx.$queryRaw.mockImplementation(
      (strings: TemplateStringsArray): Promise<unknown[]> => {
        const sql = strings.join('?');
        if (/AS applied/.test(sql)) return Promise.resolve([{ applied: 4800 }]);
        return Promise.resolve([{ ...payment, patient_id: PATIENT }]);
      },
    );
    await expect(
      service.applyCredit(1n, { invoice_id: 10, amount: 500 }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to move money to another patient’s invoice', async () => {
    const { service } = build(
      [payment],
      [{ id: 10n, remaining_amount: 3200, patient_id: OTHER_PATIENT }],
    );
    await expect(
      service.applyCredit(1n, { invoice_id: 10, amount: 100 }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a cancelled invoice', async () => {
    const { service } = build(
      [payment],
      [{ id: 10n, remaining_amount: 3200, status: 'cancelled' }],
    );
    await expect(
      service.applyCredit(1n, { invoice_id: 10, amount: 100 }, ACTOR),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to overpay the invoice', async () => {
    const { service } = build([payment], [{ id: 10n, remaining_amount: 80 }]);
    await expect(
      service.applyCredit(1n, { invoice_id: 10, amount: 100 }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to apply a refund row to an invoice', async () => {
    const { service } = build(
      [{ id: 1n, kind: 'refund', amount: 500 }],
      [{ id: 10n, remaining_amount: 3200 }],
    );
    await expect(
      service.applyCredit(1n, { invoice_id: 10, amount: 100 }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PatientLedgerService.refundCredit', () => {
  it('hands back credit and records why', async () => {
    const { service, tx } = build(
      [{ id: 1n, kind: 'payment', amount: 5000 }],
      [],
    );
    await service.refundCredit(
      PATIENT,
      { amount: 1800, payment_method: 'cash', reason: 'Plan abandoned' },
      ACTOR,
    );
    expect(tx.invoice_payments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patient_id: PATIENT,
        kind: 'refund',
        // Credit handed back, not money off a bill. The invoice refund in
        // billing.service.spec.ts is stamped 'invoice'; an income report that
        // could not tell them apart was the reason for this column.
        refund_scope: 'credit',
        amount: 1800,
        reason: 'Plan abandoned',
      }),
    });
    // It touches no invoice, which is the whole difference.
    expect(tx.payment_allocations.create).not.toHaveBeenCalled();
  });

  it('refuses to refund more credit than the patient has', async () => {
    const { service } = build(
      [
        {
          id: 1n,
          kind: 'payment',
          amount: 5000,
          applied: [{ invoice_id: 10n, amount: 4000 }],
        },
      ],
      [],
    );
    await expect(
      service.refundCredit(
        PATIENT,
        { amount: 2000, payment_method: 'cash', reason: 'Plan abandoned' },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses when the account holds no credit at all', async () => {
    const { service } = build([], []);
    await expect(
      service.refundCredit(
        PATIENT,
        { amount: 10, payment_method: 'cash', reason: 'Nothing here' },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PatientLedgerService.unapplyCredit', () => {
  it('returns money from an invoice to the patient credit', async () => {
    // The allocation's foreign key guarantees its invoice exists, so the
    // fake has to carry it: the unapply takes that row's lock.
    const { service, prisma, tx } = build(
      [{ id: 1n, kind: 'payment', amount: 5000 }],
      [{ id: 10n, remaining_amount: 0 }],
    );
    prisma.payment_allocations.findUnique.mockResolvedValue({
      id: 4n,
      payment_id: 1n,
      invoice_id: 10n,
      amount: 3200,
      payment: { patient_id: PATIENT, kind: 'payment' },
      invoice: { id: 10n, status: 'open', invoice_number: 'INV-2026-00010' },
    });
    await service.unapplyCredit(4n, ACTOR);
    // Removed under the invoice lock, so the totals cannot be recomputed
    // from a half-deleted ledger.
    expect(tx.payment_allocations.delete).toHaveBeenCalledWith({
      where: { id: 4n },
    });
  });

  /*
   * The mirror of "a refund cannot be applied to an invoice" above. Removing a
   * refund's allocation would raise the invoice's amount_paid back to what it
   * was before the cash was handed over, leaving the bill reading as paid; and
   * lockPayment would never let the refund be applied again.
   */
  it('refuses to unapply a refund: that money has left the clinic', async () => {
    const { service, prisma, tx } = build([], []);
    prisma.payment_allocations.findUnique.mockResolvedValue({
      id: 4n,
      payment_id: 1n,
      invoice_id: 10n,
      amount: 300,
      payment: { patient_id: PATIENT, kind: 'refund' },
      invoice: { id: 10n, status: 'open', invoice_number: 'INV-2026-00010' },
    });
    await expect(service.unapplyCredit(4n, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.payment_allocations.delete).not.toHaveBeenCalled();
  });

  it('leaves the history of a cancelled invoice alone', async () => {
    const { service, prisma } = build([], []);
    prisma.payment_allocations.findUnique.mockResolvedValue({
      id: 4n,
      payment_id: 1n,
      invoice_id: 10n,
      amount: 3200,
      payment: { patient_id: PATIENT, kind: 'payment' },
      invoice: {
        id: 10n,
        status: 'cancelled',
        invoice_number: 'INV-2026-00010',
      },
    });
    await expect(service.unapplyCredit(4n, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
