"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FaMoneyBillWave } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { clinicToday, money, readError } from "./quote-doc";
import { Invoice, normalizeInvoice } from "./invoice-doc";

/*
 * The one place money is received. Every payment attaches to an invoice, and
 * the day the money moved is what the reports count, so it is asked for here
 * rather than assumed to be today.
 */

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "insurance", label: "Insurance" },
  { value: "bank_transfer", label: "Bank transfer" },
];

interface TakePaymentModalProps {
  /** The invoice being paid, or null when the drawer is closed. */
  invoice: Invoice | null;
  onClose: () => void;
  /** The invoice as it stands after the payment. */
  onPaid: (invoice: Invoice) => void;
}

export function TakePaymentModal({ invoice, onClose, onPaid }: TakePaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(clinicToday());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!invoice) return;
    setAmount(invoice.remaining_amount > 0 ? invoice.remaining_amount.toFixed(2) : "");
    setMethod("cash");
    setPaymentDate(clinicToday());
    setNotes("");
    setError("");
  }, [invoice]);

  if (!invoice) return null;

  const submit = async () => {
    setError("");
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0)
      return setError("Enter the amount received.");
    if (value > invoice.remaining_amount + 0.005)
      return setError(
        `That is more than the ${invoice.remaining_amount.toFixed(2)} still owed.`,
      );

    setSaving(true);
    try {
      const res = await apiFetch(`/api/billing/invoices/${invoice.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          payment_method: method,
          payment_date: paymentDate,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not record the payment."));
      const updated = normalizeInvoice(await res.json());
      toast.success(
        updated.remaining_amount <= 0
          ? `Paid in full. Receipt ready for ${updated.invoice_number}.`
          : `Payment recorded; $${money(updated.remaining_amount)} still owed.`,
      );
      onPaid(updated);
      if (updated.remaining_amount <= 0) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const figures = [
    { label: "Total", value: invoice.total_amount, tone: "text-gray-900" },
    { label: "Received", value: invoice.amount_paid, tone: "text-green-700" },
    { label: "Owed", value: invoice.remaining_amount, tone: "text-red-600" },
  ];

  return (
    <Modal
      isOpen={!!invoice}
      onClose={onClose}
      title={`Take payment — ${invoice.invoice_number}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
          {figures.map((f) => (
            <div key={f.label}>
              <p className="text-[11px] uppercase tracking-wide text-gray-500">{f.label}</p>
              <p className={`mt-1 font-semibold ${f.tone}`}>${money(f.value)}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount received *">
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={invoice.remaining_amount}
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setAmount(invoice.remaining_amount.toFixed(2))}
              className="mt-1 text-xs font-medium text-brand hover:underline"
            >
              Pay the full ${money(invoice.remaining_amount)}
            </button>
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
