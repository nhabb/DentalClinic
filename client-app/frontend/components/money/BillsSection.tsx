"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FaBan,
  FaChevronDown,
  FaExchangeAlt,
  FaFileInvoiceDollar,
  FaMoneyBillWave,
  FaPlus,
  FaPrint,
  FaRegClock,
  FaTrash,
} from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { cn, formatDateBeirut } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { money } from "@/components/billing/quote-doc";
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  MONEY_WORD,
} from "@/components/billing/money-words";
import {
  daysOverdue,
  isLive,
  printInvoice,
  type Invoice,
  type InvoicePayment,
} from "@/components/billing/invoice-doc";
import { NewInvoiceModal, type IssueOutcome } from "@/components/billing/NewInvoiceModal";
import {
  CONFIRM_PASSWORD_HEADER,
  PasswordConfirmModal,
} from "@/components/billing/PasswordConfirmModal";
import { CancelBillModal } from "./CancelBillModal";
import { SectionCard } from "./SectionCard";

/*
 * Bills: every bill of this patient, newest first, each one opening in place
 * to show its lines, the money on it, and the three corrections a bill can
 * take — replace, cancel, and (admin, with a password) delete. The one act a
 * bill row carries on its face is the one that happens every day: receive
 * payment on an unpaid bill. Everything else waits inside the row.
 */

type Props = {
  patient: { id: number; label: string };
  invoices: Invoice[];
  reload: (silent?: boolean) => Promise<void>;
  /** Receive money for one bill: the page owns the dialog. */
  onReceive: (invoiceId: number) => void;
  /** A bill to open on arrival (from a link), if any. */
  initialExpanded?: number | null;
  /** A bill to replace on arrival (from a link): the builder opens on it. */
  initialReplace?: number | null;
  /** Open the builder on arrival (from a link). */
  initialNewBill?: boolean;
};

