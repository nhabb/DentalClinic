"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { formatDateBeirut } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { ShowMore } from "@/components/ui/ShowMore";
import { useDebounced, usePagedList } from "@/lib/api/paged";
import { usePermissions } from "@/lib/permissions";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { StatsCard } from "@/components/ui/StatsCard";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  MONEY_WORD,
  type InvoiceStatus,
} from "@/components/billing/money-words";
import { NewInvoiceModal, type IssueOutcome } from "@/components/billing/NewInvoiceModal";
import {
  daysOverdue,
  type Invoice,
  normalizeInvoice,
} from "@/components/billing/invoice-doc";
import {
  FaFileInvoiceDollar,
  FaCheckCircle,
  FaClock,
  FaHashtag,
  FaChartLine,
} from "react-icons/fa";
import { useSignOut } from "@/lib/auth/useSignOut";
import { fetchAllPatients } from "@/lib/api/patients";

/*
 * Billing: the register of every bill in the clinic, and the one place a
 * bill is started for a patient who has not been picked yet (New bill, then
 * choose the patient). Everything about one patient's money — their plan and
 * quote, their bills with the corrections a bill can take, their payments —
 * lives on that patient's money page, which a row opens.
 */

type PatientOption = { id: number; label: string };

function StatusBadge({ status }: { status: string }) {
  const known = status as InvoiceStatus;
  return (
    <Badge tone={INVOICE_STATUS_TONE[known] ?? "neutral"} dot>
      {INVOICE_STATUS_LABEL[known] ?? status}
    </Badge>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { can } = usePermissions();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [showBuilder, setShowBuilder] = useState(false);

  /** The clinic's own figures, from the server — not a sum of one page of rows. */
  const [clinicFigures, setClinicFigures] = useState<{
    billed: number;
    paid: number;
    unpaid: number;
    bills: number;
    creditHeld: number;
  } | null>(null);

  // The API searches, filters and counts the bills; the screen shows ten at a time.
  const bq = useDebounced(searchQuery.trim());
  const list = usePagedList<Invoice, { status: Partial<Record<string, number>> }>({
    path: "/api/billing/invoices",
    params: { search: bq, status: selectedStatus === "All" ? undefined : selectedStatus.toLowerCase() },
    map: normalizeInvoice,
    withCounts: true,
  });
  const invoices = list.rows;

  const fetchPatients = async () => {
    try {
      const all = await fetchAllPatients();
      setPatients(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all.map((p: any) => ({
          id: Number(p.id),
          label: `${p.users?.first_name ?? ""} ${p.users?.last_name ?? ""}`.trim(),
        })),
      );
    } catch { /* the builder shows its own empty state */ }
  };

  const fetchClinicFigures = async () => {
    try {
      const res = await apiFetch("/api/billing/kpis");
      if (!res.ok) return;
      const all = (await res.json())?.all_time ?? {};
      setClinicFigures({
        billed: Number(all.total_billed ?? 0),
        paid: Number(all.total_collected ?? 0),
        unpaid: Number(all.total_outstanding ?? 0),
        bills: Number(all.total_invoices ?? 0),
        creditHeld: Number(all.total_credit_held ?? 0),
      });
    } catch { /* the dashes stand */ }
  };

  useEffect(() => {
    Promise.all([fetchPatients(), fetchClinicFigures()]).finally(() => setIsLoading(false));
  }, []);

  /**
   * Old links. `?patient=<id>` (with `replace=`, `new=bill`) and
   * `?view=plans` all land on the patient's money page, which carries every
   * act; a bare `?view=plans` goes to the Quotes list.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = Number(params.get("patient"));
    if (wanted) {
      params.delete("patient");
      params.delete("view");
      const rest = params.toString();
      router.replace(`/admin/billing/patient/${wanted}${rest ? `?${rest}` : ""}`);
    } else if (params.get("view") === "plans") {
      router.replace("/admin/quotes");
    }
  }, [router]);

  /** A new bill is listed at once; the toast opens the patient's page. */
  const handleInvoiceCreated = async (invoice: Invoice, outcome: IssueOutcome) => {
    await Promise.all([list.reload(), fetchClinicFigures()]);
    const drawn =
      outcome.paidFromBalance > 0
        ? ` $${outcome.paidFromBalance.toFixed(2)} paid from their ${MONEY_WORD.prepaid.toLowerCase()} money.`
        : "";
    const owed =
      invoice.remaining_amount > 0
        ? ` $${invoice.remaining_amount.toFixed(2)} ${MONEY_WORD.unpaid.toLowerCase()}.`
        : " Paid in full.";
    toast.success(`${invoice.invoice_number} issued.${drawn}${owed}`, {
      action: {
        label: "Open",
        onClick: () => router.push(`/admin/billing/patient/${invoice.patient.id}?bill=${invoice.id}`),
      },
    });
  };

  const byStatus = list.counts?.status ?? {};
  const invoiceStatusCounts: Record<string, number> = {
    All: Object.values(byStatus).reduce<number>((a, n) => a + (n ?? 0), 0),
    Open: byStatus.open ?? 0,
    Partial: byStatus.partial ?? 0,
    Paid: byStatus.paid ?? 0,
    Cancelled: byStatus.cancelled ?? 0,
  };
  const hasInvoiceFilters = !!searchQuery.trim() || selectedStatus !== "All";
  const clearInvoiceFilters = () => { setSearchQuery(""); setSelectedStatus("All"); };

  const openPatient = (inv: Invoice) =>
    router.push(`/admin/billing/patient/${inv.patient.id}?bill=${inv.id}`);

  const handleLogout = useSignOut();

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar activePage="billing" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title={t("billing.title")}
          subtitle="Every bill in the clinic. Open one to work on that patient's money."
          onAdd={can("billing:create") ? () => setShowBuilder(true) : undefined}
          addLabel="New bill"
          actions={[
            { key: "dashboard", label: t("billing.goToDashboard"), icon: <FaChartLine />, href: "/admin" },
            { key: "analytics", label: "View analytics", icon: <FaFileInvoiceDollar />, href: "/admin/billing/analytics" },
          ]}
        />

        <main className="flex-1 p-8 overflow-auto">
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {MONEY_WORD.acrossTheClinic}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-3">
                <StatsCard icon={FaFileInvoiceDollar} iconBgClass="bg-blue-100" iconColorClass="text-blue-600" value={clinicMoney(clinicFigures?.billed)} label={MONEY_WORD.billed} />
                <StatsCard icon={FaCheckCircle} iconBgClass="bg-green-100" iconColorClass="text-green-600" value={clinicMoney(clinicFigures?.paid)} label={MONEY_WORD.paid} />
                <StatsCard icon={FaClock} iconBgClass="bg-yellow-100" iconColorClass="text-yellow-600" value={clinicMoney(clinicFigures?.unpaid)} label={MONEY_WORD.unpaid} />
                <StatsCard icon={FaHashtag} iconBgClass="bg-purple-100" iconColorClass="text-purple-600" value={clinicFigures ? String(clinicFigures.bills) : "—"} label={MONEY_WORD.bills} />
              </div>
              <p className="mb-8 text-xs text-ink-500">
                {clinicFigures && clinicFigures.creditHeld > 0
                  ? `Of what came in, $${clinicFigures.creditHeld.toFixed(2)} is ${MONEY_WORD.prepaid.toLowerCase()} — money no bill has claimed yet. The Payments page lists who holds it.`
                  : `${MONEY_WORD.billed} less ${MONEY_WORD.paid.toLowerCase()} is what is ${MONEY_WORD.unpaid.toLowerCase()}; nobody has ${MONEY_WORD.prepaid.toLowerCase()} money.`}
              </p>

              <ListToolbar
                search={{ value: searchQuery, onChange: setSearchQuery, placeholder: t("billing.searchPlaceholder") }}
                shown={list.total}
                total={invoiceStatusCounts.All}
                unitLabel={t("billing.invoicesCount")}
                hasActiveFilters={hasInvoiceFilters}
                onClear={clearInvoiceFilters}
                clearLabel={t("common.clearFilters")}
                groups={[
                  {
                    key: "status",
                    variant: "segmented",
                    value: selectedStatus,
                    onChange: setSelectedStatus,
                    options: [
                      { value: "All", label: t("billing.statusAll"), count: invoiceStatusCounts.All },
                      { value: "Open", label: t("billing.statusOpen"), count: invoiceStatusCounts.Open, dot: "bg-amber-500" },
                      { value: "Partial", label: t("billing.statusPartial"), count: invoiceStatusCounts.Partial, dot: "bg-blue-500" },
                      { value: "Paid", label: t("billing.statusPaid"), count: invoiceStatusCounts.Paid, dot: "bg-emerald-500" },
                      { value: "Cancelled", label: "Cancelled", count: invoiceStatusCounts.Cancelled, dot: "bg-gray-400" },
                    ],
                  },
                ]}
              />

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {list.loading && invoices.length === 0 ? (
                  <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100" />)}</div>
                ) : invoices.length === 0 ? (
                  <EmptyState icon={FaFileInvoiceDollar} title={t("billing.noInvoices")} description={t("billing.noInvoicesDesc")} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50/80 border-b border-gray-200">
                        <tr>
                          {["Bill", t("billing.colPatient"), t("billing.colDate"), "Due", t("billing.colProcedures"), MONEY_WORD.billTotal, MONEY_WORD.paid, MONEY_WORD.unpaid, t("billing.colStatus")].map((h) => (
                            <th key={h} className="px-5 py-3 text-start text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 stagger">
                        {invoices.map((inv) => (
                          <tr
                            key={inv.id}
                            tabIndex={0}
                            aria-label={`Open the money page of ${inv.patient.users.first_name} ${inv.patient.users.last_name} on ${inv.invoice_number}`}
                            onClick={() => openPatient(inv)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openPatient(inv);
                              }
                            }}
                            className="cursor-pointer transition-colors hover:bg-brand-50/60 focus-visible:bg-brand-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400"
                          >
                            <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">{inv.invoice_number}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar name={`${inv.patient.users.first_name} ${inv.patient.users.last_name}`} size="sm" />
                                <span className="font-medium text-gray-900">
                                  {inv.patient.users.first_name} {inv.patient.users.last_name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateBeirut(inv.procedure_date)}</td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                              {formatDateBeirut(inv.due_date)}
                              {daysOverdue(inv) > 0 && (
                                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                  {daysOverdue(inv)}d overdue
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {inv.line_items.length} {inv.line_items.length !== 1 ? t("billing.items") : t("billing.item")}
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-900">${inv.total_amount.toFixed(2)}</td>
                            <td className="px-4 py-3 font-medium text-green-700">${inv.amount_paid.toFixed(2)}</td>
                            <td className="px-4 py-3 font-medium text-red-600">${inv.remaining_amount.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={inv.status} />
                              {inv.replaced_by && (
                                <span className="mt-1 block text-[11px] text-brand-700">
                                  {MONEY_WORD.replacedBy} {inv.replaced_by.invoice_number}
                                </span>
                              )}
                              {inv.replaces && (
                                <span className="mt-1 block text-[11px] text-ink-500">
                                  {MONEY_WORD.replaces.toLowerCase()} {inv.replaces.invoice_number}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <ShowMore shown={invoices.length} total={list.total} loading={list.loadingMore} onClick={list.loadMore} />
              </div>
            </>
          )}
        </main>
      </div>

      {/* New bill for a patient not yet chosen: the builder asks who first. */}
      <NewInvoiceModal
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        patients={patients}
        onCreated={handleInvoiceCreated}
      />
    </div>
  );
}

/** A clinic figure, or a dash while /billing/kpis has not answered. */
function clinicMoney(value: number | undefined): string {
  return value === undefined ? "—" : `$${value.toFixed(2)}`;
}
