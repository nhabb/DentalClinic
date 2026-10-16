import { PlanQuoteService } from './plan-quote.service';

type Planned = {
  id: bigint;
  title: string;
  tooth_number: string | null;
  quoted_amount: number | null;
};

type Current = {
  id: bigint;
  status: string;
  quoted_discount: number;
  invoices: { id: bigint }[];
} | null;

/** A fake database: the patient's planned work and their current quote. */
function build(planned: Planned[], current: Current) {
  const tx = {
    patient_records: { findMany: jest.fn().mockResolvedValue(planned) },
    quotes: {
      findFirst: jest.fn().mockResolvedValue(current),
      create: jest.fn().mockResolvedValue({ id: 77n }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    quote_items: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const service = new PlanQuoteService(prisma as never);
  return { service, tx };
}

const plan = (over: Partial<Planned> = {}): Planned => ({
  id: 500n,
  title: 'Crown',
  tooth_number: '11',
  quoted_amount: 250,
  ...over,
});

const PATIENT = 7n;
const ACTOR = 21n;

describe('PlanQuoteService: the plan is the quote', () => {
  it('opens a draft quote from the plan when the patient has none', async () => {
    const { service, tx } = build(
      [plan(), plan({ id: 501n, tooth_number: '21' })],
      null,
    );
    await service.sync(PATIENT, ACTOR);

    expect(tx.quotes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          patient_id: PATIENT,
          // It needs a person to confirm it: never auto-sent, never auto-accepted.
          status: 'draft',
          created_by: ACTOR,
        }),
      }),
    );
    const { data } = tx.quotes.create.mock.calls[0][0] as {
      data: {
        items: { create: { record_id: bigint; quoted_amount: number }[] };
      };
    };
    expect(data.items.create).toEqual([
      expect.objectContaining({ record_id: 500n, quoted_amount: 250 }),
      expect.objectContaining({ record_id: 501n, quoted_amount: 250 }),
    ]);
  });

  it('rebuilds the lines of the open quote when the plan changes', async () => {
    const { service, tx } = build([plan({ quoted_amount: 300 })], {
      id: 9n,
      status: 'draft',
      quoted_discount: 0,
      invoices: [],
    });
    await service.sync(PATIENT, ACTOR);

    expect(tx.quotes.create).not.toHaveBeenCalled();
    expect(tx.quote_items.deleteMany).toHaveBeenCalledWith({
      where: { quote_id: 9n },
    });
    expect(tx.quote_items.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ quote_id: 9n, quoted_amount: 300 })],
    });
  });

  it('keeps following the plan after the patient accepted it', async () => {
    const { service, tx } = build([plan()], {
      id: 9n,
      status: 'accepted',
      quoted_discount: 0,
      invoices: [],
    });
    await service.sync(PATIENT, ACTOR);
    expect(tx.quote_items.createMany).toHaveBeenCalled();
  });

  /*
   * The one stop: an invoice was issued from this quote, so its figures are
   * money now. Letting the plan rewrite them would leave the invoice
   * disagreeing with the quote it came from.
   */
  it('leaves a billed quote alone', async () => {
    const { service, tx } = build([plan({ quoted_amount: 999 })], {
      id: 9n,
      status: 'accepted',
      quoted_discount: 0,
      invoices: [{ id: 3n }],
    });
    await service.sync(PATIENT, ACTOR);
    expect(tx.quote_items.deleteMany).not.toHaveBeenCalled();
    expect(tx.quote_items.createMany).not.toHaveBeenCalled();
    expect(tx.quotes.create).not.toHaveBeenCalled();
  });

  it('drops an unconfirmed draft once nothing is planned', async () => {
    const { service, tx } = build([], {
      id: 9n,
      status: 'draft',
      quoted_discount: 0,
      invoices: [],
    });
    await service.sync(PATIENT, ACTOR);
    expect(tx.quotes.delete).toHaveBeenCalledWith({ where: { id: 9n } });
  });

  it('keeps a confirmed quote when the plan empties: it is what was agreed', async () => {
    const { service, tx } = build([], {
      id: 9n,
      status: 'accepted',
      quoted_discount: 0,
      invoices: [],
    });
    await service.sync(PATIENT, ACTOR);
    expect(tx.quotes.delete).not.toHaveBeenCalled();
  });

  it('does nothing at all when there is no plan and no quote', async () => {
    const { service, tx } = build([], null);
    await service.sync(PATIENT, ACTOR);
    expect(tx.quotes.create).not.toHaveBeenCalled();
    expect(tx.quotes.delete).not.toHaveBeenCalled();
  });

  it('prices unpriced planned work at zero rather than failing', async () => {
    const { service, tx } = build([plan({ quoted_amount: null })], null);
    await service.sync(PATIENT, ACTOR);
    const { data } = tx.quotes.create.mock.calls[0][0] as {
      data: { items: { create: { quoted_amount: number }[] } };
    };
    expect(data.items.create[0].quoted_amount).toBe(0);
  });

  it('never lets a failed sync break the chart edit that triggered it', async () => {
    const prisma = {
      $transaction: () => Promise.reject(new Error('database is away')),
    };
    const service = new PlanQuoteService(prisma as never);
    await expect(service.sync(PATIENT, ACTOR)).resolves.toBeUndefined();
  });
});

describe('PlanQuoteService after a quote was billed', () => {
  /*
   * The billed quote is frozen, so the query no longer returns it. Work
   * planned afterwards must still be quoted: it starts a fresh draft.
   */
  it('starts a fresh draft for work planned after the last quote was billed', async () => {
    const { service, tx } = build([plan({ id: 600n, title: 'Veneers' })], null);
    await service.sync(PATIENT, ACTOR);

    expect(tx.quotes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'draft' }),
      }),
    );
    const { data } = tx.quotes.create.mock.calls[0][0] as {
      data: { items: { create: { record_id: bigint }[] } };
    };
    expect(data.items.create).toHaveLength(1);
    expect(data.items.create[0].record_id).toBe(600n);
  });

  it('asks only for a quote that carries no live invoice', async () => {
    const { service, tx } = build([plan()], null);
    await service.sync(PATIENT, ACTOR);
    expect(tx.quotes.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoices: { none: { status: { not: 'cancelled' } } },
        }),
      }),
    );
  });
});
