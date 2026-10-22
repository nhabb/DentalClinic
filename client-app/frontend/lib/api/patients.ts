import { apiFetch } from "@/lib/api/client";

const PAGE_SIZE = 100;
/** Upper bound on pages, so a misbehaving answer cannot loop forever. */
const MAX_PAGES = 100;

/**
 * Every patient profile of the clinic. GET /api/patients answers one page
 * (twenty by default), and the lists and pickers that used it as-is only
 * ever reached the first twenty patients: everyone else could not be found,
 * billed or booked. Pages are fetched until `meta.total` is reached.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllPatients(): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await apiFetch(`/api/patients?page=${page}&limit=${PAGE_SIZE}`);
    if (!res.ok) throw new Error(`Could not load patients (${res.status})`);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : (json.data ?? []);
    all.push(...rows);
    const total = Array.isArray(json) ? rows.length : Number(json.meta?.total ?? all.length);
    if (rows.length < PAGE_SIZE || all.length >= total) break;
  }
  return all;
}
