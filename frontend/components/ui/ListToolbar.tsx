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
  "h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm transition focus:border-dental-blue focus:outline-none focus:ring-4 focus:ring-dental-blue/10";
export const toolbarIconButtonClass = (active: boolean) =>
  cn(
    "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all",
    active ? "bg-white text-dental-blue shadow-sm ring-1 ring-black/5" : "text-gray-400 hover:text-gray-700",
  );
export const toolbarSegmentWrapClass = "inline-flex items-center gap-0.5 rounded-xl bg-gray-100/80 p-1";

function Chip({ option, active, onClick }: { option: ToolbarOption; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-all",
        active
          ? "border-dental-blue/30 bg-dental-blue/10 text-dental-blue"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900",
      )}
    >
      {option.dot && <span className={cn("h-2 w-2 rounded-full", option.dot)} />}
      {option.icon && <span className="inline-flex text-xs [&>svg]:h-3 [&>svg]:w-3">{option.icon}</span>}
      {option.label}
      {option.count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-px text-[11px] leading-4 tabular-nums",
            active ? "bg-dental-blue/15 text-dental-blue" : "bg-gray-100 text-gray-500",
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
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-all",
        active ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-900",
      )}
    >
      {option.dot && <span className={cn("h-2 w-2 rounded-full", option.dot)} />}
      {option.icon && <span className="inline-flex text-xs [&>svg]:h-3 [&>svg]:w-3">{option.icon}</span>}
      {option.label}
      {option.count !== undefined && (
        <span className={cn("text-[11px] tabular-nums", active ? "text-gray-500" : "text-gray-400")}>{option.count}</span>
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
    <div className={cn(sticky ? "sticky top-0 z-10 -mx-2 px-2 pt-1 pb-5 bg-gray-50/90 backdrop-blur-sm" : "mb-6", className)}>
      <div className="rounded-2xl border border-gray-200/80 bg-white shadow-sm">
        {/* Row 1: leading · search · tally · clear · trailing */}
        <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
          {leading}
          {search && (
            <div className="relative min-w-0 flex-1">
              <FaSearch className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[13px] text-gray-400" />
              <input
                type="search"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder}
                className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 ps-10 pe-9 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-dental-blue focus:bg-white focus:outline-none focus:ring-4 focus:ring-dental-blue/10 [&::-webkit-search-cancel-button]:hidden"
              />
              {search.value && (
                <button
                  type="button"
                  onClick={() => search.onChange("")}
                  aria-label="Clear search"
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 transition hover:bg-gray-200/70 hover:text-gray-700"
                >
                  <FaTimes className="text-[11px]" />
                </button>
              )}
            </div>
          )}
          {(showTally || (hasActiveFilters && onClear) || trailing) && (
            <div className="flex flex-wrap items-center gap-2 md:shrink-0">
              {showTally && (
                <span className="inline-flex h-8 items-center rounded-full bg-gray-100 px-3 text-xs text-gray-600 tabular-nums">
                  <span className="font-semibold text-gray-900">{shown}</span>
                  <span className="mx-1 text-gray-400">/</span>
                  {total}
                  {unitLabel && <span className="ms-1">{unitLabel}</span>}
                </span>
              )}
              {hasActiveFilters && onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-gray-100 px-3 py-3">
            {visibleGroups.map((g, gi) => (
              <Fragment key={g.key}>
                {gi > 0 && <span className="hidden h-6 w-px bg-gray-200 lg:block" aria-hidden />}
                <div className="flex flex-wrap items-center gap-2">
                  {g.label && (
                    <span className="me-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</span>
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
