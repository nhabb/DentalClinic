import { PlanService } from './plan.service';
import {
  isBilledState,
  planLineState,
  type PlanInvoiceStatus,
} from './plan-record-types';

/*
 * The plan used to stop at "billed": it joined the invoice and read only its
 * number, so nobody looking at a treatment plan could tell whether any of it
 * had been paid. These tests pin the chain it reads now — planned, done,
 * billed, part paid, paid — and the two things that make it honest: a billed
 * line stays frozen at the price its invoice froze, and two lines sharing one
 * bill count that bill once.
 */

describe('planLineState', () => {
  const cases: [string, PlanInvoiceStatus, string][] = [
    ['treatment_plan', null, 'planned'],
    ['treatment', null, 'done'],
    ['treatment_plan', 'open', 'billed'],
    ['treatment', 'open', 'billed'],
    ['treatment', 'partial', 'part_paid'],
    ['treatment', 'paid', 'paid'],
    ['treatment_plan', 'paid', 'paid'],
  ];

  it.each(cases)('%s on a %s invoice reads %s', (type, status, expected) => {
    expect(planLineState(type, status)).toBe(expected);
  });

  it('keeps a line on a cancelled invoice billed, never planned again', () => {
    // A void releases the record (invoice_id -> NULL), so this should be
    // unreachable. If it ever happens the record is still frozen, and calling
    // it "planned" would invite a reprice the database refuses.
    expect(planLineState('treatment_plan', 'cancelled')).toBe('billed');
    expect(isBilledState('cancelled' as never)).toBe(false);
  });
});

describe('isBilledState', () => {
  it('is true for every state at or past billed', () => {
    expect(isBilledState('planned')).toBe(false);
    expect(isBilledState('done')).toBe(false);
    expect(isBilledState('billed')).toBe(true);
    expect(isBilledState('part_paid')).toBe(true);
    expect(isBilledState('paid')).toBe(true);
  });
});

// ── PlanService.read ────────────────────────────────────────────────────────

type FakeInvoice = {
  id: bigint;
  invoice_number: string;
  status: string;
  total_amount: number;
  amount_paid: number;
};

type FakeRecord = {
  id: bigint;
  title: string;
  tooth_number: string | null;
  quoted_amount: number | null;
  record_type: string;
  invoice?: FakeInvoice;
};

