import { appliedOf, creditOf, creditOfPatient } from './money-sums';
import type { Tx } from '../../shared/prisma/prisma.service';

/*
 * `creditOfPatient` (SQL, read under lock) and `creditOf` (JS, over rows the
 * ledger already loaded) are twins: the module's own comment says they must
 * agree, and nothing checked it. They are the reason a patient's credit could
 * read one way in a locked write path and another on the screen.
 *
 * The SQL cannot run here, so what is pinned is its sign rule, transcribed
 * from the statement, against the JS implementation over the same rows.
 */

type Row = { kind: 'payment' | 'refund'; amount: number; applied: number };

/** The CASE in `creditOfPatient`, written out: sign × (amount − applied). */
const creditBySqlRule = (rows: Row[]) =>
  Math.round(
    rows.reduce(
      (sum, r) => sum + (r.kind === 'refund' ? -1 : 1) * (r.amount - r.applied),
      0,
    ) * 100,
  ) / 100;

const asLedgerRows = (rows: Row[]) =>
  rows.map((r) => ({ kind: r.kind, unapplied: r.amount - r.applied }));

const CASES: { name: string; rows: Row[] }[] = [
  { name: 'nothing has moved', rows: [] },
  {
    name: 'a deposit nobody has applied',
    rows: [{ kind: 'payment', amount: 1000, applied: 0 }],
  },
  {
    name: 'a payment fully applied to bills',
    rows: [{ kind: 'payment', amount: 300, applied: 300 }],
  },
  {
    name: 'a payment spread over bills with a remainder',
    rows: [{ kind: 'payment', amount: 1000, applied: 640 }],
  },
  {
    name: 'a refund taken off a bill',
    rows: [
      { kind: 'payment', amount: 200, applied: 200 },
      { kind: 'refund', amount: 50, applied: 50 },
    ],
  },
  {
    name: 'credit handed back, which carries no allocation',
    rows: [
      { kind: 'payment', amount: 500, applied: 200 },
      { kind: 'refund', amount: 300, applied: 0 },
    ],
  },
  {
    name: 'both kinds of refund at once',
    rows: [
      { kind: 'payment', amount: 900, applied: 400 },
      { kind: 'refund', amount: 100, applied: 100 },
      { kind: 'refund', amount: 250, applied: 0 },
    ],
  },
  {
    name: 'fractional amounts that round',
    rows: [
      { kind: 'payment', amount: 33.33, applied: 11.11 },
      { kind: 'payment', amount: 66.67, applied: 0 },
    ],
  },
];

describe('credit: the SQL and JS twins agree', () => {
  it.each(CASES)('$name', ({ rows }) => {
    expect(Math.round(creditOf(asLedgerRows(rows)) * 100) / 100).toBe(
      creditBySqlRule(rows),
    );
  });
});

describe('appliedOf', () => {
  it('sums a payment’s allocations without rounding', () => {
    // Deliberately unrounded: the caller rounds the applied figure and the
    // remainder separately, so rounding here would compound into the remainder.
    expect(appliedOf([{ amount: 10.005 }, { amount: 0.001 }])).toBeCloseTo(
      10.006,
      6,
    );
    expect(appliedOf([])).toBe(0);
  });
});

describe('creditOfPatient', () => {
  it('asks one question of the database and rounds the answer', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ credit: '149.999' }]),
    } as unknown as Tx;
    await expect(creditOfPatient(tx, 7n)).resolves.toBe(150);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('reads an empty account as zero, not as NaN', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) } as unknown as Tx;
    await expect(creditOfPatient(tx, 7n)).resolves.toBe(0);
  });
});
