import { readCookie } from "@/lib/cookies";

// The browser always calls the API on this site's own origin (/api/...): the
// session lives in a first-party cookie, which the browser only sends there.
// next.config.ts forwards /api/* to the backend (API_PROXY_TARGET); behind
// Docker, nginx does. Server-side code has no origin, so it would need a full
// URL, but every API call in this app runs in the browser.
export const API_URL = "";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function sessionUserId(): string | null {
  try {
    return sessionStorage.getItem("userId");
  } catch {
    return null;
  }
}

function getAuthHeaders(options: RequestInit = {}): HeadersInit {
  const isFormData = options.body instanceof FormData;
  const method = (options.method ?? "GET").toUpperCase();
  const csrf = UNSAFE_METHODS.has(method) ? readCookie("bs_csrf") : null;
  const userId = sessionUserId();
  return {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    ...(userId ? { "X-Session-User": userId } : {}),
  };
}

/**
 * Another tab signed in as a different account, so this tab's cookie now
 * belongs to someone else; the API refused rather than act under the wrong
 * name. Send this tab back to the sign-in page.
 */
async function handleSessionSwitch(res: Response): Promise<void> {
  if (res.status !== 401 || typeof window === "undefined") return;
  try {
    const body = await res.clone().json();
    if (body?.code === "session_user_changed") {
      try {
        sessionStorage.clear();
      } catch {}
      window.location.href = "/login?reason=switched";
    }
  } catch {}
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
  await handleSessionSwitch(res);
  return res;
}
