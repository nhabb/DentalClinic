import { BadRequestException } from '@nestjs/common';
import { clinicTodayIso, toDateOnly } from '../../shared/common/date-only';

/**
 * The arithmetic every invoice follows, wherever it is created (billing page,
 * dental chart, quote conversion): lines add up to a subtotal, a discount with
 * a reason comes off it, what is left is owed, and it is due on a date no
 * earlier than the work. Pure functions, so the three creators cannot drift.
 * "Today" is the clinic's calendar day (date-only.ts), not the server's.
 */

/** Tolerance for floating point comparisons on 2-decimal money values. */
export const EPSILON = 0.005;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export type InvoiceStatus = 'open' | 'partial' | 'paid' | 'cancelled';

/** Statuses of invoices that are still owed (or settled); cancelled is neither. */
export const LIVE_STATUSES: readonly InvoiceStatus[] = [
  'open',
  'partial',
  'paid',
];

/** The status an invoice's payments imply (never cancelled: that is a decision, not arithmetic). */
export function deriveInvoiceStatus(
  total: number,
  paid: number,
): Exclude<InvoiceStatus, 'cancelled'> {
  if (total - paid <= EPSILON) return 'paid';
  if (paid > EPSILON) return 'partial';
  return 'open';
}

export interface InvoiceFigures {
  subtotal: number;
  discount_amount: number;
  discount_reason: string | null;
  total_amount: number;
  amount_paid: number;
  remaining_amount: number;
  status: Exclude<InvoiceStatus, 'cancelled'>;
}

/**
 * Subtotal, discount and what is owed for a new invoice. A discount needs a
 * reason and cannot exceed the lines; an invoice that comes to nothing (free
 * of charge) is settled from the start, not "open" forever.
 */
export function invoiceFigures(
  lineAmounts: number[],
  discount = 0,
  discountReason?: string | null,
): InvoiceFigures {
  const subtotal = round2(lineAmounts.reduce((s, a) => s + a, 0));
  const discount_amount = round2(discount);
  if (discount_amount < 0) {
    throw new BadRequestException('A discount cannot be negative');
  }
  if (discount_amount > subtotal + EPSILON) {
    throw new BadRequestException(
      `The discount (${discount_amount}) exceeds the lines (${subtotal})`,
    );
  }
  const reason = discountReason?.trim() || null;
  if (discount_amount > 0 && !reason) {
    throw new BadRequestException('A discount needs a reason');
  }
  const total_amount = round2(subtotal - discount_amount);
  return {
    subtotal,
    discount_amount,
    discount_reason: discount_amount > 0 ? reason : null,
    total_amount,
    amount_paid: 0,
    remaining_amount: total_amount,
    status: deriveInvoiceStatus(total_amount, 0),
  };
}

/**
 * When payment is due: the given day, or the day of the work (due on
 * receipt, the dental norm). Never before the work.
 */
export function dueDateFor(procedureDate: Date, dueDate?: string): Date {
  if (!dueDate) return procedureDate;
  const due = toDateOnly(dueDate);
  if (due.getTime() < toDateOnly(procedureDate.toISOString()).getTime()) {
    throw new BadRequestException(
      'The due date cannot be before the procedure date',
    );
  }
  return due;
}

/**
 * The day money moved: the given day (cash from yesterday entered this
 * morning), or today at the clinic. Never in the future: a payment is a
 * fact, not a plan.
 */
export function paymentDateFor(value?: string, now = new Date()): Date {
  const today = clinicTodayIso(now);
  if (!value) return toDateOnly(today);
  const day = value.slice(0, 10);
  if (day > today) {
    throw new BadRequestException('The payment date cannot be in the future');
  }
  return toDateOnly(day);
}

/** Whole days a balance is past its due date on the clinic's calendar (0 when not yet due). */
export function daysOverdue(dueDate: Date, now = new Date()): number {
  const todayStart = toDateOnly(clinicTodayIso(now)).getTime();
  const dueStart = toDateOnly(dueDate.toISOString()).getTime();
  return Math.max(0, Math.round((todayStart - dueStart) / 86_400_000));
}

/**
 * Is this balance still current — due later than today at the clinic?
 *
 * It exists so that no caller computes "today" for itself. The aging report
 * used to derive its own `todayStart` from the server's UTC date while calling
 * `daysOverdue` for the same invoice, which reads the clinic's calendar: two
 * answers to one question, a few hours apart each night. Both now come from
 * here, so they cannot disagree.
 */
export function isNotYetDue(dueDate: Date, now = new Date()): boolean {
  const todayStart = toDateOnly(clinicTodayIso(now)).getTime();
  const dueStart = toDateOnly(dueDate.toISOString()).getTime();
  return dueStart > todayStart;
}
