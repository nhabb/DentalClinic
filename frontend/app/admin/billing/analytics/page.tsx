"use client";

// Billing analytics sub-page.
//
// Backend contract (NestJS, see backend/src/doctor/billing):
//   GET /api/billing/kpis            → { all_time: {...}, this_month, last_month, growth }
//   GET /api/billing/invoices        → { data: TreatmentInvoice[] }
//   GET /api/billing/invoice-payments → InvoicePayment[]
//
// NOTE FOR BACKEND TEAM: billing.service.ts already has getAgingReport() and
// getPaymentsAnalytics(months) fully implemented, but neither is wired to a
// controller route. This page replicates the same aging-bucket logic
// (0-30/31-60/61-90/90+ days on open+partial invoices) client-side from the
// /billing/invoices list in the meantime — exposing GET /billing/aging and
// GET /billing/payments-analytics would let this page fetch pre-aggregated
// data instead.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { FaFileInvoiceDollar, FaWallet, FaChartPie, FaPercentage } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { safeStorage } from "@/lib/browser-compat";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Card, Kpi, Donut, HBars, ChartTooltip, money, SERIES, INK, INVOICE_STATUS_COLOR } from "@/components/dashboard/chart-kit";

interface Kpis {
  all_time: {
    total_billed: number;
    total_collected: number;
    total_outstanding: number;
    total_expenses: number;
    net_profit: number;
    collection_rate_pct: number;
    average_invoice: number;
    total_invoices: number;
  };
}

interface Invoice {
  id: number;
  total_amount: number;
  remaining_amount: number;
  status: "open" | "partial" | "paid";
  created_at: string;
}

interface InvoicePayment {
  id: number;
  amount: number;
  payment_method: string | null;
  created_at: string;
}

const AGING_BUCKETS = [
  { key: "0_30", label: "0–30 days", max: 30 },
  { key: "31_60", label: "31–60 days", max: 60 },
  { key: "61_90", label: "61–90 days", max: 90 },
  { key: "90_plus", label: "90+ days", max: Infinity },
] as const;

const monthKeyOf = (iso: string) => iso.slice(0, 7);
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};
const methodLabel = (m: string) => m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, " ");

