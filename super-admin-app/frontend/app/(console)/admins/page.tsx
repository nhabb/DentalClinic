"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FaUserShield, FaPlus } from "react-icons/fa";
import { PageHeader } from "@/components/console/PageHeader";
import { DataTable, type Column } from "@/components/console/DataTable";
import { ErrorNote } from "@/components/console/ErrorNote";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useApi } from "@/lib/useApi";
import { ApiError, patch, post } from "@/lib/api";
import { session } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { PlatformAdmin } from "@/lib/types";

export default function AdminsPage() {
  const { data, error, loading, reload } = useApi<PlatformAdmin[]>("/admins");
  const [adding, setAdding] = useState(false);
  const me = session.user();

  const setActive = async (admin: PlatformAdmin, isActive: boolean) => {
    try {
      await patch(`/admins/${admin.id}/active`, { is_active: isActive });
      toast.success(isActive ? "Admin reactivated" : "Admin deactivated");
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Request failed");
    }
  };

  const columns: Column<PlatformAdmin>[] = [
    {
      key: "name",
      header: "Admin",
      render: (a) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-ink-900">
            {a.first_name} {a.last_name} {a.id === me?.id && <span className="text-xs font-normal text-ink-400">(you)</span>}
          </span>
          <span className="block truncate text-xs text-ink-400">{a.email}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", render: (a) => <Badge tone={a.is_active ? "leaf" : "brick"} dot>{a.is_active ? "Active" : "Disabled"}</Badge> },
    { key: "since", header: "Since", render: (a) => <span className="text-ink-500">{formatDate(a.created_at)}</span> },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (a) =>
        a.id === me?.id ? null : (
          <Button variant={a.is_active ? "ghost" : "soft"} size="sm" onClick={() => setActive(a, !a.is_active)}>
            {a.is_active ? "Deactivate" : "Reactivate"}
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Platform admins"
        subtitle="People who can sign in to this console"
        actions={
          <Button onClick={() => setAdding(true)}>
            <FaPlus /> Add admin
          </Button>
        }
      />
      <main className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
        {error && <ErrorNote message={error} />}
        <Card>
          {loading && !data ? (
            <SkeletonRows rows={3} />
          ) : (
            <DataTable columns={columns} rows={data ?? []} rowKey={(a) => a.id} empty={<EmptyState icon={FaUserShield} title="No admins" />} />
          )}
        </Card>
      </main>
      <AddAdminModal isOpen={adding} onClose={() => setAdding(false)} onCreated={reload} />
    </>
  );
}

function AddAdminModal({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/admins", form);
      toast.success("Platform admin created");
      setForm({ first_name: "", last_name: "", email: "", password: "" });
      onClose();
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add platform admin"
      description="Platform admins see and manage every clinic. Share the password over a safe channel."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-admin" disabled={busy}>
            {busy ? "Creating…" : "Create admin"}
          </Button>
        </div>
      }
    >
      <form id="add-admin" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <ErrorNote message={error} />
          </div>
        )}
        <FormField label="First name" required>
          <Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
        </FormField>
        <FormField label="Last name" required>
          <Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
        </FormField>
        <FormField label="Email" required className="sm:col-span-2">
          <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
        <FormField label="Password" required hint="At least 8 characters with upper and lower case letters and a digit" className="sm:col-span-2">
          <Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </FormField>
      </form>
    </Modal>
  );
}
