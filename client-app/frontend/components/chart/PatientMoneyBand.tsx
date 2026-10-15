"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FaFileInvoiceDollar, FaPrint } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  daysOverdue,
  INVOICE_STATUS_STYLE,
  Invoice,
  normalizeInvoice,
  patientTotals,
  printInvoice,
} from "@/components/billing/invoice-doc";
import { money } from "@/components/billing/quote-doc";

/*
 * The money band of the dental chart: what this patient has been billed, what
 * they have paid and what they still owe, with every invoice and the way to
 * take money. The billing page only ever shows these across patients; this is
 * where a person acts on them.
 */

interface PatientMoneyBandProps {
  /** patient_profiles.id */
  patientId: number;
  /** Bumped by the parent whenever work was billed or money was taken. */
  reloadToken: number;
  canBill: boolean;
  /** Opens the one payment drawer, which the chart page owns. */
  onPay: (invoice: { id: number; total: number; remaining: number }) => void;
}

export function PatientMoneyBand({
  patientId,
  reloadToken,
  canBill,
  onPay,
}: PatientMoneyBandProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/api/billing/invoices?patient_id=${patientId}&limit=100`,
      );
      if (!res.ok) throw new Error();
      const json = await res.json();
      setInvoices(
        (Array.isArray(json.data) ? json.data : []).map(normalizeInvoice),
      );
    } catch {
      toast.error("Could not load this patient's invoices.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load, reloadToken]);

  const totals = patientTotals(invoices);
  // Settled invoices are history; the owed ones are what the desk works from.
  const owing = invoices.filter(
    (i) => i.status === "open" || i.status === "partial",
  );
  const shown = showAll ? invoices : owing;

  const figures = [
    { label: "Billed", value: totals.billed, tone: "text-gray-900" },
    { label: "Received", value: totals.received, tone: "text-green-700" },
    {
      label: "Owed",
      value: totals.owed,
      tone: totals.owed > 0 ? "text-red-600" : "text-gray-900",
    },
  ];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-semibold text-gray-800">
          <FaFileInvoiceDollar className="text-brand" /> Money
        </h4>
        <div className="flex items-center gap-4">
          {figures.map((f) => (
            <div key={f.label} className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">
                {f.label}
              </p>
              <p className={`font-bold ${f.tone}`}>${money(f.value)}</p>
            </div>
          ))}
          {totals.overdue > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
              ${money(totals.overdue)} overdue
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-gray-500">Loading…</p>
      ) : invoices.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">
          Nothing billed yet. Record work on the chart to create the first
          invoice.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-2">Invoice</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Due</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">Paid</th>
                  <th className="px-2 py-2 text-right">Remaining</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((inv) => {
                  const late = daysOverdue(inv);
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-gray-700">
                        {inv.invoice_number}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-600">
                        {formatDateBeirut(inv.procedure_date)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-600">
                        {formatDateBeirut(inv.due_date)}
                        {late > 0 && (
                          <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            {late}d
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-gray-900">
                        ${money(inv.total_amount)}
                      </td>
                      <td className="px-2 py-2 text-right text-green-700">
                        ${money(inv.amount_paid)}
                      </td>
                      <td className="px-2 py-2 text-right text-red-600">
                        ${money(inv.remaining_amount)}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${INVOICE_STATUS_STYLE[inv.status]}`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => printInvoice(inv)}
                            title={
                              inv.status === "paid"
                                ? "Print receipt"
                                : "Print invoice"
                            }
                            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          >
                            <FaPrint className="text-xs" />
                          </button>
                          {canBill && inv.remaining_amount > 0 && (
                            <Button
                              size="sm"
                              onClick={() =>
                                onPay({
                                  id: inv.id,
                                  total: inv.total_amount,
                                  remaining: inv.remaining_amount,
                                })
                              }
                            >
                              Take payment
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {invoices.length > owing.length && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs font-medium text-brand hover:underline"
            >
              {showAll
                ? `Show only what is owed (${owing.length})`
                : `Show all invoices (${invoices.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
