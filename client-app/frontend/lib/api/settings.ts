// Clinic settings of the signed-in clinic.
//
// Backend contract (NestJS, see client-app/backend/src/shared/tenancy and
// src/patient/clinic-profile):
//   GET    /api/organizations/me      → Organization (with its branches)
//   PATCH  /api/organizations/me      → Organization        (clinic:settings)
//   GET    /api/clinic-profile        → ClinicProfile       (404 before the first edit)
//   PATCH  /api/clinic-profile        → ClinicProfile       ({ address, opening_hours }; clinic:settings)
//   PATCH  /api/clinic-profile/logo   → ClinicProfile       (multipart "file"; clinic:settings)
//   GET    /api/branches?include_inactive=true → Branch[]
//   POST   /api/branches              → Branch              (branches:create)
//   PATCH  /api/branches/:id          → Branch              (branches:edit; is_active retires it)
//   PATCH  /api/branches/:id/default  → Branch              (branches:edit)
//   DELETE /api/branches/:id          → Branch              (branches:delete; only with no data)
//
// Name and contact details live on the organization; the API copies them onto
// the clinic profile, which only adds the address, opening hours and logo.

import { apiFetch } from "./client";

export type Organization = {
  id: string;
  name: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  description: string | null;
  timezone: string;
  currency: string;
};

export type ClinicProfile = {
  address: string | null;
  opening_hours: string | null;
  logo_url: string | null;
};

export type Branch = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  governate: string | null;
  phone: string | null;
  email: string | null;
  opening_hours: string | null;
  timezone: string | null;
  is_default: boolean;
  is_active: boolean;
};

export type OrganizationInput = Partial<Omit<Organization, "id">>;
export type ClinicProfileInput = Partial<Pick<ClinicProfile, "address" | "opening_hours">>;
export type BranchInput = Partial<Omit<Branch, "id" | "is_default" | "is_active">>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** An empty text box clears the field: the API needs null, not "". */
export function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export const fetchOrganization = () => request<Organization>("/api/organizations/me");

export const updateOrganization = (input: OrganizationInput) =>
  request<Organization>("/api/organizations/me", json("PATCH", input));

/** The clinic profile, or an empty one when the clinic never saved it. */
export async function fetchClinicProfile(): Promise<ClinicProfile> {
  const res = await apiFetch("/api/clinic-profile");
  if (res.status === 404) return { address: null, opening_hours: null, logo_url: null };
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export const updateClinicProfile = (input: ClinicProfileInput) =>
  request<ClinicProfile>("/api/clinic-profile", json("PATCH", input));

export function uploadClinicLogo(file: File): Promise<ClinicProfile> {
  const form = new FormData();
  form.append("file", file);
  return request<ClinicProfile>("/api/clinic-profile/logo", { method: "PATCH", body: form });
}

export const fetchBranches = () => request<Branch[]>("/api/branches?include_inactive=true");

export const createBranch = (input: BranchInput) =>
  request<Branch>("/api/branches", json("POST", input));

export const updateBranch = (id: string, input: BranchInput & { is_active?: boolean }) =>
  request<Branch>(`/api/branches/${id}`, json("PATCH", input));

export const makeDefaultBranch = (id: string) =>
  request<Branch>(`/api/branches/${id}/default`, json("PATCH"));

export const deleteBranch = (id: string) => request<Branch>(`/api/branches/${id}`, json("DELETE"));
