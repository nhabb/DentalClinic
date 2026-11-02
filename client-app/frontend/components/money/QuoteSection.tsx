"use client";

import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FaCheck,
  FaClipboardList,
  FaLock,
  FaPaperPlane,
  FaPrint,
  FaTooth,
} from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { cn, formatDateBeirut } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { money, printPlan, readError, type Plan, type PlanLine } from "@/components/billing/quote-doc";
import { MONEY_WORD, PLAN_STATE_LABEL, PLAN_STATE_TONE } from "@/components/billing/money-words";
import { ReissueBillModal, type Reissue } from "@/components/quotes/ReissueBillModal";
import { SectionCard } from "./SectionCard";

/*
 * Plan and quote: the plan the chart drew up, priced here.
 *
 * The chart records which work is planned or done on which tooth and carries
 * no amount. This is where each line gets its price, where the plan is given
 * to the patient and where their agreement is recorded.
 *
 * Pricing is optimistic: the row updates at once, the save lands behind it,
 * nothing is disabled, Enter moves to the next price box. A line on a bill
 * keeps a price box too: a new price reissues that bill with it, after a
 * confirm that shows what moves.
 */

type Props = {
  patient: { id: number; label: string };
  plan: Plan | null;
  /** Change the plan in place (a price typed); the reload confirms it. */
  setPlan: (update: (plan: Plan) => Plan) => void;
  /** Re-read the whole file after an act. */
  reload: (silent?: boolean) => Promise<void>;
  /** Price saves in flight, shared with the file so a reload cannot undo one. */
  inFlight: MutableRefObject<number>;
};

/** The plan with one line's price changed and the line-only totals recomputed. */
const withAmount = (p: Plan, recordId: string, amount: number | null): Plan => {
  const lines = p.lines.map((l) => (String(l.record_id) === recordId ? { ...l, amount } : l));
  const priced = lines.filter((l) => l.amount != null);
  return {
    ...p,
    lines,
    totals: {
      ...p.totals,
      plan: priced.reduce((s, l) => s + (l.amount ?? 0), 0),
      unbilled_value: priced.filter((l) => !l.locked).reduce((s, l) => s + (l.amount ?? 0), 0),
      unpriced_count: lines.length - priced.length,
    },
  };
};

