"use client";

import { toast } from 'sonner';
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { StatsCard } from "@/components/ui/StatsCard";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Avatar } from "@/components/ui/Avatar";
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
} from "react-icons/fa";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROCEDURES = [
  "Checkup",
  "X-Ray",
  "Teeth Cleaning",
  "Whitening",
  "Tooth Extraction",
  "Root Canal",
  "Filling",
  "Crown",
  "Bridge",
  "Implant",
  "Orthodontic",
  "Veneers",
  "Gum Treatment",
  "Fluoride Treatment",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type LineItemForm = { procedure_name: string; amount: string };
type LineItem = { id: number; procedure_name: string; amount: number };

type InvoicePayment = {
  id: number;
  amount: number;
  payment_method: string;
  notes?: string;
  created_at: string;
};

type TreatmentInvoice = {
  id: number;
  patient: { id: number; users: { first_name: string; last_name: string; email: string } };
  procedure_date: string;
  notes?: string;
  total_amount: number;
  amount_paid: number;
  remaining_amount: number;
  status: "open" | "partial" | "paid";
  created_at: string;
  line_items: LineItem[];
  invoice_payments: InvoicePayment[];
};

type PatientOption = { id: number; label: string };

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-blue-100 text-blue-800",
    partial: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
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

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ patient_id: "", procedure_date: "", notes: "" });
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ procedure_name: "", amount: "" }]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // View / payment modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<TreatmentInvoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", payment_method: "cash", notes: "" });
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // ── Fetch helpers ────────────────────────────────────────────────────────────

  const normalizeInvoice = (inv: any): TreatmentInvoice => ({
    ...inv,
    id: Number(inv.id),
    total_amount: Number(inv.total_amount),
    amount_paid: Number(inv.amount_paid),
    remaining_amount: Number(inv.remaining_amount),
    line_items: (inv.line_items ?? []).map((li: any) => ({ ...li, id: Number(li.id), amount: Number(li.amount) })),
    invoice_payments: (inv.invoice_payments ?? []).map((p: any) => ({ ...p, id: Number(p.id), amount: Number(p.amount) })),
  });

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

  const filtered = invoices.filter((inv) => {
    const name = `${inv.patient.users.first_name} ${inv.patient.users.last_name}`.toLowerCase();
    return (
      (!searchQuery || name.includes(searchQuery.toLowerCase())) &&
      (selectedStatus === "All" || inv.status === selectedStatus.toLowerCase())
    );
  });

  const totalInvoiced = invoices.reduce((s, i) => s + i.total_amount, 0);
  const totalCollected = invoices.reduce((s, i) => s + i.amount_paid, 0);
  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.remaining_amount, 0);

  // ── Line item helpers ─────────────────────────────────────────────────────────

  const addLineItem = () => setLineItems((p) => [...p, { procedure_name: "", amount: "" }]);
  const removeLineItem = (idx: number) => setLineItems((p) => p.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: keyof LineItemForm, value: string) =>
    setLineItems((p) => p.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  const computedTotal = lineItems.reduce((s, item) => s + (parseFloat(item.amount) || 0), 0);

  const resetCreateModal = () => {
    setCreateForm({ patient_id: "", procedure_date: "", notes: "" });
    setLineItems([{ procedure_name: "", amount: "" }]);
    setCreateError("");
  };

  // ── Create invoice ────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreateError("");
    if (!createForm.patient_id) { setCreateError("Please select a patient."); return; }
    if (!createForm.procedure_date) { setCreateError("Please select a procedure date."); return; }
    for (const item of lineItems) {
      if (!item.procedure_name) { setCreateError("Please select a procedure for all line items."); return; }
      if (!item.amount || parseFloat(item.amount) <= 0) {
        setCreateError("Please enter a valid amount for all line items.");
        return;
      }
    }
    setCreating(true);
    try {
      const res = await apiFetch("/api/billing/invoices", {
        method: "POST",
        body: JSON.stringify({
          patient_id: Number(createForm.patient_id),
          procedure_date: createForm.procedure_date,
          notes: createForm.notes || undefined,
          line_items: lineItems.map((item) => ({
            procedure_name: item.procedure_name,
            amount: parseFloat(item.amount),
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to create invoice");
      }
      await fetchInvoices();
      toast.success("Invoice created.");
      setShowCreateModal(false);
      resetCreateModal();
    } catch (e: any) {
      setCreateError(e.message ?? "Something went wrong.");
      toast.error(e.message ?? "Failed to create invoice.");
    } finally {
      setCreating(false);
    }
  };

  // ── Record payment ────────────────────────────────────────────────────────────

  const resetPaymentForm = () => { setPaymentForm({ amount: "", payment_method: "cash", notes: "" }); setPaymentError(""); };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    setPaymentError("");
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { setPaymentError("Enter a valid amount."); return; }
    if (amount > selectedInvoice.remaining_amount + 0.001) {
      setPaymentError(`Amount exceeds remaining balance ($${selectedInvoice.remaining_amount.toFixed(2)}).`);
      return;
    }
    setRecordingPayment(true);
    try {
      const res = await apiFetch(`/api/billing/invoices/${selectedInvoice.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount, payment_method: paymentForm.payment_method, notes: paymentForm.notes || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to record payment");
      }
      const updated = await res.json();
      const normalized = normalizeInvoice(updated);
      await fetchInvoices();
      toast.success("Payment recorded.");
      setSelectedInvoice(normalized);
      resetPaymentForm();
    } catch (e: any) {
      setPaymentError(e.message ?? "Something went wrong.");
      toast.error(e.message ?? "Failed to record payment.");
    } finally {
      setRecordingPayment(false);
    }
  };

  const openViewModal = (invoice: TreatmentInvoice) => {
    setSelectedInvoice(invoice);
    resetPaymentForm();
    setShowViewModal(true);
  };

  // ── Export / Import data ─────────────────────────────────────────────────────

  const exportData = invoices.map((inv) => ({
    id: inv.id,
    patient_name: `${inv.patient.users.first_name} ${inv.patient.users.last_name}`,
    patient_email: inv.patient.users.email,
    patient_id: inv.patient.id,
    procedure_date: new Date(inv.procedure_date).toLocaleDateString("en-CA"),
    procedures: inv.line_items.map((li) => `${li.procedure_name}: ${li.amount.toFixed(2)}`).join("; "),
    total_amount: inv.total_amount,
    amount_paid: inv.amount_paid,
    remaining_amount: inv.remaining_amount,
    status: inv.status,
    notes: inv.notes ?? "",
  }));

  const handleImport = async (rows: Record<string, unknown>[]) => {
    let created = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const patientId = Number(row.patient_id);
        const procedureDate = String(row.procedure_date ?? "");
        const procedureName = String(row.procedure_name ?? row.procedures ?? "");
        const amount = Number(row.amount ?? row.total_amount ?? 0);
        if (!patientId || !procedureDate || !procedureName || amount <= 0) { failed++; continue; }
        const firstProc = procedureName.split(";")[0].split(":")[0].trim();
        const validProc = PROCEDURES.includes(firstProc as typeof PROCEDURES[number]) ? firstProc : "Checkup";
        const res = await apiFetch("/api/billing/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_id: patientId,
            procedure_date: procedureDate,
            notes: String(row.notes ?? "") || undefined,
            line_items: [{ procedure_name: validProc, amount }],
          }),
        });
        if (res.ok) created++; else failed++;
      } catch { failed++; }
    }
    await fetchInvoices();
    if (created) toast.success(`${created} invoice(s) imported.`);
    if (failed) toast.error(`${failed} row(s) failed (missing patient_id, date, or amount).`);
  };

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
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar activePage="billing" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col">
        <AdminPageHeader
          title={t("billing.title")}
          subtitle={t("billing.subtitle")}
          data={exportData}
          filename="invoices"
          onImport={handleImport}
          onAdd={() => { resetCreateModal(); setShowCreateModal(true); }}
          addLabel={t("billing.newInvoice")}
          extraActions={
            <Link
              href="/admin"
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              <FaChartLine className="text-xs" /> {t("billing.goToDashboard")}
            </Link>
          }
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
                  value={String(invoices.length)}
                  label={t("billing.totalInvoices")}
                />
              </div>

              {/* Filters */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-wrap gap-3 items-center">
                <input
                  type="text"
                  placeholder={t("billing.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`${inputClass} w-64`}
                />
                <div className="flex gap-2">
                  {([
                    { value: "All", label: t("billing.statusAll") },
                    { value: "Open", label: t("billing.statusOpen") },
                    { value: "Partial", label: t("billing.statusPartial") },
                    { value: "Paid", label: t("billing.statusPaid") },
                  ]).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSelectedStatus(value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        selectedStatus === value
                          ? "bg-dental-blue text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

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
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {[t("billing.colPatient"), t("billing.colDate"), t("billing.colProcedures"), t("billing.colTotal"), t("billing.colPaid"), t("billing.colRemaining"), t("billing.colStatus"), ""].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filtered.map((inv) => (
                          <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar name={`${inv.patient.users.first_name} ${inv.patient.users.last_name}`} size="sm" />
                                <span className="font-medium text-gray-900">
                                  {inv.patient.users.first_name} {inv.patient.users.last_name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                              {new Date(inv.procedure_date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {inv.line_items.length} {inv.line_items.length !== 1 ? t("billing.items") : t("billing.item")}
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-900">${inv.total_amount.toFixed(2)}</td>
                            <td className="px-4 py-3 font-medium text-green-700">${inv.amount_paid.toFixed(2)}</td>
                            <td className="px-4 py-3 font-medium text-red-600">${inv.remaining_amount.toFixed(2)}</td>
                            <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => openViewModal(inv)}
                                className="p-2 text-dental-blue hover:bg-blue-50 rounded-lg transition-colors"
                                title={t("billing.viewInvoice")}
                              >
                                <FaEye />
                              </button>
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

      {/* ── Create Invoice Modal ───────────────────────────────────────────────── */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetCreateModal(); }}
        title={t("billing.createInvoice")}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <FormField label={t("billing.patientRequired")}>
            <select
              value={createForm.patient_id}
              onChange={(e) => setCreateForm((f) => ({ ...f, patient_id: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("billing.selectPatient")}</option>
              {patients
                .slice()
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
            </select>
          </FormField>

          <FormField label={t("billing.procedureDateRequired")}>
            <input
              type="date"
              value={createForm.procedure_date}
              onChange={(e) => setCreateForm((f) => ({ ...f, procedure_date: e.target.value }))}
              className={inputClass}
            />
          </FormField>

          <FormField label={t("billing.notesOptional")}>
            <textarea
              value={createForm.notes}
              onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder={t("billing.additionalNotes")}
              className={`${inputClass} resize-none`}
            />
          </FormField>

          {/* Line items */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t("billing.proceduresRequired")}</label>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={item.procedure_name}
                    onChange={(e) => updateLineItem(idx, "procedure_name", e.target.value)}
                    className="flex-1 min-w-0 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue text-gray-900 bg-white"
                  >
                    <option value="">{t("billing.selectProcedure")}</option>
                    {PROCEDURES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("billing.amountCol")}
                    value={item.amount}
                    onChange={(e) => updateLineItem(idx, "amount", e.target.value)}
                    className="w-32 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue text-gray-900 bg-white"
                  />
                  {lineItems.length > 1 && (
                    <button
                      onClick={() => removeLineItem(idx)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    >
                      <FaTrash className="text-sm" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLineItem}
              className="mt-2 flex items-center gap-1 text-sm text-dental-blue hover:text-dental-teal font-medium"
            >
              <FaPlus className="text-xs" /> {t("billing.addLineItem")}
            </button>
            <div className="mt-3 text-right text-sm font-semibold text-gray-800">
              {t("billing.total")}: <span className="text-dental-blue text-base">${computedTotal.toFixed(2)}</span>
            </div>
          </div>

          {createError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {createError}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => { setShowCreateModal(false); resetCreateModal(); }}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? t("billing.creating") : t("billing.createInvoiceBtn")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── View / Record Payment Modal ────────────────────────────────────────── */}
      {selectedInvoice && (
        <Modal
          isOpen={showViewModal}
          onClose={() => { setShowViewModal(false); setSelectedInvoice(null); }}
          title={`Invoice #${selectedInvoice.id} — ${selectedInvoice.patient.users.first_name} ${selectedInvoice.patient.users.last_name}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            {/* Info row */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <span><strong>{t("billing.dateLabel")}</strong> {new Date(selectedInvoice.procedure_date).toLocaleDateString()}</span>
              <span><strong>{t("billing.statusLabel")}</strong> <StatusBadge status={selectedInvoice.status} /></span>
            </div>

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
                      <td className="px-3 py-2 text-gray-800">{li.procedure_name}</td>
                      <td className="px-3 py-2 text-right text-gray-800">${li.amount.toFixed(2)}</td>
                    </tr>
                  ))}
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
                    <div key={p.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <div>
                        <span className="font-medium text-gray-800">${p.amount.toFixed(2)}</span>
                        <span className="ml-2 text-gray-500 capitalize">{p.payment_method}</span>
                        {p.notes && <span className="ml-2 text-gray-400 italic">{p.notes}</span>}
                      </div>
                      <span className="text-gray-400">{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Record payment — only when not fully paid */}
            {selectedInvoice.status !== "paid" && (
              <div className="border-t border-gray-200 pt-4">
                <h4 className="font-semibold text-gray-800 mb-3">{t("billing.recordPayment")}</h4>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <FormField label={`Amount (max $${selectedInvoice.remaining_amount.toFixed(2)}) *`}>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={selectedInvoice.remaining_amount}
                          placeholder="0.00"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                          className={inputClass}
                        />
                      </FormField>
                    </div>
                    <div className="flex-1">
                      <FormField label={t("billing.paymentMethodRequired")}>
                        <select
                          value={paymentForm.payment_method}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, payment_method: e.target.value }))}
                          className={inputClass}
                        >
                          <option value="cash">{t("billing.cash")}</option>
                          <option value="card">{t("billing.card")}</option>
                          <option value="insurance">{t("billing.insurance")}</option>
                          <option value="bank_transfer">{t("billing.bankTransfer")}</option>
                        </select>
                      </FormField>
                    </div>
                  </div>
                  <FormField label={t("billing.notesOptional")}>
                    <input
                      type="text"
                      placeholder={t("billing.notesPlaceholder")}
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                      className={inputClass}
                    />
                  </FormField>
                  {paymentError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {paymentError}
                    </p>
                  )}
                  <Button onClick={handleRecordPayment} disabled={recordingPayment} className="w-full">
                    {recordingPayment ? t("billing.recording") : t("billing.recordPayment")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
