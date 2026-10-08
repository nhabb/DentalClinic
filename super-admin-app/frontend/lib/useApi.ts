"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, get } from "./api";

/** Load one API resource; `reload()` refetches after a mutation. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);

  const reload = useCallback(async () => {
    if (path === null) return;
    setLoading(true);
    setError(null);
    try {
      setData(await get<T>(path));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the platform API");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
