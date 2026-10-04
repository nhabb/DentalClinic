"use client";

// Expenses admin page.
//
// Backend contract (NestJS, see backend/src/doctor/expenses):
//   GET    /api/expenses                        → { data: Expense[] }
//   POST   /api/expenses                        → create (CreateExpenseDto)
//   PATCH  /api/expenses/:id                    → update (UpdateExpenseDto)
//   DELETE /api/expenses/:id                    → delete
//   GET    /api/expenses/:id/payments           → ExpensePayment[]
//   POST   /api/expenses/:id/payments           → record a partial/full payment, returns updated expense
//   DELETE /api/expenses/:id/payments/:paymentId→ remove a payment, returns updated expense
//
// The user-facing "description" is stored in the backend `title` column.
// Payment status is derived server-side from `amount_paid` vs `amount`:
//   pending (nothing paid) | partial | paid.

import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { StatsCard } from "@/components/ui/StatsCard";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { MonthCalendar, MonthTotalsList, ORANGE_RAMP, firstOfMonth, monthKey } from "@/components/ui/MonthCalendar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  FaMoneyBillWave,
  FaCheckCircle,
  FaClock,
  FaAdjust,
  FaEdit,
  FaTrash,
  FaReceipt,
  FaDollarSign,
} from "react-icons/fa";

type ExpenseStatus = "paid" | "pending" | "partial";

type Expense = {
  id: number;
  description: string;
  category: string; // lowercase key, e.g. "supplies"
  amount: number;
  amountPaid: number;
  remaining: number;
  status: ExpenseStatus;
  date: string; // YYYY-MM-DD
};

type ExpensePayment = {
  id: number;
  amount: number;
  method: string;
  notes: string | null;
  date: string; // YYYY-MM-DD
};

const categoryKeys = ["all", "supplies", "rent", "equipment", "utilities", "maintenance", "other"] as const;
const categoryValues = ["All", "Supplies", "Rent", "Equipment", "Utilities", "Maintenance", "Other"];

const paymentMethods = ["cash", "card", "bank_transfer", "other"] as const;
const paymentMethodLabelKey: Record<string, string> = {
  cash: "cash",
  card: "card",
  bank_transfer: "bankTransfer",
  other: "otherMethod",
};

const today = () => new Date().toISOString().split("T")[0];

const emptyForm = {
  description: "",
  category: "supplies",
  amount: "",
  status: "pending" as "paid" | "pending",
  date: today(),
};

const emptyPaymentForm = {
  amount: "",
  method: "cash" as (typeof paymentMethods)[number],
  date: today(),
  notes: "",
};

