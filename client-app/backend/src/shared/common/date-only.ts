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

/** Today as "YYYY-MM-DD" in UTC. Prefer `clinicTodayIso` for anything a desk sees. */
export const todayIso = (): string => new Date().toISOString().split('T')[0];

/**
 * The time zone the clinics' calendar days are counted in. One zone for the
 * platform until organizations.timezone is carried in the tenant context.
 */
export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Beirut';

/**
 * Today as "YYYY-MM-DD" on the clinic's calendar: what "received today",
 * "due today" and "valid until today" mean at the desk, whatever the server's
 * clock zone is. en-CA formats as YYYY-MM-DD.
 */
export function clinicTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
