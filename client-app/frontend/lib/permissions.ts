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

let me: Promise<Me | null> | null = null;

export function fetchMe(): Promise<Me | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  me ??= apiFetch("/api/auth/me")
    .then((r) => (r.ok ? r.json() : null))
    .then((u) =>
      u?.id
        ? { id: Number(u.id), role: String(u.role ?? ""), permissions: Array.isArray(u.permissions) ? u.permissions : [] }
        : null,
    )
    .catch(() => null);
  return me;
}

/** Forget the cached user (after login, logout or a role change). */
export function resetMe(): void {
  me = null;
}

/** True when the user holds the permission. Platform superadmins hold everything. */
export function can(user: Me | null, permission: string): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
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
