"use client";

import { type ReactNode } from "react";
import { FaTimes } from "react-icons/fa";
import { cn } from "@/lib/utils";

export interface BulkAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** Separates destructive actions (delete) from neutral ones visually. */
  tone?: "default" | "danger";
}

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
  /** Singular noun for the count, e.g. "patient" / "item". */
  itemLabel?: string;
}

/**
 * Floating selection bar — Shopify's "bulk editor" pattern. Renders nothing
 * while nothing is selected; appears once `count > 0` and stays reachable
 * while the list behind it scrolls.
 */
export function BulkActionBar({ count, onClear, actions, itemLabel = "item" }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-ink-200/80 bg-card/95 px-3 py-2 shadow-2xl backdrop-blur-md animate-fade-up sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
        >
          <FaTimes className="h-3.5 w-3.5" />
        </button>

        <span className="whitespace-nowrap rounded-full bg-accent-blue-50 px-3 py-1 text-xs font-bold text-accent-blue-700">
          {count} {itemLabel}
          {count === 1 ? "" : "s"} selected
        </span>

        <span aria-hidden className="h-6 w-px shrink-0 bg-ink-200" />

        <div className="flex items-center gap-1.5">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              className={cn(
                "press inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                a.tone === "danger" ? "text-brick-600 hover:bg-brick-50" : "text-ink-700 hover:bg-ink-100",
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
