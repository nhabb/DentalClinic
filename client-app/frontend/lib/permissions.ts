"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

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
}

// The answer is cached per token. Signing in and out never reloads the page,
// so a cache that outlived the token showed the previous session's menu (or,
// after a request made while signed out, no menu at all) until a hard reload.
let me: Promise<Me | null> | null = null;
let meToken: string | null = null;

function currentToken(): string | null {
  try {
    return sessionStorage.getItem("authToken");
  } catch {
    return null;
  }
}

export function fetchMe(): Promise<Me | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const token = currentToken();
  if (!token) return Promise.resolve(null);
  if (me && meToken === token) return me;

  meToken = token;
  const request: Promise<Me | null> = apiFetch("/api/auth/me")
    .then((r) => (r.ok ? r.json() : null))
    .then((u) =>
      u?.id
        ? { id: Number(u.id), role: String(u.role ?? ""), permissions: Array.isArray(u.permissions) ? u.permissions : [] }
        : null,
    )
    .catch(() => null)
    .then((user) => {
      // A failed answer is not kept: the next screen asks again.
      if (!user && me === request) resetMe();
      return user;
    });
  me = request;
  return request;
}

/** Forget the cached user (after login, logout or a role change). */
export function resetMe(): void {
  me = null;
  meToken = null;
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
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

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
