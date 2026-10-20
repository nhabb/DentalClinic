/**
 * The browser side of the session cookie.
 *
 * The API token lives in the `bs_session` cookie, which is httpOnly: no script
 * here can read it, and none needs to. What this module works with instead:
 *
 * - `bs_csrf`, the readable twin cookie set and cleared with it. Its presence
 *   says "this browser is signed in", and its value goes back to the API in
 *   `X-CSRF-Token` on every write (see apiFetch).
 * - Display hints in sessionStorage (`userRole`, `userId`, `adminUser`, …).
 *   They only decide what the screen shows; the API decides what is allowed.
 *   A new tab starts without them and gets them back from `/api/auth/me`.
 */
import { apiFetch } from "@/lib/api/client";
import { readCookie } from "@/lib/cookies";
import { resetMe } from "@/lib/permissions";
import { resetMyPhoto } from "@/lib/profilePhoto";
import { CSRF_COOKIE, sessionUserId } from "@/lib/auth/session-keys";

export {
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_USER_HEADER,
  sessionUserId,
} from "@/lib/auth/session-keys";

/**
 * Staff = every role but patient, including a clinic's custom roles (a
 * "hygienist" belongs in the admin area). What each may see inside it is the
 * permissions' business, not this gate's.
 */
export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && role !== "patient";
}

/** Where a role lands after signing in; any staff role, custom ones too, goes to /admin. */
export function homeFor(role: string | null | undefined): string {
  if (role === "superadmin") return "/superadmin";
  return isStaffRole(role) ? "/admin" : "/patient-dashboard";
}

/** Every display hint a signed-in tab may hold; all cleared on sign-out. */
const HINT_KEYS = [
  "userRole",
  "userId",
  "adminUser",
  "adminAuth",
  "patientAuth",
  "doctorId",
  "doctorDbId",
  "assignedDoctorIds",
  // Written by older builds; cleared so no token copy outlives this change.
  "authToken",
];

/** The value to echo in X-CSRF-Token, or null when not signed in. */
export function csrfToken(): string | null {
  return readCookie(CSRF_COOKIE);
}

/** True when this browser holds a session (in any tab). */
export function hasSession(): boolean {
  return csrfToken() !== null;
}

function hint(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setHint(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private browsing: the screen re-asks /auth/me next time.
  }
}

export interface SessionUser {
  id: number | string;
  role?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

/** Writes the display hints for a user who just signed in (or was restored). */
export function rememberUser(user: SessionUser): string {
  const role = user.role ?? "patient";
  setHint("userRole", role);
  setHint("userId", String(user.id));
  setHint(
    "adminUser",
    JSON.stringify({
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role,
    })
  );
  if (isStaffRole(role)) setHint("adminAuth", "true");
  try {
    sessionStorage.removeItem("authToken");
  } catch {}
  forgetCachedUser();
  return role;
}

/** Drops what this page cached about the signed-in user (permissions, photo). */
function forgetCachedUser(): void {
  resetMe();
  resetMyPhoto();
}

export function clearSessionHints(): void {
  for (const key of HINT_KEYS) {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch {}
  }
}

/**
 * Who this tab acts for: the stored hints, or, in a new tab of a signed-in
 * browser, the answer of /api/auth/me. Null when the browser is not signed in
 * or the session has expired.
 */
export async function ensureSession(): Promise<{
  role: string;
  userId: string;
} | null> {
  if (!hasSession()) return null;
  const role = hint("userRole");
  const userId = sessionUserId();
  if (role && userId) return { role, userId };

  try {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) return null;
    const me = (await res.json()) as SessionUser | null;
    if (!me?.id) return null;
    return { role: rememberUser(me), userId: String(me.id) };
  } catch {
    return null;
  }
}

/**
 * Asks the API to clear the session cookies. Only the server can remove an
 * httpOnly cookie, so this request is what actually signs the browser out.
 * Awaited by signOut: a logout still in flight when the next sign-in lands
 * would clear that new session's cookies.
 */
export async function endServerSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    });
  } catch {}
}

/** Full sign-out: server cookies, display hints, cached user and any Supabase (Google) session. */
export async function signOut(): Promise<void> {
  await endServerSession();
  clearSessionHints();
  forgetCachedUser();
  try {
    const { supabase } = await import("@/lib/supabase/client");
    await supabase.auth.signOut();
  } catch {}
}
