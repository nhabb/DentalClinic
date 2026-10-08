/**
 * Helpers for DATE columns (no time of day). Values travel as "YYYY-MM-DD".
 */

/** Noon UTC, so the calendar day survives any time zone conversion. */
export function toDateOnly(value: string): Date {
  return new Date(`${value.split('T')[0]}T12:00:00.000Z`);
}

/** `toDateOnly` for optional fields: undefined stays undefined, null stays null. */
export function toDateOnlyOrNull(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return toDateOnly(value);
}

/** A Prisma range filter for an inclusive from/to pair of "YYYY-MM-DD" strings. */
export function dateRange(
  from?: string,
  to?: string,
): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  };
}

/** Today as "YYYY-MM-DD". */
export const todayIso = (): string => new Date().toISOString().split('T')[0];
