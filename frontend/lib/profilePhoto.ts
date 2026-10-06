import { apiFetch } from "@/lib/api/client";

/**
 * Legacy: photos used to be kept only in this browser's localStorage, keyed by
 * email, so they never showed on another browser or domain. Still read as a
 * fallback for photos chosen before uploads went to the server.
 */
export function getStoredPhoto(email: string | null | undefined): string | undefined {
  if (!email || typeof window === "undefined") return undefined;
  return localStorage.getItem(`brightsmile_photo_${email}`) || undefined;
}

// One /auth/me request per page load, shared by every header/menu that shows the photo.
let myPhoto: Promise<string | undefined> | null = null;

/** The signed-in user's saved avatar (users.avatar_url), falling back to a legacy local copy. */
export function fetchMyPhoto(): Promise<string | undefined> {
  if (typeof window === "undefined") return Promise.resolve(undefined);
  myPhoto ??= apiFetch("/api/auth/me")
    .then((r) => (r.ok ? r.json() : null))
    .then((me) => me?.avatar_url || getStoredPhoto(me?.email))
    .catch(() => undefined);
  return myPhoto;
}

/** Uploads a photo picked in <Avatar> to storage and returns its public URL. */
export async function uploadMyPhoto(userId: number, dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append("file", blob, `avatar.${blob.type.split("/")[1] || "jpg"}`);
  const res = await apiFetch(`/api/users/${userId}/avatar`, { method: "PATCH", body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.avatar_url) throw new Error(json?.message || "Could not upload photo.");
  myPhoto = Promise.resolve(json.avatar_url);
  return json.avatar_url;
}
