"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ReactNode;
  /** Live count rendered as a pill after the label. */
  count?: number;
  /** Draws attention without a number, e.g. unsaved changes on that tab. */
  dot?: boolean;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * "underline" — sits on the top edge of a panel (record detail, profile).
   * "pill"      — a self-contained switch for a toolbar or card header.
   */
  variant?: "underline" | "pill";
  /** Accessible name for the tablist, e.g. "Patient record sections". */
  label: string;
  className?: string;
}

/**
 * Keyboard-operable tabs.
 *
 * Arrow keys move between tabs (wrapping at the ends), Home/End jump to the
 * first/last, and only the selected tab is in the tab order — that is the
 * ARIA tabs pattern, and it means a keyboard user tabs *into* the strip once
 * and then arrows across it rather than tabbing through every tab.
 *
 * On narrow screens the strip scrolls horizontally instead of wrapping into
 * a second row, and the edges fade so it is clear there is more to reach.
 *
 * Panels should be rendered by the caller with:
 *   <div role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`}>
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = "underline",
  label,
  className,
}: TabsProps<T>) {
  const stripRef = useRef<HTMLDivElement>(null);

  const focusTab = (id: T) => {
    onChange(id);
    // Let React commit the selection before we move focus to the new tab.
    requestAnimationFrame(() => {
      stripRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab-id="${id}"]`)
        ?.focus({ preventScroll: false });
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const enabled = items.filter((i) => !i.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((i) => i.id === value);

    const step = (delta: number) => {
      e.preventDefault();
      const next = enabled[(current + delta + enabled.length) % enabled.length];
      focusTab(next.id);
    };

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        step(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        step(-1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(enabled[0].id);
        break;
      case "End":
        e.preventDefault();
        focusTab(enabled[enabled.length - 1].id);
        break;
    }
  };

  const isPill = variant === "pill";

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn(
        "no-scrollbar flex items-center overflow-x-auto",
        isPill
          ? "gap-1 rounded-2xl bg-ink-100/80 p-1"
          : "gap-1 border-b border-ink-200 px-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            data-tab-id={item.id}
            aria-selected={active}
            aria-controls={`panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              "press relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold",
              "disabled:pointer-events-none disabled:opacity-40",
              isPill
                ? cn(
                    "h-9 rounded-xl px-3.5",
                    active
                      ? "bg-card text-brand-800 shadow-sm"
                      : "text-ink-600 hover:bg-card/60 hover:text-ink-900",
                  )
                : cn(
                    "h-12 rounded-t-lg px-4",
                    active ? "text-brand-700" : "text-ink-500 hover:bg-ink-50 hover:text-ink-900",
                  ),
            )}
          >
            {item.icon && (
              <span aria-hidden className="inline-flex text-[0.95em] [&>svg]:size-4">
                {item.icon}
              </span>
            )}
            {item.label}

            {item.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[11px] font-bold leading-4 tabular-nums",
                  active ? "bg-brand-100 text-brand-800" : "bg-ink-200/70 text-ink-600",
                )}
              >
                {item.count}
              </span>
            )}

            {item.dot && !active && (
              <span aria-hidden className="size-1.5 rounded-full bg-clay-500" />
            )}

            {/* Active marker for the underline variant. Animating the scale
             * rather than the width keeps it off the layout path. */}
            {!isPill && active && (
              <span
                aria-hidden
                className="absolute inset-x-2 -bottom-px h-[3px] origin-left animate-draw-in rounded-full bg-brand-600"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
