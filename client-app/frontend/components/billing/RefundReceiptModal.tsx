"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FaUndo } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { clinicToday, money, readError } from "./quote-doc";
import { PAYMENT_METHODS } from "./TakePaymentModal";

/*
 * Hand money back out of one receipt (a refund, RF…).
 *
 * Only what the receipt still holds can go back: money already on a bill has
 * to be released first by cancelling that bill, which returns it to the
 * receipt. The server checks the same bound, under a lock.
 */

export interface RefundableReceipt {
  id: number;
  document_number: string;
  /** What the receipt still holds. */
  held: number;
  patient_name?: string;
}

interface RefundReceiptModalProps {
  receipt: RefundableReceipt | null;
  onClose: () => void;
  onRefunded: () => void;
}

export function RefundReceiptModal({
  receipt,
  onClose,
  onRefunded,
}: RefundReceiptModalProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(clinicToday());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!receipt) return;
    setAmount(receipt.held > 0 ? receipt.held.toFixed(2) : "");
    setMethod("cash");
    setDate(clinicToday());
    setReason("");
    setError("");
  }, [receipt]);

  if (!receipt) return null;

  const submit = async () => {
    setError("");
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0)
      return setError("Enter the amount handed back.");
    if (value > receipt.held + 0.005)
      return setError(`This receipt holds $${money(receipt.held)}.`);
    if (reason.trim().length < 3) return setError("Say why the money goes back.");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/billing/receipts/${receipt.id}/refunds`, {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          payment_method: method,
          payment_date: date,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "The refund was refused."));
      const body = await res.json();
      const made = (body?.refunds ?? []).at(-1);
      toast.success(
        `Refunded $${money(value)}${made?.document_number ? ` (${made.document_number})` : ""}.`,
      );
      onRefunded();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!receipt}
      onClose={onClose}
      title={`Refund out of ${receipt.document_number}`}
      description={`It holds $${money(receipt.held)}${receipt.patient_name ? ` for ${receipt.patient_name}` : ""}. Money on a bill must be released first by cancelling that bill.`}
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount handed back *">
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={receipt.held}
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Handed back by *">
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
        <FormField label="Handed back on *">
          <input
            type="date"
            value={date}
            max={clinicToday()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </FormField>
        <FormField label="Reason *">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The patient changed their mind"
            className={inputClass}
          />
        </FormField>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            <FaUndo className="mr-2" />
            {saving ? "Recording…" : "Record refund"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
