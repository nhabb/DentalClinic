/** Display helpers shared by every console page. */

export function formatMoney(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}

/**
 * Money in several currencies, one amount per currency ("$1,200 · LBP 3,000,000").
 * Amounts in different currencies are never added together.
 */
export function formatMoneyByCurrency(
  rows: { currency: string; amount: number }[],
): string {
  const shown = rows.filter((r) => r.amount !== 0);
  if (shown.length === 0) return formatMoney(0, rows[0]?.currency ?? "USD");
  return shown.map((r) => formatMoney(r.amount, r.currency)).join(" · ");
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en");
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** "2026-03" → "Mar 2026" */
export function formatMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Relative age for activity columns: "3d ago", "2mo ago". */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "never";
  const diffMs = Date.now() - new Date(value).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** "Smile Center Beirut" → "smile-center-beirut" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    // Trimmed after the cut: cutting at a word break would otherwise leave a
    // trailing "-" that the onboarding form's own pattern then refuses.
    .replace(/^-+|-+$/g, "");
}
