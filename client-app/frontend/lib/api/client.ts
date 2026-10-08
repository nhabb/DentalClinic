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
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });
}
