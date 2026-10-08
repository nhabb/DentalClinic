"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  FaCalendarCheck,
  FaDollarSign,
  FaWallet,
  FaChartLine,
  FaFileInvoiceDollar,
  FaUserPlus,
  FaTimes,
  FaArrowUp,
  FaArrowDown,
  FaExclamationTriangle,
  FaChevronRight,
  FaFilter,
} from "react-icons/fa";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import TeethReport, { type RecordRow } from "@/components/dashboard/TeethReport";

export type { RecordRow };

/* ──────────────────────────────────────────────────────────────────────────
 * Data contracts (normalised by the page, consumed here)
 * ────────────────────────────────────────────────────────────────────────── */
export interface ApptRow { id: number; date: string; status: string; type: string; doctorId: number }
export interface ExpenseRow { id: number; date: string; category: string; amount: number }
export interface PaymentRow { id: number; date: string; amount: number; method: string }
export interface InvoiceRow { id: number; date: string; status: "open" | "partial" | "paid"; total: number; remaining: number }
export interface InventoryRow { id: number; name: string; category: string; quantity: number; minimum: number; status: "ok" | "low" | "out" }
export interface PatientRow { id: number; registeredDate: string }
export interface DoctorRef { id: number; name: string }

export interface DashboardData {
  /** Dental records across all patients (tooth-level work). */
  records: RecordRow[];
  appointments: ApptRow[];
  expenses: ExpenseRow[];
  payments: PaymentRow[];
  invoices: InvoiceRow[];
  inventory: InventoryRow[];
  patients: PatientRow[];
  doctors: DoctorRef[];
}

