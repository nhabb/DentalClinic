import { Tx } from '../../shared/prisma/prisma.service';
import { round2 } from './invoice-math';

/**
 * The money sums, written once.
 *
 * Every figure the billing code quotes is one of three aggregates over
 * `payment_allocations`: what is applied to an invoice, what is applied out of
 * a payment, and what a patient has left over. They were hand-written four
 * times across two services, which is how the two payment paths came to
 * disagree about what an invoice's balance was.
 *
 * The SQL text matters beyond the database: the service specs fake
 * `$queryRaw` and tell the statements apart by their column aliases
 * (`AS net`, `AS applied`, `AS credit`) and by the presence of `FOR UPDATE`.
 * Renaming an alias here would make a fake fall through to the wrong branch
 * and the tests would pass against the wrong data. Keep the aliases.
 */

/**
 * What is applied to one invoice: allocated payments minus allocated refunds.
 *
 * Callers that are about to change an invoice should prefer the
 * `remaining_amount` of the row they hold under `FOR UPDATE` — the allocation
 * trigger keeps it, and the lock is what makes it authoritative. This stays
 * for the paths that only read.
 */
export async function netPaidOnInvoice(
  tx: Tx,
  invoiceId: bigint,
): Promise<number> {
  const [row] = await tx.$queryRaw<{ net: unknown }[]>`
      SELECT COALESCE(SUM(CASE WHEN p.kind = 'refund' THEN -a.amount ELSE a.amount END), 0) AS net
        FROM payment_allocations a
        JOIN invoice_payments p ON p.id = a.payment_id
       WHERE a.invoice_id = ${invoiceId}`;
  return Number(row?.net ?? 0);
}

/** How much of one payment is already sitting on invoices. */
export async function appliedOfPayment(
  tx: Tx,
  paymentId: bigint,
): Promise<number> {
  const [row] = await tx.$queryRaw<{ applied: unknown }[]>`
      SELECT COALESCE(SUM(amount), 0) AS applied
        FROM payment_allocations WHERE payment_id = ${paymentId}`;
  return Number(row?.applied ?? 0);
}

/** Received-but-unapplied money of one patient, less refunds taken out of it. */
export async function creditOfPatient(
  tx: Tx,
  patientId: bigint,
): Promise<number> {
  const [row] = await tx.$queryRaw<{ credit: unknown }[]>`
      SELECT COALESCE(SUM(
               CASE WHEN p.kind = 'refund' THEN -1 ELSE 1 END
               * (p.amount - COALESCE(a.applied, 0))
             ), 0) AS credit
        FROM invoice_payments p
        LEFT JOIN (
          SELECT payment_id, SUM(amount) AS applied
            FROM payment_allocations GROUP BY payment_id
        ) a ON a.payment_id = p.id
       WHERE p.patient_id = ${patientId}`;
  return round2(Number(row?.credit ?? 0));
}

// ── The same two sums, over rows already in hand ──────────────────────────
// `ledger()` has every allocation loaded, so asking the database again would
// be a round trip per payment. These are the pure twins of the queries above,
// named so it is obvious they must agree with them.

/**
 * What a payment has on invoices, from its loaded allocations. Deliberately
 * unrounded: the caller rounds the applied figure and the remainder separately,
 * so rounding here would compound into the remainder.
 */
export function appliedOf(allocations: { amount: unknown }[]): number {
  return allocations.reduce((sum, a) => sum + Number(a.amount), 0);
}

/**
 * Credit from payment rows whose unapplied part is already worked out. The
 * sign rule is `creditOfPatient`'s: a refund's unapplied part is money that
 * left, so it counts against the credit held.
 */
export function creditOf(rows: { kind: string; unapplied: number }[]): number {
  return rows.reduce(
    (sum, r) => sum + (r.kind === 'refund' ? -r.unapplied : r.unapplied),
    0,
  );
}