function buildPlan(records: FakeRecord[], agreed?: { at: Date; digest: string | null }) {
  const prisma = {
    quotes: {
      findFirst: jest.fn().mockResolvedValue({
        id: 9n,
        quote_number: 'QUO-2026-00009',
        notes: null,
        accepted_at: agreed?.at ?? null,
        accepted_digest: agreed?.digest ?? null,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    patient_records: {
      findMany: jest.fn().mockResolvedValue(
        records.map((r) => ({
          id: r.id,
          title: r.title,
          tooth_number: r.tooth_number,
          treatment_date: new Date('2026-10-01'),
          quoted_amount: r.quoted_amount,
          record_type: r.record_type,
          invoice_id: r.invoice?.id ?? null,
          invoice: r.invoice
            ? {
                ...r.invoice,
                remaining_amount:
                  r.invoice.total_amount - r.invoice.amount_paid,
                due_date: new Date('2026-10-10'),
              }
            : null,
        })),
      ),
    },
    quote_sends: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new PlanService(
    prisma as never,
    { record: jest.fn() } as never,
  );
  return { service, prisma };
}

const BILL = {
  id: 70n,
  invoice_number: 'INV-2026-00070',
  status: 'open',
  total_amount: 250,
  amount_paid: 0,
};

describe('PlanService.read: the plan says how far the money got', () => {
  it('reads a billed line as paid once its bill is settled, still frozen at its price', async () => {
    const { service } = buildPlan([
      {
        id: 1n,
        title: 'Crown',
        tooth_number: '11',
        quoted_amount: 250,
        record_type: 'treatment',
        invoice: { ...BILL, status: 'paid', amount_paid: 250 },
      },
    ]);
    const plan = await service.read(7n);
    expect(plan.lines[0]).toMatchObject({
      state: 'paid',
      locked: true,
      amount: 250,
      invoice_status: 'paid',
      invoice_number: 'INV-2026-00070',
    });
  });

  it('reads it as part paid while the bill is half settled', async () => {
    const { service } = buildPlan([
      {
        id: 1n,
        title: 'Crown',
        tooth_number: '11',
        quoted_amount: 250,
        record_type: 'treatment',
        invoice: { ...BILL, status: 'partial', amount_paid: 100 },
      },
    ]);
    const plan = await service.read(7n);
    expect(plan.lines[0]).toMatchObject({ state: 'part_paid', locked: true });
  });

  it('counts a bill once when two lines share it', async () => {
    const shared = { ...BILL, status: 'partial', amount_paid: 100 };
    const { service } = buildPlan([
      {
        id: 1n,
        title: 'Crown',
        tooth_number: '11',
        quoted_amount: 150,
        record_type: 'treatment',
        invoice: shared,
      },
      {
        id: 2n,
        title: 'Filling',
        tooth_number: '12',
        quoted_amount: 100,
        record_type: 'treatment',
        invoice: shared,
      },
    ]);
    const plan = await service.read(7n);
    expect(plan.settlement).toEqual({
      invoice_count: 1,
      invoiced_total: 250,
      received: 100,
      due: 150,
    });
    // Both lines are billed, at the chart's prices.
    expect(plan.totals.billed_value).toBe(250);
    expect(plan.counts.billed).toBe(2);
  });

  it('keeps billed_value on the chart price when the bill carried a discount', async () => {
    const { service } = buildPlan([
      {
        id: 1n,
        title: 'Crown',
        tooth_number: '11',
        quoted_amount: 500,
        record_type: 'treatment',
        // The desk gave 50 off, so the bill came to 450.
        invoice: { ...BILL, total_amount: 450, amount_paid: 0 },
      },
    ]);
    const plan = await service.read(7n);
    expect(plan.totals.billed_value).toBe(500);
    expect(plan.settlement.invoiced_total).toBe(450);
  });

  it('splits the plan into billed and not yet billed, and they add up', async () => {
    const { service } = buildPlan([
      {
        id: 1n,
        title: 'Crown',
        tooth_number: '11',
        quoted_amount: 250,
        record_type: 'treatment',
        invoice: { ...BILL, status: 'paid', amount_paid: 250 },
      },
      {
        id: 2n,
        title: 'Implant',
        tooth_number: '24',
        quoted_amount: 800,
        record_type: 'treatment_plan',
      },
      {
        id: 3n,
        title: 'Filling',
        tooth_number: '36',
        quoted_amount: null,
        record_type: 'treatment_plan',
      },
    ]);
    const plan = await service.read(7n);
    expect(plan.totals.plan).toBe(1050);
    expect(plan.totals.billed_value).toBe(250);
    expect(plan.totals.unbilled_value).toBe(800);
    expect(plan.totals.billed_value + plan.totals.unbilled_value).toBe(
      plan.totals.plan,
    );
    // The unpriced line is counted, never summed as zero.
    expect(plan.totals.unpriced_count).toBe(1);
  });

  it('counts a paid line as billed as well, so the buckets stay exclusive', async () => {
    const { service } = buildPlan([
      {
        id: 1n,
        title: 'Crown',
        tooth_number: '11',
        quoted_amount: 250,
        record_type: 'treatment',
        invoice: { ...BILL, status: 'paid', amount_paid: 250 },
      },
      {
        id: 2n,
        title: 'Implant',
        tooth_number: '24',
        quoted_amount: 800,
        record_type: 'treatment_plan',
      },
    ]);
    const plan = await service.read(7n);
    expect(plan.counts).toEqual({
      planned: 1,
      done: 0,
      billed: 1,
      part_paid: 0,
      paid: 1,
    });
  });

  it('reports nothing settled for a plan nobody has billed', async () => {
    const { service } = buildPlan([
      {
        id: 1n,
        title: 'Implant',
        tooth_number: '24',
        quoted_amount: 800,
        record_type: 'treatment_plan',
      },
    ]);
    const plan = await service.read(7n);
    expect(plan.settlement).toEqual({
      invoice_count: 0,
      invoiced_total: 0,
      received: 0,
      due: 0,
    });
    expect(plan.lines[0]).toMatchObject({
      state: 'planned',
      locked: false,
      invoice_id: null,
      invoice_status: null,
    });
  });
});


// ── The agreement is for a plan, not for a patient ─────────────────────────

describe('PlanService.read: an agreement goes stale when the plan moves on', () => {
  const CROWN: FakeRecord = {
    id: 1n,
    title: 'Crown',
    tooth_number: '11',
    quoted_amount: 250,
    record_type: 'treatment_plan',
  };
  const IMPLANT: FakeRecord = {
    id: 2n,
    title: 'Implant',
    tooth_number: '24',
    quoted_amount: 800,
    record_type: 'treatment_plan',
  };

  /** The digest the plan would have had when it held exactly these lines. */
  const digestOf = async (records: FakeRecord[]) =>
    (await buildPlan(records).service.read(7n)).digest;

  it('is not stale while the plan is the one they agreed to', async () => {
    const digest = await digestOf([CROWN]);
    const { service } = buildPlan([CROWN], { at: new Date(), digest });
    const plan = await service.read(7n);
    expect(plan.agreement_stale).toBe(false);
  });

  it('is stale once work is added after they agreed', async () => {
    const digest = await digestOf([CROWN]);
    const { service } = buildPlan([CROWN, IMPLANT], { at: new Date(), digest });
    const plan = await service.read(7n);
    expect(plan.agreement_stale).toBe(true);
  });

  it('is stale once a line they agreed to is repriced', async () => {
    const digest = await digestOf([CROWN]);
    const { service } = buildPlan([{ ...CROWN, quoted_amount: 400 }], {
      at: new Date(),
      digest,
    });
    expect((await service.read(7n)).agreement_stale).toBe(true);
  });

  it('is NOT stale when the work is merely done or billed', async () => {
    // The deal did not change: the same tooth, the same procedure, the same
    // price. Asking for a fresh signature because a crown was fitted would
    // make the warning noise and nobody would read it.
    const digest = await digestOf([CROWN]);
    const done = { ...CROWN, record_type: 'treatment' };
    expect(
      (await buildPlan([done], { at: new Date(), digest }).service.read(7n))
        .agreement_stale,
    ).toBe(false);

    const billed = { ...done, invoice: { ...BILL, status: 'paid', amount_paid: 250 } };
    expect(
      (await buildPlan([billed], { at: new Date(), digest }).service.read(7n))
        .agreement_stale,
    ).toBe(false);
  });

  it('never nags about an agreement taken before fingerprints existed', async () => {
    const { service } = buildPlan([CROWN, IMPLANT], { at: new Date(), digest: null });
    expect((await service.read(7n)).agreement_stale).toBe(false);
  });
});