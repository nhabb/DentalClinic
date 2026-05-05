"use client";

import { useEffect } from "react";

// Patterns that are noise from third-party services (Supabase, Cloudflare, browser internals)
const MUTED_PATTERNS = [
  "__cf_bm",
  "require-trusted-types-for",
  "Self-XSS",
  "bscframe",
  "supabase",
  "Supabase",
  "GoTrueClient",
  "AuthApiError",
  "AuthRetryableFetchError",
  "Content-Security-Policy",
  "Cross-Origin",
  "CORS",
  "ERR_BLOCKED_BY_CLIENT",
  "net::ERR",
  "Failed to load resource",
  "preloaded with link preload was not used",
  "was not used within a few seconds",
  "make sure all attributes of the preload tag",
  "api/users/by-email",
];

export default function ConsoleSilencer() {
  useEffect(() => {
    const shouldMute = (args: unknown[]) =>
      args.some((a) => MUTED_PATTERNS.some((p) => String(a).includes(p)));

    const _error = console.error.bind(console);
    const _warn = console.warn.bind(console);

    console.error = (...args: unknown[]) => { if (!shouldMute(args)) _error(...args); };
    console.warn  = (...args: unknown[]) => { if (!shouldMute(args)) _warn(...args); };

    return () => {
      console.error = _error;
      console.warn  = _warn;
    };
  }, []);

  return null;
}
