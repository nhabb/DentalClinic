"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FaFileInvoiceDollar, FaPrint, FaTooth } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ListToolbar } from "@/components/ui/ListToolbar";
import {
  money,
  normalizeQuote,
  printQuote,
  Quote,
  QUOTE_STATUS_STYLE,
} from "./quote-doc";

/*
 * Every clinic's quotes in one list. This screen only watches: quotes are
 * prepared, decided and billed on the patient's dental chart, which is the one
 * place a document is created. From here you read one, print it, or open the
 * chart it belongs to.
 */

export function QuotesPanel() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<Quote | null>(null);

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

  const nameOf = (q: Quote) =>
    `${q.patient.users.first_name} ${q.patient.users.last_name}`;

  const filtered = quotes.filter(
    (q) =>
      (status === "All" || q.status === status) &&
      (!search || nameOf(q).toLowerCase().includes(search.toLowerCase())),
  );

  const openChart = (q: Quote) =>
    router.push(`/admin/patients?patient=${q.patient.id}&tab=chart`);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-500">
        An estimate of planned work. A quote is never money: it counts as
        neither income nor outstanding. Quotes are prepared and decided on the
        patient&apos;s dental chart.
      </p>

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
            description="Open a patient's dental chart, plan the work, then quote it."
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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelected(q)}
                        >
                          Open
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openChart(q)}
                          title="Decide or bill it on the chart"
                        >
                          <FaTooth className="mr-1 text-xs" /> Chart
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

            <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => printQuote(selected)}
              >
                <FaPrint className="mr-2" /> Print
              </Button>
              <Button size="sm" onClick={() => openChart(selected)}>
                <FaTooth className="mr-2" /> Open the chart to decide or bill it
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
