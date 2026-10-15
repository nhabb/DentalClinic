import { formatDateBeirut } from "@/lib/utils";
import { clinicToday, esc, money } from "./quote-doc";

/*
 * One definition of what an invoice is on the client, shared by the dental
 * chart (where invoices are created and paid) and the billing page (where they
 * are listed and corrected), so the two screens cannot drift apart.
 */

export type InvoiceStatus = "open" | "partial" | "paid" | "cancelled";

export type InvoiceLineItem = {
  id: number;
  procedure_name: string;
  amount: number;
  tooth_number?: string | null;
};

export type InvoicePayment = {
  id: number;
  /** payment = money received, refund = money returned (shown as a minus). */
  kind: "payment" | "refund";
  amount: number;
  payment_method: string;
  /** The day the money moved; may be earlier than created_at. */
  payment_date: string;
  reason?: string | null;
  notes?: string;
  created_at: string;
};

export type Invoice = {
  id: number;
  /** Sequential per clinic and year (INV-2026-00017): what the patient sees. */
  invoice_number: string;
  patient: {
    id: number;
    users: { first_name: string; last_name: string; email: string };
  };
  procedure_date: string;
  /** Payment terms: balances age from this day. */
  due_date: string;
  notes?: string;
  /** Lines before the discount; total_amount = subtotal - discount_amount. */
  subtotal: number;
  discount_amount: number;
  discount_reason?: string | null;
  total_amount: number;
  amount_paid: number;
  remaining_amount: number;
  status: InvoiceStatus;
  cancel_reason?: string | null;
  cancelled_at?: string | null;
  /** The accepted quote this invoice was billed from, if any. */
  quote?: {
    id: number;
    quote_number: string;
    version: number;
    quoted_total: number;
  } | null;
  created_at: string;
  line_items: InvoiceLineItem[];
  invoice_payments: InvoicePayment[];
};

export const INVOICE_STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  partial: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-gray-200 text-gray-600 line-through",
};

/** An invoice that was never really billed does not count anywhere. */
export const isLive = (inv: Pick<Invoice, "status">) =>
  inv.status !== "cancelled";

