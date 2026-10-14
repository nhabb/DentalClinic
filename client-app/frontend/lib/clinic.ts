import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

/**
 * The clinic the signed-in person belongs to, for headers and sidebars.
 *
 * `name` is the organization (tenant) name; `branch` is the person's home
 * branch when they have one (staff assigned to a location, patients registered
 * at one), otherwise null. Both come from GET /api/auth/me, which already
 * returns the organization and branch rows, so there is no extra request.
 */
export interface ClinicIdentity {
  name: string;
  branch: string | null;
}

// One /auth/me request per page load, shared by every header that shows the name.
let identity: Promise<ClinicIdentity | null> | null = null;

export function fetchClinicIdentity(): Promise<ClinicIdentity | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  identity ??= apiFetch("/api/auth/me")
    .then((r) => (r.ok ? r.json() : null))
    .then((me) =>
      me?.organization?.name
        ? { name: me.organization.name as string, branch: (me.branch?.name as string | undefined) || null }
        : null,
    )
    .catch(() => null)
    .then((v) => {
      // A failed or unauthenticated request is not cached: the next header asks again.
      if (!v) identity = null;
      return v;
    });
  return identity;
}

/** Forget the cached identity (after sign-out or switching accounts). */
export function resetClinicIdentity(): void {
  identity = null;
}

/** The clinic name and branch for the signed-in person; null until loaded or when signed out. */
export function useClinicIdentity(): ClinicIdentity | null {
  const [value, setValue] = useState<ClinicIdentity | null>(null);
  useEffect(() => {
    let active = true;
    fetchClinicIdentity().then((v) => {
      if (active) setValue(v);
    });
    return () => {
      active = false;
    };
  }, []);
  return value;
}

/** "Clinic name · Branch" when there is a branch, else just the clinic name. */
export function clinicLabel(id: ClinicIdentity | null, fallback = ""): string {
  if (!id) return fallback;
  return id.branch ? `${id.name} · ${id.branch}` : id.name;
}
