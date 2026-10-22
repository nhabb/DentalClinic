"use client";

// A list the API serves ten rows at a time, with a "Show more" button for the next ten.
//
// The screen gives the endpoint and its filters; the API does the searching,
// filtering, sorting and counting, so what is on screen is always the first N
// rows of the right answer. Changing a filter starts again from the first page.
// The first page also asks for `with_counts=true`, the totals for the filter
// chips, which the endpoint returns as `meta.counts`.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./client";

export const PAGE_SIZE = 10;

type Param = string | number | boolean | null | undefined;

export interface PagedList<T, C> {
  rows: T[];
  /** Change rows in place after an edit, without asking the API again. */
  setRows: React.Dispatch<React.SetStateAction<T[]>>;
  /** Rows matching the filters, of which `rows` are the first. */
  total: number;
  counts: C | null;
  /** The first page of a new filter is loading. */
  loading: boolean;
  /** "Show more" is loading. */
  loadingMore: boolean;
  hasMore: boolean;
  error: boolean;
  loadMore: () => void;
  /** Ask again for everything on screen (after a create or delete). */
  reload: () => Promise<void>;
}

function query(params: Record<string, Param>, page: number, limit: number, withCounts: boolean): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") q.set(key, String(value));
  }
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (withCounts) q.set("with_counts", "true");
  return q.toString();
}

export function usePagedList<T, C = unknown>({
  path,
  params,
  map,
  withCounts = false,
  pageSize = PAGE_SIZE,
  enabled = true,
}: {
  path: string;
  params: Record<string, Param>;
  map: (row: any) => T; // eslint-disable-line @typescript-eslint/no-explicit-any
  withCounts?: boolean;
  pageSize?: number;
  enabled?: boolean;
}): PagedList<T, C> {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<C | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [pages, setPages] = useState(1);

  // Answers to an older filter are dropped when they arrive late.
  const generation = useRef(0);
  const mapRef = useRef(map);
  mapRef.current = map;
  const key = JSON.stringify(params);

  const fetchPage = useCallback(
    async (page: number, limit: number, counts: boolean) => {
      const res = await apiFetch(`${path}?${query(JSON.parse(key), page, limit, counts)}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      const data: unknown[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      return {
        rows: data.map((row) => mapRef.current(row)),
        total: Number(json?.meta?.total ?? data.length),
        counts: (json?.meta?.counts ?? null) as C | null,
      };
    },
    [path, key],
  );

  // A new filter: start again from the first page.
  useEffect(() => {
    if (!enabled) return;
    const mine = ++generation.current;
    setLoading(true);
    setError(false);
    setPages(1);
    fetchPage(1, pageSize, withCounts)
      .then((page) => {
        if (mine !== generation.current) return;
        setRows(page.rows);
        setTotal(page.total);
        if (withCounts) setCounts(page.counts);
      })
      .catch(() => mine === generation.current && setError(true))
      .finally(() => mine === generation.current && setLoading(false));
  }, [fetchPage, pageSize, withCounts, enabled]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    const mine = generation.current;
    const next = pages + 1;
    setLoadingMore(true);
    fetchPage(next, pageSize, false)
      .then((page) => {
        if (mine !== generation.current) return;
        setRows((prev) => [...prev, ...page.rows]);
        setTotal(page.total);
        setPages(next);
      })
      .catch(() => mine === generation.current && setError(true))
      .finally(() => setLoadingMore(false));
  }, [fetchPage, loading, loadingMore, pages, pageSize]);

  const reload = useCallback(async () => {
    const mine = ++generation.current;
    try {
      // Everything already shown, in one request, so the list keeps its length.
      const page = await fetchPage(1, pages * pageSize, withCounts);
      if (mine !== generation.current) return;
      setRows(page.rows);
      setTotal(page.total);
      if (withCounts) setCounts(page.counts);
      setError(false);
    } catch {
      if (mine === generation.current) setError(true);
    }
  }, [fetchPage, pages, pageSize, withCounts]);

  return {
    rows,
    setRows,
    total,
    counts,
    loading,
    loadingMore,
    hasMore: rows.length < total,
    error,
    loadMore,
    reload,
  };
}

/** The value, once it has stopped changing for `ms` (for search boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
