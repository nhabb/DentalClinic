"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FaPlus, FaTrash } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Avatar } from "@/components/ui/Avatar";
import { clinicToday, money, readError } from "./quote-doc";
import {
  Invoice,
  normalizeInvoice,
  PROCEDURES,
} from "./invoice-doc";

/*
 * The invoice builder: the one place a bill is created. Pick the patient, tick
 * the completed chart work to bill (each line carries its record so the same
 * work can never be billed twice) and add any charge that is not chart work.
 */

export type PatientOption = { id: number; label: string };

/**
 * One line of the patient's plan that is not on an invoice yet, as the API
 * returns it. Planned and completed work both appear: billing a crown before
 * it is cut is ordinary, and the plan is the only place either kind lives.
 *
 * Ids are BigInt on the server and arrive as strings, so they are coerced
 * before they go back as `record_id`.
 */
type BillableRecord = {
  id: number | string;
  title: string;
  tooth_number: string | null;
  treatment_date: string | null;
  quoted_amount: number | string | null;
  /** Done, or planned and not done yet. Both are billable. */
  state: "planned" | "done";
};

/** A line being built: either a chart record or a free charge. */
type DraftLine = {
  key: string;
  recordId: number | null;
  procedure: string;
  tooth: string;
  amount: string;
  /** Chart work the user has not ticked is left off the invoice. */
  included: boolean;
  hint: string;
};

interface NewInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  patients: PatientOption[];
  /** Pre-selected patient (deep link from the chart), if any. */
  initialPatientId?: number | null;
  /** The new invoice, so the page can list it and offer to take payment. */
  onCreated: (invoice: Invoice) => void;
}

