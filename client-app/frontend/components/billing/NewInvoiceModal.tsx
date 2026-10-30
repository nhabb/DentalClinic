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
import { MONEY_WORD } from "./money-words";
import {
  Invoice,
  normalizeInvoice,
  PROCEDURES,
} from "./invoice-doc";

/*
 * The invoice builder: the one place a bill is created. Pick the patient, tick
 * the chart work to bill (each line carries its record so the same work can
 * never be billed twice) and add any charge that is not chart work.
 *
 * A bill is paid from the patient's prepaid money as it is issued, if they
 * have any (the server does it in the same transaction); whatever is left
 * unpaid is received on the Payments page. This builder never takes money
 * itself — with one exception:
 *
 *   - It replaces a bill. A bill's lines are frozen once issued, so when the
 *     plan changes after billing the correction is a new bill: the old one is
 *     cancelled with the reason, the money on it goes back to the receipts and
 *     straight onto this bill, and the two point at each other. Opened with
 *     `replacing`, the builder starts from that bill's lines, discount and VAT
 *     and issues through the replace route, all in one server transaction.
 */

export type PatientOption = { id: number; label: string };

/** What issuing did beyond creating the row, for the page's toast. */
export type IssueOutcome = {
  /** Drawn from the patient's balance as the bill was issued. */
  paidFromBalance: number;
  /** When replacing: the bill that was cancelled in the same step. */
  replaced: Invoice | null;
};

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
  /** Came off the bill being replaced; it re-bills unless unticked. */
  fromReplaced?: boolean;
};

interface NewInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  patients: PatientOption[];
  /** Pre-selected patient (deep link from the chart), if any. */
  initialPatientId?: number | null;
  /**
   * The bill being replaced. Its patient, lines, discount, VAT and note
   * pre-fill the builder; issuing cancels it and moves its money here.
   */
  replacing?: Invoice | null;
  /** The new invoice, so the page can list it and say what else happened. */
  onCreated: (invoice: Invoice, outcome: IssueOutcome) => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const dateOnly = (d: string | null | undefined) => (d ? d.slice(0, 10) : "");

/**
 * The lines of the bill being replaced, as draft lines. A line keeps only its
 * figures, so its chart record is found among the records the bill holds by
 * procedure and tooth — each record paired once — and goes back out as
 * `record_id`; a line with no match was a free charge and stays one.
 */
function linesOfReplaced(inv: Invoice): DraftLine[] {
  const spare = [...inv.records];
  return inv.line_items.map((li, i) => {
    const at = spare.findIndex(
      (r) => r.title === li.procedure_name && (r.tooth_number ?? "") === (li.tooth_number ?? ""),
    );
    const record = at >= 0 ? spare.splice(at, 1)[0] : null;
    return {
      key: record ? `rec-${record.id}` : `old-${li.id ?? i}`,
      recordId: record ? record.id : null,
      procedure: li.procedure_name,
      tooth: li.tooth_number ?? "",
      amount: String(li.amount),
      included: true,
      hint: record
        ? `On ${inv.invoice_number} · re-billed as it stands unless you change it`
        : `Charge on ${inv.invoice_number} · re-billed as it stands`,
      fromReplaced: true,
    };
  });
}

