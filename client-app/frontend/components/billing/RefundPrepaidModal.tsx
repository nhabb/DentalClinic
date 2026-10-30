"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FaUndo } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { MONEY_WORD } from "./money-words";
import { PAYMENT_METHODS } from "./payment-methods";
import { clinicToday, money, readError } from "./quote-doc";

/*
 * Refund: the one way money goes back.
 *
 * Only prepaid money can be handed back — money on a bill has to be released
 * first by cancelling or replacing that bill, which is where that choice is
 * offered. The server takes it out of the receipts that hold it, newest
 * first, one refund (RF) per receipt, and refuses more than is held.
 */

export interface RefundablePatient {
  id: number | string;
  label: string;
  /** What they have prepaid right now. */
  prepaid: number;
}

interface Props {
  patient: RefundablePatient | null;
  onClose: () => void;
  onRefunded: () => void;
}

export function RefundPrepaidModal({ patient, onClose, onRefunded }: Props) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(clinicToday());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!patient) return;
    setAmount(patient.prepaid > 0 ? patient.prepaid.toFixed(2) : "");
    setMethod("cash");
    setDate(clinicToday());
    setReason("");
    setError("");
  }, [patient]);

  if (!patient) return null;

  const submit = async () => {
    setError("");
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter the amount handed back.");
    if (value > patient.prepaid + 0.005)
      return setError(`They have $${money(patient.prepaid)} ${MONEY_WORD.prepaid.toLowerCase()}, not more.`);
    if (reason.trim().length < 3) return setError("Say why the money goes back.");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/billing/patients/${patient.id}/credit-refunds`, {
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
      const numbers = ((body?.refunds ?? []) as { document_number?: string }[])
        .map((r) => r.document_number)
        .filter(Boolean)
        .join(", ");
      toast.success(`Refunded $${money(value)} to ${patient.label}${numbers ? ` (${numbers})` : ""}.`);
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
      isOpen={!!patient}
      onClose={onClose}
      title={`${MONEY_WORD.refund} — ${patient.label}`}
      description={`They have $${money(patient.prepaid)} ${MONEY_WORD.prepaid.toLowerCase()}. Money already on a bill is released by cancelling or replacing that bill.`}
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount handed back *">
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={patient.prepaid}
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Handed back by *">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="On *">
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
            placeholder="e.g. Stopped treatment"
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
            {saving ? "Recording…" : `${MONEY_WORD.refund} $${money(parseFloat(amount) || 0)}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
