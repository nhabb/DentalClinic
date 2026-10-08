"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { apiFetch } from "@/lib/api/client";
import { safeStorage } from "@/lib/browser-compat";
import { cn } from "@/lib/utils";

// Shape of backend/src/shared/notifications (Prisma `notifications` table) —
// not the aspirational camelCase contract in lib/api/types.ts, which this
// endpoint doesn't actually match yet.
interface Notification {
  id: number | string;
  user_id: number | string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

const TYPE_BAR: Record<string, string> = {
  appointment_booked: "bg-accent-blue-500",
  appointment_confirmed: "bg-accent-blue-500",
  appointment_completed: "bg-accent-blue-500",
  appointment_cancelled: "bg-brick-500",
  appointment_no_show: "bg-honey-500",
};

const POLL_MS = 60_000;

/**
 * Bell trigger + alerts feed, mounted in AdminPageHeader so it's present on
 * every admin page. Mirrors Shopify's "alerts feed" pattern: a small, fast
 * popover rather than a dedicated page.
 *
 * The notifications endpoints (backend/src/shared/notifications) take
 * `user_id` as a required query param rather than reading it from the JWT,
 * and use PATCH rather than PUT for the two write routes — this matches
 * that actual controller, not the older contract sketch in
 * lib/api/endpoints.ts / lib/api/types.ts.
 */
export function NotificationsBell() {
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadedOnce = useRef(false);

  useEffect(() => {
    setUserId(safeStorage.getItem("userId"));
  }, []);

  const loadUnreadCount = useCallback(async (uid: string) => {
    try {
      const res = await apiFetch(`/api/notifications/unread-count?user_id=${uid}`);
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(Number(data?.count ?? 0));
    } catch {
      // Silent — the bell just shows no badge if the endpoint is unreachable.
    }
  }, []);

  const loadList = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/notifications?user_id=${uid}&limit=20`);
      if (res.ok) {
        const body = await res.json();
        setItems(Array.isArray(body?.data) ? body.data : []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadUnreadCount(userId);
    const interval = setInterval(() => loadUnreadCount(userId), POLL_MS);
    const onFocus = () => loadUnreadCount(userId);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, loadUnreadCount]);

  useEffect(() => {
    if (open && userId && !loadedOnce.current) {
      loadedOnce.current = true;
      loadList(userId);
    }
  }, [open, userId, loadList]);

  const markRead = async (id: Notification["id"]) => {
    if (!userId) return;
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, is_read: true } : n)) ?? prev);
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiFetch(`/api/notifications/${id}/read?user_id=${userId}`, { method: "PATCH" });
    } catch {}
  };

  const markAllRead = async () => {
    if (!userId) return;
    setItems((prev) => prev?.map((n) => ({ ...n, is_read: true })) ?? prev);
    setUnreadCount(0);
    try {
      await apiFetch(`/api/notifications/read-all?user_id=${userId}`, { method: "PATCH" });
    } catch {}
  };

  if (!userId) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="press relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-600 ring-1 ring-ink-200 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-blue-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-card"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[360px] max-w-[90vw] rounded-2xl border border-ink-200/70 bg-card p-0 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink-200/70 px-4 py-3">
          <h3 className="text-sm font-bold text-ink-900">Notifications</h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="press inline-flex items-center gap-1 text-xs font-semibold text-accent-blue-600 hover:text-accent-blue-700"
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {loading && !items && <LoadingSpinner label="Loading notifications" className="h-40" />}

          {items && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <BellOff className="h-6 w-6 text-ink-300" />
              <p className="text-sm font-medium text-ink-600">You&apos;re all caught up</p>
              <p className="text-xs text-ink-400">New alerts will show up here.</p>
            </div>
          )}

          {items && items.length > 0 && (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => !n.is_read && markRead(n.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-ink-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-ink-50",
                      !n.is_read && "bg-accent-blue-50/50",
                    )}
                  >
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", TYPE_BAR[n.type] ?? "bg-ink-300")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink-900">{n.title}</span>
                        {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue-500" />}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-xs text-ink-500">{n.message}</span>
                      <span className="mt-1 block text-[11px] text-ink-400">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
