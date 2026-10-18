"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { cn, formatDateBeirut } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Tabs } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { money, printPlan, readError, type Plan } from "./quote-doc";
import { PAYMENT_METHODS } from "./TakePaymentModal";
import {
  daysOverdue,
  isLive,
  normalizeInvoice,
  printInvoice,
  type Invoice,
} from "./invoice-doc";
import type { PatientOption } from "./NewInvoiceModal";
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  MONEY_WORD,
  PLAN_STATE_LABEL,
  PLAN_STATE_TONE,
  type InvoiceStatus,
} from "./money-words";
import {
  FaCheck,
  FaChevronRight,
  FaFileInvoiceDollar,
  FaMoneyBillWave,
  FaPaperPlane,
  FaPlus,
  FaPrint,
  FaRegClock,
  FaStream,
  FaTooth,
  FaUndo,
} from "react-icons/fa";

/*
 * One patient's money file — the only one.
 *
 * It used to be two dialogs that opened from the same row and listed the same
 * payments: a read-only history and an "account" that could move credit. They
 * read different endpoints for the same balance and called it "Due now" in one
 * and "Still owed" in the other, which is most of why the desk could not tell
 * whether the numbers disagreed or just the words did.
 *
 * So this is a drawer, not a dialog: the list behind it stays visible, and the
 * payment form, the bill builder and the password prompt stack over it as
 * proper centred dialogs instead of modal-over-modal.
 *
 * One read answers everything: `/billing/patients/:id/statement` composes the
 * plan and the ledger, so `/ledger` is not called by any screen any more —
 * `credit_balance` is `figures.credit_held` and `outstanding_balance` is
 * `figures.due_now`, and that duplication is where the two words came from.
 */

type Allocation = {
  id: number;
  amount: number;
  invoice: { id: number; invoice_number: string; status: string };
};

type LedgerPayment = {
  id: number;
  kind: "payment" | "refund";
  amount: number;
  payment_method: string;
  payment_date: string;
  notes: string | null;
  reason: string | null;
  /** On bills already. */
  applied: number;
  /** Still free to put on a bill, or to hand back. */
  unapplied: number;
  allocations: Allocation[];
};

/** The money side: sums of invoice and payment rows, from one definition. */
type Figures = {
  billed: number;
  received: number;
  applied: number;
  credit_held: number;
  due_now: number;
  overdue: number;
};

/** The chart side: what the work is worth. Never compared with the above. */
type PlanFigures = {
  plan_value: number;
  billed_value: number;
  unbilled_value: number;
  unpriced_lines: number;
};

type Statement = {
  /** The plan exactly as the server sent it, so it can be printed as-is. */
  plan: Plan;
  payments: LedgerPayment[];
  figures: Figures;
  plan_figures: PlanFigures;
};

const num = (v: unknown) => Number(v ?? 0);

