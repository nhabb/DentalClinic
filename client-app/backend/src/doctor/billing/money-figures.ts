import { PrismaService } from '../../shared/prisma/prisma.service';
import { dateRange } from '../../shared/common/date-only';
import {
  daysOverdue,
  EPSILON,
  LIVE_STATUSES,
  round2,
} from './invoice-math';

/**
 * The money figures, defined once.
 *
 * `money-sums.ts` is the layer below: three aggregates over
 * `payment_allocations`, whose SQL aliases the service specs match on. This is
 * the reporting layer above it — the words a person uses for money — and it
 * imports that module, never the other way round.
 *
 * It exists because the same question had five answers. "Outstanding" was
 * written out four times with `status IN ('open','partial')` and once with
 * `LIVE_STATUSES AND remaining_amount > 0`; "received" meant gross money in one
 * place, allocated money in another, and the sum of a loaded page of invoices
 * in a third. Nothing was wrong enough to notice, and every screen quoted a
 * slightly different number for the same patient.
 *
 * Two identities hold over every figure set this module produces, and the
 * specs and the smoke both assert them:
 *
 *     received = applied + credit_held      money in is either on a bill or not
 *     billed - applied = due_now            what is billed is either paid or owed
 *
 * They only hold if the figures are read together, which is why
 * `patientMoneyFigures` batches its queries into one transaction.
 */

/** An invoice the clinic actually billed. A cancelled one was never billed. */
export const BILLED_INVOICES: { status: { in: string[] } } = {
  status: { in: [...LIVE_STATUSES] },
};

/**
 * An invoice that is still owed money — THE outstanding predicate, the only
 * one. `LIVE_STATUSES` admits `paid`, so the `> 0` is what excludes a settled
 * bill; it also excludes an open row the allocation trigger has not moved to
 * `paid` yet, which is the question actually being asked.
 */
export const OWED_INVOICES: {
  status: { in: string[] };
  remaining_amount: { gt: number };
} = {
  status: { in: [...LIVE_STATUSES] },
  remaining_amount: { gt: 0 },
};

/** Money that moved, by kind and scope. Gross: allocations are not consulted. */
export interface MoneyMoved {
  /** Money received. */
  payments: number;
  /** Money returned, both kinds together. */
  refunds: number;
  /** Returned off a named bill: lowers that invoice's amount_paid. */
  refunds_on_invoices: number;
  /** Unapplied credit handed back: touches no invoice. */
  refunds_of_credit: number;
  /** payments - refunds: what the clinic actually kept. */
  net: number;
  payment_count: number;
  refund_count: number;
}

export interface MoneyFigures {
  /** Sum of what the invoices say, after discounts. Cancelled never counts. */
  billed: number;
  /** Money in, net of refunds of either kind. The till figure. */
  received: number;
  /** Of that, what reached an invoice. Refund allocations subtract. */
  applied: number;
  /** Money in that is on no bill: received - applied. */
  credit_held: number;
  /** Billed and not settled. What the desk chases. */
  due_now: number;
  /** Of that, past its due date on the clinic's calendar. */
  overdue: number;
  /** How many invoices were billed. */
  invoice_count: number;
}

/** The invoice columns every figure here is computed from. */
export interface InvoiceFigureRow {
  total_amount: unknown;
  amount_paid: unknown;
  remaining_amount: unknown;
  status: string;
  due_date: Date;
}

/**
 * The figures from invoice rows already in hand, plus the money that moved.
 *
 * `getKpis` loads those rows anyway; making it query again would be three more
 * round trips for numbers it is holding. Every other caller goes through the
 * two async helpers below, which end here.
 */
export function figuresFromRows(
  invoices: InvoiceFigureRow[],
  money: MoneyMoved,
  now = new Date(),
): MoneyFigures {
  const billedRows = invoices.filter((i) =>
    (LIVE_STATUSES as readonly string[]).includes(i.status),
  );
  const owedRows = billedRows.filter(
    (i) => Number(i.remaining_amount) > EPSILON,
  );
  const sum = (rows: InvoiceFigureRow[], pick: (r: InvoiceFigureRow) => unknown) =>
    rows.reduce((s, r) => s + Number(pick(r)), 0);

  // `applied` is read off the invoices because the allocation trigger is what
  // maintains `amount_paid`: it is the database's own answer to "how much of
  // this bill is paid", and taking it from anywhere else would be a fifth
  // definition of the same number. Cancelled invoices are excluded, which is
  // safe because a void is refused while anything is net-paid, so a cancelled
  // bill holds no allocations to miss.
  const applied = sum(billedRows, (r) => r.amount_paid);

  return {
    billed: round2(sum(billedRows, (r) => r.total_amount)),
    received: round2(money.net),
    applied: round2(applied),
    credit_held: round2(money.net - applied),
    due_now: round2(sum(owedRows, (r) => r.remaining_amount)),
    overdue: round2(
      sum(
        owedRows.filter((r) => daysOverdue(r.due_date, now) > 0),
        (r) => r.remaining_amount,
      ),
    ),
    invoice_count: billedRows.length,
  };
}

const FIGURE_COLUMNS = {
  total_amount: true,
  amount_paid: true,
  remaining_amount: true,
  status: true,
  due_date: true,
} as const;