interface Props {
  data: DashboardData;
  loading?: boolean;
  /** Operational panels (e.g. today's schedule) rendered between the KPIs and the charts. */
  operations?: ReactNode;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Palette — validated categorical slots (fixed order, never cycled) + status
 * ────────────────────────────────────────────────────────────────────────── */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"] as const;
const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" } as const;
const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#9ca3af", grid: "#eeeeea", surface: "#ffffff" } as const;
const INCOME = SERIES[0];
const EXPENSE = SERIES[1];
const NET = INK.secondary;

const APPT_STATUS_COLOR: Record<string, string> = {
  scheduled: SERIES[0],
  confirmed: SERIES[2],
  in_progress: SERIES[3],
  completed: STATUS.good,
  cancelled: STATUS.critical,
  no_show: STATUS.serious,
};
const INVOICE_STATUS_COLOR: Record<string, string> = { open: SERIES[0], partial: STATUS.warning, paid: STATUS.good };
const STOCK_COLOR: Record<string, string> = { ok: STATUS.good, low: STATUS.warning, out: STATUS.critical };

/* ──────────────────────────────────────────────────────────────────────────
 * Filters
 * ────────────────────────────────────────────────────────────────────────── */
type RangeKey = "7d" | "30d" | "90d" | "6m" | "12m" | "all";
const RANGES: RangeKey[] = ["7d", "30d", "90d", "6m", "12m", "all"];

interface Filters {
  range: RangeKey;
  bucket: { start: string; end: string; label: string } | null;
  weekday: number | null;
  doctorId: number | null;
  apptStatus: string | null;
  apptType: string | null;
  expenseCategory: string | null;
  invoiceStatus: string | null;
  paymentMethod: string | null;
  inventoryCategory: string | null;
}
type DimKey = Exclude<keyof Filters, "range">;
const EMPTY: Filters = {
  range: "6m", bucket: null, weekday: null, doctorId: null, apptStatus: null, apptType: null,
  expenseCategory: null, invoiceStatus: null, paymentMethod: null, inventoryCategory: null,
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const dayOf = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`);

function rangeBounds(range: RangeKey): { start: string | null; end: string; prevStart: string | null; prevEnd: string | null } {
  const today = new Date();
  const end = iso(today);
  if (range === "all") return { start: null, end, prevStart: null, prevEnd: null };
  const startDate =
    range === "7d" ? addDays(today, -6) : range === "30d" ? addDays(today, -29) : range === "90d" ? addDays(today, -89)
    : range === "6m" ? addMonths(today, -6) : addMonths(today, -12);
  const spanDays = Math.round((today.getTime() - startDate.getTime()) / 86400000) + 1;
  const prevEndDate = addDays(startDate, -1);
  const prevStartDate = addDays(prevEndDate, -(spanDays - 1));
  return { start: iso(startDate), end, prevStart: iso(prevStartDate), prevEnd: iso(prevEndDate) };
}

const within = (date: string, start: string | null, end: string | null) => {
  const d = date.slice(0, 10);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
};

/* Time buckets: daily for short ranges, weekly for 90d, monthly beyond */
type Granularity = "day" | "week" | "month";
function granularityFor(range: RangeKey): Granularity {
  return range === "7d" || range === "30d" ? "day" : range === "90d" ? "week" : "month";
}
function bucketsFor(range: RangeKey, start: string | null, end: string, earliest: string | null): { start: string; end: string }[] {
  const g = granularityFor(range);
  const from = start ? dayOf(start) : earliest ? dayOf(earliest) : addMonths(dayOf(end), -11);
  const to = dayOf(end);
  const out: { start: string; end: string }[] = [];
  if (g === "day") {
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) out.push({ start: iso(d), end: iso(d) });
  } else if (g === "week") {
    for (let d = new Date(from); d <= to; d = addDays(d, 7)) out.push({ start: iso(d), end: iso(addDays(d, 6) > to ? to : addDays(d, 6)) });
  } else {
    let d = new Date(from.getFullYear(), from.getMonth(), 1);
    if (range === "all" && out.length === 0) {
      // cap "all time" at the last 24 months so the axis stays readable
      const cap = new Date(to.getFullYear(), to.getMonth() - 23, 1);
      if (d < cap) d = cap;
    }
    for (; d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      out.push({ start: iso(d), end: iso(last > to ? to : last) });
    }
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Small UI atoms
 * ────────────────────────────────────────────────────────────────────────── */
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function Card({ title, subtitle, action, children, className }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ChartTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: any[]; label?: string; formatter?: (v: number) => string }) {
  if (!active || !payload || payload.length === 0) return null;
  const fmt = formatter ?? ((v: number) => v.toLocaleString());
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-semibold text-gray-900">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2 text-gray-700">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill || p.fill }} />
          <span className="text-gray-500">{p.name}</span>
          <span className="ms-auto font-medium tabular-nums text-gray-900">{fmt(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

interface Slice { key: string; label: string; value: number; color: string; count?: number }

/** Donut with a direct-labelled legend; click a slice or legend row to filter. */
function Donut({ slices, selected, onSelect, formatter, emptyLabel, hint }: {
  slices: Slice[]; selected: string | null; onSelect: (key: string) => void; formatter?: (v: number) => string; emptyLabel: string; hint: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const fmt = formatter ?? ((v: number) => v.toLocaleString());
  if (total <= 0) return <p className="flex h-44 items-center justify-center text-sm text-gray-400">{emptyLabel}</p>;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              stroke={INK.surface}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              onClick={(_, i) => onSelect(slices[i].key)}
              className="cursor-pointer"
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} opacity={selected && selected !== s.key ? 0.3 : 1} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={fmt} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums text-gray-900">{fmt(total)}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">{hint}</span>
        </div>
      </div>
      <ul className="w-full space-y-0.5">
        {slices.map((s) => {
          const active = selected === s.key;
          const dim = selected && !active;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onSelect(s.key)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition hover:bg-gray-50 rtl:text-right",
                  active && "bg-gray-100",
                  dim && "opacity-50",
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate text-gray-700">{s.label}</span>
                <span className="tabular-nums font-medium text-gray-900">{fmt(s.value)}</span>
                <span className="w-9 text-end tabular-nums text-gray-400">{Math.round((s.value / total) * 100)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Horizontal bars; click to filter. */
function HBars({ rows, selected, onSelect, emptyLabel, formatter }: {
  rows: Slice[]; selected: string | null; onSelect: (key: string) => void; emptyLabel: string; formatter?: (v: number) => string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  const fmt = formatter ?? ((v: number) => v.toLocaleString());
  if (max <= 0) return <p className="flex h-44 items-center justify-center text-sm text-gray-400">{emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const active = selected === r.key;
        const dim = selected && !active;
        return (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onSelect(r.key)}
              aria-pressed={active}
              className={cn("group w-full rounded-lg px-1 py-0.5 text-left transition hover:bg-gray-50 rtl:text-right", dim && "opacity-50")}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className={cn("truncate text-gray-700", active && "font-semibold text-gray-900")}>{r.label}</span>
                <span className="tabular-nums font-medium text-gray-900">{fmt(r.value)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Kpi({ icon, label, value, sub, delta, tone = "neutral" }: {
  icon: ReactNode; label: string; value: string; sub?: string; delta?: number | null; tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const valueClass = tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600">{icon}</span>
        {delta !== undefined && delta !== null && Number.isFinite(delta) && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
              delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
            )}
          >
            {delta >= 0 ? <FaArrowUp className="text-[9px]" /> : <FaArrowDown className="text-[9px]" />}
            {Math.abs(Math.round(delta))}%
          </span>
        )}
      </div>
      <p className={cn("mt-3 text-2xl font-bold tabular-nums", valueClass)}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

const pct = (cur: number, prev: number | null) => (prev === null || prev === 0 ? null : ((cur - prev) / prev) * 100);

/* ──────────────────────────────────────────────────────────────────────────
 * The dashboard
 * ────────────────────────────────────────────────────────────────────────── */
export default function DashboardAnalytics({ data, loading = false, operations }: Props) {
  const { t, language } = useTranslation();
  const locale = language === "ar" ? "ar-LB" : language === "fr" ? "fr-FR" : "en-US";
  const [filters, setFilters] = useState<Filters>(EMPTY);

  const toggle = <K extends DimKey>(key: K, value: Filters[K]) =>
    setFilters((f) => {
      const same = JSON.stringify(f[key]) === JSON.stringify(value);
      return { ...f, [key]: same ? null : value };
    });
  const clearDim = (key: DimKey) => setFilters((f) => ({ ...f, [key]: null }));
  const clearAll = () => setFilters((f) => ({ ...EMPTY, range: f.range }));

  const bounds = useMemo(() => rangeBounds(filters.range), [filters.range]);
  const start = filters.bucket?.start ?? bounds.start;
  const end = filters.bucket?.end ?? bounds.end;

  /* Stable colour per entity: assigned on the FULL dataset so filters never repaint */
  const colorMaps = useMemo(() => {
    const assign = (keys: string[]) => {
      const m: Record<string, string> = {};
      keys.slice(0, SERIES.length - 1).forEach((k, i) => (m[k] = SERIES[i]));
      return m;
    };
    const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));
    const countBy = (xs: string[]) => { const c: Record<string, number> = {}; xs.forEach((x) => (c[x] = (c[x] || 0) + 1)); return c; };
    const typeCounts = countBy(data.appointments.map((a) => a.type));
    const types = Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a] || a.localeCompare(b));
    return {
      type: assign(types),
      doctor: assign(data.doctors.map((d) => String(d.id))),
      expenseCategory: assign(uniq(data.expenses.map((e) => e.category)).sort()),
      paymentMethod: assign(uniq(data.payments.map((p) => p.method)).sort()),
      inventoryCategory: assign(uniq(data.inventory.map((i) => i.category)).sort()),
    };
  }, [data]);

  /* Labels */
  const apptStatusLabel = (s: string) =>
    ({ scheduled: t("adminDashboard.statusScheduled"), confirmed: t("adminDashboard.statusConfirmed"), in_progress: t("adminDashboard.inProgress"),
       completed: t("appointments.completed"), cancelled: t("adminDashboard.cancelled"), no_show: t("adminDashboard.statusNoShow") } as Record<string, string>)[s] ?? s;
  const invoiceStatusLabel = (s: string) => ({ open: t("billing.statusOpen"), partial: t("billing.statusPartial"), paid: t("billing.statusPaid") } as Record<string, string>)[s] ?? s;
  const methodLabel = (m: string) =>
    ({ cash: t("adminDashboard.methodCash"), card: t("adminDashboard.methodCard"), insurance: t("adminDashboard.methodInsurance"), bank_transfer: t("adminDashboard.methodBankTransfer") } as Record<string, string>)[m] ?? (m || t("adminDashboard.other"));
  const expenseCatLabel = (c: string) => { const k = `expenses.${c}`; const v = t(k); return v === k ? c.charAt(0).toUpperCase() + c.slice(1) : v; };
  const inventoryCatLabel = (c: string) => { const k = `inventory.${c.toLowerCase()}`; const v = t(k); return v === k ? c : v; };
  const doctorLabel = (id: number) => data.doctors.find((d) => d.id === id)?.name ?? `#${id}`;
  const weekdayLabel = (i: number) => new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: "short" }); // 2024-01-07 is a Sunday
  const rangeLabel = (r: RangeKey) => t(`adminDashboard.range_${r}`);
  const otherLabel = t("adminDashboard.other");

  /* Per-dataset predicates. Each chart ignores its OWN dimension so you can still see the alternatives. */
  const apptPass = (a: ApptRow, except?: DimKey) =>
    within(a.date, start, end) &&
    (except === "weekday" || filters.weekday === null || dayOf(a.date).getDay() === filters.weekday) &&
    (except === "doctorId" || filters.doctorId === null || a.doctorId === filters.doctorId) &&
    (except === "apptStatus" || filters.apptStatus === null || a.status === filters.apptStatus) &&
    (except === "apptType" || filters.apptType === null || a.type === filters.apptType);
  const expensePass = (e: ExpenseRow, except?: DimKey) =>
    within(e.date, start, end) && (except === "expenseCategory" || filters.expenseCategory === null || e.category === filters.expenseCategory);
  const paymentPass = (p: PaymentRow, except?: DimKey) =>
    within(p.date, start, end) && (except === "paymentMethod" || filters.paymentMethod === null || p.method === filters.paymentMethod);
  const invoicePass = (i: InvoiceRow, except?: DimKey) =>
    within(i.date, start, end) && (except === "invoiceStatus" || filters.invoiceStatus === null || i.status === filters.invoiceStatus);
  const inventoryPass = (i: InventoryRow, except?: DimKey) =>
    except === "inventoryCategory" || filters.inventoryCategory === null || i.category === filters.inventoryCategory;

  /* KPIs (current vs previous period) */
  const kpi = useMemo(() => {
    const appts = data.appointments.filter((a) => apptPass(a));
    const income = data.payments.filter((p) => paymentPass(p)).reduce((s, p) => s + p.amount, 0);
    const expenses = data.expenses.filter((e) => expensePass(e)).reduce((s, e) => s + e.amount, 0);
    const outstanding = data.invoices.filter((i) => invoicePass(i)).reduce((s, i) => s + i.remaining, 0);
    const newPatients = data.patients.filter((p) => within(p.registeredDate, start, end)).length;
    const completed = appts.filter((a) => a.status === "completed").length;

    const hasPrev = !filters.bucket && bounds.prevStart !== null;
    const ps = bounds.prevStart, pe = bounds.prevEnd;
    const prevAppts = hasPrev ? data.appointments.filter((a) => within(a.date, ps, pe)).length : null;
    const prevIncome = hasPrev ? data.payments.filter((p) => within(p.date, ps, pe)).reduce((s, p) => s + p.amount, 0) : null;
    const prevExpenses = hasPrev ? data.expenses.filter((e) => within(e.date, ps, pe)).reduce((s, e) => s + e.amount, 0) : null;
    const prevPatients = hasPrev ? data.patients.filter((p) => within(p.registeredDate, ps, pe)).length : null;
    return {
      appts: appts.length, completed, income, expenses, net: income - expenses, outstanding, newPatients,
      dAppts: pct(appts.length, prevAppts), dIncome: pct(income, prevIncome), dExpenses: pct(expenses, prevExpenses), dPatients: pct(newPatients, prevPatients),
      dNet: prevIncome === null || prevExpenses === null ? null : pct(income - expenses, prevIncome - prevExpenses),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filters, start, end, bounds]);

  /* Time series: income vs expenses vs net per bucket (ignores the bucket filter so you can re-pick) */
  const series = useMemo(() => {
    const earliest = [...data.payments.map((p) => p.date), ...data.expenses.map((e) => e.date)].filter(Boolean).sort()[0] ?? null;
    const buckets = bucketsFor(filters.range, bounds.start, bounds.end, earliest);
    const g = granularityFor(filters.range);
    const fmtLabel = (b: { start: string; end: string }) => {
      const d = dayOf(b.start);
      if (g === "day") return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
      if (g === "week") return `${d.toLocaleDateString(locale, { day: "numeric", month: "short" })}`;
      return d.toLocaleDateString(locale, { month: "short", year: buckets.length > 12 ? "2-digit" : undefined });
    };
    return buckets.map((b) => {
      const inc = data.payments.filter((p) => within(p.date, b.start, b.end) && (filters.paymentMethod === null || p.method === filters.paymentMethod)).reduce((s, p) => s + p.amount, 0);
      const exp = data.expenses.filter((e) => within(e.date, b.start, b.end) && (filters.expenseCategory === null || e.category === filters.expenseCategory)).reduce((s, e) => s + e.amount, 0);
      const newP = data.patients.filter((p) => within(p.registeredDate, b.start, b.end)).length;
      const appts = data.appointments.filter((a) => within(a.date, b.start, b.end) && apptPass({ ...a, date: a.date }, "bucket")).length;
      return { key: b.start, start: b.start, end: b.end, label: fmtLabel(b), income: inc, expenses: exp, net: inc - exp, newPatients: newP, appts };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filters, bounds, locale]);

  /* Breakdowns */
  const sumBy = <T,>(rows: T[], key: (r: T) => string, val: (r: T) => number) => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { const k = key(r); m[k] = (m[k] || 0) + val(r); });
    return m;
  };
  const toSlices = (m: Record<string, number>, color: (k: string) => string, label: (k: string) => string, order?: string[]): Slice[] => {
    const keys = order ?? Object.keys(m).sort((a, b) => m[b] - m[a]);
    return keys.filter((k) => (m[k] ?? 0) > 0).map((k) => ({ key: k, label: label(k), value: m[k], color: color(k) }));
  };
  const foldOther = (slices: Slice[], max: number): Slice[] => {
    if (slices.length <= max) return slices;
    const head = slices.slice(0, max - 1);
    const rest = slices.slice(max - 1);
    return [...head, { key: "__other", label: otherLabel, value: rest.reduce((s, x) => s + x.value, 0), color: "#b5b4ae" }];
  };

  const apptByStatus = toSlices(
    sumBy(data.appointments.filter((a) => apptPass(a, "apptStatus")), (a) => a.status, () => 1),
    (k) => APPT_STATUS_COLOR[k] ?? "#b5b4ae", apptStatusLabel, ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"],
  );
  const apptByType = foldOther(
    toSlices(sumBy(data.appointments.filter((a) => apptPass(a, "apptType")), (a) => a.type, () => 1), (k) => colorMaps.type[k] ?? "#b5b4ae", (k) => k),
    8,
  );
  const apptByDoctor = toSlices(
    sumBy(data.appointments.filter((a) => apptPass(a, "doctorId")), (a) => String(a.doctorId), () => 1),
    (k) => colorMaps.doctor[k] ?? "#b5b4ae", (k) => doctorLabel(Number(k)),
  );
  const apptByWeekday = Array.from({ length: 7 }, (_, i) => ({
    key: String(i),
    label: weekdayLabel(i),
    value: data.appointments.filter((a) => apptPass(a, "weekday") && dayOf(a.date).getDay() === i).length,
  }));
  const expenseByCat = foldOther(
    toSlices(sumBy(data.expenses.filter((e) => expensePass(e, "expenseCategory")), (e) => e.category, (e) => e.amount), (k) => colorMaps.expenseCategory[k] ?? "#b5b4ae", expenseCatLabel),
    7,
  );
  const invoiceByStatus = toSlices(
    sumBy(data.invoices.filter((i) => invoicePass(i, "invoiceStatus")), (i) => i.status, (i) => i.total),
    (k) => INVOICE_STATUS_COLOR[k] ?? "#b5b4ae", invoiceStatusLabel, ["open", "partial", "paid"],
  );
  const paymentByMethod = toSlices(
    sumBy(data.payments.filter((p) => paymentPass(p, "paymentMethod")), (p) => p.method || "other", (p) => p.amount),
    (k) => colorMaps.paymentMethod[k] ?? "#b5b4ae", methodLabel,
  );
  const stockByCategory = useMemo(() => {
    const cats = Array.from(new Set(data.inventory.map((i) => i.category))).sort();
    return cats.map((c) => {
      const rows = data.inventory.filter((i) => i.category === c);
      return { key: c, label: inventoryCatLabel(c), ok: rows.filter((r) => r.status === "ok").length, low: rows.filter((r) => r.status === "low").length, out: rows.filter((r) => r.status === "out").length };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.inventory, language]);
  const lowStock = data.inventory.filter((i) => i.status !== "ok" && inventoryPass(i)).sort((a, b) => (a.status === b.status ? a.quantity - b.quantity : a.status === "out" ? -1 : 1));


  /* Active filter chips */
  const chips: { key: DimKey; label: string }[] = [];
  if (filters.bucket) chips.push({ key: "bucket", label: filters.bucket.label });
  if (filters.weekday !== null) chips.push({ key: "weekday", label: weekdayLabel(filters.weekday) });
  if (filters.doctorId !== null) chips.push({ key: "doctorId", label: doctorLabel(filters.doctorId) });
  if (filters.apptStatus) chips.push({ key: "apptStatus", label: apptStatusLabel(filters.apptStatus) });
  if (filters.apptType) chips.push({ key: "apptType", label: filters.apptType });
  if (filters.expenseCategory) chips.push({ key: "expenseCategory", label: expenseCatLabel(filters.expenseCategory) });
  if (filters.invoiceStatus) chips.push({ key: "invoiceStatus", label: invoiceStatusLabel(filters.invoiceStatus) });
  if (filters.paymentMethod) chips.push({ key: "paymentMethod", label: methodLabel(filters.paymentMethod) });
  if (filters.inventoryCategory) chips.push({ key: "inventoryCategory", label: inventoryCatLabel(filters.inventoryCategory) });

  const hint = t("adminDashboard.clickToFilter");
  const empty = t("adminDashboard.noData");
  const selectedBucket = filters.bucket?.start ?? null;
  const axisTick = { fontSize: 11, fill: INK.muted };

  return (
    <div className={cn("space-y-6 transition-opacity", loading && "pointer-events-none opacity-60")}>
      {/* ── Filter row ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-2 px-2 pt-1 pb-1 bg-gray-50/90 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200/80 bg-white p-3 shadow-sm">
          <div className="inline-flex items-center gap-0.5 rounded-xl bg-gray-100/80 p-1" role="group" aria-label={t("adminDashboard.period")}>
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, range: r, bucket: null }))}
                aria-pressed={filters.range === r}
                className={cn(
                  "h-8 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-all",
                  filters.range === r ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-900",
                )}
              >
                {rangeLabel(r)}
              </button>
            ))}
          </div>
          <span className="hidden h-6 w-px bg-gray-200 sm:block" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {chips.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                <FaFilter className="text-[10px]" /> {hint}
              </span>
            ) : (
              chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => clearDim(c.key)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2.5 text-xs font-medium text-brand transition hover:bg-brand/15"
                >
                  {c.label}
                  <FaTimes className="text-[9px]" />
                </button>
              ))
            )}
          </div>
          {chips.length > 0 && (
            <button type="button" onClick={clearAll} className="h-8 rounded-lg px-2.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900">
              {t("adminDashboard.clearAll")}
            </button>
          )}
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<FaCalendarCheck />} label={t("appointments.appointments")} value={kpi.appts.toLocaleString()} sub={`${kpi.appts ? Math.round((kpi.completed / kpi.appts) * 100) : 0}% ${t("adminDashboard.completedRate")}`} delta={kpi.dAppts} />
        <Kpi icon={<FaDollarSign />} label={t("adminDashboard.totalIncome")} value={money(kpi.income)} delta={kpi.dIncome} />
        <Kpi icon={<FaWallet />} label={t("adminDashboard.totalExpenses")} value={money(kpi.expenses)} delta={kpi.dExpenses === null ? null : -kpi.dExpenses} />
        <Kpi icon={<FaChartLine />} label={t("adminDashboard.netProfit")} value={money(kpi.net)} delta={kpi.dNet} tone={kpi.net < 0 ? "bad" : "neutral"} />
        <Kpi icon={<FaFileInvoiceDollar />} label={t("adminDashboard.outstanding")} value={money(kpi.outstanding)} tone={kpi.outstanding > 0 ? "warn" : "neutral"} />
        <Kpi icon={<FaUserPlus />} label={t("adminDashboard.newPatients")} value={kpi.newPatients.toLocaleString()} delta={kpi.dPatients} />
      </div>

      {operations}

      {/* ── Finance ────────────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          title={t("adminDashboard.incomeVsExpenses")}
          subtitle={`${rangeLabel(filters.range)} · ${hint}`}
          className="xl:col-span-2"
          action={
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: INCOME }} />{t("adminDashboard.income")}</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: EXPENSE }} />{t("adminDashboard.expenses")}</span>
              <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 rounded" style={{ background: NET }} />{t("adminDashboard.net")}</span>
            </div>
          }
        >
          {series.some((s) => s.income || s.expenses) ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={series.length > 14 ? "preserveStartEnd" : 0} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={<ChartTooltip formatter={money} />} />
                <Bar dataKey="income" name={t("adminDashboard.income")} fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} className="cursor-pointer"
                  onClick={(d: any) => toggle("bucket", { start: d.start, end: d.end, label: d.label })}>
                  {series.map((s) => <Cell key={s.key} opacity={selectedBucket && selectedBucket !== s.start ? 0.3 : 1} />)}
                </Bar>
                <Bar dataKey="expenses" name={t("adminDashboard.expenses")} fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} className="cursor-pointer"
                  onClick={(d: any) => toggle("bucket", { start: d.start, end: d.end, label: d.label })}>
                  {series.map((s) => <Cell key={s.key} opacity={selectedBucket && selectedBucket !== s.start ? 0.3 : 1} />)}
                </Bar>
                <Line type="monotone" dataKey="net" name={t("adminDashboard.net")} stroke={NET} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-[260px] items-center justify-center text-sm text-gray-400">{t("adminDashboard.noFinancialData")}</p>
          )}
        </Card>
        <Card title={t("adminDashboard.expensesByCategory")} subtitle={hint}>
          <Donut slices={expenseByCat} selected={filters.expenseCategory} onSelect={(k) => k !== "__other" && toggle("expenseCategory", k)} formatter={money} emptyLabel={empty} hint={t("adminDashboard.expenses")} />
        </Card>
      </div>

      {/* ── Appointments ───────────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card title={t("adminDashboard.appointmentsByStatus")} subtitle={hint}>
          <Donut slices={apptByStatus} selected={filters.apptStatus} onSelect={(k) => toggle("apptStatus", k)} emptyLabel={empty} hint={t("appointments.appointments")} />
        </Card>
        <Card title={t("adminDashboard.appointmentsByType")} subtitle={hint}>
          <HBars rows={apptByType} selected={filters.apptType} onSelect={(k) => k !== "__other" && toggle("apptType", k)} emptyLabel={empty} />
        </Card>
        <Card title={t("adminDashboard.busiestDays")} subtitle={hint}>
          {apptByWeekday.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={176}>
              <BarChart data={apptByWeekday} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={<ChartTooltip />} />
                <Bar dataKey="value" name={t("appointments.appointments")} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} className="cursor-pointer"
                  onClick={(d: any) => toggle("weekday", Number(d.key))}>
                  {apptByWeekday.map((d) => (
                    <Cell key={d.key} opacity={filters.weekday !== null && filters.weekday !== Number(d.key) ? 0.3 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-44 items-center justify-center text-sm text-gray-400">{empty}</p>
          )}
        </Card>
        <Card title={t("adminDashboard.appointmentsByDoctor")} subtitle={hint}>
          <Donut slices={apptByDoctor} selected={filters.doctorId === null ? null : String(filters.doctorId)} onSelect={(k) => toggle("doctorId", Number(k))} emptyLabel={empty} hint={t("appointments.appointments")} />
        </Card>
      </div>

      {/* ── Teeth worked on (3D) ───────────────────────────────────────── */}
      <TeethReport
        records={data.records.filter(
          (r) => within(r.date, start, end) && (filters.doctorId === null || r.doctorId === filters.doctorId),
        )}
      />

      {/* ── Billing & growth ───────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card title={t("adminDashboard.invoicesByStatus")} subtitle={hint}>
          <Donut slices={invoiceByStatus} selected={filters.invoiceStatus} onSelect={(k) => toggle("invoiceStatus", k)} formatter={money} emptyLabel={empty} hint={t("adminDashboard.invoiced")} />
        </Card>
        <Card title={t("adminDashboard.paymentsByMethod")} subtitle={hint}>
          <Donut slices={paymentByMethod} selected={filters.paymentMethod} onSelect={(k) => toggle("paymentMethod", k)} formatter={money} emptyLabel={empty} hint={t("adminDashboard.collected")} />
        </Card>
        <Card title={t("adminDashboard.newPatientsByPeriod")} subtitle={hint}>
          {series.some((s) => s.newPatients > 0) ? (
            <ResponsiveContainer width="100%" height={176}>
              <BarChart data={series} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={series.length > 14 ? "preserveStartEnd" : 0} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={<ChartTooltip />} />
                <Bar dataKey="newPatients" name={t("adminDashboard.newPatients")} fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} className="cursor-pointer"
                  onClick={(d: any) => toggle("bucket", { start: d.start, end: d.end, label: d.label })}>
                  {series.map((s) => <Cell key={s.key} opacity={selectedBucket && selectedBucket !== s.start ? 0.3 : 1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-44 items-center justify-center text-sm text-gray-400">{empty}</p>
          )}
        </Card>
      </div>

      {/* ── Inventory ──────────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          title={t("adminDashboard.stockHealth")}
          subtitle={hint}
          className="xl:col-span-2"
          action={
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              {(["ok", "low", "out"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: STOCK_COLOR[s] }} />
                  {s === "ok" ? t("inventory.statusOk") : s === "low" ? t("inventory.statusLow") : t("inventory.statusOut")}
                </span>
              ))}
            </div>
          }
        >
          {stockByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stockByCategory} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid horizontal={false} stroke={INK.grid} />
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={90} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={<ChartTooltip />} />
                {(["ok", "low", "out"] as const).map((s, i) => (
                  <Bar key={s} dataKey={s} stackId="stock" name={s === "ok" ? t("inventory.statusOk") : s === "low" ? t("inventory.statusLow") : t("inventory.statusOut")}
                    fill={STOCK_COLOR[s]} stroke={INK.surface} strokeWidth={2} maxBarSize={18} isAnimationActive={false} className="cursor-pointer"
                    radius={i === 2 ? [0, 4, 4, 0] : 0} onClick={(d: any) => toggle("inventoryCategory", d.key)}>
                    {stockByCategory.map((c) => (
                      <Cell key={c.key} opacity={filters.inventoryCategory && filters.inventoryCategory !== c.key ? 0.3 : 1} />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-[200px] items-center justify-center text-sm text-gray-400">{empty}</p>
          )}
        </Card>
        <Card
          title={t("adminDashboard.lowStockAlerts")}
          subtitle={filters.inventoryCategory ? inventoryCatLabel(filters.inventoryCategory) : undefined}
          action={
            <Link href="/admin/inventory" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              {t("common.manage")} <FaChevronRight className="text-[9px] rtl:rotate-180" />
            </Link>
          }
        >
          {lowStock.length === 0 ? (
            <p className="text-sm text-gray-500">{t("adminDashboard.allItemsWellStocked")}</p>
          ) : (
            <ul className="max-h-[200px] space-y-2 overflow-y-auto pe-1">
              {lowStock.map((item) => (
                <li key={item.id} className={cn("flex items-center gap-3 rounded-xl border p-2.5", item.status === "out" ? "border-red-100 bg-red-50/60" : "border-amber-100 bg-amber-50/60")}>
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", item.status === "out" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600")}>
                    <FaExclamationTriangle className="text-xs" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900" title={item.name}>{item.name}</p>
                    <p className="truncate text-[11px] text-gray-500">{item.quantity} / {t("inventory.min")} {item.minimum}</p>
                  </div>
                  <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full" style={{ width: `${item.minimum > 0 ? Math.min(100, (item.quantity / item.minimum) * 100) : 0}%`, background: STOCK_COLOR[item.status] }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