export function NewInvoiceModal({
  open,
  onClose,
  patients,
  initialPatientId,
  replacing = null,
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
  /** VAT in percent; 0 (no VAT) unless the user types a rate. */
  const [vatPercent, setVatPercent] = useState("");
  const [notes, setNotes] = useState("");
  /** Why the bill is replaced; required in replace mode, kept on the cancelled bill. */
  const [reason, setReason] = useState("");
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
    setVatPercent("");
    setNotes("");
    setReason("");
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    if (replacing) {
      // Start from the bill as it was: same day, terms, discount and VAT.
      // Only what the desk changes differs on the replacement.
      setPatientId(Number(replacing.patient.id));
      const work = dateOnly(replacing.procedure_date);
      setProcedureDate(work);
      const due = dateOnly(replacing.due_date);
      setDueDate(due && due !== work ? due : "");
      setDiscount(replacing.discount_amount > 0 ? String(replacing.discount_amount) : "");
      setDiscountReason(replacing.discount_reason ?? "");
      setVatPercent(replacing.vat_percent > 0 ? String(replacing.vat_percent) : "");
      setNotes(replacing.notes ?? "");
    } else if (initialPatientId) {
      setPatientId(initialPatientId);
    }
  }, [open, initialPatientId, replacing, reset]);

  /**
   * The patient's unbilled plan work becomes the starting lines — after the
   * replaced bill's own lines when there is one, which come first and ticked.
   */
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
        // Done work first, then what is still in progress: the desk bills
        // what was done today and sees the rest below it.
        const ordered = [
          ...records.filter((r) => r.state === "done"),
          ...records.filter((r) => r.state !== "done"),
        ];
        const fromPlan: DraftLine[] = ordered.map((r) => ({
          key: `rec-${r.id}`,
          recordId: Number(r.id),
          procedure: r.title,
          tooth: r.tooth_number ?? "",
          // The price the quote carries. An unpriced line stays empty and
          // unticked: a figure the quote never set must not end up on the
          // bill unnoticed. When replacing, other plan work starts unticked
          // too: the bill is being corrected, not extended, unless the desk
          // says so.
          amount: r.quoted_amount == null ? "" : String(r.quoted_amount),
          included: r.quoted_amount != null && !replacing,
          // Work in progress bills as readily as done work: a patient paying
          // for a crown before it is cut is the ordinary case.
          hint:
            (r.state === "done"
              ? r.treatment_date
                ? `Done ${formatDateBeirut(r.treatment_date)}`
                : "Done"
              : "In progress — planned, not done yet") +
            (r.quoted_amount == null ? " · not priced on the quote" : ""),
        }));
        setLines(replacing ? [...linesOfReplaced(replacing), ...fromPlan] : fromPlan);
      } catch {
        if (!cancelled) toast.error("Could not load this patient's unbilled work.");
      } finally {
        if (!cancelled) setLoadingWork(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, patientId, replacing]);

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
  // The server's rule (invoice-math.ts): VAT is charged after the discount,
  // each figure rounded to cents.
  const draftVat = parseFloat(vatPercent) || 0;
  const taxable = Math.max(0, round2(subtotal - draftDiscount));
  const vatAmount = round2((taxable * draftVat) / 100);
  const total = round2(taxable + vatAmount);
  const patient = patients.find((p) => p.id === patientId) ?? null;
  const patientLabel = replacing
    ? `${replacing.patient.users.first_name} ${replacing.patient.users.last_name}`
    : (patient?.label ?? "patient");

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
    if (draftVat < 0 || draftVat > 100)
      return setError("VAT must be between 0% and 100%.");
    if (dueDate && dueDate < procedureDate)
      return setError("The due date cannot be before the work date.");
    if (replacing && reason.trim().length < 3)
      return setError("Say why the bill is replaced; it is kept on the cancelled one.");

    const body = {
      procedure_date: procedureDate,
      ...(dueDate ? { due_date: dueDate } : {}),
      ...(draftDiscount > 0
        ? {
            discount_amount: draftDiscount,
            discount_reason: discountReason.trim(),
          }
        : {}),
      ...(draftVat > 0 ? { vat_percent: draftVat } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      // Prepaid money pays the bill as it is issued, so nobody has to move it
      // by hand afterwards; what the prepayment does not cover is received on
      // the Payments page. (Replacing moves the old bill's money across by
      // default on the server.)
      ...(replacing ? {} : { pay_from_balance: true }),
      line_items: included.map((l) => ({
        ...(l.recordId ? { record_id: l.recordId } : {}),
        procedure_name: l.procedure,
        amount: parseFloat(l.amount),
        ...(l.tooth ? { tooth_number: l.tooth } : {}),
      })),
    };

    setSaving(true);
    try {
      if (replacing) {
        const res = await apiFetch(`/api/billing/invoices/${replacing.id}/replace`, {
          method: "POST",
          body: JSON.stringify({ ...body, reason: reason.trim() }),
        });
        if (!res.ok) throw new Error(await readError(res, "Could not replace the bill."));
        const answer = await res.json();
        const invoice = normalizeInvoice(answer.invoice);
        const drawn = (answer.paid_from_balance ?? []) as { amount: number | string }[];
        onCreated(invoice, {
          paidFromBalance: round2(drawn.reduce((s, m) => s + Number(m.amount), 0)),
          replaced: normalizeInvoice(answer.cancelled),
        });
      } else {
        const res = await apiFetch("/api/billing/invoices", {
          method: "POST",
          body: JSON.stringify({ patient_id: patientId, ...body }),
        });
        if (!res.ok) throw new Error(await readError(res, "Could not issue the invoice."));
        const invoice = normalizeInvoice(await res.json());
        onCreated(invoice, {
          paidFromBalance: round2(
            (invoice.paid_from_balance ?? []).reduce((s, m) => s + m.amount, 0),
          ),
          replaced: null,
        });
      }
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
            Their done and in-progress work is loaded for you to tick, at the
            prices the quote set; you can add any other charge on top.
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
      title={
        replacing
          ? `${MONEY_WORD.replaceBill} ${replacing.invoice_number} — ${patientLabel}`
          : `New bill — ${patientLabel}`
      }
      maxWidth="max-w-2xl"
    >
      <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
        {replacing ? (
          <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p>
              <strong>{replacing.invoice_number}</strong> will be cancelled with your
              reason and this bill issued in its place; the two will name each other.
            </p>
            <p>
              {replacing.amount_paid > 0
                ? `$${money(replacing.amount_paid)} received on it goes back to the patient's receipts and is used on this bill. Nothing is refunded.`
                : "Nothing was received on it, so no money moves."}
            </p>
          </div>
        ) : (
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
        )}

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
                still only planned; both are billable. A line off the replaced
                bill says so, and comes off this bill if unticked — its work
                goes back to the plan, unbilled. */}
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
                  {l.recordId || l.fromReplaced ? (
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
                {!l.recordId && !l.fromReplaced && (
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

        <FormField label="VAT %">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="0 (no VAT)"
            value={vatPercent}
            onChange={(e) => setVatPercent(e.target.value)}
            className={inputClass}
          />
        </FormField>

        <FormField label="Note on the invoice">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </FormField>

        {replacing && (
          <FormField label="Why the bill is replaced *">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Second crown not needed; first crown is a ceramic one"
              className={inputClass}
            />
          </FormField>
        )}

        <div className="space-y-0.5 text-right text-sm text-gray-700">
          {(draftDiscount > 0 || vatAmount > 0) && (
            <>
              <p>Lines: ${money(subtotal)}</p>
              {draftDiscount > 0 && <p>Discount: −${money(draftDiscount)}</p>}
              {vatAmount > 0 && (
                <p>
                  VAT {draftVat}%: ${money(vatAmount)}
                </p>
              )}
            </>
          )}
          <p className="font-semibold text-gray-900">Total to bill: ${money(total)}</p>
          {!replacing && (
            <p className="text-xs text-gray-500">
              Money the patient has {MONEY_WORD.prepaid.toLowerCase()} pays it as it is issued; the rest is received on the Payments page.
            </p>
          )}
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
            {saving
              ? replacing
                ? "Replacing…"
                : "Issuing…"
              : replacing
                ? `${MONEY_WORD.replaceBill} ($${money(total)})`
                : `Issue invoice ($${money(total)})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
