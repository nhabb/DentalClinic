// Vercel Functions reject request bodies over 4.5 MB before they reach Nest,
// so while the API is hosted there (Vercel sets VERCEL=1 at runtime) every
// upload limit is capped below that. Other hosts keep the intended limits.
const VERCEL_MAX_BYTES = 4 * 1024 * 1024;

export const uploadLimit = (bytes: number): number =>
  process.env.VERCEL ? Math.min(bytes, VERCEL_MAX_BYTES) : bytes;

export const formatMb = (bytes: number): string =>
  `${Math.round(bytes / (1024 * 1024))} MB`;
