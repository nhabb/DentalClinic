import { readCookie } from "@/lib/cookies";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_USER_HEADER,
  sessionUserId,
} from "@/lib/auth/session-keys";

// The browser always calls the API on this site's own origin (/api/...): the
// session lives in a first-party cookie, which the browser only sends there.
// next.config.ts forwards /api/* to the backend (API_PROXY_TARGET); behind
// Docker, nginx does. Server-side code has no origin, so it would need a full
// URL, but every API call in this app runs in the browser.
export const API_URL = "";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getAuthHeaders(options: RequestInit = {}): HeadersInit {
  const isFormData = options.body instanceof FormData;
  const method = (options.method ?? "GET").toUpperCase();
  const csrf = UNSAFE_METHODS.has(method) ? readCookie(CSRF_COOKIE) : null;
  const userId = sessionUserId();
  return {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
    ...(userId ? { [SESSION_USER_HEADER]: userId } : {}),
  };
}

/**
 * A 401 on a tab that thought it was signed in: the session ended (signed out
 * in another tab, expired) or now belongs to someone else (another tab signed
 * in as a different account). Either way this tab can only show empty or
 * failed screens, so send it back to the sign-in page. Sign-in routes are
 * left alone: a 401 there is "wrong password", answered on the page itself.
 */
async function handleLostSession(path: string, res: Response): Promise<void> {
  if (res.status !== 401 || typeof window === "undefined") return;
  if (path.startsWith("/api/auth/") && !path.startsWith("/api/auth/me")) return;
  if (!sessionUserId()) return; // this tab never signed in: nothing to leave
  let reason = "expired";
  try {
    const body = await res.clone().json();
    if (body?.code === "session_user_changed") reason = "switched";
  } catch {}
  try {
    sessionStorage.clear();
  } catch {}
  window.location.href = `/login?reason=${reason}`;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = getAuthHeaders(options);
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });
  await handleLostSession(path, res);
  return res;
}
