"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FaCashRegister,
  FaChartLine,
  FaFileInvoiceDollar,
  FaMoneyBillWave,
  FaPiggyBank,
  FaPrint,
  FaReceipt,
  FaRegClock,
  FaUndo,
  FaWallet,
} from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Modal } from "@/components/ui/Modal";
import { StatsCard } from "@/components/ui/StatsCard";
import { Tabs } from "@/components/ui/Tabs";
import { Avatar } from "@/components/ui/Avatar";
import { MONEY_WORD } from "@/components/billing/money-words";
import { money, clinicToday } from "@/components/billing/quote-doc";
import {
  ReceivePaymentModal,
  type PayingPatient,
  type ReceiveOutcome,
} from "@/components/billing/ReceivePaymentModal";
import {
  RefundPrepaidModal,
  type RefundablePatient,
} from "@/components/billing/RefundPrepaidModal";
import { PatientDrawer } from "@/components/billing/PatientDrawer";
import {
  normalizeReceipt,
  printReceipt,
  RECEIPT_STATUS_LABEL,
  RECEIPT_STATUS_TONE,
  type ReceiptRow,
} from "@/components/billing/receipt-doc";
import type { PatientOption } from "@/components/billing/NewInvoiceModal";
import { useSignOut } from "@/lib/auth/useSignOut";
import { fetchAllPatients } from "@/lib/api/patients";
import { ShowMore } from "@/components/ui/ShowMore";
import { useDebounced, usePagedList } from "@/lib/api/paged";

/*
 * Payments: money in, money back, and who still owes.
 *
 * Billing is where a bill is made; this is where money is received. The desk
 * records what happened — a patient paid this much, this way — and the
 * bookkeeping follows: the money goes on their unpaid bills oldest first and
 * whatever is left stays prepaid for the next bill. So one dialog covers a
 * bill paid in full, an instalment, a prepayment and a late payment, and
 * there is no second act to learn.
 *
 * Three lists, each the answer to one question the desk asks: who owes money
 * (Owed, longest overdue first), what came in (Received: receipts RT and
 * refunds RF of the window, what the drawer is counted against), and who is
 * holding prepaid money (Prepaid: the patients who stopped coming, or paid
 * ahead, with money still on their account).
 *
 * `ReceivePaymentModal` is the only payment form in the clinic, whether it is
 * reached from here, from a bill, or from a patient's money file.
 */

type Owed = {
  id: number;
  invoice_number: string;
  patient_id: number;
  patient_name: string;
  total_amount: number;
  amount_paid: number;
  remaining: number;
  status: string;
  due_date: string;
  days_overdue: number;
};

type Prepaid = {
  patient_id: number;
  patient_name: string;
  prepaid: number;
  receipts: number;
  since: string;
};

type ByMethod = { method: string; payments: number; refunds: number; net: number; count: number };

const num = (v: unknown) => Number(v ?? 0);
const methodLabel = (m: string) => m.replace(/_/g, " ");

/** The receipt filters the desk asks for (the API applies them); "refunds" lists RF rows. */
const RECEIPT_FILTERS = {
  all: "All",
  open: "Prepaid",
  used: "Used",
  refunds: "Refunds",
} as const;
type ReceiptFilter = keyof typeof RECEIPT_FILTERS;

/** The windows a desk actually asks for. "Today" is the clinic's day. */
const WINDOWS = {
  today: "Today",
  week: "Last 7 days",
  month: "This month",
  all: "All time",
} as const;
type WindowId = keyof typeof WINDOWS;

