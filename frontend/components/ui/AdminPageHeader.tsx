"use client";

import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import type { HeaderAction } from "@/components/ui/HeaderSpeedDial";
import type { Row } from "@/components/ui/useImportExport";

export type { HeaderAction };

const HeaderSpeedDial = dynamic(() => import("@/components/ui/HeaderSpeedDial"), {
  ssr: false,
  loading: () => <div className="h-12 w-12 rounded-full bg-gray-200 animate-pulse" aria-hidden />,
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
}

export function AdminPageHeader({
  title,
  subtitle,
  data,
  filename,
  onImport,
  onAdd,
  addLabel,
  actions,
}: AdminPageHeaderProps) {
  return (
    <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-gray-500 text-sm">{subtitle}</p>}
      </div>
      <HeaderSpeedDial
        primary={onAdd && addLabel ? { key: "add", label: addLabel, icon: <Plus strokeWidth={2.5} />, onClick: onAdd, tone: "primary" } : undefined}
        actions={actions}
        data={data}
        filename={filename}
        onImport={onImport}
      />
    </header>
  );
}
