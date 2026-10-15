import { formatDateBeirut } from "@/lib/utils";

/*
 * One definition of what a quote is on the client, shared by the dental chart
 * (where quotes are created and decided) and the billing page (where they are
 * only listed). Keeping the shape, the status colours and the printed document
 * in one place is what stops the two screens drifting apart.
 */

export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired";

export type QuoteItem = {
  id: number;
  record_id: number | null;
  procedure_name: string;
  tooth_number: string | null;
  description: string | null;
  quoted_amount: number;
};

export type Quote = {
  id: number;
  /** Sequential per clinic and year (QUO-2026-00004): what the patient sees. */
  quote_number: string;
  version: number;
  status: QuoteStatus;
  valid_until: string | null;
  /** Taken off the lines; quoted_total is lines minus this. */
  quoted_discount: number;
  quoted_total: number;
  notes: string | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  patient: { id: number; users: { first_name: string; last_name: string } };
  items: QuoteItem[];
  invoices: {
    id: number;
    invoice_number: string;
    status: string;
    total_amount: number;
  }[];
};

export const QUOTE_STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: "bg-ink-100 text-ink-700",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  expired: "bg-amber-100 text-amber-800",
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

/** An accepted quote with no live invoice can still be billed as it stands. */
export const isBillable = (q: Quote) =>
  q.status === "accepted" &&
  !q.invoices.some((inv) => inv.status !== "cancelled");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeQuote(q: any): Quote {
  return {
    ...q,
    id: Number(q.id),
    quote_number: q.quote_number ?? `#${q.id}`,
    quoted_discount: Number(q.quoted_discount ?? 0),
    quoted_total: Number(q.quoted_total ?? 0),
    patient: { ...q.patient, id: Number(q.patient?.id) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (q.items ?? []).map((i: any) => ({
      ...i,
      id: Number(i.id),
      record_id:
        i.record_id === null || i.record_id === undefined
          ? null
          : Number(i.record_id),
      quoted_amount: Number(i.quoted_amount ?? 0),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invoices: (q.invoices ?? []).map((i: any) => ({
      ...i,
      id: Number(i.id),
      total_amount: Number(i.total_amount),
    })),
  };
}

export async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  const msg = Array.isArray(body?.message)
    ? body.message.join(", ")
    : body?.message;
  return (typeof msg === "string" && msg) || fallback;
}

/** The estimate the patient takes home. An estimate, never an invoice. */
export function printQuote(q: Quote) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  const rows = q.items
    .map(
      (i) =>
        `<tr><td>${esc(i.procedure_name)}${i.tooth_number ? ` <small>(tooth ${esc(i.tooth_number)})</small>` : ""}${
          i.description ? `<br><small>${esc(i.description)}</small>` : ""
        }</td><td style="text-align:right">${money(i.quoted_amount)}</td></tr>`,
    )
    .join("");
  const discountRows =
    q.quoted_discount > 0
      ? `<tr><td style="font-weight:400">Lines</td><td style="text-align:right;font-weight:400">${money(
          q.quoted_total + q.quoted_discount,
        )}</td></tr><tr><td style="font-weight:400">Discount</td><td style="text-align:right;font-weight:400">−${money(
          q.quoted_discount,
        )}</td></tr>`
      : "";
  w.document
    .write(`<!doctype html><html><head><title>Quote ${esc(q.quote_number)} v${q.version}</title>
    <style>body{font-family:system-ui,sans-serif;padding:32px;color:#1e2533}h1{font-size:22px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:8px;border-bottom:1px solid #dfe6f1;text-align:left}
    tfoot td{font-weight:700;border-top:2px solid #1e2533}small{color:#6d7d97}.meta{color:#6d7d97;font-size:13px}</style></head><body>
    <h1>Treatment estimate</h1>
    <div class="meta">Quote ${esc(q.quote_number)} · version ${q.version} · ${formatDateBeirut(q.created_at)}${
      q.valid_until ? ` · valid until ${formatDateBeirut(q.valid_until)}` : ""
    }</div>
    <p><strong>${esc(q.patient.users.first_name)} ${esc(q.patient.users.last_name)}</strong></p>
    <table><thead><tr><th>Procedure</th><th style="text-align:right">Estimate</th></tr></thead>
    <tbody>${rows}</tbody><tfoot>${discountRows}<tr><td>Total estimate</td><td style="text-align:right">${money(q.quoted_total)}</td></tr></tfoot></table>
    ${q.notes ? `<p>${esc(q.notes)}</p>` : ""}
    <p class="meta">This is an estimate of planned treatment, not an invoice. Prices may change if the treatment plan changes.</p>
    <script>window.print()</script></body></html>`);
  w.document.close();
}