export default function BillingAnalyticsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch("/api/billing/kpis").then((r) => (r.ok ? r.json() : null)),
      apiFetch("/api/billing/invoices?limit=500").then((r) => (r.ok ? r.json() : { data: [] })),
      apiFetch("/api/billing/invoice-payments?limit=1000").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([kpisJson, invoicesJson, paymentsJson]) => {
        if (cancelled) return;
        setKpis(kpisJson);
        setInvoices(
          (Array.isArray(invoicesJson?.data) ? invoicesJson.data : []).map((inv: any) => ({
            id: Number(inv.id),
            total_amount: Number(inv.total_amount),
            remaining_amount: Number(inv.remaining_amount),
            status: inv.status,
            created_at: inv.created_at,
          })),
        );
        setPayments(
          (Array.isArray(paymentsJson) ? paymentsJson : []).map((p: any) => ({
            id: Number(p.id),
            amount: Number(p.amount),
            payment_method: p.payment_method,
            created_at: p.created_at,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load billing analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("userRole");
    safeStorage.removeItem("doctorId");
    safeStorage.removeItem("assignedDoctorIds");
    router.push("/login");
  };

  // Invoices by status — totals in dollars.
  const statusTotals: Record<string, number> = { open: 0, partial: 0, paid: 0 };
  invoices.forEach((inv) => {
    statusTotals[inv.status] = (statusTotals[inv.status] ?? 0) + inv.total_amount;
  });
  const statusSlices = (Object.keys(statusTotals) as Invoice["status"][])
    .filter((s) => statusTotals[s] > 0)
    .map((s) => ({ key: s, label: s.charAt(0).toUpperCase() + s.slice(1), value: statusTotals[s], color: INVOICE_STATUS_COLOR[s] }));

  // Aging buckets — remaining balance on open/partial invoices, by days since created.
  const now = Date.now();
  const agingTotals: Record<string, number> = { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
  invoices
    .filter((inv) => inv.status !== "paid" && inv.remaining_amount > 0)
    .forEach((inv) => {
      const days = Math.floor((now - new Date(inv.created_at).getTime()) / 86_400_000);
      const bucket = AGING_BUCKETS.find((b) => days <= b.max) ?? AGING_BUCKETS[AGING_BUCKETS.length - 1];
      agingTotals[bucket.key] += inv.remaining_amount;
    });
  const agingRows = AGING_BUCKETS.map((b, i) => ({ key: b.key, label: b.label, value: agingTotals[b.key], color: SERIES[i % SERIES.length] }));

  // Payments by method.
  const methodTotals: Record<string, number> = {};
  payments.forEach((p) => {
    const m = p.payment_method || "other";
    methodTotals[m] = (methodTotals[m] ?? 0) + p.amount;
  });
  const methodSlices = Object.entries(methodTotals).map(([m, total], i) => ({
    key: m,
    label: methodLabel(m),
    value: total,
    color: SERIES[i % SERIES.length],
  }));

  // Income (payments received) by month.
  const monthlyIncome: Record<string, number> = {};
  payments.forEach((p) => {
    const key = monthKeyOf(p.created_at);
    monthlyIncome[key] = (monthlyIncome[key] ?? 0) + p.amount;
  });
  const incomeChart = Object.entries(monthlyIncome)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([ym, amount]) => ({ label: monthLabel(ym), amount }));

  const kpiAll = kpis?.all_time;

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title="Billing Analytics"
          subtitle="Collections, outstanding balances, and payment trends"
          actions={[{ key: "back", label: "Back to Billing", icon: <FaFileInvoiceDollar />, href: "/admin/billing" }]}
        />

        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          {loading && !kpis ? (
            <LoadingSpinner label="Loading billing analytics" />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Kpi icon={<FaFileInvoiceDollar />} label="Total billed" value={money(kpiAll?.total_billed ?? 0)} sub={`${kpiAll?.total_invoices ?? 0} invoices`} />
                <Kpi icon={<FaWallet />} label="Collected" value={money(kpiAll?.total_collected ?? 0)} tone="good" />
                <Kpi
                  icon={<FaChartPie />}
                  label="Outstanding"
                  value={money(kpiAll?.total_outstanding ?? 0)}
                  tone={kpiAll && kpiAll.total_outstanding > 0 ? "warn" : "neutral"}
                />
                <Kpi icon={<FaPercentage />} label="Collection rate" value={`${kpiAll?.collection_rate_pct ?? 0}%`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
                <Card title="Payments received" subtitle="Last 12 months" className="lg:col-span-2">
                  {incomeChart.every((m) => m.amount === 0) ? (
                    <p className="flex h-64 items-center justify-center text-sm text-gray-400">No payments in this period.</p>
                  ) : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={incomeChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={INK.grid} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} width={48} />
                          <Tooltip content={<ChartTooltip formatter={money} />} />
                          <Bar dataKey="amount" name="Collected" fill={SERIES[0]} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                <Card title="Invoices by status">
                  <Donut
                    slices={statusSlices}
                    selected={selectedStatus}
                    onSelect={(key) => setSelectedStatus((prev) => (prev === key ? null : key))}
                    formatter={money}
                    emptyLabel="No invoices yet."
                    hint="billed"
                  />
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Outstanding by age" subtitle="Open and partially-paid invoices">
                  <HBars rows={agingRows} selected={null} onSelect={() => {}} emptyLabel="Nothing outstanding." formatter={money} />
                </Card>

                <Card title="Payments by method">
                  <Donut
                    slices={methodSlices}
                    selected={selectedMethod}
                    onSelect={(key) => setSelectedMethod((prev) => (prev === key ? null : key))}
                    formatter={money}
                    emptyLabel="No payments yet."
                    hint="collected"
                  />
                </Card>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