/** Whole days an owed balance is past its due date; 0 when settled, cancelled or not yet due. */
export function daysOverdue(
  inv: Pick<Invoice, "due_date" | "status">,
): number {
  if (inv.status === "paid" || inv.status === "cancelled") return 0;
  const due = new Date(`${inv.due_date.slice(0, 10)}T00:00:00Z`).getTime();
  const today = new Date(`${clinicToday()}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((today - due) / 86_400_000));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeInvoice(inv: any): Invoice {
  return {
    ...inv,
    id: Number(inv.id),
    invoice_number: inv.invoice_number ?? `#${inv.id}`,
    due_date: inv.due_date ?? inv.procedure_date,
    subtotal: Number(inv.subtotal ?? inv.total_amount),
    discount_amount: Number(inv.discount_amount ?? 0),
    total_amount: Number(inv.total_amount),
    amount_paid: Number(inv.amount_paid),
    remaining_amount: Number(inv.remaining_amount),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    line_items: (inv.line_items ?? []).map((li: any) => ({
      ...li,
      id: Number(li.id),
      amount: Number(li.amount),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invoice_payments: (inv.invoice_payments ?? []).map((p: any) => ({
      ...p,
      id: Number(p.id),
      amount: Number(p.amount),
      kind: p.kind ?? "payment",
      payment_date: p.payment_date ?? p.created_at,
    })),
    quote: inv.quote
      ? {
          ...inv.quote,
          id: Number(inv.quote.id),
          quoted_total: Number(inv.quote.quoted_total),
        }
      : null,
  };
}

/** The money figures for one patient: what the chart's money band shows. */
export function patientTotals(invoices: Invoice[]) {
  const live = invoices.filter(isLive);
  const billed = live.reduce((s, i) => s + i.total_amount, 0);
  const received = live.reduce((s, i) => s + i.amount_paid, 0);
  const owed = live
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + i.remaining_amount, 0);
  const overdue = live
    .filter((i) => daysOverdue(i) > 0)
    .reduce((s, i) => s + i.remaining_amount, 0);
  return { billed, received, owed, overdue, count: live.length };
}

/** A printable invoice, or a receipt once it is paid. */
export function printInvoice(inv: Invoice) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  const lines = inv.line_items
    .map(
      (li) =>
        `<tr><td>${esc(li.procedure_name)}${li.tooth_number ? ` <small>(tooth ${esc(li.tooth_number)})</small>` : ""}</td><td class="r">${money(li.amount)}</td></tr>`,
    )
    .join("");
  const received = inv.invoice_payments
    .map(
      (p) =>
        `<tr><td>${formatDateBeirut(p.payment_date)} · ${p.kind === "refund" ? "Refund" : "Payment"} · ${esc(p.payment_method)}${p.reason ? ` <small>${esc(p.reason)}</small>` : ""}</td><td class="r">${p.kind === "refund" ? "−" : ""}${money(p.amount)}</td></tr>`,
    )
    .join("");
  const overdue = daysOverdue(inv);
  const stamp =
    inv.status === "cancelled"
      ? ' <span class="stamp">CANCELLED</span>'
      : inv.status === "paid"
        ? ' <span class="stamp">PAID</span>'
        : "";
  const discountRows =
    inv.discount_amount > 0
      ? `<tr><td style="font-weight:400">Subtotal</td><td class="r" style="font-weight:400">${money(inv.subtotal)}</td></tr><tr><td style="font-weight:400">Discount${
          inv.discount_reason ? ` <small>${esc(inv.discount_reason)}</small>` : ""
        }</td><td class="r" style="font-weight:400">−${money(inv.discount_amount)}</td></tr>`
      : "";
  w.document
    .write(`<!doctype html><html><head><title>Invoice ${esc(inv.invoice_number)}</title>
    <style>body{font-family:system-ui,sans-serif;padding:32px;color:#1e2533}h1{font-size:22px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:8px;border-bottom:1px solid #dfe6f1;text-align:left}
    .r{text-align:right}tfoot td{font-weight:700;border-top:2px solid #1e2533}small{color:#6d7d97}.meta{color:#6d7d97;font-size:13px}
    .owed{margin-top:20px;font-size:18px;font-weight:700}.stamp{display:inline-block;border:2px solid #1e2533;padding:2px 8px;font-weight:700;letter-spacing:.08em}</style></head><body>
    <h1>${inv.status === "paid" ? "Receipt" : "Invoice"} ${esc(inv.invoice_number)}${stamp}</h1>
    <div class="meta">Work done ${formatDateBeirut(inv.procedure_date)} · due ${formatDateBeirut(inv.due_date)}${
      overdue > 0 ? ` (${overdue} days overdue)` : ""
    }${inv.quote ? ` · from quote ${esc(inv.quote.quote_number)}` : ""}</div>
    <p><strong>${esc(inv.patient.users.first_name)} ${esc(inv.patient.users.last_name)}</strong></p>
    <table><thead><tr><th>Procedure</th><th class="r">Amount</th></tr></thead><tbody>${lines}</tbody>
    <tfoot>${discountRows}<tr><td>Total</td><td class="r">${money(inv.total_amount)}</td></tr></tfoot></table>
    ${received ? `<table><thead><tr><th>Money received</th><th class="r"></th></tr></thead><tbody>${received}</tbody></table>` : ""}
    <p class="owed">Balance due: ${inv.status === "cancelled" ? "0.00 (cancelled)" : money(inv.remaining_amount)}</p>
    ${inv.notes ? `<p>${esc(inv.notes)}</p>` : ""}
    <script>window.print()</script></body></html>`);
  w.document.close();
}
