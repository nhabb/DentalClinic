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
import { QuotesPanel } from "@/components/billing/QuotesPanel";
import { CONFIRM_PASSWORD_HEADER, PasswordConfirmModal } from "@/components/billing/PasswordConfirmModal";
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

type LineItemForm = { procedure_name: string; amount: string; tooth_number: string };
type LineItem = { id: number; procedure_name: string; amount: number; tooth_number?: string | null };

type InvoicePayment = {
  id: number;
  /** payment = money received, refund = money returned (shown as a minus). */
  kind: "payment" | "refund";
  amount: number;
  payment_method: string;
  /** The day the money moved; may be earlier than created_at. */
  payment_date: string;
  reason?: string | null;
  notes?: string;
  created_at: string;
};

type TreatmentInvoice = {
  id: number;
  /** Sequential per clinic and year (INV-2026-00017): what the patient sees. */
  invoice_number: string;
  patient: { id: number; users: { first_name: string; last_name: string; email: string } };
  procedure_date: string;
  /** Payment terms: balances age from this day. */
  due_date: string;
  notes?: string;
  /** Lines before the discount; total_amount = subtotal - discount_amount. */
  subtotal: number;
  discount_amount: number;
  discount_reason?: string | null;
  total_amount: number;
  amount_paid: number;
  remaining_amount: number;
  status: "open" | "partial" | "paid" | "cancelled";
  cancel_reason?: string | null;
  cancelled_at?: string | null;
  /** The accepted quote this invoice was billed from, if any. */
  quote?: { id: number; quote_number: string; version: number; quoted_total: number } | null;
  created_at: string;
  line_items: LineItem[];
  invoice_payments: InvoicePayment[];
};

