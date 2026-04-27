"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Avatar } from "@/components/ui/Avatar";
import { getStoredPhoto } from "@/lib/profilePhoto";
import { supabase } from "@/lib/supabase/client";
import {
  FaTooth,
  FaSignOutAlt,
  FaFileInvoiceDollar,
  FaChevronDown,
  FaChevronUp,
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

export default function PatientBillingPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [invoices, setInvoices] = useState<TreatmentInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [patientName, setPatientName] = useState("");

  useEffect(() => {
    const loadPhoto = async () => {
      let email: string | null = null;
      let name = "";
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) email = session.user.email;
      } catch {}
      const stored = sessionStorage.getItem("adminUser");
      if (stored) {
        try {
          const u = JSON.parse(stored);
          if (!email) email = u.email ?? null;
          name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
        } catch {}
      }
      if (name) setPatientName(name);
      if (email) setPhotoUrl(getStoredPhoto(email));
    };
    loadPhoto();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const meRes = await apiFetch("/api/auth/me");
        if (!meRes.ok) { router.push("/login"); return; }
        const dbUser = await meRes.json();

        const res = await apiFetch(`/api/patient/billing/invoices?user_id=${dbUser.id}&limit=100`);
        if (!res.ok) { setIsLoading(false); return; }
        const json = await res.json();
        const raw = Array.isArray(json.data) ? json.data : [];
        setInvoices(
          raw.map((inv: any) => ({
            ...inv,
            id: Number(inv.id),
            total_amount: Number(inv.total_amount),
            amount_paid: Number(inv.amount_paid),
            remaining_amount: Number(inv.remaining_amount),
            line_items: (inv.line_items ?? []).map((li: any) => ({ ...li, id: Number(li.id), amount: Number(li.amount) })),
            invoice_payments: (inv.invoice_payments ?? []).map((p: any) => ({ ...p, id: Number(p.id), amount: Number(p.amount) })),
          }))
        );
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleLogout = () => {
    safeStorage.removeItem("patientAuth");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("userRole");
    router.push("/login");
  };

  const toggleExpand = (id: number) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
                <FaTooth className="text-white text-xl" />
              </div>
              <span className="text-xl font-bold text-gray-900">BrightSmile</span>
            </Link>
            <div className="flex items-center gap-3">
              {(photoUrl || patientName) && (
                <Avatar name={patientName || "User"} size="sm" src={photoUrl} />
              )}
              <LanguageSwitcher />
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                <FaSignOutAlt />
                <span className="hidden sm:inline">{t("common.logout")}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FaFileInvoiceDollar className="text-dental-blue" />
            My Invoices
          </h1>
          <p className="text-gray-500 mt-1 text-sm">View your treatment invoices and payment history.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : invoices.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <FaFileInvoiceDollar className="text-5xl text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">No invoices yet</h3>
            <p className="text-gray-500 text-sm">Your treatment invoices will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {invoices.map((inv) => {
              const isExpanded = expandedId === inv.id;
              return (
                <div key={inv.id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                  {/* Card header */}
                  <div className="p-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                        <FaFileInvoiceDollar className="text-dental-blue" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          Invoice #{inv.id}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDateBeirut(inv.procedure_date)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge status={inv.status} />
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="font-bold text-gray-900">${inv.total_amount.toFixed(2)}</p>
                      </div>
                      <button
                        onClick={() => toggleExpand(inv.id)}
                        className="p-2 text-gray-400 hover:text-dental-blue hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                      </button>
                    </div>
                  </div>

                  {/* Summary row */}
                  <div className="px-5 pb-4 grid grid-cols-3 gap-3">
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-blue-600 font-medium">Total</p>
                      <p className="font-bold text-blue-800">${inv.total_amount.toFixed(2)}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-green-600 font-medium">Paid</p>
                      <p className="font-bold text-green-800">${inv.amount_paid.toFixed(2)}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-red-600 font-medium">Remaining</p>
                      <p className="font-bold text-red-800">${inv.remaining_amount.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                      {inv.notes && (
                        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 italic">{inv.notes}</p>
                      )}

                      {/* Procedures */}
                      <div>
                        <h4 className="font-semibold text-gray-800 mb-2 text-sm">Procedures</h4>
                        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Procedure</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {inv.line_items.map((li) => (
                              <tr key={li.id}>
                                <td className="px-3 py-2 text-gray-800">{li.procedure_name}</td>
                                <td className="px-3 py-2 text-right text-gray-800">${li.amount.toFixed(2)}</td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50 font-semibold">
                              <td className="px-3 py-2">Total</td>
                              <td className="px-3 py-2 text-right">${inv.total_amount.toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Payment history */}
                      {inv.invoice_payments.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-800 mb-2 text-sm">Payment History</h4>
                          <div className="space-y-2">
                            {inv.invoice_payments.map((p) => (
                              <div key={p.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                                <div>
                                  <span className="font-medium text-gray-800">${p.amount.toFixed(2)}</span>
                                  <span className="ml-2 text-gray-500 capitalize">{p.payment_method}</span>
                                  {p.notes && <span className="ml-2 text-gray-400 italic">{p.notes}</span>}
                                </div>
                                <span className="text-gray-400">{formatDateBeirut(p.created_at)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
