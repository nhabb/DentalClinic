import {
  figureIdentities,
  figuresFromRows,
  moneyMovedFromRows,
  type InvoiceFigureRow,
  type MoneyMoved,
} from './money-figures';

/*
 * The point of these tests is not that the sums add up — it is that the two
 * identities hold for every shape money can take. Each one is a disagreement
 * that used to be possible between two screens.
 */

const NOW = new Date('2026-10-15T09:00:00.000Z');

const invoice = (
  total: number,
  paid: number,
  status: string,
  due = '2026-10-20',
): InvoiceFigureRow => ({
  total_amount: total,
  amount_paid: paid,
  remaining_amount: status === 'cancelled' ? total - paid : total - paid,
  status,
  due_date: new Date(`${due}T00:00:00.000Z`),
});

const moved = (payments: number, refunds = 0, scope: 'invoice' | 'credit' = 'invoice'): MoneyMoved =>
  moneyMovedFromRows([
    { kind: 'payment', refund_scope: null, _sum: { amount: payments }, _count: { id: 1 } },
    ...(refunds
      ? [
          {
            kind: 'refund',
            refund_scope: scope,
            _sum: { amount: refunds },
            _count: { id: 1 },
          },
        ]
      : []),
  ]);

const bothIdentities = (f: ReturnType<typeof figuresFromRows>) => {
  const id = figureIdentities(f);
  expect(id.receivedBalances).toBe(true);
  expect(id.billedBalances).toBe(true);
};

describe('figuresFromRows', () => {
  it('holds both identities for a bill paid in full', () => {
    const f = figuresFromRows([invoice(300, 300, 'paid')], moved(300), NOW);
    expect(f).toMatchObject({ billed: 300, received: 300, applied: 300, credit_held: 0, due_now: 0 });
    bothIdentities(f);
  });

  it('holds them for a bill half paid', () => {
    const f = figuresFromRows([invoice(300, 120, 'partial')], moved(120), NOW);
    expect(f).toMatchObject({ billed: 300, applied: 120, due_now: 180, credit_held: 0 });
    bothIdentities(f);
  });

  it('reports a deposit with no bill as credit, not as paid work', () => {
    const f = figuresFromRows([], moved(500), NOW);
    expect(f).toMatchObject({ billed: 0, received: 500, applied: 0, credit_held: 500, due_now: 0 });
    bothIdentities(f);
  });

  it('holds them when a deposit part-settles a later bill', () => {
    const f = figuresFromRows([invoice(300, 200, 'partial')], moved(500), NOW);
    expect(f).toMatchObject({ received: 500, applied: 200, credit_held: 300, due_now: 100 });
    bothIdentities(f);
  });

  it('holds them after a refund off a bill', () => {
    // 200 in, 50 handed back off the bill: the allocation trigger lowered
    // amount_paid to 150, so applied follows it and credit stays empty.
    const f = figuresFromRows([invoice(300, 150, 'partial')], moved(200, 50, 'invoice'), NOW);
    expect(f).toMatchObject({ received: 150, applied: 150, credit_held: 0, due_now: 150 });
    bothIdentities(f);
  });

  it('holds them after credit is handed back', () => {
    // 500 in, 300 onto the bill, 200 of credit returned: nothing left over.
    const f = figuresFromRows([invoice(300, 300, 'paid')], moved(500, 200, 'credit'), NOW);
    expect(f).toMatchObject({ received: 300, applied: 300, credit_held: 0, due_now: 0 });
    bothIdentities(f);
  });

  it('reads billed after the discount, which is what the bill says', () => {
    // Lines came to 500, the bill was issued at 450.
    const f = figuresFromRows([invoice(450, 0, 'open')], moved(0), NOW);
    expect(f.billed).toBe(450);
    bothIdentities(f);
  });

  it('counts a cancelled invoice in nothing', () => {
    const f = figuresFromRows(
      [invoice(300, 0, 'open'), invoice(900, 0, 'cancelled')],
      moved(0),
      NOW,
    );
    expect(f).toMatchObject({ billed: 300, due_now: 300, invoice_count: 1 });
    bothIdentities(f);
  });

  it('counts a zero-total invoice as billed but never as owed', () => {
    const f = figuresFromRows([invoice(0, 0, 'paid')], moved(0), NOW);
    expect(f).toMatchObject({ billed: 0, due_now: 0, invoice_count: 1 });
    bothIdentities(f);
  });

  it('counts only past-due balances as overdue, and never more than is owed', () => {
    const f = figuresFromRows(
      [
        invoice(100, 0, 'open', '2026-09-01'), // long overdue
        invoice(200, 0, 'open', '2026-10-15'), // due today: not late
        invoice(400, 0, 'open', '2026-11-30'), // not yet due
      ],
      moved(0),
      NOW,
    );
    expect(f.due_now).toBe(700);
    expect(f.overdue).toBe(100);
    expect(f.overdue).toBeLessThanOrEqual(f.due_now);
    bothIdentities(f);
  });

  it('leaves a settled bill out of due_now even if its status lags', () => {
    // `OWED_INVOICES` asks `remaining > 0` rather than trusting the status
    // word, so a row the trigger has not moved to `paid` yet cannot inflate
    // what the desk is told to chase.
    const f = figuresFromRows([invoice(300, 300, 'open')], moved(300), NOW);
    expect(f.due_now).toBe(0);
    bothIdentities(f);
  });
});

describe('moneyMovedFromRows', () => {
  it('keeps the two refund scopes apart and sums them into total refunds', () => {
    const m = moneyMovedFromRows([
      { kind: 'payment', refund_scope: null, _sum: { amount: 1000 }, _count: { id: 3 } },
      { kind: 'refund', refund_scope: 'invoice', _sum: { amount: 50 }, _count: { id: 1 } },
      { kind: 'refund', refund_scope: 'credit', _sum: { amount: 120 }, _count: { id: 2 } },
    ]);
    expect(m).toEqual({
      payments: 1000,
      refunds: 170,
      refunds_on_invoices: 50,
      refunds_of_credit: 120,
      net: 830,
      payment_count: 3,
      refund_count: 3,
    });
  });
});

describe('the till breakdown is the same rule as the headline', () => {
  // The parts have to sum to the whole, or a page that shows both invites
  // somebody to count a cash drawer against a number that cannot be right.
  const rows = [
    { kind: 'payment', refund_scope: null, payment_method: 'cash', _sum: { amount: 400 }, _count: { id: 2 } },
    { kind: 'payment', refund_scope: null, payment_method: 'card', _sum: { amount: 840 }, _count: { id: 3 } },
    { kind: 'refund', refund_scope: 'invoice', payment_method: 'cash', _sum: { amount: 50 }, _count: { id: 1 } },
  ];

  it('splits by method with the same sign rule, and the parts add to the whole', () => {
    const whole = moneyMovedFromRows(rows);
    const byMethod = [...new Set(rows.map((r) => r.payment_method))].sort().map((m) => ({
      method: m,
      ...moneyMovedFromRows(rows.filter((r) => r.payment_method === m)),
    }));

    expect(byMethod.map((m) => m.method)).toEqual(['card', 'cash']);
    expect(byMethod.find((m) => m.method === 'cash')?.net).toBe(350);
    expect(byMethod.find((m) => m.method === 'card')?.net).toBe(840);
    expect(byMethod.reduce((s, m) => s + m.net, 0)).toBe(whole.net);
  });
});
