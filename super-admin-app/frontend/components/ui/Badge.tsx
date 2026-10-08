import { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "brand" | "clay" | "honey" | "leaf" | "brick" | "neutral";

/* Tinted fill + a matching hairline ring. The ring is what keeps a pale
 * chip from dissolving into a white table row. */
const TONES: Record<BadgeTone, string> = {
  brand:   "bg-brand-50 text-brand-800 ring-brand-200",
  clay:    "bg-clay-50 text-clay-800 ring-clay-200",
  honey:   "bg-honey-50 text-honey-800 ring-honey-200",
  leaf:    "bg-leaf-50 text-leaf-800 ring-leaf-200",
  brick:   "bg-brick-50 text-brick-800 ring-brick-200",
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
};

interface BadgeProps {
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  size?: "sm" | "md";
  /** Preferred over bgClass/textClass. */
  tone?: BadgeTone;
  /** Small leading dot — useful for status without an icon. */
  dot?: boolean;
  /** Legacy escape hatches. */
  bgClass?: string;
  textClass?: string;
  className?: string;
}

export function Badge({
  icon: Icon,
  children,
  size = "sm",
  tone,
  dot,
  bgClass,
  textClass,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset",
        size === "md" ? "px-3 py-1 text-xs" : "px-2.5 py-0.5 text-[11px]",
        tone ? TONES[tone] : cn(bgClass, textClass, "ring-current/15"),
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />}
      {Icon && <Icon className="text-[0.85em]" />}
      {children}
    </span>
  );
}
