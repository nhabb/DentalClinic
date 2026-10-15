"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FaCheck,
  FaClipboardList,
  FaCopy,
  FaPaperPlane,
  FaPrint,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import {
  clinicToday,
  isBillable,
  money,
  normalizeQuote,
  printQuote,
  Quote,
  QUOTE_STATUS_STYLE,
  readError,
} from "@/components/billing/quote-doc";

/*
 * The plan band of the dental chart. Planned teeth become a priced estimate
 * here, the patient's answer is recorded here, and an accepted estimate is
 * billed here. A quote is never money: it only writes agreed prices back onto
 * the planned work so that completing it later bills what was agreed.
 */

/** A planned chart record, as the chart page already holds it. */
export interface PlannedWork {
  id: number;
  tooth: string;
  procedure: string;
  quotedAmount: number | null;
}

interface PatientQuotesBandProps {
  /** patient_profiles.id */
  patientId: number;
  planned: PlannedWork[];
  canWrite: boolean;
  reloadToken: number;
  /** Accepting or billing a quote changes the chart and the money band. */
  onChanged: () => void;
}

type DraftLine = PlannedWork & { included: boolean; amount: string };

export function PatientQuotesBand({
  patientId,
  planned,
  canWrite,
  reloadToken,
  onChanged,
}: PatientQuotesBandProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/quotes?patient_id=${patientId}&limit=50`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setQuotes(
        (Array.isArray(json.data) ? json.data : []).map(normalizeQuote),
      );
    } catch {
      toast.error("Could not load this patient's quotes.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load, reloadToken]);

  // ── Deciding an existing quote ─────────────────────────────────────────────

  const act = async (
    q: Quote,
    verb: "send" | "accept" | "decline" | "revise",
    done: string,
  ) => {
    setBusyId(q.id);
    try {
      const res = await apiFetch(`/api/quotes/${q.id}/${verb}`, {
        method: "POST",
      });
      if (!res.ok)
        throw new Error(await readError(res, `Could not ${verb} the quote.`));
      toast.success(done);
      await load();
      // Accepting writes the agreed prices onto the planned chart records.
      if (verb === "accept") onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const issueInvoice = async (q: Quote) => {
    if (
      !window.confirm(
        `Issue an invoice for ${money(q.quoted_total)} from quote ${q.quote_number}? The patient owes it from today.`,
      )
    )
      return;
    setBusyId(q.id);
    try {
      const res = await apiFetch(`/api/quotes/${q.id}/invoice`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!res.ok)
        throw new Error(await readError(res, "Could not issue the invoice."));
      const invoice = await res.json();
      toast.success(`Invoice ${invoice.invoice_number} issued.`);
      await load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const removeDraft = async (q: Quote) => {
    if (
      !window.confirm(
        `Delete draft ${q.quote_number}? Nothing has been given to the patient yet.`,
      )
    )
      return;
    setBusyId(q.id);
    try {
      const res = await apiFetch(`/api/quotes/${q.id}`, { method: "DELETE" });
      if (!res.ok)
        throw new Error(await readError(res, "Could not delete the quote."));
      toast.success("Draft deleted.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  // ── Quoting the plan ───────────────────────────────────────────────────────

  const [showNew, setShowNew] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const openNew = () => {
    setLines(
      planned.map((p) => ({
        ...p,
        included: true,
        amount: p.quotedAmount != null ? String(p.quotedAmount) : "",
      })),
    );
    setValidUntil("");
    setDiscount("");
    setNotes("");
    setFormError("");
    setShowNew(true);
  };

  const setLine = (id: number, patch: Partial<DraftLine>) =>
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );

  const included = lines.filter((l) => l.included);
  const lineTotal = included.reduce(
    (s, l) => s + (parseFloat(l.amount) || 0),
    0,
  );
  const draftDiscount = parseFloat(discount) || 0;

  /**
   * Creates the quote and finishes it in the same press. A draft is only the
   * editable stage; quoting in the chair should never leave one lying around,
   * so the normal paths are "give it to the patient" and "they said yes".
   */
  const saveNew = async (then: "draft" | "send" | "accept") => {
    setFormError("");
    if (included.length === 0)
      return setFormError("Tick at least one planned item.");
    for (const l of included) {
      const amount = parseFloat(l.amount);
      if (Number.isNaN(amount) || amount < 0)
        return setFormError("Every line needs a price of 0 or more.");
    }
    if (draftDiscount < 0 || draftDiscount > lineTotal)
      return setFormError("The discount cannot exceed the lines.");
    setSaving(true);
    try {
      const res = await apiFetch("/api/quotes", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patientId,
          valid_until: validUntil || undefined,
          quoted_discount: draftDiscount || undefined,
          notes: notes.trim() || undefined,
          items: included.map((l) => ({
            record_id: l.id,
            procedure_name: l.procedure,
            tooth_number: l.tooth || undefined,
            amount: parseFloat(l.amount),
          })),
        }),
      });
      if (!res.ok)
        throw new Error(await readError(res, "Could not create the quote."));
      let quote = normalizeQuote(await res.json());

      if (then !== "draft") {
        const next = await apiFetch(`/api/quotes/${quote.id}/${then}`, {
          method: "POST",
        });
        if (!next.ok)
          throw new Error(
            await readError(next, "The quote was saved but could not be closed."),
          );
        quote = normalizeQuote(await next.json());
      }

      toast.success(
        then === "accept"
          ? `${quote.quote_number} accepted; prices written to the chart.`
          : then === "send"
            ? `${quote.quote_number} given to the patient.`
            : `${quote.quote_number} saved as a draft.`,
      );
      setShowNew(false);
      await load();
      if (then === "accept") onChanged();
      if (then === "send") printQuote(quote);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const open = quotes.filter(
    (q) => q.status === "draft" || q.status === "sent" || q.status === "accepted",
  );
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? quotes : open;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-semibold text-gray-800">
          <FaClipboardList className="text-brand" /> Treatment plan and quotes
        </h4>
        {canWrite && (
          <Button size="sm" onClick={openNew} disabled={planned.length === 0}>
            Quote the plan
            {planned.length > 0 && (
              <span className="ml-2 rounded-full bg-white/20 px-1.5 text-xs">
                {planned.length}
              </span>
            )}
          </Button>
        )}
      </div>

      {planned.length === 0 && quotes.length === 0 && !loading && (
        <p className="py-4 text-center text-sm text-gray-500">
          Nothing planned. Mark work as planned on the chart, then quote it here.
        </p>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-gray-500">Loading…</p>
      ) : (
        shown.length > 0 && (
          <div className="space-y-2">
            {shown.map((q) => (
              <div
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    <span className="font-mono text-xs">{q.quote_number}</span>
                    <span className="text-xs text-gray-400">v{q.version}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${QUOTE_STATUS_STYLE[q.status]}`}
                    >
                      {q.status}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {q.items.length} line{q.items.length === 1 ? "" : "s"} ·{" "}
                    {formatDateBeirut(q.created_at)}
                    {q.valid_until
                      ? ` · valid until ${formatDateBeirut(q.valid_until)}`
                      : ""}
                    {q.invoices.length > 0
                      ? ` · billed on ${q.invoices.map((i) => i.invoice_number).join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">
                    ${money(q.quoted_total)}
                  </span>
                  <button
                    type="button"
                    onClick={() => printQuote(q)}
                    title="Print the estimate"
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  >
                    <FaPrint className="text-xs" />
                  </button>
                  {canWrite && q.status === "draft" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === q.id}
                        onClick={() =>
                          act(q, "send", "Marked as given to the patient.")
                        }
                      >
                        <FaPaperPlane className="mr-1 text-xs" /> Sent
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyId === q.id}
                        onClick={() =>
                          act(q, "accept", "Accepted; prices written to the chart.")
                        }
                      >
                        <FaCheck className="mr-1 text-xs" /> Accepted
                      </Button>
                      <button
                        type="button"
                        disabled={busyId === q.id}
                        onClick={() => removeDraft(q)}
                        title="Delete this draft"
                        className="rounded-lg p-2 text-red-300 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <FaTrash className="text-xs" />
                      </button>
                    </>
                  )}
                  {canWrite && q.status === "sent" && (
                    <>
                      <Button
                        size="sm"
                        disabled={busyId === q.id}
                        onClick={() =>
                          act(q, "accept", "Accepted; prices written to the chart.")
                        }
                      >
                        <FaCheck className="mr-1 text-xs" /> Accepted
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === q.id}
                        onClick={() => act(q, "decline", "Marked as declined.")}
                      >
                        <FaTimes className="mr-1 text-xs" /> Declined
                      </Button>
                    </>
                  )}
                  {canWrite && isBillable(q) && (
                    <Button
                      size="sm"
                      disabled={busyId === q.id}
                      onClick={() => issueInvoice(q)}
                      title="Bill the whole plan now, for treatment paid up front"
                    >
                      Issue invoice
                    </Button>
                  )}
                  {canWrite && q.status !== "draft" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === q.id}
                      onClick={() =>
                        act(q, "revise", `Version ${q.version + 1} started.`)
                      }
                      title="Start a new version; the old one stays as the patient saw it"
                    >
                      <FaCopy className="mr-1 text-xs" /> New version
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {quotes.length > open.length && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs font-medium text-brand hover:underline"
        >
          {showAll
            ? `Show only open quotes (${open.length})`
            : `Show all quotes (${quotes.length})`}
        </button>
      )}

      {/* ── Quote the plan ──────────────────────────────────────────────── */}
      <Modal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        title="Quote the treatment plan"
        maxWidth="max-w-2xl"
      >
        <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
          <p className="text-sm text-gray-500">
            An estimate the patient takes home. It is not an invoice and never
            counts as income. Accepting it writes these prices onto the planned
            work.
          </p>

          <div className="space-y-2">
            {lines.map((l) => (
              <div
                key={l.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${l.included ? "border-gray-200" : "border-gray-100 opacity-60"}`}
              >
                <input
                  type="checkbox"
                  checked={l.included}
                  onChange={(e) =>
                    setLine(l.id, { included: e.target.checked })
                  }
                />
                <div className="min-w-0 flex-1 text-sm text-gray-800">
                  {l.procedure}
                  {l.tooth && (
                    <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-brand">
                      Tooth {l.tooth}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={l.amount}
                  onChange={(e) => setLine(l.id, { amount: e.target.value })}
                  className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-right text-gray-900"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Valid until">
              <input
                type="date"
                value={validUntil}
                min={clinicToday()}
                onChange={(e) => setValidUntil(e.target.value)}
                className={inputClass}
              />
            </FormField>
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
            <FormField label="Note on the quote">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </FormField>
          </div>

          <div className="space-y-0.5 text-right text-sm text-gray-700">
            {draftDiscount > 0 && (
              <>
                <p>Lines: ${money(lineTotal)}</p>
                <p>Discount: −${money(draftDiscount)}</p>
              </>
            )}
            <p className="font-semibold text-gray-900">
              Total estimate: ${money(lineTotal - draftDiscount)}
            </p>
          </div>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-3">
            <Button
              variant="outline"
              onClick={() => setShowNew(false)}
              disabled={saving}
              className="mr-auto"
            >
              Cancel
            </Button>
            <button
              type="button"
              onClick={() => saveNew("draft")}
              disabled={saving}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
              title="Keep it editable; nothing is given to the patient yet"
            >
              Save as draft
            </button>
            <Button
              variant="outline"
              onClick={() => saveNew("send")}
              disabled={saving}
              title="Freeze it and print the estimate for the patient"
            >
              <FaPrint className="mr-2 text-xs" /> Save and print
            </Button>
            <Button
              onClick={() => saveNew("accept")}
              disabled={saving}
              title="The patient agreed in the chair: prices go onto the plan"
            >
              <FaCheck className="mr-2 text-xs" />
              {saving ? "Saving…" : "Patient accepted"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
