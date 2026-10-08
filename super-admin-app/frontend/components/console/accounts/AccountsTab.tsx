"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FaKey, FaPen, FaPlus, FaUserMd, FaUsers } from "react-icons/fa";
import { DataTable, type Column } from "@/components/console/DataTable";
import { InviteLinkCard } from "@/components/console/InviteLinkCard";
import { RoleBadge } from "@/components/console/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Tabs } from "@/components/ui/Tabs";
import { ApiError, post } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { Account, Invite, OrganizationDetail, Paged, PasswordResetResult, Role } from "@/lib/types";
import { AccountModal } from "./AccountModal";
import { AddStaffModal } from "./AddStaffModal";

type Kind = "staff" | "patients";

/** Every account of one clinic: list, edit, disable, add staff, send a password link. */
export function AccountsTab({ org, onChanged }: { org: OrganizationDetail; onChanged: () => void }) {
  const [kind, setKind] = useState<Kind>("staff");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);
  const [invite, setInvite] = useState<{ invite: Invite; recipient: string } | null>(null);

  const query = new URLSearchParams({ kind, page: String(page), limit: "25", ...(search.trim() ? { search: search.trim() } : {}) });
  const accounts = useApi<Paged<Account>>(`/organizations/${org.id}/accounts?${query}`);
  const roles = useApi<Role[]>(`/organizations/${org.id}/roles`);

  const reload = () => {
    void accounts.reload();
    onChanged();
  };

  const sendReset = async (a: Account) => {
    try {
      const result = await post<PasswordResetResult>(`/organizations/${org.id}/accounts/${a.id}/password-reset`);
      setInvite({ invite: result.invite, recipient: `${a.first_name} ${a.last_name}` });
      toast.success(result.emailed ? `Password link emailed to ${a.email}` : "Password link issued; email is not configured, copy it below");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Request failed");
    }
  };

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
    { key: "role", header: "Role", render: (a) => <RoleBadge role={a.role} /> },
    ...(kind === "staff"
      ? [
          {
            key: "branch",
            header: "Branch",
            render: (a: Account) => (
              <span className="text-ink-700">
                {a.branch?.name ?? "All branches"}
                {a.restrict_to_branch && <span className="ms-1 text-xs text-ink-400">(restricted)</span>}
              </span>
            ),
          } satisfies Column<Account>,
        ]
      : []),
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
    {
      key: "actions",
      header: "",
      align: "end",
      render: (a) => (
        <span className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(a)} title="Edit account">
            <FaPen /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => sendReset(a)} title="Issue a new set-password link (resets the password)">
            <FaKey /> Reset password
          </Button>
        </span>
      ),
    },
  ];

  const rows = accounts.data?.data ?? [];
  const meta = accounts.data?.meta;

  return (
    <div className="space-y-4">
      {invite && <InviteLinkCard invite={invite.invite} recipient={invite.recipient} />}
      <Card>
        <CardHeader
          title="Accounts"
          subtitle="Everyone who can sign in to this clinic"
          icon={kind === "staff" ? <FaUserMd /> : <FaUsers />}
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              <FaPlus /> Add staff
            </Button>
          }
        />
        <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            label="Account kind"
            variant="pill"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setPage(1);
            }}
            items={[
              { id: "staff", label: "Staff" },
              { id: "patients", label: "Patients" },
            ]}
          />
          <Input
            placeholder="Search name, email or phone"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="sm:max-w-xs"
          />
        </div>
        {accounts.loading && !accounts.data ? (
          <div className="p-8">
            <LoadingSpinner />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(a) => a.id}
            empty={<EmptyState icon={kind === "staff" ? FaUserMd : FaUsers} title={search ? "No match" : kind === "staff" ? "No staff yet" : "No patients yet"} />}
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

      <AccountModal
        account={editing}
        roles={roles.data ?? []}
        branches={org.branches}
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
      <AddStaffModal
        organizationId={org.id}
        roles={roles.data ?? []}
        isOpen={adding}
        onClose={() => setAdding(false)}
        onCreated={(result) => {
          setInvite(result);
          reload();
        }}
      />
    </div>
  );
}
