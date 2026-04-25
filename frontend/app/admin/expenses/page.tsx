"use client";

// NOTE FOR BACKEND TEAM:
// This page needs the following API endpoints:
//   GET  /api/expenses          → returns { data: Expense[] }
//   POST /api/expenses          → creates a new expense, body: CreateExpenseDto
//   PUT  /api/expenses/:id      → updates an expense, body: UpdateExpenseDto
//   DELETE /api/expenses/:id    → deletes an expense
//
// Expense schema:
//   id: number
//   description: string
//   category: "Supplies" | "Salaries" | "Equipment" | "Utilities" | "Other"
//   amount: number          (e.g. 150.00)
//   status: "paid" | "pending"
//   date: string            (ISO date, e.g. "2026-04-10")
//   created_at: string
//   updated_at: string

import { toast } from 'sonner';
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { StatsCard } from "@/components/ui/StatsCard";
import { FilterBar } from "@/components/ui/FilterBar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  FaMoneyBillWave,
  FaCheckCircle,
  FaClock,
  FaEdit,
  FaTrash,
  FaReceipt,
} from "react-icons/fa";

type Expense = {
  id: number;
  description: string;
  category: string;
  amount: number;
  status: "paid" | "pending";
  date: string;
};

const categoryKeys = ["all", "supplies", "rent", "equipment", "utilities", "maintenance", "other"] as const;
const categoryValues = ["All", "Supplies", "Rent", "Equipment", "Utilities", "Maintenance", "Other"];

const emptyForm = {
  description: "",
  category: "supplies",
  amount: "",
  status: "pending" as "paid" | "pending",
  date: new Date().toISOString().split("T")[0],
};

export default function ExpensesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/expenses");
      const data = await res.json();
      setExpenses(
        (data.data || []).map((e: any) => ({
          ...e,
          date: e.expense_date ? String(e.expense_date).split('T')[0] : new Date().toISOString().split('T')[0],
          amount: Number(e.amount) || 0,
          category: e.category
            ? e.category.charAt(0).toUpperCase() + e.category.slice(1).toLowerCase()
            : "Other",
          status: (e.status ?? "pending").toLowerCase(),
        }))
      );
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

  const filteredExpenses = expenses.filter((exp) => {
    const matchesSearch = (exp.description ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || (exp.category ?? "").toLowerCase() === selectedCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const totalThisMonth = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalPaid = expenses.filter((e) => e.status === "paid").reduce((sum, e) => sum + e.amount, 0);
  const totalPending = expenses.filter((e) => e.status === "pending").reduce((sum, e) => sum + e.amount, 0);

  const handleOpenEdit = (expense: Expense) => {
    setSelectedExpense(expense);
    setForm({
      description: expense.description,
      category: expense.category.toLowerCase(),
      amount: String(expense.amount),
      status: expense.status,
      date: expense.date,
    });
    setShowEditModal(true);
  };

  const handleOpenAdd = () => {
    setForm(emptyForm);
    setShowAddModal(true);
  };

  const handleAdd = async () => {
    try {
      await apiFetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.description,
          expense_date: form.date,
          category: form.category.toLowerCase(),
          amount: parseFloat(form.amount),
        }),
      });
      await fetchExpenses();
      toast.success("Expense added.");
    } catch {
      // optimistic add
      setExpenses((prev) => [
        ...prev,
        { id: Date.now(), ...form, amount: parseFloat(form.amount) || 0 },
      ]);
      toast.success("Expense added.");
    }
    setShowAddModal(false);
  };

  const handleEditSave = async () => {
    if (!selectedExpense) return;
    try {
      await apiFetch(`/api/expenses/${selectedExpense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.description,
          expense_date: form.date,
          category: form.category.toLowerCase(),
          amount: parseFloat(form.amount),
          status: form.status,
        }),
      });
      await fetchExpenses();
      toast.success("Expense updated.");
    } catch {
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === selectedExpense.id
            ? { ...e, ...form, amount: parseFloat(form.amount) || e.amount }
            : e
        )
      );
      toast.success("Expense updated.");
    }
    setShowEditModal(false);
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/expenses/${id}`, { method: "DELETE" });
    } catch {
      // optimistic delete
    } finally {
      setDeletingId(null);
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    toast.success("Expense deleted.");
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar activePage="expenses" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col">
        <AdminPageHeader
          title={t("expenses.title")}
          subtitle={t("expenses.subtitle")}
          data={expenses}
          filename="expenses"
          onImport={async (rows) => {
            let ok = 0; let fail = 0;
            const today = new Date().toISOString().split("T")[0];
            for (const row of rows as Record<string, unknown>[]) {
              try {
                const rawCat = String(row.category ?? "other").toLowerCase();
                const allowed = ["utilities","rent","equipment","supplies","maintenance","other"];
                const category = allowed.includes(rawCat) ? rawCat : "other";
                const payload = {
                  title: String(row.description ?? row.title ?? "Imported Expense"),
                  category,
                  amount: Number(row.amount ?? 0),
                  expense_date: String(row.date ?? row.expense_date ?? today),
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
              value={formatAmount(totalThisMonth)}
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
              value={formatAmount(totalPending)}
              label={t("expenses.pending")}
            />
          </div>

          {/* Filter */}
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("expenses.searchPlaceholder")}
            filters={categoryValues.map((cat, idx) => ({
              value: cat,
              label: t(`expenses.${categoryKeys[idx]}`),
            }))}
            activeFilter={selectedCategory}
            onFilterChange={setSelectedCategory}
          />

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {filteredExpenses.length === 0 ? (
              <EmptyState
                icon={FaReceipt}
                title={t("expenses.noExpenses")}
                description={t("expenses.noExpensesDesc")}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left rtl:text-right py-4 px-6 text-sm font-semibold text-gray-600">{t("expenses.date")}</th>
                      <th className="text-left rtl:text-right py-4 px-6 text-sm font-semibold text-gray-600">{t("expenses.description")}</th>
                      <th className="text-left rtl:text-right py-4 px-6 text-sm font-semibold text-gray-600">{t("expenses.category")}</th>
                      <th className="text-right rtl:text-left py-4 px-6 text-sm font-semibold text-gray-600">{t("expenses.amount")}</th>
                      <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">{t("common.status")}</th>
                      <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredExpenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-6 text-sm text-gray-600">
                          {new Date(expense.date).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-6">
                          <p className="font-medium text-gray-900">{expense.description}</p>
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                            {expense.category}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right rtl:text-left">
                          <span className="font-semibold text-gray-900">{formatAmount(expense.amount)}</span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          {expense.status === "paid" ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                              <FaCheckCircle className="text-xs" /> {t("expenses.paidBadge")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                              <FaClock className="text-xs" /> {t("expenses.pendingBadge")}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleOpenEdit(expense)}
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
                {categoryKeys.slice(1).map((key, idx) => (
                  <option key={key} value={key}>{categoryValues[idx + 1]}</option>
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
          <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>
            {t("common.cancel")}
          </Button>
          <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90" onClick={handleAdd}>
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
                    {categoryValues.slice(1).map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
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
              <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90" onClick={handleEditSave}>
                {t("expenses.saveChanges")}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
