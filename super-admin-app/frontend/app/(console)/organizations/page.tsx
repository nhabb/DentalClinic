"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FaHospital, FaPlus, FaSearch } from "react-icons/fa";
import { PageHeader } from "@/components/console/PageHeader";
import { DataTable, type Column } from "@/components/console/DataTable";
import { ActiveBadge } from "@/components/console/StatusBadge";
import { ErrorNote } from "@/components/console/ErrorNote";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useApi } from "@/lib/useApi";
import { formatDate, formatMoney, formatNumber, timeAgo } from "@/lib/format";
import type { OrganizationSummary } from "@/lib/types";

type Filter = "all" | "active" | "suspended";

export default function ClinicsPage() {
  const router = useRouter();
  const { data, error, loading } = useApi<OrganizationSummary[]>("/organizations");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((o) => {
      if (filter === "active" && !o.is_active) return false;
      if (filter === "suspended" && o.is_active) return false;
      return !q || o.name.toLowerCase().includes(q) || o.slug.includes(q);
    });
  }, [data, query, filter]);

  const counts = {
    all: data?.length ?? 0,
    active: data?.filter((o) => o.is_active).length ?? 0,
    suspended: data?.filter((o) => !o.is_active).length ?? 0,
  };

  const columns: Column<OrganizationSummary>[] = [
    {
      key: "name",
      header: "Clinic",
      render: (o) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-ink-900">{o.name}</span>
          <span className="block truncate text-xs text-ink-400">{o.slug}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", render: (o) => <ActiveBadge active={o.is_active} /> },
    { key: "branches", header: "Branches", align: "end", render: (o) => formatNumber(o.branches) },
    { key: "staff", header: "Staff", align: "end", render: (o) => formatNumber(o.staff) },
    { key: "patients", header: "Patients", align: "end", render: (o) => formatNumber(o.patients) },
    { key: "appointments", header: "Appointments", align: "end", render: (o) => formatNumber(o.appointments) },
    { key: "revenue", header: "Collected", align: "end", render: (o) => formatMoney(o.revenue_collected) },
    { key: "activity", header: "Last activity", align: "end", render: (o) => <span className="text-ink-500">{timeAgo(o.last_activity_at)}</span> },
    { key: "since", header: "Since", align: "end", render: (o) => <span className="text-ink-500">{formatDate(o.created_at)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Clinics"
        subtitle={data ? `${counts.active} active · ${counts.suspended} suspended` : undefined}
        actions={
          <Link href="/organizations/new">
            <Button>
              <FaPlus /> Onboard clinic
            </Button>
          </Link>
        }
      />
      <main className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
        {error && <ErrorNote message={error} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            label="Clinic status"
            variant="pill"
            value={filter}
            onChange={setFilter}
            items={[
              { id: "all", label: "All", count: counts.all },
              { id: "active", label: "Active", count: counts.active },
              { id: "suspended", label: "Suspended", count: counts.suspended },
            ]}
          />
          <label className="relative block w-full sm:w-72">
            <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input placeholder="Search by name or slug" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
          </label>
        </div>

        <Card>
          {loading && !data ? (
            <SkeletonRows rows={6} />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(o) => o.id}
              onRowClick={(o) => router.push(`/organizations/${o.id}`)}
              empty={
                <EmptyState
                  icon={FaHospital}
                  title={query ? "No clinic matches" : "No clinics yet"}
                  description={query ? "Try another name or slug." : "Onboard the first clinic to see it here."}
                  action={
                    !query && (
                      <Link href="/organizations/new">
                        <Button>Onboard clinic</Button>
                      </Link>
                    )
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
