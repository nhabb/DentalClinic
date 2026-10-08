/**
 * Date-range filtering & bucketing shared by the cross-cutting dashboard
 * (DashboardAnalytics) and every per-category analytics sub-page. Extracted
 * from DashboardAnalytics.tsx so new pages don't fork this logic.
 */

export type RangeKey = "7d" | "30d" | "90d" | "6m" | "12m" | "all";
export const RANGES: RangeKey[] = ["7d", "30d", "90d", "6m", "12m", "all"];

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
export const dayOf = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`);

export function rangeBounds(range: RangeKey): { start: string | null; end: string; prevStart: string | null; prevEnd: string | null } {
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

export const within = (date: string, start: string | null, end: string | null) => {
  const d = date.slice(0, 10);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
};

/* Time buckets: daily for short ranges, weekly for 90d, monthly beyond */
export type Granularity = "day" | "week" | "month";
export function granularityFor(range: RangeKey): Granularity {
  return range === "7d" || range === "30d" ? "day" : range === "90d" ? "week" : "month";
}
export function bucketsFor(range: RangeKey, start: string | null, end: string, earliest: string | null): { start: string; end: string }[] {
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

/** Percent change vs. the prior period; null when there's no meaningful baseline. */
export const pct = (cur: number, prev: number | null) => (prev === null || prev === 0 ? null : ((cur - prev) / prev) * 100);