/** Today on the clinic's calendar (Beirut), as YYYY-MM-DD: what "received today" means at the desk. */
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Whole days an owed balance is past its due date; 0 when settled, cancelled or not yet due. */
function daysOverdue(inv: Pick<TreatmentInvoice, "due_date" | "status">): number {
  if (inv.status === "paid" || inv.status === "cancelled") return 0;
  const due = new Date(`${inv.due_date.slice(0, 10)}T00:00:00Z`).getTime();
  const today = new Date(`${todayIso()}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((today - due) / 86_400_000));
}

/** Text from patients and staff goes into the printable page as text, never as markup. */
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

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

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const emptyCreateForm = { patient_id: "", procedure_date: "", due_date: "", notes: "", discount_amount: "", discount_reason: "" };
  const emptyLine: LineItemForm = { procedure_name: "", amount: "", tooth_number: "" };
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [lineItems, setLineItems] = useState<LineItemForm[]>([emptyLine]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // View / payment modal
  const { can } = usePermissions();
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<TreatmentInvoice | null>(null);
  const emptyPaymentForm = () => ({ amount: "", payment_method: "cash", payment_date: todayIso(), notes: "" });
  const emptyRefundForm = () => ({ amount: "", payment_method: "cash", payment_date: todayIso(), reason: "" });
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // Invoices or quotes
  const [view, setView] = useState<"invoices" | "quotes">("invoices");

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

  const normalizeInvoice = (inv: any): TreatmentInvoice => ({
    ...inv,
    id: Number(inv.id),
    invoice_number: inv.invoice_number ?? `#${inv.id}`,
    due_date: inv.due_date ?? inv.procedure_date,
    subtotal: Number(inv.subtotal ?? inv.total_amount),
    discount_amount: Number(inv.discount_amount ?? 0),
    total_amount: Number(inv.total_amount),
    amount_paid: Number(inv.amount_paid),
    remaining_amount: Number(inv.remaining_amount),
    line_items: (inv.line_items ?? []).map((li: any) => ({ ...li, id: Number(li.id), amount: Number(li.amount) })),
    invoice_payments: (inv.invoice_payments ?? []).map((p: any) => ({ ...p, id: Number(p.id), amount: Number(p.amount), kind: p.kind ?? "payment", payment_date: p.payment_date ?? p.created_at })),
    quote: inv.quote ? { ...inv.quote, id: Number(inv.quote.id), quoted_total: Number(inv.quote.quoted_total) } : null,
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

  // ── Line item helpers ─────────────────────────────────────────────────────────

  const addLineItem = () => setLineItems((p) => [...p, emptyLine]);
  const removeLineItem = (idx: number) => setLineItems((p) => p.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: keyof LineItemForm, value: string) =>
    setLineItems((p) => p.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  const computedSubtotal = lineItems.reduce((s, item) => s + (parseFloat(item.amount) || 0), 0);
  const computedDiscount = parseFloat(createForm.discount_amount) || 0;
  const computedTotal = computedSubtotal - computedDiscount;

  const resetCreateModal = () => {
    setCreateForm(emptyCreateForm);
    setLineItems([emptyLine]);
    setCreateError("");
  };

  // ── Create invoice ────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreateError("");
    if (!createForm.patient_id) { setCreateError("Please select a patient."); return; }
    if (!createForm.procedure_date) { setCreateError("Please select a procedure date."); return; }
    for (const item of lineItems) {
      if (!item.procedure_name) { setCreateError("Please select a procedure for all line items."); return; }
      if (item.amount === "" || parseFloat(item.amount) < 0) {
        setCreateError("Please enter a valid amount for all line items (0 for free of charge).");
        return;
      }
      if (parseFloat(item.amount) > 100000) {
        setCreateError("Amount cannot exceed $100,000 per line item.");
        return;
      }
    }
    if (computedDiscount < 0 || computedDiscount > computedSubtotal) { setCreateError("The discount cannot exceed the line items."); return; }
    if (computedDiscount > 0 && createForm.discount_reason.trim().length < 3) { setCreateError("Say why the discount is given."); return; }
    if (createForm.due_date && createForm.due_date < createForm.procedure_date) { setCreateError("The due date cannot be before the procedure date."); return; }
    setCreating(true);
    try {
      const res = await apiFetch("/api/billing/invoices", {
        method: "POST",
        body: JSON.stringify({
          patient_id: Number(createForm.patient_id),
          procedure_date: createForm.procedure_date,
          due_date: createForm.due_date || undefined,
          notes: createForm.notes || undefined,
          discount_amount: computedDiscount || undefined,
          discount_reason: computedDiscount ? createForm.discount_reason.trim() : undefined,
          line_items: lineItems.map((item) => ({
            procedure_name: item.procedure_name,
            amount: parseFloat(item.amount),
            tooth_number: item.tooth_number.trim() || undefined,
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

  const resetPaymentForm = () => { setPaymentForm(emptyPaymentForm()); setPaymentError(""); };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    setPaymentError("");
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { setPaymentError("Enter a valid amount."); return; }
    if (amount > 100000) { setPaymentError("Amount cannot exceed $100,000."); return; }
    if (amount > selectedInvoice.remaining_amount + 0.001) {
      setPaymentError(`Amount exceeds remaining balance ($${selectedInvoice.remaining_amount.toFixed(2)}).`);
      return;
    }
    setRecordingPayment(true);
    try {
      const res = await apiFetch(`/api/billing/invoices/${selectedInvoice.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount, payment_method: paymentForm.payment_method, payment_date: paymentForm.payment_date || undefined, notes: paymentForm.notes || undefined }),
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
    resetPaymentForm();
    setRefundForm(emptyRefundForm());
    setRefundError("");
    setVoidReason("");
    setVoidError("");
    setShowViewModal(true);
  };

  /** A printable invoice / receipt: number, terms, lines, discount, what was paid and what is owed. */
  const printInvoice = (inv: TreatmentInvoice) => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const lines = inv.line_items
      .map((li) => `<tr><td>${esc(li.procedure_name)}${li.tooth_number ? ` <small>(tooth ${esc(li.tooth_number)})</small>` : ""}</td><td class="r">${li.amount.toFixed(2)}</td></tr>`)
      .join("");
    const money = inv.invoice_payments
      .map((p) => `<tr><td>${formatDateBeirut(p.payment_date)} · ${p.kind === "refund" ? "Refund" : "Payment"} · ${esc(p.payment_method)}${p.reason ? ` <small>${esc(p.reason)}</small>` : ""}</td><td class="r">${p.kind === "refund" ? "−" : ""}${p.amount.toFixed(2)}</td></tr>`)
      .join("");
    const overdue = daysOverdue(inv);
    w.document.write(`<!doctype html><html><head><title>Invoice ${esc(inv.invoice_number)}</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#1e2533}h1{font-size:22px;margin:0 0 4px}
      table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:8px;border-bottom:1px solid #dfe6f1;text-align:left}
      .r{text-align:right}tfoot td{font-weight:700;border-top:2px solid #1e2533}small{color:#6d7d97}.meta{color:#6d7d97;font-size:13px}
      .owed{margin-top:20px;font-size:18px;font-weight:700}.stamp{display:inline-block;border:2px solid #1e2533;padding:2px 8px;font-weight:700;letter-spacing:.08em}</style></head><body>
      <h1>${inv.status === "paid" ? "Receipt" : "Invoice"} ${esc(inv.invoice_number)}${inv.status === "cancelled" ? ' <span class="stamp">CANCELLED</span>' : inv.status === "paid" ? ' <span class="stamp">PAID</span>' : ""}</h1>
      <div class="meta">Work done ${formatDateBeirut(inv.procedure_date)} · due ${formatDateBeirut(inv.due_date)}${overdue > 0 ? ` (${overdue} days overdue)` : ""}${inv.quote ? ` · from quote ${esc(inv.quote.quote_number)}` : ""}</div>
      <p><strong>${esc(inv.patient.users.first_name)} ${esc(inv.patient.users.last_name)}</strong></p>
      <table><thead><tr><th>Procedure</th><th class="r">Amount</th></tr></thead><tbody>${lines}</tbody>
      <tfoot>${inv.discount_amount > 0 ? `<tr><td style="font-weight:400">Subtotal</td><td class="r" style="font-weight:400">${inv.subtotal.toFixed(2)}</td></tr><tr><td style="font-weight:400">Discount${inv.discount_reason ? ` <small>${esc(inv.discount_reason)}</small>` : ""}</td><td class="r" style="font-weight:400">−${inv.discount_amount.toFixed(2)}</td></tr>` : ""}
      <tr><td>Total</td><td class="r">${inv.total_amount.toFixed(2)}</td></tr></tfoot></table>
      ${money ? `<table><thead><tr><th>Money received</th><th class="r"></th></tr></thead><tbody>${money}</tbody></table>` : ""}
      <p class="owed">Balance due: ${inv.status === "cancelled" ? "0.00 (cancelled)" : inv.remaining_amount.toFixed(2)}</p>
      ${inv.notes ? `<p>${esc(inv.notes)}</p>` : ""}
      <script>window.print()</script></body></html>`);
    w.document.close();
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
    <div className="min-h-screen bg-white flex">
      <AdminSidebar activePage="billing" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title={t("billing.title")}
          subtitle={t("billing.subtitle")}
          onAdd={can("billing:write") ? () => { resetCreateModal(); setShowCreateModal(true); } : undefined}
          addLabel={t("billing.newInvoice")}
          actions={[
            { key: "dashboard", label: t("billing.goToDashboard"), icon: <FaChartLine />, href: "/admin" },
            { key: "analytics", label: "View analytics", icon: <FaFileInvoiceDollar />, href: "/admin/billing/analytics" },
          ]}
        />

        <main className="flex-1 p-8 overflow-auto">
          <div className="mb-6 inline-flex rounded-xl border border-ink-200 bg-ink-50 p-1 text-sm font-medium">
            {(["invoices", "quotes"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-lg px-4 py-1.5 capitalize transition-colors ${view === v ? "bg-white text-brand shadow-sm" : "text-ink-500 hover:text-ink-800"}`}
              >
                {v}
              </button>
            ))}
          </div>
          {view === "quotes" ? (
            <QuotesPanel patients={patients} procedures={PROCEDURES} />
          ) : isLoading ? (
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

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("billing.procedureDateRequired")}>
              <input
                type="date"
                value={createForm.procedure_date}
                onChange={(e) => setCreateForm((f) => ({ ...f, procedure_date: e.target.value }))}
                className={inputClass}
              />
            </FormField>
            <FormField label="Due date (blank = due on receipt)">
              <input
                type="date"
                value={createForm.due_date}
                min={createForm.procedure_date || undefined}
                onChange={(e) => setCreateForm((f) => ({ ...f, due_date: e.target.value }))}
                className={inputClass}
              />
            </FormField>
          </div>

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
                    className="flex-1 min-w-0 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-gray-900 bg-white"
                  >
                    <option value="">{t("billing.selectProcedure")}</option>
                    {PROCEDURES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="Tooth"
                    title="FDI tooth number (optional)"
                    value={item.tooth_number}
                    onChange={(e) => updateLineItem(idx, "tooth_number", e.target.value)}
                    className="w-20 px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-gray-900 bg-white"
                  />
                  <input
                    type="number"
                    min="0"
                    max={100000}
                    step="0.01"
                    placeholder={t("billing.amountCol")}
                    value={item.amount}
                    onChange={(e) => updateLineItem(idx, "amount", e.target.value)}
                    className="w-32 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-gray-900 bg-white"
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
              className="mt-2 flex items-center gap-1 text-sm text-brand hover:text-brand-400 font-medium"
            >
              <FaPlus className="text-xs" /> {t("billing.addLineItem")}
            </button>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <FormField label="Discount (optional)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={createForm.discount_amount}
                  onChange={(e) => setCreateForm((f) => ({ ...f, discount_amount: e.target.value }))}
                  className={inputClass}
                />
              </FormField>
              <FormField label={computedDiscount > 0 ? "Discount reason *" : "Discount reason"}>
                <input
                  type="text"
                  placeholder="Family discount, goodwill, …"
                  value={createForm.discount_reason}
                  onChange={(e) => setCreateForm((f) => ({ ...f, discount_reason: e.target.value }))}
                  className={inputClass}
                />
              </FormField>
            </div>
            <div className="mt-3 text-right text-sm text-gray-700 space-y-0.5">
              {computedDiscount > 0 && (
                <>
                  <p>Subtotal: ${computedSubtotal.toFixed(2)}</p>
                  <p>Discount: −${computedDiscount.toFixed(2)}</p>
                </>
              )}
              <p className="font-semibold text-gray-800">
                {t("billing.total")}: <span className="text-brand text-base">${computedTotal.toFixed(2)}</span>
              </p>
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
              <Button variant="outline" size="sm" onClick={() => printInvoice(selectedInvoice)} className="ml-auto">
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

            {/* Record payment — only while the invoice is live and not fully paid */}
            {can("billing:write") && selectedInvoice.status !== "paid" && selectedInvoice.status !== "cancelled" && (
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
                  <FormField label="Received on *">
                    <input
                      type="date"
                      value={paymentForm.payment_date}
                      max={todayIso()}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
                      className={inputClass}
                    />
                  </FormField>
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
