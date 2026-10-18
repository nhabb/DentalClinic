"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FaTooth } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { MONEY_WORD } from "@/components/billing/money-words";
import { money } from "./quote-doc";
import type { PatientOption } from "./NewInvoiceModal";

/*
 * Every patient's treatment plan, in one list.
 *
 * This is the register — who has a plan, what it comes to, how much of it has
 * been billed — and nothing else. A plan is chart work, so it is built on the
 * chart; and one patient's plan is read in their money file alongside their
 * bills and their payments, which is where giving it to them and recording
 * that they agreed now live. This list used to carry a third copy of both,
 * with its own wording for the same totals.
 */

/** One row of the clinic-wide list. */
type PlanRow = {
  id: number | string;
  quote_number: string;
  accepted_at: string | null;
  updated_at: string;
  patient_id: number | string;
  patient: {
    id: number | string;
    users: { first_name: string; last_name: string };
  } | null;
  plan_total: number;
  line_count: number;
};

const nameOf = (r: PlanRow) =>
  r.patient ? `${r.patient.users.first_name} ${r.patient.users.last_name}` : "—";

export function QuotesPanel({
  onOpenPatient,
}: {
  /** Open that patient's money file, landing on their plan. */
  onOpenPatient: (patient: PatientOption) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/quotes");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setRows(Array.isArray(json) ? json : (json.data ?? []));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        nameOf(r).toLowerCase().includes(q) ||
        r.quote_number.toLowerCase().includes(q),
    );
  }, [rows, search]);

  if (loading) return <LoadingSpinner label="Loading treatment plans" />;

  return (
    <div className="space-y-4">
      <ListToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Search by patient or plan number",
        }}
        shown={filtered.length}
        total={rows.length}
        unitLabel="plans"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={FaTooth}
          title="No treatment plans yet"
          description="A plan is built on a patient's dental chart: plan the work, price it there, and it appears here."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-start text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-start">Patient</th>
                <th className="px-4 py-3 text-start">Plan</th>
                <th className="px-4 py-3 text-start">Items</th>
                <th className="px-4 py-3 text-end">{MONEY_WORD.planTotal}</th>
                <th className="px-4 py-3 text-start">Agreed</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr
                  key={String(r.id)}
                  tabIndex={0}
                  aria-label={`Open the money file of ${nameOf(r)}`}
                  onClick={() =>
                    onOpenPatient({ id: Number(r.patient_id), label: nameOf(r) })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenPatient({ id: Number(r.patient_id), label: nameOf(r) });
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-brand-50/60 focus-visible:bg-brand-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{nameOf(r)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {r.quote_number}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.line_count}</td>
                  <td className="px-4 py-3 text-end font-medium text-gray-900 tabular-nums">
                    ${money(r.plan_total)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.accepted_at ? formatDateBeirut(r.accepted_at) : "—"}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onOpenPatient({ id: Number(r.patient_id), label: nameOf(r) })
                        }
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Plan the work and price it on the chart"
                        onClick={() =>
                          router.push(`/admin/patients?patient=${r.patient_id}&tab=chart`)
                        }
                      >
                        Chart
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
  );
}
