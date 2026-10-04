"use client";

import { useMemo, type ReactNode } from "react";
import { FaChevronLeft, FaChevronRight, FaCalendarAlt, FaTimes } from "react-icons/fa";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
 * MonthCalendar — a month grid that sums amounts per day and shades each day
 * on a single-hue ramp. Click a day to select it (the page decides what the
 * selection filters). Pair it with MonthTotalsList to jump between months.
 * ────────────────────────────────────────────────────────────────────────── */

export interface CalendarItem { date: string; amount: number }

export interface MonthCalendarLabels {
  title: string;
  subtitle?: string;
  today: string;
  less: string;
  more: string;
  total: string;
  biggestDay: string;
  empty: string;
  /** e.g. (n) => `${n} expenses` */
  count: (n: number) => string;
}

interface MonthCalendarProps {
  month: Date;
  onMonthChange: (first: Date) => void;
  items: CalendarItem[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  locale: string;
  labels: MonthCalendarLabels;
  /** Five steps, light -> dark. Defaults to a blue ramp. */
  ramp?: readonly string[];
  formatter?: (n: number) => string;
  /** Extra summary rows under the month total. */
  aside?: ReactNode;
  className?: string;
}

export const BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#5598e7", "#2a78d6", "#1c5cab"] as const;
export const ORANGE_RAMP = ["#fbdccb", "#f7b995", "#f1915f", "#eb6834", "#c0491c"] as const;

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const firstOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const dayOf = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`);
const defaultMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;
const compact = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);

export function MonthCalendar({
  month, onMonthChange, items, selectedDate, onSelectDate, locale, labels,
  ramp = BLUE_RAMP, formatter = defaultMoney, aside, className,
}: MonthCalendarProps) {
  const todayKey = iso(new Date());

  const cal = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const from = iso(first), to = iso(last);
    const totals: Record<string, { amount: number; count: number }> = {};
    for (const it of items) {
      const d = it.date.slice(0, 10);
      if (d < from || d > to) continue;
      const t = (totals[d] ??= { amount: 0, count: 0 });
      t.amount += it.amount; t.count += 1;
    }
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const cells: ({ date: string; day: number; amount: number; count: number } | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const k = iso(new Date(y, m, d));
      cells.push({ date: k, day: d, amount: totals[k]?.amount ?? 0, count: totals[k]?.count ?? 0 });
    }
    while (cells.length % 7) cells.push(null);
    const days = cells.filter((c): c is NonNullable<typeof c> => c !== null);
    const max = Math.max(0, ...days.map((c) => c.amount));
    const total = days.reduce((s, c) => s + c.amount, 0);
    const count = days.reduce((s, c) => s + c.count, 0);
    const best = days.reduce<typeof days[number] | null>((b, c) => (c.amount > (b?.amount ?? 0) ? c : b), null);
    return { cells, max, total, count, best };
  }, [items, month]);

  const heat = (amount: number) => (amount <= 0 || cal.max <= 0 ? null : ramp[Math.min(ramp.length - 1, Math.ceil((amount / cal.max) * ramp.length) - 1)]);
  const isDark = (bg: string | null) => bg !== null && ramp.indexOf(bg) >= ramp.length - 2;

  return (
    <section className={cn("rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{labels.title}</h3>
          {labels.subtitle && <p className="text-xs text-gray-500">{labels.subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          <button type="button" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month" className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
            <FaChevronLeft className="text-[10px] rtl:rotate-180" />
          </button>
          <span className="min-w-[140px] px-1 text-center text-sm font-semibold capitalize text-gray-900">
            {month.toLocaleDateString(locale, { month: "long", year: "numeric" })}
          </span>
          <button type="button" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month" className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
            <FaChevronRight className="text-[10px] rtl:rotate-180" />
          </button>
          <button type="button" onClick={() => onMonthChange(firstOfMonth())} className="ms-1 rounded-lg px-2 py-1 text-xs font-semibold text-dental-blue transition hover:bg-dental-blue/10">
            {labels.today}
          </button>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-[1fr_200px]">
        <div>
          <div className="mb-1 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {new Date(2024, 0, 8 + i).toLocaleDateString(locale, { weekday: "short" })}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cal.cells.map((c, i) => {
              if (!c) return <div key={`e${i}`} className="aspect-square" aria-hidden />;
              const bg = heat(c.amount);
              const dark = isDark(bg);
              const selected = selectedDate === c.date;
              const isToday = c.date === todayKey;
              return (
                <button
                  key={c.date}
                  type="button"
                  onClick={() => onSelectDate(selected ? null : c.date)}
                  aria-pressed={selected}
                  title={c.count ? `${formatter(c.amount)} · ${labels.count(c.count)}` : undefined}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition",
                    bg ? "border-transparent hover:brightness-95" : "border-gray-100 bg-white hover:bg-gray-50",
                    dark ? "text-white" : "text-gray-700",
                    selected && "ring-2 ring-dental-blue ring-offset-1",
                    c.date > todayKey && !bg && "text-gray-300",
                  )}
                  style={bg ? { background: bg } : undefined}
                >
                  <span className={cn("leading-none", isToday && "font-bold")}>{c.day}</span>
                  {c.amount > 0 && (
                    <span className={cn("mt-0.5 text-[10px] font-semibold leading-none tabular-nums", dark ? "text-white/90" : "text-gray-900")}>{compact(c.amount)}</span>
                  )}
                  {isToday && <span className={cn("absolute bottom-1 h-1 w-1 rounded-full", dark ? "bg-white" : "bg-dental-blue")} />}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-gray-400">
            <span>{labels.less}</span>
            <span className="h-2.5 w-2.5 rounded-sm border border-gray-200 bg-white" />
            {ramp.map((c) => <span key={c} className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />)}
            <span>{labels.more}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:border-s md:border-gray-100 md:ps-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">{labels.total}</p>
            <p className="text-2xl font-bold tabular-nums text-gray-900">{formatter(cal.total)}</p>
            <p className="text-xs text-gray-500">{labels.count(cal.count)}</p>
          </div>
          {aside}
          {cal.best && cal.best.amount > 0 ? (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">{labels.biggestDay}</p>
              <p className="text-sm font-semibold text-gray-900">{dayOf(cal.best.date).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}</p>
              <p className="text-xs tabular-nums text-gray-500">{formatter(cal.best.amount)}</p>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-xs text-gray-400"><FaCalendarAlt /> {labels.empty}</p>
          )}
          {selectedDate && (
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full border border-dental-blue/30 bg-dental-blue/10 px-2.5 py-1 text-xs font-medium text-dental-blue transition hover:bg-dental-blue/15"
            >
              {dayOf(selectedDate).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
              <FaTimes className="text-[9px]" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Last-12-months bar list; click a month to jump the calendar there. */
export function MonthTotalsList({ items, month, onPick, locale, title, subtitle, color = "#2a78d6", formatter = defaultMoney, className }: {
  items: CalendarItem[]; month: Date; onPick: (first: Date) => void; locale: string; title: string; subtitle?: string; color?: string; formatter?: (n: number) => string; className?: string;
}) {
  const rows = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = monthKey(d);
      const value = items.filter((p) => p.date.slice(0, 7) === key).reduce((s, p) => s + p.amount, 0);
      return { key, first: d, label: d.toLocaleDateString(locale, { month: "short", year: "2-digit" }), value };
    });
  }, [items, locale]);
  const max = Math.max(0, ...rows.map((r) => r.value));
  const current = monthKey(month);
  return (
    <section className={cn("rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm", className)}>
      <header className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </header>
      <ul className="space-y-2">
        {rows.map((r) => {
          const active = r.key === current;
          return (
            <li key={r.key}>
              <button type="button" onClick={() => onPick(r.first)} aria-pressed={active} className={cn("w-full rounded-lg px-1 py-0.5 text-left transition hover:bg-gray-50 rtl:text-right", active && "bg-gray-50")}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className={cn("text-gray-700 capitalize", active && "font-semibold text-gray-900")}>{r.label}</span>
                  <span className="tabular-nums font-medium text-gray-900">{formatter(r.value)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full transition-all" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%`, background: color, opacity: active ? 1 : 0.55 }} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
