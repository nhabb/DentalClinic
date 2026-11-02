"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FaBan } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { MONEY_WORD } from "@/components/billing/money-words";
import { PAYMENT_METHODS } from "@/components/billing/payment-methods";
import { money, readError } from "@/components/billing/quote-doc";
import type { Invoice } from "@/components/billing/invoice-doc";

/*
 * Cancel a bill. It stays on record, marked cancelled with the reason, and
 * is no longer owed; the chart work on it can be billed again. Cancelling is
 * not refunding: money received on it goes back to the patient's receipts as
 * prepaid, unless the desk ticks the refund here, in which case it is handed
 * back in the same step, one refund per receipt.
 */

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
  onCancelled: () => void;
}

export function CancelBillModal({ invoice, onClose, onCancelled }: Props) {
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(false);
  const [method, setMethod] = useState("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!invoice) return;
    setReason("");
    setRefund(false);
    setMethod("cash");
    setError("");
  }, [invoice]);

  if (!invoice) return null;
  const paid = invoice.amount_paid;

  const submit = async () => {
    setError("");
    if (reason.trim().length < 3) return setError("Say why this bill is cancelled.");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/billing/invoices/${invoice.id}/void`, {
        method: "POST",
        body: JSON.stringify({
          reason: reason.trim(),
          ...(paid > 0 && refund ? { refund: true, refund_method: method } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not cancel the bill."));
      const body = await res.json();
      const released = (body.released_receipts ?? []) as { document_number: string }[];
      const refunds = (body.refunds ?? []) as { document_number: string }[];
      toast.success(
        refunds.length > 0
          ? `${invoice.invoice_number} cancelled. Refunded: ${refunds.map((r) => r.document_number).join(", ")}.`
          : released.length > 0
            ? `${invoice.invoice_number} cancelled. $${money(paid)} is ${MONEY_WORD.prepaid.toLowerCase()} again.`
            : `${invoice.invoice_number} cancelled.`,
      );
      onCancelled();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!invoice}
      onClose={onClose}
      title={`Cancel ${invoice.invoice_number}`}
      description="It stays on record as cancelled, with your reason, and is no longer owed. To change what is on it, use Replace bill instead."
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        {paid > 0 && (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p>
              ${money(paid)} was received on it. It goes back to the patient as{" "}
              {MONEY_WORD.prepaid.toLowerCase()} money, ready for their next bill.
            </p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
              <span>Hand the ${money(paid)} back now instead ({MONEY_WORD.refund.toLowerCase()})</span>
            </label>
            {refund && (
              <FormField label="Handed back by *">
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
          </div>
        )}
        <FormField label="Reason *">
          <input
            type="text"
            autoFocus
            placeholder="Why this bill is cancelled"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
          />
        </FormField>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Keep the bill
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            <FaBan className="mr-2" />
            {saving ? "Cancelling…" : refund && paid > 0 ? "Cancel and refund" : "Cancel bill"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
