"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { money, type Plan } from "@/components/billing/quote-doc";
import { formatDateBeirut } from "@/lib/utils";
import { MONEY_WORD } from "@/components/billing/money-words";
import { daysOverdue, isLive, type Invoice } from "@/components/billing/invoice-doc";
import type { MoneyFigures, PlanFigures } from "./useMoneyFile";

/*
 * Where this patient stands, in one sentence and four figures.
 *
 * The sentence is what a person reads first: "Billed $1,750.00, paid
 * $1,150.00, owes $600.00 on 1 bill · $200.00 prepaid". Under it, the three
 * figures the owner asked for and nothing else: Quote total (what the whole
 * plan comes to at the quote's prices, and whether the patient agreed), Total paid (every dollar
 * received, split into what is on bills and what is prepaid), Billed (with
 * how much of it is paid, as a bar, and what is still unpaid) and Not yet
 * billed (what of the plan has no bill). Every figure is the server's; this
 * only says them.
 */

function Figure({
  label,
  value,
  accent,
  detail,
  badges,
}: {
  label: string;
  value: string;
  accent: "ink" | "leaf" | "brand" | "clay";
  /** One plain line under the figure saying what it is made of. */
  detail?: React.ReactNode;
  badges?: React.ReactNode;
}) {
  const rail = { ink: "bg-ink-300", leaf: "bg-leaf-500", brand: "bg-brand-500", clay: "bg-clay-500" }[accent];
  const text = { ink: "text-ink-900", leaf: "text-leaf-800", brand: "text-brand-800", clay: "text-clay-800" }[accent];
  return (
    <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-ink-200/70 bg-ink-50/60 px-4 py-3">
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1", rail)} />
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className={cn("mt-0.5 text-xl font-bold tabular-nums", text)}>{value}</div>
      {detail && <div className="mt-0.5 text-xs text-ink-600">{detail}</div>}
      {badges && <div className="mt-1.5 flex flex-wrap gap-1">{badges}</div>}
    </div>
  );
}

/** How much of what was billed has been paid, as a bar the eye reads at once. */
function PaidBar({ paid, billed }: { paid: number; billed: number }) {
  if (billed <= 0) return null;
  const pct = Math.max(0, Math.min(100, Math.round((paid / billed) * 100)));
  return (
    <div
      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-200/70"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct}% of what was billed is paid`}
    >
      <div
        className={cn("h-full rounded-full", pct >= 100 ? "bg-leaf-500" : "bg-leaf-400")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** The one-sentence summary, from the same figures as the cards. */
export function summarySentence(
  figures: MoneyFigures,
  planFigures: PlanFigures | null,
  invoices: Invoice[],
): string {
  const owed = invoices.filter((i) => isLive(i) && i.remaining_amount > 0);
  const late = owed.filter((i) => daysOverdue(i) > 0);
  const parts: string[] = [];
  if (figures.due_now > 0) {
    // Billed, paid, owed: the three numbers a person wants, in that order,
    // so "owes" is never read without the two it comes from.
    parts.push(
      `${MONEY_WORD.billed} $${money(figures.billed)}, ${MONEY_WORD.paid.toLowerCase()} $${money(figures.applied)}, owes $${money(figures.due_now)} on ${owed.length} ${owed.length === 1 ? "bill" : "bills"}` +
        (late.length > 0
          ? `, ${late.length === 1 ? "one" : late.length} overdue by ${Math.max(...late.map(daysOverdue))} days`
          : ""),
    );
  } else if (figures.billed > 0) {
    parts.push(`${MONEY_WORD.billed} $${money(figures.billed)} and paid in full`);
  } else {
    parts.push("Nothing billed yet");
  }
  if (figures.credit_held > 0) parts.push(`$${money(figures.credit_held)} ${MONEY_WORD.prepaid.toLowerCase()}`);
  if (planFigures && planFigures.unbilled_value > 0) {
    parts.push(`$${money(planFigures.unbilled_value)} of the plan ${MONEY_WORD.notYetBilled.toLowerCase()}`);
  }
  return parts.join(" · ") + ".";
}

export function MoneySummary({
  figures,
  planFigures,
  plan,
  invoices,
}: {
  figures: MoneyFigures;
  planFigures: PlanFigures | null;
  /** The plan itself, for how many lines it has and whether the patient agreed. */
  plan: Plan | null;
  invoices: Invoice[];
}) {
  const prepaid = figures.credit_held;
  const billCount = invoices.filter(isLive).length;
  const unbilled = planFigures?.unbilled_value ?? 0;
  const planValue = planFigures?.plan_value ?? 0;

  const paidDetail =
    figures.received <= 0
      ? "nothing received yet"
      : prepaid > 0
        ? `$${money(figures.applied)} on bills · $${money(prepaid)} ${MONEY_WORD.prepaid.toLowerCase()}`
        : "all of it on bills";

  return (
    <section className="space-y-3">
      <p className="text-base font-semibold text-ink-900">
        {summarySentence(figures, planFigures, invoices)}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
        <Figure
          label={MONEY_WORD.quoteTotal}
          value={`$${money(planValue)}`}
          accent="ink"
          detail={
            plan && plan.lines.length > 0
              ? `${plan.lines.length} ${plan.lines.length === 1 ? "line" : "lines"} · ${
                  plan.accepted_at
                    ? `agreed ${formatDateBeirut(plan.accepted_at)}${plan.agreement_stale ? ", changed since" : ""}`
                    : "not agreed yet"
                }`
              : "nothing planned yet"
          }
          badges={
            planFigures && planFigures.unpriced_lines > 0 ? (
              <Badge tone="honey">{planFigures.unpriced_lines} not priced</Badge>
            ) : null
          }
        />
        <Figure
          label={`Total ${MONEY_WORD.paid.toLowerCase()}`}
          value={`$${money(figures.received)}`}
          accent="leaf"
          detail={paidDetail}
          badges={
            prepaid > 0 && figures.due_now > 0 ? (
              <Badge tone="honey">
                {MONEY_WORD.prepaid} while ${money(figures.due_now)} is {MONEY_WORD.unpaid.toLowerCase()}
              </Badge>
            ) : null
          }
        />
        <Figure
          label={MONEY_WORD.billed}
          value={`$${money(figures.billed)}`}
          accent="brand"
          detail={
            figures.billed > 0 ? (
              <>
                on {billCount} {billCount === 1 ? "bill" : "bills"} · ${money(figures.applied)}{" "}
                {MONEY_WORD.paid.toLowerCase()}
                <PaidBar paid={figures.applied} billed={figures.billed} />
              </>
            ) : (
              "no bill issued yet"
            )
          }
          badges={
            figures.billed > 0 ? (
              figures.due_now > 0 ? (
                <Badge tone="brick">
                  ${money(figures.due_now)} {MONEY_WORD.unpaid.toLowerCase()}
                </Badge>
              ) : (
                <Badge tone="leaf">Nothing {MONEY_WORD.unpaid.toLowerCase()}</Badge>
              )
            ) : null
          }
        />
        <Figure
          label={MONEY_WORD.notYetBilled}
          value={`$${money(unbilled)}`}
          accent="clay"
          detail={
            planValue > 0
              ? unbilled > 0
                ? `of the $${money(planValue)} plan`
                : `the whole $${money(planValue)} plan is billed`
              : "nothing planned yet"
          }
        />
      </div>
    </section>
  );
}
