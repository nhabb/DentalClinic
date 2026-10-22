"use client";

// Expenses admin page: the bills the clinic receives and what it paid on them.
//
// Backend contract (NestJS, BrightsmileClinicBack src/doctor/expenses):
//   GET    /api/expenses?limit                  → { data: Expense[] } (due repeating expenses are created first)
//   POST   /api/expenses                        → create; the database gives it an EX26-00012 number
//   PATCH  /api/expenses/:id                    → update
//   DELETE /api/expenses/:id                    → delete
//   GET    /api/expenses/:id                    → one expense with payments and attachments
//   POST   /api/expenses/:id/payments           → record a partial/full payment, returns updated expense
//   DELETE /api/expenses/:id/payments/:paymentId→ remove a payment, returns updated expense
//   POST   /api/expenses/:id/attachments        → keep a file (multipart "file")
//   /api/expense-categories, /api/expense-suppliers, /api/expense-reminders → the lists behind the form
//
// The user-facing "description" is stored in the backend `title` column; the
// free notes go in `description`. Payment status is derived server-side from
// `amount_paid` vs `amount`: pending (nothing paid) | partial | paid.

import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { StatsCard } from "@/components/ui/StatsCard";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { MonthCalendar, MonthTotalsList, ORANGE_RAMP, firstOfMonth, monthKey } from "@/components/ui/MonthCalendar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Tabs } from "@/components/ui/Tabs";
import { ShowMore } from "@/components/ui/ShowMore";
import { useDebounced, usePagedList } from "@/lib/api/paged";
import {
  FaMoneyBillWave,
  FaCheckCircle,
  FaClock,
  FaAdjust,
  FaEdit,
  FaTrash,
  FaReceipt,
  FaDollarSign,
  FaPaperclip,
  FaBell,
  FaListUl,
  FaRedo,
} from "react-icons/fa";
import { useSignOut } from "@/lib/auth/useSignOut";
import {
  mapExpense,
  mapPayment,
  readError,
  todayIso as today,
  type Expense,
  type ExpenseCategory,
  type ExpensePayment,
  type ExpenseStatus,
  type Supplier,
} from "@/components/expenses/expense-types";
import { SupplierPicker } from "@/components/expenses/SupplierPicker";
import {
  ACCEPTED_FILES,
  ExpenseAttachments,
  uploadExpenseFile,
} from "@/components/expenses/ExpenseAttachments";
import { ExpenseListsModal, fetchExpenseLists } from "@/components/expenses/ExpenseListsModal";
import { RemindersPanel } from "@/components/expenses/RemindersPanel";

const paymentMethods = ["cash", "card", "bank_transfer", "cheque", "other"] as const;
const paymentMethodLabelKey: Record<string, string> = {
  cash: "cash",
  card: "card",
  bank_transfer: "bankTransfer",
  cheque: "cheque",
  other: "otherMethod",
};

const emptyForm = () => ({
  description: "",
  category: "supplies",
  amount: "",
  status: "pending" as "paid" | "pending",
  /** Bill date: the date on the supplier's bill. */
  date: today(),
  supplierId: null as number | null,
  supplierBillNumber: "",
  vatIncluded: "",
  notes: "",
  /** With status "paid": how, and the day the money left. */
  paymentMethod: "cash" as (typeof paymentMethods)[number],
  paidDate: today(),
});

const emptyPaymentForm = {
  amount: "",
  method: "cash" as (typeof paymentMethods)[number],
  date: today(),
  notes: "",
};

/** meta.counts of GET /api/expenses?with_counts=true. */
type ExpenseCounts = {
  category: Record<string, number>;
  status: Partial<Record<ExpenseStatus, number>>;
  to_pay: { count: number; remaining: number };
  clinic: { count: number; amount: number; paid: number; remaining: number };
};

/** One bill day of GET /api/expenses/calendar. */
type CalendarDay = { date: string; amount: number; amount_paid: number; count: number };

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lastOfMonth = (first: Date) => new Date(first.getFullYear(), first.getMonth() + 1, 0);

/** Export is of every bill, not just the ten on screen. */
async function exportAllExpenses(): Promise<Expense[]> {
  const res = await apiFetch("/api/expenses?limit=1000");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return ((await res.json()).data ?? []).map(mapExpense);
}

/** The page's three views: every bill, what is still to pay, and the repeating ones. */
type View = "all" | "to_pay" | "repeating";

