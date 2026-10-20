"use client";

import { toast } from 'sonner';
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { StatsCard } from "@/components/ui/StatsCard";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  MONEY_WORD,
  type InvoiceStatus,
} from "@/components/billing/money-words";
import { CONFIRM_PASSWORD_HEADER, PasswordConfirmModal } from "@/components/billing/PasswordConfirmModal";
import { NewInvoiceModal } from "@/components/billing/NewInvoiceModal";
import { PAYMENT_METHODS } from "@/components/billing/TakePaymentModal";
import { PatientDrawer, type PatientDrawerTab } from "@/components/billing/PatientDrawer";
import { QuotesPanel } from "@/components/billing/QuotesPanel";
import { Tabs } from "@/components/ui/Tabs";
import {
  daysOverdue,
  Invoice,
  InvoicePayment,
  normalizeInvoice as normalizeInvoiceDoc,
  printInvoice,
} from "@/components/billing/invoice-doc";
import {
  FaFileInvoiceDollar,
  FaCheckCircle,
  FaClock,
  FaHashtag,
  FaEye,
  FaPlus,
  FaTrash,
  FaChartLine,
  FaPrint,
  FaClipboardList,
} from "react-icons/fa";
import { signOut } from "@/lib/auth/session";

/** The invoice shape, its printing and its aging live in one shared module. */
type TreatmentInvoice = Invoice;
type PatientOption = { id: number; label: string };

// ─── Status badge ─────────────────────────────────────────────────────────────

