import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingService, deriveInvoiceStatus } from './billing.service';

/**
 * A fake transaction: the invoice row, the payments already recorded, and the
 * statements the service runs against them.
 */
function build(
  invoice: { id: bigint; total_amount: number; amount_paid: number },
  payments: number[],
) {
  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue([
        { id: invoice.id, total_amount: invoice.total_amount },
      ]),
    invoice_payments: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amount: payments.reduce((a, b) => a + b, 0) },
      }),
      create: jest.fn().mockResolvedValue({}),
    },
    treatment_invoices: {
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...invoice, ...args.data }),
      ),
    },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    treatment_invoices: {
      findUnique: jest.fn().mockResolvedValue(invoice),
      delete: jest.fn().mockResolvedValue(invoice),
    },
  };
  const service = new BillingService(prisma as never);
  return { service, tx, prisma };
}

describe('BillingService.recordPayment', () => {
  it('derives the new totals from the payments table, not from the invoice row', async () => {
    // The row says 0 paid, but the payments table already holds 40: the table wins.
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 0 },
      [40],
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

  it('refuses a payment beyond the remaining balance', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 40 },
      [40],
    );
    await expect(
      service.recordPayment(1n, { amount: 61, payment_method: 'cash' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.invoice_payments.create).not.toHaveBeenCalled();
  });

  it('refuses a payment on a fully paid invoice (the double-submit case)', async () => {
    const { service, tx } = build(
      { id: 1n, total_amount: 100, amount_paid: 100 },
      [100],
    );
    await expect(
      service.recordPayment(1n, { amount: 100, payment_method: 'cash' }),
    ).rejects.toThrow(/already fully paid/);
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

describe('BillingService.deleteInvoice', () => {
  it('refuses to delete an invoice that has payments', async () => {
    const { service, prisma } = build(
      { id: 1n, total_amount: 100, amount_paid: 30 },
      [30],
    );
    await expect(service.deleteInvoice(1n)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.treatment_invoices.delete).not.toHaveBeenCalled();
  });

  it('deletes an unpaid invoice', async () => {
    const { service, prisma } = build(
      { id: 1n, total_amount: 100, amount_paid: 0 },
      [],
    );
    await expect(service.deleteInvoice(1n)).resolves.toEqual({ success: true });
    expect(prisma.treatment_invoices.delete).toHaveBeenCalled();
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
