/**
 * What counts as treatment plan work.
 *
 * `patient_records` holds the whole clinical record — notes, diagnoses,
 * prescriptions, x-rays, missing teeth — and only two of those record types are
 * work the patient is charged for. Every query that sums a plan, lists what is
 * billable, or decides what an invoice may claim reads this one constant, so a
 * consultation note can never quietly inflate somebody's estimate.
 *
 * `missing_tooth` is deliberately outside it: it is a finding, not work, and
 * carries no price.
 *
 * This module imports nothing, so both the quotes and the billing side can use
 * it without the two depending on each other.
 */
export const PLAN_RECORD_TYPES = ['treatment_plan', 'treatment'] as const;

/**
 * Where one plan line stands, as a chain the desk can read left to right:
 * planned → done → billed → part paid → paid.
 *
 * The last two come from the line's invoice, not from the record: money is
 * allocated to an invoice, and there is no edge from an allocation to a line,
 * so "how much of THIS line is paid" is not a fact the database holds. What is
 * a fact is the settlement of the bill the line sits on, and that is what the
 * last two states report. A pro-rata amount per line would be a number nobody
 * could reconcile with the invoice it came from.
 */
export const PLAN_LINE_STATES = [
  'planned',
  'done',
  'billed',
  'part_paid',
  'paid',
] as const;

export type PlanLineState = (typeof PLAN_LINE_STATES)[number];

/** The invoice statuses a plan line can see. `null` means it is not billed. */
export type PlanInvoiceStatus =
  | 'open'
  | 'partial'
  | 'paid'
  | 'cancelled'
  | null;

/**
 * A line's state, from its record type and the settlement of its invoice.
 *
 * The `cancelled` branch should be unreachable — voiding an invoice releases
 * its records to `invoice_id = NULL` — but if a cancelled invoice ever still
 * holds a line, the line is reported as `billed` and never as `planned`: the
 * record is still frozen, and saying otherwise would invite a reprice the
 * database would refuse.
 */
export function planLineState(
  recordType: string,
  invoiceStatus: PlanInvoiceStatus,
): PlanLineState {
  if (invoiceStatus === null) {
    return recordType === 'treatment' ? 'done' : 'planned';
  }
  if (invoiceStatus === 'paid') return 'paid';
  if (invoiceStatus === 'partial') return 'part_paid';
  return 'billed';
}

/**
 * Is this line frozen on an invoice?
 *
 * Display code may test a state by name; anything asking "may this be
 * repriced or deleted?" must ask this, or the line's own `locked`. Widening
 * the chain left `=== 'billed'` compiling and silently wrong for a line that
 * had since been paid.
 */
export function isBilledState(state: PlanLineState): boolean {
  return state === 'billed' || state === 'part_paid' || state === 'paid';
}
