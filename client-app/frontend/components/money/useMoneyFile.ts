"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { normalizeInvoice, type Invoice } from "@/components/billing/invoice-doc";
import { normalizeReceipt, type ReceiptRow } from "@/components/billing/receipt-doc";
import { readError, type Plan } from "@/components/billing/quote-doc";

/*
 * One patient's money, read once for the whole page.
 *
 * The money page shows the four stages of one patient — plan and quote,
 * bills, payments, history — and every section used to fetch its own copy of
 * the same figures. This hook is the one read: the statement (plan, ledger
 * and the money figures, composed by the server), the bills and the receipts,
 * plus the patient's name. Every act on the page calls `reload()` and every
 * section redraws from the same answer, so two sections can never disagree.
 */

const num = (v: unknown) => Number(v ?? 0);

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The plan as the server sends it, with numbers as numbers. */
export const normalizePlan = (p: any): Plan => ({
  ...p,
  lines: (p?.lines ?? []).map((l: any) => ({
    ...l,
    amount: l.amount == null ? null : Number(l.amount),
  })),
  totals: {
    plan: num(p?.totals?.plan),
    planned: num(p?.totals?.planned),
    done_unbilled: num(p?.totals?.done_unbilled),
    billed_value: num(p?.totals?.billed_value),
    unbilled_value: num(p?.totals?.unbilled_value),
    unpriced_count: Number(p?.totals?.unpriced_count ?? 0),
  },
  counts: p?.counts ?? { planned: 0, done: 0, billed: 0, part_paid: 0, paid: 0 },
  settlement: p?.settlement ?? { invoice_count: 0, invoiced_total: 0, received: 0, due: 0 },
  sends: p?.sends ?? [],
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The money side: sums of invoice and payment rows, from one definition. */
export type MoneyFigures = {
  billed: number;
  received: number;
  applied: number;
  credit_held: number;
  due_now: number;
  overdue: number;
};

/** The chart side: what the work is worth. Never compared with the above. */
export type PlanFigures = {
  plan_value: number;
  billed_value: number;
  unbilled_value: number;
  unpriced_lines: number;
};

export type MoneyFile = {
  patient: { id: number; label: string };
  plan: Plan | null;
  figures: MoneyFigures | null;
  planFigures: PlanFigures | null;
  invoices: Invoice[];
  receipts: ReceiptRow[];
};

export function useMoneyFile(patientId: number) {
  const [file, setFile] = useState<MoneyFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  /** Price saves in flight: a silent reload must not undo one. */
  const inFlight = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [pRes, sRes, iRes, rRes] = await Promise.all([
          apiFetch(`/api/patients/${patientId}`),
          apiFetch(`/api/billing/patients/${patientId}/statement`),
          apiFetch(`/api/billing/invoices?patient_id=${patientId}&limit=200`),
          apiFetch(`/api/billing/receipts?patient_id=${patientId}&limit=200`),
        ]);
        if (pRes.status === 404 || sRes.status === 404) {
          setMissing(true);
          return;
        }
        if (!sRes.ok) {
          toast.error(await readError(sRes, "Could not load this patient's money file."));
          return;
        }
        const p = pRes.ok ? await pRes.json() : null;
        const s = await sRes.json();
        const invoices = iRes.ok ? await iRes.json() : { data: [] };
        const receipts = rRes.ok ? await rRes.json() : [];
        if (silent && inFlight.current > 0) return;
        setFile({
          patient: {
            id: patientId,
            label: p?.users
              ? `${p.users.first_name} ${p.users.last_name}`.trim()
              : `Patient #${patientId}`,
          },
          plan: s?.plan ? normalizePlan(s.plan) : null,
          figures: s?.figures
            ? {
                billed: num(s.figures.billed),
                received: num(s.figures.received),
                applied: num(s.figures.applied),
                credit_held: num(s.figures.credit_held),
                due_now: num(s.figures.due_now),
                overdue: num(s.figures.overdue),
              }
            : null,
          planFigures: s?.plan_figures
            ? {
                plan_value: num(s.plan_figures.plan_value),
                billed_value: num(s.plan_figures.billed_value),
                unbilled_value: num(s.plan_figures.unbilled_value),
                unpriced_lines: Number(s.plan_figures.unpriced_lines ?? 0),
              }
            : null,
          invoices: (Array.isArray(invoices?.data) ? invoices.data : []).map(normalizeInvoice),
          receipts: (Array.isArray(receipts) ? receipts : []).map(normalizeReceipt),
        });
      } catch {
        if (!silent) toast.error("Could not reach the server.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [patientId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** Change the plan in place (optimistic pricing); the next reload confirms it. */
  const setPlan = useCallback((update: (plan: Plan) => Plan) => {
    setFile((f) => (f && f.plan ? { ...f, plan: update(f.plan) } : f));
  }, []);

  return {
    file,
    loading,
    missing,
    /** Re-read everything; `silent` keeps the page as it is while it loads. */
    reload: load,
    setPlan,
    inFlight,
  };
}
