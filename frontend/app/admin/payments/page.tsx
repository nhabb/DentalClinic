"use client";

// NOTE FOR BACKEND TEAM:
// This page needs the following API endpoints:
//   GET  /api/payments          → returns { data: PatientPayment[] }
//   POST /api/payments          → creates a new payment record, body: CreatePaymentDto
//   PUT  /api/payments/:id      → updates a payment, body: UpdatePaymentDto
//   DELETE /api/payments/:id    → deletes a payment record
//
// PatientPayment schema:
//   id: number
//   patient_name: string
//   treatment: string
//   date: string            (ISO date, e.g. "2026-04-10")
//   amount_due: number
//   amount_paid: number
//   status: "paid" | "pending" | "overdue"
//   created_at: string
//   updated_at: string
//
// Optionally join with appointments/patient_profiles for richer data.

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
import { Avatar } from "@/components/ui/Avatar";
import {
  FaDollarSign,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaEdit,
  FaTrash,
  FaFileInvoiceDollar,
} from "react-icons/fa";

type PatientPayment = {
  id: number;
  patient_name: string;
  treatment: string;
  date: string;
  amount_due: number;
  amount_paid: number;
  status: "paid" | "pending" | "overdue";
};

const statusFilterKeys = ["all", "paid", "pending", "overdueFilter"] as const;
const statusFilterValues = ["All", "Paid", "Pending", "Overdue"];

const emptyForm = {
  patient_name: "",
  treatment: "",
  date: new Date().toISOString().split("T")[0],
  amount_due: "",
  amount_paid: "",
  status: "pending" as "paid" | "pending" | "overdue",
};

