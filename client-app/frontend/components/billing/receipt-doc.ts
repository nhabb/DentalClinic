import { formatDateBeirut } from "@/lib/utils";
import { esc, money } from "./quote-doc";

/*
 * One definition of a receipt (RT) and a refund (RF) on the client.
 *
 * The owner's rule: every payment is a receipt. "Take payment" on a bill makes
 * one already applied to it; "New receipt" makes one with no bill yet (a
 * deposit). A refund always comes out of one receipt. The server computes
 * each receipt's figures and status (receipt-math.ts); this file only reads
 * and prints them.
 */

export type ReceiptStatus =
  | "open"
  | "partly_used"
  | "used"
  | "partly_refunded"
  | "refunded";

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  open: "Open",
  partly_used: "Partly used",
  used: "Used",
  partly_refunded: "Partly refunded",
  refunded: "Refunded",
};

export const RECEIPT_STATUS_TONE: Record<
  ReceiptStatus,
  "brand" | "honey" | "leaf" | "brick" | "neutral"
> = {
  open: "brand",
  partly_used: "honey",
  used: "leaf",
  partly_refunded: "brick",
  refunded: "neutral",
};

export type ReceiptFigures = {
  amount: number;
  applied: number;
  refunded: number;
  /** Still available: to put on a bill, or to refund. */
  held: number;
  status: ReceiptStatus;
};

export type ReceiptRow = {
  id: number;
  /** RT26-00001 for a receipt, RF26-00001 for a refund. */
  document_number: string;
  kind: "payment" | "refund";
  amount: number;
  payment_method: string;
  payment_date: string;
  /** For a receipt: the reason the patient gave. */
  notes: string | null;
  /** For a refund: why the money went back. */
  reason: string | null;
  patient_id: number;
  patient_name: string;
  taken_by: string | null;
  /** For a refund: the receipt it came out of. */
  source: { id: number; document_number: string } | null;
  allocations: {
    id: number;
    amount: number;
    invoice: { id: number; invoice_number: string; status: string } | null;
  }[];
  refunds: {
    id: number;
    document_number: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    reason: string | null;
  }[];
  /** Null for a refund: it holds nothing. */
  figures: ReceiptFigures | null;
  status: ReceiptStatus | "refund";
};

const num = (v: unknown) => Number(v ?? 0);

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeReceipt(r: any): ReceiptRow {
  return {
    ...r,
    id: Number(r.id),
    document_number: r.document_number ?? `#${r.id}`,
    kind: r.kind === "refund" ? "refund" : "payment",
    amount: num(r.amount),
    patient_id: Number(r.patient_id),
    source: r.source
      ? { id: Number(r.source.id), document_number: r.source.document_number }
      : null,
    allocations: (r.allocations ?? []).map((a: any) => ({
      id: Number(a.id),
      amount: num(a.amount),
      invoice: a.invoice
        ? {
            id: Number(a.invoice.id),
            invoice_number: a.invoice.invoice_number,
            status: a.invoice.status,
          }
        : null,
    })),
    refunds: (r.refunds ?? []).map((f: any) => ({
      ...f,
      id: Number(f.id),
      amount: num(f.amount),
    })),
    figures: r.figures
      ? {
          amount: num(r.figures.amount),
          applied: num(r.figures.applied),
          refunded: num(r.figures.refunded),
          held: num(r.figures.held),
          status: r.figures.status,
        }
      : null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const methodLabel = (m: string) => m.replace(/_/g, " ");

/** A receipt or a refund as a paper the patient takes home. */
export function printReceipt(r: ReceiptRow) {
  const w = window.open("", "_blank", "width=720,height=820");
  if (!w) return;
  const isRefund = r.kind === "refund";
  const title = isRefund ? "Refund" : "Receipt";
  const applied = r.allocations
    .map(
      (a) =>
        `<tr><td>Applied to ${esc(a.invoice?.invoice_number ?? "a bill")}</td><td class="r">${money(a.amount)}</td></tr>`,
    )
    .join("");
  const refunds = r.refunds
    .map(
      (f) =>
        `<tr><td>Refunded ${esc(f.document_number)} · ${formatDateBeirut(f.payment_date)}${f.reason ? ` <small>${esc(f.reason)}</small>` : ""}</td><td class="r">−${money(f.amount)}</td></tr>`,
    )
    .join("");
  const held = r.figures && r.figures.held > 0
    ? `<p class="held">Still held for the patient: ${money(r.figures.held)}</p>`
    : "";
  w.document.write(`<!doctype html><html><head><title>${title} ${esc(r.document_number)}</title>
    <style>body{font-family:system-ui,sans-serif;padding:32px;color:#1e2533}h1{font-size:22px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:8px;border-bottom:1px solid #dfe6f1;text-align:left}
    .r{text-align:right}small{color:#6d7d97}.meta{color:#6d7d97;font-size:13px}
    .amount{margin-top:20px;font-size:22px;font-weight:700}.held{font-weight:600}</style></head><body>
    <h1>${title} ${esc(r.document_number)}</h1>
    <div class="meta">${formatDateBeirut(r.payment_date)} · ${esc(methodLabel(r.payment_method))}${r.taken_by ? ` · by ${esc(r.taken_by)}` : ""}</div>
    <p><strong>${esc(r.patient_name)}</strong></p>
    <p class="amount">${isRefund ? "Handed back" : "Received"}: ${money(r.amount)}</p>
    ${isRefund && r.source ? `<p>Out of receipt ${esc(r.source.document_number)}</p>` : ""}
    ${r.reason ? `<p>Reason: ${esc(r.reason)}</p>` : ""}
    ${!isRefund && r.notes ? `<p>For: ${esc(r.notes)}</p>` : ""}
    ${applied || refunds ? `<table><tbody>${applied}${refunds}</tbody></table>` : ""}
    ${held}
    <script>window.print()</script></body></html>`);
  w.document.close();
}
