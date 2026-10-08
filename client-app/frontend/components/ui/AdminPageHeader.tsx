"use client";

import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { HeaderAction } from "@/components/ui/HeaderSpeedDial";
import type { Row } from "@/components/ui/useImportExport";
import { NotificationsBell } from "@/components/ui/NotificationsBell";
import { ProfileMenu } from "@/components/ui/ProfileMenu";

export type { HeaderAction };

const HeaderSpeedDial = dynamic(() => import("@/components/ui/HeaderSpeedDial"), {
  ssr: false,
  loading: () => <div className="size-12 shrink-0 rounded-full bg-ink-200 animate-pulse" aria-hidden />,
});

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  data?: Row[];
  filename?: string;
  onImport?: (rows: Row[]) => void;
  onAdd?: () => void;
  addLabel?: string;
  /** Page-specific actions shown inside the round quick-actions button. */
  actions?: HeaderAction[];
  /** Small marker before the title — a count, a status chip, a date range. */
  eyebrow?: ReactNode;
}

/**
 * The header every admin list page sits under. It stays pinned while the
 * list scrolls, so the page's primary action is always within reach.
 */
export function AdminPageHeader({
  title,
  subtitle,
  data,
  filename,
  onImport,
  onAdd,
  addLabel,
  actions,
  eyebrow,
}: AdminPageHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-200/80 bg-card/85 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {eyebrow}
            </div>
          )}
          <h1 className="truncate font-display text-[22px] font-bold leading-tight text-ink-900 sm:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-500">{subtitle}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <NotificationsBell />
          <HeaderSpeedDial
            primary={
              onAdd && addLabel
                ? { key: "add", label: addLabel, icon: <Plus strokeWidth={2.5} />, onClick: onAdd, tone: "primary" }
                : undefined
            }
            actions={actions}
            data={data}
            filename={filename}
            onImport={onImport}
          />
          <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-ink-200" />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
