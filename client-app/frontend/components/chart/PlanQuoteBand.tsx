"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FaCheck, FaClipboardList, FaLock, FaPaperPlane, FaPrint, FaWallet } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { money, Plan, printPlan, readError } from "@/components/billing/quote-doc";
import { Badge } from "@/components/ui/Badge";
import {
  MONEY_WORD,
  PLAN_STATE_LABEL,
  PLAN_STATE_TONE,
} from "@/components/billing/money-words";

/*
 * The plan is the quote.
 *
 * The chart rows above this band ARE the plan: there is no second list and
 * nothing to keep in step. This band only adds up what is there and gives it
 * to the patient.
 *
 * It is never frozen. A plan can be added to, repriced or trimmed at any point
 * — including after the patient agreed and after part of it has been billed,
 * which is the normal way treatment goes. The only thing that locks is a line
 * that is on an invoice, and that line says so itself.
 *
 * "Give to patient" stamps a dated record of exactly what they were handed,
 * because the living plan cannot also be the record of what was promised.
 */

interface PlanQuoteBandProps {
  /** patient_profiles.id */
  patientId: number;
  /** The plan as the chart fetched it; it travels with the chart. */
  plan: Plan | null;
  /** `billing:create`: give it to the patient, or record their agreement. */
  canConfirm: boolean;
  /** `billing:read`: show the way out to this patient’s money file. */
  canSeeMoney?: boolean;
  /** Re-read the chart after an action that changed the plan. */
  onChanged: () => void;
  patientName?: string;
}

export function PlanQuoteBand({
  patientId,
  plan: incoming,
  canConfirm,
  canSeeMoney = false,
  onChanged,
  patientName,
}: PlanQuoteBandProps) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(incoming);
  const [busy, setBusy] = useState(false);
  const [showSends, setShowSends] = useState(false);

  useEffect(() => setPlan(incoming), [incoming]);

  const act = useCallback(
    async (path: string, done: string) => {
      if (!plan?.quote_id) return;
      setBusy(true);
      try {
        const res = await apiFetch(`/api/quotes/${plan.quote_id}/${path}`, {
          method: "POST",
        });
        if (!res.ok) throw new Error(await readError(res, "That did not work."));
        setPlan(await res.json());
        toast.success(done);
        onChanged();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [plan?.quote_id, onChanged],
  );

  if (!plan || plan.lines.length === 0) return null;

  const { totals, counts } = plan;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
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
            {counts.planned} planned · {counts.done} done · {counts.billed} billed
            {counts.paid > 0 && <span className="text-leaf-700"> · {counts.paid} paid</span>}
            {totals.unpriced_count > 0 && (
              <span className="ml-1 text-honey-700">
                · {totals.unpriced_count} not priced yet
              </span>
            )}
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-semibold text-gray-900">${money(totals.plan)}</p>
          <p className="text-[11px] text-gray-500">
            ${money(totals.billed_value)} {MONEY_WORD.billed.toLowerCase()} · ${money(totals.unbilled_value)} {MONEY_WORD.notYetBilled.toLowerCase()}
          </p>
        </div>
      </div>

      {/* The lines, exactly as the chart holds them. */}
      <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
        {plan.lines.map((l) => (
          <li
            key={String(l.record_id)}
            className="flex items-center justify-between gap-3 py-1.5 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              {l.tooth && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                  {l.tooth}
                </span>
              )}
              <span className="truncate text-gray-800">{l.procedure}</span>
              <Badge tone={PLAN_STATE_TONE[l.state]}>
                {PLAN_STATE_LABEL[l.state]}
              </Badge>
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-gray-700">
              {l.amount == null ? (
                <span className="text-honey-700">not priced</span>
              ) : (
                <span className="font-medium">${money(l.amount)}</span>
              )}
              {l.locked && (
                <FaLock
                  className="text-[10px] text-gray-400"
                  title={
                    l.invoice_number
                      ? `Billed on ${l.invoice_number}`
                      : "Billed"
                  }
                />
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* The plan is editable to the end of treatment, so an agreement can
          outlive the plan it was given for. Saying so is the whole point:
          "Agreed 17 Oct" on a plan that grew since is a false comfort. */}
      {plan.agreement_stale && (
        <p className="mt-3 rounded-xl bg-honey-50 px-3 py-2 text-xs font-medium text-honey-800 ring-1 ring-inset ring-honey-200">
          The plan has changed since the patient agreed to it. Give them the new
          plan and record that they agreed again.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
        {canConfirm && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => act("send", "Given to the patient; what they were handed is recorded.")}
          >
            <FaPaperPlane className="mr-1.5" /> Give to patient
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => printPlan(plan, patientName)}
          disabled={busy}
        >
          <FaPrint className="mr-1.5" /> Print
        </Button>
        {canConfirm && (!plan.accepted_at || plan.agreement_stale) && (
          <Button
            size="sm"
            variant={plan.agreement_stale ? "accent" : "outline"}
            disabled={busy}
            onClick={() => act("accept", "Recorded that the patient agreed.")}
          >
            <FaCheck className="mr-1.5" />{" "}
            {plan.accepted_at ? "Agree again" : "Patient agreed"}
          </Button>
        )}

        {canSeeMoney && (
          <Button
            size="sm"
            variant="ghost"
            className="ms-auto"
            title="Every bill, every payment and the plan behind them"
            onClick={() => router.push(`/admin/billing?patient=${patientId}`)}
          >
            <FaWallet className="me-1.5" /> Money file
          </Button>
        )}

        {plan.sends.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSends((v) => !v)}
            className="text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            {showSends ? "Hide" : "Sent"} history ({plan.sends.length})
          </button>
        )}
      </div>

      {/* Normally invisible. It exists for the day a patient says "you told me
          1,400" and the plan has moved on since. */}
      {showSends && (
        <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-600">
          {plan.sends.map((s) => (
            <li key={String(s.id)} className="flex justify-between gap-3">
              <span>
                {formatDateBeirut(s.created_at)}
                {s.sender && ` — ${s.sender.first_name} ${s.sender.last_name}`}
              </span>
              <span className="font-medium">${money(s.quoted_total)}</span>
            </li>
          ))}
        </ul>
      )}
      {/* patientId is part of the public shape; the plan arrives with the chart. */}
      <span className="hidden" data-patient={patientId} />
    </div>
  );
}
