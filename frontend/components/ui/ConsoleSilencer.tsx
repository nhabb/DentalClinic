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
  "Make sure all attributes of the preload tag",
  "api/users/by-email",
];

const SUPABASE_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export default function ConsoleSilencer() {
  useEffect(() => {
    // ── Console noise filter ─────────────────────────────────────────────────
    const shouldMute = (args: unknown[]) =>
      args.some((a) => MUTED_PATTERNS.some((p) => String(a).includes(p)));

    const _error = console.error.bind(console);
    const _warn = console.warn.bind(console);

    console.error = (...args: unknown[]) => { if (!shouldMute(args)) _error(...args); };
    console.warn  = (...args: unknown[]) => { if (!shouldMute(args)) _warn(...args); };

    // ── Global fetch patch: omit credentials for ALL Supabase requests ───────
    // Prevents Cloudflare's __cf_bm cookie (domain=.supabase.co) from being
    // attempted and rejected, regardless of which code path makes the request.
    let _fetch: typeof fetch | null = null;
    if (SUPABASE_HOST) {
      _fetch = window.fetch;
      window.fetch = function (input, init = {}) {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.href
            : (input as Request).url;
        if (url.startsWith(SUPABASE_HOST)) {
          init = { ...init, credentials: "omit" };
        }
        return _fetch!.call(this, input, init);
      };
    }

    return () => {
      console.error = _error;
      console.warn  = _warn;
      if (_fetch) window.fetch = _fetch;
    };
  }, []);

  return null;
}
