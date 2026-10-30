"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FaCheck,
  FaExchangeAlt,
  FaFileInvoiceDollar,
  FaLock,
  FaPaperPlane,
  FaPrint,
} from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { cn, formatDateBeirut } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/Drawer";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FormField, inputClass } from "@/components/ui/FormField";
import { money, printPlan, readError, type Plan, type PlanLine } from "@/components/billing/quote-doc";
import type { PatientOption } from "@/components/billing/NewInvoiceModal";
import {
  MONEY_WORD,
  PLAN_STATE_LABEL,
  PLAN_STATE_TONE,
} from "@/components/billing/money-words";

/*
 * One patient's quote: the plan the chart drew up, priced here.
 *
 * The chart records which work is planned or done on which tooth and carries
 * no amount. This is where each line gets its price, where the plan is given
 * to the patient and where their agreement is recorded. Nothing is created
 * here: the lines come from the chart, and a bill is made on the Billing page.
 *
 * A line already on a bill is frozen (the lock), because a bill's lines must
 * keep saying what the receipt and the books say; the way to change such a
 * price is to replace that bill, and the lock leads there.
 */

type Props = {
  patient: PatientOption;
  isOpen: boolean;
  onClose: () => void;
  /** Something about the quote changed (a price, a send, an agreement). */
  onChanged?: () => void;
};

const num = (v: unknown) => Number(v ?? 0);

