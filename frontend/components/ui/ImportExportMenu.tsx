"use client";

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
import { useImportExport, type ImportExportOptions } from "@/components/ui/useImportExport";

export default function ImportExportMenu({ data, filename, onImport }: ImportExportOptions) {
  const io = useImportExport({ data, filename, onImport });

  return (
    <>
      {io.inputs}

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
          <DropdownMenuItem onClick={io.exportExcel}>
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={io.exportJson}>
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
          <DropdownMenuItem onClick={io.importExcel}>
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={io.importJson}>
            <FileJson className="h-4 w-4 text-blue-600" />
            JSON (.json)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
