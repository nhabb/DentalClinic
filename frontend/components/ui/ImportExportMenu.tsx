"use client";

import { useRef } from "react";
import { toast } from 'sonner';
import * as XLSX from "xlsx";
import { Download, Upload, FileJson, FileSpreadsheet, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface ImportExportMenuProps {
  /** Data to export */
  data: Row[];
  /** Base filename (without extension) */
  filename: string;
  /** Called with parsed rows after a successful import */
  onImport: (rows: Row[]) => void | Promise<void>;
}

export default function ImportExportMenu({ data, filename, onImport }: ImportExportMenuProps) {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // ── Export ────────────────────────────────────────────────────────────────

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    triggerDownload(blob, `${filename}.json`);
    toast.success(`Exported ${filename}.json`);
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

  function exportExcel() {
    const sanitized = data.map(sanitizeRow);
    const ws = XLSX.utils.json_to_sheet(sanitized);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, filename.slice(0, 31));
    XLSX.writeFile(wb, `${filename}.xlsx`);
    toast.success(`Exported ${filename}.xlsx`);
  }

  // ── Import ────────────────────────────────────────────────────────────────

  function handleJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
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

  function handleExcelFile(e: React.ChangeEvent<HTMLInputElement>) {
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

  // ── Helpers ───────────────────────────────────────────────────────────────

  function triggerDownload(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* Hidden file inputs */}
      <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={handleJsonFile} />
      <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelFile} />

      {/* Export dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-1">
            <Download className="h-4 w-4" />
            Export
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel>Export as</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportJson}>
            <FileJson className="h-4 w-4 text-blue-600" />
            JSON (.json)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Import dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-1">
            <Upload className="h-4 w-4" />
            Import
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel>Import from</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => excelInputRef.current?.click()}>
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => jsonInputRef.current?.click()}>
            <FileJson className="h-4 w-4 text-blue-600" />
            JSON (.json)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