export default function ExpensesPage() {
  // Only offer what this role's API permissions allow (the API refuses the rest anyway).
  const { can } = usePermissions();
  const { t, language } = useTranslation();
  const locale = language === "ar" ? "ar-LB" : language === "fr" ? "fr-FR" : "en-US";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedExpenseStatus, setSelectedExpenseStatus] = useState<"all" | ExpenseStatus>("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => firstOfMonth());
  /** When on, the table shows only the month displayed in the calendar. */
  const [monthFilterOn, setMonthFilterOn] = useState(true);
  const tableRef = useRef<HTMLDivElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyForm);
  /** Files picked in the add form; uploaded once the expense exists. */
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [view, setView] = useState<View>("all");
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [listsOpen, setListsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Partial payments
  const [paymentExpense, setPaymentExpense] = useState<Expense | null>(null);
  const [payments, setPayments] = useState<ExpensePayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);

  const fetchLists = async () => {
    try {
      const lists = await fetchExpenseLists();
      setCategories(lists.categories);
      setSuppliers(lists.suppliers);
    } catch {
      /* the form falls back to the category key */
    }
  };

  useEffect(() => {
    fetchLists();
  }, []);

  const handleLogout = useSignOut();

  /** The clinic's own name for a category, falling back to the old translations. */
  const categoryLabel = (key: string) => {
    const own = categories.find((c) => c.key === key)?.name;
    if (own) return own;
    const translated = t(`expenses.${key}`);
    return translated === `expenses.${key}`
      ? key.charAt(0).toUpperCase() + key.slice(1)
      : translated;
  };
  const activeCategories = categories.filter((c) => c.is_active);
  const categoryChoices = (current?: string) =>
    categories.filter((c) => c.is_active || c.key === current);

  // The API searches, filters, counts and pages; the screen shows ten bills at a time.
  const eq = useDebounced(searchQuery.trim());
  const listFilters = {
    search: eq,
    category: selectedCategory === "All" ? undefined : selectedCategory,
    status: selectedExpenseStatus === "all" ? undefined : selectedExpenseStatus,
  };
  const dayRange =
    selectedDay !== null
      ? { from: selectedDay, to: selectedDay }
      : monthFilterOn
        ? { from: isoDay(calMonth), to: isoDay(lastOfMonth(calMonth)) }
        : {};
  const list = usePagedList<Expense, ExpenseCounts>({
    path: "/api/expenses",
    params: { ...listFilters, ...dayRange },
    map: mapExpense,
    withCounts: true,
  });
  const toPayList = usePagedList<Expense>({
    path: "/api/expenses",
    params: { search: eq, to_pay: true },
    map: mapExpense,
    enabled: view === "to_pay",
  });
  const expenses = list.rows;
  const isLoading = list.loading && expenses.length === 0 && !list.counts;

  // The calendar and the twelve-month strip read day sums, not every bill:
  // the last twelve months, widened to the month on display.
  const stripStart = firstOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1));
  const calFrom = isoDay(calMonth < stripStart ? calMonth : stripStart);
  const calTo = isoDay(lastOfMonth(calMonth > firstOfMonth() ? calMonth : firstOfMonth()));
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [calendarVersion, setCalendarVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ from: calFrom, to: calTo });
    for (const [k, v] of Object.entries(listFilters)) if (v) q.set(k, v);
    apiFetch(`/api/expenses/calendar?${q}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((days: CalendarDay[]) => alive && setCalendarDays(days))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calFrom, calTo, listFilters.search, listFilters.category, listFilters.status, calendarVersion]);

  /** After any change: the lists, their counts and the calendar all ask again. */
  const fetchExpenses = async () => {
    setCalendarVersion((v) => v + 1);
    await Promise.all([list.reload(), view === "to_pay" ? toPayList.reload() : Promise.resolve()]);
  };

  const goToMonth = (first: Date) => { setCalMonth(first); setMonthFilterOn(true); setSelectedDay(null); };
  const pickDay = (d: string | null) => {
    setSelectedDay(d);
    if (d) {
      setCalMonth(firstOfMonth(new Date(`${d}T12:00:00`)));
      setMonthFilterOn(true);
      setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  };
  const filteredExpenses = expenses;
  const calendarItems = calendarDays.map((d) => ({ date: d.date, amount: d.amount, count: d.count }));
  const monthDays = calendarDays.filter((d) => d.date.slice(0, 7) === monthKey(calMonth));
  const monthPaid = monthDays.reduce((s, d) => s + d.amount_paid, 0);
  const monthRemaining = monthDays.reduce((s, d) => s + Math.max(0, d.amount - d.amount_paid), 0);
  const categoryFilterValues = ["All", ...activeCategories.map((c) => c.key)];
  const counts = list.counts;
  const statusTotals = counts?.status ?? {};
  const expenseCategoryCounts: Record<string, number> = Object.fromEntries(
    categoryFilterValues.map((c) => [
      c,
      c === "All" ? Object.values(counts?.category ?? {}).reduce((a, n) => a + n, 0) : counts?.category[c] ?? 0,
    ]),
  );
  /** To pay: every bill not fully paid, oldest bill first. */
  const toPay = toPayList.rows;
  const expenseStatusCounts = {
    all: (statusTotals.pending ?? 0) + (statusTotals.partial ?? 0) + (statusTotals.paid ?? 0),
    pending: statusTotals.pending ?? 0,
    partial: statusTotals.partial ?? 0,
    paid: statusTotals.paid ?? 0,
  };
  const hasExpenseFilters = !!searchQuery.trim() || selectedCategory !== "All" || selectedExpenseStatus !== "all" || selectedDay !== null || monthFilterOn;
  const clearExpenseFilters = () => { setSearchQuery(""); setSelectedCategory("All"); setSelectedExpenseStatus("all"); setSelectedDay(null); setMonthFilterOn(false); };

  const totalAmount = counts?.clinic.amount ?? 0;
  const totalPaid = counts?.clinic.paid ?? 0;
  const totalRemaining = counts?.clinic.remaining ?? 0;

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  const toPayTotal = counts?.to_pay.remaining ?? 0;

  const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString();

  /** Replace one expense in the list from a fresh API payload. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyUpdatedExpense = (raw: any) => {
    const updated = mapExpense(raw);
    const swap = (prev: Expense[]) => prev.map((e) => (e.id === updated.id ? updated : e));
    list.setRows(swap);
    toPayList.setRows(swap);
    // Totals, counts and the To pay queue move with the money.
    void fetchExpenses();
    return updated;
  };

  // ── Add / Edit ──────────────────────────────────────────────────────────────

  const handleOpenAdd = () => {
    setForm(emptyForm());
    setNewFiles([]);
    setShowAddModal(true);
  };

  const handleOpenEdit = (expense: Expense) => {
    setSelectedExpense(expense);
    setForm({
      ...emptyForm(),
      description: expense.description,
      category: expense.category,
      amount: String(expense.amount),
      status: expense.status === "paid" ? "paid" : "pending",
      date: expense.date,
      supplierId: expense.supplier?.id ?? null,
      supplierBillNumber: expense.supplierBillNumber ?? "",
      vatIncluded: expense.vatIncluded != null ? String(expense.vatIncluded) : "",
      notes: expense.notes ?? "",
    });
    setShowEditModal(true);
  };

  const validateAmount = (value: string): number | null => {
    const parsed = parseFloat(value);
    if (!parsed || parsed <= 0) {
      toast.error(t("expenses.invalidAmount"));
      return null;
    }
    if (parsed > 1000000) {
      toast.error("Amount cannot exceed $1,000,000.");
      return null;
    }
    return parsed;
  };

  /** The fields the add and edit forms share, as the API names them. */
  const expenseBody = (amount: number) => {
    const vat = parseFloat(form.vatIncluded);
    return {
      title: form.description.trim(),
      expense_date: form.date,
      category: form.category,
      amount,
      supplier_id: form.supplierId,
      supplier_bill_number: form.supplierBillNumber.trim() || null,
      vat_included: Number.isFinite(vat) && vat > 0 ? vat : null,
      description: form.notes.trim(),
    };
  };

  const handleAdd = async () => {
    const parsedAmount = validateAmount(form.amount);
    if (parsedAmount === null) return;
    if (!form.description.trim()) {
      toast.error(t("expenses.descriptionPlaceholder"));
      return;
    }
    setIsSaving(true);
    try {
      const res = await apiFetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...expenseBody(parsedAmount), status: form.status,
          ...(form.status === "paid" ? { payment_method: form.paymentMethod, paid_date: form.paidDate } : {}),
        }),
      });
      if (!res.ok) {
        toast.error(await readError(res, t("expenses.saveFailed")));
        return;
      }
      const created = mapExpense(await res.json());
      // Files go up once the expense exists; a failed upload keeps the expense.
      for (const file of newFiles) {
        try {
          await uploadExpenseFile(created.id, file);
        } catch (e) {
          toast.error((e as Error).message);
        }
      }
      await fetchExpenses();
      toast.success(`Expense ${created.number} added. Write ${created.number} on the paper bill.`);
      setShowAddModal(false);
    } catch {
      toast.error(t("expenses.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (!selectedExpense) return;
    const parsedAmount = validateAmount(form.amount);
    if (parsedAmount === null) return;
    if (parsedAmount + 0.005 < selectedExpense.amountPaid) {
      toast.error(t("expenses.amountBelowPaid"));
      return;
    }
    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/expenses/${selectedExpense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expenseBody(parsedAmount)),
      });
      if (!res.ok) {
        toast.error(await readError(res, t("expenses.saveFailed")));
        return;
      }
      applyUpdatedExpense(await res.json());
      toast.success("Expense updated.");
      setShowEditModal(false);
    } catch {
      toast.error(t("expenses.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readError(res, "Could not delete the expense."));
        return;
      }
      await fetchExpenses();
      toast.success("Expense deleted.");
    } catch {
      toast.error("Could not delete the expense.");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Payments ────────────────────────────────────────────────────────────────

  const loadPayments = async (expenseId: number) => {
    setPaymentsLoading(true);
    try {
      const res = await apiFetch(`/api/expenses/${expenseId}/payments`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPayments((Array.isArray(data) ? data : []).map(mapPayment));
    } catch {
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const handleOpenPayments = (expense: Expense) => {
    setShowEditModal(false);
    setPaymentExpense(expense);
    setPaymentForm({
      ...emptyPaymentForm,
      amount: expense.remaining > 0 ? expense.remaining.toFixed(2) : "",
      date: today(),
    });
    loadPayments(expense.id);
  };

  const handleClosePayments = () => {
    setPaymentExpense(null);
    setPayments([]);
  };

  const handleRecordPayment = async () => {
    if (!paymentExpense) return;
    const parsed = validateAmount(paymentForm.amount);
    if (parsed === null) return;
    if (parsed > paymentExpense.remaining + 0.005) {
      toast.error(t("expenses.exceedsRemaining"));
      return;
    }
    setIsSubmittingPayment(true);
    try {
      const res = await apiFetch(`/api/expenses/${paymentExpense.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsed,
          payment_method: paymentForm.method,
          payment_date: paymentForm.date,
          ...(paymentForm.notes.trim() ? { notes: paymentForm.notes.trim() } : {}),
        }),
      });
      if (!res.ok) {
        toast.error(await readError(res, t("expenses.paymentFailed")));
        return;
      }
      const raw = await res.json();
      const updated = applyUpdatedExpense(raw);
      setPaymentExpense(updated);
      setPayments((raw.payments ?? []).map(mapPayment));
      setPaymentForm({
        ...emptyPaymentForm,
        amount: updated.remaining > 0 ? updated.remaining.toFixed(2) : "",
        date: today(),
      });
      toast.success(t("expenses.paymentRecorded"));
    } catch {
      toast.error(t("expenses.paymentFailed"));
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!paymentExpense) return;
    if (!window.confirm(t("expenses.deletePaymentConfirm"))) return;
    setDeletingPaymentId(paymentId);
    try {
      const res = await apiFetch(`/api/expenses/${paymentExpense.id}/payments/${paymentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(await readError(res, t("expenses.paymentFailed")));
        return;
      }
      const raw = await res.json();
      const updated = applyUpdatedExpense(raw);
      setPaymentExpense(updated);
      setPayments((raw.payments ?? []).map(mapPayment));
      setPaymentForm((f) => ({ ...f, amount: updated.remaining.toFixed(2) }));
      toast.success(t("expenses.paymentDeleted"));
    } catch {
      toast.error(t("expenses.paymentFailed"));
    } finally {
      setDeletingPaymentId(null);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const StatusBadge = ({ status }: { status: ExpenseStatus }) => {
    if (status === "paid") {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
          <FaCheckCircle className="text-xs" /> {t("expenses.paidBadge")}
        </span>
      );
    }
    if (status === "partial") {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
          <FaAdjust className="text-xs" /> {t("expenses.partialBadge")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
        <FaClock className="text-xs" /> {t("expenses.pendingBadge")}
      </span>
    );
  };

  const BalanceSummary = ({ expense }: { expense: Expense }) => (
    <div className="grid grid-cols-3 gap-3 rounded-xl bg-gray-50 border border-gray-100 p-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{t("expenses.totalAmount")}</p>
        <p className="mt-1 font-semibold text-gray-900">{formatAmount(expense.amount)}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{t("expenses.amountPaid")}</p>
        <p className="mt-1 font-semibold text-green-700">{formatAmount(expense.amountPaid)}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{t("expenses.remaining")}</p>
        <p className={`mt-1 font-semibold ${expense.remaining > 0 ? "text-red-600" : "text-gray-900"}`}>
          {formatAmount(expense.remaining)}
        </p>
      </div>
    </div>
  );

  /** Who the bill is from and what is printed on it: shared by add and edit. */
  const billFields = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Supplier">
          <SupplierPicker
            suppliers={suppliers}
            value={form.supplierId}
            onChange={(id) => setForm((f) => ({ ...f, supplierId: id }))}
            onAdded={(sup) => setSuppliers((prev) => [...prev, sup])}
            canAdd={can("expenses:create")}
          />
        </FormField>
        <FormField label="Supplier's bill number">
          <input
            type="text"
            placeholder="The number on their paper (optional)"
            className={inputClass}
            value={form.supplierBillNumber}
            onChange={(e) => setForm((f) => ({ ...f, supplierBillNumber: e.target.value }))}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="VAT included (optional)">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="As shown on the bill"
            className={inputClass}
            value={form.vatIncluded}
            onChange={(e) => setForm((f) => ({ ...f, vatIncluded: e.target.value }))}
          />
        </FormField>
        <FormField label="Notes">
          <input
            type="text"
            placeholder="What was bought, details"
            className={inputClass}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </FormField>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar activePage="expenses" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title={t("expenses.title")}
          subtitle={t("expenses.subtitle")}
          data={exportAllExpenses}
          filename="expenses"
          onImport={async (rows) => {
            let ok = 0; let fail = 0;
            const importDate = today();
            for (const row of rows as Record<string, unknown>[]) {
              try {
                const rawCat = String(row.category ?? "other").toLowerCase();
                const known = categories.find((c) => c.key === rawCat || c.name.toLowerCase() === rawCat);
                const category = known?.key ?? "other";
                const rawStatus = String(row.status ?? "pending").toLowerCase();
                const payload = {
                  title: String(row.description ?? row.title ?? "Imported Expense"),
                  category,
                  amount: Number(row.amount ?? 0),
                  expense_date: String(row.date ?? row.expense_date ?? importDate),
                  status: rawStatus === "paid" ? "paid" : "pending",
                };
                if (!payload.title || payload.amount <= 0) { fail++; continue; }
                const res = await apiFetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                if (res.ok) { ok++; } else {
                  const err = await res.text().catch(() => res.status.toString());
                  console.error("Expense import row failed:", res.status, err, payload);
                  fail++;
                }
              } catch (e) { console.error("Expense import exception:", e); fail++; }
            }
            await fetchExpenses();
            if (ok > 0) toast.success(`${ok} expense${ok > 1 ? "s" : ""} imported.`);
            if (fail > 0) toast.error(`${fail} row${fail > 1 ? "s" : ""} failed.`);
          }}
          onAdd={can("expenses:create") ? handleOpenAdd : undefined}
          addLabel={t("expenses.addExpense")}
          actions={[
            { key: "lists", label: "Categories & suppliers", icon: <FaListUl />, onClick: () => setListsOpen(true) },
            { key: "analytics", label: "View analytics", icon: <FaDollarSign />, href: "/admin/expenses/analytics" },
          ]}
        />

        <main className="flex-1 p-8 overflow-auto">
          {isLoading ? (
            <LoadingSpinner />
          ) : (<>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatsCard
              icon={FaMoneyBillWave}
              iconBgClass="bg-blue-100"
              iconColorClass="text-blue-600"
              value={formatAmount(totalAmount)}
              label={t("expenses.totalThisMonth")}
            />
            <StatsCard
              icon={FaCheckCircle}
              iconBgClass="bg-green-100"
              iconColorClass="text-green-600"
              value={formatAmount(totalPaid)}
              label={t("expenses.paid")}
            />
            <StatsCard
              icon={FaClock}
              iconBgClass="bg-yellow-100"
              iconColorClass="text-yellow-600"
              value={formatAmount(totalRemaining)}
              label={t("expenses.remaining")}
            />
          </div>

          <Tabs
            className="mb-5"
            label="Expense views"
            value={view}
            onChange={setView}
            items={[
              { id: "all", label: "All expenses", icon: <FaReceipt />, count: counts?.clinic.count ?? 0 },
              { id: "to_pay", label: "To pay", icon: <FaClock />, count: counts?.to_pay.count ?? 0 },
              { id: "repeating", label: "Repeating", icon: <FaRedo /> },
            ]}
          />

          {view === "repeating" && (
            <RemindersPanel
              categories={categories}
              suppliers={suppliers}
              onSupplierAdded={(sup) => setSuppliers((prev) => [...prev, sup])}
              onChanged={() => void fetchExpenses()}
              canCreate={can("expenses:create")}
              canEdit={can("expenses:edit")}
              canDelete={can("expenses:delete")}
            />
          )}

          {view === "to_pay" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Every bill not fully paid, oldest first: <strong>{formatAmount(toPayTotal)}</strong> to pay.
              </p>
              {toPayList.loading && toPay.length === 0 ? (
                <LoadingSpinner />
              ) : toPay.length === 0 ? (
                <EmptyState icon={FaCheckCircle} title="Nothing to pay" description="Every bill the clinic received is paid." />
              ) : (
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white">
                  {toPay.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                      <span className="w-24 shrink-0 text-sm text-gray-600">{formatDate(e.date)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">
                          {e.description}
                          {e.reminder && <FaBell className="ms-2 inline text-xs text-amber-500" title={`Repeating: ${e.reminder.title}`} />}
                        </p>
                        <p className="text-xs text-gray-500">
                          <span className="font-mono">{e.number}</span>
                          {e.supplier && ` · ${e.supplier.name}`}
                          {e.supplierBillNumber && ` · bill ${e.supplierBillNumber}`}
                          {e.amount === 0 && " · enter the amount from the bill"}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-red-600">{formatAmount(e.remaining)}</span>
                      <div className="flex gap-2">
                        {can("expenses:edit") && e.amount === 0 && (
                          <Button size="sm" variant="outline" onClick={() => handleOpenEdit(e)}>
                            <FaEdit /> Enter amount
                          </Button>
                        )}
                        <Button size="sm" onClick={() => handleOpenPayments(e)} disabled={e.amount === 0}>
                          <FaDollarSign /> {t("expenses.recordPayment")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <ShowMore shown={toPay.length} total={toPayList.total} loading={toPayList.loadingMore} onClick={toPayList.loadMore} />
            </div>
          )}

          {view === "all" && (<>
          <ListToolbar
            search={{ value: searchQuery, onChange: setSearchQuery, placeholder: "Search by description, EX number, supplier or bill number" }}
            shown={list.total}
            total={counts?.clinic.count ?? 0}
            unitLabel={t("expenses.expensesCount")}
            hasActiveFilters={hasExpenseFilters}
            onClear={clearExpenseFilters}
            clearLabel={t("common.clearFilters")}
            groups={[
              {
                key: "category",
                label: t("expenses.category"),
                variant: "chips",
                value: selectedCategory,
                onChange: setSelectedCategory,
                options: categoryFilterValues.map((cat) => ({ value: cat, label: cat === "All" ? t("expenses.all") : categoryLabel(cat), count: expenseCategoryCounts[cat] ?? 0 })),
              },
              {
                key: "status",
                variant: "segmented",
                value: selectedExpenseStatus,
                onChange: (v) => setSelectedExpenseStatus(v as "all" | ExpenseStatus),
                options: [
                  { value: "all", label: t("common.all"), count: expenseStatusCounts.all },
                  { value: "pending", label: t("expenses.pendingBadge"), count: expenseStatusCounts.pending, dot: "bg-amber-500" },
                  { value: "partial", label: t("expenses.partialBadge"), count: expenseStatusCounts.partial, dot: "bg-blue-500" },
                  { value: "paid", label: t("expenses.paidBadge"), count: expenseStatusCounts.paid, dot: "bg-emerald-500" },
                ],
              },
            ]}
          />

          {/* Monthly calendar */}
          <div className="mb-6 grid gap-6 xl:grid-cols-3">
            <MonthCalendar
              className="xl:col-span-2"
              month={calMonth}
              onMonthChange={goToMonth}
              items={calendarItems}
              selectedDate={selectedDay}
              onSelectDate={pickDay}
              locale={locale}
              ramp={ORANGE_RAMP}
              formatter={formatAmount}
              labels={{
                title: t("expenses.calendarTitle"),
                subtitle: t("expenses.calendarHint"),
                today: t("common.today"),
                less: t("common.less"),
                more: t("common.more"),
                total: t("expenses.monthTotal"),
                biggestDay: t("expenses.biggestDay"),
                empty: t("expenses.noExpensesMonth"),
                count: (n) => `${n} ${t("expenses.expensesCount")}`,
              }}
              aside={
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-emerald-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-emerald-700/70">{t("expenses.paid")}</p>
                    <p className="text-sm font-semibold tabular-nums text-emerald-700">{formatAmount(monthPaid)}</p>
                  </div>
                  <div className={`rounded-xl px-3 py-2 ${monthRemaining > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                    <p className={`text-[10px] uppercase tracking-wide ${monthRemaining > 0 ? "text-red-700/70" : "text-gray-400"}`}>{t("expenses.remaining")}</p>
                    <p className={`text-sm font-semibold tabular-nums ${monthRemaining > 0 ? "text-red-700" : "text-gray-500"}`}>{formatAmount(monthRemaining)}</p>
                  </div>
                  {selectedDay === null && (
                    <div className="col-span-2">
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-gray-400">{t("expenses.tableShows")}</p>
                      {monthFilterOn ? (
                        <button
                          type="button"
                          onClick={() => setMonthFilterOn(false)}
                          title={t("expenses.showAllMonths")}
                          className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-xs font-medium capitalize text-brand transition hover:bg-brand/15"
                        >
                          {calMonth.toLocaleDateString(locale, { month: "long", year: "numeric" })}
                          <span aria-hidden>×</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMonthFilterOn(true)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                        >
                          {t("expenses.allMonths")} · {t("expenses.onlyThisMonth")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              }
            />
            <MonthTotalsList
              items={calendarItems}
              month={calMonth}
              onPick={goToMonth}
              locale={locale}
              title={t("expenses.monthlyTotals")}
              subtitle={t("expenses.last12Months")}
              color="#eb6834"
              formatter={formatAmount}
            />
          </div>

          {/* Table */}
          <div ref={tableRef} className="scroll-mt-28 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {filteredExpenses.length === 0 ? (
              <>
                <EmptyState
                  icon={FaReceipt}
                  title={t("expenses.noExpenses")}
                  description={t("expenses.noExpensesDesc")}
                />
                {hasExpenseFilters && (
                  <div className="-mt-6 pb-10 text-center">
                    <button type="button" onClick={clearExpenseFilters} className="text-sm font-medium text-brand hover:underline">
                      {t("common.clearFilters")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50/80 border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-5 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("expenses.date")}</th>
                      <th className="py-3 px-5 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("expenses.description")}</th>
                      <th className="py-3 px-5 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("expenses.category")}</th>
                      <th className="py-3 px-5 text-end text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("expenses.amount")}</th>
                      <th className="py-3 px-5 text-end text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("expenses.balance")}</th>
                      <th className="py-3 px-5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("common.status")}</th>
                      <th className="py-3 px-5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 stagger">
                    {filteredExpenses.map((expense) => (
                      <tr key={expense.id} className="transition-colors hover:bg-gray-50/80">
                        <td className="py-3.5 px-5 text-sm text-gray-600">
                          {formatDate(expense.date)}
                        </td>
                        <td className="py-3.5 px-5">
                          <p className="font-medium text-gray-900">
                            {expense.description}
                            {expense.attachmentsCount > 0 && (
                              <FaPaperclip className="ms-2 inline text-xs text-gray-400" title={`${expense.attachmentsCount} file(s)`} />
                            )}
                            {expense.reminder && (
                              <FaBell className="ms-1 inline text-xs text-amber-500" title={`Repeating: ${expense.reminder.title}`} />
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            <span className="font-mono">{expense.number}</span>
                            {expense.supplier && ` · ${expense.supplier.name}`}
                            {expense.supplierBillNumber && ` · bill ${expense.supplierBillNumber}`}
                          </p>
                        </td>
                        <td className="py-3.5 px-5">
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                            {categoryLabel(expense.category)}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right rtl:text-left">
                          <span className="font-semibold text-gray-900">{formatAmount(expense.amount)}</span>
                        </td>
                        <td className="py-3.5 px-5 text-right rtl:text-left">
                          <p className="text-xs text-green-700">
                            {t("expenses.amountPaid")}: {formatAmount(expense.amountPaid)}
                          </p>
                          <p className={`text-sm font-semibold ${expense.remaining > 0 ? "text-red-600" : "text-gray-400"}`}>
                            {t("expenses.remaining")}: {formatAmount(expense.remaining)}
                          </p>
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <StatusBadge status={expense.status} />
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleOpenPayments(expense)}
                              title={t("expenses.recordPayment")}
                              className={`p-2 rounded-lg transition-colors ${
                                expense.remaining > 0
                                  ? "text-green-600 hover:bg-green-50"
                                  : "text-gray-400 hover:bg-gray-100"
                              }`}
                            >
                              <FaDollarSign />
                            </button>
                            {can("expenses:edit") && (
                            <button
                              onClick={() => handleOpenEdit(expense)}
                              title={t("expenses.editExpense")}
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-brand transition-colors"
                            >
                              <FaEdit />
                            </button>
                            )}
                            {can("expenses:delete") && (
                            <button
                              onClick={() => handleDelete(expense.id)}
                              disabled={deletingId === expense.id}
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-500 transition-colors disabled:opacity-40"
                            >
                              {deletingId === expense.id ? (
                                <span className="block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <FaTrash />
                              )}
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
            <ShowMore shown={expenses.length} total={list.total} loading={list.loadingMore} onClick={list.loadMore} />
          </div>
          </>)}
          </>)}
        </main>
      </div>

      {/* Add Expense Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t("expenses.addNewExpense")}>
        <div className="space-y-4">
          <FormField label={t("expenses.description")}>
            <input
              type="text"
              placeholder={t("expenses.descriptionPlaceholder")}
              className={inputClass}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("expenses.category")}>
              <select
                className={inputClass}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {categoryChoices(form.category).map((c) => (
                  <option key={c.key} value={c.key}>{c.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label={t("common.status")}>
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "paid" | "pending" }))}
              >
                <option value="pending">{t("expenses.pendingBadge")}</option>
                <option value="paid">{t("expenses.paidBadge")}</option>
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("expenses.amount")}>
              <input
                type="number"
                step="0.01"
                min="0"
                max={1000000}
                placeholder={t("expenses.amountPlaceholder")}
                className={inputClass}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </FormField>
            <FormField label="Bill date">
              <input
                type="date"
                className={inputClass}
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, paidDate: e.target.value }))}
              />
            </FormField>
          </div>
          {form.status === "paid" && (
            <div className="grid grid-cols-2 gap-4">
              <FormField label={t("expenses.paymentMethod")}>
                <select
                  className={inputClass}
                  value={form.paymentMethod}
                  onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as (typeof paymentMethods)[number] }))}
                >
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>{t(`expenses.${paymentMethodLabelKey[m]}`)}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Paid on">
                <input
                  type="date"
                  className={inputClass}
                  value={form.paidDate}
                  onChange={(e) => setForm((f) => ({ ...f, paidDate: e.target.value }))}
                />
              </FormField>
            </div>
          )}
          {billFields}
          <FormField label="Files (supplier PDF, photo of the receipt)">
            <input
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              onChange={(e) => setNewFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-gray-600 file:me-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              No file? The expense gets an EX number: write it on the paper bill and file the paper.
            </p>
          </FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button className="flex-1 bg-brand hover:bg-brand/90" onClick={handleAdd} disabled={isSaving}>
            {t("expenses.addExpense")}
          </Button>
        </div>
      </Modal>

      {/* Edit Expense Modal */}
      <Modal isOpen={showEditModal && !!selectedExpense} onClose={() => setShowEditModal(false)} title={selectedExpense ? `${t("expenses.editExpense")} · ${selectedExpense.number}` : t("expenses.editExpense")}>
        {selectedExpense && (
          <>
            <div className="space-y-4">
              <FormField label={t("expenses.description")}>
                <input
                  type="text"
                  className={inputClass}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label={t("expenses.category")}>
                  <select
                    className={inputClass}
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    {categoryChoices(form.category).map((c) => (
                      <option key={c.key} value={c.key}>{c.name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Bill date">
                  <input
                    type="date"
                    className={inputClass}
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </FormField>
              </div>
              <FormField label={t("expenses.amount")}>
                <input
                  type="number"
                  step="0.01"
                  min={selectedExpense.amountPaid > 0 ? selectedExpense.amountPaid : 0}
                  max={1000000}
                  className={inputClass}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </FormField>
              {billFields}
              <ExpenseAttachments
                expenseId={selectedExpense.id}
                canEdit={can("expenses:edit")}
                onChanged={(count) =>
                  list.setRows((prev) =>
                    prev.map((e) => (e.id === selectedExpense.id ? { ...e, attachmentsCount: count } : e)),
                  )
                }
              />

              {/* Payment status is derived from recorded payments; manage it via the payment modal. */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{t("expenses.balance")}</span>
                  <StatusBadge status={selectedExpense.status} />
                </div>
                <BalanceSummary expense={selectedExpense} />
                <button
                  type="button"
                  onClick={() => handleOpenPayments(selectedExpense)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
                >
                  <FaDollarSign /> {t("expenses.recordPayment")}
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)} disabled={isSaving}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1 bg-brand hover:bg-brand/90" onClick={handleEditSave} disabled={isSaving}>
                {t("expenses.saveChanges")}
              </Button>
            </div>
          </>
        )}
      </Modal>

      <ExpenseListsModal
        isOpen={listsOpen}
        onClose={() => setListsOpen(false)}
        categories={categories}
        suppliers={suppliers}
        onChanged={() => void fetchLists()}
        canCreate={can("expenses:create")}
        canEdit={can("expenses:edit")}
      />

      {/* Record Payment Modal */}
      <Modal isOpen={!!paymentExpense} onClose={handleClosePayments} title={t("expenses.recordPayment")} maxWidth="max-w-xl">
        {paymentExpense && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">{paymentExpense.description} <span className="font-mono text-xs font-normal text-gray-500">{paymentExpense.number}</span></p>
                <p className="text-sm text-gray-500">
                  {formatDate(paymentExpense.date)} · {categoryLabel(paymentExpense.category)}
                </p>
              </div>
              <StatusBadge status={paymentExpense.status} />
            </div>

            <BalanceSummary expense={paymentExpense} />

            {paymentExpense.remaining > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField label={t("expenses.paymentAmount")}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={paymentExpense.remaining}
                      className={inputClass}
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentForm((f) => ({ ...f, amount: paymentExpense.remaining.toFixed(2) }))
                      }
                      className="mt-1 text-xs font-medium text-brand hover:underline"
                    >
                      {t("expenses.payRemaining")} ({formatAmount(paymentExpense.remaining)})
                    </button>
                  </FormField>
                  <FormField label={t("expenses.paymentMethod")}>
                    <select
                      className={inputClass}
                      value={paymentForm.method}
                      onChange={(e) =>
                        setPaymentForm((f) => ({ ...f, method: e.target.value as (typeof paymentMethods)[number] }))
                      }
                    >
                      {paymentMethods.map((m) => (
                        <option key={m} value={m}>{t(`expenses.${paymentMethodLabelKey[m]}`)}</option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label={t("common.date")}>
                    <input
                      type="date"
                      className={inputClass}
                      value={paymentForm.date}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </FormField>
                  <FormField label={t("expenses.notes")}>
                    <input
                      type="text"
                      placeholder={t("expenses.notesPlaceholder")}
                      className={inputClass}
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </FormField>
                </div>
                {can("expenses:create") && (
                <Button
                  className="w-full bg-brand hover:bg-brand/90"
                  onClick={handleRecordPayment}
                  disabled={isSubmittingPayment}
                >
                  {t("expenses.recordPayment")}
                </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm font-medium text-green-700">
                <FaCheckCircle /> {t("expenses.fullyPaid")}
              </div>
            )}

            {/* History */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("expenses.paymentHistory")}</h3>
              {paymentsLoading ? (
                <LoadingSpinner />
              ) : payments.length === 0 ? (
                <p className="text-sm text-gray-500">{t("expenses.noPayments")}</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 max-h-56 overflow-y-auto">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {formatDate(p.date)}
                          <span className="ml-2 rtl:mr-2 rtl:ml-0 text-xs font-normal text-gray-500">
                            {t(`expenses.${paymentMethodLabelKey[p.method] ?? "otherMethod"}`)}
                          </span>
                        </p>
                        {p.notes && <p className="text-xs text-gray-500 truncate">{p.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-green-700">{formatAmount(p.amount)}</span>
                        {can("expenses:delete") && (
                        <button
                          onClick={() => handleDeletePayment(p.id)}
                          disabled={deletingPaymentId === p.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 transition-colors disabled:opacity-40"
                          title={t("expenses.paymentDeleted")}
                        >
                          {deletingPaymentId === p.id ? (
                            <span className="block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <FaTrash className="text-xs" />
                          )}
                        </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex">
              <Button variant="outline" className="flex-1" onClick={handleClosePayments}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
