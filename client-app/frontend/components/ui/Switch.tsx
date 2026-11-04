"use client";

import { cn } from "@/lib/utils";

/**
 * An on/off switch with a visible knob: a reminder being on or off deserves
 * more than a checkbox. `button role="switch"` so a keyboard and a screen
 * reader read it as one; the knob mirrors in RTL.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = "md",
  id,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Visible text beside the switch; also its accessible name. */
  label?: string;
  description?: string;
  size?: "sm" | "md";
  id?: string;
  className?: string;
}) {
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "size-4" : "size-5";
  const travel = size === "sm" ? "translate-x-4 rtl:-translate-x-4" : "translate-x-5 rtl:-translate-x-5";
  return (
    <label className={cn("inline-flex items-start gap-3", disabled ? "opacity-60" : "cursor-pointer", className)}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "press relative mt-0.5 inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
          track,
          checked ? "bg-leaf-600" : "bg-ink-300",
          disabled && "cursor-not-allowed",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block rounded-full bg-white shadow transition-transform",
            knob,
            "translate-x-0.5 rtl:-translate-x-0.5",
            checked && travel,
          )}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-ink-900">{label}</span>}
          {description && <span className="block text-xs text-ink-500">{description}</span>}
        </span>
      )}
    </label>
  );
}
