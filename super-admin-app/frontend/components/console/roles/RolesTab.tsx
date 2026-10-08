"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FaPen, FaPlus, FaTrash, FaUserShield } from "react-icons/fa";
import { DataTable, type Column } from "@/components/console/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Modal } from "@/components/ui/Modal";
import { ApiError, del } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { OrganizationDetail, PermissionGroup, Role } from "@/lib/types";
import { RoleModal } from "./RoleModal";

/** The clinic's roles and what each may do. */
export function RolesTab({ org }: { org: OrganizationDetail }) {
  const roles = useApi<Role[]>(`/organizations/${org.id}/roles`);
  const catalog = useApi<PermissionGroup[]>("/permissions");
  const [editing, setEditing] = useState<Role | null | "new">(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const total = catalog.data?.reduce((n, g) => n + g.permissions.length, 0) ?? 0;

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await del(`/organizations/${org.id}/roles/${deleting.key}`);
      toast.success(`Role "${deleting.name}" deleted`);
      setDeleting(null);
      void roles.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Role>[] = [
    {
      key: "name",
      header: "Role",
      render: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-ink-900">
            {r.name} <span className="font-normal text-ink-400">({r.key})</span>
          </span>
          {r.description && <span className="block truncate text-xs text-ink-400">{r.description}</span>}
        </span>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      render: (r) => (r.is_system ? <Badge tone="neutral">Built-in</Badge> : <Badge tone="brand">Custom</Badge>),
    },
    {
      key: "permissions",
      header: "Permissions",
      render: (r) =>
        r.key === "patient" ? (
          <span className="text-ink-500">Own data only</span>
        ) : (
          <span className="text-ink-700">
            {r.permissions.length} of {total}
            {r.key === "admin" && <span className="ms-1 text-xs text-ink-400">(all, locked)</span>}
          </span>
        ),
    },
    { key: "users", header: "Users", render: (r) => <span className="text-ink-700">{r.users_count}</span> },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (r) => (
        <span className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(r)} title="Edit role">
            <FaPen /> Edit
          </Button>
          {!r.is_system && (
            <Button variant="ghost" size="sm" disabled={r.users_count > 0} onClick={() => setDeleting(r)} title={r.users_count > 0 ? "Reassign its users first" : "Delete role"}>
              <FaTrash /> Delete
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Roles and permissions"
          subtitle="What each role in this clinic may do. Admin always has everything; patients only their own data."
          icon={<FaUserShield />}
          action={
            <Button size="sm" onClick={() => setEditing("new")} disabled={!catalog.data}>
              <FaPlus /> New role
            </Button>
          }
        />
        {roles.loading && !roles.data ? (
          <div className="p-8">
            <LoadingSpinner />
          </div>
        ) : (
          <DataTable columns={columns} rows={roles.data ?? []} rowKey={(r) => r.key} empty={<EmptyState icon={FaUserShield} title="No roles" />} />
        )}
      </Card>

      <RoleModal
        organizationId={org.id}
        role={editing === "new" ? null : editing}
        catalog={catalog.data ?? []}
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => void roles.reload()}
      />

      <Modal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete role "${deleting?.name ?? ""}"?`}
        description="Only unused custom roles can be deleted. This cannot be undone."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-700">The role and its permission list will be removed from this clinic.</p>
      </Modal>
    </div>
  );
}
