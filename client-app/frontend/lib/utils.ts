import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const BEIRUT_TZ = "Asia/Beirut";

/**
 * Display a date string safely in the Asia/Beirut timezone.
 * Handles date-only strings (YYYY-MM-DD) by treating them as local calendar
 * dates (no UTC shift), and datetime strings by converting to Beirut time.
 */
export function formatDateBeirut(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const str = typeof value === "string" ? value : value.toISOString();
  // Date-only: interpret as calendar date, no timezone shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
  // Datetime: display in Beirut TZ
  return new Date(str).toLocaleDateString("en-US", { timeZone: BEIRUT_TZ, year: "numeric", month: "short", day: "numeric" });
}

export function formatTimeBeirut(value: string | Date | null | undefined): string {
  if (!value) return "";
  const str = typeof value === "string" ? value : value.toISOString();
  return new Date(str).toLocaleTimeString("en-US", { timeZone: BEIRUT_TZ, hour: "2-digit", minute: "2-digit" });
}
