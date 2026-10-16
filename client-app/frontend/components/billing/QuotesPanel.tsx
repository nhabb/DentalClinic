"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FaCheck,
  FaCopy,
  FaFileInvoiceDollar,
  FaPaperPlane,
  FaPrint,
  FaTimes,
  FaTooth,
  FaTrash,
} from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ListToolbar } from "@/components/ui/ListToolbar";
import type { PatientOption } from "./NewInvoiceModal";
import {
  isBillable,
  money,
  normalizeQuote,
  printQuote,
  Quote,
  QUOTE_STATUS_STYLE,
  readError,
} from "./quote-doc";

/*
 * Every clinic's quotes, and the one place an estimate is created and decided.
 * A quote is never money: billing an accepted one happens on the billing page,
 * and the chart only shows which work is planned.
 */

export function QuotesPanel() {
  const router = useRouter();
  const { can } = usePermissions();
  const canCreate = can("billing:create");
  const canEdit = can("billing:edit");
  const canDelete = can("billing:delete");

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  /** Set when the chart linked here for one patient. */
  const [patientFilter, setPatientFilter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<Quote | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/quotes?limit=200");
      if (!res.ok) throw new Error();
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

  const loadPatients = useCallback(async () => {
    try {
      const res = await apiFetch("/api/patients");
      if (!res.ok) throw new Error();
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.data ?? []);
      setPatients(
        list.map((p: { id: number | string; users?: { first_name?: string; last_name?: string } }) => ({
          id: Number(p.id),
          label: `${p.users?.first_name ?? ""} ${p.users?.last_name ?? ""}`.trim(),
        })),
      );
    } catch {
      /* the builder's picker simply stays empty */
    }
  }, []);

  useEffect(() => {
    load();
    loadPatients();
  }, [load, loadPatients]);

  /** /admin/billing/quotes?patient=<id> (from the chart) shows that patient. */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("patient");
    if (!wanted) return;
    window.history.replaceState(null, "", "/admin/billing/quotes");
    setPatientFilter(Number(wanted));
  }, []);

  // ── Deciding a quote ───────────────────────────────────────────────────────

  const act = async (
    q: Quote,
    verb: "send" | "accept" | "decline" | "revise",
    done: string,
  ) => {
    setBusyId(q.id);
    try {
      const res = await apiFetch(`/api/quotes/${q.id}/${verb}`, { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, `Could not ${verb} the quote.`));
      toast.success(done);
      await load();
      setSelected(null);
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
      if (!res.ok) throw new Error(await readError(res, "Could not issue the invoice."));
      const invoice = await res.json();
      toast.success(`Invoice ${invoice.invoice_number} issued; take payment on the billing page.`);
      await load();
      setSelected(null);
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
      if (!res.ok) throw new Error(await readError(res, "Could not delete the quote."));
      toast.success("Draft deleted.");
      await load();
      setSelected(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  /** The actions a quote offers in its current state, used by the row and the detail. */
  const actionsFor = (q: Quote) => (
    <>
      {(canEdit || canDelete) && q.status === "draft" && (
        <>
          {canEdit && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === q.id}
                onClick={() => act(q, "send", "Marked as given to the patient.")}
              >
                <FaPaperPlane className="mr-1 text-xs" /> Sent
              </Button>
              <Button
                size="sm"
                disabled={busyId === q.id}
                onClick={() => act(q, "accept", "Accepted; prices written to the chart.")}
              >
                <FaCheck className="mr-1 text-xs" /> Accepted
              </Button>
            </>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={busyId === q.id}
              onClick={() => removeDraft(q)}
              title="Delete this draft"
              className="rounded-lg p-2 text-red-300 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <FaTrash className="text-xs" />
            </button>
          )}
        </>
      )}
      {canEdit && q.status === "sent" && (
        <>
          <Button
            size="sm"
            disabled={busyId === q.id}
            onClick={() => act(q, "accept", "Accepted; prices written to the chart.")}
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
      {canCreate && isBillable(q) && (
        <Button
          size="sm"
          disabled={busyId === q.id}
          onClick={() => issueInvoice(q)}
          title="Bill the whole plan now, for treatment paid up front"
        >
          Issue invoice
        </Button>
      )}
      {canCreate && q.status !== "draft" && (
        <Button
          size="sm"
          variant="outline"
          disabled={busyId === q.id}
          onClick={() => act(q, "revise", `Version ${q.version + 1} started.`)}
          title="Start a new version; the old one stays as the patient saw it"
        >
          <FaCopy className="mr-1 text-xs" /> New version
        </Button>
      )}
    </>
  );

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

  const nameOf = (q: Quote) =>
    `${q.patient.users.first_name} ${q.patient.users.last_name}`;

  const filtered = quotes.filter(
    (q) =>
      (status === "All" || q.status === status) &&
      // Set when the chart linked here for one patient.
      (patientFilter === null || q.patient.id === patientFilter) &&
      (!search || nameOf(q).toLowerCase().includes(search.toLowerCase())),
  );
  const filteredPatientName =
    patientFilter !== null ? (filtered[0] ? nameOf(filtered[0]) : "this patient") : null;

  const openChart = (q: Quote) =>
    router.push(`/admin/patients?patient=${q.patient.id}&tab=chart`);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-500">
          An estimate of planned work. A quote is never money: it counts as
          neither income nor outstanding. Each one is built from the plan on the
          patient&apos;s dental chart and follows it; billing happens on the
          billing page.
        </p>
        {patientFilter !== null && (
          <span className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm text-brand">
            Showing {filteredPatientName}
            <button
              type="button"
              onClick={() => setPatientFilter(null)}
              className="font-semibold hover:underline"
            >
              show all
            </button>
          </span>
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

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <EmptyState
            icon={FaFileInvoiceDollar}
            title="No quotes"
            description="Plan the work on a patient's dental chart, then price it here with New quote."
          />
        ) : (
          <div className="overflow-x-auto">
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
                      {nameOf(q)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink-600">
                      {q.quote_number}{" "}
                      <span className="text-ink-400">v{q.version}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-600">
                      {formatDateBeirut(q.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-600">
                      {q.valid_until ? formatDateBeirut(q.valid_until) : "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-600">{q.items.length}</td>
                    <td className="px-4 py-3 font-semibold text-ink-900">
                      ${money(q.quoted_total)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${QUOTE_STATUS_STYLE[q.status]}`}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {actionsFor(q)}
                        <Button size="sm" variant="outline" onClick={() => setSelected(q)}>
                          Open
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Quote detail: read it, print it, or go to the chart to act ──────── */}
      {selected && (
        <Modal
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          title={`Quote ${selected.quote_number} v${selected.version} — ${nameOf(selected)}`}
          maxWidth="max-w-2xl"
        >
          <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-4 text-sm text-ink-600">
              <span>
                <strong>Status:</strong>{" "}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${QUOTE_STATUS_STYLE[selected.status]}`}
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

            <table className="w-full overflow-hidden rounded-lg border border-ink-200 text-sm">
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
                        <span className="ml-2 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-brand">
                          Tooth {i.tooth_number}
                        </span>
                      )}
                      {i.description && (
                        <div className="text-xs text-ink-500">
                          {i.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-800">
                      ${money(i.quoted_amount)}
                    </td>
                  </tr>
                ))}
                {selected.quoted_discount > 0 && (
                  <>
                    <tr className="text-ink-600">
                      <td className="px-3 py-2">Lines</td>
                      <td className="px-3 py-2 text-right">
                        $
                        {money(
                          selected.quoted_total + selected.quoted_discount,
                        )}
                      </td>
                    </tr>
                    <tr className="text-ink-600">
                      <td className="px-3 py-2">Discount</td>
                      <td className="px-3 py-2 text-right">
                        −${money(selected.quoted_discount)}
                      </td>
                    </tr>
                  </>
                )}
                <tr className="bg-ink-50 font-semibold">
                  <td className="px-3 py-2">Total estimate</td>
                  <td className="px-3 py-2 text-right">
                    ${money(selected.quoted_total)}
                  </td>
                </tr>
              </tbody>
            </table>

            {selected.notes && (
              <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm italic text-ink-600">
                {selected.notes}
              </p>
            )}

            {selected.invoices.length > 0 && (
              <div className="text-sm text-ink-600">
                <strong>Billed from this quote:</strong>{" "}
                {selected.invoices.map((inv) => (
                  <span key={inv.id} className="mr-3">
                    {inv.invoice_number} ${money(inv.total_amount)}{" "}
                    <span className="capitalize text-ink-400">
                      ({inv.status})
                    </span>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 pt-4">
              <Button variant="outline" size="sm" onClick={() => printQuote(selected)}>
                <FaPrint className="mr-2" /> Print
              </Button>
              {actionsFor(selected)}
              <Button
                size="sm"
                variant="outline"
                onClick={() => openChart(selected)}
                className="ml-auto"
                title="See the planned work this prices"
              >
                <FaTooth className="mr-2" /> Open the chart
              </Button>
            </div>
          </div>
        </Modal>
      )}


    </div>
  );
}
