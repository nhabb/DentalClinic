import { session } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? "http://localhost:5100";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Calls the platform API with the session token and returns the parsed body.
 * A 401 ends the session and sends the user to the login page; any other
 * failure throws an ApiError carrying the server's message.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.token();
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
    session.end();
    window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.message;
    throw new ApiError(res.status, Array.isArray(message) ? message.join(", ") : (message ?? `Request failed (${res.status})`));
  }
  return body as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
