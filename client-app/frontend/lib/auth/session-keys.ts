/**
 * Names the browser and the API agree on for the session, defined once.
 * A leaf module (it imports nothing) so both the API client and the session
 * helpers can use it without importing each other.
 */
export const CSRF_COOKIE = "bs_csrf";
export const CSRF_HEADER = "X-CSRF-Token";
export const SESSION_USER_HEADER = "X-Session-User";

/** The account this tab was opened for, sent as X-Session-User. */
export function sessionUserId(): string | null {
  try {
    return sessionStorage.getItem("userId");
  } catch {
    return null;
  }
}
