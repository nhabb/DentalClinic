"use client";

import { FaChevronRight } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { money } from "@/components/billing/quote-doc";
import { MONEY_WORD } from "@/components/billing/money-words";
import { daysOverdue, isLive, type Invoice } from "@/components/billing/invoice-doc";
import type { MoneyFigures, PlanFigures } from "./useMoneyFile";

/*
 * Where this patient stands, in one sentence and one chain.
 *
 * The sentence is what a person reads first: "Owes $70 on 1 bill, one overdue
 * by 18 days · $200 prepaid". The chain under it is Plan total → Billed →
 * Paid, each stage carrying what has not moved on from it as a badge, and
 * Prepaid beside the chain, dashed, because money paid ahead is not a stage
 * the work goes through. Every figure is the server's; this only says them.
 */

function FlowStage({
  stage,
  value,
  accent,
  detail,
  leak,
  outside = false,
}: {
  stage: string;
  value: string;
  accent: "ink" | "brand" | "leaf";
  /** One plain line under the figure saying what it is of. */
  detail?: React.ReactNode;
  leak?: React.ReactNode;
  /** Not a stage of the chain: drawn dashed, set a little apart. */
  outside?: boolean;
}) {
  const rail = { ink: "bg-ink-300", brand: "bg-brand-500", leaf: "bg-leaf-500" }[accent];
  const text = { ink: "text-ink-900", brand: "text-brand-800", leaf: "text-leaf-800" }[accent];
  return (
    <div
      className={cn(
        "relative min-w-0 flex-1 overflow-hidden rounded-2xl border px-4 py-3",
        outside ? "border-dashed border-brand-200 bg-brand-50/30 sm:ms-2" : "border-ink-200/70 bg-ink-50/60",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1", rail)} />
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{stage}</div>
      <div className={cn("mt-0.5 text-xl font-bold tabular-nums", text)}>{value}</div>
      {detail && <div className="mt-0.5 text-xs text-ink-600">{detail}</div>}
      <div className="mt-1.5 min-h-[1.25rem]">{leak}</div>
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
      <div className={cn("h-full rounded-full", pct >= 100 ? "bg-leaf-500" : "bg-leaf-400")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function FlowArrow() {
  return (
    <FaChevronRight
      aria-hidden
      className="hidden shrink-0 self-center text-ink-300 rtl:-scale-x-100 sm:block"
    />
  );
}

/** The one-sentence summary, from the same figures as the chain. */
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
  invoices,
}: {
  figures: MoneyFigures;
  planFigures: PlanFigures | null;
  invoices: Invoice[];
}) {
  const prepaid = figures.credit_held;
  const billCount = invoices.filter(isLive).length;
  return (
    <section className="space-y-3">
      <p className="text-base font-semibold text-ink-900">
        {summarySentence(figures, planFigures, invoices)}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
        <FlowStage
          stage={MONEY_WORD.planTotal}
          value={`$${money(planFigures?.plan_value ?? 0)}`}
          accent="ink"
          leak={
            planFigures && planFigures.unpriced_lines > 0 ? (
              <Badge tone="honey">{planFigures.unpriced_lines} not priced</Badge>
            ) : null
          }
        />
        <FlowArrow />
        <FlowStage
          stage={MONEY_WORD.billed}
          value={`$${money(figures.billed)}`}
          accent="brand"
          detail={
            figures.billed > 0
              ? `on ${billCount} ${billCount === 1 ? "bill" : "bills"}`
              : "no bill issued yet"
          }
          leak={
            planFigures && planFigures.unbilled_value > 0 ? (
              <Badge tone="clay">
                ${money(planFigures.unbilled_value)} {MONEY_WORD.notYetBilled.toLowerCase()}
              </Badge>
            ) : null
          }
        />
        <FlowArrow />
        <FlowStage
          stage={MONEY_WORD.paid}
          value={`$${money(figures.applied)}`}
          accent="leaf"
          detail={
            figures.billed > 0 ? (
              <>
                of the ${money(figures.billed)} billed
                {prepaid > 0 && ` · $${money(figures.received)} received in all`}
                <PaidBar paid={figures.applied} billed={figures.billed} />
              </>
            ) : (
              "nothing to pay yet"
            )
          }
          leak={
            <span className="flex flex-wrap gap-1">
              {figures.due_now > 0 ? (
                <Badge tone="brick">
                  ${money(figures.due_now)} {MONEY_WORD.unpaid.toLowerCase()}
                </Badge>
              ) : (
                <Badge tone="leaf">Nothing {MONEY_WORD.unpaid.toLowerCase()}</Badge>
              )}
            </span>
          }
        />
        <FlowStage
          stage={MONEY_WORD.prepaid}
          value={`$${money(prepaid)}`}
          accent="brand"
          outside
          detail={
            prepaid > 0
              ? "received ahead, on no bill yet; it pays their next bill as it is issued"
              : "nothing paid ahead"
          }
          leak={
            prepaid > 0 && figures.due_now > 0 ? (
              <Badge tone="honey">while ${money(figures.due_now)} is {MONEY_WORD.unpaid.toLowerCase()}</Badge>
            ) : null
          }
        />
      </div>
    </section>
  );
}
