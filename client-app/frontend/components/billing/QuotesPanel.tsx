"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FaCheck,
  FaCopy,
  FaFileInvoiceDollar,
  FaPaperPlane,
  FaPrint,
  FaTimes,
  FaTrash,
  FaPlus,
} from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ListToolbar } from "@/components/ui/ListToolbar";

/*
 * Quotes: priced treatment plans. A quote is an estimate, never money. It is
 * editable as a draft, frozen once sent, and ends accepted, declined or
 * expired; a revision is a new version. Accepting one writes its prices onto
 * the planned chart records, so completing that work bills the agreed amount.
 */

type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

type QuoteItem = {
  id: number;
  record_id: number | null;
  procedure_name: string;
  tooth_number: string | null;
  description: string | null;
  quoted_amount: number;
};

export type Quote = {
  id: number;
  /** Sequential per clinic and year (QUO-2026-00004): what the patient sees. */
  quote_number: string;
  version: number;
  status: QuoteStatus;
  valid_until: string | null;
  /** Taken off the lines; quoted_total is lines minus this. */
  quoted_discount: number;
  quoted_total: number;
  notes: string | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  patient: { id: number; users: { first_name: string; last_name: string } };
  items: QuoteItem[];
  invoices: {
    id: number;
    invoice_number: string;
    status: string;
    total_amount: number;
  }[];
};

type PatientOption = { id: number; label: string };

/** A line being prepared: either a planned chart record or a free line. */
type DraftLine = {
  key: string;
  record_id?: number;
  procedure_name: string;
  tooth_number: string;
  description: string;
  amount: string;
  included: boolean;
};

const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: "bg-ink-100 text-ink-700",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  expired: "bg-amber-100 text-amber-800",
};

const money = (n: number) => `${Number(n).toFixed(2)}`;

/** Text from patients and staff goes into the printable page as text, never as markup. */
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

function normalizeQuote(q: any): Quote {
  return {
    ...q,
    id: Number(q.id),
    quote_number: q.quote_number ?? `#${q.id}`,
    quoted_discount: Number(q.quoted_discount ?? 0),
    quoted_total: Number(q.quoted_total ?? 0),
    patient: { ...q.patient, id: Number(q.patient?.id) },
    items: (q.items ?? []).map((i: any) => ({
      ...i,
      id: Number(i.id),
      record_id:
        i.record_id === null || i.record_id === undefined
          ? null
          : Number(i.record_id),
      quoted_amount: Number(i.quoted_amount ?? 0),
    })),
    invoices: (q.invoices ?? []).map((i: any) => ({
      ...i,
      id: Number(i.id),
      total_amount: Number(i.total_amount),
    })),
  };
}

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return (body?.message as string) || fallback;
}

interface QuotesPanelProps {
  patients: PatientOption[];
  procedures: readonly string[];
}

