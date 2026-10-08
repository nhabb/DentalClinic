"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FaUsers } from "react-icons/fa";
import { PageHeader } from "@/components/console/PageHeader";
import { DataTable, type Column } from "@/components/console/DataTable";
import { ErrorNote } from "@/components/console/ErrorNote";
import { RoleBadge } from "@/components/console/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClass } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useApi } from "@/lib/useApi";
import type { Account, OrganizationSummary, Paged } from "@/lib/types";

/** Every account of every clinic; open one to manage it on its clinic page. */
export default function AccountsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [kind, setKind] = useState<"staff" | "patients" | "all">("staff");
  const [active, setActive] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({
    kind,
    page: String(page),
    limit: "50",
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(organizationId ? { organization_id: organizationId } : {}),
    ...(active ? { active } : {}),
  });
  const accounts = useApi<Paged<Account>>(`/accounts?${query}`);
  const clinics = useApi<OrganizationSummary[]>("/organizations");

  const columns: Column<Account>[] = [
    {
      key: "name",
      header: "Name",
      render: (a) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-ink-900">
            {a.first_name} {a.last_name}
          </span>
          <span className="block truncate text-xs text-ink-400">{a.email ?? a.phone ?? "no contact"}</span>
        </span>
      ),
    },
    { key: "clinic", header: "Clinic", render: (a) => <span className="text-ink-700">{a.organization.name}</span> },
    { key: "role", header: "Role", render: (a) => <RoleBadge role={a.role} /> },
    {
      key: "status",
      header: "Status",
      render: (a) =>
        !a.is_active ? (
          <Badge tone="brick" dot>Disabled</Badge>
        ) : a.must_set_password ? (
          <Badge tone="honey" dot>Awaiting password</Badge>
        ) : (
          <Badge tone="leaf" dot>Active</Badge>
        ),
    },
  ];

  const rows = accounts.data?.data ?? [];
  const meta = accounts.data?.meta;
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Accounts" subtitle="Everyone who can sign in to any clinic. Click a row to manage the account on its clinic page." />
      <main className="space-y-4">
        <Card>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="Search name, email or phone" value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} />
            <select value={organizationId} onChange={(e) => resetPage(setOrganizationId)(e.target.value)} className={inputClass}>
              <option value="">All clinics</option>
              {(clinics.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={kind} onChange={(e) => resetPage(setKind)(e.target.value as typeof kind)} className={inputClass}>
              <option value="staff">Staff</option>
              <option value="patients">Patients</option>
              <option value="all">Staff and patients</option>
            </select>
            <select value={active} onChange={(e) => resetPage(setActive)(e.target.value as typeof active)} className={inputClass}>
              <option value="">Enabled and disabled</option>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
          {accounts.error && (
            <div className="px-5 pb-4">
              <ErrorNote message={accounts.error} />
            </div>
          )}
          {accounts.loading && !accounts.data ? (
            <div className="p-8">
              <LoadingSpinner />
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(a) => a.id}
              onRowClick={(a) => router.push(`/organizations/${a.organization_id}?tab=accounts`)}
              empty={<EmptyState icon={FaUsers} title="No accounts match" />}
            />
          )}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 text-sm text-ink-500">
              <span>
                Page {meta.page} of {meta.totalPages} · {meta.total} accounts
              </span>
              <span className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="ghost" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </span>
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
