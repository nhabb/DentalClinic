"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { sessionUserId } from "@/lib/auth/session-keys";

/**
 * What the signed-in user may do, as the API decides it.
 *
 * GET /api/auth/me returns the role's permission keys (see the catalog in the
 * backend, src/shared/authorization/permissions.ts). Screens use them to hide
 * what the API would refuse anyway: the API is the boundary, this is the
 * courtesy. One request per page load, shared by every component.
 */
export interface Me {
  id: number;
  role: string;
  permissions: string[];
  firstName: string;
  lastName: string;
  email: string;
}

// The answer is cached per signed-in account. Signing in and out never reloads the page,
// so a cache that outlived the session showed the previous session's menu (or,
// after a request made while signed out, no menu at all) until a hard reload.
let me: Promise<Me | null> | null = null;
let meUser: string | null = null;

// The last answer is also kept for the tab, so a reload or the next screen
// draws its menu at once instead of waiting a round trip for /auth/me. It is
// only a head start: the fresh answer replaces it, and the API still decides.
const STORED_ME = "mePermissions";

function storedMe(): Me | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORED_ME) ?? "null") as Me | null;
    return stored?.id && String(stored.id) === sessionUserId() ? stored : null;
  } catch {
    return null;
  }
}

function storeMe(user: Me | null): void {
  try {
    if (user) sessionStorage.setItem(STORED_ME, JSON.stringify(user));
    else sessionStorage.removeItem(STORED_ME);
  } catch {}
}

export function fetchMe(): Promise<Me | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  // The token is an httpOnly cookie this page cannot read; the account the
  // tab signed in as stands in for it. A new tab may not know it yet, so it
  // still asks: the cookie decides.
  const user = sessionUserId() ?? "";
  if (me && meUser === user) return me;

  meUser = user;
  const request: Promise<Me | null> = apiFetch("/api/auth/me")
    .then((r) => (r.ok ? r.json() : null))
    .then((u) =>
      u?.id
        ? {
            id: Number(u.id),
            role: String(u.role ?? ""),
            permissions: Array.isArray(u.permissions) ? u.permissions : [],
            firstName: String(u.first_name ?? ""),
            lastName: String(u.last_name ?? ""),
            email: String(u.email ?? ""),
          }
        : null,
    )
    .catch(() => null)
    .then((user) => {
      // A failed answer is not kept: the next screen asks again.
      if (!user && me === request) resetMe();
      else if (user) storeMe(user);
      return user;
    });
  me = request;
  return request;
}

/** Forget the cached user (after login, logout or a role change). */
export function resetMe(): void {
  me = null;
  meUser = null;
  storeMe(null);
}

/**
 * True when the user holds the permission. Platform superadmins and clinic
 * admins hold everything: the API grants an admin the whole catalog in code
 * (RolesService.permissionsFor), so the screens must not depend on the list.
 */
export function can(user: Me | null, permission: string): boolean {
  if (!user) return false;
  if (user.role === "superadmin" || user.role === "admin") return true;
  return user.permissions.includes(permission);
}

export interface Permissions {
  /** Still loading /auth/me: render nothing restrictive yet. */
  loading: boolean;
  user: Me | null;
  can: (permission: string) => boolean;
}

/** The current user's permissions for screens: `const { can } = usePermissions();` */
export function usePermissions(): Permissions {
  // Admin screens mount only after the session check, on the client, so the
  // stored answer can seed the first render without a hydration mismatch.
  const [user, setUser] = useState<Me | null>(() => (typeof window === "undefined" ? null : storedMe()));
  const [loading, setLoading] = useState(() => user === null);

  useEffect(() => {
    let alive = true;
    fetchMe().then((u) => {
      if (!alive) return;
      setUser(u);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { loading, user, can: (permission) => can(user, permission) };
}
