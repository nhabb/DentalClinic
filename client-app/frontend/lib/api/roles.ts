// Roles & permissions of the signed-in clinic.
//
// Backend contract (NestJS, see client-app/backend/src/shared/authorization):
//   GET    /api/permissions          → PermissionGroup[]   (the catalog, grouped for display)
//   GET    /api/roles                → Role[]
//   POST   /api/roles                → Role                (custom role)
//   PATCH  /api/roles/:key           → Role                (rename / replace permissions)
//   DELETE /api/roles/:key           → { message }        (custom role nobody holds)
//   GET    /api/users                → StaffMember[] (+ patients, filtered out here)
//   PATCH  /api/users/:id/assignment → StaffMember         ({ role })
//   GET    /api/auth/me              → { id, permissions: string[], ... }

import { apiFetch } from "./client";

export type Permission = { key: string; label: string };
export type PermissionGroup = { key: string; label: string; permissions: Permission[] };

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  /** Shipped with every clinic (admin, doctor, secretary, patient); cannot be deleted. */
  is_system: boolean;
  /** The permission set cannot change (admin has everything, patient nothing). */
  locked: boolean;
  permissions: string[];
  users_count: number;
};

export type StaffMember = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
};

export type RoleInput = {
  key?: string;
  name: string;
  description?: string;
  permissions: string[];
};

/** Roles a staff account can hold; patients are accounts, not staff. */
export const PATIENT_ROLE_KEY = "patient";
export const ADMIN_ROLE_KEY = "admin";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const fetchPermissionCatalog = () => request<PermissionGroup[]>("/api/permissions");

export const fetchRoles = () => request<Role[]>("/api/roles");

export const createRole = (input: RoleInput) => request<Role>("/api/roles", json("POST", input));

export const updateRole = (key: string, input: Partial<RoleInput>) =>
  request<Role>(`/api/roles/${encodeURIComponent(key)}`, json("PATCH", input));

export const deleteRole = (key: string) =>
  request<{ message: string }>(`/api/roles/${encodeURIComponent(key)}`, { method: "DELETE" });

export async function fetchStaff(): Promise<StaffMember[]> {
  const users = await request<StaffMember[]>("/api/users");
  return users.filter((u) => u.role !== PATIENT_ROLE_KEY);
}

export const assignStaffRole = (userId: string, role: string) =>
  request<StaffMember>(`/api/users/${userId}/assignment`, json("PATCH", { role }));

export type Me = { id: string; permissions: string[] };

export async function fetchMe(): Promise<Me> {
  const me = await request<{ id: string | number; permissions?: string[] }>("/api/auth/me");
  return { id: String(me.id), permissions: me.permissions ?? [] };
}