/* eslint-disable @typescript-eslint/no-explicit-any */
const normalizePlan = (p: any): Plan => ({
  ...p,
  lines: (p?.lines ?? []).map((l: any) => ({
    ...l,
    amount: l.amount == null ? null : Number(l.amount),
  })),
  totals: {
    plan: num(p?.totals?.plan),
    planned: num(p?.totals?.planned),
    done_unbilled: num(p?.totals?.done_unbilled),
    billed_value: num(p?.totals?.billed_value),
    unbilled_value: num(p?.totals?.unbilled_value),
    unpriced_count: Number(p?.totals?.unpriced_count ?? 0),
  },
  counts: p?.counts ?? { planned: 0, done: 0, billed: 0, part_paid: 0, paid: 0 },
  settlement: p?.settlement ?? { invoice_count: 0, invoiced_total: 0, received: 0, due: 0 },
  sends: p?.sends ?? [],
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export function QuoteDrawer({ patient, isOpen, onClose, onChanged }: Props) {
  const router = useRouter();
  const { can } = usePermissions();
  const canPrice = can("billing:create");
  // Replacing a bill issues one and cancels one, so it needs both.
  const canReplace = canPrice && can("billing:edit");

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** Lines whose price is on its way to the server. */
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [showSends, setShowSends] = useState(false);

  /**
   * The order the lines are shown in, fixed when the drawer opens: unpriced
   * first, because pricing is what this page is for. Fixed, because a list
   * that re-sorts itself as each price lands moves the next row out from
   * under the cursor.
   */
  const orderRef = useRef<string[]>([]);
  /** How many price saves are in flight; the plan is re-read when it reaches 0. */
  const inFlight = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await apiFetch(`/api/quotes/patients/${patient.id}`);
        if (!res.ok) {
          toast.error(await readError(res, "Could not load this patient's quote."));
          return;
        }
        const fresh = normalizePlan(await res.json());
        // A silent re-read must not undo a price typed while it was in the air.
        if (silent && inFlight.current > 0) return;
        setPlan(fresh);
        if (!silent) {
          setNotes(fresh.notes ?? "");
          const all = fresh.lines;
          orderRef.current = [
            ...all.filter((l) => l.amount == null),
            ...all.filter((l) => l.amount != null),
          ].map((l) => String(l.record_id));
        }
      } catch {
        if (!silent) toast.error("Could not reach the server.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [patient.id],
  );

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  /** Every act answers the whole plan, so one setter serves them all. */
  const act = async (path: string, init: RequestInit, done: string, fallback: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(path, init);
      if (!res.ok) {
        toast.error(await readError(res, fallback));
        return false;
      }
      setPlan(normalizePlan(await res.json()));
      toast.success(done);
      onChanged?.();
      return true;
    } catch {
      toast.error(fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * The plan with one line's price changed, and the three totals that follow
   * from the lines alone recomputed. The server's other figures (billed
   * value, settlement) do not move when a price does; they are re-read once
   * the saves have landed.
   */
  const withAmount = (p: Plan, recordId: string, amount: number | null): Plan => {
    const lines = p.lines.map((l) =>
      String(l.record_id) === recordId ? { ...l, amount } : l,
    );
    const priced = lines.filter((l) => l.amount != null);
    return {
      ...p,
      lines,
      totals: {
        ...p.totals,
        plan: priced.reduce((s, l) => s + (l.amount ?? 0), 0),
        unbilled_value: priced
          .filter((l) => !l.locked)
          .reduce((s, l) => s + (l.amount ?? 0), 0),
        unpriced_count: lines.length - priced.length,
      },
    };
  };

  /**
   * Price one line. The row shows the price at once and nothing is disabled:
   * the desk types down the list and the saves land behind it, several at a
   * time against a database on the other side of the world. A refusal (the
   * server refuses a line that is on a bill) puts the old price back and
   * says why. When the last save has landed the plan is re-read silently, so
   * the figures that only the server knows catch up.
   */
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

    setPlan((p) => (p ? withAmount(p, key, amount) : p));
    setSaving((s) => new Set(s).add(key));
    inFlight.current += 1;
    try {
      const res = await apiFetch(`/api/quotes/${quoteId}/lines/${line.record_id}/price`, {
        method: "PATCH",
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Could not price that line."));
        setPlan((p) => (p ? withAmount(p, key, before) : p));
      }
    } catch {
      toast.error("Could not reach the server; that price was not saved.");
      setPlan((p) => (p ? withAmount(p, key, before) : p));
    } finally {
      inFlight.current -= 1;
      setSaving((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
      if (inFlight.current === 0) {
        await load(true);
        onChanged?.();
      }
    }
  };

  /** Enter: on to the next price box, so a plan is priced without the mouse. */
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
    if (!plan?.quote_id || (plan.notes ?? "") === notes.trim()) return;
    await act(
      `/api/quotes/${plan.quote_id}/notes`,
      { method: "PATCH", body: JSON.stringify({ notes: notes.trim() }) },
      "Note saved.",
      "Could not save the note.",
    );
  };

  // In the order fixed when the drawer opened (unpriced first); a line that
  // appeared since goes at the end.
  const lines = useMemo(() => {
    const all = plan?.lines ?? [];
    const rank = new Map(orderRef.current.map((id, i) => [id, i]));
    const at = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
    return [...all].sort((a, b) => at(String(a.record_id)) - at(String(b.record_id)));
  }, [plan]);

  const header = plan
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

  const footer =
    plan && lines.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        {canPrice && plan.quote_id && (
          <Button
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
        <Button variant="outline" onClick={() => printPlan(plan, patient.label)} disabled={busy}>
          <FaPrint /> Print
        </Button>
        <Button
          variant="ghost"
          className="ms-auto"
          title="Issue a bill for the work that is done or in progress"
          onClick={() => router.push(`/admin/billing?patient=${patient.id}`)}
        >
          <FaFileInvoiceDollar /> Go to billing
        </Button>
      </div>
    ) : undefined;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`${MONEY_WORD.quote} — ${patient.label}`}
      description={header}
      footer={footer}
      maxWidth="max-w-2xl"
    >
      {loading && !plan ? (
        <LoadingSpinner label="Loading the quote" />
      ) : !plan || lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">
          Nothing is planned for this patient yet. Plan the work on their chart; it
          appears here to be priced.
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/admin/patients?patient=${patient.id}&tab=chart`)}
            >
              Open the chart
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* The figures: what the quote comes to, and how much of it has
              turned into bills. Chart-side figures, never money figures. */}
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-ink-200/70 bg-ink-50/60 px-4 py-3 text-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                {MONEY_WORD.quoteTotal}
              </div>
              <div className="mt-0.5 text-xl font-bold tabular-nums text-ink-900">
                ${money(plan.totals.plan)}
              </div>
              {plan.totals.unpriced_count > 0 && (
                <div className="text-xs text-honey-800">
                  {plan.totals.unpriced_count} not priced
                </div>
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
              The plan has changed since the patient agreed to it. Give them the
              new quote and record that they agreed again.
            </p>
          )}

          {/* The lines. An amount is typed straight into the row; a frozen
              line shows the price its bill froze, with the way to change it. */}
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
                  {l.locked ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-20 text-end text-sm font-semibold tabular-nums text-ink-900">
                        {l.amount == null ? "—" : `$${money(l.amount)}`}
                      </span>
                      {canReplace && l.invoice_id ? (
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/admin/billing?patient=${patient.id}&replace=${l.invoice_id}`,
                            )
                          }
                          className="press inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-ink-500 hover:bg-honey-50 hover:text-ink-900"
                          title={`On ${l.invoice_number ?? "a bill"} — its price belongs to that bill. Replace the bill to change it.`}
                        >
                          <FaLock className="text-[10px]" /> <FaExchangeAlt className="text-[10px]" />
                        </button>
                      ) : (
                        <FaLock
                          className="text-[10px] text-ink-400"
                          title={`On ${l.invoice_number ?? "a bill"}: its price belongs to that bill`}
                        />
                      )}
                    </span>
                  ) : canPrice ? (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={cn(
                          "w-3 text-[10px]",
                          saving.has(key) ? "text-ink-400" : "text-leaf-600",
                        )}
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
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void saveNotes()}
              disabled={!canPrice || busy}
              placeholder="e.g. Patient prefers to stage the upper arch"
              className={inputClass}
            />
          </FormField>

          {/* Normally invisible. It exists for the day a patient says "you
              told me 1,400" and the plan has moved on since. */}
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
    </Drawer>
  );
}
