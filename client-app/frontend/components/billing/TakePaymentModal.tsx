"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FaMoneyBillWave, FaReceipt } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { MONEY_WORD } from "./money-words";
import { FormField, inputClass } from "@/components/ui/FormField";
import { clinicToday, money, readError } from "./quote-doc";
import { Invoice, normalizeInvoice } from "./invoice-doc";
import { normalizeReceipt, type ReceiptRow } from "./receipt-doc";

/*
 * The one place money is received. Every payment is a receipt (RT…):
 *
 *   - with a bill named ("Take payment"), the receipt is made and applied to
 *     that bill in one step; anything beyond the bill stays open on the
 *     receipt, still the patient's;
 *   - with no bill ("New receipt"), it is a deposit: an open receipt that is
 *     used later on any of the patient's bills.
 *
 * A bill can also be paid out of a deposit the patient already left: the
 * "Pay from a deposit" list does that without any new money moving.
 *
 * The day the money moved is what the reports count, so it is asked for here
 * rather than assumed to be today.
 */

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
];

/** The patient whose money this is; always known, even when no bill is named. */
export interface PayingPatient {
  id: number | string;
  label?: string;
}

interface TakePaymentModalProps {
  /** The bill being paid. Null means a deposit: a receipt with no bill named. */
  invoice: Invoice | null;
  /** Required for a deposit; for a bill it is taken from the invoice. */
  patient?: PayingPatient | null;
  /** Open the drawer with no invoice, to take a deposit. */
  open?: boolean;
  onClose: () => void;
  /** The bill as it stands after the payment, when one was named. */
  onPaid: (invoice: Invoice | null) => void;
}

/** The newest receipt in a ledger answer: the one this payment just made. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const newestReceipt = (payments: any[] | undefined): string | null => {
  const receipts = (payments ?? []).filter((p) => p.kind !== "refund");
  if (receipts.length === 0) return null;
  const newest = receipts.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
  return newest.document_number ?? null;
};

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /** The patient's receipts that still hold money (deposits). */
  const [deposits, setDeposits] = useState<ReceiptRow[]>([]);

  const isOpen = !!invoice || !!open;
  const patientId = invoice?.patient?.id ?? patient?.id;

  const loadDeposits = useCallback(async () => {
    if (!invoice || patientId == null) return setDeposits([]);
    try {
      const res = await apiFetch(
        `/api/billing/receipts?patient_id=${patientId}&kind=payment&limit=200`,
      );
      if (!res.ok) return setDeposits([]);
      const rows = ((await res.json()) as unknown[]).map(normalizeReceipt);
      setDeposits(rows.filter((r) => (r.figures?.held ?? 0) > 0));
    } catch {
      setDeposits([]);
    }
  }, [invoice, patientId]);

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
    setError("");
    void loadDeposits();
  }, [invoice, isOpen, loadDeposits]);

  if (!isOpen) return null;

  /** Pay the bill out of a deposit already held: no new money moves. */
  const applyDeposit = async (receipt: ReceiptRow) => {
    if (!invoice) return;
    const value = Math.min(receipt.figures?.held ?? 0, invoice.remaining_amount);
    if (value <= 0) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/api/billing/payments/${receipt.id}/allocations`, {
        method: "POST",
        body: JSON.stringify({ invoice_id: Number(invoice.id), amount: value }),
      });
      if (!res.ok)
        throw new Error(await readError(res, "That deposit could not be used."));
      const fresh = await apiFetch(`/api/billing/invoices/${invoice.id}`);
      const updated = fresh.ok ? normalizeInvoice(await fresh.json()) : null;
      toast.success(
        `$${money(value)} of ${receipt.document_number} applied to ${invoice.invoice_number}.`,
      );
      onPaid(updated);
      if (!updated || updated.remaining_amount <= 0) onClose();
      else await loadDeposits();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    setError("");
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0)
      return setError("Enter the amount received.");
    if (patientId == null) return setError("No patient for this payment.");

    setSaving(true);
    try {
      if (!invoice) {
        // A deposit: a receipt that stays open until it is used on a bill.
        const res = await apiFetch("/api/billing/receipts", {
          method: "POST",
          body: JSON.stringify({
            patient_id: Number(patientId),
            amount: value,
            payment_method: method,
            payment_date: paymentDate,
            ...(notes.trim() ? { reason: notes.trim() } : {}),
          }),
        });
        if (!res.ok)
          throw new Error(await readError(res, "Could not record the receipt."));
        const receipt = normalizeReceipt(await res.json());
        toast.success(
          `Receipt ${receipt.document_number} for $${money(value)}. It stays open until it is used on a bill.`,
        );
        onPaid(null);
        onClose();
        return;
      }

      // A bill named: the receipt is made and applied to it in one step.
      // Anything beyond this bill stays open on the receipt, never on
      // another bill unasked.
      const res = await apiFetch(`/api/billing/patients/${patientId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          payment_method: method,
          payment_date: paymentDate,
          auto_apply: false,
          invoice_id: Number(invoice.id),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      if (!res.ok)
        throw new Error(await readError(res, "Could not record the payment."));
      const body = await res.json();
      const number = newestReceipt(body.payments);
      const updated = body.invoice ? normalizeInvoice(body.invoice) : null;
      const extra = updated
        ? Math.max(0, value - (invoice.remaining_amount - updated.remaining_amount))
        : 0;
      toast.success(
        [
          number ? `Receipt ${number}.` : "Payment recorded.",
          updated && updated.remaining_amount <= 0
            ? `${invoice.invoice_number} is paid.`
            : updated
              ? `$${money(updated.remaining_amount)} still owed.`
              : "",
          extra > 0.005 ? `$${money(extra)} stays open on the receipt.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      onPaid(updated);
      if (!updated || updated.remaining_amount <= 0) onClose();
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
          : `New receipt${patient?.label ? ` — ${patient.label}` : ""}`
      }
      description={
        invoice
          ? "Records a receipt (RT) and applies it to this bill."
          : "A deposit: a receipt (RT) with no bill yet. It stays open and can be used on any of this patient's bills."
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

        {invoice && deposits.length > 0 && invoice.remaining_amount > 0 && (
          <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
            <p className="text-sm font-semibold text-ink-900">Pay from a deposit</p>
            <p className="text-xs text-ink-500">
              Money this patient already left. Using it moves no new money.
            </p>
            <ul className="space-y-1.5">
              {deposits.map((d) => {
                const use = Math.min(d.figures?.held ?? 0, invoice.remaining_amount);
                return (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-card px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs text-ink-700">{d.document_number}</span>
                    <span className="text-xs text-ink-500">
                      holds ${money(d.figures?.held ?? 0)}
                      {d.notes ? ` · ${d.notes}` : ""}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving || use <= 0}
                      onClick={() => void applyDeposit(d)}
                    >
                      <FaReceipt /> Use ${money(use)}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label={invoice ? "New money received *" : "Amount received *"}>
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
          <FormField label={invoice ? "Note" : "Reason"}>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={invoice ? "Optional" : "Optional, e.g. Deposit for the implant"}
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
            {saving ? "Recording…" : invoice ? "Record payment" : "Record receipt"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
