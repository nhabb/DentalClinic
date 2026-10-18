import type { BadgeTone } from "@/components/ui/Badge";

/*
 * One word per concept, spelled in one place.
 *
 * The same quantity used to carry six names. A patient's unpaid balance was
 * "Remaining" on the invoice table, "Owed" in the payment drawer, "Still owed"
 * in the account modal, "Due now" in the history modal, "Outstanding" on the
 * stats strip and "Balance due" on the printed invoice — and two of those were
 * rendered by modals stacked on each other, reading two different endpoints.
 * Nobody could tell whether the numbers disagreed or the words did.
 *
 * The set below is deliberately made of pairs, each with its opposite:
 *
 *     Plan total   the whole course of treatment
 *     Billed       what the invoices came to      <-> Not yet billed
 *     Paid         money in, net of refunds       <-> Unpaid
 *     Credit on account   money in that is on no bill
 *
 * Paid and Unpaid are used of one bill, of one patient and of the whole
 * clinic. That is not drift: the scope is said by where they sit — a bill row,
 * a patient's file, or under the "Across the clinic" heading. Synonyms are
 * what made scope unreadable, not repetition.
 *
 * Screens read the i18n keys; the print helpers (`printInvoice`, `printPlan`)
 * produce English-only documents and read the constants directly. The English
 * values in `lib/i18n/translations/en.json` must match `MONEY_WORD`, and there
 * is no spec holding them together yet — a drift shows up as a printed
 * document disagreeing with the screen it was printed from.
 */

export const MONEY_WORD = {
  planTotal: "Plan total",
  notYetBilled: "Not yet billed",
  billed: "Billed",
  paid: "Paid",
  unpaid: "Unpaid",
  creditOnAccount: "Credit on account",
  billTotal: "Bill total",
  acrossTheClinic: "Across the clinic",
  bills: "Bills",
} as const;

export type MoneyWord = keyof typeof MONEY_WORD;

/** The i18n key for each word, for the React screens. */
export const MONEY_KEY: Record<MoneyWord, string> = Object.fromEntries(
  (Object.keys(MONEY_WORD) as MoneyWord[]).map((k) => [k, `money.${k}`]),
) as Record<MoneyWord, string>;

// ── Where a plan line stands ────────────────────────────────────────────────

/**
 * The chain a plan line walks, matching the server's `PlanLineState`:
 * planned → done → billed → part paid → paid.
 *
 * The last two come from the line's invoice. Money is allocated to a bill and
 * there is no edge from an allocation to a line, so "how much of this line is
 * paid" is not a fact anyone holds — how far its bill has been settled is.
 */
export type PlanLineState =
  | "planned"
  | "done"
  | "billed"
  | "part_paid"
  | "paid";

export const PLAN_STATE_LABEL: Record<PlanLineState, string> = {
  planned: "Planned",
  done: "Done, not billed",
  billed: "Billed",
  part_paid: "Part paid",
  paid: "Paid",
};

/** A tone means one thing wherever it appears: the same colour on the chart,
 *  in the patient's file and in the printed plan. */
export const PLAN_STATE_TONE: Record<PlanLineState, BadgeTone> = {
  planned: "neutral",
  done: "clay",
  billed: "brand",
  part_paid: "honey",
  paid: "leaf",
};

/** Is this line frozen on a bill? Never test the state by name for this. */
export const isBilledState = (state: PlanLineState): boolean =>
  state === "billed" || state === "part_paid" || state === "paid";

// ── Where a bill stands ─────────────────────────────────────────────────────

export type InvoiceStatus = "open" | "partial" | "paid" | "cancelled";

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  open: "honey",
  partial: "brand",
  paid: "leaf",
  cancelled: "neutral",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: "Unpaid",
  partial: "Part paid",
  paid: "Paid",
  cancelled: "Cancelled",
};
