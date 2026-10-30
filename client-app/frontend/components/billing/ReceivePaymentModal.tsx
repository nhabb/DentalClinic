"use client";

import { useEffect, useMemo, useState } from "react";
import { FaMoneyBillWave } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { MONEY_WORD } from "./money-words";
import { PAYMENT_METHODS } from "./payment-methods";
import { clinicToday, money, readError } from "./quote-doc";

/*
 * Receive payment: the one way money comes in.
 *
 * The desk records what happened — the patient handed over this much, this
 * way, on this day — and the system does the bookkeeping. The patient's unpaid
 * bills are listed and ticked; the money goes on the ticked ones oldest due
 * first and whatever is left stays prepaid for their next bill. So the same
 * dialog is a bill paid in full, an instalment, a prepayment before any bill
 * exists, and a late payment, with nothing else to learn.
 *
 * Underneath, every payment is still a receipt (RT) and every bill is still
 * paid by an allocation; this dialog just stops that being two acts for the
 * person at the desk. Server side it is one request, one transaction.
 */

/** The patient whose money this is. */
export interface PayingPatient {
  id: number | string;
  label?: string;
}

/** An unpaid bill of the patient, as their ledger lists it (oldest due first). */
type OpenBill = {
  id: number;
  invoice_number: string;
  due_date: string;
  total_amount: number;
  remaining_amount: number;
};

/** What receiving did, for the page's toast and refresh. */
export type ReceiveOutcome = {
  receipt: { id: number; document_number: string; amount: number };
  /** What went on which bill, in the order it was spent. */
  applied: { invoice_id: number; invoice_number: string; amount: number }[];
  /** Of this receipt, what stays prepaid. */
  prepaid: number;
  /** The patient's prepaid total afterwards. */
  prepaidTotal: number;
};

interface Props {
  patient: PayingPatient | null;
  open: boolean;
  onClose: () => void;
  onReceived: (outcome: ReceiveOutcome) => void;
  /**
   * Opened from one bill: only that bill is ticked and the amount is what it
   * still owes. Opened from the page or the money file: every unpaid bill is
   * ticked and the amount is what they owe in all.
   */
  initialInvoiceId?: number | null;
}