/** A bill’s status, in the words and tones the whole app uses. */
function StatusBadge({ status }: { status: string }) {
  const known = status as InvoiceStatus;
  return (
    <Badge tone={INVOICE_STATUS_TONE[known] ?? "neutral"} dot>
      {INVOICE_STATUS_LABEL[known] ?? status}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [invoices, setInvoices] = useState<TreatmentInvoice[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");

  // This page is the one door for money: bills are built here and payments
  // taken here. The chart only records the clinical work.
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderPatientId, setBuilderPatientId] = useState<number | null>(null);

  // View / payment modal
  const { can } = usePermissions();
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<TreatmentInvoice | null>(null);
  /** Bills or plans: the two registers this page is, on one screen. */
  const [view, setView] = useState<"bills" | "plans">("bills");
  /** The patient whose money file is open, and where it opened. */
  const [drawerPatient, setDrawerPatient] = useState<PatientOption | null>(null);
  const [drawerTab, setDrawerTab] = useState<PatientDrawerTab>("timeline");
  /** Bumped whenever money moves, so an open money file redraws with it. */
  const [moneyMoved, setMoneyMoved] = useState(0);
  /** The clinic's own figures, from the server — not a sum of one page of rows. */
  const [clinicFigures, setClinicFigures] = useState<{
    billed: number;
    paid: number;
    unpaid: number;
    bills: number;
    creditHeld: number;
  } | null>(null);

  // Invoices or quotes

  // Cancel form (inside the invoice modal). Cancelling returns the money on
  // the bill to its receipts; ticking "refund" also hands it back.
  const [voidReason, setVoidReason] = useState("");
  const [voidRefund, setVoidRefund] = useState(false);
  const [voidRefundMethod, setVoidRefundMethod] = useState("cash");
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState("");

  // Deleting money records: admin only, password re-entered in a modal.
  const [confirm, setConfirm] = useState<{ kind: "invoice" | "payment"; id: number; label: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  // ── Fetch helpers ────────────────────────────────────────────────────────────

  const normalizeInvoice = normalizeInvoiceDoc;

  const fetchInvoices = async () => {
    try {
      const res = await apiFetch("/api/billing/invoices?limit=200");
      const json = await res.json();
      setInvoices((Array.isArray(json.data) ? json.data : []).map(normalizeInvoice));
    } catch { /* silent */ }
  };

  const fetchPatients = async () => {
    try {
      const res = await apiFetch("/api/patients");
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.data ?? []);
      setPatients(
        list.map((p: any) => ({
          id: Number(p.id),
          label: `${p.users?.first_name ?? ""} ${p.users?.last_name ?? ""}`.trim(),
        }))
      );
    } catch { /* silent */ }
  };

  /**
   * The clinic's four figures come from the server, where they are defined
   * once. They used to be reduced over the loaded page of invoices, so a
   * clinic with more bills than the page fetched showed a wrong total under a
   * confident label.
   */
  const fetchClinicFigures = async () => {
    try {
      const res = await apiFetch("/api/billing/kpis");
      if (!res.ok) return;
      const all = (await res.json())?.all_time ?? {};
      setClinicFigures({
        billed: Number(all.total_billed ?? 0),
        paid: Number(all.total_collected ?? 0),
        unpaid: Number(all.total_outstanding ?? 0),
        bills: Number(all.total_invoices ?? 0),
        creditHeld: Number(all.total_credit_held ?? 0),
      });
    } catch { /* the loaded-rows fallback stands */ }
  };

  useEffect(() => {
    Promise.all([fetchInvoices(), fetchPatients(), fetchClinicFigures()]).finally(() =>
      setIsLoading(false),
    );
  }, []);

  /**
   * What the address bar can say. `view` picks the register; `patient` opens
   * that patient's money file (the common case, and what the chart links to);
   * `new=bill` is the old behaviour of `?patient=`, kept addressable.
   */
  const [deepLinkDone, setDeepLinkDone] = useState(false);

  useEffect(() => {
    // Read the query here and not in a lazy initial state: this page is
    // server-rendered first, so an initializer would run where there is no
    // window and hydration would keep that empty answer. It also waits for
    // the lists, so a link carrying only an id can still find the name.
    if (deepLinkDone || isLoading) return;
    setDeepLinkDone(true);
    const params = new URLSearchParams(window.location.search);
    const plans = params.get("view") === "plans";
    if (plans) setView("plans");

    const wanted = Number(params.get("patient"));
    if (wanted) {
      if (params.get("new") === "bill") {
        setBuilderPatientId(wanted);
        setShowBuilder(true);
      } else {
        openMoneyFile(wanted, plans ? "plan" : "timeline");
      }
    }
    if (params.toString()) window.history.replaceState(null, "", "/admin/billing");
  }, [deepLinkDone, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Money moved: the list, the clinic figures and any open money file follow. */
  const refreshMoney = async () => {
    await Promise.all([fetchInvoices(), fetchClinicFigures()]);
    setMoneyMoved((n) => n + 1);
  };

  /**
   * A new bill is listed at once. Taking the money for it is the other
   * page’s job, so the desk is pointed at it rather than handed a payment
   * form on the page that makes documents.
   */
  const handleInvoiceCreated = async (invoice: Invoice) => {
    await refreshMoney();
    toast.success(`${invoice.invoice_number} issued.`, {
      action: can("billing:create")
        ? {
            label: "Take payment",
            onClick: () => router.push(`/admin/payments?patient=${invoice.patient.id}`),
          }
        : undefined,
    });
  };


  // ── Filtering + stats ────────────────────────────────────────────────────────

  const bq = searchQuery.trim().toLowerCase();
  const matchesInvoiceSearch = (inv: TreatmentInvoice) =>
    !bq || `${inv.patient.users.first_name} ${inv.patient.users.last_name}`.toLowerCase().includes(bq);
  const filtered = invoices.filter(
    (inv) => matchesInvoiceSearch(inv) && (selectedStatus === "All" || inv.status === selectedStatus.toLowerCase()),
  );
  const invoiceStatusCounts: Record<string, number> = {
    All: invoices.filter(matchesInvoiceSearch).length,
    Open: invoices.filter((i) => matchesInvoiceSearch(i) && i.status === "open").length,
    Partial: invoices.filter((i) => matchesInvoiceSearch(i) && i.status === "partial").length,
    Paid: invoices.filter((i) => matchesInvoiceSearch(i) && i.status === "paid").length,
    Cancelled: invoices.filter((i) => matchesInvoiceSearch(i) && i.status === "cancelled").length,
  };
  const liveInvoices = invoices.filter((i) => i.status !== "cancelled");
  const hasInvoiceFilters = !!bq || selectedStatus !== "All";
  const clearInvoiceFilters = () => { setSearchQuery(""); setSelectedStatus("All"); };

  const totalInvoiced = liveInvoices.reduce((s, i) => s + i.total_amount, 0);
  const totalCollected = liveInvoices.reduce((s, i) => s + i.amount_paid, 0);
  const outstanding = liveInvoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.remaining_amount, 0);


  // ── Void (cancel) ───────────────────────────────────────────────────────────

  const handleVoid = async () => {
    if (!selectedInvoice) return;
    setVoidError("");
    if (voidReason.trim().length < 3) { setVoidError("Say why this invoice is cancelled."); return; }
    const paid = selectedInvoice.amount_paid;
    const what =
      paid > 0
        ? voidRefund
          ? ` The $${paid.toFixed(2)} received on it will be refunded.`
          : ` The $${paid.toFixed(2)} received on it goes back to the patient's receipts, still theirs.`
        : "";
    if (!window.confirm(`Cancel invoice ${selectedInvoice.invoice_number}? It stays on record as cancelled and is no longer owed.${what}`)) return;
    setVoiding(true);
    try {
      const res = await apiFetch(`/api/billing/invoices/${selectedInvoice.id}/void`, {
        method: "POST",
        body: JSON.stringify({
          reason: voidReason.trim(),
          ...(paid > 0 && voidRefund ? { refund: true, refund_method: voidRefundMethod } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to cancel the invoice");
      }
      const body = await res.json();
      const normalized = normalizeInvoice(body);
      await refreshMoney();
      const released = (body.released_receipts ?? []) as { document_number: string }[];
      const refunds = (body.refunds ?? []) as { document_number: string }[];
      toast.success(
        refunds.length > 0
          ? `Invoice cancelled. Refunded: ${refunds.map((r) => r.document_number).join(", ")}.`
          : released.length > 0
            ? `Invoice cancelled. The money is open again on ${released.map((r) => r.document_number).join(", ")}.`
            : "Invoice cancelled.",
      );
      setSelectedInvoice(normalized);
      setVoidReason("");
      setVoidRefund(false);
    } catch (e: any) {
      setVoidError(e.message ?? "Something went wrong.");
    } finally {
      setVoiding(false);
    }
  };

  // ── Delete (admin + password) ───────────────────────────────────────────────

  const requestDeleteInvoice = (inv: TreatmentInvoice) => {
    setConfirmError("");
    setConfirm({ kind: "invoice", id: inv.id, label: `Invoice ${inv.invoice_number} for ${inv.patient.users.first_name} ${inv.patient.users.last_name}` });
  };
  const requestDeletePayment = (p: InvoicePayment) => {
    setConfirmError("");
    setConfirm({ kind: "payment", id: p.id, label: `${p.kind === "refund" ? "Refund" : "Payment"} of ${p.amount.toFixed(2)}` });
  };

  const handleConfirmedDelete = async (password: string) => {
    if (!confirm) return;
    setConfirmBusy(true);
    setConfirmError("");
    const path = confirm.kind === "invoice" ? `/api/billing/invoices/${confirm.id}` : `/api/billing/payments/${confirm.id}`;
    try {
      const res = await apiFetch(path, { method: "DELETE", headers: { [CONFIRM_PASSWORD_HEADER]: password } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setConfirmError(err.message ?? "The deletion was refused.");
        return;
      }
      if (confirm.kind === "invoice") {
        setInvoices((prev) => prev.filter((i) => i.id !== confirm.id));
        void refreshMoney();
        setShowViewModal(false);
        setSelectedInvoice(null);
        toast.success("Invoice deleted.");
      } else {
        const normalized = normalizeInvoice(await res.json());
        await refreshMoney();
        setSelectedInvoice(normalized);
        toast.success("Removed.");
      }
      setConfirm(null);
    } catch {
      setConfirmError("The deletion could not be completed.");
    } finally {
      setConfirmBusy(false);
    }
  };

  /**
   * Open a patient's money file. The name is looked up where it is already
   * known — the patient list, then the bills on screen — so a deep link that
   * carries only an id still opens with a name on it.
   */
  const openMoneyFile = (id: number, tab: PatientDrawerTab = "timeline") => {
    const fromList = patients.find((p) => Number(p.id) === Number(id))?.label;
    const fromBill = invoices.find((i) => Number(i.patient.id) === Number(id))?.patient.users;
    setDrawerTab(tab);
    setDrawerPatient({
      id,
      label:
        fromList ||
        (fromBill ? `${fromBill.first_name} ${fromBill.last_name}` : `Patient #${id}`),
    });
  };

  /** Clicking a bill row opens the money file of the patient it bills. */
  const openHistory = (invoice: TreatmentInvoice) => {
    setDrawerTab("timeline");
    setDrawerPatient({
      id: Number(invoice.patient.id),
      label: `${invoice.patient.users.first_name} ${invoice.patient.users.last_name}`,
    });
  };

  const openViewModal = (invoice: TreatmentInvoice) => {
    setSelectedInvoice(invoice);
    setVoidRefund(false);
    setVoidReason("");
    setVoidError("");
    setShowViewModal(true);
  };

  /** A printable invoice / receipt: number, terms, lines, discount, what was paid and what is owed. */
  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("adminUser");
    void signOut(); // clears the session cookie (server-side) and every hint
    safeStorage.removeItem("userRole");
    router.push("/login");
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar activePage="billing" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title={t("billing.title")}
          subtitle={t("billing.subtitle")}
          onAdd={can("billing:create") ? () => { setBuilderPatientId(null); setShowBuilder(true); } : undefined}
          addLabel="New bill"
          actions={[
            { key: "dashboard", label: t("billing.goToDashboard"), icon: <FaChartLine />, href: "/admin" },
            { key: "analytics", label: "View analytics", icon: <FaFileInvoiceDollar />, href: "/admin/billing/analytics" },
          ]}
        />

        <main className="flex-1 p-8 overflow-auto">
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Across the clinic. The scope is said once, here, which is
                  what lets these four words mean the same thing in a
                  patient’s file without being synonyms of themselves. */}
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {MONEY_WORD.acrossTheClinic}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-3">
                <StatsCard
                  icon={FaFileInvoiceDollar}
                  iconBgClass="bg-blue-100"
                  iconColorClass="text-blue-600"
                  value={`$${(clinicFigures?.billed ?? totalInvoiced).toFixed(2)}`}
                  label={MONEY_WORD.billed}
                />
                <StatsCard
                  icon={FaCheckCircle}
                  iconBgClass="bg-green-100"
                  iconColorClass="text-green-600"
                  value={`$${(clinicFigures?.paid ?? totalCollected).toFixed(2)}`}
                  label={MONEY_WORD.paid}
                />
                <StatsCard
                  icon={FaClock}
                  iconBgClass="bg-yellow-100"
                  iconColorClass="text-yellow-600"
                  value={`$${(clinicFigures?.unpaid ?? outstanding).toFixed(2)}`}
                  label={MONEY_WORD.unpaid}
                />
                <StatsCard
                  icon={FaHashtag}
                  iconBgClass="bg-purple-100"
                  iconColorClass="text-purple-600"
                  value={String(clinicFigures?.bills ?? liveInvoices.length)}
                  label={MONEY_WORD.bills}
                />
              </div>

              {/* Billed minus Paid is not Unpaid while anyone is holding
                  credit, so the fourth figure is named rather than left for
                  the reader to discover by subtracting. */}
              <p className="mb-8 text-xs text-ink-500">
                {clinicFigures && clinicFigures.creditHeld > 0
                  ? `Of what came in, $${clinicFigures.creditHeld.toFixed(2)} is ${MONEY_WORD.creditOnAccount.toLowerCase()} — money no bill has claimed yet.`
                  : `${MONEY_WORD.billed} less ${MONEY_WORD.paid.toLowerCase()} is what is ${MONEY_WORD.unpaid.toLowerCase()}; nobody is holding credit.`}
              </p>

              {/* Two registers, one screen. A bill and a plan are different
                  documents, so they stay in separate lists — but they are the
                  same patient’s money story, so they share a screen, a search
                  box and one money file. */}
              <Tabs
                className="mb-5"
                label="Billing registers"
                value={view}
                onChange={setView}
                items={[
                  { id: "bills", label: "Bills", icon: <FaFileInvoiceDollar />, count: invoices.length },
                  { id: "plans", label: "Treatment plans", icon: <FaClipboardList /> },
                ]}
              />

              {view === "plans" ? (
                <QuotesPanel
                  onOpenPatient={(pt) => { setDrawerTab("plan"); setDrawerPatient(pt); }}
                />
              ) : (
              <>
              <ListToolbar
                search={{ value: searchQuery, onChange: setSearchQuery, placeholder: t("billing.searchPlaceholder") }}
                shown={filtered.length}
                total={invoices.length}
                unitLabel={t("billing.invoicesCount")}
                hasActiveFilters={hasInvoiceFilters}
                onClear={clearInvoiceFilters}
                clearLabel={t("common.clearFilters")}
                groups={[
                  {
                    key: "status",
                    variant: "segmented",
                    value: selectedStatus,
                    onChange: setSelectedStatus,
                    options: [
                      { value: "All", label: t("billing.statusAll"), count: invoiceStatusCounts.All },
                      { value: "Open", label: t("billing.statusOpen"), count: invoiceStatusCounts.Open, dot: "bg-amber-500" },
                      { value: "Partial", label: t("billing.statusPartial"), count: invoiceStatusCounts.Partial, dot: "bg-blue-500" },
                      { value: "Paid", label: t("billing.statusPaid"), count: invoiceStatusCounts.Paid, dot: "bg-emerald-500" },
                      { value: "Cancelled", label: "Cancelled", count: invoiceStatusCounts.Cancelled, dot: "bg-gray-400" },
                    ],
                  },
                ]}
              />

              {/* Table */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {filtered.length === 0 ? (
                  <EmptyState
                    icon={FaFileInvoiceDollar}
                    title={t("billing.noInvoices")}
                    description={t("billing.noInvoicesDesc")}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50/80 border-b border-gray-200">
                        <tr>
                          {["Invoice", t("billing.colPatient"), t("billing.colDate"), "Due", t("billing.colProcedures"), MONEY_WORD.billTotal, MONEY_WORD.paid, MONEY_WORD.unpaid, t("billing.colStatus"), ""].map((h) => (
                            <th key={h} className="px-5 py-3 text-start text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 stagger">
                        {filtered.map((inv) => (
                          /* The whole row is the way into that patient's history;
                             the action cell stops the click from reaching it. */
                          <tr
                            key={inv.id}
                            tabIndex={0}
                            aria-label={`Open the history of ${inv.patient.users.first_name} ${inv.patient.users.last_name}`}
                            onClick={() => openHistory(inv)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openHistory(inv);
                              }
                            }}
                            className="cursor-pointer transition-colors hover:bg-brand-50/60 focus-visible:bg-brand-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400"
                          >
                            <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">{inv.invoice_number}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar name={`${inv.patient.users.first_name} ${inv.patient.users.last_name}`} size="sm" />
                                <span className="font-medium text-gray-900">
                                  {inv.patient.users.first_name} {inv.patient.users.last_name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                              {formatDateBeirut(inv.procedure_date)}
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                              {formatDateBeirut(inv.due_date)}
                              {daysOverdue(inv) > 0 && (
                                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                  {daysOverdue(inv)}d overdue
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {inv.line_items.length} {inv.line_items.length !== 1 ? t("billing.items") : t("billing.item")}
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-900">${inv.total_amount.toFixed(2)}</td>
                            <td className="px-4 py-3 font-medium text-green-700">${inv.amount_paid.toFixed(2)}</td>
                            <td className="px-4 py-3 font-medium text-red-600">${inv.remaining_amount.toFixed(2)}</td>
                            <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openViewModal(inv)}
                                  className="p-2 text-brand hover:bg-blue-50 rounded-lg transition-colors"
                                  title={t("billing.viewInvoice")}
                                >
                                  <FaEye />
                                </button>
                                {can("billing:delete") && (
                                <button
                                  onClick={() => requestDeleteInvoice(inv)}
                                  disabled={inv.invoice_payments.length > 0}
                                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                                  title={inv.invoice_payments.length > 0 ? "Has payments: cancel it instead of deleting" : "Delete invoice (admin, password required)"}
                                >
                                  <FaTrash className="text-sm" />
                                </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              </>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── One patient's money file, opened from a row in either register ──── */}
      {/* A drawer, and rendered before the dialogs: the list stays visible
          behind it, and a bill, a payment or the builder opened from inside
          it stacks over it as a proper centred dialog. */}
      {drawerPatient && (
        <PatientDrawer
          patient={drawerPatient}
          isOpen={!!drawerPatient}
          onClose={() => setDrawerPatient(null)}
          initialTab={drawerTab}
          onViewInvoice={(inv) => openViewModal(inv)}
          /* No onTakePayment: money is received on the Payments page. */
          allowPlanActs
          onNewBill={() => {
            setBuilderPatientId(Number(drawerPatient.id));
            setShowBuilder(true);
          }}
          onChanged={() => void refreshMoney()}
          refreshToken={moneyMoved}
        />
      )}

      {/* ── Invoice detail: read it, print it, correct it ─────────────────────── */}
      {selectedInvoice && (
        <Modal
          isOpen={showViewModal}
          onClose={() => { setShowViewModal(false); setSelectedInvoice(null); }}
          title={`Invoice ${selectedInvoice.invoice_number} — ${selectedInvoice.patient.users.first_name} ${selectedInvoice.patient.users.last_name}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            {/* Info row */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
              <span><strong>{t("billing.dateLabel")}</strong> {formatDateBeirut(selectedInvoice.procedure_date)}</span>
              <span>
                <strong>Due:</strong> {formatDateBeirut(selectedInvoice.due_date)}
                {daysOverdue(selectedInvoice) > 0 && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">{daysOverdue(selectedInvoice)} days overdue</span>
                )}
              </span>
              <span><strong>{t("billing.statusLabel")}</strong> <StatusBadge status={selectedInvoice.status} /></span>
              {selectedInvoice.status !== "cancelled" && selectedInvoice.remaining_amount > 0 && (
                <span className="ms-auto text-xs text-ink-500">
                  Money is received on the Payments page.
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // The file is a drawer under this dialog, so close the
                  // dialog rather than stacking one on the other.
                  setShowViewModal(false);
                  openHistory(selectedInvoice);
                }}
                title="Every bill, every payment and the plan behind them"
              >
                Money file
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/admin/patients?patient=${selectedInvoice.patient.id}&tab=chart`)}
                className={selectedInvoice.remaining_amount > 0 ? "" : "ml-auto"}
                title="See the clinical work this bills"
              >
                Open the chart
              </Button>
              <Button variant="outline" size="sm" onClick={() => printInvoice(selectedInvoice)}>
                <FaPrint className="mr-2" /> {selectedInvoice.status === "paid" ? "Print receipt" : "Print"}
              </Button>
            </div>
            {selectedInvoice.status === "cancelled" && (
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <strong>Cancelled</strong>{selectedInvoice.cancelled_at ? ` on ${formatDateBeirut(selectedInvoice.cancelled_at)}` : ""}: {selectedInvoice.cancel_reason}
              </p>
            )}

            {selectedInvoice.notes && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 italic">{selectedInvoice.notes}</p>
            )}

            {/* Line items table */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">{t("billing.procedures")}</h4>
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">{t("billing.procedureCol")}</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">{t("billing.amountCol")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedInvoice.line_items.map((li) => (
                    <tr key={li.id}>
                      <td className="px-3 py-2 text-gray-800">
                        {li.procedure_name}
                        {li.tooth_number && (
                          <span className="ml-2 rtl:ml-0 rtl:mr-2 inline-block px-1.5 py-0.5 rounded bg-blue-50 text-brand text-xs font-semibold">
                            {t("dentalChart.toothCol")} {li.tooth_number}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-800">${li.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  {(selectedInvoice.discount_amount > 0 || selectedInvoice.vat_amount > 0) && (
                    <tr className="text-gray-600">
                      <td className="px-3 py-2">Subtotal</td>
                      <td className="px-3 py-2 text-right">${selectedInvoice.subtotal.toFixed(2)}</td>
                    </tr>
                  )}
                  {selectedInvoice.discount_amount > 0 && (
                    <tr className="text-gray-600">
                      <td className="px-3 py-2">Discount{selectedInvoice.discount_reason && <span className="ml-2 text-xs italic text-gray-500">{selectedInvoice.discount_reason}</span>}</td>
                      <td className="px-3 py-2 text-right">−${selectedInvoice.discount_amount.toFixed(2)}</td>
                    </tr>
                  )}
                  {selectedInvoice.vat_amount > 0 && (
                    <tr className="text-gray-600">
                      <td className="px-3 py-2">VAT {selectedInvoice.vat_percent}%</td>
                      <td className="px-3 py-2 text-right">${selectedInvoice.vat_amount.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2">{t("billing.total")}</td>
                    <td className="px-3 py-2 text-right">${selectedInvoice.total_amount.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Payment summary pills */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs text-blue-600 font-medium">{MONEY_WORD.billTotal}</p>
                <p className="text-lg font-bold text-blue-800">${selectedInvoice.total_amount.toFixed(2)}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs text-green-600 font-medium">{MONEY_WORD.paid}</p>
                <p className="text-lg font-bold text-green-800">${selectedInvoice.amount_paid.toFixed(2)}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-xs text-red-600 font-medium">{MONEY_WORD.unpaid}</p>
                <p className="text-lg font-bold text-red-800">${selectedInvoice.remaining_amount.toFixed(2)}</p>
              </div>
            </div>

            {/* Payment history */}
            {selectedInvoice.invoice_payments.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">{t("billing.paymentHistory")}</h4>
                <div className="space-y-2">
                  {selectedInvoice.invoice_payments.map((p) => (
                    <div key={p.id} className={`flex items-center justify-between text-sm rounded-lg px-3 py-2 ${p.kind === "refund" ? "bg-red-50" : "bg-gray-50"}`}>
                      <div>
                        <span className={`font-medium ${p.kind === "refund" ? "text-red-700" : "text-gray-800"}`}>
                          {p.kind === "refund" ? "−" : ""}${p.amount.toFixed(2)}
                        </span>
                        {p.document_number && <span className="ml-2 font-mono text-xs text-gray-600">{p.document_number}</span>}
                        {p.kind === "refund" && <span className="ml-2 text-xs font-semibold uppercase text-red-600">refund</span>}
                        <span className="ml-2 text-gray-500 capitalize">{p.payment_method}</span>
                        {p.reason && <span className="ml-2 text-gray-500 italic">{p.reason}</span>}
                        {p.notes && <span className="ml-2 text-gray-400 italic">{p.notes}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{formatDateBeirut(p.payment_date)}</span>
                        {can("billing:delete") && selectedInvoice.status !== "cancelled" && (
                          <button
                            type="button"
                            onClick={() => requestDeletePayment(p)}
                            className="p-1 text-red-300 hover:text-red-600 rounded"
                            title="Remove this row (admin, password required)"
                          >
                            <FaTrash className="text-xs" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Void — the invoice is not owed; it stays on record as cancelled */}
            {can("billing:edit") && selectedInvoice.status !== "cancelled" && (
              <details className="border-t border-gray-200 pt-4">
                <summary className="cursor-pointer font-semibold text-gray-800">Cancel this invoice</summary>
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-gray-600">The invoice stays on record, marked cancelled with your reason, and is no longer counted as owed. Chart work billed on it can be billed again.</p>
                  {selectedInvoice.amount_paid > 0 && (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <p>
                        ${selectedInvoice.amount_paid.toFixed(2)} was received on it. Cancelling is not refunding: that money goes back to the patient&apos;s receipts, open to use on another bill.
                      </p>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={voidRefund} onChange={(e) => setVoidRefund(e.target.checked)} />
                        <span>Also hand the ${selectedInvoice.amount_paid.toFixed(2)} back to the patient (refund)</span>
                      </label>
                      {voidRefund && (
                        <FormField label="Handed back by *">
                          <select value={voidRefundMethod} onChange={(e) => setVoidRefundMethod(e.target.value)} className={inputClass}>
                            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </FormField>
                      )}
                    </div>
                  )}
                  <FormField label="Reason *">
                    <input type="text" placeholder="Why this invoice is cancelled" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className={inputClass} />
                  </FormField>
                  {voidError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{voidError}</p>}
                  <Button variant="destructive" onClick={handleVoid} disabled={voiding} className="w-full">
                    {voiding ? "Cancelling…" : voidRefund && selectedInvoice.amount_paid > 0 ? "Cancel and refund" : "Cancel invoice"}
                  </Button>
                </div>
              </details>
            )}
          </div>
        </Modal>
      )}

      {/* ── New bill: the one place an invoice is created ─────────────────────── */}
      <NewInvoiceModal
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        patients={patients}
        initialPatientId={builderPatientId}
        onCreated={handleInvoiceCreated}
      />


      <PasswordConfirmModal
        open={!!confirm}
        title={confirm?.kind === "payment" ? "Remove this payment row" : "Delete this invoice"}
        description={confirm ? `${confirm.label} will be removed permanently. Prefer a refund or a cancellation when money was actually received.` : ""}
        busy={confirmBusy}
        error={confirmError}
        onConfirm={handleConfirmedDelete}
        onClose={() => { if (!confirmBusy) setConfirm(null); }}
      />
    </div>
  );
}
