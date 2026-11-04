"use client";

import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FaCheck,
  FaClipboardList,
  FaLock,
  FaPaperPlane,
  FaPen,
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
import { ReissueBillModal, type PriceChange, type Reissue } from "@/components/quotes/ReissueBillModal";
import { SectionCard } from "./SectionCard";

/*
 * Plan and quote: the plan the chart drew up, priced here.
 *
 * The chart records which work is planned or done on which tooth and carries
 * no amount. This is where each line gets its price, where the plan is given
 * to the patient and where their agreement is recorded.
 *
 * Pricing is Edit → type → Save. Nothing is saved while typing: the desk
 * presses Edit prices, changes as many lines as it likes, Enter moving down
 * the boxes, and presses Save once. Unbilled lines are saved together; lines
 * on a bill are collected per bill and that bill is reissued once with all
 * of its new prices, after one confirm that shows what moves. It used to save
 * each box as it was left and open the reissue confirm for every billed
 * price, which made the desk wait on every line.
 */

type Props = {
  patient: { id: number; label: string };
  plan: Plan | null;
  /** Change the plan in place (a price saved); the reload confirms it. */
  setPlan: (update: (plan: Plan) => Plan) => void;
  /** Re-read the whole file after an act. */
  reload: (silent?: boolean) => Promise<void>;
  /** Price saves in flight, shared with the file so a reload cannot undo one. */
  inFlight: MutableRefObject<number>;
};

