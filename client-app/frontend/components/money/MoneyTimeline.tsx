"use client";

import { useMemo } from "react";
import { FaFileInvoiceDollar, FaHistory, FaMoneyBillWave, FaTooth, FaUndo } from "react-icons/fa";
import { cn, formatDateBeirut } from "@/lib/utils";
import { money, type Plan } from "@/components/billing/quote-doc";
import { MONEY_WORD } from "@/components/billing/money-words";
import type { Invoice } from "@/components/billing/invoice-doc";
import type { ReceiptRow } from "@/components/billing/receipt-doc";
import { SectionCard } from "./SectionCard";

/*
 * The story, newest first: bills issued, cancelled and replaced, money in
 * and out with where it went, the plan agreed, work done. Read-only; it is
 * what answers "what happened with this patient" without opening anything.
 */

type Event = {
  key: string;
  at: string | null;
  kind: "invoice" | "payment" | "refund" | "clinical";
  title: string;
  detail: string;
  amount: string;
};

const STYLE: Record<Event["kind"], { dot: string; icon: React.ReactNode; amount: string }> = {
  invoice: { dot: "bg-brand-500", icon: <FaFileInvoiceDollar />, amount: "text-ink-900" },
  payment: { dot: "bg-leaf-500", icon: <FaMoneyBillWave />, amount: "text-leaf-700" },
  refund: { dot: "bg-brick-500", icon: <FaUndo />, amount: "text-brick-700" },
  clinical: { dot: "bg-clay-400", icon: <FaTooth />, amount: "text-ink-600" },
};

const method = (m: string) => m.replace(/_/g, " ");

export function MoneyTimeline({
  invoices,
  receipts,
  plan,
}: {
  invoices: Invoice[];
  receipts: ReceiptRow[];
  plan: Plan | null;
}) {
  const events = useMemo<Event[]>(() => {
    const out: Event[] = [];

    for (const inv of invoices) {
      out.push({
        key: `inv-${inv.id}`,
        at: inv.procedure_date,
        kind: "invoice",
        title: `${inv.invoice_number} issued`,
        detail: [
          inv.replaces ? `${MONEY_WORD.replaces} ${inv.replaces.invoice_number}` : null,
          `${inv.line_items.length} ${inv.line_items.length === 1 ? "item" : "items"} · due ${formatDateBeirut(inv.due_date)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: `$${money(inv.total_amount)}`,
      });
      if (inv.status === "cancelled") {
        out.push({
          key: `inv-${inv.id}-cancelled`,
          at: inv.cancelled_at ?? inv.procedure_date,
          kind: "invoice",
          title: `${inv.invoice_number} cancelled`,
          detail: inv.replaced_by
            ? `${MONEY_WORD.replacedBy} ${inv.replaced_by.invoice_number}`
            : (inv.cancel_reason ?? ""),
          amount: `−$${money(inv.total_amount)}`,
        });
      }
    }

    for (const r of receipts) {
      const went = r.allocations.map(
        (a) => `$${money(a.amount)} → ${a.invoice?.invoice_number ?? "a bill"}`,
      );
      const held = r.figures?.held ?? 0;
      if (r.kind === "payment" && held > 0) went.push(`$${money(held)} ${MONEY_WORD.prepaid.toLowerCase()}`);
      out.push({
        key: `rec-${r.id}`,
        at: r.payment_date,
        kind: r.kind === "refund" ? "refund" : "payment",
        title:
          r.kind === "refund"
            ? `${MONEY_WORD.refund} ${r.document_number} (${method(r.payment_method)})`
            : `Payment ${r.document_number} received (${method(r.payment_method)})`,
        detail:
          r.kind === "refund"
            ? [r.reason, r.source ? `out of ${r.source.document_number}` : null].filter(Boolean).join(" · ")
            : [went.length > 0 ? went.join(" · ") : `${MONEY_WORD.prepaid}, now used`, r.notes]
                .filter(Boolean)
                .join(" · "),
        amount: `${r.kind === "refund" ? "−" : "+"}$${money(r.amount)}`,
      });
    }

    if (plan?.accepted_at) {
      out.push({
        key: "plan-agreed",
        at: plan.accepted_at,
        kind: "clinical",
        title: "Plan agreed by the patient",
        detail: plan.agreement_stale
          ? "The plan has changed since; give them the new quote"
          : `${MONEY_WORD.quoteTotal} $${money(plan.totals.plan)}`,
        amount: "",
      });
    }

    for (const l of plan?.lines ?? []) {
      if (l.state === "planned") continue;
      out.push({
        key: `line-${l.record_id}`,
        at: l.date,
        kind: "clinical",
        title: l.procedure,
        detail: [l.tooth ? `Tooth ${l.tooth}` : null, l.invoice_number ? `on ${l.invoice_number}` : "not billed yet"]
          .filter(Boolean)
          .join(" · "),
        amount: l.amount === null ? "Unpriced" : `$${money(l.amount)}`,
      });
    }

    const time = (d: string | null) => (d ? new Date(d).getTime() : -Infinity);
    return out.sort((a, b) => time(b.at) - time(a.at));
  }, [invoices, receipts, plan]);

  return (
    <SectionCard
      id="history"
      title="History"
      icon={<FaHistory />}
      meta={events.length === 0 ? "Nothing has happened yet" : `${events.length} events, newest first`}
    >
      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">
          Nothing has happened on this patient yet.
        </div>
      ) : (
        <ol className="relative ms-2 space-y-3 border-s border-ink-200 ps-6">
          {events.map((e) => {
            const style = STYLE[e.kind];
            return (
              <li key={e.key} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    "absolute -start-[31px] top-3 grid size-4 place-items-center rounded-full text-[8px] text-white ring-4 ring-card",
                    style.dot,
                  )}
                >
                  {style.icon}
                </span>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl bg-ink-50/70 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-900">{e.title}</div>
                    <div className="text-xs text-ink-500">{e.detail}</div>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className={cn("text-sm font-bold tabular-nums", style.amount)}>{e.amount}</span>
                    <span className="w-[86px] shrink-0 text-end text-xs tabular-nums text-ink-500">
                      {e.at ? formatDateBeirut(e.at) : "No date"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
