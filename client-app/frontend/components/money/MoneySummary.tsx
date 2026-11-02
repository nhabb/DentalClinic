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
 * Paid, each stage carrying what has not moved on from it as a badge. Every
 * figure is the server's; this only says them.
 */

function FlowStage({
  stage,
  value,
  accent,
  leak,
}: {
  stage: string;
  value: string;
  accent: "ink" | "brand" | "leaf";
  leak?: React.ReactNode;
}) {
  const rail = { ink: "bg-ink-300", brand: "bg-brand-500", leaf: "bg-leaf-500" }[accent];
  const text = { ink: "text-ink-900", brand: "text-brand-800", leaf: "text-leaf-800" }[accent];
  return (
    <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-ink-200/70 bg-ink-50/60 px-4 py-3">
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1", rail)} />
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{stage}</div>
      <div className={cn("mt-0.5 text-xl font-bold tabular-nums", text)}>{value}</div>
      <div className="mt-1 min-h-[1.25rem]">{leak}</div>
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
    parts.push(
      `Owes $${money(figures.due_now)} on ${owed.length} ${owed.length === 1 ? "bill" : "bills"}` +
        (late.length > 0
          ? `, ${late.length === 1 ? "one" : late.length} overdue by ${Math.max(...late.map(daysOverdue))} days`
          : ""),
    );
  } else if (figures.billed > 0) {
    parts.push("Every bill is paid");
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
          leak={
            <span className="flex flex-wrap gap-1">
              {figures.due_now > 0 ? (
                <Badge tone="brick">
                  ${money(figures.due_now)} {MONEY_WORD.unpaid.toLowerCase()}
                </Badge>
              ) : (
                <Badge tone="leaf">Nothing {MONEY_WORD.unpaid.toLowerCase()}</Badge>
              )}
              {prepaid > 0 && (
                <Badge tone="brand">
                  ${money(prepaid)} {MONEY_WORD.prepaid.toLowerCase()}
                </Badge>
              )}
            </span>
          }
        />
      </div>
    </section>
  );
}