/* eslint-disable @typescript-eslint/no-explicit-any */
const normalizeStatement = (s: any): Statement => ({
  plan: { ...(s?.plan ?? {}), lines: s?.plan?.lines ?? [] } as Plan,
  payments: (s?.ledger?.payments ?? []).map((p: any) => ({
    id: Number(p.id),
    kind: p.kind === "refund" ? "refund" : "payment",
    amount: num(p.amount),
    payment_method: p.payment_method ?? "cash",
    payment_date: p.payment_date ?? p.created_at,
    notes: p.notes ?? null,
    reason: p.reason ?? null,
    applied: num(p.applied),
    unapplied: num(p.unapplied),
    allocations: (p.allocations ?? []).map((a: any) => ({
      id: Number(a.id),
      amount: num(a.amount),
      invoice: {
        id: Number(a.invoice?.id),
        invoice_number: a.invoice?.invoice_number ?? "",
        status: a.invoice?.status ?? "open",
      },
    })),
  })),
  figures: {
    billed: num(s?.figures?.billed),
    received: num(s?.figures?.received),
    applied: num(s?.figures?.applied),
    credit_held: num(s?.figures?.credit_held),
    due_now: num(s?.figures?.due_now),
    overdue: num(s?.figures?.overdue),
  },
  plan_figures: {
    plan_value: num(s?.plan_figures?.plan_value),
    billed_value: num(s?.plan_figures?.billed_value),
    unbilled_value: num(s?.plan_figures?.unbilled_value),
    unpriced_lines: Number(s?.plan_figures?.unpriced_lines ?? 0),
  },
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Small shared pieces ──────────────────────────────────────────────────────

const method = (m: string) => m.replace(/_/g, " ");

/**
 * One stage of the chain Plan → Bill → Collect, with the money that has not
 * moved on from it hanging off it as a badge.
 *
 * Four peer numbers made the reader relate them for themselves; a chain says
 * where this patient actually stands, and each stage carries its own leak:
 * work nobody has billed, and bills nobody has paid.
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
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
        {stage}
      </div>
      <div className={cn("mt-0.5 text-xl font-bold tabular-nums", text)}>{value}</div>
      <div className="mt-1 min-h-[1.25rem]">{leak}</div>
    </div>
  );
}

/** The arrow between two stages. Mirrored in RTL, and never read aloud. */
function FlowArrow() {
  return (
    <FaChevronRight
      aria-hidden
      className="hidden shrink-0 self-center text-ink-300 rtl:-scale-x-100 sm:block"
    />
  );
}

function SectionEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">
      {children}
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

type Event = {
  key: string;
  at: string | null;
  kind: "invoice" | "payment" | "refund" | "clinical";
  title: string;
  detail: string;
  amount: string;
};

const EVENT_STYLE: Record<Event["kind"], { dot: string; icon: React.ReactNode; amount: string }> = {
  invoice: { dot: "bg-brand-500", icon: <FaFileInvoiceDollar />, amount: "text-ink-900" },
  payment: { dot: "bg-leaf-500", icon: <FaMoneyBillWave />, amount: "text-leaf-700" },
  refund: { dot: "bg-brick-500", icon: <FaUndo />, amount: "text-brick-700" },
  clinical: { dot: "bg-clay-400", icon: <FaTooth />, amount: "text-ink-600" },
};

function Timeline({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return <SectionEmpty>Nothing has happened on this patient yet.</SectionEmpty>;
  }
  return (
    <ol className="relative ms-2 space-y-3 border-s border-ink-200 ps-6">
      {events.map((e) => {
        const style = EVENT_STYLE[e.kind];
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
  );
}

// ── The drawer ───────────────────────────────────────────────────────────────

export type PatientDrawerTab = "timeline" | "invoices" | "payments" | "plan";

type Props = {
  patient: PatientOption;
  isOpen: boolean;
  onClose: () => void;
  /** Where to land. The plans list opens straight onto the plan. */
  initialTab?: PatientDrawerTab;
  /** Open one bill in the page's own invoice detail. */
  onViewInvoice?: (invoice: Invoice) => void;
  /** Hand a bill to the payment form, or `null` to take a deposit. */
  onTakePayment?: (invoice: Invoice | null) => void;
  /** Open the bill builder for this patient. */
  onNewBill?: () => void;
  /** Bumped by the page when money moved elsewhere, so this redraws with it. */
  refreshToken?: number;
  /** Money moved in here, so the page behind should refresh too. */
  onChanged?: () => void;
};

export function PatientDrawer({
  patient,
  isOpen,
  onClose,
  initialTab = "timeline",
  onViewInvoice,
  onTakePayment,
  onNewBill,
  refreshToken = 0,
  onChanged,
}: Props) {
  const { can } = usePermissions();
  const canTake = can("billing:create");
  const canMove = can("billing:edit");

  const [statement, setStatement] = useState<Statement | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<PatientDrawerTab>(initialTab);

  // Handing credit back needs a reason that lands in audit_logs; a browser
  // prompt is not where a record like that should come from.
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundMethod, setRefundMethod] = useState(PAYMENT_METHODS[0].value);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, iRes] = await Promise.all([
        apiFetch(`/api/billing/patients/${patient.id}/statement`),
        apiFetch(`/api/billing/invoices?patient_id=${patient.id}&limit=200`),
      ]);
      if (!sRes.ok) {
        toast.error(await readError(sRes, "Could not load this patient's money file."));
      } else {
        setStatement(normalizeStatement(await sRes.json()));
      }
      if (iRes.ok) {
        const json = await iRes.json();
        setInvoices((Array.isArray(json.data) ? json.data : []).map(normalizeInvoice));
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [patient.id]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load, refreshToken]);

  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab, patient.id]);

  /** Any call that moves money or the plan: reload here, and tell the page. */
  const act = async (path: string, init: RequestInit, success: string, fallback: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(path, init);
      if (!res.ok) {
        toast.error(await readError(res, fallback));
        return false;
      }
      await load();
      onChanged?.();
      toast.success(success);
      return true;
    } catch {
      toast.error("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Newest first. Bills, money and chart work read as one story. */
  const events = useMemo<Event[]>(() => {
    const out: Event[] = [];

    for (const inv of invoices) {
      out.push({
        key: `inv-${inv.id}`,
        at: inv.procedure_date,
        kind: "invoice",
        title: `${inv.invoice_number} issued`,
        detail:
          inv.status === "cancelled"
            ? `Cancelled${inv.cancel_reason ? ` — ${inv.cancel_reason}` : ""}`
            : `${inv.line_items.length} ${inv.line_items.length === 1 ? "item" : "items"} · due ${formatDateBeirut(inv.due_date)}`,
        amount: `$${money(inv.total_amount)}`,
      });
    }

    for (const p of statement?.payments ?? []) {
      const where =
        p.allocations.length > 0
          ? p.allocations.map((a) => a.invoice.invoice_number).join(", ")
          : `Held as ${MONEY_WORD.creditOnAccount.toLowerCase()}`;
      out.push({
        key: `pay-${p.id}`,
        at: p.payment_date,
        kind: p.kind === "refund" ? "refund" : "payment",
        title: p.kind === "refund" ? "Refund paid out" : `Payment received (${method(p.payment_method)})`,
        detail: p.reason ?? p.notes ?? where,
        amount: `${p.kind === "refund" ? "−" : "+"}$${money(p.amount)}`,
      });
    }

    for (const l of statement?.plan.lines ?? []) {
      if (l.state === "planned") continue; // not history yet; it lives on the plan tab
      out.push({
        key: `line-${l.record_id}`,
        at: l.date,
        kind: "clinical",
        title: l.procedure,
        detail: [
          l.tooth ? `Tooth ${l.tooth}` : null,
          l.invoice_number ? `on ${l.invoice_number}` : "not billed yet",
        ]
          .filter(Boolean)
          .join(" · "),
        amount: l.amount === null ? "Unpriced" : `$${money(l.amount)}`,
      });
    }

    const time = (d: string | null) => (d ? new Date(d).getTime() : -Infinity);
    return out.sort((a, b) => time(b.at) - time(a.at));
  }, [invoices, statement]);

  const figures = statement?.figures;
  const planFigures = statement?.plan_figures;
  const plan = statement?.plan;
  const planLines = plan?.lines ?? [];
  const payments = statement?.payments ?? [];
  const liveInvoices = invoices.filter(isLive);
  const credit = figures?.credit_held ?? 0;
  /** Bills still owed, from the list already loaded — not a second request. */
  const openBills = invoices.filter((i) => isLive(i) && i.remaining_amount > 0);
  /** The payment the credit would come out of: oldest money first. */
  const creditSource = [...payments]
    .reverse()
    .find((p) => p.kind === "payment" && p.unapplied > 0);

  // ── The acts ───────────────────────────────────────────────────────────────

  const applyCredit = (paymentId: number, invoice: Invoice, amount: number) =>
    act(
      `/api/billing/payments/${paymentId}/allocations`,
      { method: "POST", body: JSON.stringify({ invoice_id: invoice.id, amount }) },
      `Applied to ${invoice.invoice_number}.`,
      "That credit could not be applied.",
    );

  const unapply = (allocation: Allocation) =>
    act(
      `/api/billing/allocations/${allocation.id}`,
      { method: "DELETE" },
      `Taken back off ${allocation.invoice.invoice_number}.`,
      "That could not be undone.",
    );

  const handCreditBack = async () => {
    if (refundReason.trim().length < 3) {
      toast.error("Say why the credit is being handed back.");
      return;
    }
    const ok = await act(
      `/api/billing/patients/${patient.id}/credit-refunds`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: credit,
          payment_method: refundMethod,
          reason: refundReason.trim(),
        }),
      },
      "Credit handed back.",
      "The refund was refused.",
    );
    if (ok) {
      setRefundOpen(false);
      setRefundReason("");
    }
  };

  const planAct = (what: "send" | "accept", done: string) =>
    plan?.quote_id
      ? act(`/api/quotes/${plan.quote_id}/${what}`, { method: "POST" }, done, "That did not work.")
      : undefined;

  // ── Render ─────────────────────────────────────────────────────────────────

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      {/* The name is already the drawer's title, so this strip carries only
          what the title cannot: who they are at a glance, and the shape of
          their file. */}
      <Avatar name={patient.label} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          <span>
            {liveInvoices.length} {liveInvoices.length === 1 ? "bill" : "bills"}
          </span>
          <span aria-hidden>·</span>
          <span>
            {payments.length} {payments.length === 1 ? "payment" : "payments"}
          </span>
          {plan?.quote_number && (
            <>
              <span aria-hidden>·</span>
              <span>Plan {plan.quote_number}</span>
            </>
          )}
          {plan?.accepted_at && (
            <>
              <span aria-hidden>·</span>
              <span className={plan.agreement_stale ? "text-honey-800" : undefined}>
                Agreed {formatDateBeirut(plan.accepted_at)}
                {plan.agreement_stale && " · plan changed since"}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const footer = canTake ? (
    <div className="flex flex-wrap items-center gap-2">
      {onTakePayment && (
        <Button onClick={() => onTakePayment(null)}>
          <FaMoneyBillWave /> Take payment
        </Button>
      )}
      {onNewBill && (
        <Button variant="outline" onClick={onNewBill}>
          <FaPlus /> New bill
        </Button>
      )}
      {/* What happens to money with no bill named is said in the payment
          form itself, where the choice is actually made. */}
    </div>
  ) : undefined;

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title={patient.label}
        description="Every bill, every payment and the plan behind them"
        maxWidth="max-w-3xl"
        footer={footer}
      >
        {/* A refresh after a payment redraws in place; only the first read spins. */}
        {loading && !statement ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-5">
            {header}

            {/* ── Plan → Bill → Collect, with what leaks at each step ──────── */}
            {figures && planFigures && (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
                  <FlowStage
                    stage={MONEY_WORD.planTotal}
                    value={`$${money(planFigures.plan_value)}`}
                    accent="ink"
                    leak={
                      planFigures.unpriced_lines > 0 ? (
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
                      planFigures.unbilled_value > 0 ? (
                        <Badge tone="clay">
                          ${money(planFigures.unbilled_value)}{" "}
                          {MONEY_WORD.notYetBilled.toLowerCase()}
                        </Badge>
                      ) : null
                    }
                  />
                  <FlowArrow />
                  <FlowStage
                    stage={MONEY_WORD.paid}
                    value={`$${money(figures.received)}`}
                    accent="leaf"
                    leak={
                      figures.due_now > 0 ? (
                        <Badge tone="brick">
                          ${money(figures.due_now)} {MONEY_WORD.unpaid.toLowerCase()}
                        </Badge>
                      ) : (
                        <Badge tone="leaf">Nothing {MONEY_WORD.unpaid.toLowerCase()}</Badge>
                      )
                    }
                  />
                </div>

                {planFigures.unpriced_lines > 0 && (
                  <p className="rounded-xl bg-honey-50 px-3 py-2 text-xs font-medium text-honey-800 ring-1 ring-inset ring-honey-200">
                    {planFigures.unpriced_lines === 1
                      ? "One plan line has no price yet, so it is left out of the plan total"
                      : `${planFigures.unpriced_lines} plan lines have no price yet, so they are left out of the plan total`}{" "}
                    rather than counted as free treatment.
                  </p>
                )}
              </>
            )}

            <Tabs
              variant="pill"
              label="Patient money file sections"
              value={tab}
              onChange={setTab}
              items={[
                { id: "timeline", label: "Timeline", icon: <FaStream />, count: events.length },
                { id: "invoices", label: "Bills", icon: <FaFileInvoiceDollar />, count: invoices.length },
                { id: "payments", label: "Payments", icon: <FaMoneyBillWave />, count: payments.length },
                { id: "plan", label: "Treatment plan", icon: <FaTooth />, count: planLines.length },
              ]}
            />

            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === "timeline" && <Timeline events={events} />}

              {/* ── Bills ────────────────────────────────────────────────── */}
              {tab === "invoices" &&
                (invoices.length === 0 ? (
                  <SectionEmpty>This patient has never been billed.</SectionEmpty>
                ) : (
                  <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200">
                    {invoices.map((inv) => {
                      const late = daysOverdue(inv);
                      return (
                        <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-ink-700">
                                {inv.invoice_number}
                              </span>
                              <Badge tone={INVOICE_STATUS_TONE[inv.status] ?? "neutral"} dot>
                                {INVOICE_STATUS_LABEL[inv.status] ?? inv.status}
                              </Badge>
                              {late > 0 && (
                                <Badge tone="brick" icon={FaRegClock}>
                                  {late}d overdue
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-ink-500">
                              {formatDateBeirut(inv.procedure_date)} · due{" "}
                              {formatDateBeirut(inv.due_date)} · {inv.line_items.length}{" "}
                              {inv.line_items.length === 1 ? "item" : "items"}
                            </div>
                          </div>

                          <dl className="flex items-center gap-5 text-xs tabular-nums">
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-ink-400">
                                {MONEY_WORD.billTotal}
                              </dt>
                              <dd className="text-sm font-bold text-ink-900">
                                ${money(inv.total_amount)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-ink-400">
                                {MONEY_WORD.paid}
                              </dt>
                              <dd className="text-sm font-semibold text-leaf-700">
                                ${money(inv.amount_paid)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-ink-400">
                                {MONEY_WORD.unpaid}
                              </dt>
                              <dd
                                className={cn(
                                  "text-sm font-semibold",
                                  inv.remaining_amount > 0 ? "text-brick-700" : "text-ink-400",
                                )}
                              >
                                ${money(inv.remaining_amount)}
                              </dd>
                            </div>
                          </dl>

                          <div className="flex items-center gap-1.5">
                            {onTakePayment && canTake && isLive(inv) && inv.remaining_amount > 0 && (
                              <Button size="sm" onClick={() => onTakePayment(inv)}>
                                <FaMoneyBillWave /> Take payment
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Print"
                              onClick={() => printInvoice(inv)}
                            >
                              <FaPrint />
                            </Button>
                            {onViewInvoice && (
                              <Button variant="outline" size="sm" onClick={() => onViewInvoice(inv)}>
                                Open
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ))}

              {/* ── Payments, and the credit that has not reached a bill ──── */}
              {tab === "payments" && (
                <div className="space-y-4">
                  {canMove && credit > 0 && (
                    <div className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-ink-900">
                            {MONEY_WORD.creditOnAccount}
                          </h4>
                          <p className="text-xs text-ink-500">
                            Money in that no bill has claimed yet.
                          </p>
                        </div>
                        <span className="text-lg font-bold tabular-nums text-brand-800">
                          ${money(credit)}
                        </span>
                      </div>

                      {openBills.length === 0 ? (
                        <p className="text-xs text-ink-500">
                          Nothing is {MONEY_WORD.unpaid.toLowerCase()} right now. The credit waits
                          here until the next bill is issued.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {openBills.map((inv) => {
                            // Never offer more than the payment it comes out
                            // of actually has free, or the server refuses it.
                            const amount = creditSource
                              ? Math.min(creditSource.unapplied, inv.remaining_amount)
                              : 0;
                            return (
                              <li
                                key={inv.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200 bg-card px-3 py-2 text-sm"
                              >
                                <span className="font-mono text-xs text-ink-600">
                                  {inv.invoice_number}
                                </span>
                                <span className="text-ink-700 tabular-nums">
                                  ${money(inv.remaining_amount)} {MONEY_WORD.unpaid.toLowerCase()}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy || !creditSource || amount <= 0}
                                  onClick={() =>
                                    creditSource && applyCredit(creditSource.id, inv, amount)
                                  }
                                >
                                  Apply ${money(amount)}
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setRefundOpen(true)}
                      >
                        <FaUndo /> Hand ${money(credit)} back
                      </Button>
                    </div>
                  )}

                  {payments.length === 0 ? (
                    <SectionEmpty>No money has moved on this account yet.</SectionEmpty>
                  ) : (
                    <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200">
                      {payments.map((p) => (
                        <li key={p.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "text-sm font-bold tabular-nums",
                                  p.kind === "refund" ? "text-brick-700" : "text-leaf-700",
                                )}
                              >
                                {p.kind === "refund" ? "−" : "+"}${money(p.amount)}
                              </span>
                              <span className="text-xs capitalize text-ink-500">
                                {method(p.payment_method)} · {formatDateBeirut(p.payment_date)}
                              </span>
                            </div>
                            {p.unapplied > 0 && (
                              <Badge tone="brand">
                                ${money(p.unapplied)} {MONEY_WORD.creditOnAccount.toLowerCase()}
                              </Badge>
                            )}
                          </div>
                          {(p.reason ?? p.notes) && (
                            <p className="mt-1 text-xs italic text-ink-500">{p.reason ?? p.notes}</p>
                          )}
                          {p.allocations.length > 0 && (
                            <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {p.allocations.map((a) => (
                                <li
                                  key={a.id}
                                  className="flex items-center gap-1.5 rounded-lg bg-ink-100/80 px-2 py-0.5 font-mono text-[11px] text-ink-600"
                                >
                                  <span>
                                    ${money(a.amount)} → {a.invoice.invoice_number}
                                  </span>
                                  {/* A refund's allocation is the money
                                      leaving; it is never taken back off. */}
                                  {canMove && p.kind === "payment" && (
                                    <button
                                      type="button"
                                      className="font-sans text-brand-700 underline underline-offset-2 disabled:opacity-50"
                                      disabled={busy}
                                      onClick={() => void unapply(a)}
                                    >
                                      undo
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* ── The plan, and the two acts that belong to it ──────────── */}
              {tab === "plan" && (
                <div className="space-y-4">
                  {plan?.agreement_stale && (
                    <p className="rounded-xl bg-honey-50 px-3 py-2 text-xs font-medium text-honey-800 ring-1 ring-inset ring-honey-200">
                      The plan has changed since the patient agreed to it. Give them
                      the new plan and record that they agreed again.
                    </p>
                  )}

                  {planLines.length === 0 ? (
                    <SectionEmpty>
                      No treatment has been charted or planned for this patient.
                    </SectionEmpty>
                  ) : (
                    <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200">
                      {planLines.map((l) => (
                        <li
                          key={String(l.record_id)}
                          className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-[11px] font-bold tabular-nums text-ink-600">
                            {l.tooth ?? "—"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-ink-900">
                              {l.procedure}
                            </div>
                            <div className="text-xs text-ink-500">
                              {l.date ? formatDateBeirut(l.date) : "No date"}
                              {l.invoice_number && ` · ${l.invoice_number}`}
                            </div>
                          </div>
                          <Badge tone={PLAN_STATE_TONE[l.state]}>{PLAN_STATE_LABEL[l.state]}</Badge>
                          <span
                            className={cn(
                              "w-20 text-end text-sm font-semibold tabular-nums",
                              l.amount === null ? "text-honey-700" : "text-ink-900",
                            )}
                          >
                            {l.amount === null ? "Unpriced" : `$${money(l.amount)}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {plan && planLines.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-ink-200/70 pt-3">
                      {canTake && plan.quote_id && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void planAct("send", "Given to the patient.")}
                        >
                          <FaPaperPlane /> Give to patient
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => printPlan(plan, patient.label)}
                      >
                        <FaPrint /> Print
                      </Button>
                      {canTake &&
                        plan.quote_id &&
                        (!plan.accepted_at || plan.agreement_stale) && (
                          <Button
                            size="sm"
                            variant={plan.agreement_stale ? "accent" : "outline"}
                            disabled={busy}
                            onClick={() =>
                              void planAct("accept", "Recorded that the patient agreed.")
                            }
                          >
                            <FaCheck />{" "}
                            {plan.accepted_at ? "Agree again" : "Patient agreed"}
                          </Button>
                        )}
                      <span className="ms-auto text-xs text-ink-500">
                        Planned and priced on the chart.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Handing credit back is a correction with a reason, so it is asked
          for properly: the reason is written to audit_logs. */}
      <Modal
        isOpen={refundOpen}
        onClose={() => setRefundOpen(false)}
        title={`Hand $${money(credit)} back`}
        description="Unapplied credit only. It touches no bill."
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <FormField label="Handed back by *">
            <select
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value)}
              className={inputClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Reason *">
            <input
              type="text"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. The patient has moved away"
              className={inputClass}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRefundOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void handCreditBack()} disabled={busy}>
              {busy ? "Recording…" : `Hand $${money(credit)} back`}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
