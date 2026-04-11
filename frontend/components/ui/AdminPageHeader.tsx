"use client";

import { ReactNode } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { FaPlus } from "react-icons/fa";

const LanguageSwitcher = dynamic(() => import("@/components/ui/LanguageSwitcher"), { ssr: false });
const ImportExportMenu = dynamic(() => import("@/components/ui/ImportExportMenu"), { ssr: false });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  data?: Row[];
  filename?: string;
  onImport?: (rows: Row[]) => void;
  onAdd?: () => void;
  addLabel?: string;
  extraActions?: ReactNode;
}

export function AdminPageHeader({
  title,
  subtitle,
  data,
  filename,
  onImport,
  onAdd,
  addLabel,
  extraActions,
}: AdminPageHeaderProps) {
  return (
    <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-gray-500 text-sm">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        {data !== undefined && filename && onImport && (
          <ImportExportMenu
            data={data}
            filename={filename}
            onImport={onImport}
          />
        )}
        {extraActions}
        {onAdd && addLabel && (
          <Button onClick={onAdd} className="bg-dental-blue hover:bg-dental-blue/90">
            <FaPlus className="mr-2 rtl:mr-0 rtl:ml-2" />
            {addLabel}
          </Button>
        )}
      </div>
    </header>
  );
}
