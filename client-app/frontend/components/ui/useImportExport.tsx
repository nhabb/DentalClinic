"use client";

import { useRef, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface ImportExportOptions {
  /** Data to export */
  data: Row[];
  /** Base filename (without extension) */
  filename: string;
  /** Called with parsed rows after a successful import */
  onImport: (rows: Row[]) => void | Promise<void>;
}

export interface ImportExportHandle {
  exportExcel: () => void;
  exportJson: () => void;
  importExcel: () => void;
  importJson: () => void;
  /** Hidden file inputs; render these once somewhere in the tree. */
  inputs: ReactNode;
}

function sanitizeRow(row: Row): Row {
  const safe: Row = {};
  for (const [key, val] of Object.entries(row)) {
    if (val === null || val === undefined) {
      safe[key] = "";
    } else if (typeof val === "bigint") {
      safe[key] = val.toString();
    } else if (Array.isArray(val)) {
      safe[key] = val.join(", ");
    } else if (typeof val === "object") {
      safe[key] = JSON.stringify(val);
    } else if (typeof val === "number" && (val > 2147483647 || val < -2147483648 || !isFinite(val))) {
      safe[key] = val.toString();
    } else {
      safe[key] = val;
    }
  }
  return safe;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Shared Excel/JSON export + import logic used by the header menus. */
export function useImportExport({ data, filename, onImport }: ImportExportOptions): ImportExportHandle {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    triggerDownload(blob, `${filename}.json`);
    toast.success(`Exported ${filename}.json`);
  }

  function exportExcel() {
    const sanitized = data.map(sanitizeRow);
    const ws = XLSX.utils.json_to_sheet(sanitized);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, filename.slice(0, 31));
    XLSX.writeFile(wb, `${filename}.xlsx`);
    toast.success(`Exported ${filename}.xlsx`);
  }

  function handleJsonFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const rows: Row[] = Array.isArray(parsed) ? parsed : [parsed];
        await onImport(rows);
      } catch {
        toast.error("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleExcelFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Row[] = XLSX.utils.sheet_to_json(ws);
        await onImport(rows);
      } catch {
        toast.error("Invalid Excel file.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  }

  const inputs = (
    <>
      <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={handleJsonFile} />
      <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelFile} />
    </>
  );

  return {
    exportExcel,
    exportJson,
    importExcel: () => excelInputRef.current?.click(),
    importJson: () => jsonInputRef.current?.click(),
    inputs,
  };
}
