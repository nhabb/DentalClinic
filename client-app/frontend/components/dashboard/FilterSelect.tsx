"use client";

/**
 * Compact dropdown filter for the analytics sub-pages. Built on the Radix
 * popover (focus trap, Escape, outside-click) with a listbox inside; options
 * cascade in with a staggered fade-down each time the menu opens.
 */

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FaCheck, FaChevronDown, FaSearch } from "react-icons/fa";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

const STAGGER_MS = 28;
const STAGGER_CAP = 12; // long lists: rows past this appear together so the cascade stays snappy
const SEARCH_THRESHOLD = 8;

export function FilterSelect({ label, value, options, onChange, className }: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);
  const searchable = options.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  // Arrow keys move between enabled options; Home/End jump to the ends.
  const onListKeyDown = (e: KeyboardEvent) => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (buttons.length === 0) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const to =
      e.key === "ArrowDown" ? Math.min(buttons.length - 1, i + 1)
      : e.key === "ArrowUp" ? Math.max(0, i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? buttons.length - 1
      : null;
    if (to === null) return;
    e.preventDefault();
    buttons[to].focus();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          className={cn(
            "group inline-flex h-10 min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-start text-sm shadow-sm transition hover:border-gray-300 focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:border-brand",
            className,
          )}
        >
          <span className="shrink-0 text-xs text-gray-500">{label}</span>
          <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{current?.label ?? "—"}</span>
          <FaChevronDown className="shrink-0 text-[10px] text-gray-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-56 rounded-xl border-gray-200 bg-white p-1.5 shadow-lg"
        onOpenAutoFocus={(e) => {
          // Land on the search box, else the selected option.
          e.preventDefault();
          requestAnimationFrame(() => {
            const target = searchable
              ? document.getElementById(`filter-search-${label}`)
              : listRef.current?.querySelector<HTMLButtonElement>("[aria-selected=true]") ?? listRef.current?.querySelector("button");
            (target as HTMLElement | null)?.focus();
          });
        }}
      >
        {searchable && (
          <div className="relative mb-1.5">
            <FaSearch className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400" />
            <input
              id={`filter-search-${label}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
                }
              }}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label.toLowerCase()}`}
              className="h-8 w-full rounded-lg border border-gray-200 bg-gray-50 ps-7 pe-2 text-xs outline-none focus:border-brand focus:bg-white"
            />
          </div>
        )}
        <ul ref={listRef} role="listbox" aria-label={label} onKeyDown={onListKeyDown} className="max-h-72 overflow-y-auto">
          {visible.length === 0 && <li className="px-2.5 py-2 text-xs text-gray-400">No matches</li>}
          {visible.map((o, i) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                // Key on `open` isn't needed: content unmounts on close, so the cascade replays every open.
                className="animate-fade-down motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms`, animationDuration: "0.28s" }}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={o.disabled}
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-sm transition-colors focus-visible:bg-gray-100 focus-visible:outline-none",
                    selected ? "bg-blue-50 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50",
                    o.disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-[11px] text-gray-400">{o.hint}</span>}
                  <FaCheck className={cn("shrink-0 text-[10px] text-brand", !selected && "invisible")} />
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
