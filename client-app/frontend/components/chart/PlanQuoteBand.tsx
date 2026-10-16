"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FaCheck, FaClipboardList, FaPaperPlane, FaPrint, FaTimes } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  money,
  normalizeQuote,
  printQuote,
  Quote,
  QUOTE_STATUS_STYLE,
  readError,
} from "@/components/billing/quote-doc";

/*
 * The plan is the quote. Planning priced work on the chart builds this
 * estimate automatically and keeps it in step with the plan, so the paper the
 * patient is given always matches the teeth. It arrives as a draft that needs
 * a person to confirm: give it to the patient, or record that they accepted.
 *
 * Prices are edited on the plan rows above this band, not here — change the
 * plan and the quote follows.
 */

interface PlanQuoteBandProps {
  /** patient_profiles.id */
  patientId: number;
  /** Bumped by the chart whenever the plan changed. */
  reloadToken: number;
  /** `billing:edit`: confirm the quote (sent / accepted / declined). */
  canConfirm: boolean;
  /** Accepting may write prices onto the plan, so the chart reloads. */
  onChanged: () => void;
}

export function PlanQuoteBand({
  patientId,
  reloadToken,
  canConfirm,
  onChanged,
}: PlanQuoteBandProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/quotes?patient_id=${patientId}&limit=20`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const quotes: Quote[] = (Array.isArray(json.data) ? json.data : []).map(normalizeQuote);
      // The one that follows the plan: the newest that is still open.
      const open = quotes.filter((q) =>
        ["draft", "sent", "accepted"].includes(q.status),
      );
      setQuote(open[0] ?? null);
    } catch {
      toast.error("Could not load this patient's quote.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load, reloadToken]);

  const act = async (verb: "send" | "accept" | "decline", done: string) => {
    if (!quote) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/quotes/${quote.id}/${verb}`, { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, `Could not ${verb} the quote.`));
      const updated = normalizeQuote(await res.json());
      toast.success(done);
      setQuote(updated);
      if (verb === "send") printQuote(updated);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="py-2 text-center text-sm text-gray-500">Loading the estimate…</p>
      </section>
    );
  }

  if (!quote) {
    return (
      <section className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4">
        <h4 className="flex items-center gap-2 font-semibold text-gray-800">
          <FaClipboardList className="text-brand" /> Estimate
        </h4>
        <p className="mt-2 text-sm text-gray-500">
          Plan work on the chart above and an estimate is prepared here
          automatically, ready to give to the patient.
        </p>
      </section>
    );
  }

  const isBilled = quote.invoices.length > 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-semibold text-gray-800">
          <FaClipboardList className="text-brand" /> Estimate
          <span className="font-mono text-xs font-normal text-gray-500">
            {quote.quote_number}
          </span>
          <span className="text-xs font-normal text-gray-400">v{quote.version}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${QUOTE_STATUS_STYLE[quote.status]}`}
          >
            {quote.status}
          </span>
        </h4>
        <p className="text-right">
          <span className="text-[11px] uppercase tracking-wide text-gray-500">Total</span>{" "}
          <span className="text-lg font-bold text-gray-900">${money(quote.quoted_total)}</span>
        </p>
      </div>

      <p className="mb-3 text-xs text-gray-500">
        {isBilled ? (
          <>
            Billed on {quote.invoices.map((i) => i.invoice_number).join(", ")}. The
            figures belong to that invoice now, so the plan no longer changes them.
          </>
        ) : quote.status === "draft" ? (
          <>
            Built from the plan and kept in step with it. Edit a price on a planned
            row above and this follows. It needs your confirmation before the
            patient sees it as final.
          </>
        ) : (
          <>Kept in step with the plan. Change the plan above and this follows.</>
        )}
      </p>

      <div className="space-y-1">
        {quote.items.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between gap-3 border-b border-gray-50 py-1 text-sm last:border-0"
          >
            <span className="min-w-0 truncate text-gray-800">
              {i.tooth_number && (
                <span className="mr-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-brand">
                  {i.tooth_number}
                </span>
              )}
              {i.procedure_name}
            </span>
            <span className="shrink-0 font-medium text-gray-900">
              ${money(i.quoted_amount)}
            </span>
          </div>
        ))}
        {quote.quoted_discount > 0 && (
          <div className="flex justify-between py-1 text-sm text-gray-600">
            <span>Discount</span>
            <span>−${money(quote.quoted_discount)}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
        {quote.valid_until && (
          <span className="text-xs text-gray-500">
            Valid until {formatDateBeirut(quote.valid_until)}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => printQuote(quote)}
          className="ml-auto"
        >
          <FaPrint className="mr-2 text-xs" /> Print
        </Button>
        {canConfirm && !isBilled && quote.status === "draft" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => act("send", "Given to the patient.")}
            title="Freeze nothing: print it for the patient and mark it given"
          >
            <FaPaperPlane className="mr-2 text-xs" /> Give to patient
          </Button>
        )}
        {canConfirm && !isBilled && quote.status !== "accepted" && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => act("accept", "Accepted; the plan is agreed.")}
          >
            <FaCheck className="mr-2 text-xs" /> Patient accepted
          </Button>
        )}
        {canConfirm && !isBilled && quote.status === "sent" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => act("decline", "Marked as declined.")}
          >
            <FaTimes className="mr-2 text-xs" /> Declined
          </Button>
        )}
      </div>
    </section>
  );
}
