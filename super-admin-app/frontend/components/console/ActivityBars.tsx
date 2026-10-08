import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Series {
  label: string;
  /** Tailwind background class for the bar. */
  barClass: string;
  values: number[];
  format?: (n: number) => string;
}

interface Props {
  months: string[];
  series: Series[];
}

/**
 * Six months of activity as plain CSS bars: readable at a glance, no chart
 * library, and it prints. One group of bars per month.
 */
export function ActivityBars({ months, series }: Props) {
  const maxOf = (values: number[]) => Math.max(1, ...values);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-500">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", s.barClass)} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
        {months.map((month, i) => (
          <div key={month} className="flex flex-col items-center gap-2">
            <div className="flex h-32 w-full items-end justify-center gap-1">
              {series.map((s) => {
                const value = s.values[i] ?? 0;
                const height = Math.round((value / maxOf(s.values)) * 100);
                return (
                  <div
                    key={s.label}
                    title={`${s.label}: ${s.format ? s.format(value) : value}`}
                    className={cn("w-3 rounded-t-md transition-[height] duration-500 sm:w-4", s.barClass)}
                    style={{ height: `${Math.max(height, value > 0 ? 4 : 0)}%` }}
                  />
                );
              })}
            </div>
            <span className="text-[11px] font-medium text-ink-500">{formatMonth(month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
