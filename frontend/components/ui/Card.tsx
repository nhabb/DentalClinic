import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The one panel surface. Everything that sits on the linen canvas uses it. */
export function Card({
  className,
  children,
  interactive,
}: {
  className?: string;
  children: ReactNode;
  /** Adds the hover lift — only for cards that are themselves clickable. */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ink-200/80 bg-card shadow-sm",
        interactive && "hover-lift cursor-pointer hover:border-brand-300",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-ink-200/70 px-5 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 [&>svg]:size-4"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold tracking-tight text-ink-900">{title}</h2>
          {subtitle && <p className="truncate text-xs text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}
