"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaHospital, FaCodeBranch, FaUsers, FaUserMd, FaCalendarCheck, FaMoneyBillWave, FaPlus } from "react-icons/fa";
import { PageHeader } from "@/components/console/PageHeader";
import { DataTable, type Column } from "@/components/console/DataTable";
import { ActivityBars } from "@/components/console/ActivityBars";
import { ActiveBadge } from "@/components/console/StatusBadge";
import { ErrorNote } from "@/components/console/ErrorNote";
import { StatsCard } from "@/components/ui/StatsCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useApi } from "@/lib/useApi";
import { formatMoney, formatMoneyByCurrency, formatNumber, timeAgo } from "@/lib/format";
import type { OrganizationSummary, PlatformOverview } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const overview = useApi<PlatformOverview>("/dashboard");
  const clinics = useApi<OrganizationSummary[]>("/organizations");

  const byCurrency = overview.data?.revenue_by_currency ?? [];
  const thisMonth = formatMoneyByCurrency(byCurrency.map((r) => ({ currency: r.currency, amount: r.this_month })));
  const allTime = formatMoneyByCurrency(byCurrency.map((r) => ({ currency: r.currency, amount: r.all_time })));
  // The monthly series sums every clinic's payments, so it is only a money
  // figure when the platform bills in a single currency.
  const oneCurrency = byCurrency.length <= 1 ? (byCurrency[0]?.currency ?? "USD") : null;

  const recent = [...(clinics.data ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  const columns: Column<OrganizationSummary>[] = [
    { key: "name", header: "Clinic", render: (o) => <ClinicCell org={o} /> },
    { key: "status", header: "Status", render: (o) => <ActiveBadge active={o.is_active} /> },
    { key: "branches", header: "Branches", align: "end", render: (o) => formatNumber(o.branches) },
    { key: "patients", header: "Patients", align: "end", render: (o) => formatNumber(o.patients) },
    { key: "revenue", header: "Collected", align: "end", render: (o) => formatMoney(o.revenue_collected, o.currency) },
    { key: "activity", header: "Last activity", align: "end", render: (o) => <span className="text-ink-500">{timeAgo(o.last_activity_at)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Every clinic on the platform at a glance"
        actions={
          <Link href="/organizations/new">
            <Button>
              <FaPlus /> Onboard clinic
            </Button>
          </Link>
        }
      />

      <main className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        {overview.error && <ErrorNote message={overview.error} />}
        {overview.loading && !overview.data && <LoadingSpinner label="Loading platform numbers" />}

        {overview.data && (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatsCard
                icon={FaHospital}
                tone="brand"
                value={formatNumber(overview.data.organizations.active)}
                label="Active clinics"
                hint={`${overview.data.organizations.total} total · ${overview.data.organizations.new_this_month} new this month`}
              />
              <StatsCard icon={FaCodeBranch} tone="clay" value={formatNumber(overview.data.branches)} label="Branches" />
              <StatsCard
                icon={FaUsers}
                tone="leaf"
                value={formatNumber(overview.data.patients)}
                label="Patients"
                hint={`${formatNumber(overview.data.staff)} staff accounts`}
              />
              <StatsCard
                icon={FaMoneyBillWave}
                tone="honey"
                value={thisMonth}
                label="Collected this month"
                hint={`${allTime} all time`}
              />
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader title="Activity, last six months" subtitle="Across all clinics" icon={<FaCalendarCheck />} />
                <CardBody>
                  <ActivityBars
                    months={overview.data.monthly.map((m) => m.month)}
                    series={[
                      { label: "Appointments", barClass: "bg-brand-500", values: overview.data.monthly.map((m) => m.appointments) },
                      ...(oneCurrency
                        ? [{ label: "Collected", barClass: "bg-honey-400", values: overview.data.monthly.map((m) => m.collected), format: (n: number) => formatMoney(n, oneCurrency) }]
                        : []),
                      { label: "New clinics", barClass: "bg-clay-400", values: overview.data.monthly.map((m) => m.new_organizations) },
                    ]}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="This month" icon={<FaUserMd />} />
                <CardBody className="space-y-4">
                  <Metric label="Appointments booked" value={formatNumber(overview.data.appointments_this_month)} />
                  <Metric label="Payments collected" value={thisMonth} />
                  <Metric label="Clinics onboarded" value={formatNumber(overview.data.organizations.new_this_month)} />
                  <Metric label="Suspended clinics" value={formatNumber(overview.data.organizations.total - overview.data.organizations.active)} />
                </CardBody>
              </Card>
            </section>
          </>
        )}

        <Card>
          <CardHeader
            title="Recently onboarded"
            subtitle="Newest clinics first"
            action={
              <Link href="/organizations" className="text-sm font-semibold text-brand-700 hover:underline">
                All clinics
              </Link>
            }
          />
          {clinics.error ? (
            // Not "no clinics yet": the list could not be loaded at all.
            <div className="p-4">
              <ErrorNote message={clinics.error} />
            </div>
          ) : clinics.loading && !clinics.data ? (
            <LoadingSpinner className="h-40" />
          ) : (
            <DataTable
              columns={columns}
              rows={recent}
              rowKey={(o) => o.id}
              onRowClick={(o) => router.push(`/organizations/${o.id}`)}
              empty={
                <EmptyState
                  icon={FaHospital}
                  title="No clinics yet"
                  description="Onboard the first clinic to see it here."
                  action={
                    <Link href="/organizations/new">
                      <Button>Onboard clinic</Button>
                    </Link>
                  }
                />
              }
            />
          )}
        </Card>
      </main>
    </>
  );
}

function ClinicCell({ org }: { org: OrganizationSummary }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-semibold text-ink-900">{org.name}</span>
      <span className="block truncate text-xs text-ink-400">{org.slug}</span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-ink-600">{label}</span>
      <span className="text-lg font-bold tabular-nums text-ink-900">{value}</span>
    </div>
  );
}