export default function PatientPaymentsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [payments, setPayments] = useState<PatientPayment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PatientPayment | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPayments = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/payments");
      const data = await res.json();
      console.log("payments raw:", JSON.stringify(data?.data?.[0] ?? data, null, 2));
      setPayments(
        (data.data || []).map((p: any) => ({
          ...p,
          patient_name: p.patient_name ?? p.patientName ?? "",
          treatment: p.treatment ?? "",
          date: p.date ?? "",
          amount_due: Number(p.amount_due ?? p.amountDue) || 0,
          amount_paid: Number(p.amount_paid ?? p.amountPaid) || 0,
          status: (p.status ?? "pending").toLowerCase(),
        }))
      );
    } catch {
      setPayments([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleLogout = () => {
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("userRole");
    router.push("/login");
  };

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      (p.patient_name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.treatment ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      selectedStatus === "All" ||
      (selectedStatus === "Paid" && p.status === "paid") ||
      (selectedStatus === "Pending" && p.status === "pending") ||
      (selectedStatus === "Overdue" && p.status === "overdue");
    return matchesSearch && matchesStatus;
  });

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount_due, 0);
  const totalCollected = payments.reduce((sum, p) => sum + p.amount_paid, 0);
  const totalPending = payments.filter((p) => p.status === "pending").reduce((sum, p) => sum + (p.amount_due - p.amount_paid), 0);
  const totalOverdue = payments.filter((p) => p.status === "overdue").reduce((sum, p) => sum + (p.amount_due - p.amount_paid), 0);

  const handleOpenEdit = (payment: PatientPayment) => {
    setSelectedPayment(payment);
    setForm({
      patient_name: payment.patient_name,
      treatment: payment.treatment,
      date: payment.date,
      amount_due: String(payment.amount_due),
      amount_paid: String(payment.amount_paid),
      status: payment.status,
    });
    setShowEditModal(true);
  };

  const handleOpenAdd = () => {
    setForm(emptyForm);
    setShowAddModal(true);
  };

  const handleAdd = async () => {
    const payload = {
      ...form,
      amount_due: parseFloat(form.amount_due) || 0,
      amount_paid: parseFloat(form.amount_paid) || 0,
    };
    try {
      await apiFetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await fetchPayments();
    } catch {
      setPayments((prev) => [...prev, { id: Date.now(), ...payload }]);
    }
    setShowAddModal(false);
  };

  const handleEditSave = async () => {
    if (!selectedPayment) return;
    const payload = {
      ...form,
      amount_due: parseFloat(form.amount_due) || selectedPayment.amount_due,
      amount_paid: parseFloat(form.amount_paid) || selectedPayment.amount_paid,
    };
    try {
      await apiFetch(`/api/payments/${selectedPayment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await fetchPayments();
    } catch {
      setPayments((prev) =>
        prev.map((p) => (p.id === selectedPayment.id ? { ...p, ...payload } : p))
      );
    }
    setShowEditModal(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/payments/${id}`, { method: "DELETE" });
    } catch {
      // optimistic delete
    }
    setPayments((prev) => prev.filter((p) => p.id !== id));
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const statusBadge = (status: PatientPayment["status"]) => {
    switch (status) {
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            <FaCheckCircle className="text-xs" /> {t("payments.paidBadge")}
          </span>
        );
      case "overdue":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            <FaExclamationCircle className="text-xs" /> {t("payments.overdueBadge")}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
            <FaClock className="text-xs" /> {t("payments.pendingBadge")}
          </span>
        );
    }
  };

  const paymentFormFields = (
    <div className="space-y-4">
      <FormField label={t("payments.patientName")}>
        <input
          type="text"
          placeholder={t("payments.patientNamePlaceholder")}
          className={inputClass}
          value={form.patient_name}
          onChange={(e) => setForm((f) => ({ ...f, patient_name: e.target.value }))}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label={t("payments.treatmentType")}>
          <input
            type="text"
            placeholder="e.g., Root Canal"
            className={inputClass}
            value={form.treatment}
            onChange={(e) => setForm((f) => ({ ...f, treatment: e.target.value }))}
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
      <div className="grid grid-cols-2 gap-4">
        <FormField label={t("payments.amountDue")}>
          <input
            type="number"
            step="0.01"
            placeholder={t("payments.amountPlaceholder")}
            className={inputClass}
            value={form.amount_due}
            onChange={(e) => setForm((f) => ({ ...f, amount_due: e.target.value }))}
          />
        </FormField>
        <FormField label={t("payments.amountPaid")}>
          <input
            type="number"
            step="0.01"
            placeholder={t("payments.amountPlaceholder")}
            className={inputClass}
            value={form.amount_paid}
            onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))}
          />
        </FormField>
      </div>
      <FormField label={t("common.status")}>
        <select
          className={inputClass}
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PatientPayment["status"] }))}
        >
          <option value="pending">{t("payments.pendingBadge")}</option>
          <option value="paid">{t("payments.paidBadge")}</option>
          <option value="overdue">{t("payments.overdueBadge")}</option>
        </select>
      </FormField>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar activePage="payments" sidebarOpen={sidebarOpen} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col">
        <AdminPageHeader
          title={t("payments.title")}
          subtitle={t("payments.subtitle")}
          data={payments}
          filename="payments"
          onImport={(rows) => setPayments((prev) => [...prev, ...(rows as PatientPayment[])])}
          onAdd={handleOpenAdd}
          addLabel={t("payments.recordPayment")}
        />

        <main className="flex-1 p-8 overflow-auto">
          {isLoading ? (
            <LoadingSpinner />
          ) : (<>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <StatsCard
              icon={FaDollarSign}
              iconBgClass="bg-blue-100"
              iconColorClass="text-blue-600"
              value={formatAmount(totalRevenue)}
              label={t("payments.totalRevenue")}
            />
            <StatsCard
              icon={FaCheckCircle}
              iconBgClass="bg-green-100"
              iconColorClass="text-green-600"
              value={formatAmount(totalCollected)}
              label={t("payments.collected")}
            />
            <StatsCard
              icon={FaClock}
              iconBgClass="bg-yellow-100"
              iconColorClass="text-yellow-600"
              value={formatAmount(totalPending)}
              label={t("payments.pendingAmount")}
            />
            <StatsCard
              icon={FaExclamationCircle}
              iconBgClass="bg-red-100"
              iconColorClass="text-red-600"
              value={formatAmount(totalOverdue)}
              label={t("payments.overdue")}
            />
          </div>

          {/* Filter */}
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("payments.searchPlaceholder")}
            filters={statusFilterValues.map((val, idx) => ({
              value: val,
              label: t(`payments.${statusFilterKeys[idx]}`),
            }))}
            activeFilter={selectedStatus}
            onFilterChange={setSelectedStatus}
          />

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {filteredPayments.length === 0 ? (
              <EmptyState
                icon={FaFileInvoiceDollar}
                title={t("payments.noPayments")}
                description={t("payments.noPaymentsDesc")}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left rtl:text-right py-4 px-6 text-sm font-semibold text-gray-600">{t("payments.patient")}</th>
                      <th className="text-left rtl:text-right py-4 px-6 text-sm font-semibold text-gray-600">{t("payments.treatment")}</th>
                      <th className="text-left rtl:text-right py-4 px-6 text-sm font-semibold text-gray-600">{t("payments.date")}</th>
                      <th className="text-right rtl:text-left py-4 px-6 text-sm font-semibold text-gray-600">{t("payments.amount")}</th>
                      <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">{t("common.status")}</th>
                      <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPayments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <Avatar name={payment.patient_name ?? "?"} size="sm" />
                            <span className="font-medium text-gray-900">{payment.patient_name ?? "—"}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full">
                            {payment.treatment}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-600">
                          {new Date(payment.date).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-6 text-right rtl:text-left">
                          <p className="font-semibold text-gray-900">{formatAmount(payment.amount_paid)}</p>
                          {payment.amount_paid < payment.amount_due && (
                            <p className="text-xs text-gray-400">of {formatAmount(payment.amount_due)}</p>
                          )}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {statusBadge(payment.status)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleOpenEdit(payment)}
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-dental-blue transition-colors"
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={() => handleDelete(payment.id)}
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-500 transition-colors"
                            >
                              <FaTrash />
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

      {/* Record Payment Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t("payments.recordNewPayment")}>
        {paymentFormFields}
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>
            {t("common.cancel")}
          </Button>
          <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90" onClick={handleAdd}>
            {t("payments.recordPayment")}
          </Button>
        </div>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal isOpen={showEditModal && !!selectedPayment} onClose={() => setShowEditModal(false)} title={t("payments.editPayment")}>
        {selectedPayment && (
          <>
            {paymentFormFields}
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90" onClick={handleEditSave}>
                {t("payments.saveChanges")}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
