/**
 * The shape an invoice is returned in, and the one translation the screens
 * need. It lives apart from `BillingService` so the money writer can return an
 * invoice without importing the service that calls it.
 */

/** The shape every invoice is returned in, from any route that creates or changes one. */
export const invoiceInclude = {
  patient: {
    select: {
      id: true,
      users: {
        select: { id: true, first_name: true, last_name: true, email: true },
      },
    },
  },
  creator: {
    select: { id: true, first_name: true, last_name: true },
  },
  canceller: {
    select: { id: true, first_name: true, last_name: true },
  },
  // No quote here: with one living plan per patient the link is derivable from
  // patient_id, and treatment_invoices.quote_id was dropped with the quote
  // status machine (20261018130000). An invoice freezes its own lines; the
  // plan it came from is the patient's, and it has moved on since.
  line_items: {
    orderBy: { created_at: 'asc' as const },
  },
  allocations: {
    include: {
      payment: {
        include: {
          creator: { select: { id: true, first_name: true, last_name: true } },
        },
      },
    },
    orderBy: { created_at: 'asc' as const },
  },
};

/** One allocation as the invoice screens read it: money applied to this invoice. */
export interface AppliedPayment {
  /** The allocation. Removing this row unapplies the money; it does not refund it. */
  id: bigint;
  /** The payment it came from, which may also pay other invoices. */
  payment_id: bigint;
  /** How much of that payment is applied to THIS invoice. */
  amount: unknown;
  kind: string;
  payment_method: string;
  payment_date: Date;
  notes: string | null;
  reason: string | null;
  /** Who took the money; the screens and the receipt both name them. */
  created_by: bigint | null;
  creator: unknown;
}

type WithAllocations = {
  allocations: {
    id: bigint;
    amount: unknown;
    payment: {
      id: bigint;
      kind: string;
      payment_method: string;
      payment_date: Date;
      notes: string | null;
      reason: string | null;
      created_by: bigint | null;
      creator: unknown;
    };
  }[];
};

/**
 * The ledger stores allocations; the invoice screens ask what money is on this
 * invoice. Flatten each allocation back into a payment row carrying the amount
 * applied *here* with the method, day and kind of the payment it came from, so
 * one shape keeps serving both.
 */
export function withAppliedPayments<T extends WithAllocations>(
  invoice: T,
): T & { invoice_payments: AppliedPayment[] } {
  return {
    ...invoice,
    invoice_payments: invoice.allocations.map((a) => ({
      id: a.id,
      payment_id: a.payment.id,
      amount: a.amount,
      kind: a.payment.kind,
      payment_method: a.payment.payment_method,
      payment_date: a.payment.payment_date,
      notes: a.payment.notes,
      reason: a.payment.reason,
      created_by: a.payment.created_by,
      creator: a.payment.creator,
    })),
  };
}
