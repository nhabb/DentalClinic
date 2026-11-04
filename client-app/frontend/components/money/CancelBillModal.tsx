"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FaBan, FaLock } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { MONEY_WORD } from "@/components/billing/money-words";
import { PAYMENT_METHODS } from "@/components/billing/payment-methods";
import { confirmPasswordHeaders } from "@/components/billing/PasswordConfirmModal";
import { money, readError } from "@/components/billing/quote-doc";
import type { Invoice } from "@/components/billing/invoice-doc";

/*
 * Cancel a bill. It stays on record, marked cancelled with the reason, and
 * is no longer owed; the chart work on it can be billed again.
 *
 * When money was received on it, the dialog spells out where that money
 * goes, as a choice the desk makes on purpose: back to the patient as
 * prepaid (nothing leaves the clinic; it pays their next bill), or handed
 * back now as a refund. Either way it is a clinic admin's act: they re-enter
 * their password, and the audit row records who, when, the amount, the
 * reason and where the money went, so a mistake can be traced later. Who
 * counts as an admin is the API's rule alone; this dialog shows the field to
 * everyone and repeats the API's refusal in place.
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
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!invoice) return;
    setReason("");
    setRefund(false);
    setMethod("cash");
    setPassword("");
    setError("");
  }, [invoice]);

  if (!invoice) return null;
  const paid = invoice.amount_paid;
  const moneyOnIt = paid > 0;
  const receipts = Array.from(
    new Set(
      (invoice.invoice_payments ?? [])
        .filter((p) => p.kind === "payment" && p.document_number)
        .map((p) => p.document_number as string),
    ),
  );

  const submit = async () => {
    setError("");
    if (reason.trim().length < 3) return setError("Say why this bill is cancelled.");
    if (moneyOnIt && !password) return setError("Re-enter your password to cancel a bill that has money on it.");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/billing/invoices/${invoice.id}/void`, {
        method: "POST",
        headers: moneyOnIt ? confirmPasswordHeaders(password) : {},
        body: JSON.stringify({
          reason: reason.trim(),
          ...(moneyOnIt && refund ? { refund: true, refund_method: method } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not cancel the bill."));
      const body = await res.json();
      const refunds = (body.refunds ?? []) as { document_number: string }[];
      toast.success(
        refunds.length > 0
          ? `${invoice.invoice_number} cancelled. $${money(paid)} refunded: ${refunds.map((r) => r.document_number).join(", ")}.`
          : moneyOnIt
            ? `${invoice.invoice_number} cancelled. $${money(paid)} is ${MONEY_WORD.prepaid.toLowerCase()} for the patient's next bill.`
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

  const choice = (
    checked: boolean,
    onPick: () => void,
    title: string,
    text: string,
  ) => (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 ${
        checked ? "border-brand-300 bg-white ring-2 ring-brand/20" : "border-ink-200 bg-white/60"
      }`}
    >
      <input type="radio" name="money" checked={checked} onChange={onPick} className="mt-1" />
      <span>
        <span className="block text-sm font-semibold text-ink-900">{title}</span>
        <span className="block text-xs text-ink-600">{text}</span>
      </span>
    </label>
  );

  return (
    <Modal
      isOpen={!!invoice}
      onClose={onClose}
      title={`Cancel ${invoice.invoice_number}`}
      description="The bill stays on record as cancelled, with your reason, and is no longer owed. The work on it goes back to the plan and can be billed again. To change what is on it instead, use Replace bill."
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        {moneyOnIt && (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="font-semibold">
              ${money(paid)} was received on this bill
              {receipts.length > 0 && (
                <span className="font-normal"> ({receipts.join(", ")})</span>
              )}
              . Cancelling does not lose it. Choose where it goes:
            </p>
            {choice(
              !refund,
              () => setRefund(false),
              `Keep it as ${MONEY_WORD.prepaid.toLowerCase()} for the patient`,
              `The $${money(paid)} goes back onto the receipt${receipts.length === 1 ? "" : "s"} it came from and stays the patient's. Nothing leaves the clinic. It pays their next bill by itself as that bill is issued.`,
            )}
            {choice(
              refund,
              () => setRefund(true),
              `Hand it back now (${MONEY_WORD.refund.toLowerCase()})`,
              `The $${money(paid)} leaves the clinic today, one refund (RF) per receipt, each with its own number and your reason. The patient then has nothing ${MONEY_WORD.prepaid.toLowerCase()}.`,
            )}
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

        {moneyOnIt && (
          <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/60 px-3 py-3">
            <p className="flex items-start gap-2 text-xs text-ink-700">
              <FaLock className="mt-0.5 shrink-0 text-ink-400" aria-hidden />
              <span>
                Money moving back to a patient is a clinic admin&apos;s act. It is written to the audit
                log under your name: who, when, {invoice.invoice_number}, ${money(paid)}, your reason and
                where the money went. Nothing here can be undone.
              </span>
            </p>
            <FormField label="Your password (clinic admin) *">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Re-enter your password to confirm"
                className={inputClass}
              />
            </FormField>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Keep the bill
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={saving || (moneyOnIt && !password)}
          >
            <FaBan className="mr-2" />
            {saving
              ? "Cancelling…"
              : moneyOnIt
                ? refund
                  ? `Cancel and refund $${money(paid)}`
                  : `Cancel, keep $${money(paid)} ${MONEY_WORD.prepaid.toLowerCase()}`
                : "Cancel bill"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