export function NewInvoiceModal({
  open,
  onClose,
  patients,
  initialPatientId,
  onCreated,
}: NewInvoiceModalProps) {
  const [patientId, setPatientId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [loadingWork, setLoadingWork] = useState(false);
  const [procedureDate, setProcedureDate] = useState(clinicToday());
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setPatientId(null);
    setSearch("");
    setLines([]);
    setProcedureDate(clinicToday());
    setDueDate("");
    setDiscount("");
    setDiscountReason("");
    setNotes("");
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    if (initialPatientId) setPatientId(initialPatientId);
  }, [open, initialPatientId, reset]);

  /** The patient's unbilled completed work becomes the starting lines. */
  useEffect(() => {
    // Lines belong to one patient: drop the previous patient's before
    // loading, so they can never show (or be issued) under another name.
    setLines([]);
    if (!open || !patientId) return;
    let cancelled = false;
    setLoadingWork(true);
    (async () => {
      try {
        const res = await apiFetch(`/api/billing/patients/${patientId}/billable`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (cancelled) return;
        const records: BillableRecord[] = Array.isArray(json.plan_unbilled)
          ? json.plan_unbilled
          : [];
        setLines(
          records.map((r) => ({
            key: `rec-${r.id}`,
            recordId: Number(r.id),
            procedure: r.title,
            tooth: r.tooth_number ?? '',
            // The price the plan carries; the chart is where it was set. An
            // unpriced line stays empty and unticked: a list price the chart
            // never set must not end up on the bill unnoticed.
            amount: r.quoted_amount == null ? '' : String(r.quoted_amount),
            included: r.quoted_amount != null,
            // Planned work bills as readily as completed work: a patient
            // paying for a crown before it is cut is the ordinary case.
            hint:
              (r.state === 'done'
                ? r.treatment_date
                  ? `Done ${formatDateBeirut(r.treatment_date)}`
                  : 'Done'
                : 'Planned, not done yet') +
              (r.quoted_amount == null ? ' · not priced on the chart' : ''),
          })),
        );
      } catch {
        if (!cancelled) toast.error("Could not load this patient's unbilled work.");
      } finally {
        if (!cancelled) setLoadingWork(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, patientId]);

  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addFreeLine = () =>
    setLines((prev) => [
      ...prev,
      {
        key: `free-${Date.now()}-${prev.length}`,
        recordId: null,
        procedure: PROCEDURES[0],
        tooth: "",
        amount: "",
        included: true,
        hint: "Charge with no chart record",
      },
    ]);

  const removeLine = (key: string) =>
    setLines((prev) => prev.filter((l) => l.key !== key));

  // One plan, one list: a patient has a single plan, so there is nothing to
  // group the lines by any more.
  const orderedLines = lines;

  const included = lines.filter((l) => l.included);
  /** Tick or untick the whole list at once; the header box shows which it is. */
  const allIncluded = lines.length > 0 && included.length === lines.length;
  const someIncluded = included.length > 0;
  const setAllIncluded = (include: boolean) =>
    setLines((prev) => prev.map((l) => ({ ...l, included: include })));
  const subtotal = included.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const draftDiscount = parseFloat(discount) || 0;
  const total = Math.max(0, subtotal - draftDiscount);
  const patient = patients.find((p) => p.id === patientId) ?? null;

  const submit = async () => {
    setError("");
    if (!patientId) return setError("Choose the patient this bill is for.");
    if (included.length === 0) return setError("Add at least one line to bill.");
    for (const l of included) {
      const amount = parseFloat(l.amount);
      if (Number.isNaN(amount) || amount < 0)
        return setError("Every line needs a price of 0 or more.");
    }
    if (draftDiscount < 0 || draftDiscount > subtotal)
      return setError("The discount cannot exceed the lines.");
    if (draftDiscount > 0 && discountReason.trim().length < 3)
      return setError("Say why the discount is given.");
    if (dueDate && dueDate < procedureDate)
      return setError("The due date cannot be before the work date.");

    setSaving(true);
    try {
      const res = await apiFetch("/api/billing/invoices", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patientId,
          procedure_date: procedureDate,
          ...(dueDate ? { due_date: dueDate } : {}),
          ...(draftDiscount > 0
            ? {
                discount_amount: draftDiscount,
                discount_reason: discountReason.trim(),
              }
            : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          line_items: included.map((l) => ({
            ...(l.recordId ? { record_id: l.recordId } : {}),
            procedure_name: l.procedure,
            amount: parseFloat(l.amount),
            ...(l.tooth ? { tooth_number: l.tooth } : {}),
          })),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not issue the invoice."));
      const invoice = normalizeInvoice(await res.json());
      toast.success(`Invoice ${invoice.invoice_number} issued.`);
      onCreated(invoice);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Patient first, then the bill ───────────────────────────────────────────

  if (!patientId) {
    const matches = patients
      .filter((p) => p.label.toLowerCase().includes(search.trim().toLowerCase()))
      .slice(0, 50);
    return (
      <Modal isOpen={open} onClose={onClose} title="New bill: choose the patient" maxWidth="max-w-lg">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Their completed, unbilled chart work is loaded for you to tick; you can
            add any other charge on top.
          </p>
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className={inputClass}
          />
          <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPatientId(p.id)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <Avatar name={p.label} size="sm" />
                <span className="font-medium text-gray-900">{p.label}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-gray-500">
                No patient matches that name.
              </p>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`New bill — ${patient?.label ?? "patient"}`}
      maxWidth="max-w-2xl"
    >
      <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            Ticked chart work is attached to this invoice, so it can never be
            billed twice.
          </p>
          <button
            type="button"
            onClick={() => setPatientId(null)}
            className="shrink-0 text-xs font-medium text-brand hover:underline"
          >
            Change patient
          </button>
        </div>

        {loadingWork ? (
          <p className="py-6 text-center text-sm text-gray-500">Loading unbilled work…</p>
        ) : (
          <div className="space-y-4">
            {lines.length === 0 && (
              <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                No unbilled chart work. Add a charge below.
              </p>
            )}
            {/* Tick everything, or clear it. A part-ticked list shows the
                box half-filled rather than claiming either. */}
            {lines.length > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <input
                  id="bill-all-lines"
                  type="checkbox"
                  checked={allIncluded}
                  ref={(el) => {
                    if (el) el.indeterminate = someIncluded && !allIncluded;
                  }}
                  onChange={(e) => setAllIncluded(e.target.checked)}
                />
                <label
                  htmlFor="bill-all-lines"
                  className="flex-1 cursor-pointer select-none text-sm font-medium text-gray-700"
                >
                  {allIncluded
                    ? `All ${lines.length} lines ticked`
                    : someIncluded
                      ? `${included.length} of ${lines.length} ticked`
                      : "Nothing ticked"}
                </label>
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  ${money(subtotal)}
                </span>
              </div>
            )}
            {/* One plan, one list. Each row says whether the work is done or
                still only planned; both are billable. */}
            {orderedLines.map((l) => (
              <div
                key={l.key}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${l.included ? "border-gray-200" : "border-gray-100 opacity-60"}`}
              >
                <input
                  type="checkbox"
                  checked={l.included}
                  onChange={(e) => setLine(l.key, { included: e.target.checked })}
                  aria-label={`Bill ${l.procedure}`}
                />
                <div className="min-w-0 flex-1">
                  {l.recordId ? (
                    <p className="truncate text-sm text-gray-800">
                      {l.procedure}
                      {l.tooth && (
                        <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-brand">
                          Tooth {l.tooth}
                        </span>
                      )}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={l.procedure}
                        onChange={(e) => setLine(l.key, { procedure: e.target.value })}
                        className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900"
                      >
                        {PROCEDURES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={l.tooth}
                        onChange={(e) => setLine(l.key, { tooth: e.target.value })}
                        placeholder="Tooth"
                        className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900"
                      />
                    </div>
                  )}
                  <p className="text-xs text-gray-400">{l.hint}</p>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={l.amount}
                  onChange={(e) => setLine(l.key, { amount: e.target.value })}
                  className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-right text-gray-900"
                />
                {!l.recordId && (
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Remove this line"
                  >
                    <FaTrash className="text-xs" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addFreeLine}
              className="text-xs font-medium text-brand hover:underline"
            >
              <FaPlus className="mr-1 inline text-[10px]" /> Add a charge (consultation,
              product, fee)
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Work done on *">
            <input
              type="date"
              value={procedureDate}
              max={clinicToday()}
              onChange={(e) => setProcedureDate(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Payment due">
            <input
              type="date"
              value={dueDate}
              min={procedureDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Discount">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label={draftDiscount > 0 ? "Reason for the discount *" : "Reason for the discount"}>
            <input
              type="text"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="e.g. Family discount"
              className={inputClass}
            />
          </FormField>
        </div>

        <FormField label="Note on the invoice">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </FormField>

        <div className="space-y-0.5 text-right text-sm text-gray-700">
          {draftDiscount > 0 && (
            <>
              <p>Lines: ${money(subtotal)}</p>
              <p>Discount: −${money(draftDiscount)}</p>
            </>
          )}
          <p className="font-semibold text-gray-900">Total to bill: ${money(total)}</p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving} className="mr-auto">
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || loadingWork || included.length === 0}>
            {saving ? "Issuing…" : `Issue invoice ($${money(total)})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