export function QuoteSection({ patient, plan, setPlan, reload, inFlight }: Props) {
  const router = useRouter();
  const { can } = usePermissions();
  const canPrice = can("billing:create");
  const canReplace = canPrice && can("billing:edit");

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<string | null>(null);
  const [showSends, setShowSends] = useState(false);
  const [reissue, setReissue] = useState<Reissue | null>(null);
  const [lockedNonce, setLockedNonce] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  /**
   * The order the lines are shown in, fixed the first time they are seen:
   * unpriced first. A list that re-sorts itself as each price lands moves
   * the next row out from under the cursor.
   */
  const orderRef = useRef<string[] | null>(null);
  const lines = useMemo(() => {
    const all = plan?.lines ?? [];
    if (!orderRef.current && all.length > 0) {
      orderRef.current = [
        ...all.filter((l) => l.amount == null),
        ...all.filter((l) => l.amount != null),
      ].map((l) => String(l.record_id));
    }
    const rank = new Map((orderRef.current ?? []).map((id, i) => [id, i]));
    const at = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
    return [...all].sort((a, b) => at(String(a.record_id)) - at(String(b.record_id)));
  }, [plan]);

  const act = async (path: string, init: RequestInit, done: string, fallback: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(path, init);
      if (!res.ok) {
        toast.error(await readError(res, fallback));
        return false;
      }
      await reload(true);
      toast.success(done);
      return true;
    } catch {
      toast.error(fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const priceLine = async (line: PlanLine, raw: string) => {
    if (!plan?.quote_id) return;
    if (raw.trim() === "") return;
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a price of 0 or more.");
      return;
    }
    if (line.amount != null && Math.abs(line.amount - amount) < 0.005) return;
    const key = String(line.record_id);
    const before = line.amount;
    const quoteId = plan.quote_id;

    setPlan((p) => withAmount(p, key, amount));
    setSaving((s) => new Set(s).add(key));
    inFlight.current += 1;
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}/lines/${line.record_id}/price`, {
        method: "PATCH",
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Could not price that line."));
        setPlan((p) => withAmount(p, key, before));
      }
    } catch {
      toast.error("Could not reach the server; that price was not saved.");
      setPlan((p) => withAmount(p, key, before));
    } finally {
      inFlight.current -= 1;
      setSaving((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
      if (inFlight.current === 0) await reload(true);
    }
  };

  const focusNextPrice = (from: HTMLInputElement) => {
    const inputs = Array.from(
      listRef.current?.querySelectorAll<HTMLInputElement>("input[data-price]") ?? [],
    );
    const next = inputs[inputs.indexOf(from) + 1];
    from.blur();
    if (next) {
      next.focus();
      next.select();
    }
  };

  const saveNotes = async () => {
    if (!plan?.quote_id || notes === null || (plan.notes ?? "") === notes.trim()) return;
    await act(
      `/api/quotes/${plan.quote_id}/notes`,
      { method: "PATCH", body: JSON.stringify({ notes: notes.trim() }) },
      "Note saved.",
      "Could not save the note.",
    );
  };

  const meta = plan
    ? [
        plan.quote_number,
        `${plan.counts.planned} planned · ${plan.counts.done} done · ${plan.counts.billed} on a bill`,
        plan.accepted_at
          ? `Agreed ${formatDateBeirut(plan.accepted_at)}${plan.agreement_stale ? " · plan changed since" : ""}`
          : "Not agreed yet",
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  const acts =
    plan && lines.length > 0 ? (
      <>
        {canPrice && plan.quote_id && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void act(
                `/api/quotes/${plan.quote_id}/send`,
                { method: "POST" },
                "Given to the patient; what they were handed is recorded.",
                "That did not work.",
              )
            }
          >
            <FaPaperPlane /> Give to patient
          </Button>
        )}
        {canPrice && plan.quote_id && (!plan.accepted_at || plan.agreement_stale) && (
          <Button
            size="sm"
            variant={plan.agreement_stale ? "accent" : "outline"}
            disabled={busy}
            onClick={() =>
              void act(
                `/api/quotes/${plan.quote_id}/accept`,
                { method: "POST" },
                "Recorded that the patient agreed.",
                "That did not work.",
              )
            }
          >
            <FaCheck /> {plan.accepted_at ? "Agree again" : "Patient agreed"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => printPlan(plan, patient.label)} disabled={busy}>
          <FaPrint /> Print
        </Button>
      </>
    ) : undefined;

  return (
    <>
      <SectionCard id="quote" title="Plan and quote" icon={<FaClipboardList />} meta={meta} acts={acts}>
        {!plan || lines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">
            Nothing is planned for this patient yet. Plan the work on their chart; it appears
            here to be priced.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/admin/patients?patient=${patient.id}&tab=chart`)}
              >
                <FaTooth /> Open the chart
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-ink-200/70 bg-ink-50/60 px-4 py-3 text-center">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  {MONEY_WORD.quoteTotal}
                </div>
                <div className="mt-0.5 text-xl font-bold tabular-nums text-ink-900">
                  ${money(plan.totals.plan)}
                </div>
                {plan.totals.unpriced_count > 0 && (
                  <div className="text-xs text-honey-800">{plan.totals.unpriced_count} not priced</div>
                )}
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  {MONEY_WORD.billed}
                </div>
                <div className="mt-0.5 text-xl font-bold tabular-nums text-brand-800">
                  ${money(plan.totals.billed_value)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  {MONEY_WORD.notYetBilled}
                </div>
                <div className="mt-0.5 text-xl font-bold tabular-nums text-clay-800">
                  ${money(plan.totals.unbilled_value)}
                </div>
              </div>
            </div>

            {plan.agreement_stale && (
              <p className="rounded-xl bg-honey-50 px-3 py-2 text-xs font-medium text-honey-800 ring-1 ring-inset ring-honey-200">
                The plan has changed since the patient agreed to it. Give them the new quote and
                record that they agreed again.
              </p>
            )}

            <ul ref={listRef} className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200">
              {lines.map((l) => {
                const key = String(l.record_id);
                return (
                  <li
                    key={key}
                    className={cn(
                      "flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5",
                      l.amount == null && "bg-honey-50/40",
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-[11px] font-bold tabular-nums text-ink-600">
                      {l.tooth ?? "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-900">{l.procedure}</div>
                      <div className="text-xs text-ink-500">
                        {l.date ? formatDateBeirut(l.date) : "No date"}
                        {l.invoice_number && ` · ${l.invoice_number}`}
                        {l.amount == null && !l.locked && " · not priced yet"}
                      </div>
                    </div>
                    <Badge tone={PLAN_STATE_TONE[l.state]}>{PLAN_STATE_LABEL[l.state]}</Badge>
                    {l.locked && canReplace && l.invoice_id ? (
                      <span className="inline-flex items-center gap-1">
                        <FaLock
                          className="text-[10px] text-ink-400"
                          title={`On ${l.invoice_number ?? "a bill"} — a new price reissues that bill`}
                        />
                        <span className="text-ink-400">$</span>
                        <input
                          key={`${key}-${l.amount ?? ""}-${lockedNonce}`}
                          type="number"
                          min="0"
                          step="0.01"
                          data-price
                          defaultValue={l.amount ?? ""}
                          onBlur={(e) => {
                            const amount = parseFloat(e.target.value);
                            if (!Number.isFinite(amount) || amount < 0) return;
                            if (l.amount != null && Math.abs(l.amount - amount) < 0.005) return;
                            setReissue({ line: l, amount });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              focusNextPrice(e.currentTarget);
                            }
                          }}
                          aria-label={`Price for ${l.procedure}, on ${l.invoice_number ?? "a bill"}`}
                          className="w-24 rounded-lg border border-honey-200 bg-honey-50/40 px-2 py-1 text-end text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/30"
                        />
                      </span>
                    ) : l.locked ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-20 text-end text-sm font-semibold tabular-nums text-ink-900">
                          {l.amount == null ? "—" : `$${money(l.amount)}`}
                        </span>
                        <FaLock
                          className="text-[10px] text-ink-400"
                          title={`On ${l.invoice_number ?? "a bill"}: its price belongs to that bill`}
                        />
                      </span>
                    ) : canPrice ? (
                      <span className="inline-flex items-center gap-1">
                        <span
                          className={cn("w-3 text-[10px]", saving.has(key) ? "text-ink-400" : "text-leaf-600")}
                          aria-live="polite"
                          title={saving.has(key) ? "Saving" : l.amount != null ? "Saved" : undefined}
                        >
                          {saving.has(key) ? "…" : l.amount != null ? "✓" : ""}
                        </span>
                        <span className="text-ink-400">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          data-price
                          defaultValue={l.amount ?? ""}
                          placeholder="0.00"
                          onBlur={(e) => void priceLine(l, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              focusNextPrice(e.currentTarget);
                            }
                          }}
                          aria-label={`Price for ${l.procedure}`}
                          className="w-24 rounded-lg border border-ink-200 px-2 py-1 text-end text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/30"
                        />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "w-20 text-end text-sm font-semibold tabular-nums",
                          l.amount == null ? "text-honey-700" : "text-ink-900",
                        )}
                      >
                        {l.amount == null ? "Unpriced" : `$${money(l.amount)}`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            <FormField label="Note on the quote">
              <input
                type="text"
                value={notes ?? plan.notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => void saveNotes()}
                disabled={!canPrice || busy}
                placeholder="e.g. Patient prefers to stage the upper arch"
                className={inputClass}
              />
            </FormField>

            {plan.sends.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowSends((v) => !v)}
                  className="text-xs font-medium text-ink-500 hover:text-ink-900"
                >
                  {showSends ? "Hide" : "Show"} what was given to the patient ({plan.sends.length})
                </button>
                {showSends && (
                  <ul className="mt-2 space-y-1 rounded-xl border border-ink-200 px-3 py-2 text-xs text-ink-600">
                    {plan.sends.map((s) => (
                      <li key={String(s.id)} className="flex justify-between gap-3">
                        <span>
                          {formatDateBeirut(s.created_at)}
                          {s.sender && ` — ${s.sender.first_name} ${s.sender.last_name}`}
                        </span>
                        <span className="font-medium tabular-nums">${money(s.quoted_total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <ReissueBillModal
        reissue={reissue}
        onClose={() => {
          setReissue(null);
          setLockedNonce((n) => n + 1);
        }}
        onDone={({ invoice, cancelled, paidFromPrepaid }) => {
          setReissue(null);
          const moved = paidFromPrepaid > 0 ? ` $${money(paidFromPrepaid)} moved onto it;` : "";
          const owed =
            invoice.remaining_amount > 0
              ? ` $${money(invoice.remaining_amount)} ${MONEY_WORD.unpaid.toLowerCase()}.`
              : " Paid in full.";
          toast.success(
            `${cancelled.invoice_number} cancelled, ${invoice.invoice_number} issued at $${money(invoice.total_amount)}.${moved}${owed}`,
          );
          void reload(true);
        }}
      />
    </>
  );
}
