import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingService, deriveInvoiceStatus } from './billing.service';

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
    const result = (await service.recordPayment(1n, {
      amount: 60,
      payment_method: 'cash',
    })) as unknown as {
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
    const result = (await service.recordPayment(1n, {
      amount: 25,
      payment_method: 'cash',
    })) as unknown as { amount_paid: number; status: string };
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
      service.recordPayment(1n, { amount: 61, payment_method: 'cash' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.invoice_payments.create).not.toHaveBeenCalled();
  });

  it('refuses a payment on a fully paid invoice (the double-submit case)', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 100 },
      [{ amount: 100, kind: 'payment' }],
    );
    await expect(
      service.recordPayment(1n, { amount: 100, payment_method: 'cash' }),
    ).rejects.toThrow(/already fully paid/);
    expect(tx.invoice_payments.create).not.toHaveBeenCalled();
  });

  it('refuses a payment on a cancelled invoice', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 0, status: 'cancelled' },
      [],
    );
    await expect(
      service.recordPayment(1n, { amount: 10, payment_method: 'cash' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.invoice_payments.create).not.toHaveBeenCalled();
  });

  it('locks the invoice row for the duration of the transaction', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 0 },
      [],
    );
    await service.recordPayment(1n, { amount: 10, payment_method: 'card' });
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
