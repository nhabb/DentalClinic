"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { cn, formatDateBeirut } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/Drawer";
import { Tabs } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { money, printPlan, readError, type Plan } from "./quote-doc";
import {
  daysOverdue,
  isLive,
  normalizeInvoice,
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
  FaChevronRight,
  FaExchangeAlt,
  FaFileInvoiceDollar,
  FaMoneyBillWave,
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
  /** RT… for a receipt, RF… for a refund. */
  document_number: string;
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
  /** Refunded out of this receipt. */
  refunded: number;
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
    document_number: p.document_number ?? `#${p.id}`,
    kind: p.kind === "refund" ? "refund" : "payment",
    amount: num(p.amount),
    payment_method: p.payment_method ?? "cash",
    payment_date: p.payment_date ?? p.created_at,
    notes: p.notes ?? null,
    reason: p.reason ?? null,
    applied: num(p.applied),
    unapplied: num(p.unapplied),
    refunded: num(p.refunded),
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
  /**
   * Open the bill builder to replace one bill: cancel it and issue a
   * corrected one in its place, its money moving across. Billing passes it,
   * since a bill is a document.
   */
  onReplaceInvoice?: (invoice: Invoice) => void;
  /**
   * Receive money from this patient, for one bill when an id is given. The
   * file carries this act wherever it opens: the Payments page opens the
   * dialog in place, Billing lands on Payments with it open.
   */
  onReceivePayment?: (invoiceId?: number) => void;
  /** Hand back what they have prepaid; offered only while there is some. */
  onRefundPrepaid?: (prepaid: number) => void;
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
  onReplaceInvoice,
  onReceivePayment,
  onRefundPrepaid,
  onNewBill,
  refreshToken = 0,
  onChanged,
}: Props) {
  const router = useRouter();
  const { can } = usePermissions();
  const canTake = can("billing:create");
  const canCorrect = can("billing:edit");
  // Replacing issues a bill and cancels one, so it needs both.
  const canReplace = !!onReplaceInvoice && can("billing:create") && can("billing:edit");

  const [statement, setStatement] = useState<Statement | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<PatientDrawerTab>(initialTab);

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
        detail: [
          inv.replaces ? `${MONEY_WORD.replaces} ${inv.replaces.invoice_number}` : null,
          `${inv.line_items.length} ${inv.line_items.length === 1 ? "item" : "items"} · due ${formatDateBeirut(inv.due_date)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: `$${money(inv.total_amount)}`,
      });
      // A cancellation is its own moment, after the issue: the story reads
      // issued → paid → cancelled → replaced by, in the order it happened.
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

    for (const p of statement?.payments ?? []) {
      // Where the money went is the story: which bills, and what stayed
      // prepaid. The note the desk typed rides along after it.
      const went = p.allocations.map((a) => `$${money(a.amount)} → ${a.invoice.invoice_number}`);
      if (p.kind === "payment" && p.unapplied > 0) {
        went.push(`$${money(p.unapplied)} ${MONEY_WORD.prepaid.toLowerCase()}`);
      }
      const where = went.length > 0 ? went.join(" · ") : `${MONEY_WORD.prepaid}, now used`;
      out.push({
        key: `pay-${p.id}`,
        at: p.payment_date,
        kind: p.kind === "refund" ? "refund" : "payment",
        title:
          p.kind === "refund"
            ? `${MONEY_WORD.refund} ${p.document_number} (${method(p.payment_method)})`
            : `Payment ${p.document_number} received (${method(p.payment_method)})`,
        detail: p.kind === "refund" ? (p.reason ?? "") : [where, p.notes].filter(Boolean).join(" · "),
        amount: `${p.kind === "refund" ? "−" : "+"}$${money(p.amount)}`,
      });
    }

    if (statement?.plan?.accepted_at) {
      out.push({
        key: "plan-agreed",
        at: statement.plan.accepted_at,
        kind: "clinical",
        title: "Plan agreed by the patient",
        detail: statement.plan.agreement_stale
          ? "The plan has changed since; give them the new quote"
          : `${MONEY_WORD.quoteTotal} $${money(statement.plan_figures.plan_value)}`,
        amount: "",
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
  const prepaid = figures?.credit_held ?? 0;
  const overdueBills = liveInvoices.filter((i) => daysOverdue(i) > 0 && i.remaining_amount > 0);
  const owedBills = liveInvoices.filter((i) => i.remaining_amount > 0);

  // ── The one correction ─────────────────────────────────────────────────────
  // Prepaid money pays a bill as it is issued, so a patient holding prepaid
  // money beside an unpaid bill is the rare case (a bill from before the
  // deposit, or the desk unticked it). This puts it on that bill; it is the
  // only money act the file does itself.

  const usePrepaidOn = (invoice: Invoice) =>
    act(
      `/api/billing/invoices/${invoice.id}/pay-from-balance`,
      { method: "POST", body: JSON.stringify({}) },
      `${MONEY_WORD.prepaid} money put on ${invoice.invoice_number}.`,
      "That could not be applied.",
    );

  /**
   * The sentence a person reads first. The figures are the same server
   * figures as the chain below; this only says them in words.
   */
  const summary = (() => {
    if (!figures) return "";
    const parts: string[] = [];
    if (figures.due_now > 0) {
      const late = overdueBills.length;
      parts.push(
        `Owes $${money(figures.due_now)} on ${owedBills.length} ${owedBills.length === 1 ? "bill" : "bills"}` +
          (late > 0
            ? `, ${late === 1 ? "one" : late} overdue by ${Math.max(...overdueBills.map(daysOverdue))} days`
            : ""),
      );
    } else if (figures.billed > 0) {
      parts.push("Every bill is paid");
    } else {
      parts.push("Nothing billed yet");
    }
    if (prepaid > 0) parts.push(`$${money(prepaid)} ${MONEY_WORD.prepaid.toLowerCase()}`);
    if (planFigures && planFigures.unbilled_value > 0) {
      parts.push(`$${money(planFigures.unbilled_value)} of the plan ${MONEY_WORD.notYetBilled.toLowerCase()}`);
    }
    return parts.join(" · ") + ".";
  })();

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

  // The acts, and only the acts: money in, money back, a new bill. Each
  // shows only when it can be done, so an empty account has one button.
  const footer =
    canTake || canCorrect ? (
      <div className="flex flex-wrap items-center gap-2">
        {canTake && onReceivePayment && (
          <Button onClick={() => onReceivePayment()}>
            <FaMoneyBillWave /> {MONEY_WORD.receivePayment}
          </Button>
        )}
        {canCorrect && onRefundPrepaid && prepaid > 0 && (
          <Button variant="outline" onClick={() => onRefundPrepaid(prepaid)}>
            <FaUndo /> {MONEY_WORD.refund} ${money(prepaid)}
          </Button>
        )}
        {canTake && onNewBill && (
          <Button variant="outline" onClick={onNewBill}>
            <FaPlus /> New bill
          </Button>
        )}
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

            {summary && (
              <p className="text-sm font-semibold text-ink-900">{summary}</p>
            )}

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
                    // Applied, not received: credit held is not a stage, and
                    // billed - applied = due_now is what this chain shows.
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
                              {inv.replaced_by && (
                                <Badge tone="brand">
                                  {MONEY_WORD.replacedBy} {inv.replaced_by.invoice_number}
                                </Badge>
                              )}
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
                              {inv.replaces && (
                                <>
                                  {" "}· {MONEY_WORD.replaces.toLowerCase()} {inv.replaces.invoice_number}
                                </>
                              )}
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
                            {/* One act per state: an unpaid bill takes money;
                                prepaid money, when there is any, can be put on
                                it; a live bill can be replaced. Printing lives
                                in the bill itself (Open). */}
                            {canTake && onReceivePayment && isLive(inv) && inv.remaining_amount > 0 && (
                              <Button size="sm" onClick={() => onReceivePayment(inv.id)}>
                                <FaMoneyBillWave /> {MONEY_WORD.receivePayment}
                              </Button>
                            )}
                            {canCorrect && prepaid > 0 && isLive(inv) && inv.remaining_amount > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                title={`Put their ${MONEY_WORD.prepaid.toLowerCase()} money on this bill`}
                                onClick={() => void usePrepaidOn(inv)}
                              >
                                Use {MONEY_WORD.prepaid.toLowerCase()}
                              </Button>
                            )}
                            {canReplace && isLive(inv) && (
                              <Button
                                variant="outline"
                                size="sm"
                                title="Cancel this bill and issue a corrected one in its place; money on it moves across"
                                onClick={() => onReplaceInvoice?.(inv)}
                              >
                                <FaExchangeAlt /> Replace
                              </Button>
                            )}
                            {onViewInvoice && (
                              <Button variant="ghost" size="sm" onClick={() => onViewInvoice(inv)}>
                                Open
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ))}

              {/* ── Payments: every receipt and refund, read-only ─────────── */}
              {tab === "payments" && (
                <div className="space-y-4">
                  {prepaid > 0 && (
                    <p className="rounded-xl bg-brand-50/60 px-3 py-2 text-xs text-brand-800 ring-1 ring-inset ring-brand-200">
                      ${money(prepaid)} is {MONEY_WORD.prepaid.toLowerCase()}: it pays their next
                      bill as it is issued, or can be refunded from the footer.
                    </p>
                  )}

                  {payments.length === 0 ? (
                    <SectionEmpty>No money has moved on this account yet.</SectionEmpty>
                  ) : (
                    <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200">
                      {payments.map((p) => (
                        <li key={p.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-ink-700">
                                {p.document_number}
                              </span>
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
                            <div className="flex items-center gap-2">
                              {p.kind === "payment" && p.unapplied > 0 && (
                                <Badge tone="brand">holds ${money(p.unapplied)}</Badge>
                              )}
                              {p.kind === "payment" && p.refunded > 0 && (
                                <Badge tone="brick">${money(p.refunded)} refunded</Badge>
                              )}
                            </div>
                          </div>
                          {(p.reason ?? p.notes) && (
                            <p className="mt-1 text-xs italic text-ink-500">{p.reason ?? p.notes}</p>
                          )}
                          {p.allocations.length > 0 && (
                            <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {p.allocations.map((a) => (
                                <li
                                  key={a.id}
                                  className="rounded-lg bg-ink-100/80 px-2 py-0.5 font-mono text-[11px] text-ink-600"
                                >
                                  ${money(a.amount)} → {a.invoice.invoice_number}
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
                      The plan has changed since the patient agreed to it. On the
                      Quotes page, give them the new quote and record that they
                      agreed again.
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
                      {/* Read-only here. Pricing, giving the quote to the
                          patient and recording their agreement are the
                          Quotes page's acts. */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/admin/quotes?patient=${patient.id}`)}
                      >
                        <FaFileInvoiceDollar /> Open {MONEY_WORD.quote.toLowerCase()}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => printPlan(plan, patient.label)}
                      >
                        <FaPrint /> Print
                      </Button>
                      <span className="ms-auto text-xs text-ink-500">
                        Planned on the chart, priced on the {MONEY_WORD.quote.toLowerCase()}.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
