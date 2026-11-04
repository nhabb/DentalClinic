"use client";

import { useEffect, useState } from "react";
import { FaExchangeAlt } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { MONEY_WORD } from "@/components/billing/money-words";
import { normalizeInvoice, type Invoice } from "@/components/billing/invoice-doc";
import { replaceBody, replacementLines } from "@/components/billing/replace-bill";
import { money, readError, type PlanLine } from "@/components/billing/quote-doc";

/*
 * Billed lines got new prices on the quote: the bill is reissued once, with
 * all of them.
 *
 * A bill the patient holds must not change under them, so a billed line's
 * price is frozen and the correction is a replacement: the old bill is
 * cancelled with the reason, a new one is issued with the same lines at the
 * new prices, the two point at each other, and the money received on the old
 * one moves across. The quote lets the desk type every new price first and
 * then reissue the bill one time, here, with nothing else to decide but the
 * reason. It used to open this dialog for every single price.
 */

export type PriceChange = {
  line: PlanLine;
  /** The price typed on the quote. */
  amount: number;
};

export type Reissue = {
  invoiceId: number | string;
  invoiceNumber: string | null;
  changes: PriceChange[];
};

interface Props {
  reissue: Reissue | null;
  onClose: () => void;
  /** The new bill, so the page can re-read the plan and say what happened. */
  onDone: (answer: { invoice: Invoice; cancelled: Invoice; paidFromPrepaid: number }) => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const nameOf = (l: PlanLine) => `${l.procedure}${l.tooth ? ` (tooth ${l.tooth})` : ""}`;

/** The API keeps a reason to 500 characters; a long list of lines is summed up instead. */
const REASON_MAX = 500;
const fitReason = (full: string, count: number) =>
  full.length <= REASON_MAX ? full : `Repriced on the quote: ${count} lines at new prices`;

/** "Veneers (tooth 25) $550 → $600, Crown (tooth 26) $500 → $450" */
export const describeChanges = (changes: PriceChange[]) =>
  changes.map((c) => `${nameOf(c.line)} $${money(c.line.amount ?? 0)} → $${money(c.amount)}`).join(", ");

export function ReissueBillModal({ reissue, onClose, onDone }: Props) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reissue) return;
    let cancelled = false;
    setInvoice(null);
    setError("");
    setLoading(true);
    setReason(fitReason(`Repriced on the quote: ${describeChanges(reissue.changes)}`, reissue.changes.length));
    (async () => {
      try {
        const res = await apiFetch(`/api/billing/invoices/${reissue.invoiceId}`);
        if (!res.ok) throw new Error(await readError(res, "Could not open that bill."));
        if (!cancelled) setInvoice(normalizeInvoice(await res.json()));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reissue]);

  if (!reissue) return null;
  const { changes, invoiceNumber } = reissue;

  // The bill's lines with the changed ones at their new prices. A line is
  // found by its chart record, which is what ties the quote line to the bill.
  const newPrice = new Map(changes.map((c) => [String(c.line.record_id), c.amount]));
  const lines = invoice
    ? replacementLines(invoice).map((l) => {
        const amount = l.recordId !== null ? newPrice.get(String(l.recordId)) : undefined;
        return amount === undefined ? l : { ...l, amount };
      })
    : [];
  const matched = new Set(
    lines.filter((l) => l.recordId !== null && newPrice.has(String(l.recordId))).map((l) => String(l.recordId)),
  );
  const unmatched = changes.filter((c) => !matched.has(String(c.line.record_id)));
  const oldTotal = invoice?.total_amount ?? 0;
  const newLines = lines.reduce((s, l) => s + l.amount, 0);
  const newTotal = invoice
    ? round2((newLines - invoice.discount_amount) * (1 + invoice.vat_percent / 100))
    : 0;

  const submit = async () => {
    if (!invoice) return;
    setError("");
    if (reason.trim().length < 3) return setError("Say why the bill is reissued; it is kept on the cancelled one.");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/billing/invoices/${invoice.id}/replace`, {
        method: "POST",
        body: JSON.stringify(replaceBody(invoice, lines, reason)),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not reissue the bill."));
      const answer = await res.json();
      const drawn = (answer.paid_from_balance ?? []) as { amount: number | string }[];
      onDone({
        invoice: normalizeInvoice(answer.invoice),
        cancelled: normalizeInvoice(answer.cancelled),
        paidFromPrepaid: round2(drawn.reduce((s, m) => s + Number(m.amount), 0)),
      });
      // The page closes it: it decides whether another bill is next.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!reissue}
      onClose={onClose}
      title={`Reissue ${invoiceNumber ?? "the bill"} at the new prices`}
      description="A bill the patient holds does not change: it is cancelled and issued again with the new prices, and the money received on it moves across."
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {loading ? (
          <p className="py-4 text-center text-sm text-gray-500">Reading the bill…</p>
        ) : invoice ? (
          <div className="space-y-1 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
            {changes.map((c) => (
              <div key={String(c.line.record_id)} className="flex justify-between gap-3">
                <span className="text-gray-600">{nameOf(c.line)}</span>
                <span className="font-semibold tabular-nums text-gray-900">
                  ${money(c.line.amount ?? 0)} → ${money(c.amount)}
                </span>
              </div>
            ))}
            <div className="mt-1 flex justify-between gap-3 border-t border-gray-200 pt-2">
              <span className="text-gray-600">{MONEY_WORD.billTotal}</span>
              <span className="font-semibold tabular-nums text-gray-900">
                ${money(oldTotal)} → ${money(newTotal)}
              </span>
            </div>
            {invoice.amount_paid > 0 && (
              <p className="pt-1 text-xs text-gray-500">
                ${money(invoice.amount_paid)} received on it is used on the new bill
                {newTotal > invoice.amount_paid
                  ? `; $${money(round2(newTotal - invoice.amount_paid))} stays ${MONEY_WORD.unpaid.toLowerCase()}.`
                  : `; what it does not need stays ${MONEY_WORD.prepaid.toLowerCase()}.`}
              </p>
            )}
            {unmatched.length > 0 && (
              <p className="pt-1 text-xs text-red-600">
                {unmatched.map((c) => nameOf(c.line)).join(", ")} could not be matched on the bill. Use Replace
                bill on the Billing page instead.
              </p>
            )}
          </div>
        ) : null}

        <FormField label="Reason *">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </FormField>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving} className="mr-auto">
            Not now
          </Button>
          <Button onClick={submit} disabled={saving || loading || !invoice || unmatched.length > 0}>
            <FaExchangeAlt className="mr-2" />
            {saving ? "Reissuing…" : `Reissue at $${money(newTotal)}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
