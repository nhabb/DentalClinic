"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api/client";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import { PatientPageHeader } from "@/components/ui/PatientPageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  FaFileInvoiceDollar,
  FaChevronDown,
  FaChevronUp,
  FaPrint,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
} from "react-icons/fa";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type StatusFilter = "all" | "open" | "partial" | "paid";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusStyle(status: string) {
  return (
    {
      open: { badge: "bg-blue-100 text-blue-800", icon: <FaClock className="text-blue-500" />, bar: "bg-blue-500" },
      partial: { badge: "bg-yellow-100 text-yellow-800", icon: <FaExclamationCircle className="text-yellow-500" />, bar: "bg-yellow-500" },
      paid: { badge: "bg-green-100 text-green-800", icon: <FaCheckCircle className="text-green-500" />, bar: "bg-green-500" },
    }[status] ?? { badge: "bg-gray-100 text-gray-700", icon: null, bar: "bg-gray-400" }
  );
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PatientBillingPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [invoices, setInvoices] = useState<TreatmentInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const meRes = await apiFetch("/api/auth/me");
        if (!meRes.ok) {
          safeStorage.removeItem("patientAuth");
          safeStorage.removeItem("authToken");
          safeStorage.removeItem("userRole");
          safeStorage.removeItem("authProvider");
          router.push("/login");
          return;
        }
        const dbUser = await meRes.json();

        const res = await apiFetch(`/api/patient/billing/invoices?user_id=${dbUser.id}`);
        if (!res.ok) { setIsLoading(false); return; }
        const json = await res.json();
        const raw: any[] = Array.isArray(json.data) ? json.data : [];
        setInvoices(
          raw.map((inv) => ({
            ...inv,
            id: Number(inv.id),
            total_amount: Number(inv.total_amount),
            amount_paid: Number(inv.amount_paid),
            remaining_amount: Number(inv.remaining_amount),
            line_items: (inv.line_items ?? []).map((li: any) => ({
              ...li,
              id: Number(li.id),
              amount: Number(li.amount),
            })),
            invoice_payments: (inv.invoice_payments ?? []).map((p: any) => ({
              ...p,
              id: Number(p.id),
              amount: Number(p.amount),
            })),
          }))
        );
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [router]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalBilled = invoices.reduce((s, i) => s + i.total_amount, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.amount_paid, 0);
  const totalOutstanding = invoices.reduce((s, i) => s + i.remaining_amount, 0);

  const counts: Record<StatusFilter, number> = {
    all: invoices.length,
    open: invoices.filter((i) => i.status === "open").length,
    partial: invoices.filter((i) => i.status === "partial").length,
    paid: invoices.filter((i) => i.status === "paid").length,
  };

  const filtered = filter === "all" ? invoices : invoices.filter((i) => i.status === filter);

  const toggleExpand = (id: number) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const handlePrint = (inv: TreatmentInvoice) => {
    const lines = [
      "BrightSmile Dental Clinic",
      "==========================",
      "",
      `Invoice #${inv.id}`,
      `Date: ${new Date(inv.procedure_date).toLocaleDateString()}`,
      `Status: ${inv.status.toUpperCase()}`,
      "",
      "PROCEDURES",
      "----------",
      ...inv.line_items.map((li) => `  ${li.procedure_name.padEnd(30)} ${fmt(li.amount)}`),
      "",
      `Total:     ${fmt(inv.total_amount)}`,
      `Paid:      ${fmt(inv.amount_paid)}`,
      `Remaining: ${fmt(inv.remaining_amount)}`,
      "",
      ...(inv.invoice_payments.length > 0
        ? [
            "PAYMENT HISTORY",
            "---------------",
            ...inv.invoice_payments.map(
              (p) =>
                `  ${new Date(p.created_at).toLocaleDateString()}  ${fmt(p.amount)}  ${p.payment_method}${p.notes ? `  (${p.notes})` : ""}`
            ),
            "",
          ]
        : []),
      ...(inv.notes ? [`Notes: ${inv.notes}`, ""] : []),
      "==========================",
      `Printed: ${new Date().toLocaleString()}`,
    ];

    const win = window.open("", "_blank", "width=600,height=800");
    if (!win) return;
    win.document.write(
      `<pre style="font-family:monospace;padding:2rem;white-space:pre-wrap">${lines.join("\n")}</pre>`
    );
    win.document.close();
    win.print();
  };

  // ── Filter tabs ────────────────────────────────────────────────────────────
  const tabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: t("billing.statusAll") },
    { key: "open", label: t("billing.statusOpen") },
    { key: "partial", label: t("billing.statusPartial") },
    { key: "paid", label: t("billing.statusPaid") },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      <PatientPageHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FaFileInvoiceDollar className="text-dental-blue" />
            {t("patientBilling.title")}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">{t("patientBilling.subtitle")}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-24"><LoadingSpinner /></div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center">
                <p className="text-xs text-gray-500 font-medium mb-1">{t("patientBilling.totalBilled")}</p>
                <p className="text-2xl font-bold text-gray-900">{fmt(totalBilled)}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-5 text-center">
                <p className="text-xs text-green-600 font-medium mb-1">{t("patientBilling.totalPaid")}</p>
                <p className="text-2xl font-bold text-green-700">{fmt(totalPaid)}</p>
              </div>
              <div className={`bg-white rounded-2xl shadow-sm border p-5 text-center ${totalOutstanding > 0 ? "border-red-100" : "border-gray-100"}`}>
                <p className={`text-xs font-medium mb-1 ${totalOutstanding > 0 ? "text-red-500" : "text-gray-500"}`}>
                  {t("patientBilling.outstanding")}
                </p>
                <p className={`text-2xl font-bold ${totalOutstanding > 0 ? "text-red-600" : "text-gray-900"}`}>
                  {fmt(totalOutstanding)}
                </p>
              </div>
            </div>

            {/* Status filter tabs */}
            {invoices.length > 0 && (
              <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
                {tabs.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      filter === key
                        ? "bg-white text-dental-blue shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {label}
                    {counts[key] > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        filter === key ? "bg-dental-blue/10 text-dental-blue" : "bg-gray-200 text-gray-600"
                      }`}>
                        {counts[key]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-lg p-14 text-center">
                <FaFileInvoiceDollar className="text-5xl text-gray-200 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-1">{t("patientBilling.noInvoices")}</h3>
                <p className="text-gray-400 text-sm max-w-xs mx-auto">{t("patientBilling.noInvoicesDesc")}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filtered.map((inv) => {
                  const isExpanded = expandedId === inv.id;
                  const { badge, icon, bar } = statusStyle(inv.status);
                  const paidPct = inv.total_amount > 0 ? (inv.amount_paid / inv.total_amount) * 100 : 0;

                  return (
                    <div
                      key={inv.id}
                      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
                    >
                      {/* Top colour bar */}
                      <div className={`h-1 ${bar}`} />

                      {/* Card header — clickable to expand */}
                      <button
                        onClick={() => toggleExpand(inv.id)}
                        className="w-full p-5 flex flex-wrap items-center justify-between gap-3 text-left"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 bg-dental-blue/8 rounded-xl flex items-center justify-center">
                            <FaFileInvoiceDollar className="text-dental-blue text-lg" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">
                              {t("patientBilling.invoice")} #{inv.id}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {t("patientBilling.invoiceDate")}:{" "}
                              {new Date(inv.procedure_date).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize flex items-center gap-1.5 ${badge}`}>
                            {icon}
                            {inv.status}
                          </span>
                          <div className="text-right hidden sm:block">
                            <p className="text-xs text-gray-400">{t("billing.colTotal")}</p>
                            <p className="font-bold text-gray-900 text-lg">{fmt(inv.total_amount)}</p>
                          </div>
                          <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                            {isExpanded ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
                          </div>
                        </div>
                      </button>

                      {/* Progress bar + quick amounts */}
                      <div className="px-5 pb-4">
                        {/* Progress bar */}
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
                          <div
                            className="bg-green-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${Math.min(paidPct, 100)}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-gray-50 rounded-xl p-3 text-center">
                            <p className="text-xs text-gray-500 font-medium">{t("billing.colTotal")}</p>
                            <p className="font-bold text-gray-800 mt-0.5">{fmt(inv.total_amount)}</p>
                          </div>
                          <div className="bg-green-50 rounded-xl p-3 text-center">
                            <p className="text-xs text-green-600 font-medium">{t("billing.colPaid")}</p>
                            <p className="font-bold text-green-700 mt-0.5">{fmt(inv.amount_paid)}</p>
                          </div>
                          <div className={`rounded-xl p-3 text-center ${inv.remaining_amount > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                            <p className={`text-xs font-medium ${inv.remaining_amount > 0 ? "text-red-500" : "text-gray-500"}`}>
                              {t("patientBilling.remaining")}
                            </p>
                            <p className={`font-bold mt-0.5 ${inv.remaining_amount > 0 ? "text-red-600" : "text-gray-500"}`}>
                              {fmt(inv.remaining_amount)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Expanded section */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-5 py-5 space-y-5 animate-fadeIn">
                          {/* Notes */}
                          {inv.notes && (
                            <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 italic">
                              {inv.notes}
                            </p>
                          )}

                          {/* Procedures table */}
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-3 text-sm">{t("billing.procedures")}</h4>
                            <div className="rounded-xl overflow-hidden border border-gray-200">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">
                                      {t("billing.procedureCol")}
                                    </th>
                                    <th className="px-4 py-2.5 text-right font-medium text-gray-600">
                                      {t("billing.amountCol")}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {inv.line_items.map((li) => (
                                    <tr key={li.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-4 py-3 text-gray-800">{li.procedure_name}</td>
                                      <td className="px-4 py-3 text-right text-gray-800 font-medium">{fmt(li.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                                    <td className="px-4 py-2.5 text-gray-700">{t("billing.total")}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-900">{fmt(inv.total_amount)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>

                          {/* Payment history */}
                          {inv.invoice_payments.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-800 mb-3 text-sm">{t("billing.paymentHistory")}</h4>
                              <div className="space-y-2">
                                {inv.invoice_payments.map((p) => (
                                  <div
                                    key={p.id}
                                    className="flex items-center justify-between text-sm bg-green-50 border border-green-100 rounded-xl px-4 py-3"
                                  >
                                    <div className="flex items-center gap-3">
                                      <FaCheckCircle className="text-green-500 shrink-0" />
                                      <div>
                                        <span className="font-semibold text-green-700">{fmt(p.amount)}</span>
                                        <span className="ml-2 text-gray-500 capitalize">{p.payment_method}</span>
                                        {p.notes && (
                                          <span className="ml-2 text-gray-400 italic">— {p.notes}</span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-gray-400 text-xs shrink-0">
                                      {new Date(p.created_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Print button */}
                          <div className="pt-1 flex justify-end">
                            <button
                              onClick={() => handlePrint(inv)}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-dental-blue border border-dental-blue/30 rounded-xl hover:bg-dental-blue/5 transition-colors"
                            >
                              <FaPrint />
                              {t("patientBilling.printInvoice")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
