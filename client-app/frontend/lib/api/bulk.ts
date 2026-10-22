import { apiFetch } from "@/lib/api/client";

export interface BulkResult<Id> {
  /** Ids the API actually deleted. */
  done: Id[];
  /** Ids it refused, with its reason (missing permission, has invoices, …). */
  failed: { id: Id; message: string }[];
}

/**
 * Deletes each id and reports which really went. fetch does not reject on a
 * 403 or 409, so checking each answer is what keeps a refused row on screen
 * instead of reporting it deleted.
 */
export async function deleteEach<Id>(ids: Id[], urlFor: (id: Id) => string): Promise<BulkResult<Id>> {
  const answers = await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await apiFetch(urlFor(id), { method: "DELETE" });
        if (res.ok) return { id, ok: true as const };
        const body = await res.json().catch(() => null);
        const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
        return { id, ok: false as const, message: String(message || `Refused (${res.status})`) };
      } catch {
        return { id, ok: false as const, message: "Network error" };
      }
    })
  );
  return {
    done: answers.filter((a) => a.ok).map((a) => a.id),
    failed: answers.flatMap((a) => (a.ok ? [] : [{ id: a.id, message: a.message }])),
  };
}
