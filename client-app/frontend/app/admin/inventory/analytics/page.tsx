"use client";

// Inventory analytics sub-page.
//
// Backend contract (NestJS, see backend/src/doctor/inventory):
//   GET /api/inventory?limit=N → { data: InventoryItem[] }
//   GET /api/inventory/movements?movement_type=in&from=YYYY-MM-DD&page&limit
//     → { data: InventoryMovement[], meta: { totalPages } }
//
// Monthly spend per item = every "in" movement × its recorded unit_cost
// (falling back to the item's current cost_price), bucketed by month.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { FaBoxes, FaExclamationTriangle, FaTimesCircle, FaDollarSign, FaChevronRight, FaShoppingCart, FaTimes } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { safeStorage } from "@/lib/browser-compat";
import { cn } from "@/lib/utils";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Card, Kpi, Donut, ChartTooltip, money, SERIES, INK, STOCK_COLOR } from "@/components/dashboard/chart-kit";
import { pct } from "@/components/dashboard/date-range";
import { FilterSelect } from "@/components/dashboard/FilterSelect";

interface Item {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minimum: number;
  status: "ok" | "low" | "out";
  value: number;
  unitCost: number;
  createdYear: number | null;
}

/** One stock-in movement priced at the unit cost paid. */
interface Purchase {
  itemId: number;
  month: string; // YYYY-MM
  spend: number;
}

const ALL = "all";
const pad2 = (n: number) => String(n).padStart(2, "0");
const monthKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const prevMonthKey = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 2, 1));
};
const monthName = (m: number, style: "short" | "long" = "short") =>
  new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: style });
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

const categoryLabel = (c: string) => {
  const key = (c || "").toLowerCase();
  const known: Record<string, string> = { disposables: "Disposables", materials: "Materials", medications: "Medications", instruments: "Instruments" };
  return known[key] ?? (c ? c.charAt(0).toUpperCase() + c.slice(1) : "General");
};