/** The plan with some lines' prices changed and the line-only totals recomputed. */
const withAmounts = (p: Plan, amounts: Map<string, number | null>): Plan => {
  const lines = p.lines.map((l) =>
    amounts.has(String(l.record_id)) ? { ...l, amount: amounts.get(String(l.record_id)) ?? null } : l,
  );
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

/** What a typed box means: unchanged, a new price, or nonsense. */
const readBox = (line: PlanLine, text: string | undefined): { amount: number } | "same" | "invalid" => {
  if (text === undefined || text.trim() === "") return "same";
  const amount = parseFloat(text);
  if (!Number.isFinite(amount) || amount < 0) return "invalid";
  if (line.amount != null && Math.abs(line.amount - amount) < 0.005) return "same";
  return { amount };
};

export function QuoteSection({ patient, plan, setPlan, reload, inFlight }: Props) {
  const router = useRouter();
  const { can } = usePermissions();
  const canPrice = can("billing:create");
  const canReplace = canPrice && can("billing:edit");

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  /** What is typed in each price box while editing, by record id. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [showSends, setShowSends] = useState(false);
  /** Bills waiting to be reissued with their new prices, one confirm each. */
  const [reissues, setReissues] = useState<Reissue[]>([]);
  const listRef = useRef<HTMLUListElement>(null);

  /**
   * The order the lines are shown in, fixed the first time they are seen:
   * unpriced first. A list that re-sorts itself as prices land moves the
   * next row out from under the cursor.
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

  const canEditLine = (l: PlanLine) => (l.locked ? canReplace && !!l.invoice_id : canPrice);

  /** The changes typed so far, read off the boxes. */
  const changes = useMemo(() => {
    const out: PriceChange[] = [];
    let invalid = 0;
    for (const l of lines) {
      if (!canEditLine(l)) continue;
      const read = readBox(l, drafts[String(l.record_id)]);
      if (read === "invalid") invalid += 1;
      else if (read !== "same") out.push({ line: l, amount: read.amount });
    }
    return { list: out, invalid };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, drafts, canPrice, canReplace]);

  const newQuoteTotal = useMemo(() => {
    const changed = new Map(changes.list.map((c) => [String(c.line.record_id), c.amount]));
    return lines.reduce((s, l) => {
      const amount = changed.get(String(l.record_id)) ?? l.amount;
      return s + (amount ?? 0);
    }, 0);
  }, [lines, changes]);

  const startEditing = () => {
    setDrafts({});
    setEditing(true);
  };

  const stopEditing = () => {
    setDrafts({});
    setEditing(false);
  };

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

  /**
   * Save every change at once. Unbilled lines are priced together, shown at
   * once and saved behind; billed lines are grouped per bill, and each bill
   * is then reissued through one confirm.
   */
  const save = async () => {
    if (!plan?.quote_id) return;
    if (changes.invalid > 0) {
      toast.error("Every price must be a number of 0 or more.");
      return;
    }
    if (changes.list.length === 0) {
      stopEditing();
      return;
    }
    const quoteId = plan.quote_id;
    const free = changes.list.filter((c) => !c.line.locked);
    const billed = changes.list.filter((c) => c.line.locked && c.line.invoice_id);

    setSaving(true);
    try {
      if (free.length > 0) {
        const before = new Map(free.map((c) => [String(c.line.record_id), c.line.amount]));
        setPlan((p) => withAmounts(p, new Map(free.map((c) => [String(c.line.record_id), c.amount]))));
        inFlight.current += 1;
        const failed = new Map<string, number | null>();
        try {
          await Promise.all(
            free.map(async (c) => {
              const key = String(c.line.record_id);
              try {
                const res = await apiFetch(`/api/quotes/${quoteId}/lines/${c.line.record_id}/price`, {
                  method: "PATCH",
                  body: JSON.stringify({ amount: c.amount }),
                });
                if (!res.ok) {
                  toast.error(await readError(res, `Could not price ${c.line.procedure}.`));
                  failed.set(key, before.get(key) ?? null);
                }
              } catch {
                toast.error(`Could not reach the server; ${c.line.procedure} was not priced.`);
                failed.set(key, before.get(key) ?? null);
              }
            }),
          );
        } finally {
          inFlight.current -= 1;
        }
        if (failed.size > 0) setPlan((p) => withAmounts(p, failed));
        // What landed is no longer a draft; what failed stays in its box.
        setDrafts((d) => {
          const next = { ...d };
          for (const c of free) if (!failed.has(String(c.line.record_id))) delete next[String(c.line.record_id)];
          return next;
        });
        if (failed.size === 0 && billed.length === 0) toast.success("Prices saved.");
        // A failed save stays in its box for the desk to retry: the editor
        // does not close over it.
        if (failed.size > 0 && billed.length === 0) {
          if (inFlight.current === 0) await reload(true);
          return;
        }
      }

      if (billed.length > 0) {
        const byBill = new Map<string, Reissue>();
        for (const c of billed) {
          const id = String(c.line.invoice_id);
          const group = byBill.get(id) ?? {
            invoiceId: c.line.invoice_id as number | string,
            invoiceNumber: c.line.invoice_number ?? null,
            changes: [],
          };
          group.changes.push(c);
          byBill.set(id, group);
        }
        setReissues([...byBill.values()]);
      } else {
        if (inFlight.current === 0) await reload(true);
        stopEditing();
      }
    } finally {
      setSaving(false);
    }
  };

  /** A bill was reissued: its lines are no longer drafts; on to the next bill, or done. */
  const reissued = (done: Reissue) => {
    setDrafts((d) => {
      const next = { ...d };
      for (const c of done.changes) delete next[String(c.line.record_id)];
      return next;
    });
    const rest = reissues.filter((r) => r !== done);
    setReissues(rest);
    if (rest.length === 0) {
      void reload(true);
      stopEditing();
    }
  };

  const focusNextPrice = (from: HTMLInputElement) => {
    const inputs = Array.from(
      listRef.current?.querySelectorAll<HTMLInputElement>("input[data-price]") ?? [],
    );
    const next = inputs[inputs.indexOf(from) + 1];
    if (next) {
      next.focus();
      next.select();
    } else {
      from.blur();
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
        {canPrice && plan.quote_id && !editing && (
          <Button size="sm" variant="outline" disabled={busy} onClick={startEditing}>
            <FaPen /> Edit prices
          </Button>
        )}
        {canPrice && plan.quote_id && (
          <Button
            size="sm"
            disabled={busy || editing}
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
            disabled={busy || editing}
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
        <Button
          size="sm"
          variant="ghost"
          onClick={() => printPlan(plan, patient.label)}
          disabled={busy || editing}
        >
          <FaPrint /> Print
        </Button>
      </>
    ) : undefined;

  const changedKeys = new Set(changes.list.map((c) => String(c.line.record_id)));

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

            {plan.agreement_stale && !editing && (
              <p className="rounded-xl bg-honey-50 px-3 py-2 text-xs font-medium text-honey-800 ring-1 ring-inset ring-honey-200">
                The plan has changed since the patient agreed to it. Give them the new quote and
                record that they agreed again.
              </p>
            )}

            {editing && (
              <p className="text-xs text-ink-500">
                Type the new prices, Enter moves to the next line, then press Save. A line on a
                bill (lock) is saved by reissuing that bill with its new prices, after a confirm.
              </p>
            )}

            <ul ref={listRef} className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200">
              {lines.map((l) => {
                const key = String(l.record_id);
                const changed = changedKeys.has(key);
                const invalid = editing && readBox(l, drafts[key]) === "invalid";
                return (
                  <li
                    key={key}
                    className={cn(
                      "flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5",
                      l.amount == null && !editing && "bg-honey-50/40",
                      changed && "bg-brand-50/40",
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
                        {changed && l.amount != null && ` · was $${money(l.amount)}`}
                      </div>
                    </div>
                    <Badge tone={PLAN_STATE_TONE[l.state]}>{PLAN_STATE_LABEL[l.state]}</Badge>
                    {editing && canEditLine(l) ? (
                      <span className="inline-flex items-center gap-1">
                        {l.locked && (
                          <FaLock
                            className="text-[10px] text-ink-400"
                            title={`On ${l.invoice_number ?? "a bill"} — a new price reissues that bill`}
                          />
                        )}
                        <span className="text-ink-400">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          data-price
                          value={drafts[key] ?? (l.amount ?? "")}
                          placeholder="0.00"
                          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              focusNextPrice(e.currentTarget);
                            }
                          }}
                          aria-label={`Price for ${l.procedure}${l.locked ? `, on ${l.invoice_number ?? "a bill"}` : ""}`}
                          className={cn(
                            "w-24 rounded-lg border px-2 py-1 text-end text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/30",
                            invalid
                              ? "border-red-300 bg-red-50"
                              : l.locked
                                ? "border-honey-200 bg-honey-50/40"
                                : "border-ink-200",
                          )}
                        />
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "w-20 text-end text-sm font-semibold tabular-nums",
                            l.amount == null ? "text-honey-700" : "text-ink-900",
                          )}
                        >
                          {l.amount == null ? "Unpriced" : `$${money(l.amount)}`}
                        </span>
                        {l.locked && (
                          <FaLock
                            className="text-[10px] text-ink-400"
                            title={`On ${l.invoice_number ?? "a bill"}: its price belongs to that bill`}
                          />
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {editing && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  {changes.list.length === 0 ? (
                    <span className="text-ink-600">No price changed yet.</span>
                  ) : (
                    <>
                      <span className="font-medium text-ink-900">
                        {changes.list.length} price{changes.list.length === 1 ? "" : "s"} changed
                      </span>
                      <span className="text-ink-600">
                        {" "}
                        · {MONEY_WORD.quoteTotal} ${money(plan.totals.plan)} → ${money(newQuoteTotal)}
                      </span>
                      {changes.list.some((c) => c.line.locked) && (
                        <span className="block text-xs text-ink-500">
                          {changes.list.filter((c) => c.line.locked).length} on a bill: that bill is
                          reissued with the new prices when you save.
                        </span>
                      )}
                    </>
                  )}
                  {changes.invalid > 0 && (
                    <span className="block text-xs text-red-600">
                      {changes.invalid} price{changes.invalid === 1 ? " is" : "s are"} not a number of 0 or more.
                    </span>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={stopEditing} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={saving || changes.invalid > 0}>
                  <FaCheck /> {saving ? "Saving…" : changes.list.length === 0 ? "Done" : "Save"}
                </Button>
              </div>
            )}

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
        reissue={reissues[0] ?? null}
        onClose={() => {
          // "Not now": the bill is not reissued; its new prices stay in the
          // boxes so the desk can save again or cancel the edit. The unbilled
          // prices already landed, so the plan is re-read once the queue is
          // empty: the agreement may have gone stale on them.
          const rest = reissues.slice(1);
          setReissues(rest);
          if (rest.length === 0) void reload(true);
        }}
        onDone={({ invoice, cancelled, paidFromPrepaid }) => {
          const moved = paidFromPrepaid > 0 ? ` $${money(paidFromPrepaid)} moved onto it;` : "";
          const owed =
            invoice.remaining_amount > 0
              ? ` $${money(invoice.remaining_amount)} ${MONEY_WORD.unpaid.toLowerCase()}.`
              : " Paid in full.";
          toast.success(
            `${cancelled.invoice_number} cancelled, ${invoice.invoice_number} issued at $${money(invoice.total_amount)}.${moved}${owed}`,
          );
          if (reissues[0]) reissued(reissues[0]);
        }}
      />
    </>
  );
}
