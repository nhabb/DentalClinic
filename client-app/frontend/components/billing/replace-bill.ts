import type { Invoice } from "./invoice-doc";

/*
 * Building a replacement from a bill, in one place.
 *
 * Two screens reissue a bill: the bill builder (Replace bill, where any line
 * can be changed, added or dropped) and the quote drawer (a billed line gets
 * a new price and the bill is reissued with that one change). Both must send
 * the same request for the same bill, so the pairing of lines with chart
 * records and the body of the replace call live here.
 */

/** One line of the bill being replaced, with the chart record it stood for. */
export type ReplacementLine = {
  /** The chart record this line billed; null for a free charge. */
  recordId: number | null;
  procedure: string;
  tooth: string;
  amount: number;
  /** The invoice line's own id, for a stable key when there is no record. */
  lineId: number | string | null;
};

/**
 * The lines of a bill, each paired with its chart record. A line keeps only
 * its figures, so its record is found among the records the bill holds by
 * procedure and tooth — each record paired once — and goes back out as
 * `record_id`; a line with no match was a free charge and stays one.
 */
export function replacementLines(inv: Invoice): ReplacementLine[] {
  const spare = [...inv.records];
  return inv.line_items.map((li, i) => {
    const at = spare.findIndex(
      (r) => r.title === li.procedure_name && (r.tooth_number ?? "") === (li.tooth_number ?? ""),
    );
    const record = at >= 0 ? spare.splice(at, 1)[0] : null;
    return {
      recordId: record ? record.id : null,
      procedure: li.procedure_name,
      tooth: li.tooth_number ?? "",
      amount: Number(li.amount),
      lineId: li.id ?? i,
    };
  });
}

const dateOnly = (d: string | null | undefined) => (d ? d.slice(0, 10) : "");

/**
 * The body of `POST /billing/invoices/:id/replace`: the old bill's dates,
 * discount, VAT and note carried over, the given lines, and the reason that
 * is kept on the cancelled bill. Paying the new bill from the patient's
 * prepaid money is the server's default and is left to it.
 */
export function replaceBody(
  inv: Invoice,
  lines: ReplacementLine[],
  reason: string,
): Record<string, unknown> {
  const work = dateOnly(inv.procedure_date);
  const due = dateOnly(inv.due_date);
  return {
    procedure_date: work,
    ...(due && due !== work ? { due_date: due } : {}),
    ...(inv.discount_amount > 0
      ? { discount_amount: inv.discount_amount, discount_reason: inv.discount_reason ?? "" }
      : {}),
    ...(inv.vat_percent > 0 ? { vat_percent: inv.vat_percent } : {}),
    ...(inv.notes?.trim() ? { notes: inv.notes.trim() } : {}),
    reason: reason.trim(),
    line_items: lines.map((l) => ({
      ...(l.recordId ? { record_id: l.recordId } : {}),
      procedure_name: l.procedure,
      amount: l.amount,
      ...(l.tooth ? { tooth_number: l.tooth } : {}),
    })),
  };
}
