import { BadRequestException, ConflictException } from '@nestjs/common';
import { MoneyService } from './money.service';

const ACTOR = 21n;
const PATIENT = 7n;

type InvoiceRow = {
  id: bigint;
  remaining_amount: number;
  status?: string;
  /** What an unlocked listing would report, when it disagrees with the row. */
  staleRemaining?: number;
};

/**
 * A fake transaction over a set of invoices. The row lock is told apart from
 * the listing the same way the real statements are: by `FOR UPDATE`.
 *
 * `staleRemaining` lets a test say "the listing is out of date" — the
 * unlocked `findMany` reports it, the locked row reports the truth.
 */
function build(invoices: InvoiceRow[]) {
  const rows = invoices.map((i) => ({ status: 'open', ...i }));
  const lockOrder: bigint[] = [];
  const allocations: { invoice_id: bigint; amount: number }[] = [];

  const tx = {
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (/FROM treatment_invoices/.test(sql) && /FOR UPDATE/.test(sql)) {
          const id = values[0] as bigint;
          lockOrder.push(id);
          const row = rows.find((r) => r.id === id);
          if (!row) return Promise.resolve([]);
          return Promise.resolve([
            {
              id: row.id,
              patient_id: PATIENT,
              total_amount: row.remaining_amount,
              amount_paid: 0,
              remaining_amount: row.remaining_amount,
              status: row.status,
            },
          ]);
        }
        return Promise.resolve([]);
      },
    ),
    treatment_invoices: {
      // The unlocked listing: ordered by due date, and possibly stale.
      findMany: jest.fn().mockResolvedValue(
        rows.map((r) => ({
          id: r.id,
          remaining_amount: r.staleRemaining ?? r.remaining_amount,
        })),
      ),
      findUnique: jest.fn(),
    },
    payment_allocations: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        allocations.push({
          invoice_id: data.invoice_id as bigint,
          amount: data.amount as number,
        });
        return Promise.resolve({ id: 1n, ...data });
      }),
    },
    invoice_payments: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 900n, ...data }),
      ),
      delete: jest.fn().mockResolvedValue({}),
    },
  };

  return { service: new MoneyService(), tx, lockOrder, allocations };
}