function windowRange(id: WindowId): { from?: string; to?: string } {
  const today = clinicToday();
  if (id === "all") return {};
  if (id === "today") return { from: today, to: today };
  if (id === "week") {
    const from = new Date(`${today}T12:00:00.000Z`);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from: from.toISOString().slice(0, 10), to: today };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

type View = "owed" | "taken" | "prepaid";

export default function PaymentsPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canTake = can("billing:create");
  const canRefund = can("billing:edit");

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<View>("owed");
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>("all");
  const [window_, setWindow] = useState<WindowId>("today");
  const [search, setSearch] = useState("");

  const [byMethod, setByMethod] = useState<ByMethod[]>([]);
  const [takenNet, setTakenNet] = useState(0);
  /** Clinic-wide unpaid, overdue and prepaid, from the server’s one definition. */
  const [totalOwed, setTotalOwed] = useState(0);
  const [overdueOwed, setOverdueOwed] = useState(0);
  const [prepaidHeld, setPrepaidHeld] = useState(0);

  /** The two acts: money in (for one bill, or for whatever they owe), money back. */
  const [receiving, setReceiving] = useState<{ patient: PayingPatient; invoiceId: number | null } | null>(null);
  const [refunding, setRefunding] = useState<RefundablePatient | null>(null);

  /** Picking whose money it is, when no bill was named. */
  const [picking, setPicking] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [pickSearch, setPickSearch] = useState("");

  /** One patient's money file, the same drawer the billing page opens. */
  const [drawerPatient, setDrawerPatient] = useState<PatientOption | null>(null);
  const [moneyMoved, setMoneyMoved] = useState(0);

  const range = windowRange(window_);

  // The registers page ten at a time; the API searches, filters and counts.
  const q = useDebounced(search.trim());
  const owedList = usePagedList<Owed, { all: number }>({
    path: "/api/billing/outstanding",
    params: { search: q },
    map: (r: Record<string, unknown>) =>
      ({
        ...(r as object),
        id: Number(r.id),
        patient_id: Number(r.patient_id),
        total_amount: num(r.total_amount),
        amount_paid: num(r.amount_paid),
        remaining: num(r.remaining),
        days_overdue: Number(r.days_overdue ?? 0),
      }) as Owed,
    withCounts: true,
  });
  const takenList = usePagedList<ReceiptRow, Record<ReceiptFilter, number>>({
    path: "/api/billing/receipts",
    params: { search: q, filter: receiptFilter, from: range.from, to: range.to },
    map: normalizeReceipt,
    withCounts: true,
  });
  const prepaidList = usePagedList<Prepaid, { all: number }>({
    path: "/api/billing/prepaid",
    params: { search: q },
    map: (r: Record<string, unknown>) => ({
      patient_id: Number(r.patient_id),
      patient_name: String(r.patient_name ?? ""),
      prepaid: num(r.prepaid),
      receipts: Number(r.receipts ?? 0),
      since: String(r.since ?? ""),
    }),
    withCounts: true,
  });
  const owed = owedList.rows;
  const taken = takenList.rows;
  const prepaid = prepaidList.rows;

  const load = useCallback(async () => {
    const summaryQ = new URLSearchParams();
    if (range.from) summaryQ.set("from", range.from);
    if (range.to) summaryQ.set("to", range.to);

    try {
      const [sRes, kRes] = await Promise.all([
        apiFetch(`/api/billing/summary?${summaryQ}`),
        apiFetch("/api/billing/kpis"),
      ]);
      if (sRes.ok) {
        const s = await sRes.json();
        // The headline and the split come from the server together, so the
        // parts always add up to the whole on screen.
        setTakenNet(num(s.total_income));
        setByMethod(Array.isArray(s.by_method) ? s.by_method : []);
      }
      if (kRes.ok) {
        const all = (await kRes.json())?.all_time ?? {};
        setTotalOwed(num(all.total_outstanding));
        setOverdueOwed(num(all.total_overdue));
        setPrepaidHeld(num(all.total_credit_held));
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window_]);

  useEffect(() => {
    void load();
  }, [load, moneyMoved]);

  // Money moved: the registers ask again too (the first load is the hooks' own).
  useEffect(() => {
    if (moneyMoved === 0) return;
    void owedList.reload();
    void takenList.reload();
    void prepaidList.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneyMoved]);

  /** The patient's name, from the lists already loaded or from the API. */
  const nameOf = useCallback(
    async (id: number): Promise<string> => {
      const known =
        owed.find((r) => r.patient_id === id)?.patient_name ??
        taken.find((r) => r.patient_id === id)?.patient_name ??
        prepaid.find((r) => r.patient_id === id)?.patient_name;
      if (known) return known;
      const res = await apiFetch(`/api/patients/${id}`);
      if (!res.ok) throw new Error();
      const p = await res.json();
      return p?.users ? `${p.users.first_name} ${p.users.last_name}`.trim() : `Patient #${id}`;
    },
    [owed, taken, prepaid],
  );

  /** What they have prepaid right now, for the refund dialog. */
  const prepaidOf = async (id: number): Promise<number> => {
    const res = await apiFetch(`/api/billing/patients/${id}/ledger`);
    if (!res.ok) throw new Error();
    return num((await res.json())?.credit_balance);
  };

  /**
   * `/admin/payments?patient=<id>` opens that patient’s money file;
   * `&receive=<invoiceId|1>` opens the receive dialog on it (for that bill,
   * or for whatever they owe) and `&refund=1` the refund dialog — where
   * Billing sends the desk, since money is received here.
   *
   * Read inside the effect and not in a lazy initial state: the page is
   * server-rendered first, where there is no window, and hydration would
   * keep that empty answer.
   */
  const [deepLinkDone, setDeepLinkDone] = useState(false);
  useEffect(() => {
    if (deepLinkDone || isLoading) return;
    setDeepLinkDone(true);
    const params = new URLSearchParams(window.location.search);
    const wanted = Number(params.get("patient"));
    if (!wanted) return;
    const receive = Number(params.get("receive"));
    const refund = params.get("refund") === "1";
    window.history.replaceState(null, "", "/admin/payments");

    void (async () => {
      try {
        const label = await nameOf(wanted);
        const patient = { id: wanted, label };
        setDrawerPatient(patient);
        if (receive) {
          setReceiving({ patient, invoiceId: receive > 1 ? receive : null });
        } else if (refund && canRefund) {
          const held = await prepaidOf(wanted);
          if (held > 0) setRefunding({ ...patient, prepaid: held });
          else toast.info(`${label} has nothing ${MONEY_WORD.prepaid.toLowerCase()} to refund.`);
        }
      } catch {
        toast.error("That patient could not be opened.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkDone, isLoading]);

  const fetchPatients = useCallback(async () => {
    try {
      const list = await fetchAllPatients();
      setPatients(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        list.map((p: any) => ({
          id: Number(p.id),
          label: `${p.users?.first_name ?? ""} ${p.users?.last_name ?? ""}`.trim(),
        })),
      );
    } catch { /* the picker shows its own empty state */ }
  }, []);

  const refresh = () => setMoneyMoved((n) => n + 1);

  /** The toast after money came in: the receipt, where it went, what stayed. */
  const sayReceived = (who: string, o: ReceiveOutcome) => {
    const went = o.applied.map((a) => `${a.invoice_number} $${money(a.amount)}`);
    const parts = [
      `${o.receipt.document_number}: $${money(o.receipt.amount)} from ${who}.`,
      went.length > 0 ? `Paid ${went.join(", ")}.` : "",
      o.prepaid > 0 ? `$${money(o.prepaid)} stays ${MONEY_WORD.prepaid.toLowerCase()}.` : "",
    ].filter(Boolean);
    toast.success(parts.join(" "));
  };

  const handleLogout = useSignOut();

  const pickMatches = patients
    .filter((p) => p.label.toLowerCase().includes(pickSearch.trim().toLowerCase()))
    .slice(0, 50);

  const openFile = (id: number, label: string) => setDrawerPatient({ id, label });

  return (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar
        activePage="payments"
        sidebarOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminPageHeader
          title="Payments"
          subtitle="Money received and money owed"
          onAdd={
            canTake
              ? () => {
                  setPicking(true);
                  void fetchPatients();
                }
              : undefined
          }
          addLabel={MONEY_WORD.receivePayment}
          actions={[
            {
              key: "billing",
              label: "Bills",
              icon: <FaFileInvoiceDollar />,
              href: "/admin/billing",
            },
            { key: "dashboard", label: "Dashboard", icon: <FaChartLine />, href: "/admin" },
          ]}
        />

        <main className="flex-1 overflow-auto p-8">
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {MONEY_WORD.acrossTheClinic}
              </p>
              <div className="mb-3 grid grid-cols-1 gap-6 md:grid-cols-4">
                <StatsCard
                  icon={FaCashRegister}
                  iconBgClass="bg-green-100"
                  iconColorClass="text-green-600"
                  value={`$${money(takenNet)}`}
                  label={`Received ${WINDOWS[window_].toLowerCase()}`}
                />
                <StatsCard
                  icon={FaWallet}
                  iconBgClass="bg-yellow-100"
                  iconColorClass="text-yellow-600"
                  value={`$${money(totalOwed)}`}
                  label={MONEY_WORD.unpaid}
                />
                <StatsCard
                  icon={FaRegClock}
                  iconBgClass="bg-red-100"
                  iconColorClass="text-red-600"
                  value={`$${money(overdueOwed)}`}
                  label="Overdue"
                />
                <StatsCard
                  icon={FaPiggyBank}
                  iconBgClass="bg-blue-100"
                  iconColorClass="text-blue-600"
                  value={`$${money(prepaidHeld)}`}
                  label={`${MONEY_WORD.prepaid}, held`}
                />
              </div>

              {/* What the drawer should hold, split the way it was taken. The
                  parts come from the same server figure as the headline, so
                  they add up to it. */}
              <p className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                {byMethod.length === 0 ? (
                  <span>Nothing was received {WINDOWS[window_].toLowerCase()}.</span>
                ) : (
                  byMethod.map((m) => (
                    <span key={m.method} className="capitalize">
                      {methodLabel(m.method)}{" "}
                      <strong className="tabular-nums text-ink-800">${money(m.net)}</strong>
                      {m.refunds > 0 && (
                        <span className="text-brick-700"> (−${money(m.refunds)} refunded)</span>
                      )}
                    </span>
                  ))
                )}
              </p>

              <Tabs
                className="mb-5"
                label="Payments views"
                value={view}
                onChange={setView}
                items={[
                  { id: "owed", label: "Owed", icon: <FaFileInvoiceDollar />, count: owedList.counts?.all ?? 0 },
                  { id: "taken", label: "Received", icon: <FaReceipt />, count: takenList.counts?.all ?? 0 },
                  { id: "prepaid", label: MONEY_WORD.prepaid, icon: <FaPiggyBank />, count: prepaidList.counts?.all ?? 0 },
                ]}
              />

              <ListToolbar
                search={{
                  value: search,
                  onChange: setSearch,
                  placeholder:
                    view === "taken"
                      ? "Search by patient, RT / RF or bill number"
                      : view === "owed"
                        ? "Search by patient or bill number"
                        : "Search by patient",
                }}
                shown={view === "owed" ? owedList.total : view === "taken" ? takenList.total : prepaidList.total}
                total={
                  view === "owed"
                    ? owedList.counts?.all ?? 0
                    : view === "taken"
                      ? takenList.counts?.all ?? 0
                      : prepaidList.counts?.all ?? 0
                }
                unitLabel={view === "owed" ? "bills" : view === "taken" ? "receipts" : "patients"}
                groups={
                  view === "taken"
                    ? [
                        {
                          key: "status",
                          variant: "segmented",
                          value: receiptFilter,
                          onChange: (v: string) => setReceiptFilter(v as ReceiptFilter),
                          options: (Object.keys(RECEIPT_FILTERS) as ReceiptFilter[]).map((id) => ({
                            value: id,
                            label: RECEIPT_FILTERS[id],
                            count: takenList.counts?.[id] ?? 0,
                          })),
                        },
                        {
                          key: "window",
                          variant: "segmented",
                          value: window_,
                          onChange: (v: string) => setWindow(v as WindowId),
                          options: (Object.keys(WINDOWS) as WindowId[]).map((id) => ({
                            value: id,
                            label: WINDOWS[id],
                          })),
                        },
                      ]
                    : undefined
                }
              />

              {/* ── Who owes money, longest overdue first ─────────────────── */}
              {view === "owed" &&
                (owed.length === 0 ? (
                  <EmptyState
                    icon={FaCashRegister}
                    title={`Nothing is ${MONEY_WORD.unpaid.toLowerCase()}`}
                    description="Every bill the clinic has issued has been settled."
                  />
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-ink-200 bg-card">
                    <table className="w-full text-sm">
                      <thead className="bg-ink-50/80 text-xs uppercase tracking-wide text-ink-500">
                        <tr>
                          <th className="px-4 py-3 text-start">Patient</th>
                          <th className="px-4 py-3 text-start">Bill</th>
                          <th className="px-4 py-3 text-start">Due</th>
                          <th className="px-4 py-3 text-end">{MONEY_WORD.billTotal}</th>
                          <th className="px-4 py-3 text-end">{MONEY_WORD.paid}</th>
                          <th className="px-4 py-3 text-end">{MONEY_WORD.unpaid}</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {owed.map((r) => (
                          <tr
                            key={r.id}
                            tabIndex={0}
                            aria-label={`Open the money file of ${r.patient_name}`}
                            onClick={() => openFile(r.patient_id, r.patient_name)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openFile(r.patient_id, r.patient_name);
                              }
                            }}
                            className="cursor-pointer transition-colors hover:bg-brand-50/60 focus-visible:bg-brand-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar name={r.patient_name} size="sm" />
                                <span className="font-medium text-ink-900">{r.patient_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-ink-600">
                              {r.invoice_number}
                            </td>
                            <td className="px-4 py-3 text-ink-600">
                              {formatDateBeirut(r.due_date)}
                              {r.days_overdue > 0 && (
                                <Badge tone="brick" className="ms-2" icon={FaRegClock}>
                                  {r.days_overdue}d overdue
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-end tabular-nums text-ink-900">
                              ${money(r.total_amount)}
                            </td>
                            <td className="px-4 py-3 text-end tabular-nums text-leaf-700">
                              ${money(r.amount_paid)}
                            </td>
                            <td className="px-4 py-3 text-end font-semibold tabular-nums text-brick-700">
                              ${money(r.remaining)}
                            </td>
                            <td className="px-4 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                              {/* One act: the money for this bill. */}
                              {canTake && (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    setReceiving({
                                      patient: { id: r.patient_id, label: r.patient_name },
                                      invoiceId: r.id,
                                    })
                                  }
                                >
                                  <FaMoneyBillWave /> {MONEY_WORD.receivePayment}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <ShowMore shown={owed.length} total={owedList.total} loading={owedList.loadingMore} onClick={owedList.loadMore} />
                  </div>
                ))}

              {/* ── Receipts and refunds, newest first ───────────────────── */}
              {view === "taken" &&
                (taken.length === 0 ? (
                  <EmptyState
                    icon={FaReceipt}
                    title={`Nothing received ${WINDOWS[window_].toLowerCase()}`}
                    description="Receipts and refunds appear here on the day the money moved."
                  />
                ) : (
                  <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-card">
                    {taken.map((r) => {
                      const held = r.figures?.held ?? 0;
                      const open = () => openFile(r.patient_id, r.patient_name);
                      return (
                        <li
                          key={r.id}
                          tabIndex={0}
                          aria-label={`Open the money file of ${r.patient_name}`}
                          onClick={open}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              open();
                            }
                          }}
                          className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-brand-50/60 focus-visible:bg-brand-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400"
                        >
                          <span
                            className={`w-24 shrink-0 text-sm font-bold tabular-nums ${
                              r.kind === "refund" ? "text-brick-700" : "text-leaf-700"
                            }`}
                          >
                            {r.kind === "refund" ? "−" : "+"}${money(r.amount)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-ink-700">
                                {r.document_number}
                              </span>
                              <span className="font-medium text-ink-900">{r.patient_name}</span>
                              <Badge tone="neutral" className="capitalize">
                                {methodLabel(r.payment_method)}
                              </Badge>
                              {r.kind === "refund" ? (
                                <Badge tone="brick" icon={FaUndo}>
                                  {r.source ? `out of ${r.source.document_number}` : "refund"}
                                </Badge>
                              ) : (
                                r.status !== "refund" && (
                                  <Badge tone={RECEIPT_STATUS_TONE[r.status]}>
                                    {RECEIPT_STATUS_LABEL[r.status]}
                                  </Badge>
                                )
                              )}
                              {r.kind === "payment" && held > 0 && (
                                <Badge tone="brand">
                                  ${money(held)} {MONEY_WORD.prepaid.toLowerCase()}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-ink-500">
                              {r.kind === "refund"
                                ? r.reason
                                : [
                                    ...r.allocations.map(
                                      (a) =>
                                        `$${money(a.amount)} → ${a.invoice?.invoice_number ?? "a bill"}`,
                                    ),
                                    ...r.refunds.map(
                                      (f) => `−$${money(f.amount)} refunded (${f.document_number})`,
                                    ),
                                  ].join(" · ") || `${MONEY_WORD.prepaid}: not on a bill yet`}
                              {r.kind === "payment" && r.notes && ` · ${r.notes}`}
                            </div>
                          </div>
                          <div className="text-end text-xs text-ink-500">
                            <div className="tabular-nums">{formatDateBeirut(r.payment_date)}</div>
                            {r.taken_by && <div>by {r.taken_by}</div>}
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Print ${r.document_number}`}
                              onClick={() => printReceipt(r)}
                            >
                              <FaPrint />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ))}
              {view === "taken" && taken.length > 0 && (
                <ShowMore shown={taken.length} total={takenList.total} loading={takenList.loadingMore} onClick={takenList.loadMore} />
              )}

              {/* ── Who is holding prepaid money ──────────────────────────── */}
              {view === "prepaid" &&
                (prepaid.length === 0 ? (
                  <EmptyState
                    icon={FaPiggyBank}
                    title={`Nobody has ${MONEY_WORD.prepaid.toLowerCase()} money`}
                    description="A payment that no bill has used yet shows here, until the next bill takes it or it is refunded."
                  />
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-ink-200 bg-card">
                    <table className="w-full text-sm">
                      <thead className="bg-ink-50/80 text-xs uppercase tracking-wide text-ink-500">
                        <tr>
                          <th className="px-4 py-3 text-start">Patient</th>
                          <th className="px-4 py-3 text-start">Since</th>
                          <th className="px-4 py-3 text-start">Receipts</th>
                          <th className="px-4 py-3 text-end">{MONEY_WORD.prepaid}</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {prepaid.map((r) => (
                          <tr
                            key={r.patient_id}
                            tabIndex={0}
                            aria-label={`Open the money file of ${r.patient_name}`}
                            onClick={() => openFile(r.patient_id, r.patient_name)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openFile(r.patient_id, r.patient_name);
                              }
                            }}
                            className="cursor-pointer transition-colors hover:bg-brand-50/60 focus-visible:bg-brand-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar name={r.patient_name} size="sm" />
                                <span className="font-medium text-ink-900">{r.patient_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-ink-600">{formatDateBeirut(r.since)}</td>
                            <td className="px-4 py-3 text-ink-600">{r.receipts}</td>
                            <td className="px-4 py-3 text-end font-semibold tabular-nums text-brand-800">
                              ${money(r.prepaid)}
                            </td>
                            <td className="px-4 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                              {/* One act: hand it back. A bill takes it by itself. */}
                              {canRefund && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setRefunding({ id: r.patient_id, label: r.patient_name, prepaid: r.prepaid })
                                  }
                                >
                                  <FaUndo /> {MONEY_WORD.refund}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <ShowMore shown={prepaid.length} total={prepaidList.total} loading={prepaidList.loadingMore} onClick={prepaidList.loadMore} />
                  </div>
                ))}
            </>
          )}
        </main>
      </div>

      {/* ── One patient's money file, the same drawer Billing opens ─────────── */}
      {drawerPatient && (
        <PatientDrawer
          patient={drawerPatient}
          isOpen={!!drawerPatient}
          onClose={() => setDrawerPatient(null)}
          onReceivePayment={(invoiceId) =>
            setReceiving({ patient: drawerPatient, invoiceId: invoiceId ?? null })
          }
          onRefundPrepaid={(held) => setRefunding({ ...drawerPatient, prepaid: held })}
          onViewInvoice={() => router.push(`/admin/billing?patient=${drawerPatient.id}`)}
          onChanged={refresh}
          refreshToken={moneyMoved}
        />
      )}

      {/* ── Who is paying, when no bill was named ───────────────────────────── */}
      <Modal
        isOpen={picking}
        onClose={() => setPicking(false)}
        title={`${MONEY_WORD.receivePayment}: from whom?`}
        description="It pays their unpaid bills, oldest first; anything beyond that stays prepaid for their next bill."
        maxWidth="max-w-lg"
      >
        <div className="space-y-3">
          <input
            type="text"
            autoFocus
            value={pickSearch}
            onChange={(e) => setPickSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm"
          />
          <div className="max-h-72 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
            {pickMatches.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPicking(false);
                  setReceiving({ patient: p, invoiceId: null });
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-ink-50"
              >
                <Avatar name={p.label} size="sm" />
                <span className="font-medium text-ink-900">{p.label}</span>
              </button>
            ))}
            {pickMatches.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-ink-500">
                No patient matches that name.
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Money in. */}
      <ReceivePaymentModal
        patient={receiving?.patient ?? null}
        open={!!receiving}
        initialInvoiceId={receiving?.invoiceId ?? null}
        onClose={() => setReceiving(null)}
        onReceived={(outcome) => {
          const who = receiving?.patient.label ?? "the patient";
          setReceiving(null);
          refresh();
          sayReceived(who, outcome);
        }}
      />

      {/* Money back. */}
      <RefundPrepaidModal
        patient={refunding}
        onClose={() => setRefunding(null)}
        onRefunded={refresh}
      />
    </div>
  );
}
