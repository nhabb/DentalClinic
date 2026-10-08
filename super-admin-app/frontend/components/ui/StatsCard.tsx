import { ComponentType } from "react";
import { cn } from "@/lib/utils";

/** Semantic tones. Prefer these over passing raw classes. */
export type StatTone = "brand" | "clay" | "honey" | "leaf" | "brick" | "neutral";

const TONES: Record<StatTone, { chip: string; icon: string; rail: string }> = {
  brand:   { chip: "bg-brand-100", icon: "text-brand-700",  rail: "bg-brand-500"  },
  clay:    { chip: "bg-clay-100",  icon: "text-clay-700",   rail: "bg-clay-500"   },
  honey:   { chip: "bg-honey-100", icon: "text-honey-700",  rail: "bg-honey-500"  },
  leaf:    { chip: "bg-leaf-100",  icon: "text-leaf-700",   rail: "bg-leaf-500"   },
  brick:   { chip: "bg-brick-100", icon: "text-brick-700",  rail: "bg-brick-500"  },
  neutral: { chip: "bg-ink-100",   icon: "text-ink-600",    rail: "bg-ink-400"    },
};

interface StatsCardProps {
  icon: ComponentType<{ className?: string }>;
  value: React.ReactNode;
  label: string;
  /** Preferred: picks the chip, icon and accent rail colours together. */
  tone?: StatTone;
  /** Short qualifier under the value, e.g. "vs. last month". */
  hint?: string;
  onClick?: () => void;
  /** Legacy escape hatches — `tone` wins when both are given. */
  iconBgClass?: string;
  iconColorClass?: string;
  accentClass?: string;
}

/**
 * A single metric. The left accent rail is what makes a row of these
 * scannable: the eye picks up the colour before it reads the number.
 */
export function StatsCard({
  icon: Icon,
  value,
  label,
  tone,
  hint,
  onClick,
  iconBgClass,
  iconColorClass,
  accentClass,
}: StatsCardProps) {
  const palette = tone ? TONES[tone] : undefined;
  const chip = palette?.chip ?? iconBgClass ?? "bg-ink-100";
  const iconColor = palette?.icon ?? iconColorClass ?? "text-ink-600";
  const rail = palette?.rail ?? chip.replace(/-100\b/, "-400");

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl bg-card p-5 text-start shadow-sm",
        "border border-ink-200/80 transition-all duration-200",
        onClick && "hover-lift cursor-pointer hover:border-brand-300",
        accentClass,
      )}
    >
      {/* Accent rail */}
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1", rail)} />

      <div className="flex items-start gap-4 ps-2">
        <span
          aria-hidden
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200",
            chip,
            onClick && "group-hover:scale-105",
          )}
        >
          <Icon className={cn("text-lg", iconColor)} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[26px] font-bold leading-tight tracking-tight text-ink-900">
            {value}
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-ink-600">{label}</p>
          {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
        </div>
      </div>
    </Tag>
  );
}