function StatusBadge({ status }: { status: Invoice["status"] }) {
  return (
    <Badge tone={INVOICE_STATUS_TONE[status] ?? "neutral"} dot>
      {INVOICE_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function BillsSection({
  patient,
  invoices,
  reload,
  onReceive,
  initialExpanded = null,
  initialReplace = null,
  initialNewBill = false,
}: Props) {
  const { can } = usePermissions();
  const canCreate = can("billing:create");
  const canEdit = can("billing:edit");
  const canReplace = canCreate && canEdit;
  const canDelete = can("billing:delete");

  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(initialExpanded ? [initialExpanded] : []),
  );
  const [builder, setBuilder] = useState<{ open: boolean; replacing: Invoice | null }>({
    open: initialNewBill,
    replacing: null,
  });
  const [cancelling, setCancelling] = useState<Invoice | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "invoice" | "payment"; id: number; label: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  useEffect(() => {
    if (initialExpanded) setExpanded((s) => new Set(s).add(initialExpanded));
  }, [initialExpanded]);

  // A link that asks to replace a bill: open the builder on it once it is loaded.
  const [replaceDone, setReplaceDone] = useState(false);
  useEffect(() => {
    if (!initialReplace || replaceDone) return;
    const target = invoices.find((i) => i.id === initialReplace);
    if (!target) return;
    setReplaceDone(true);
    if (isLive(target)) setBuilder({ open: true, replacing: target });
  }, [initialReplace, invoices, replaceDone]);

  const rows = useMemo(
    () =>
      [...invoices].sort(
        (a, b) =>
          new Date(b.procedure_date).getTime() - new Date(a.procedure_date).getTime() || b.id - a.id,
      ),
    [invoices],
  );

  const toggle = (id: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreated = async (invoice: Invoice, outcome: IssueOutcome) => {
    setBuilder({ open: false, replacing: null });
    const drawn =
      outcome.paidFromBalance > 0
        ? ` $${money(outcome.paidFromBalance)} paid from their ${MONEY_WORD.prepaid.toLowerCase()} money.`
        : "";
    const owed =
      invoice.remaining_amount > 0
        ? ` $${money(invoice.remaining_amount)} ${MONEY_WORD.unpaid.toLowerCase()}.`
        : " Paid in full.";
    toast.success(
      outcome.replaced
        ? `${outcome.replaced.invoice_number} cancelled. ${invoice.invoice_number} issued in its place.${drawn}${owed}`
        : `${invoice.invoice_number} issued.${drawn}${owed}`,
    );
    setExpanded((s) => new Set(s).add(invoice.id));
    await reload(true);
  };

  const handleConfirmedDelete = async (password: string) => {
    if (!confirm) return;
    setConfirmBusy(true);
    setConfirmError("");
    const path =
      confirm.kind === "invoice"
        ? `/api/billing/invoices/${confirm.id}`
        : `/api/billing/payments/${confirm.id}`;
    try {
      const res = await apiFetch(path, {
        method: "DELETE",
        headers: { [CONFIRM_PASSWORD_HEADER]: password },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setConfirmError(err.message ?? "The deletion was refused.");
        return;
      }
      toast.success(confirm.kind === "invoice" ? "Bill deleted." : "Payment row removed.");
      setConfirm(null);
      await reload(true);
    } catch {
      setConfirmError("The deletion could not be completed.");
    } finally {
      setConfirmBusy(false);
    }
  };

  const live = invoices.filter(isLive);
  const meta =
    invoices.length === 0
      ? "No bill yet"
      : `${live.length} ${live.length === 1 ? "bill" : "bills"}${
          invoices.length > live.length ? ` · ${invoices.length - live.length} cancelled` : ""
        }`;

  return (
    <>
      <SectionCard
        id="bills"
        title={MONEY_WORD.bills}
        icon={<FaFileInvoiceDollar />}
        meta={meta}
        acts={
          canCreate ? (
            <Button size="sm" onClick={() => setBuilder({ open: true, replacing: null })}>
              <FaPlus /> New bill
            </Button>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">
            This patient has never been billed. A bill is made from the work on their plan, done
            or still planned, at the quote&apos;s prices.
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200">
            {rows.map((inv) => {
              const open = expanded.has(inv.id);
              const late = daysOverdue(inv);
              const unpaid = isLive(inv) && inv.remaining_amount > 0;
              return (
                <li key={inv.id} className={cn(inv.status === "cancelled" && "bg-ink-50/50")}>
                  {/* The row: what the bill is and where it stands. Click to open it. */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => toggle(inv.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(inv.id);
                      }
                    }}
                    className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400"
                  >
                    <FaChevronDown
                      aria-hidden
                      className={cn("shrink-0 text-xs text-ink-400 transition-transform", open && "rotate-180")}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-ink-700">{inv.invoice_number}</span>
                        <StatusBadge status={inv.status} />
                        {inv.replaced_by && (
                          <Badge tone="brand">
                            {MONEY_WORD.replacedBy} {inv.replaced_by.invoice_number}
                          </Badge>
                        )}
                        {late > 0 && (
                          <Badge tone="brick" icon={FaRegClock}>
                            {late}d overdue
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-ink-500">
                        {formatDateBeirut(inv.procedure_date)} · due {formatDateBeirut(inv.due_date)} ·{" "}
                        {inv.line_items.length} {inv.line_items.length === 1 ? "item" : "items"}
                        {inv.replaces && ` · ${MONEY_WORD.replaces.toLowerCase()} ${inv.replaces.invoice_number}`}
                      </div>
                    </div>

                    <dl className="flex items-center gap-5 text-xs tabular-nums">
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-ink-400">{MONEY_WORD.billTotal}</dt>
                        <dd className="text-sm font-bold text-ink-900">${money(inv.total_amount)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-ink-400">{MONEY_WORD.paid}</dt>
                        <dd className="text-sm font-semibold text-leaf-700">${money(inv.amount_paid)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-ink-400">{MONEY_WORD.unpaid}</dt>
                        <dd
                          className={cn(
                            "text-sm font-semibold",
                            inv.remaining_amount > 0 ? "text-brick-700" : "text-ink-400",
                          )}
                        >
                          ${money(inv.remaining_amount)}
                        </dd>
                      </div>
                    </dl>

                    {/* The everyday act, and only that one, on the row's face. */}
                    {canCreate && unpaid && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" onClick={() => onReceive(inv.id)}>
                          <FaMoneyBillWave /> {MONEY_WORD.receivePayment}
                        </Button>
                      </div>
                    )}
                  </div>

                  {open && (
                    <div className="space-y-4 border-t border-ink-100 bg-ink-50/40 px-4 py-4 sm:ps-12">
                      {inv.status === "cancelled" && (
                        <p className="rounded-lg border border-ink-200 bg-card px-3 py-2 text-sm text-ink-700">
                          <strong>Cancelled</strong>
                          {inv.cancelled_at ? ` on ${formatDateBeirut(inv.cancelled_at)}` : ""}: {inv.cancel_reason}
                        </p>
                      )}
                      {inv.replaces && (
                        <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
                          {MONEY_WORD.replaces} <strong>{inv.replaces.invoice_number}</strong>, cancelled when this
                          bill was issued.
                        </p>
                      )}
                      {inv.notes && <p className="text-sm italic text-ink-600">{inv.notes}</p>}

                      <table className="w-full overflow-hidden rounded-lg border border-ink-200 bg-card text-sm">
                        <tbody className="divide-y divide-ink-100">
                          {inv.line_items.map((li) => (
                            <tr key={li.id}>
                              <td className="px-3 py-2 text-ink-800">
                                {li.procedure_name}
                                {li.tooth_number && (
                                  <span className="ms-2 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-brand">
                                    Tooth {li.tooth_number}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-end tabular-nums text-ink-800">${money(li.amount)}</td>
                            </tr>
                          ))}
                          {(inv.discount_amount > 0 || inv.vat_amount > 0) && (
                            <tr className="text-ink-600">
                              <td className="px-3 py-2">Subtotal</td>
                              <td className="px-3 py-2 text-end tabular-nums">${money(inv.subtotal)}</td>
                            </tr>
                          )}
                          {inv.discount_amount > 0 && (
                            <tr className="text-ink-600">
                              <td className="px-3 py-2">
                                Discount
                                {inv.discount_reason && (
                                  <span className="ms-2 text-xs italic text-ink-500">{inv.discount_reason}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-end tabular-nums">−${money(inv.discount_amount)}</td>
                            </tr>
                          )}
                          {inv.vat_amount > 0 && (
                            <tr className="text-ink-600">
                              <td className="px-3 py-2">VAT {inv.vat_percent}%</td>
                              <td className="px-3 py-2 text-end tabular-nums">${money(inv.vat_amount)}</td>
                            </tr>
                          )}
                          <tr className="bg-ink-50 font-semibold">
                            <td className="px-3 py-2">{MONEY_WORD.billTotal}</td>
                            <td className="px-3 py-2 text-end tabular-nums">${money(inv.total_amount)}</td>
                          </tr>
                        </tbody>
                      </table>

                      {inv.invoice_payments.length > 0 && (
                        <div className="space-y-1.5">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                            Money on this bill
                          </h4>
                          {inv.invoice_payments.map((p: InvoicePayment) => (
                            <div
                              key={p.id}
                              className={cn(
                                "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                                p.kind === "refund" ? "bg-red-50" : "bg-card ring-1 ring-inset ring-ink-100",
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn("font-semibold tabular-nums", p.kind === "refund" ? "text-red-700" : "text-ink-800")}>
                                  {p.kind === "refund" ? "−" : ""}${money(p.amount)}
                                </span>
                                {p.document_number && (
                                  <span className="font-mono text-xs text-ink-600">{p.document_number}</span>
                                )}
                                <span className="text-xs capitalize text-ink-500">{p.payment_method.replace(/_/g, " ")}</span>
                                {(p.reason ?? p.notes) && (
                                  <span className="text-xs italic text-ink-500">{p.reason ?? p.notes}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-ink-500">
                                <span>{formatDateBeirut(p.payment_date)}</span>
                                {canDelete && inv.status !== "cancelled" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setConfirmError("");
                                      setConfirm({
                                        kind: "payment",
                                        id: p.id,
                                        label: `${p.kind === "refund" ? "Refund" : "Payment"} of $${money(p.amount)}`,
                                      });
                                    }}
                                    className="rounded p-1 text-red-300 hover:text-red-600"
                                    title="Remove this row (admin, password required)"
                                  >
                                    <FaTrash className="text-xs" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* The corrections, inside the bill, in the order they are needed. */}
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-ink-200/70 pt-3">
                        <Button size="sm" variant="ghost" onClick={() => printInvoice(inv)}>
                          <FaPrint /> {inv.status === "paid" ? "Print receipt" : "Print"}
                        </Button>
                        {canReplace && isLive(inv) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Cancel this bill and issue a corrected one in its place; money on it moves across"
                            onClick={() => setBuilder({ open: true, replacing: inv })}
                          >
                            <FaExchangeAlt /> {MONEY_WORD.replaceBill}
                          </Button>
                        )}
                        {canEdit && isLive(inv) && (
                          <Button size="sm" variant="ghost" onClick={() => setCancelling(inv)}>
                            <FaBan /> Cancel bill
                          </Button>
                        )}
                        {canDelete && inv.invoice_payments.length === 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ms-auto text-red-500 hover:text-red-700"
                            title="For a bill issued by mistake; admin, password required"
                            onClick={() => {
                              setConfirmError("");
                              setConfirm({ kind: "invoice", id: inv.id, label: `Bill ${inv.invoice_number}` });
                            }}
                          >
                            <FaTrash /> Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <NewInvoiceModal
        open={builder.open}
        onClose={() => setBuilder({ open: false, replacing: null })}
        patients={[patient]}
        initialPatientId={patient.id}
        replacing={builder.replacing}
        onCreated={handleCreated}
      />

      <CancelBillModal
        invoice={cancelling}
        onClose={() => setCancelling(null)}
        onCancelled={() => void reload(true)}
      />

      <PasswordConfirmModal
        open={!!confirm}
        title={confirm?.kind === "payment" ? "Remove this payment row" : "Delete this bill"}
        description={
          confirm
            ? `${confirm.label} will be removed permanently. Prefer a refund or a cancellation when money was actually received.`
            : ""
        }
        busy={confirmBusy}
        error={confirmError}
        onConfirm={handleConfirmedDelete}
        onClose={() => {
          if (!confirmBusy) setConfirm(null);
        }}
      />
    </>
  );
}