export default function InventoryAnalyticsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch("/api/inventory?limit=500")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        if (cancelled) return;
        const mapped: Item[] = (Array.isArray(json?.data) ? json.data : []).map((raw: any) => {
          const quantity = Number(raw.quantity ?? 0);
          const minimum = Number(raw.minimum_quantity ?? 0);
          return {
            id: Number(raw.id),
            name: raw.name,
            category: categoryLabel(raw.category),
            quantity,
            minimum,
            status: quantity === 0 ? "out" : quantity <= minimum ? "low" : "ok",
            value: quantity * Number(raw.cost_price ?? 0),
            unitCost: Number(raw.cost_price ?? 0),
            createdYear: raw.created_at ? new Date(raw.created_at).getFullYear() : null,
          };
        });
        setItems(mapped);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load inventory analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Page-wide filters. Category and item scope every section; year/month scope spend
  // (stock levels are a live snapshot — movements can't rebuild past stock).
  const now = new Date();
  const thisYear = now.getFullYear();
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [itemFilter, setItemFilter] = useState(ALL);
  const [yearFilter, setYearFilter] = useState(String(thisYear));
  const [monthFilter, setMonthFilter] = useState(ALL);
  const year = Number(yearFilter);
  const filtersActive = categoryFilter !== ALL || itemFilter !== ALL || yearFilter !== String(thisYear) || monthFilter !== ALL;
  const resetFilters = () => {
    setCategoryFilter(ALL);
    setItemFilter(ALL);
    setYearFilter(String(thisYear));
    setMonthFilter(ALL);
  };

  // Stock-in movements from the year before the selected one through today:
  // covers January-vs-December, year-vs-last-year, and the bar chart's
  // rolling 12 months (which ignores the month/year filters).
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    setPurchasesLoading(true);
    const costById = new Map(items.map((it) => [it.id, it.unitCost]));
    (async () => {
      const rows: Purchase[] = [];
      for (let page = 1, totalPages = 1; page <= totalPages; page++) {
        const res = await apiFetch(`/api/inventory/movements?movement_type=in&from=${year - 1}-01-01&to=${thisYear}-12-31&page=${page}&limit=1000`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        totalPages = Number(json?.meta?.totalPages ?? 1);
        (Array.isArray(json?.data) ? json.data : []).forEach((m: any) => {
          if (!m.created_at) return;
          const itemId = Number(m.item_id);
          const unitCost = m.unit_cost != null ? Number(m.unit_cost) : costById.get(itemId) ?? 0;
          rows.push({ itemId, month: monthKey(new Date(m.created_at)), spend: Number(m.quantity ?? 0) * unitCost });
        });
      }
      return rows;
    })()
      .then((rows) => {
        if (!cancelled) setPurchases(rows);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load purchase history.");
      })
      .finally(() => {
        if (!cancelled) setPurchasesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [items, year, thisYear]);

  const categoryItems = useMemo(() => (categoryFilter === ALL ? items : items.filter((i) => i.category === categoryFilter)), [items, categoryFilter]);
  const scopedItems = useMemo(
    () => (itemFilter === ALL ? categoryItems : categoryItems.filter((i) => String(i.id) === itemFilter)),
    [categoryItems, itemFilter],
  );

  /* Filter options */
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((i) => counts.set(i.category, (counts.get(i.category) ?? 0) + 1));
    return [
      { value: ALL, label: "All categories" },
      ...[...counts.keys()].sort().map((c) => ({ value: c, label: c, hint: String(counts.get(c)) })),
    ];
  }, [items]);
  // The item list follows the category; an item outside the new category is dropped.
  const itemOptions = useMemo(
    () => [
      { value: ALL, label: categoryFilter === ALL ? "All items" : `All ${categoryFilter.toLowerCase()}` },
      ...[...categoryItems].sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({ value: String(i.id), label: i.name, hint: i.category })),
    ],
    [categoryItems, categoryFilter],
  );
  useEffect(() => {
    if (itemFilter !== ALL && !categoryItems.some((i) => String(i.id) === itemFilter)) setItemFilter(ALL);
  }, [itemFilter, categoryItems]);
  const yearOptions = useMemo(() => {
    const earliest = Math.min(thisYear, ...items.map((i) => i.createdYear ?? thisYear));
    return Array.from({ length: thisYear - earliest + 1 }, (_, i) => String(thisYear - i)).map((y) => ({ value: y, label: y }));
  }, [items, thisYear]);
  const lastMonthOfYear = year === thisYear ? now.getMonth() + 1 : 12;
  const monthOptions = [
    { value: ALL, label: "All months" },
    ...Array.from({ length: 12 }, (_, i) => ({ value: pad2(i + 1), label: monthName(i + 1, "long"), disabled: i + 1 > lastMonthOfYear })),
  ];
  // Picking a year where the chosen month is still in the future drops the month.
  useEffect(() => {
    if (monthFilter !== ALL && Number(monthFilter) > lastMonthOfYear) setMonthFilter(ALL);
  }, [monthFilter, lastMonthOfYear]);

  /* Spend */
  const months = useMemo(() => Array.from({ length: lastMonthOfYear }, (_, i) => `${year}-${pad2(i + 1)}`), [year, lastMonthOfYear]);
  const focusMonth = monthFilter === ALL ? null : `${year}-${monthFilter}`;

  /** itemId → month → spend, for everything fetched. */
  const spendIndex = useMemo(() => {
    const idx = new Map<number, Map<string, number>>();
    purchases.forEach((p) => {
      const byMonth = idx.get(p.itemId) ?? new Map<string, number>();
      byMonth.set(p.month, (byMonth.get(p.month) ?? 0) + p.spend);
      idx.set(p.itemId, byMonth);
    });
    return idx;
  }, [purchases]);
  const spendOf = (ids: number[], month: string) => ids.reduce((s, id) => s + (spendIndex.get(id)?.get(month) ?? 0), 0);
  const scopedIds = scopedItems.map((i) => i.id);

  /** Item × month spend matrix; sorted by the focused month, else the year. */
  const spendByItem = useMemo(() => {
    return scopedItems
      .map((item) => {
        const row = months.map((m) => spendIndex.get(item.id)?.get(m) ?? 0);
        return { item, row, total: row.reduce((s, v) => s + v, 0) };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => {
        if (focusMonth) {
          const i = months.indexOf(focusMonth);
          if (b.row[i] !== a.row[i]) return b.row[i] - a.row[i];
        }
        return b.total - a.total;
      });
  }, [scopedItems, months, spendIndex, focusMonth]);

  const monthTotals = months.map((m) => spendOf(scopedIds, m));
  // Bar chart: always the last 12 months — follows category/item, not month/year.
  const spendChart = Array.from({ length: 12 }, (_, i) => {
    const key = monthKey(new Date(thisYear, now.getMonth() - 11 + i, 1));
    const [y, m] = key.split("-").map(Number);
    return { key, label: `${monthName(m)} ${String(y).slice(2)}`, spend: spendOf(scopedIds, key) };
  });
  const cellMax = Math.max(0, ...spendByItem.flatMap((r) => r.row));
  const focusIdx = focusMonth ? months.indexOf(focusMonth) : -1;

  // KPI: the focused month vs. the month before, or the year (to date) vs. the same months last year.
  const periodSpend = focusMonth ? spendOf(scopedIds, focusMonth) : monthTotals.reduce((s, v) => s + v, 0);
  const priorSpend = focusMonth
    ? spendOf(scopedIds, prevMonthKey(focusMonth))
    : months.reduce((s, m) => s + spendOf(scopedIds, `${year - 1}${m.slice(4)}`), 0);
  const periodLabel = focusMonth ? monthLabel(focusMonth) : year === thisYear ? `${year} to date` : String(year);
  const compareLabel = focusMonth ? "vs. previous month" : year === thisYear ? "vs. same period last year" : "vs. previous year";

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

  const lowCount = scopedItems.filter((i) => i.status === "low").length;
  const outCount = scopedItems.filter((i) => i.status === "out").length;
  const totalValue = scopedItems.reduce((s, i) => s + i.value, 0);

  const categorySlices = useMemo(() => {
    const counts: Record<string, number> = {};
    // Ignores the category filter so the donut doubles as a category picker.
    (itemFilter === ALL ? items : scopedItems).forEach((i) => (counts[i.category] = (counts[i.category] ?? 0) + 1));
    return Object.entries(counts).map(([cat, count], i) => ({ key: cat, label: cat, value: count, color: SERIES[i % SERIES.length] }));
  }, [items, scopedItems, itemFilter]);

  const stockByCategory = useMemo(() => {
    const cats = Array.from(new Set(scopedItems.map((i) => i.category))).sort();
    return cats.map((c) => {
      const rows = scopedItems.filter((i) => i.category === c);
      return {
        key: c,
        label: c,
        ok: rows.filter((r) => r.status === "ok").length,
        low: rows.filter((r) => r.status === "low").length,
        out: rows.filter((r) => r.status === "out").length,
      };
    });
  }, [scopedItems]);

  const lowStock = scopedItems
    .filter((i) => i.status !== "ok")
    .sort((a, b) => (a.status === b.status ? a.quantity - b.quantity : a.status === "out" ? -1 : 1));

  const axisTick = { fontSize: 11, fill: INK.muted };

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title="Inventory Analytics"
          subtitle="Stock health, category breakdown and monthly spend"
          actions={[{ key: "back", label: "Back to Inventory", icon: <FaBoxes />, href: "/admin/inventory" }]}
        />

        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          {loading && items.length === 0 ? (
            <LoadingSpinner label="Loading inventory analytics" />
          ) : (
            <>
              {/* Filters share the full width: 2×2 on small screens, one row from lg up. */}
              <div className="mb-5 flex flex-wrap items-center gap-2 lg:flex-nowrap">
                <FilterSelect label="Category" value={categoryFilter} options={categoryOptions} onChange={setCategoryFilter} className="basis-[calc(50%-4px)] lg:basis-0 flex-1" />
                <FilterSelect label="Item" value={itemFilter} options={itemOptions} onChange={setItemFilter} className="basis-[calc(50%-4px)] lg:basis-0 flex-1" />
                <FilterSelect label="Month" value={monthFilter} options={monthOptions} onChange={setMonthFilter} className="basis-[calc(50%-4px)] lg:basis-0 flex-1" />
                <FilterSelect label="Year" value={yearFilter} options={yearOptions} onChange={setYearFilter} className="basis-[calc(50%-4px)] lg:basis-0 flex-1" />
                {filtersActive && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-gray-600 animate-fade-in hover:bg-gray-100 hover:text-gray-900 lg:w-auto"
                  >
                    <FaTimes className="text-[10px]" /> Reset filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <Kpi icon={<FaBoxes />} label={itemFilter !== ALL ? "Items" : categoryFilter === ALL ? "Total items" : categoryFilter} value={scopedItems.length.toLocaleString()} sub="Current stock" />
                <Kpi icon={<FaExclamationTriangle />} label="Low stock" value={lowCount.toLocaleString()} tone={lowCount > 0 ? "warn" : "neutral"} sub="Current stock" />
                <Kpi icon={<FaTimesCircle />} label="Out of stock" value={outCount.toLocaleString()} tone={outCount > 0 ? "bad" : "neutral"} sub="Current stock" />
                <Kpi icon={<FaDollarSign />} label="Estimated value" value={money(totalValue)} sub="Quantity × unit cost" />
                <Kpi
                  icon={<FaShoppingCart />}
                  label={`Spend · ${periodLabel}`}
                  value={purchasesLoading ? "…" : money(periodSpend)}
                  sub={compareLabel}
                  delta={purchasesLoading ? null : pct(periodSpend, priorSpend)}
                />
              </div>

              <Card
                title={`Monthly spend${itemFilter !== ALL ? ` · ${scopedItems[0]?.name ?? ""}` : categoryFilter !== ALL ? ` · ${categoryFilter}` : " by item"}`}
                subtitle={`Stock-in quantity × unit cost paid.${itemFilter === ALL ? " Click an item to filter the page to it." : ""}`}
                className="mb-5"
              >
                {purchasesLoading ? (
                  <p className="flex h-[200px] items-center justify-center text-sm text-gray-400">Loading purchase history…</p>
                ) : (
                  <>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Last 12 months · click a bar to inspect that month</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={spendChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                        <CartesianGrid vertical={false} stroke={INK.grid} />
                        <XAxis dataKey="label" interval="preserveStartEnd" tick={axisTick} tickLine={false} axisLine={false} />
                        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => money(Number(v))} />
                        <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={<ChartTooltip formatter={money} />} />
                        <Bar
                          dataKey="spend"
                          name="Spend"
                          fill={SERIES[0]}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={36}
                          isAnimationActive={false}
                          className="cursor-pointer"
                          onClick={(d: any) => {
                            // Jump the table and KPIs to the clicked month.
                            if (!d?.key) return;
                            setYearFilter(d.key.slice(0, 4));
                            setMonthFilter(d.key.slice(5));
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>

                    <p className="mt-5 mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      By item · {focusMonth ? monthLabel(focusMonth) : year}
                    </p>
                    {spendByItem.length === 0 ? (
                      <p className="flex h-24 items-center justify-center text-sm text-gray-400">
                        No stock-in purchases{itemFilter !== ALL ? " for this item" : categoryFilter !== ALL ? ` in ${categoryFilter.toLowerCase()}` : ""} in {year}.
                      </p>
                    ) : (
                    <div className="max-h-[360px] overflow-auto rounded-xl border border-gray-100">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-white">
                          <tr className="border-b border-gray-100 text-gray-500">
                            <th className="sticky start-0 bg-white px-3 py-2 text-start font-medium">Item</th>
                            {months.map((m, i) => (
                              <th key={m} className={cn("whitespace-nowrap px-2 py-2 text-end font-medium", i === focusIdx && "text-brand")}>
                                {monthName(i + 1)}
                              </th>
                            ))}
                            <th className="px-3 py-2 text-end font-medium">{year}</th>
                            <th
                              className="whitespace-nowrap px-3 py-2 text-end font-medium"
                              title={focusMonth ? `${monthLabel(focusMonth)} vs. the month before` : "Latest month vs. the month before"}
                            >
                              MoM
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {spendByItem.map(({ item, row, total }) => {
                            const active = String(item.id) === itemFilter;
                            const toggle = () => setItemFilter((prev) => (prev === String(item.id) ? ALL : String(item.id)));
                            const momMonth = focusMonth ?? months[months.length - 1];
                            const change = pct(spendOf([item.id], momMonth), spendOf([item.id], prevMonthKey(momMonth)));
                            return (
                              <tr
                                key={item.id}
                                onClick={toggle}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    toggle();
                                  }
                                }}
                                tabIndex={0}
                                className={cn("cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand", active && "bg-blue-50/60 hover:bg-blue-50")}
                              >
                                <td className={cn("sticky start-0 max-w-[200px] px-3 py-1.5", active ? "bg-blue-50" : "bg-white")}>
                                  <p className="truncate font-medium text-gray-900" title={item.name}>{item.name}</p>
                                  <p className="truncate text-[10px] text-gray-400">{item.category}</p>
                                </td>
                                {row.map((v, i) => (
                                  <td key={months[i]} className={cn("px-1 py-1", focusIdx >= 0 && i !== focusIdx && "opacity-40")}>
                                    <span
                                      className={cn("block rounded-md px-1.5 py-1 text-end tabular-nums", v > 0 ? "text-gray-900" : "text-gray-300", i === focusIdx && "ring-1 ring-brand/40")}
                                      style={v > 0 && cellMax > 0 ? { background: `rgba(42,120,214,${0.08 + 0.4 * (v / cellMax)})` } : undefined}
                                    >
                                      {v > 0 ? money(v) : "—"}
                                    </span>
                                  </td>
                                ))}
                                <td className="px-3 py-1.5 text-end font-semibold tabular-nums text-gray-900">{money(total)}</td>
                                <td className="px-3 py-1.5 text-end tabular-nums">
                                  {change === null ? (
                                    <span className="text-gray-300">—</span>
                                  ) : (
                                    <span className={change > 0 ? "text-red-600" : change < 0 ? "text-emerald-600" : "text-gray-500"}>
                                      {change > 0 ? "+" : ""}{Math.round(change)}%
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="sticky bottom-0 bg-white">
                          <tr className="border-t border-gray-200 font-semibold text-gray-900">
                            <td className="sticky start-0 bg-white px-3 py-2">{itemFilter !== ALL ? "Total" : categoryFilter === ALL ? "All items" : `All ${categoryFilter.toLowerCase()}`}</td>
                            {monthTotals.map((v, i) => (
                              <td key={months[i]} className={cn("px-2 py-2 text-end tabular-nums", focusIdx >= 0 && i !== focusIdx && "opacity-40")}>{money(v)}</td>
                            ))}
                            <td className="px-3 py-2 text-end tabular-nums">{money(monthTotals.reduce((s, v) => s + v, 0))}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    )}
                  </>
                )}
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
                <Card
                  title="Stock health by category"
                  subtitle="OK / low / out"
                  className="lg:col-span-2"
                  action={
                    <div className="flex items-center gap-3 text-[11px] text-gray-500">
                      {(["ok", "low", "out"] as const).map((s) => (
                        <span key={s} className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-sm" style={{ background: STOCK_COLOR[s] }} />
                          {s === "ok" ? "OK" : s === "low" ? "Low" : "Out"}
                        </span>
                      ))}
                    </div>
                  }
                >
                  {stockByCategory.length === 0 ? (
                    <p className="flex h-[200px] items-center justify-center text-sm text-gray-400">No inventory items yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={stockByCategory} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid horizontal={false} stroke={INK.grid} />
                        <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={90} />
                        <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={<ChartTooltip />} />
                        {(["ok", "low", "out"] as const).map((s, i) => (
                          <Bar
                            key={s}
                            dataKey={s}
                            stackId="stock"
                            name={s === "ok" ? "OK" : s === "low" ? "Low" : "Out"}
                            fill={STOCK_COLOR[s]}
                            stroke={INK.surface}
                            strokeWidth={2}
                            maxBarSize={18}
                            isAnimationActive={false}
                            radius={i === 2 ? [0, 4, 4, 0] : 0}
                          >
                            {stockByCategory.map((c) => (
                              <Cell key={c.key} />
                            ))}
                          </Bar>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Card>

                <Card title="By category">
                  <Donut
                    slices={categorySlices}
                    selected={categoryFilter === ALL ? null : categoryFilter}
                    onSelect={(key) => setCategoryFilter((prev) => (prev === key ? ALL : key))}
                    emptyLabel="No inventory items yet."
                    hint="items"
                  />
                </Card>
              </div>

              <Card
                title="Low-stock alerts"
                action={
                  <Link href="/admin/inventory" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                    Manage <FaChevronRight className="text-[9px] rtl:rotate-180" />
                  </Link>
                }
              >
                {lowStock.length === 0 ? (
                  <p className="text-sm text-gray-500">All items are well stocked.</p>
                ) : (
                  <ul className="max-h-[260px] space-y-2 overflow-y-auto pe-1">
                    {lowStock.map((item) => (
                      <li
                        key={item.id}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border p-2.5",
                          item.status === "out" ? "border-red-100 bg-red-50/60" : "border-amber-100 bg-amber-50/60",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            item.status === "out" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600",
                          )}
                        >
                          <FaExclamationTriangle className="text-xs" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900" title={item.name}>{item.name}</p>
                          <p className="truncate text-[11px] text-gray-500">{item.quantity} / min {item.minimum}</p>
                        </div>
                        <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-white">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${item.minimum > 0 ? Math.min(100, (item.quantity / item.minimum) * 100) : 0}%`, background: STOCK_COLOR[item.status] }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