export function QuotesPanel({ patients, procedures }: QuotesPanelProps) {
  const { can } = usePermissions();
  const canWrite = can("billing:write");

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Quote | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/quotes?limit=200");
      const json = await res.json();
      setQuotes(
        (Array.isArray(json.data) ? json.data : []).map(normalizeQuote),
      );
    } catch {
      toast.error("Could not load quotes.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      All: quotes.length,
      draft: 0,
      sent: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
    };
    for (const q of quotes) c[q.status] = (c[q.status] ?? 0) + 1;
    return c;
  }, [quotes]);

  const filtered = quotes.filter((q) => {
    const name =
      `${q.patient.users.first_name} ${q.patient.users.last_name}`.toLowerCase();
    return (
      (status === "All" || q.status === status) &&
      (!search || name.includes(search.toLowerCase()))
    );
  });

  // ── Actions ────────────────────────────────────────────────────────────────

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
      const updated = normalizeQuote(await res.json());
      toast.success(done);
      await load();
      setSelected(
        verb === "revise"
          ? updated
          : updated.id === selected?.id
            ? updated
            : selected,
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (q: Quote) => {
    if (
      !window.confirm(
        `Delete draft quote #${q.id}? Nothing has been given to the patient yet.`,
      )
    )
      return;
    setBusyId(q.id);
    try {
      const res = await apiFetch(`/api/quotes/${q.id}`, { method: "DELETE" });
      if (!res.ok)
        throw new Error(await readError(res, "Could not delete the quote."));
      toast.success("Draft deleted.");
      setSelected(null);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  /** Bill an accepted quote as it stands: one numbered invoice with its lines and discount. */
  const issueInvoice = async (q: Quote) => {
    if (
      !window.confirm(
        `Issue an invoice for ${money(q.quoted_total)} from quote ${q.quote_number}? The patient will owe it from today.`,
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
      toast.success(`Invoice ${invoice.invoice_number} issued; find it under Invoices.`);
      setSelected(null);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const print = (q: Quote) => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const rows = q.items
      .map(
        (i) =>
          `<tr><td>${esc(i.procedure_name)}${i.tooth_number ? ` <small>(tooth ${esc(i.tooth_number)})</small>` : ""}${
            i.description ? `<br><small>${esc(i.description)}</small>` : ""
          }</td><td style="text-align:right">${money(i.quoted_amount)}</td></tr>`,
      )
      .join("");
    w.document
      .write(`<!doctype html><html><head><title>Quote ${esc(q.quote_number)} v${q.version}</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#1e2533}h1{font-size:22px;margin:0 0 4px}
      table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:8px;border-bottom:1px solid #dfe6f1;text-align:left}
      tfoot td{font-weight:700;border-top:2px solid #1e2533}small{color:#6d7d97}.meta{color:#6d7d97;font-size:13px}</style></head><body>
      <h1>Treatment estimate</h1>
      <div class="meta">Quote ${esc(q.quote_number)} · version ${q.version} · ${formatDateBeirut(q.created_at)}${
        q.valid_until ? ` · valid until ${formatDateBeirut(q.valid_until)}` : ""
      }</div>
      <p><strong>${esc(q.patient.users.first_name)} ${esc(q.patient.users.last_name)}</strong></p>
      <table><thead><tr><th>Procedure</th><th style="text-align:right">Estimate</th></tr></thead>
      <tbody>${rows}</tbody><tfoot>${
        q.quoted_discount > 0
          ? `<tr><td style="font-weight:400">Lines</td><td style="text-align:right;font-weight:400">${money(q.quoted_total + q.quoted_discount)}</td></tr><tr><td style="font-weight:400">Discount</td><td style="text-align:right;font-weight:400">−${money(q.quoted_discount)}</td></tr>`
          : ""
      }<tr><td>Total estimate</td><td style="text-align:right">${money(q.quoted_total)}</td></tr></tfoot></table>
      ${q.notes ? `<p>${esc(q.notes)}</p>` : ""}
      <p class="meta">This is an estimate of planned treatment, not an invoice. Prices may change if the treatment plan changes.</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  // ── New quote ──────────────────────────────────────────────────────────────

  const [showNew, setShowNew] = useState(false);
  const [newPatient, setNewPatient] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [plannedLoading, setPlannedLoading] = useState(false);
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const openNew = () => {
    setNewPatient("");
    setLines([]);
    setValidUntil("");
    setDiscount("");
    setNotes("");
    setFormError("");
    setShowNew(true);
  };

  /** Planned chart records of the chosen patient become candidate lines, prices prefilled. */
  const loadPlanned = async (patientId: string) => {
    setNewPatient(patientId);
    setLines([]);
    if (!patientId) return;
    setPlannedLoading(true);
    try {
      const res = await apiFetch(`/api/patient-work/chart/${patientId}`);
      if (!res.ok) throw new Error(await readError(res, "Could not load the patient's planned work."));
      const json = await res.json().catch(() => ({}));
      const planned = (json.history ?? []).filter(
        (r: any) => r.record_type === "treatment_plan",
      );
      setLines(
        planned.map((r: any) => ({
          key: `r${r.id}`,
          record_id: Number(r.id),
          procedure_name: r.title,
          tooth_number: r.tooth_number ?? "",
          description: "",
          amount:
            r.quoted_amount != null ? String(Number(r.quoted_amount)) : "",
          included: true,
        })),
      );
    } catch (e: any) {
      toast.error(e.message ?? "Could not load the patient's planned work.");
    } finally {
      setPlannedLoading(false);
    }
  };

  const addFreeLine = () =>
    setLines((p) => [
      ...p,
      {
        key: `f${Date.now()}`,
        procedure_name: "",
        tooth_number: "",
        description: "",
        amount: "",
        included: true,
      },
    ]);
  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const included = lines.filter((l) => l.included);
  const draftLines = included.reduce(
    (s, l) => s + (parseFloat(l.amount) || 0),
    0,
  );
  const draftDiscount = parseFloat(discount) || 0;
  const draftTotal = draftLines - draftDiscount;

  const saveNew = async () => {
    setFormError("");
    if (!newPatient) return setFormError("Choose a patient.");
    if (included.length === 0) return setFormError("Add at least one line.");
    for (const l of included) {
      if (!l.procedure_name)
        return setFormError("Every line needs a procedure.");
      const amount = parseFloat(l.amount);
      if (Number.isNaN(amount) || amount < 0)
        return setFormError("Every line needs a price (0 or more).");
    }
    if (draftDiscount < 0 || draftDiscount > draftLines)
      return setFormError("The discount cannot exceed the lines.");
    setSaving(true);
    try {
      const res = await apiFetch("/api/quotes", {
        method: "POST",
        body: JSON.stringify({
          patient_id: Number(newPatient),
          valid_until: validUntil || undefined,
          quoted_discount: draftDiscount || undefined,
          notes: notes || undefined,
          items: included.map((l) => ({
            record_id: l.record_id,
            procedure_name: l.procedure_name,
            tooth_number: l.tooth_number || undefined,
            description: l.description || undefined,
            amount: parseFloat(l.amount),
          })),
        }),
      });
      if (!res.ok)
        throw new Error(await readError(res, "Could not create the quote."));
      toast.success("Quote prepared as a draft.");
      setShowNew(false);
      await load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          An estimate for planned work. Not an invoice: quotes never count as
          income or outstanding.
        </p>
        {canWrite && (
          <Button onClick={openNew}>
            <FaPlus className="mr-2" /> New quote
          </Button>
        )}
      </div>

      <ListToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Search by patient name…",
        }}
        shown={filtered.length}
        total={quotes.length}
        unitLabel="quotes"
        hasActiveFilters={status !== "All" || !!search}
        onClear={() => {
          setStatus("All");
          setSearch("");
        }}
        clearLabel="Clear"
        groups={[
          {
            key: "status",
            variant: "segmented",
            value: status,
            onChange: setStatus,
            options: [
              { value: "All", label: "All", count: counts.All },
              {
                value: "draft",
                label: "Draft",
                count: counts.draft,
                dot: "bg-ink-400",
              },
              {
                value: "sent",
                label: "Sent",
                count: counts.sent,
                dot: "bg-blue-500",
              },
              {
                value: "accepted",
                label: "Accepted",
                count: counts.accepted,
                dot: "bg-emerald-500",
              },
              {
                value: "declined",
                label: "Declined",
                count: counts.declined,
                dot: "bg-red-500",
              },
              {
                value: "expired",
                label: "Expired",
                count: counts.expired,
                dot: "bg-amber-500",
              },
            ],
          },
        ]}
      />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={FaFileInvoiceDollar}
            title="No quotes"
            description="Prepare a quote from a patient's planned work."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                {[
                  "Patient",
                  "Quote",
                  "Date",
                  "Valid until",
                  "Lines",
                  "Estimate",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((q) => (
                <tr key={q.id} className="hover:bg-ink-50/60">
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {q.patient.users.first_name} {q.patient.users.last_name}
                  </td>
                  <td className="px-4 py-3 text-ink-600 whitespace-nowrap">
                    {q.quote_number}{" "}
                    <span className="text-ink-400">v{q.version}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-600 whitespace-nowrap">
                    {formatDateBeirut(q.created_at)}
                  </td>
                  <td className="px-4 py-3 text-ink-600 whitespace-nowrap">
                    {q.valid_until ? formatDateBeirut(q.valid_until) : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-600">{q.items.length}</td>
                  <td className="px-4 py-3 font-semibold text-ink-900">
                    {money(q.quoted_total)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_STYLE[q.status]}`}
                    >
                      {q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelected(q)}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Quote detail ─────────────────────────────────────────────────── */}
      {selected && (
        <Modal
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          title={`Quote ${selected.quote_number} v${selected.version} — ${selected.patient.users.first_name} ${selected.patient.users.last_name}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            <div className="flex flex-wrap gap-4 text-sm text-ink-600">
              <span>
                <strong>Status:</strong>{" "}
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLE[selected.status]}`}
                >
                  {selected.status}
                </span>
              </span>
              <span>
                <strong>Prepared:</strong>{" "}
                {formatDateBeirut(selected.created_at)}
              </span>
              {selected.valid_until && (
                <span>
                  <strong>Valid until:</strong>{" "}
                  {formatDateBeirut(selected.valid_until)}
                </span>
              )}
              {selected.accepted_at && (
                <span>
                  <strong>Accepted:</strong>{" "}
                  {formatDateBeirut(selected.accepted_at)}
                </span>
              )}
            </div>

            <table className="w-full text-sm border border-ink-200 rounded-lg overflow-hidden">
              <thead className="bg-ink-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-ink-600">
                    Procedure
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-ink-600">
                    Estimate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {selected.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2 text-ink-800">
                      {i.procedure_name}
                      {i.tooth_number && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-blue-50 text-brand text-xs font-semibold">
                          Tooth {i.tooth_number}
                        </span>
                      )}
                      {i.record_id && (
                        <span className="ml-2 text-xs text-ink-400">
                          from chart
                        </span>
                      )}
                      {i.description && (
                        <div className="text-xs text-ink-500">
                          {i.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-800">
                      {money(i.quoted_amount)}
                    </td>
                  </tr>
                ))}
                {selected.quoted_discount > 0 && (
                  <>
                    <tr className="text-ink-600">
                      <td className="px-3 py-2">Lines</td>
                      <td className="px-3 py-2 text-right">
                        {money(selected.quoted_total + selected.quoted_discount)}
                      </td>
                    </tr>
                    <tr className="text-ink-600">
                      <td className="px-3 py-2">Discount</td>
                      <td className="px-3 py-2 text-right">
                        −{money(selected.quoted_discount)}
                      </td>
                    </tr>
                  </>
                )}
                <tr className="bg-ink-50 font-semibold">
                  <td className="px-3 py-2">Total estimate</td>
                  <td className="px-3 py-2 text-right">
                    {money(selected.quoted_total)}
                  </td>
                </tr>
              </tbody>
            </table>

            {selected.notes && (
              <p className="text-sm text-ink-600 bg-ink-50 rounded-lg px-3 py-2 italic">
                {selected.notes}
              </p>
            )}

            {selected.invoices.length > 0 && (
              <div className="text-sm text-ink-600">
                <strong>Billed from this quote:</strong>{" "}
                {selected.invoices.map((inv) => (
                  <span key={inv.id} className="mr-3">
                    {inv.invoice_number} {money(inv.total_amount)}{" "}
                    <span className="capitalize text-ink-400">
                      ({inv.status})
                    </span>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => print(selected)}
              >
                <FaPrint className="mr-2" /> Print
              </Button>
              {canWrite && selected.status === "draft" && (
                <>
                  <Button
                    size="sm"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      act(selected, "send", "Marked as given to the patient.")
                    }
                  >
                    <FaPaperPlane className="mr-2" /> Mark as sent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      act(
                        selected,
                        "accept",
                        "Quote accepted; prices written to the chart.",
                      )
                    }
                  >
                    <FaCheck className="mr-2" /> Accept now
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId === selected.id}
                    onClick={() => remove(selected)}
                  >
                    <FaTrash className="mr-2" /> Delete draft
                  </Button>
                </>
              )}
              {canWrite && selected.status === "sent" && (
                <>
                  <Button
                    size="sm"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      act(
                        selected,
                        "accept",
                        "Quote accepted; prices written to the chart.",
                      )
                    }
                  >
                    <FaCheck className="mr-2" /> Patient accepted
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      act(selected, "decline", "Quote marked as declined.")
                    }
                  >
                    <FaTimes className="mr-2" /> Patient declined
                  </Button>
                </>
              )}
              {canWrite &&
                selected.status === "accepted" &&
                !selected.invoices.some((inv) => inv.status !== "cancelled") && (
                  <Button
                    size="sm"
                    disabled={busyId === selected.id}
                    onClick={() => issueInvoice(selected)}
                    title="Bill the whole quote now (treatment paid up front); otherwise completing the work from the chart bills it"
                  >
                    <FaFileInvoiceDollar className="mr-2" /> Issue invoice
                  </Button>
                )}
              {canWrite && selected.status !== "draft" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === selected.id}
                  onClick={() =>
                    act(
                      selected,
                      "revise",
                      `Version ${selected.version + 1} started as a draft.`,
                    )
                  }
                >
                  <FaCopy className="mr-2" /> New version
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── New quote ────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        title="New quote"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <FormField label="Patient *">
            <select
              value={newPatient}
              onChange={(e) => loadPlanned(e.target.value)}
              className={inputClass}
            >
              <option value="">Select a patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </FormField>

          {plannedLoading ? (
            <LoadingSpinner />
          ) : (
            newPatient && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-ink-800">Lines</h4>
                  <Button size="sm" variant="outline" onClick={addFreeLine}>
                    <FaPlus className="mr-2" /> Add a line
                  </Button>
                </div>
                {lines.length === 0 && (
                  <p className="text-sm text-ink-500">
                    No planned work on this patient&apos;s chart yet. Add lines
                    by hand, or plan the work on the chart first.
                  </p>
                )}
                {lines.map((l) => (
                  <div
                    key={l.key}
                    className={`grid grid-cols-12 gap-2 items-center rounded-lg border px-2 py-2 ${l.included ? "border-ink-200" : "border-ink-100 opacity-60"}`}
                  >
                    <input
                      type="checkbox"
                      className="col-span-1 justify-self-center"
                      checked={l.included}
                      onChange={(e) =>
                        setLine(l.key, { included: e.target.checked })
                      }
                    />
                    {l.record_id ? (
                      <div className="col-span-5 text-sm text-ink-800">
                        {l.procedure_name}
                        {l.tooth_number && (
                          <span className="ml-2 text-xs text-ink-500">
                            tooth {l.tooth_number}
                          </span>
                        )}
                        <span className="ml-2 text-xs text-ink-400">
                          from chart
                        </span>
                      </div>
                    ) : (
                      <>
                        <select
                          className={`col-span-3 ${inputClass}`}
                          value={l.procedure_name}
                          onChange={(e) =>
                            setLine(l.key, { procedure_name: e.target.value })
                          }
                        >
                          <option value="">Procedure</option>
                          {procedures.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                        <input
                          className={`col-span-2 ${inputClass}`}
                          placeholder="Tooth"
                          value={l.tooth_number}
                          onChange={(e) =>
                            setLine(l.key, { tooth_number: e.target.value })
                          }
                        />
                      </>
                    )}
                    <input
                      className={`col-span-3 ${inputClass}`}
                      placeholder="Note (optional)"
                      value={l.description}
                      onChange={(e) =>
                        setLine(l.key, { description: e.target.value })
                      }
                    />
                    <input
                      className={`col-span-3 ${inputClass}`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={l.amount}
                      onChange={(e) =>
                        setLine(l.key, { amount: e.target.value })
                      }
                    />
                  </div>
                ))}
                {lines.length > 0 && (
                  <div className="text-right text-sm text-ink-700 space-y-0.5">
                    {draftDiscount > 0 && (
                      <>
                        <p>Lines: {money(draftLines)}</p>
                        <p>Discount: −{money(draftDiscount)}</p>
                      </>
                    )}
                    <p className="font-semibold text-ink-900">
                      Total estimate: {money(draftTotal)}
                    </p>
                  </div>
                )}
              </div>
            )
          )}

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Valid until">
              <input
                type="date"
                value={validUntil}
                min={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date())}
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
            <FormField label="Notes shown on the quote">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </FormField>
          </div>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowNew(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={saveNew} disabled={saving}>
              {saving ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
