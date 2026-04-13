export function getStoredPhoto(email: string | null | undefined): string | undefined {
  if (!email || typeof window === "undefined") return undefined;
  return localStorage.getItem(`brightsmile_photo_${email}`) || undefined;
}