/**
 * Money that moved, grouped by kind and refund scope. The one place the
 * payments-minus-refunds rule is written.
 */
export async function moneyMoved(
  prisma: PrismaService,
  where: Record<string, unknown> = {},
): Promise<MoneyMoved> {
  const rows = await prisma.invoice_payments.groupBy({
    by: ['kind', 'refund_scope'],
    where,
    _sum: { amount: true },
    _count: { id: true },
    orderBy: undefined,
  });
  return moneyMovedFromRows(rows);
}

/**
 * One patient's figures.
 *
 * Both reads go in one `$transaction` batch so the identities above hold: read
 * the invoices and the payments a moment apart and a desk taking money between
 * them leaves `received` ahead of `applied` for no reason anyone can see.
 */
export async function patientMoneyFigures(
  prisma: PrismaService,
  patientId: bigint,
  now = new Date(),
): Promise<MoneyFigures> {
  // The interactive form, never the array form: a batch transaction checks out
  // its connection in whichever request's async context scheduled the tick, so
  // it can be primed with another clinic's tenant (no-batch-transactions.spec).
  return prisma.$transaction(async (tx) => {
    const invoices = await tx.treatment_invoices.findMany({
      where: { patient_id: patientId, ...BILLED_INVOICES },
      select: FIGURE_COLUMNS,
    });
    const paymentRows = await tx.invoice_payments.groupBy({
      by: ['kind', 'refund_scope'],
      where: { patient_id: patientId },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: undefined,
    });
    return figuresFromRows(invoices, moneyMovedFromRows(paymentRows), now);
  });
}

/** The clinic's figures. `range` windows the money on the day it moved. */
export async function clinicMoneyFigures(
  prisma: PrismaService,
  range?: { from?: string; to?: string },
  now = new Date(),
): Promise<MoneyFigures> {
  const window = dateRange(range?.from, range?.to);
  const [invoices, money] = await Promise.all([
    prisma.treatment_invoices.findMany({
      where: BILLED_INVOICES,
      select: FIGURE_COLUMNS,
    }),
    moneyMoved(prisma, window ? { payment_date: window } : {}),
  ]);
  return figuresFromRows(invoices, money, now);
}

/** A row of `invoice_payments.groupBy(['kind','refund_scope'])`, loosely typed. */
export interface MoneyGroupRow {
  kind: string;
  refund_scope?: string | null;
  _sum?: { amount?: unknown } | null;
  _count?: { id?: number } | null;
}

/** The grouped rows a `groupBy` returns, turned into a `MoneyMoved`. */
export function moneyMovedFromRows(rows: MoneyGroupRow[]): MoneyMoved {
  const sumOf = (match: (r: MoneyGroupRow) => boolean) =>
    rows.filter(match).reduce((s, r) => s + Number(r._sum?.amount ?? 0), 0);
  const countOf = (match: (r: MoneyGroupRow) => boolean) =>
    rows.filter(match).reduce((s, r) => s + Number(r._count?.id ?? 0), 0);

  const payments = sumOf((r) => r.kind === 'payment');
  const refunds = sumOf((r) => r.kind === 'refund');
  return {
    payments,
    refunds,
    refunds_on_invoices: round2(
      sumOf((r) => r.kind === 'refund' && r.refund_scope === 'invoice'),
    ),
    refunds_of_credit: round2(
      sumOf((r) => r.kind === 'refund' && r.refund_scope === 'credit'),
    ),
    net: round2(payments - refunds),
    payment_count: countOf((r) => r.kind === 'payment'),
    refund_count: countOf((r) => r.kind === 'refund'),
  };
}

/** What was taken, split by how it was taken. For counting the drawer. */
export interface MoneyByMethod {
  method: string;
  payments: number;
  refunds: number;
  /** payments - refunds, by the same sign rule as everywhere else. */
  net: number;
  count: number;
}

/**
 * The same money, grouped by method.
 *
 * It lives here, beside `moneyMoved`, so the till breakdown and the headline
 * figure are the same rule applied twice rather than two rules: the parts
 * sum to the whole by construction, which is what makes the page safe to
 * count a cash drawer against.
 */
export async function moneyMovedByMethod(
  prisma: PrismaService,
  where: Record<string, unknown> = {},
): Promise<MoneyByMethod[]> {
  const rows = await prisma.invoice_payments.groupBy({
    by: ['payment_method', 'kind', 'refund_scope'],
    where,
    _sum: { amount: true },
    _count: { id: true },
    orderBy: undefined,
  });
  const methods = [...new Set(rows.map((r) => r.payment_method))].sort();
  return methods.map((method) => {
    const moved = moneyMovedFromRows(rows.filter((r) => r.payment_method === method));
    return {
      method,
      payments: round2(moved.payments),
      refunds: round2(moved.refunds),
      net: moved.net,
      count: moved.payment_count + moved.refund_count,
    };
  });
}

/**
 * The two identities, for the specs and the smoke to assert. Compared with
 * `EPSILON`, never `===`: these are sums of two-decimal money.
 */
export function figureIdentities(f: MoneyFigures): {
  receivedBalances: boolean;
  billedBalances: boolean;
} {
  return {
    receivedBalances: Math.abs(f.received - (f.applied + f.credit_held)) < EPSILON,
    billedBalances: Math.abs(f.billed - f.applied - f.due_now) < EPSILON,
  };
}
