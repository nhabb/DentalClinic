import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * The database's refusals, answered in words a desk can act on.
 *
 * The money invariants are enforced in PostgreSQL, not in the application:
 * constraints and triggers from `20261009010000_payment_integrity`,
 * `20261017120000_patient_ledger_allocations` and
 * `20261017140000_quote_progress_view_and_refund_guard`. That is deliberate —
 * two desks posting at the same instant are stopped by the row, not by a check
 * either of them ran first.
 *
 * The cost is that a lost race arrives as a raw driver error and escapes as a
 * 500. This maps each one to the answer it deserves, so a race reads as
 * "someone beat you to it, reload" rather than as a crash.
 */

/** The refusals we recognise, each keyed by the text PostgreSQL puts in the message. */
const CONSTRAINTS = [
  {
    key: 'paid_within_total',
    match: /paid_within_total/,
    exception: ConflictException,
    message:
      'Another payment was recorded on this invoice a moment ago; reload it and try again',
  },
  {
    key: 'payment_allocations_within_payment',
    match: /payment_allocations_within_payment/,
    exception: ConflictException,
    message:
      'This payment has already been applied elsewhere; reload the account and try again',
  },
  {
    key: 'payment_allocations_same_patient',
    match: /payment_allocations_same_patient/,
    exception: BadRequestException,
    message:
      'That invoice belongs to another patient; credit cannot move between patients',
  },
  {
    key: 'payment_allocations_refund_stays',
    match: /payment_allocations_refund_stays/,
    exception: BadRequestException,
    message:
      'A refund cannot be unapplied: it records money that has left the clinic. Delete the refund row instead (clinic admin, password re-entered).',
  },
  {
    key: 'allocation_on_cancelled_invoice',
    // This one raises without a CONSTRAINT name, so it is matched on its text.
    match: /is cancelled: the money applied to it is frozen/,
    exception: ConflictException,
    message: 'This invoice is cancelled and takes no payments',
  },
] as const;

/** The refusals a caller may answer in its own words. */
export type MoneyConstraint = (typeof CONSTRAINTS)[number]['key'];

/**
 * Re-throw a database refusal as the HTTP answer it deserves, or re-throw the
 * error untouched when it is not one we know — an unrecognised failure must
 * stay loud rather than be dressed up as a business rule.
 *
 * `overrides` lets one call site phrase a refusal in its own terms: deleting a
 * payment trips `paid_within_total` because refunds depend on it, which is a
 * different story from losing a race to another desk.
 */
export function mapMoneyConstraint(
  err: unknown,
  overrides: Partial<Record<MoneyConstraint, string>> = {},
): never {
  const message = err instanceof Error ? err.message : String(err);
  for (const constraint of CONSTRAINTS) {
    if (constraint.match.test(message)) {
      throw new constraint.exception(
        overrides[constraint.key] ?? constraint.message,
      );
    }
  }
  throw err;
}