const num = (v: unknown) => Number(v ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ReceivePaymentModal({
  patient,
  open,
  onClose,
  onReceived,
  initialInvoiceId = null,
}: Props) {
  const [bills, setBills] = useState<OpenBill[]>([]);
  const [prepaidNow, setPrepaidNow] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(clinicToday());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isOpen = open && !!patient;

  useEffect(() => {
    if (!isOpen || !patient) return;
    let cancelled = false;
    setError("");
    setMethod("cash");
    setPaymentDate(clinicToday());
    setNotes("");
    setLoading(true);
    (async () => {
      try {
        const res = await apiFetch(`/api/billing/patients/${patient.id}/ledger`);
        if (!res.ok) throw new Error(await readError(res, "Could not read what they owe."));
        const ledger = await res.json();
        if (cancelled) return;
        const open: OpenBill[] = (ledger.open_invoices ?? []).map(
          (i: Record<string, unknown>) => ({
            id: Number(i.id),
            invoice_number: String(i.invoice_number),
            due_date: String(i.due_date),
            total_amount: num(i.total_amount),
            remaining_amount: num(i.remaining_amount),
          }),
        );
        setBills(open);
        setPrepaidNow(num(ledger.credit_balance));
        const named = initialInvoiceId ? open.find((b) => b.id === initialInvoiceId) : null;
        const chosen = named ? [named] : open;
        setTicked(new Set(chosen.map((b) => b.id)));
        const owed = round2(chosen.reduce((s, b) => s + b.remaining_amount, 0));
        setAmount(owed > 0 ? owed.toFixed(2) : "");
      } catch (e) {
        if (!cancelled) {
          setBills([]);
          setTicked(new Set());
          setAmount("");
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, patient?.id, initialInvoiceId]);

  /** Where the money goes, oldest due first over the ticked bills. */
  const split = useMemo(() => {
    let left = round2(parseFloat(amount) || 0);
    const onBills = bills.map((b) => {
      if (!ticked.has(b.id) || left <= 0) return { bill: b, part: 0 };
      const part = round2(Math.min(left, b.remaining_amount));
      left = round2(left - part);
      return { bill: b, part };
    });
    return { onBills, prepaid: left };
  }, [amount, bills, ticked]);

  if (!isOpen || !patient) return null;

  const toggle = (id: number) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setError("");
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter the amount received.");

    setSaving(true);
    try {
      const res = await apiFetch(`/api/billing/patients/${patient.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          payment_method: method,
          payment_date: paymentDate,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          // The ticked bills and no other; an empty list keeps all of it prepaid.
          invoice_ids: bills.filter((b) => ticked.has(b.id)).map((b) => b.id),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not record the payment."));
      const ledger = await res.json();
      const receiptId = Number(ledger.receipt?.id);
      const row = (ledger.payments ?? []).find(
        (p: Record<string, unknown>) => Number(p.id) === receiptId,
      );
      const applied = ((row?.allocations ?? []) as Record<string, unknown>[]).map((a) => {
        const inv = a.invoice as Record<string, unknown> | null;
        return {
          invoice_id: Number(inv?.id),
          invoice_number: String(inv?.invoice_number ?? ""),
          amount: num(a.amount),
        };
      });
      onReceived({
        receipt: {
          id: receiptId,
          document_number: String(ledger.receipt?.document_number ?? ""),
          amount: value,
        },
        applied,
        prepaid: round2(value - applied.reduce((s, a) => s + a.amount, 0)),
        prepaidTotal: num(ledger.credit_balance),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const value = parseFloat(amount) || 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${MONEY_WORD.receivePayment}${patient.label ? ` — ${patient.label}` : ""}`}
      description="Say how much came in and how. It pays the ticked bills, oldest first; anything left stays prepaid for their next bill."
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Amount *">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              className={inputClass}
            />
          </FormField>
          <FormField label="Paid by *">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="On *">
            <input
              type="date"
              value={paymentDate}
              max={clinicToday()}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>

        {/* ── Goes to ────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-ink-200">
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            <span>Goes to</span>
            {bills.length > 1 && (
              <button
                type="button"
                className="font-sans text-xs font-medium normal-case tracking-normal text-brand hover:underline"
                onClick={() =>
                  setTicked(
                    ticked.size === bills.length ? new Set() : new Set(bills.map((b) => b.id)),
                  )
                }
              >
                {ticked.size === bills.length ? "Untick all" : "Tick all"}
              </button>
            )}
          </div>
          {loading ? (
            <p className="px-3 py-4 text-center text-sm text-ink-500">Reading their bills…</p>
          ) : bills.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-600">
              No {MONEY_WORD.unpaid.toLowerCase()} bills. The full amount stays{" "}
              {MONEY_WORD.prepaid.toLowerCase()} and pays their next bill automatically.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {split.onBills.map(({ bill, part }) => (
                <li key={bill.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-ink-50/70">
                    <input
                      type="checkbox"
                      checked={ticked.has(bill.id)}
                      onChange={() => toggle(bill.id)}
                      className="size-4 accent-brand"
                    />
                    <span className="font-mono text-xs font-semibold text-ink-700">
                      {bill.invoice_number}
                    </span>
                    <span className="text-xs text-ink-500">due {formatDateBeirut(bill.due_date)}</span>
                    <span className="ms-auto text-xs tabular-nums text-ink-500">
                      {MONEY_WORD.unpaid.toLowerCase()} ${money(bill.remaining_amount)}
                    </span>
                    <span
                      className={`w-20 text-end text-sm font-semibold tabular-nums ${
                        part > 0 ? "text-leaf-700" : "text-ink-300"
                      }`}
                    >
                      {part > 0 ? `$${money(part)}` : "—"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {!loading && value > 0 && (
            <div
              className={`flex items-center justify-between border-t border-ink-100 px-3 py-2 text-sm ${
                split.prepaid > 0 ? "bg-brand-50/60 text-brand-800" : "text-ink-500"
              }`}
            >
              <span>Stays {MONEY_WORD.prepaid.toLowerCase()} for their next bill</span>
              <span className="font-semibold tabular-nums">${money(split.prepaid)}</span>
            </div>
          )}
        </div>

        {prepaidNow > 0 && bills.length > 0 && (
          <p className="text-xs text-ink-500">
            They already have ${money(prepaidNow)} {MONEY_WORD.prepaid.toLowerCase()}. It pays a bill as
            it is issued; to put it on one of these bills now, use their money file.
          </p>
        )}

        <FormField label="Note">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional, e.g. first instalment on the implant"
            className={inputClass}
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
          <Button onClick={submit} disabled={saving || loading || value <= 0}>
            <FaMoneyBillWave className="mr-2" />
            {saving ? "Recording…" : `Receive $${money(value)}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
