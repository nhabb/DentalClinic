"use client";

import { Fragment, type ReactNode } from "react";
import { FaSearch, FaTimes } from "react-icons/fa";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
 * ListToolbar — the one search / filter bar used by every admin list page.
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │ [leading]  🔍 Search…                    8 / 20 items  ✕ Clear  [trailing] │
 *   │ CATEGORY  (All 20) (Disposables 2) …   │   [ All | In stock | Low | Out ] │
 *   └──────────────────────────────────────────────────────────────────────┘
 * ────────────────────────────────────────────────────────────────────────── */

export interface ToolbarOption {
  value: string;
  label: string;
  /** Live count shown next to the label. */
  count?: number;
  /** Small icon rendered before the label (chips only). */
  icon?: ReactNode;
  /** Tailwind background class for a status dot, e.g. "bg-emerald-500". */
  dot?: string;
}

export interface ToolbarGroup {
  key: string;
  /** Small uppercase caption shown before the options. */
  label?: string;
  options: ToolbarOption[];
  value: string;
  onChange: (value: string) => void;
  /** "chips" for categories (wraps), "segmented" for a short status switch. */
  variant?: "chips" | "segmented";
}

export interface ListToolbarProps {
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  /** Rendered before the search box, e.g. a date navigator. */
  leading?: ReactNode;
  /** Rendered at the end of the first row, e.g. sort select or view toggle. */
  trailing?: ReactNode;
  /** Result tally: "shown / total unitLabel". */
  shown?: number;
  total?: number;
  unitLabel?: string;
  groups?: ToolbarGroup[];
  hasActiveFilters?: boolean;
  onClear?: () => void;
  clearLabel?: string;
  /** Keep the bar pinned under the page header while the list scrolls. Default true. */
  sticky?: boolean;
  className?: string;
}

/** Shared control styles so page-specific controls (selects, toggles) match the bar. */
export const toolbarSelectClass =
  "h-9 rounded-xl border border-ink-200 bg-card px-3 text-sm font-medium text-ink-700 shadow-xs transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/12";
export const toolbarIconButtonClass = (active: boolean) =>
  cn(
    "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all",
    active ? "bg-card text-brand-700 shadow-xs ring-1 ring-ink-900/5" : "text-ink-400 hover:bg-card/60 hover:text-ink-800",
  );
export const toolbarSegmentWrapClass = "inline-flex items-center gap-0.5 rounded-xl bg-ink-100/80 p-1";

function Chip({ option, active, onClick }: { option: ToolbarOption; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "press inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold",
        active
          ? "border-brand-300 bg-brand-50 text-brand-800 shadow-xs"
          : "border-ink-200 bg-card text-ink-600 hover:border-brand-200 hover:bg-brand-50/60 hover:text-ink-900",
      )}
    >
      {option.dot && <span className={cn("h-2 w-2 rounded-full", option.dot)} />}
      {option.icon && <span className="inline-flex text-xs [&>svg]:h-3 [&>svg]:w-3">{option.icon}</span>}
      {option.label}
      {option.count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-px text-[11px] leading-4 tabular-nums",
            active ? "bg-brand-200/70 text-brand-900" : "bg-ink-100 text-ink-500",
          )}
        >
          {option.count}
        </span>
      )}
    </button>
  );
}

function Segment({ option, active, onClick }: { option: ToolbarOption; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "press inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold",
        active ? "bg-card text-ink-900 shadow-xs ring-1 ring-ink-900/5" : "text-ink-500 hover:bg-card/60 hover:text-ink-900",
      )}
    >
      {option.dot && <span className={cn("h-2 w-2 rounded-full", option.dot)} />}
      {option.icon && <span className="inline-flex text-xs [&>svg]:h-3 [&>svg]:w-3">{option.icon}</span>}
      {option.label}
      {option.count !== undefined && (
        <span className={cn("text-[11px] tabular-nums", active ? "text-ink-500" : "text-ink-400")}>{option.count}</span>
      )}
    </button>
  );
}

export function ListToolbar({
  search,
  leading,
  trailing,
  shown,
  total,
  unitLabel,
  groups = [],
  hasActiveFilters = false,
  onClear,
  clearLabel = "Clear filters",
  sticky = true,
  className,
}: ListToolbarProps) {
  const visibleGroups = groups.filter((g) => g.options.length > 0);
  const showTally = typeof shown === "number" && typeof total === "number";

  return (
    <div
      className={cn(
        sticky ? "sticky top-[70px] z-10 -mx-2 bg-background/85 px-2 pb-5 pt-2 backdrop-blur-md" : "mb-6",
        className,
      )}
    >
      <div className="rounded-2xl border border-ink-200/80 bg-card shadow-sm">
        {/* Row 1: leading · search · tally · clear · trailing */}
        <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
          {leading}
          {search && (
            <div className="relative min-w-0 flex-1">
              <FaSearch className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-400" />
              <input
                type="search"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder}
                className="h-10 w-full rounded-xl border border-ink-200 bg-ink-50/70 ps-10 pe-9 text-sm text-ink-900 placeholder:text-ink-400 transition focus:border-brand-400 focus:bg-card focus:outline-none focus:ring-4 focus:ring-brand-500/12 [&::-webkit-search-cancel-button]:hidden"
              />
              {search.value && (
                <button
                  type="button"
                  onClick={() => search.onChange("")}
                  aria-label="Clear search"
                  className="press absolute end-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-400 hover:bg-ink-200/70 hover:text-ink-800"
                >
                  <FaTimes className="text-[11px]" />
                </button>
              )}
            </div>
          )}
          {(showTally || (hasActiveFilters && onClear) || trailing) && (
            <div className="flex flex-wrap items-center gap-2 md:shrink-0">
              {showTally && (
                <span className="inline-flex h-8 items-center rounded-full bg-ink-100 px-3 text-xs text-ink-600 tabular-nums">
                  <span className="font-bold text-ink-900">{shown}</span>
                  <span className="mx-1 text-ink-400">/</span>
                  {total}
                  {unitLabel && <span className="ms-1">{unitLabel}</span>}
                </span>
              )}
              {hasActiveFilters && onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  className="press inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-clay-700 hover:bg-clay-50"
                >
                  <FaTimes className="text-[10px]" />
                  {clearLabel}
                </button>
              )}
              {trailing}
            </div>
          )}
        </div>

        {/* Row 2: filter groups */}
        {visibleGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-ink-200/60 px-3 py-3">
            {visibleGroups.map((g, gi) => (
              <Fragment key={g.key}>
                {gi > 0 && <span className="hidden h-6 w-px bg-ink-200 lg:block" aria-hidden />}
                <div className="flex flex-wrap items-center gap-2">
                  {g.label && (
                    <span className="me-1 text-[11px] font-bold uppercase tracking-wide text-ink-400">{g.label}</span>
                  )}
                  {g.variant === "segmented" ? (
                    <div className={toolbarSegmentWrapClass} role="group" aria-label={g.label}>
                      {g.options.map((o) => (
                        <Segment key={o.value} option={o} active={g.value === o.value} onClick={() => g.onChange(o.value)} />
                      ))}
                    </div>
                  ) : (
                    g.options.map((o) => (
                      <Chip key={o.value} option={o} active={g.value === o.value} onClick={() => g.onChange(o.value)} />
                    ))
                  )}
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
