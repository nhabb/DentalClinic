import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  /** Small marker above the title, e.g. a breadcrumb or a status chip. */
  eyebrow?: ReactNode;
  /** Primary actions, right-aligned. */
  actions?: ReactNode;
}

/** Pinned page header, same chrome as the clinic admin pages. */
export function PageHeader({ title, subtitle, eyebrow, actions }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-200/80 bg-card/85 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{eyebrow}</div>
          )}
          <h1 className="truncate font-display text-[22px] font-bold leading-tight text-ink-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
