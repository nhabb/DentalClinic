import { formatDateBeirut } from "@/lib/utils";
import {
  isBilledState,
  MONEY_WORD,
  PLAN_STATE_LABEL,
  type InvoiceStatus,
  type PlanLineState,
} from "./money-words";

/** Re-exported so the plan screens keep one import for the plan shape. */
export { isBilledState, PLAN_STATE_LABEL };
export type { PlanLineState };

/*
 * The client shape of a treatment plan, which is also the quote.
 *
 * There is one plan per patient and its lines are the chart's own rows, so
 * there is no status machine, no version and no second list of prices here.
 * A line is "planned", "done" or "billed", and only the last of those locks
 * it — because its price belongs to an invoice now.
 *
 * What a patient was actually handed is `sends`: append-only, because the
 * living plan cannot also be the record of what was promised.
 */

export type PlanLine = {
  record_id: number | string;
  procedure: string;
  tooth: string | null;
  date: string | null;
  /** null means nobody has priced it; never shown or summed as 0. */
  amount: number | null;
  state: PlanLineState;
  /** On an invoice: not repriceable, not deletable. */
  locked: boolean;
  invoice_id: number | string | null;
  /** The bill's own word, so the line can say how far it was settled. */
  invoice_status: InvoiceStatus | null;
  invoice_number: string | null;
};

/** One dated record of the plan being given to the patient. */
export type PlanSend = {
  id: number | string;
  quoted_total: number;
  created_at: string;
  sender: { id: number | string; first_name: string; last_name: string } | null;
};

export type Plan = {
  patient_id: number | string;
  quote_id: number | string | null;
  quote_number: string | null;
  notes: string | null;
  /** The day the patient agreed. A fact; it gates nothing. */
  accepted_at: string | null;
  /**
   * They agreed, but the plan has changed since — so the agreement is for a
   * plan that no longer exists and has to be taken again. Completing or
   * billing work never sets this: that is progress, not a new deal.
   */
  agreement_stale: boolean;
  /** The plan fingerprinted; the server compares it with what was agreed. */
  digest?: string;
  lines: PlanLine[];
  /**
   * The chart side: what the work is worth at the chart's own prices.
   * `billed_value` is NOT what the invoices came to — a discount, or a charge
   * that was never chart work, makes the two differ by design. What the bills
   * say is `settlement`, and the patient's whole position is the statement.
   */
  totals: {
    /** The whole course of treatment, billed and unbilled alike. */
    plan: number;
    planned: number;
    done_unbilled: number;
    /** Chart price of the work that is on a bill. */
    billed_value: number;
    /** Chart price of the work with no bill yet. */
    unbilled_value: number;
    /** Lines nobody has priced; reported so they cannot pass as free. */
    unpriced_count: number;
  };
  /** `billed` counts every line on a bill; `part_paid` and `paid` are subsets. */
  counts: {
    planned: number;
    done: number;
    billed: number;
    part_paid: number;
    paid: number;
  };
  /** What this plan's work turned into, over the distinct bills it produced. */
  settlement: {
    invoice_count: number;
    invoiced_total: number;
    received: number;
    due: number;
  };
  sends: PlanSend[];
};

export const money = (n: number) => `${Number(n).toFixed(2)}`;

/** Text from patients and staff goes into the printable page as text, never as markup. */
export const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

/** Today on the clinic's calendar, as YYYY-MM-DD. */
export const clinicToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export async function readError(res: Response, fallback: string) {
  try {
    const body = await res.json();
    const m = body?.message;
    return Array.isArray(m) ? m.join(", ") : (m ?? fallback);
  } catch {
    return fallback;
  }
}


/**
 * The plan as the patient is handed it: every line with where it stands, so a
 * paid-for crown that has not been cut yet is visible as exactly that.
 */
export function printPlan(plan: Plan, patientName?: string) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  const rows = plan.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.procedure)}${
          l.tooth ? ` <small>(tooth ${esc(l.tooth)})</small>` : ""
        }</td><td><small>${esc(PLAN_STATE_LABEL[l.state])}</small></td><td style="text-align:right">${
          l.amount == null ? "<small>not priced</small>" : money(l.amount)
        }</td></tr>`,
    )
    .join("");
  const unpriced =
    plan.totals.unpriced_count > 0
      ? `<p class="meta">${plan.totals.unpriced_count} item(s) have not been priced yet and are not in the total.</p>`
      : "";
  w.document
    .write(`<!doctype html><html><head><title>Treatment plan ${esc(plan.quote_number ?? "")}</title>
    <style>body{font-family:system-ui,sans-serif;padding:32px;color:#1e2533}h1{font-size:22px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:8px;border-bottom:1px solid #dfe6f1;text-align:left}
    tfoot td{font-weight:700;border-top:2px solid #1e2533}small{color:#6d7d97}.meta{color:#6d7d97;font-size:13px}</style></head><body>
    <h1>Treatment plan</h1>
    <div class="meta">${esc(plan.quote_number ?? "")} · ${formatDateBeirut(new Date().toISOString())}${
      plan.accepted_at && !plan.agreement_stale
      ? ` · agreed ${formatDateBeirut(plan.accepted_at)}`
      : plan.accepted_at
        ? ` · agreed ${formatDateBeirut(plan.accepted_at)}, changed since`
        : ""
    }</div>
    ${patientName ? `<p><strong>${esc(patientName)}</strong></p>` : ""}
    <table><thead><tr><th>Procedure</th><th>Status</th><th style="text-align:right">Estimate</th></tr></thead>
    <tbody>${rows}</tbody><tfoot>
      <tr><td colspan="2">${MONEY_WORD.billed}</td><td style="text-align:right">${money(plan.totals.billed_value)}</td></tr>
      <tr><td colspan="2">${MONEY_WORD.notYetBilled}</td><td style="text-align:right">${money(plan.totals.unbilled_value)}</td></tr>
      <tr><td colspan="2">${MONEY_WORD.planTotal}</td><td style="text-align:right">${money(plan.totals.plan)}</td></tr>
    </tfoot></table>
    ${plan.notes ? `<p>${esc(plan.notes)}</p>` : ""}
    ${unpriced}
    <p class="meta">This is an estimate of planned treatment, not an invoice. A plan changes as treatment goes on; work already billed is charged at the price on its invoice.</p>
    <script>window.print()</script></body></html>`);
  w.document.close();
}
