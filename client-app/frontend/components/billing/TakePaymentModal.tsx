"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FaMoneyBillWave } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { MONEY_WORD } from "./money-words";
import { FormField, inputClass } from "@/components/ui/FormField";
import { clinicToday, money, readError } from "./quote-doc";
import { Invoice, normalizeInvoice } from "./invoice-doc";

/*
 * The one place money is received, in both the ways a desk receives it: paying
 * a bill that exists, and taking money before one does (a deposit on an
 * accepted plan). It is one drawer because it is one act — the money belongs
 * to the patient either way, and naming a bill only decides what it covers
 * first. Anything beyond that bill flows on to their next oldest, or is held
 * as credit; it is never refused for being too much.
 *
 * The day the money moved is what the reports count, so it is asked for here
 * rather than assumed to be today.
 */

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "insurance", label: "Insurance" },
  { value: "bank_transfer", label: "Bank transfer" },
];

/** The patient whose money this is; always known, even when no bill is named. */
export interface PayingPatient {
  id: number | string;
  label?: string;
}

interface TakePaymentModalProps {
  /** The bill being paid. Null means a deposit: money with no bill named. */
  invoice: Invoice | null;
  /** Required for a deposit; for a bill it is taken from the invoice. */
  patient?: PayingPatient | null;
  /** Open the drawer with no invoice, to take a deposit. */
  open?: boolean;
  onClose: () => void;
  /** The bill as it stands after the payment, when one was named. */
  onPaid: (invoice: Invoice | null) => void;
}

export function TakePaymentModal({
  invoice,
  patient,
  open,
  onClose,
  onPaid,
}: TakePaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(clinicToday());
  const [notes, setNotes] = useState("");
  const [autoApply, setAutoApply] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isOpen = !!invoice || !!open;

  useEffect(() => {
    if (!isOpen) return;
    // A bill suggests its balance; a deposit has no amount to suggest.
    setAmount(
      invoice && invoice.remaining_amount > 0
        ? invoice.remaining_amount.toFixed(2)
        : "",
    );
    setMethod("cash");
    setPaymentDate(clinicToday());
    setNotes("");
    // A deposit is meant to settle what is owed, oldest first. Money against a
    // named bill is not: more than that bill usually means a mistyped amount,
    // so the excess is held as credit — visible, and nobody else's bill moved —
    // unless the desk says otherwise.
    setAutoApply(!invoice);
    setError("");
  }, [invoice, isOpen]);

  if (!isOpen) return null;

  const patientId = invoice?.patient?.id ?? patient?.id;

  const submit = async () => {
    setError("");
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0)
      return setError("Enter the amount received.");
    if (patientId == null)
      return setError("No patient for this payment.");

    setSaving(true);
    try {
      const res = await apiFetch(`/api/billing/patients/${patientId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          payment_method: method,
          payment_date: paymentDate,
          auto_apply: autoApply,
          ...(invoice ? { invoice_id: Number(invoice.id) } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      if (!res.ok)
        throw new Error(await readError(res, "Could not record the payment."));
      const body = await res.json();

      if (invoice && body.invoice) {
        const updated = normalizeInvoice(body.invoice);
        const credit = Number(body.credit_balance ?? 0);
        toast.success(
          updated.remaining_amount <= 0
            ? `Paid in full. Receipt ready for ${updated.invoice_number}.` +
                (credit > 0 ? ` $${money(credit)} left as credit.` : "")
            : `Payment recorded; $${money(updated.remaining_amount)} still owed.`,
        );
        onPaid(updated);
        if (updated.remaining_amount <= 0) onClose();
        return;
      }

      const credit = Number(body.credit_balance ?? 0);
      const owed = Number(body.outstanding_balance ?? 0);
      toast.success(
        autoApply && owed === 0 && credit > 0
          ? `Received. Their bills are settled and $${money(credit)} is held as credit.`
          : autoApply
            ? `Received. $${money(credit)} held as credit, $${money(owed)} still owed.`
            : `Received. $${money(credit)} held as credit.`,
      );
      onPaid(null);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const figures = invoice
    ? [
        { label: MONEY_WORD.billTotal, value: invoice.total_amount, tone: "text-gray-900" },
        { label: MONEY_WORD.paid, value: invoice.amount_paid, tone: "text-green-700" },
        { label: MONEY_WORD.unpaid, value: invoice.remaining_amount, tone: "text-red-600" },
      ]
    : [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        invoice
          ? `Take payment — ${invoice.invoice_number}`
          : `Take payment${patient?.label ? ` — ${patient.label}` : ""}`
      }
      description={
        invoice
          ? undefined
          : "No bill named: it settles what they owe, oldest first, and keeps the rest as credit."
      }
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {invoice && (
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
            {figures.map((f) => (
              <div key={f.label}>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">
                  {f.label}
                </p>
                <p className={`mt-1 font-semibold ${f.tone}`}>${money(f.value)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount received *">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
            {invoice && invoice.remaining_amount > 0 && (
              <button
                type="button"
                onClick={() => setAmount(invoice.remaining_amount.toFixed(2))}
                className="mt-1 text-xs font-medium text-brand hover:underline"
              >
                Pay the full ${money(invoice.remaining_amount)}
              </button>
            )}
          </FormField>
          <FormField label="Paid by *">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={inputClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Received on *">
            <input
              type="date"
              value={paymentDate}
              max={clinicToday()}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Note">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </FormField>
        </div>

        {/*
         * More than this bill is not an error: it is the next bill, or credit.
         * The choice is spelled out rather than guessed at.
         */}
        <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={autoApply}
            onChange={(e) => setAutoApply(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-gray-700">
            {invoice
              ? "Put anything beyond this bill on their next oldest bill"
              : "Settle their open bills with it, oldest first"}
            <span className="block text-xs text-gray-500">
              Whatever is left over is held as credit on the patient.
            </span>
          </span>
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving} className="mr-auto">
            Close
          </Button>
          <Button onClick={submit} disabled={saving}>
            <FaMoneyBillWave className="mr-2" />
            {saving ? "Recording…" : "Record payment"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
