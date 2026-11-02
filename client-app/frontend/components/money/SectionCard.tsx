"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * One stage of the money page: a heading, the acts that belong to that
 * stage, and the stage itself. The acts sit in the heading and nowhere else,
 * so the reader knows where to look and nothing is scattered down the page.
 */
export function SectionCard({
  id,
  title,
  icon,
  meta,
  acts,
  children,
  className,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  /** A line of small print after the title: counts, dates, a state. */
  meta?: ReactNode;
  /** The stage's acts, at most two or three. */
  acts?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-24 rounded-2xl border border-ink-200 bg-card", className)}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-100 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2
            id={`${id}-title`}
            className="flex items-center gap-2 font-display text-base font-bold text-ink-900"
          >
            {icon && <span className="text-brand">{icon}</span>}
            {title}
          </h2>
          {meta && <p className="mt-0.5 text-xs text-ink-500">{meta}</p>}
        </div>
        {acts && <div className="flex flex-wrap items-center gap-2">{acts}</div>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
