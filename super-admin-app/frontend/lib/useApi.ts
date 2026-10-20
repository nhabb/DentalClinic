"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, get } from "./api";

/**
 * Load one API resource; `reload()` refetches after a mutation.
 *
 * Only the newest request may write: when `path` changes (a search typed
 * letter by letter, another clinic clicked), an older answer arriving late is
 * dropped instead of overwriting the newer one. Data for a different path is
 * cleared at once, so the screen never shows one clinic's rows under
 * another's header; a reload of the same path keeps showing the old data
 * while it refreshes.
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const latest = useRef(0);
  const shownPath = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (path === null) return;
    const request = ++latest.current;
    if (shownPath.current !== path) setData(null);
    setLoading(true);
    setError(null);
    try {
      const result = await get<T>(path);
      if (request !== latest.current) return;
      shownPath.current = path;
      setData(result);
    } catch (err) {
      if (request !== latest.current) return;
      setError(err instanceof ApiError ? err.message : "Could not reach the platform API");
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
