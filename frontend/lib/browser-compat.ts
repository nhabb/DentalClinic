/**
 * browser-compat.ts
 *
 * Cross-browser utility helpers that paper over known API differences
 * between Chrome, Firefox, Safari, and Edge.
 */

// ---------------------------------------------------------------------------
// Safe storage
// ---------------------------------------------------------------------------
// Safari in Private Browsing mode (and some locked-down iOS WebViews) throws
// a SecurityError when any localStorage method is called, even just getItem.
// All three wrappers below silence that error so the app keeps working.
//
// Auth-related keys are intentionally routed to sessionStorage so that each
// browser tab maintains its own independent session (e.g. a doctor tab and a
// patient tab open simultaneously will not clobber each other's credentials).
// Non-auth keys (e.g. "language") continue to use localStorage so they persist
// across tabs and sessions as before.

const AUTH_KEYS = new Set([
  "authToken",
  "userRole",
  "adminUser",
  "adminAuth",
  "patientAuth",
]);

function pickStore(key: string): Storage {
  return AUTH_KEYS.has(key) ? sessionStorage : localStorage;
}

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return pickStore(key).getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      pickStore(key).setItem(key, value);
    } catch {
      // Private-browsing / quota-exceeded – silently ignore
    }
  },

  removeItem(key: string): void {
    try {
      pickStore(key).removeItem(key);
    } catch {
      // Silently ignore
    }
  },
};

// ---------------------------------------------------------------------------
// Safe Intl.NumberFormat with locale fallback
// ---------------------------------------------------------------------------
// "en-LB" (English / Lebanon) locale data is not present in all browser
// builds.  When it is missing, Intl.NumberFormat throws a RangeError in some
// older Firefox and Safari releases.  We fall back first to "en" and then to
// the plain Number.prototype.toLocaleString() which every browser supports.

export function formatCurrencyLBP(amount: number): string {
  const abs = Math.abs(amount);

  for (const locale of ["en-LB", "en"]) {
    try {
      return new Intl.NumberFormat(locale).format(abs) + " LBP";
    } catch {
      // Try the next locale
    }
  }

  // Final fallback – works everywhere
  return abs.toLocaleString() + " LBP";
}
