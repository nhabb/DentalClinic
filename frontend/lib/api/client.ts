// Empty string → relative paths (/api/...) so nginx can proxy correctly in Docker.
// Set NEXT_PUBLIC_API_URL=http://localhost:5000 in .env.local for local dev.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function getAuthHeaders(options: RequestInit = {}): HeadersInit {
  const token =
    typeof window !== "undefined" ? sessionStorage.getItem("authToken") : null;
  const isFormData = options.body instanceof FormData;
  return {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = getAuthHeaders(options);
  const raw = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  const contentType = raw.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return raw;

  const text = await raw.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {}

  // Backend returns { ok: false } for all errors (HTTP 200 wrapper).
  // Reconstruct a Response-like object so callers' `res.ok` checks still work.
  const isErrorBody = parsed !== null && parsed.ok === false;
  const effectiveOk = !isErrorBody && raw.ok;
  const effectiveStatus = isErrorBody ? (parsed.statusCode ?? 400) : raw.status;

  return {
    ok: effectiveOk,
    status: effectiveStatus,
    statusText: raw.statusText,
    headers: raw.headers,
    url: raw.url,
    redirected: raw.redirected,
    type: raw.type,
    bodyUsed: true,
    json: () => Promise.resolve(parsed ?? {}),
    text: () => Promise.resolve(text),
    clone: () => { throw new Error("Cannot clone buffered response"); },
    arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer,
    blob: async () => new Blob([text]),
    formData: () => Promise.reject(new Error("Not supported")),
  } as unknown as Response;
}
