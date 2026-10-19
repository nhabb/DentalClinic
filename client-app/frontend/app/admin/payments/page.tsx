"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FaCashRegister,
  FaChartLine,
  FaFileInvoiceDollar,
  FaMoneyBillWave,
  FaRegClock,
  FaUndo,
  FaWallet,
} from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { safeStorage } from "@/lib/browser-compat";
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
import { money, clinicToday, readError } from "@/components/billing/quote-doc";
import {
  normalizeInvoice,
  type Invoice,
} from "@/components/billing/invoice-doc";
import {
  TakePaymentModal,
  type PayingPatient,
} from "@/components/billing/TakePaymentModal";
import { PatientDrawer } from "@/components/billing/PatientDrawer";
import type { PatientOption } from "@/components/billing/NewInvoiceModal";

/*
 * Taking money.
 *
 * Billing is where a bill is made; this is where money is received. They are
 * two different acts, often by two different people minutes apart, and the
 * desk should not have to go hunting through a list of documents to do the
 * second one.
 *
 * So the page reads in the order the job goes: who owes money, take it, and
 * what we have taken today — the last of those being what somebody counts the
 * drawer against at closing.
 *
 * It opens no second payment form. `TakePaymentModal` is the only one in the
 * clinic, whether it is reached from here, from a bill, or from a patient's
 * money file.
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

type Allocation = { id: number; amount: number; invoice: { invoice_number: string } | null };

type Taken = {
  id: number;
  kind: "payment" | "refund";
  refund_scope: string | null;
  amount: number;
  payment_method: string;
  payment_date: string;
  notes: string | null;
  reason: string | null;
  patient_id: number;
  patient_name: string;
  taken_by: string | null;
  applied: number;
  unapplied: number;
  allocations: Allocation[];
};

type ByMethod = { method: string; payments: number; refunds: number; net: number; count: number };

const num = (v: unknown) => Number(v ?? 0);
const methodLabel = (m: string) => m.replace(/_/g, " ");

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

export default function PaymentsPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canTake = can("billing:create");

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<"owed" | "taken">("owed");
  const [window_, setWindow] = useState<WindowId>("today");
  const [search, setSearch] = useState("");

  const [owed, setOwed] = useState<Owed[]>([]);
  const [taken, setTaken] = useState<Taken[]>([]);
  const [byMethod, setByMethod] = useState<ByMethod[]>([]);
  const [takenNet, setTakenNet] = useState(0);
  /** Clinic-wide unpaid and overdue, from the server’s one definition. */
  const [totalOwed, setTotalOwed] = useState(0);
  const [overdueOwed, setOverdueOwed] = useState(0);

  /** The one payment form, reached from a bill or with no bill named. */
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [depositPatient, setDepositPatient] = useState<PayingPatient | null>(null);
  const [openingBill, setOpeningBill] = useState<number | null>(null);

  /** Picking who is paying, when no bill was named. */
  const [picking, setPicking] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [pickSearch, setPickSearch] = useState("");

  /** One patient's money file, the same drawer the billing page opens. */
  const [drawerPatient, setDrawerPatient] = useState<PatientOption | null>(null);
  const [moneyMoved, setMoneyMoved] = useState(0);

  const range = windowRange(window_);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ limit: "400" });
    if (range.from) q.set("from", range.from);
    if (range.to) q.set("to", range.to);
    const summaryQ = new URLSearchParams();
    if (range.from) summaryQ.set("from", range.from);
    if (range.to) summaryQ.set("to", range.to);

    try {
      const [oRes, tRes, sRes, kRes] = await Promise.all([
        apiFetch("/api/billing/outstanding"),
        apiFetch(`/api/billing/invoice-payments?${q}`),
        apiFetch(`/api/billing/summary?${summaryQ}`),
        apiFetch("/api/billing/kpis"),
      ]);
      if (oRes.ok) {
        const rows = await oRes.json();
        setOwed(
          (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
            ...(r as object),
            id: Number(r.id),
            patient_id: Number(r.patient_id),
            total_amount: num(r.total_amount),
            amount_paid: num(r.amount_paid),
            remaining: num(r.remaining),
            days_overdue: Number(r.days_overdue ?? 0),
          })) as Owed[],
        );
      }
      if (tRes.ok) {
        const rows = await tRes.json();
        setTaken(
          (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
            ...(r as object),
            id: Number(r.id),
            patient_id: Number(r.patient_id),
            amount: num(r.amount),
            applied: num(r.applied),
            unapplied: num(r.unapplied),
          })) as Taken[],
        );
      }
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

  /**
   * `/admin/payments?patient=<id>` opens that patient’s money file — where
   * Billing sends the desk after issuing a bill, since taking the money for
   * it is this page’s job.
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
    window.history.replaceState(null, "", "/admin/payments");

    // The name is known from a bill they owe, or from the money that has
    // moved; failing both, ask for the patient rather than guessing.
    const fromOwed = owed.find((r) => r.patient_id === wanted)?.patient_name;
    const fromTaken = taken.find((r) => r.patient_id === wanted)?.patient_name;
    if (fromOwed || fromTaken) {
      setDrawerPatient({ id: wanted, label: (fromOwed || fromTaken) as string });
      return;
    }
    void (async () => {
      try {
        const res = await apiFetch(`/api/patients/${wanted}`);
        if (!res.ok) throw new Error();
        const p = await res.json();
        const label = p?.users
          ? `${p.users.first_name} ${p.users.last_name}`.trim()
          : `Patient #${wanted}`;
        setDrawerPatient({ id: wanted, label });
      } catch {
        toast.error("That patient could not be opened.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkDone, isLoading]);

  const fetchPatients = useCallback(async () => {
    try {
      const res = await apiFetch("/api/patients");
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.data ?? []);
      setPatients(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        list.map((p: any) => ({
          id: Number(p.id),
          label: `${p.users?.first_name ?? ""} ${p.users?.last_name ?? ""}`.trim(),
        })),
      );
    } catch { /* the picker shows its own empty state */ }
  }, []);

  /** Open the one payment form against a bill, fetching it in full first. */
  const takeOnBill = async (row: Owed) => {
    setOpeningBill(row.id);
    try {
      const res = await apiFetch(`/api/billing/invoices/${row.id}`);
      if (!res.ok) {
        toast.error(await readError(res, "Could not open that bill."));
        return;
      }
      setPayingInvoice(normalizeInvoice(await res.json()));
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setOpeningBill(null);
    }
  };

  const refresh = () => setMoneyMoved((n) => n + 1);

  const q = search.trim().toLowerCase();
  const owedShown = useMemo(
    () =>
      owed.filter(
        (r) =>
          !q ||
          r.patient_name.toLowerCase().includes(q) ||
          r.invoice_number.toLowerCase().includes(q),
      ),
    [owed, q],
  );
  const takenShown = useMemo(
    () =>
      taken.filter(
        (r) =>
          !q ||
          r.patient_name.toLowerCase().includes(q) ||
          r.allocations.some((a) =>
            (a.invoice?.invoice_number ?? "").toLowerCase().includes(q),
          ),
      ),
    [taken, q],
  );



  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("userRole");
    router.push("/login");
  };

  const pickMatches = patients
    .filter((p) => p.label.toLowerCase().includes(pickSearch.trim().toLowerCase()))
    .slice(0, 50);

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
          subtitle="Take money, and see what was taken"
          onAdd={
            canTake
              ? () => {
                  setPicking(true);
                  void fetchPatients();
                }
              : undefined
          }
          addLabel="Take payment"
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
                {MONEY_WORD.acrossTheClinic} · {WINDOWS[window_].toLowerCase()}
              </p>
              <div className="mb-3 grid grid-cols-1 gap-6 md:grid-cols-3">
                <StatsCard
                  icon={FaCashRegister}
                  iconBgClass="bg-green-100"
                  iconColorClass="text-green-600"
                  value={`$${money(takenNet)}`}
                  label="Taken"
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
              </div>

              {/* What the drawer should hold, split the way it was taken. The
                  parts come from the same server figure as the headline, so
                  they add up to it. */}
              <p className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                {byMethod.length === 0 ? (
                  <span>Nothing was taken {WINDOWS[window_].toLowerCase()}.</span>
                ) : (
                  byMethod.map((m) => (
                    <span key={m.method} className="capitalize">
                      {methodLabel(m.method)}{" "}
                      <strong className="tabular-nums text-ink-800">${money(m.net)}</strong>
                      {m.refunds > 0 && (
                        <span className="text-brick-700"> (−${money(m.refunds)} returned)</span>
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
                  { id: "owed", label: "Owed", icon: <FaFileInvoiceDollar />, count: owed.length },
                  { id: "taken", label: "Taken", icon: <FaMoneyBillWave />, count: taken.length },
                ]}
              />

              <ListToolbar
                search={{
                  value: search,
                  onChange: setSearch,
                  placeholder: "Search by patient or bill number",
                }}
                shown={view === "owed" ? owedShown.length : takenShown.length}
                total={view === "owed" ? owed.length : taken.length}
                unitLabel={view === "owed" ? "bills" : "payments"}
                groups={
                  view === "taken"
                    ? [
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
                (owedShown.length === 0 ? (
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
                        {owedShown.map((r) => (
                          <tr
                            key={r.id}
                            tabIndex={0}
                            aria-label={`Open the money file of ${r.patient_name}`}
                            onClick={() =>
                              setDrawerPatient({ id: r.patient_id, label: r.patient_name })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setDrawerPatient({ id: r.patient_id, label: r.patient_name });
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
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end">
                                {canTake && (
                                  <Button
                                    size="sm"
                                    disabled={openingBill === r.id}
                                    onClick={() => void takeOnBill(r)}
                                  >
                                    <FaMoneyBillWave />
                                    {openingBill === r.id ? "Opening…" : "Take payment"}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

              {/* ── What was taken, newest first ──────────────────────────── */}
              {view === "taken" &&
                (takenShown.length === 0 ? (
                  <EmptyState
                    icon={FaMoneyBillWave}
                    title={`No money moved ${WINDOWS[window_].toLowerCase()}`}
                    description="Payments and refunds appear here on the day the money moved."
                  />
                ) : (
                  <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-card">
                    {takenShown.map((r) => (
                      <li
                        key={r.id}
                        tabIndex={0}
                        aria-label={`Open the money file of ${r.patient_name}`}
                        onClick={() =>
                          setDrawerPatient({ id: r.patient_id, label: r.patient_name })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDrawerPatient({ id: r.patient_id, label: r.patient_name });
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
                            <span className="font-medium text-ink-900">{r.patient_name}</span>
                            <Badge tone="neutral" className="capitalize">
                              {methodLabel(r.payment_method)}
                            </Badge>
                            {r.kind === "refund" && (
                              <Badge tone="brick" icon={FaUndo}>
                                {r.refund_scope === "credit" ? "credit returned" : "off a bill"}
                              </Badge>
                            )}
                            {r.unapplied > 0 && r.kind === "payment" && (
                              <Badge tone="brand">
                                ${money(r.unapplied)} {MONEY_WORD.creditOnAccount.toLowerCase()}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-ink-500">
                            {r.allocations.length > 0
                              ? r.allocations
                                  .map(
                                    (a) =>
                                      `$${money(num(a.amount))} → ${a.invoice?.invoice_number ?? "a bill"}`,
                                  )
                                  .join(" · ")
                              : `Held as ${MONEY_WORD.creditOnAccount.toLowerCase()}`}
                            {(r.reason ?? r.notes) && ` · ${r.reason ?? r.notes}`}
                          </div>
                        </div>
                        <div className="text-end text-xs text-ink-500">
                          <div className="tabular-nums">{formatDateBeirut(r.payment_date)}</div>
                          {r.taken_by && <div>by {r.taken_by}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
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
          onTakePayment={(inv) =>
            inv ? setPayingInvoice(inv) : setDepositPatient(drawerPatient)
          }
          onViewInvoice={() => router.push(`/admin/billing?patient=${drawerPatient.id}`)}
          allowMoneyActs
          onChanged={refresh}
          refreshToken={moneyMoved}
        />
      )}

      {/* ── Who is paying, when no bill was named ───────────────────────────── */}
      <Modal
        isOpen={picking}
        onClose={() => setPicking(false)}
        title="Take payment: who is paying?"
        description="No bill needs to be named — anything beyond what they owe is held as credit."
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
                  setDepositPatient({ id: p.id, label: p.label });
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

      {/* The one payment form in the clinic, named bill or not. */}
      <TakePaymentModal
        invoice={payingInvoice}
        patient={depositPatient}
        open={!!depositPatient}
        onClose={() => {
          setPayingInvoice(null);
          setDepositPatient(null);
        }}
        onPaid={(inv) => {
          setDepositPatient(null);
          setPayingInvoice(inv && inv.remaining_amount > 0 ? inv : null);
          refresh();
        }}
      />
    </div>
  );
}

