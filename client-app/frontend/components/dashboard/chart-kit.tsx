"use client";

/**
 * Shared chart primitives for the per-category analytics sub-pages
 * (app/admin/<category>/analytics). Mirrors the presentational pieces
 * already used by components/dashboard/DashboardAnalytics.tsx (Card,
 * Donut, HBars, Kpi, the colour palette) so every analytics page reads as
 * one consistent system — kept as an independent copy here rather than an
 * import from DashboardAnalytics.tsx so the existing dashboard stays
 * untouched.
 */

import { type ReactNode } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { FaArrowUp, FaArrowDown } from "react-icons/fa";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
 * Palette — validated categorical slots (fixed order, never cycled) + status
 * ────────────────────────────────────────────────────────────────────────── */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"] as const;
export const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" } as const;
export const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#9ca3af", grid: "#eeeeea", surface: "#ffffff" } as const;
export const INCOME = SERIES[0];
export const EXPENSE = SERIES[1];
export const NET = INK.secondary;

export const APPT_STATUS_COLOR: Record<string, string> = {
  scheduled: SERIES[0],
  confirmed: SERIES[2],
  in_progress: SERIES[3],
  completed: STATUS.good,
  cancelled: STATUS.critical,
  no_show: STATUS.serious,
};
export const INVOICE_STATUS_COLOR: Record<string, string> = { open: SERIES[0], partial: STATUS.warning, paid: STATUS.good };
export const STOCK_COLOR: Record<string, string> = { ok: STATUS.good, low: STATUS.warning, out: STATUS.critical };

export const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/* ──────────────────────────────────────────────────────────────────────────
 * Small UI atoms
 * ────────────────────────────────────────────────────────────────────────── */
export function Card({ title, subtitle, action, children, className }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
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

export function ChartTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: any[]; label?: string; formatter?: (v: number) => string }) {
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

export interface Slice { key: string; label: string; value: number; color: string; count?: number }

/** Donut with a direct-labelled legend; click a slice or legend row to filter. */
export function Donut({ slices, selected, onSelect, formatter, emptyLabel, hint }: {
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
export function HBars({ rows, selected, onSelect, emptyLabel, formatter }: {
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

export function Kpi({ icon, label, value, sub, delta, tone = "neutral" }: {
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
