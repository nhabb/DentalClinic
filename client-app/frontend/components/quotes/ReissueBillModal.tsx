"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
 * A billed line gets a new price: the bill is reissued with that one change.
 *
 * A bill the patient holds must not change under them, so a billed line's
 * price is frozen and the correction is a replacement: the old bill is
 * cancelled with the reason, a new one is issued with the same lines and the
 * new price, the two point at each other, and the money received on the old
 * one moves across. That used to be three screens away from the quote; this
 * runs the same replacement from the price box, with nothing else to decide
 * but the reason.
 */

export type Reissue = {
  line: PlanLine;
  /** The price typed on the quote. */
  amount: number;
};

interface Props {
  reissue: Reissue | null;
  onClose: () => void;
  /** The new bill, so the drawer can re-read the plan and say what happened. */
  onDone: (answer: { invoice: Invoice; cancelled: Invoice; paidFromPrepaid: number }) => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ReissueBillModal({ reissue, onClose, onDone }: Props) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reissue?.line.invoice_id) return;
    let cancelled = false;
    setInvoice(null);
    setError("");
    setLoading(true);
    const { line, amount } = reissue;
    setReason(
      `${line.procedure}${line.tooth ? ` (tooth ${line.tooth})` : ""} repriced to $${money(amount)} on the quote`,
    );
    (async () => {
      try {
        const res = await apiFetch(`/api/billing/invoices/${line.invoice_id}`);
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
  const { line, amount } = reissue;

  // The bill's lines with this one at its new price. The line is found by
  // its chart record, which is what ties the quote line to the bill line.
  const lines = invoice
    ? replacementLines(invoice).map((l) =>
        l.recordId !== null && String(l.recordId) === String(line.record_id)
          ? { ...l, amount }
          : l,
      )
    : [];
  const found = lines.some((l) => l.recordId !== null && String(l.recordId) === String(line.record_id));
  const oldTotal = invoice?.total_amount ?? 0;
  const newLines = lines.reduce((s, l) => s + l.amount, 0);
  const newTotal = invoice
    ? round2(
        (newLines - invoice.discount_amount) * (1 + invoice.vat_percent / 100),
      )
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
      onClose();
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
      title={`Reissue ${line.invoice_number ?? "the bill"} at the new price`}
      description={`${line.procedure}${line.tooth ? ` (tooth ${line.tooth})` : ""} is on this bill at $${money(line.amount ?? 0)}. A bill the patient holds does not change: it is cancelled and issued again with the new price, and the money received on it moves across.`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {loading ? (
          <p className="py-4 text-center text-sm text-gray-500">Reading the bill…</p>
        ) : invoice ? (
          <div className="space-y-1 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">
                {line.procedure}
                {line.tooth ? ` (tooth ${line.tooth})` : ""}
              </span>
              <span className="font-semibold tabular-nums text-gray-900">
                ${money(line.amount ?? 0)} → ${money(amount)}
              </span>
            </div>
            <div className="flex justify-between">
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
            {!found && (
              <p className="pt-1 text-xs text-red-600">
                This line could not be matched on the bill. Use Replace bill on the Billing page instead.
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
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving} className="mr-auto">
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || loading || !invoice || !found}>
            <FaExchangeAlt className="mr-2" />
            {saving ? "Reissuing…" : `Reissue at $${money(newTotal)}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
