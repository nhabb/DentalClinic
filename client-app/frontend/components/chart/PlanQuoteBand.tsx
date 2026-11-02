"use client";

import { useRouter } from "next/navigation";
import { FaClipboardList, FaFileInvoiceDollar } from "react-icons/fa";
import { formatDateBeirut } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/components/billing/quote-doc";
import { MONEY_WORD } from "@/components/billing/money-words";

/*
 * The plan strip on the chart: clinical only.
 *
 * The chart rows above this strip ARE the plan. This says how far it has got
 * (planned, done, on a bill), whether the patient agreed, and leads to the
 * Quote page — which is where the plan is priced, given to the patient and
 * agreed. No amount appears on the chart.
 */

interface PlanQuoteBandProps {
  /** patient_profiles.id */
  patientId: number;
  /** The plan as the chart fetched it; it travels with the chart. */
  plan: Plan | null;
}

export function PlanQuoteBand({ patientId, plan }: PlanQuoteBandProps) {
  const router = useRouter();

  if (!plan || plan.lines.length === 0) return null;

  const { counts, totals } = plan;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
          <FaClipboardList className="text-brand" />
          Treatment plan
          {plan.quote_number && (
            <span className="font-mono text-xs text-gray-500">{plan.quote_number}</span>
          )}
          {plan.accepted_at &&
            (plan.agreement_stale ? (
              <span className="rounded-full bg-honey-100 px-2 py-0.5 text-[11px] font-medium text-honey-800">
                Agreed {formatDateBeirut(plan.accepted_at)} · plan changed since
              </span>
            ) : (
              <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-[11px] font-medium text-leaf-700">
                Agreed {formatDateBeirut(plan.accepted_at)}
              </span>
            ))}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {counts.planned} planned · {counts.done} done · {counts.billed} on a bill
          {counts.paid > 0 && <span className="text-leaf-700"> · {counts.paid} paid</span>}
          {totals.unpriced_count > 0 && (
            <span className="ml-1 text-honey-700">
              · {totals.unpriced_count} not priced yet
            </span>
          )}
        </p>
      </div>

      <Button
        size="sm"
        variant="outline"
        title="Price the plan, give it to the patient, bill it and receive payments: one page"
        onClick={() => router.push(`/admin/billing/patient/${patientId}`)}
      >
        <FaFileInvoiceDollar className="me-1.5" /> {MONEY_WORD.quote} and money
      </Button>
    </div>
  );
}
