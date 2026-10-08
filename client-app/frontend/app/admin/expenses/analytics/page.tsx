"use client";

// Expenses analytics sub-page.
//
// Backend contract (NestJS, see backend/src/doctor/expenses):
//   GET /api/expenses/analytics?months=N → { period_months, total, total_paid,
//     total_outstanding, monthly: [{month:"YYYY-MM", amount}], by_category: [{category, total, count}] }
// The backend already aggregates monthly trend + category breakdown, so this
// page charts the response directly rather than re-deriving it client-side.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { FaMoneyBillWave, FaCheckCircle, FaWallet, FaLayerGroup } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { safeStorage } from "@/lib/browser-compat";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Card, Kpi, Donut, ChartTooltip, money, SERIES, INK } from "@/components/dashboard/chart-kit";

interface Analytics {
  period_months: number;
  total: number;
  total_paid: number;
  total_outstanding: number;
  monthly: { month: string; amount: number }[];
  by_category: { category: string; total: number; count: number }[];
}

const MONTH_OPTIONS = [3, 6, 12, 24] as const;

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

const categoryLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

export default function ExpensesAnalyticsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [months, setMonths] = useState<(typeof MONTH_OPTIONS)[number]>(12);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/expenses/analytics?months=${months}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load expense analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [months]);

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

  const monthlyChart = (data?.monthly ?? []).map((m) => ({ label: monthLabel(m.month), amount: m.amount }));
  const categorySlices = (data?.by_category ?? []).map((c, i) => ({
    key: c.category,
    label: categoryLabel(c.category),
    value: c.total,
    color: SERIES[i % SERIES.length],
    count: c.count,
  }));
  const avgPerMonth = data && data.period_months > 0 ? data.total / data.period_months : 0;

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar
        sidebarOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title="Expenses Analytics"
          subtitle="Monthly trends and spending breakdown"
          actions={[
            { key: "back", label: "Back to Expenses", icon: <FaWallet />, href: "/admin/expenses" },
          ]}
        />

        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          <div className="mb-6 inline-flex items-center gap-0.5 rounded-xl bg-gray-100 p-1">
            {MONTH_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonths(m)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  months === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {m}mo
              </button>
            ))}
          </div>

          {loading && !data ? (
            <LoadingSpinner label="Loading expense analytics" />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Kpi icon={<FaMoneyBillWave />} label="Total expenses" value={money(data?.total ?? 0)} sub={`Last ${months} months`} />
                <Kpi icon={<FaCheckCircle />} label="Paid" value={money(data?.total_paid ?? 0)} tone="good" />
                <Kpi
                  icon={<FaWallet />}
                  label="Outstanding"
                  value={money(data?.total_outstanding ?? 0)}
                  tone={data && data.total_outstanding > 0 ? "warn" : "neutral"}
                />
                <Kpi icon={<FaLayerGroup />} label="Avg per month" value={money(avgPerMonth)} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <Card title="Monthly trend" subtitle={`${monthlyChart.length} months`} className="lg:col-span-2">
                  {monthlyChart.every((m) => m.amount === 0) ? (
                    <p className="flex h-64 items-center justify-center text-sm text-gray-400">No expenses in this period.</p>
                  ) : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={INK.grid} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} width={48} />
                          <Tooltip content={<ChartTooltip formatter={money} />} />
                          <Bar dataKey="amount" name="Expenses" fill={SERIES[1]} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                <Card title="By category">
                  <Donut
                    slices={categorySlices}
                    selected={selectedCategory}
                    onSelect={(key) => setSelectedCategory((prev) => (prev === key ? null : key))}
                    formatter={money}
                    emptyLabel="No expenses in this period."
                    hint="total"
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
