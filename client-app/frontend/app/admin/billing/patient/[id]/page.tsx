"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { FaCashRegister, FaFileInvoiceDollar, FaTooth } from "react-icons/fa";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/lib/auth/useSignOut";
import { MONEY_WORD } from "@/components/billing/money-words";
import { money } from "@/components/billing/quote-doc";
import { ReceivePaymentModal, type ReceiveOutcome } from "@/components/billing/ReceivePaymentModal";
import { RefundPrepaidModal } from "@/components/billing/RefundPrepaidModal";
import { useMoneyFile } from "@/components/money/useMoneyFile";
import { MoneySummary } from "@/components/money/MoneySummary";
import { QuoteSection } from "@/components/money/QuoteSection";
import { BillsSection } from "@/components/money/BillsSection";
import { PaymentsSection } from "@/components/money/PaymentsSection";
import { MoneyTimeline } from "@/components/money/MoneyTimeline";

/*
 * One patient's money, on one page.
 *
 * The four stages — plan and quote, bills, payments, history — used to be
 * four pages, each with a drawer, and every act sent the desk to another
 * page with a query string. Here they are sections of one page, read from one
 * answer, and every act is a dialog on this page: price a line, give the
 * quote, record the agreement, issue a bill, replace or cancel it, receive a
 * payment, refund prepaid money. The sidebar pages are lists; a row opens
 * this page.
 *
 * The address bar can say which stage to land on: `?bill=<id>` opens that
 * bill, `?receive=<invoiceId|1>` opens Receive payment (for that bill, or for
 * whatever they owe), `?refund=1` opens Refund, `?new=bill` opens the builder.
 */
export default function PatientMoneyPage() {
  const params = useParams<{ id: string }>();
  const patientId = Number(params?.id);
  const router = useRouter();
  const handleLogout = useSignOut();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { file, loading, missing, reload, setPlan, inFlight } = useMoneyFile(patientId);

  /** The two money acts, owned here so both sections share one dialog each. */
  const [receiving, setReceiving] = useState<{ invoiceId: number | null } | null>(null);
  const [refunding, setRefunding] = useState(false);

  /** What the link asked for, read once. */
  const [arrival, setArrival] = useState<{
    bill: number | null;
    replace: number | null;
    newBill: boolean;
  } | null>(null);
  useEffect(() => {
    if (arrival) return;
    const q = new URLSearchParams(window.location.search);
    const bill = Number(q.get("bill")) || null;
    const replace = Number(q.get("replace")) || null;
    const receive = Number(q.get("receive"));
    const refund = q.get("refund") === "1";
    const newBill = q.get("new") === "bill";
    setArrival({ bill: bill ?? replace, replace, newBill });
    if (receive) setReceiving({ invoiceId: receive > 1 ? receive : null });
    if (refund) setRefunding(true);
    if (q.toString()) window.history.replaceState(null, "", `/admin/billing/patient/${patientId}`);
  }, [arrival, patientId]);

  const sayReceived = (who: string, o: ReceiveOutcome) => {
    const went = o.applied.map((a) => `${a.invoice_number} $${money(a.amount)}`);
    toast.success(
      [
        `${o.receipt.document_number}: $${money(o.receipt.amount)} from ${who}.`,
        went.length > 0 ? `Paid ${went.join(", ")}.` : "",
        o.prepaid > 0 ? `$${money(o.prepaid)} stays ${MONEY_WORD.prepaid.toLowerCase()}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  };

  const prepaid = file?.figures?.credit_held ?? 0;

  return (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar
        activePage="billing"
        sidebarOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminPageHeader
          eyebrow="Money file"
          title={file?.patient.label ?? (loading ? "…" : "Patient")}
          subtitle="Plan and quote, bills, payments and history, in one place"
          actions={[
            { key: "chart", label: "Open the chart", icon: <FaTooth />, href: `/admin/patients?patient=${patientId}&tab=chart` },
            { key: "billing", label: "All bills", icon: <FaFileInvoiceDollar />, href: "/admin/billing" },
            { key: "payments", label: "Payments", icon: <FaCashRegister />, href: "/admin/payments" },
          ]}
        />

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {loading && !file ? (
            <LoadingSpinner label="Loading the money file" />
          ) : missing || !file ? (
            <div className="space-y-4">
              <EmptyState
                icon={FaFileInvoiceDollar}
                title="That patient could not be opened"
                description="They may not be in this clinic. Go back to the list and pick them again."
              />
              <div className="text-center">
                <Button variant="outline" onClick={() => router.push("/admin/billing")}>
                  Back to bills
                </Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-6">
              <div className="flex items-center gap-3">
                <Avatar name={file.patient.label} size="md" />
                <div className="min-w-0">
                  {file.figures && (
                    <MoneySummary
                      figures={file.figures}
                      planFigures={file.planFigures}
                      invoices={file.invoices}
                    />
                  )}
                </div>
              </div>

              <QuoteSection
                patient={file.patient}
                plan={file.plan}
                setPlan={setPlan}
                reload={reload}
                inFlight={inFlight}
              />

              <BillsSection
                patient={file.patient}
                invoices={file.invoices}
                reload={reload}
                onReceive={(invoiceId) => setReceiving({ invoiceId })}
                initialExpanded={arrival?.bill ?? null}
                initialReplace={arrival?.replace ?? null}
                initialNewBill={arrival?.newBill ?? false}
              />

              <PaymentsSection
                receipts={file.receipts}
                prepaid={prepaid}
                onReceive={() => setReceiving({ invoiceId: null })}
                onRefund={() => setRefunding(true)}
              />

              <MoneyTimeline invoices={file.invoices} receipts={file.receipts} plan={file.plan} />
            </div>
          )}
        </main>
      </div>

      {file && (
        <>
          <ReceivePaymentModal
            patient={file.patient}
            open={!!receiving}
            initialInvoiceId={receiving?.invoiceId ?? null}
            onClose={() => setReceiving(null)}
            onReceived={(outcome) => {
              setReceiving(null);
              sayReceived(file.patient.label, outcome);
              void reload(true);
            }}
          />
          <RefundPrepaidModal
            patient={refunding ? { ...file.patient, prepaid } : null}
            onClose={() => setRefunding(false)}
            onRefunded={() => void reload(true)}
          />
        </>
      )}

    </div>
  );
}