const toDateOnly = (value: unknown) =>
  value ? String(value).split("T")[0] : today();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapExpense(e: any): Expense {
  const amount = Number(e.amount) || 0;
  const amountPaid = Number(e.amount_paid) || 0;
  const remaining =
    e.remaining_amount != null ? Number(e.remaining_amount) || 0 : Math.max(0, amount - amountPaid);
  const rawStatus = String(e.status ?? "").toLowerCase();
  const status: ExpenseStatus =
    rawStatus === "paid" || rawStatus === "partial" || rawStatus === "pending"
      ? rawStatus
      : amountPaid <= 0
        ? "pending"
        : remaining <= 0
          ? "paid"
          : "partial";
  return {
    id: Number(e.id),
    description: e.title ?? e.description ?? "",
    category: String(e.category ?? "other").toLowerCase(),
    amount,
    amountPaid,
    remaining,
    status,
    date: toDateOnly(e.expense_date),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPayment(p: any): ExpensePayment {
  return {
    id: Number(p.id),
    amount: Number(p.amount) || 0,
    method: String(p.payment_method ?? "cash"),
    notes: p.notes ?? null,
    date: toDateOnly(p.payment_date ?? p.created_at),
  };
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    const msg = body?.message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string" && msg.trim()) return msg;
  } catch {
    /* ignore */
  }
  return fallback;
}

export default function ExpensesPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const locale = language === "ar" ? "ar-LB" : language === "fr" ? "fr-FR" : "en-US";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Partial payments
  const [paymentExpense, setPaymentExpense] = useState<Expense | null>(null);
  const [payments, setPayments] = useState<ExpensePayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/expenses?limit=500");
      const data = await res.json();
      setExpenses((data.data || []).map(mapExpense));
    } catch {
      setExpenses([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("userRole");
    router.push("/login");
  };

  const categoryLabel = (key: string) => {
    const translated = t(`expenses.${key}`);
    return translated === `expenses.${key}`
      ? key.charAt(0).toUpperCase() + key.slice(1)
      : translated;
  };

  const eq = searchQuery.trim().toLowerCase();
  const matchesExpenseSearch = (exp: Expense) => !eq || (exp.description ?? "").toLowerCase().includes(eq);
  const matchesExpenseCategory = (exp: Expense, cat: string = selectedCategory) => cat === "All" || exp.category === cat.toLowerCase();
  const matchesExpenseStatus = (exp: Expense, st: "all" | ExpenseStatus = selectedExpenseStatus) => st === "all" || exp.status === st;
  const matchesExpenseDay = (exp: Expense) =>
    selectedDay !== null ? exp.date === selectedDay : !monthFilterOn || exp.date.slice(0, 7) === monthKey(calMonth);
  const goToMonth = (first: Date) => { setCalMonth(first); setMonthFilterOn(true); setSelectedDay(null); };
  const pickDay = (d: string | null) => {
    setSelectedDay(d);
    if (d) {
      setCalMonth(firstOfMonth(new Date(`${d}T12:00:00`)));
      setMonthFilterOn(true);
      setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  };
  const filteredExpenses = expenses.filter(
    (exp) => matchesExpenseSearch(exp) && matchesExpenseCategory(exp) && matchesExpenseStatus(exp) && matchesExpenseDay(exp),
  );
  /** Rows the calendar shades: every filter except the day itself. */
  const calendarExpenses = expenses.filter((exp) => matchesExpenseSearch(exp) && matchesExpenseCategory(exp) && matchesExpenseStatus(exp));
  const calendarItems = calendarExpenses.map((e) => ({ date: e.date, amount: e.amount }));
  const monthRows = calendarExpenses.filter((e) => e.date.slice(0, 7) === monthKey(calMonth));
  const monthPaid = monthRows.reduce((s, e) => s + e.amountPaid, 0);
  const monthRemaining = monthRows.reduce((s, e) => s + e.remaining, 0);
  const expenseCategoryCounts: Record<string, number> = Object.fromEntries(
    categoryValues.map((c) => [c, expenses.filter((e) => matchesExpenseSearch(e) && matchesExpenseDay(e) && matchesExpenseStatus(e) && matchesExpenseCategory(e, c)).length]),
  );
  const expenseStatusCounts = {
    all: expenses.filter((e) => matchesExpenseSearch(e) && matchesExpenseDay(e) && matchesExpenseCategory(e)).length,
    pending: expenses.filter((e) => matchesExpenseSearch(e) && matchesExpenseDay(e) && matchesExpenseCategory(e) && e.status === "pending").length,
    partial: expenses.filter((e) => matchesExpenseSearch(e) && matchesExpenseDay(e) && matchesExpenseCategory(e) && e.status === "partial").length,
    paid: expenses.filter((e) => matchesExpenseSearch(e) && matchesExpenseDay(e) && matchesExpenseCategory(e) && e.status === "paid").length,
  };
  const hasExpenseFilters = !!eq || selectedCategory !== "All" || selectedExpenseStatus !== "all" || selectedDay !== null || monthFilterOn;
  const clearExpenseFilters = () => { setSearchQuery(""); setSelectedCategory("All"); setSelectedExpenseStatus("all"); setSelectedDay(null); setMonthFilterOn(false); };

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalPaid = expenses.reduce((sum, e) => sum + e.amountPaid, 0);
  const totalRemaining = expenses.reduce((sum, e) => sum + e.remaining, 0);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString();

  /** Replace one expense in the list from a fresh API payload. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyUpdatedExpense = (raw: any) => {
    const updated = mapExpense(raw);
    setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    return updated;
  };

  // ── Add / Edit ──────────────────────────────────────────────────────────────

  const handleOpenAdd = () => {
    setForm({ ...emptyForm, date: today() });
    setShowAddModal(true);
  };

  const handleOpenEdit = (expense: Expense) => {
    setSelectedExpense(expense);
    setForm({
      description: expense.description,
      category: expense.category,
      amount: String(expense.amount),
      status: expense.status === "paid" ? "paid" : "pending",
      date: expense.date,
    });
    setShowEditModal(true);
  };

  const validateAmount = (value: string): number | null => {
    const parsed = parseFloat(value);
    if (!parsed || parsed <= 0) {
      toast.error(t("expenses.invalidAmount"));
      return null;
    }
    if (parsed > 100000) {
      toast.error("Amount cannot exceed $100,000.");
      return null;
    }
    return parsed;
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
        body: JSON.stringify({
          title: form.description.trim(),
          expense_date: form.date,
          category: form.category.toLowerCase(),
          amount: parsedAmount,
          status: form.status,
        }),
      });
      if (!res.ok) {
        toast.error(await readError(res, t("expenses.saveFailed")));
        return;
      }
      await fetchExpenses();
      toast.success("Expense added.");
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
        body: JSON.stringify({
          title: form.description.trim(),
          expense_date: form.date,
          category: form.category.toLowerCase(),
          amount: parsedAmount,
        }),
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
      setExpenses((prev) => prev.filter((e) => e.id !== id));
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar activePage="expenses" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title={t("expenses.title")}
          subtitle={t("expenses.subtitle")}
          data={expenses}
          filename="expenses"
          onImport={async (rows) => {
            let ok = 0; let fail = 0;
            const importDate = today();
            for (const row of rows as Record<string, unknown>[]) {
              try {
                const rawCat = String(row.category ?? "other").toLowerCase();
                const allowed = ["utilities","rent","equipment","supplies","maintenance","other"];
                const category = allowed.includes(rawCat) ? rawCat : "other";
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
          onAdd={handleOpenAdd}
          addLabel={t("expenses.addExpense")}
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

          <ListToolbar
            search={{ value: searchQuery, onChange: setSearchQuery, placeholder: t("expenses.searchPlaceholder") }}
            shown={filteredExpenses.length}
            total={expenses.length}
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
                options: categoryValues.map((cat, idx) => ({ value: cat, label: t(`expenses.${categoryKeys[idx]}`), count: expenseCategoryCounts[cat] ?? 0 })),
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
                          className="inline-flex items-center gap-1.5 rounded-full border border-dental-blue/30 bg-dental-blue/10 px-2.5 py-1 text-xs font-medium capitalize text-dental-blue transition hover:bg-dental-blue/15"
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
                    <button type="button" onClick={clearExpenseFilters} className="text-sm font-medium text-dental-blue hover:underline">
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
                  <tbody className="divide-y divide-gray-100">
                    {filteredExpenses.map((expense) => (
                      <tr key={expense.id} className="transition-colors hover:bg-gray-50/80">
                        <td className="py-3.5 px-5 text-sm text-gray-600">
                          {formatDate(expense.date)}
                        </td>
                        <td className="py-3.5 px-5">
                          <p className="font-medium text-gray-900">{expense.description}</p>
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
                            <button
                              onClick={() => handleOpenEdit(expense)}
                              title={t("expenses.editExpense")}
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-dental-blue transition-colors"
                            >
                              <FaEdit />
                            </button>
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
                {categoryKeys.slice(1).map((key) => (
                  <option key={key} value={key}>{categoryLabel(key)}</option>
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
                max={100000}
                placeholder={t("expenses.amountPlaceholder")}
                className={inputClass}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </FormField>
            <FormField label={t("common.date")}>
              <input
                type="date"
                className={inputClass}
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </FormField>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90" onClick={handleAdd} disabled={isSaving}>
            {t("expenses.addExpense")}
          </Button>
        </div>
      </Modal>

      {/* Edit Expense Modal */}
      <Modal isOpen={showEditModal && !!selectedExpense} onClose={() => setShowEditModal(false)} title={t("expenses.editExpense")}>
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
                    {categoryKeys.slice(1).map((key) => (
                      <option key={key} value={key}>{categoryLabel(key)}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label={t("common.date")}>
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
                  max={100000}
                  className={inputClass}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </FormField>

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
                  className="inline-flex items-center gap-2 text-sm font-medium text-dental-blue hover:underline"
                >
                  <FaDollarSign /> {t("expenses.recordPayment")}
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)} disabled={isSaving}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90" onClick={handleEditSave} disabled={isSaving}>
                {t("expenses.saveChanges")}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Record Payment Modal */}
      <Modal isOpen={!!paymentExpense} onClose={handleClosePayments} title={t("expenses.recordPayment")} maxWidth="max-w-xl">
        {paymentExpense && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">{paymentExpense.description}</p>
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
                      className="mt-1 text-xs font-medium text-dental-blue hover:underline"
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
                <Button
                  className="w-full bg-dental-blue hover:bg-dental-blue/90"
                  onClick={handleRecordPayment}
                  disabled={isSubmittingPayment}
                >
                  {t("expenses.recordPayment")}
                </Button>
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