describe('MoneyService.settle', () => {
  it('pays the oldest due invoice first', async () => {
    const { service, tx, allocations } = build([
      { id: 10n, remaining_amount: 100 },
      { id: 20n, remaining_amount: 100 },
    ]);

    const left = await service.settle(tx as never, {
      patientId: PATIENT,
      paymentId: 900n,
      available: 150,
      actorId: ACTOR,
    });

    expect(allocations).toEqual([
      { invoice_id: 10n, amount: 100 },
      { invoice_id: 20n, amount: 50 },
    ]);
    expect(left).toBe(0);
  });

  it('locks invoices in id order even when it spends them in another order', async () => {
    // Due-date order puts 30 first; the lock order must still be 10, 20, 30.
    const { service, tx, lockOrder, allocations } = build([
      { id: 30n, remaining_amount: 50 },
      { id: 10n, remaining_amount: 50 },
      { id: 20n, remaining_amount: 50 },
    ]);

    await service.settle(tx as never, {
      patientId: PATIENT,
      paymentId: 900n,
      available: 150,
      actorId: ACTOR,
    });

    expect(lockOrder).toEqual([10n, 20n, 30n]);
    expect(allocations.map((a) => a.invoice_id)).toEqual([30n, 10n, 20n]);
  });

  it('pays against the locked balance, not the listing that may be stale', async () => {
    // Another desk paid 90 of it between the listing and our lock.
    const { service, tx, allocations } = build([
      { id: 10n, remaining_amount: 10, staleRemaining: 100 },
      { id: 20n, remaining_amount: 100 },
    ]);

    const left = await service.settle(tx as never, {
      patientId: PATIENT,
      paymentId: 900n,
      available: 100,
      actorId: ACTOR,
    });

    // Had it trusted the listing it would have put 100 on invoice 10 and
    // overpaid it; the locked row caps it at 10 and the rest flows on.
    expect(allocations).toEqual([
      { invoice_id: 10n, amount: 10 },
      { invoice_id: 20n, amount: 90 },
    ]);
    expect(left).toBe(0);
  });

  it('puts the named invoice at the head of the queue and lets the rest flow on', async () => {
    const { service, tx, allocations } = build([
      { id: 10n, remaining_amount: 100 },
      { id: 20n, remaining_amount: 100 },
    ]);

    await service.settle(tx as never, {
      patientId: PATIENT,
      paymentId: 900n,
      available: 150,
      actorId: ACTOR,
      firstInvoiceId: 20n,
    });

    expect(allocations).toEqual([
      { invoice_id: 20n, amount: 100 },
      { invoice_id: 10n, amount: 50 },
    ]);
  });

  it('skips an invoice that was cancelled since the listing', async () => {
    const { service, tx, allocations } = build([
      { id: 10n, remaining_amount: 100, status: 'cancelled' },
      { id: 20n, remaining_amount: 100 },
    ]);

    await service.settle(tx as never, {
      patientId: PATIENT,
      paymentId: 900n,
      available: 100,
      actorId: ACTOR,
    });

    expect(allocations).toEqual([{ invoice_id: 20n, amount: 100 }]);
  });

  it('keeps what it could not spend, which is the credit', async () => {
    const { service, tx, allocations } = build([
      { id: 10n, remaining_amount: 30 },
    ]);

    const left = await service.settle(tx as never, {
      patientId: PATIENT,
      paymentId: 900n,
      available: 100,
      actorId: ACTOR,
    });

    expect(allocations).toEqual([{ invoice_id: 10n, amount: 30 }]);
    expect(left).toBe(70);
  });

  it('holds the whole payment when the patient owes nothing', async () => {
    const { service, tx, allocations } = build([]);

    const left = await service.settle(tx as never, {
      patientId: PATIENT,
      paymentId: 900n,
      available: 250,
      actorId: ACTOR,
    });

    expect(allocations).toEqual([]);
    expect(left).toBe(250);
  });
});

describe('MoneyService.lockInvoice', () => {
  it('reads the balance off the locked row', async () => {
    const { service, tx } = build([{ id: 10n, remaining_amount: 42 }]);
    const locked = await service.lockInvoice(tx as never, 10n);
    expect(locked.remaining_amount).toBe(42);
    expect(locked.status).toBe('open');
  });

  it('answers 404 for an invoice that is not there', async () => {
    const { service, tx } = build([]);
    await expect(service.lockInvoice(tx as never, 99n)).rejects.toThrow(
      /not found/i,
    );
  });
});

describe('MoneyService constraint mapping', () => {
  const refusal = (message: string) => {
    const { service, tx } = build([{ id: 10n, remaining_amount: 100 }]);
    tx.payment_allocations.create = jest
      .fn()
      .mockRejectedValue(new Error(message));
    return service.allocate(tx as never, {
      paymentId: 900n,
      invoiceId: 10n,
      amount: 10,
      actorId: ACTOR,
    });
  };

  it('answers a lost race with 409 rather than letting a 500 escape', async () => {
    await expect(
      refusal('new row violates constraint "paid_within_total"'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers a cross-patient allocation with 400', async () => {
    await expect(
      refusal('violates constraint "payment_allocations_same_patient"'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers an over-applied payment with 409', async () => {
    await expect(
      refusal('violates constraint "payment_allocations_within_payment"'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers an allocation onto a cancelled invoice with 409', async () => {
    await expect(
      refusal('invoice 10 is cancelled: the money applied to it is frozen'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('re-throws a failure it does not recognise, so it stays loud', async () => {
    await expect(refusal('connection terminated unexpectedly')).rejects.toThrow(
      /connection terminated/,
    );
  });
});
