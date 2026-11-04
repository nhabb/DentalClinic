import { apiFetch } from "./client";

/**
 * A JSON call that throws an Error carrying the API's own message. The
 * `code` the API sends (e.g. `whatsapp_not_configured`) rides on the error
 * so a screen can say the right thing. Same shape as the helper inside
 * lib/api/settings.ts; new wrappers import this one.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new ApiError(message || `Request failed (${res.status})`, res.status, body?.code);
  }
  return body as T;
}

export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** The API's message for a thrown error, or the fallback. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
