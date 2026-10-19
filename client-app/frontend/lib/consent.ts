/**
 * The visitor's cookie choice, kept in the `bs_cookie_consent` cookie.
 *
 * Essential cookies (the session, its CSRF twin and this choice) need no
 * consent and are always on. "analytics" is the only optional category; the
 * app uses nothing in it today, so the choice is recorded for when it does:
 * load any analytics script only when `hasConsent("analytics")` is true, and
 * listen for CONSENT_CHANGED_EVENT to react when the visitor changes their mind.
 */
import { readCookie, writeCookie } from "@/lib/cookies";

export const CONSENT_COOKIE = "bs_cookie_consent";
/** Ask again after six months, and whenever the version changes (new categories). */
export const CONSENT_MAX_AGE_DAYS = 180;
const CONSENT_VERSION = 1;

export const CONSENT_CHANGED_EVENT = "bs:consent-changed";
/** Dispatched by "Cookie settings" links to reopen the banner. */
export const OPEN_COOKIE_SETTINGS_EVENT = "bs:open-cookie-settings";

export type OptionalCategory = "analytics";

export interface ConsentChoice {
  analytics: boolean;
}

interface StoredConsent extends ConsentChoice {
  v: number;
  /** When the choice was made (ISO date): proof of consent if ever asked. */
  at: string;
}

/** The current choice, or null when the visitor has not chosen (or must choose again). */
export function readConsent(): ConsentChoice | null {
  const raw = readCookie(CONSENT_COOKIE);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredConsent;
    if (stored.v !== CONSENT_VERSION) return null;
    return { analytics: stored.analytics === true };
  } catch {
    return null;
  }
}

export function saveConsent(choice: ConsentChoice): void {
  const stored: StoredConsent = {
    v: CONSENT_VERSION,
    at: new Date().toISOString().slice(0, 10),
    analytics: choice.analytics,
  };
  writeCookie(CONSENT_COOKIE, JSON.stringify(stored), CONSENT_MAX_AGE_DAYS);
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: choice }));
}

/** Gate for anything optional: false until the visitor has said yes. */
export function hasConsent(category: OptionalCategory): boolean {
  return readConsent()?.[category] === true;
}

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
