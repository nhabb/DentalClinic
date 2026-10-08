import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Right-align numbers so they line up. */
  align?: "start" | "end";
  className?: string;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Rendered inside the table body when there are no rows. */
  empty?: ReactNode;
}

/** The one list table of the console: compact rows, optional row click. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty }: Props<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200/80 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            {columns.map((c) => (
              <th key={c.key} className={cn("px-4 py-3 font-semibold", c.align === "end" ? "text-end" : "text-start", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-ink-100 last:border-0",
                onRowClick && "cursor-pointer transition-colors hover:bg-brand-50/60",
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3 text-ink-800", c.align === "end" && "text-end tabular-nums", c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
