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
import { CONFIRM_PASSWORD_HEADER, PasswordConfirmModal } from "@/components/billing/PasswordConfirmModal";
import {
  daysOverdue,
  Invoice,
  InvoicePayment,
  normalizeInvoice as normalizeInvoiceDoc,
  printInvoice,
} from "@/components/billing/invoice-doc";
import { clinicToday as todayIso } from "@/components/billing/quote-doc";
import {
  FaFileInvoiceDollar,
  FaDollarSign,
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

/** The invoice shape, its printing and its aging live in one shared module. */
type TreatmentInvoice = Invoice;
type PatientOption = { id: number; label: string };

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-blue-100 text-blue-800",
    partial: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
    cancelled: "bg-gray-200 text-gray-600 line-through",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${map[status] ?? "bg-gray-100 text-gray-800"}`}>
      {status}
    </span>
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

  // Bills are built in the dental chart, so "New bill" only picks the patient.
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  // View / payment modal
  const { can } = usePermissions();
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<TreatmentInvoice | null>(null);
  const emptyRefundForm = () => ({ amount: "", payment_method: "cash", payment_date: todayIso(), reason: "" });

  // Invoices or quotes

  // Refund / void forms (inside the invoice modal)
  const [refundForm, setRefundForm] = useState(emptyRefundForm);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState("");
  const [voidReason, setVoidReason] = useState("");
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

  useEffect(() => {
    Promise.all([fetchInvoices(), fetchPatients()]).finally(() => setIsLoading(false));
  }, []);

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


  // ── Refund ──────────────────────────────────────────────────────────────────

  const handleRefund = async () => {
    if (!selectedInvoice) return;
    setRefundError("");
    const amount = parseFloat(refundForm.amount);
    if (!amount || amount <= 0) { setRefundError("Enter the amount being returned."); return; }
    if (amount > selectedInvoice.amount_paid + 0.001) {
      setRefundError(`Cannot refund more than was received (${selectedInvoice.amount_paid.toFixed(2)}).`);
      return;
    }
    if (refundForm.reason.trim().length < 3) { setRefundError("Say why the money is being returned."); return; }
    setRefunding(true);
    try {
      const res = await apiFetch(`/api/billing/invoices/${selectedInvoice.id}/refunds`, {
        method: "POST",
        body: JSON.stringify({ amount, payment_method: refundForm.payment_method, payment_date: refundForm.payment_date || undefined, reason: refundForm.reason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to record the refund");
      }
      const normalized = normalizeInvoice(await res.json());
      await fetchInvoices();
      toast.success("Refund recorded.");
      setSelectedInvoice(normalized);
      setRefundForm(emptyRefundForm());
    } catch (e: any) {
      setRefundError(e.message ?? "Something went wrong.");
    } finally {
      setRefunding(false);
    }
  };

  // ── Void (cancel) ───────────────────────────────────────────────────────────

  const handleVoid = async () => {
    if (!selectedInvoice) return;
    setVoidError("");
    if (voidReason.trim().length < 3) { setVoidError("Say why this invoice is cancelled."); return; }
    if (!window.confirm(`Cancel invoice ${selectedInvoice.invoice_number}? It stays on record as cancelled and is no longer owed.`)) return;
    setVoiding(true);
    try {
      const res = await apiFetch(`/api/billing/invoices/${selectedInvoice.id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to cancel the invoice");
      }
      const normalized = normalizeInvoice(await res.json());
      await fetchInvoices();
      toast.success("Invoice cancelled.");
      setSelectedInvoice(normalized);
      setVoidReason("");
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
        setShowViewModal(false);
        setSelectedInvoice(null);
        toast.success("Invoice deleted.");
      } else {
        const normalized = normalizeInvoice(await res.json());
        await fetchInvoices();
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

  const openViewModal = (invoice: TreatmentInvoice) => {
    setSelectedInvoice(invoice);
    setRefundForm(emptyRefundForm());
    setRefundError("");
    setVoidReason("");
    setVoidError("");
    setShowViewModal(true);
  };

  /** A printable invoice / receipt: number, terms, lines, discount, what was paid and what is owed. */
  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("authToken");
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
          onAdd={can("billing:write") ? () => { setPickerQuery(""); setShowPicker(true); } : undefined}
          addLabel="New bill"
          actions={[
            { key: "dashboard", label: t("billing.goToDashboard"), icon: <FaChartLine />, href: "/admin" },
            { key: "quotes", label: "Quotes", icon: <FaClipboardList />, href: "/admin/billing/quotes" },
            { key: "analytics", label: "View analytics", icon: <FaFileInvoiceDollar />, href: "/admin/billing/analytics" },
          ]}
        />

        <main className="flex-1 p-8 overflow-auto">
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatsCard
                  icon={FaFileInvoiceDollar}
                  iconBgClass="bg-blue-100"
                  iconColorClass="text-blue-600"
                  value={`$${totalInvoiced.toFixed(2)}`}
                  label={t("billing.totalInvoiced")}
                />
                <StatsCard
                  icon={FaCheckCircle}
                  iconBgClass="bg-green-100"
                  iconColorClass="text-green-600"
                  value={`$${totalCollected.toFixed(2)}`}
                  label={t("billing.totalCollected")}
                />
                <StatsCard
                  icon={FaClock}
                  iconBgClass="bg-yellow-100"
                  iconColorClass="text-yellow-600"
                  value={`$${outstanding.toFixed(2)}`}
                  label={t("billing.outstanding")}
                />
                <StatsCard
                  icon={FaHashtag}
                  iconBgClass="bg-purple-100"
                  iconColorClass="text-purple-600"
                  value={String(liveInvoices.length)}
                  label={t("billing.totalInvoices")}
                />
              </div>

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
                          {["Invoice", t("billing.colPatient"), t("billing.colDate"), "Due", t("billing.colProcedures"), t("billing.colTotal"), t("billing.colPaid"), t("billing.colRemaining"), t("billing.colStatus"), ""].map((h) => (
                            <th key={h} className="px-5 py-3 text-start text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 stagger">
                        {filtered.map((inv) => (
                          <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
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
                            <td className="px-4 py-3">
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
        </main>
      </div>

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
              {selectedInvoice.quote && (
                <span><strong>Quote:</strong> {selectedInvoice.quote.quote_number} v{selectedInvoice.quote.version} (estimate ${selectedInvoice.quote.quoted_total.toFixed(2)})</span>
              )}
              {/* Money is taken on the chart, so the invoice links back to it. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/admin/patients?patient=${selectedInvoice.patient.id}&tab=chart`)}
                className="ml-auto"
              >
                Open in chart
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
                  {selectedInvoice.discount_amount > 0 && (
                    <>
                      <tr className="text-gray-600">
                        <td className="px-3 py-2">Subtotal</td>
                        <td className="px-3 py-2 text-right">${selectedInvoice.subtotal.toFixed(2)}</td>
                      </tr>
                      <tr className="text-gray-600">
                        <td className="px-3 py-2">Discount{selectedInvoice.discount_reason && <span className="ml-2 text-xs italic text-gray-500">{selectedInvoice.discount_reason}</span>}</td>
                        <td className="px-3 py-2 text-right">−${selectedInvoice.discount_amount.toFixed(2)}</td>
                      </tr>
                    </>
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
                <p className="text-xs text-blue-600 font-medium">{t("billing.total")}</p>
                <p className="text-lg font-bold text-blue-800">${selectedInvoice.total_amount.toFixed(2)}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs text-green-600 font-medium">{t("billing.colPaid")}</p>
                <p className="text-lg font-bold text-green-800">${selectedInvoice.amount_paid.toFixed(2)}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-xs text-red-600 font-medium">{t("billing.colRemaining")}</p>
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

            {/* Refund — money back to the patient, never more than was received */}
            {can("billing:write") && selectedInvoice.status !== "cancelled" && selectedInvoice.amount_paid > 0 && (
              <details className="border-t border-gray-200 pt-4">
                <summary className="cursor-pointer font-semibold text-gray-800">Refund money to the patient</summary>
                <div className="mt-3 space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <FormField label={`Amount (max ${selectedInvoice.amount_paid.toFixed(2)}) *`}>
                        <input type="number" min="0.01" step="0.01" max={selectedInvoice.amount_paid} placeholder="0.00" value={refundForm.amount}
                          onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))} className={inputClass} />
                      </FormField>
                    </div>
                    <div className="flex-1">
                      <FormField label="Returned by *">
                        <select value={refundForm.payment_method} onChange={(e) => setRefundForm((f) => ({ ...f, payment_method: e.target.value }))} className={inputClass}>
                          <option value="cash">{t("billing.cash")}</option>
                          <option value="card">{t("billing.card")}</option>
                          <option value="insurance">{t("billing.insurance")}</option>
                          <option value="bank_transfer">{t("billing.bankTransfer")}</option>
                        </select>
                      </FormField>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Returned on *">
                      <input type="date" value={refundForm.payment_date} max={todayIso()}
                        onChange={(e) => setRefundForm((f) => ({ ...f, payment_date: e.target.value }))} className={inputClass} />
                    </FormField>
                    <FormField label="Reason *">
                      <input type="text" placeholder="Why the money is returned" value={refundForm.reason}
                        onChange={(e) => setRefundForm((f) => ({ ...f, reason: e.target.value }))} className={inputClass} />
                    </FormField>
                  </div>
                  {refundError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{refundError}</p>}
                  <Button variant="outline" onClick={handleRefund} disabled={refunding} className="w-full">
                    {refunding ? "Recording…" : "Record refund"}
                  </Button>
                </div>
              </details>
            )}

            {/* Void — the invoice is not owed; it stays on record as cancelled */}
            {can("billing:write") && selectedInvoice.status !== "cancelled" && (
              <details className="border-t border-gray-200 pt-4">
                <summary className="cursor-pointer font-semibold text-gray-800">Cancel this invoice</summary>
                <div className="mt-3 space-y-3">
                  {selectedInvoice.amount_paid > 0 ? (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      ${selectedInvoice.amount_paid.toFixed(2)} was received on this invoice. Refund it first; then it can be cancelled.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600">The invoice stays on record, marked cancelled with your reason, and is no longer counted as owed. Chart work billed on it can be billed again.</p>
                      <FormField label="Reason *">
                        <input type="text" placeholder="Why this invoice is cancelled" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className={inputClass} />
                      </FormField>
                      {voidError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{voidError}</p>}
                      <Button variant="destructive" onClick={handleVoid} disabled={voiding} className="w-full">
                        {voiding ? "Cancelling…" : "Cancel invoice"}
                      </Button>
                    </>
                  )}
                </div>
              </details>
            )}
          </div>
        </Modal>
      )}

      {/* ── New bill: pick the patient, build it on their chart ───────────────── */}
      <Modal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        title="New bill: choose the patient"
        maxWidth="max-w-lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Bills are built on the dental chart, where the work is, so the
            invoice always matches what was done. Pick a patient to open theirs.
          </p>
          <input
            type="text"
            autoFocus
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            placeholder="Search by name…"
            className={inputClass}
          />
          <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
            {patients
              .filter((p) => p.label.toLowerCase().includes(pickerQuery.trim().toLowerCase()))
              .slice(0, 50)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => router.push(`/admin/patients?patient=${p.id}&tab=chart`)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <Avatar name={p.label} size="sm" />
                  <span className="font-medium text-gray-900">{p.label}</span>
                </button>
              ))}
            {patients.filter((p) => p.label.toLowerCase().includes(pickerQuery.trim().toLowerCase())).length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-gray-500">No patient matches that name.</p>
            )}
          </div>
        </div>
      </Modal>

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
