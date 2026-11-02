"use client";

import { FaMoneyBillWave, FaPrint, FaUndo } from "react-icons/fa";
import { cn, formatDateBeirut } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { money } from "@/components/billing/quote-doc";
import { MONEY_WORD } from "@/components/billing/money-words";
import {
  printReceipt,
  RECEIPT_STATUS_LABEL,
  RECEIPT_STATUS_TONE,
  type ReceiptRow,
} from "@/components/billing/receipt-doc";
import { SectionCard } from "./SectionCard";

/*
 * Payments: every receipt (RT) and refund (RF) of this patient, newest first,
 * each saying where its money went. Two acts, in the heading: money in, and
 * money back while something is prepaid. Nothing is moved by hand here;
 * prepaid money finds its bill when the bill is issued.
 */

type Props = {
  receipts: ReceiptRow[];
  prepaid: number;
  onReceive: () => void;
  onRefund: () => void;
};

const methodLabel = (m: string) => m.replace(/_/g, " ");

export function PaymentsSection({ receipts, prepaid, onReceive, onRefund }: Props) {
  const { can } = usePermissions();
  const canTake = can("billing:create");
  const canRefund = can("billing:edit");

  const received = receipts.filter((r) => r.kind === "payment").reduce((s, r) => s + r.amount, 0);
  const refunded = receipts.filter((r) => r.kind === "refund").reduce((s, r) => s + r.amount, 0);
  const meta =
    receipts.length === 0
      ? "No money has moved yet"
      : `$${money(received)} received${refunded > 0 ? ` · $${money(refunded)} refunded` : ""}${
          prepaid > 0 ? ` · $${money(prepaid)} ${MONEY_WORD.prepaid.toLowerCase()}` : ""
        }`;

  return (
    <SectionCard
      id="payments"
      title="Payments"
      icon={<FaMoneyBillWave />}
      meta={meta}
      acts={
        <>
          {canTake && (
            <Button size="sm" onClick={onReceive}>
              <FaMoneyBillWave /> {MONEY_WORD.receivePayment}
            </Button>
          )}
          {canRefund && prepaid > 0 && (
            <Button size="sm" variant="outline" onClick={onRefund}>
              <FaUndo /> {MONEY_WORD.refund} ${money(prepaid)}
            </Button>
          )}
        </>
      }
    >
      {receipts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">
          Nothing received yet. A payment pays their unpaid bills oldest first; anything beyond
          that stays {MONEY_WORD.prepaid.toLowerCase()} for the next bill.
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200">
          {receipts.map((r) => {
            const held = r.figures?.held ?? 0;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span
                  className={cn(
                    "w-24 shrink-0 text-sm font-bold tabular-nums",
                    r.kind === "refund" ? "text-brick-700" : "text-leaf-700",
                  )}
                >
                  {r.kind === "refund" ? "−" : "+"}${money(r.amount)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-ink-700">{r.document_number}</span>
                    <Badge tone="neutral" className="capitalize">
                      {methodLabel(r.payment_method)}
                    </Badge>
                    {r.kind === "refund" ? (
                      <Badge tone="brick" icon={FaUndo}>
                        {r.source ? `out of ${r.source.document_number}` : "refund"}
                      </Badge>
                    ) : (
                      r.status !== "refund" && (
                        <Badge tone={RECEIPT_STATUS_TONE[r.status]}>{RECEIPT_STATUS_LABEL[r.status]}</Badge>
                      )
                    )}
                    {r.kind === "payment" && held > 0 && (
                      <Badge tone="brand">
                        ${money(held)} {MONEY_WORD.prepaid.toLowerCase()}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-500">
                    {r.kind === "refund"
                      ? r.reason
                      : [
                          ...r.allocations.map(
                            (a) => `$${money(a.amount)} → ${a.invoice?.invoice_number ?? "a bill"}`,
                          ),
                          ...r.refunds.map((f) => `−$${money(f.amount)} refunded (${f.document_number})`),
                        ].join(" · ") || `${MONEY_WORD.prepaid}: not on a bill yet`}
                    {r.kind === "payment" && r.notes && ` · ${r.notes}`}
                  </div>
                </div>
                <div className="text-end text-xs text-ink-500">
                  <div className="tabular-nums">{formatDateBeirut(r.payment_date)}</div>
                  {r.taken_by && <div>by {r.taken_by}</div>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Print ${r.document_number}`}
                  onClick={() => printReceipt(r)}
                >
                  <FaPrint />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
