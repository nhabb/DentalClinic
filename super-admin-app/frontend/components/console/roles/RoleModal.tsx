"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorNote } from "@/components/console/ErrorNote";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { ApiError, patch, post } from "@/lib/api";
import type { PermissionGroup, Role } from "@/lib/types";

/** Create a custom role or edit one; admin's permissions are fixed, patient's are none. */
export function RoleModal({
  organizationId,
  role,
  catalog,
  isOpen,
  onClose,
  onSaved,
}: {
  organizationId: string;
  /** null = create a new role */
  role: Role | null;
  catalog: PermissionGroup[];
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ key: "", name: "", description: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const permissionsLocked = role?.locked ?? false;

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setForm({ key: role?.key ?? "", name: role?.name ?? "", description: role?.description ?? "" });
    setSelected(new Set(role?.permissions ?? []));
  }, [isOpen, role]);

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleGroup = (group: PermissionGroup, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const p of group.permissions) {
        if (on) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const permissions = [...selected];
      if (role) {
        await patch(`/organizations/${organizationId}/roles/${role.key}`, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          ...(permissionsLocked ? {} : { permissions }),
        });
        toast.success(`Role "${form.name.trim()}" saved`);
      } else {
        await post(`/organizations/${organizationId}/roles`, {
          key: form.key.trim().toLowerCase(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          permissions,
        });
        toast.success(`Role "${form.name.trim()}" created`);
      }
      onSaved();
      onClose();
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
      title={role ? `Edit role: ${role.name}` : "New role"}
      maxWidth="max-w-3xl"
      description={
        role?.key === "admin"
          ? "The administrator role always holds every permission; only its name can change."
          : role?.key === "patient"
            ? "Patients are governed by ownership of their own data, not by permissions."
            : "Tick what this role may do. Changes reach the clinic app within a minute."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="role-form" disabled={busy}>
            {busy ? "Saving…" : role ? "Save" : "Create role"}
          </Button>
        </div>
      }
    >
      <form id="role-form" onSubmit={submit} className="space-y-5">
        {error && <ErrorNote message={error} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!role && (
            <FormField label="Key" required hint="Lowercase, e.g. hygienist. Cannot change later.">
              <Input
                required
                pattern="[a-z][a-z0-9_-]{1,39}"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="hygienist"
              />
            </FormField>
          )}
          <FormField label="Name" required>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Description" className={role ? "" : "sm:col-span-2"}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
        </div>

        {!permissionsLocked && (
          <div className="space-y-4">
            {catalog.map((group) => {
              const all = group.permissions.every((p) => selected.has(p.key));
              return (
                <fieldset key={group.key} className="rounded-xl border border-ink-200 p-4">
                  <legend className="flex items-center gap-3 px-1 text-sm font-semibold text-ink-900">
                    {group.label}
                    <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => toggleGroup(group, !all)}>
                      {all ? "Clear" : "Select all"}
                    </button>
                  </legend>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.permissions.map((p) => (
                      <label key={p.key} className="flex items-start gap-2 text-sm text-ink-800">
                        <input
                          type="checkbox"
                          checked={selected.has(p.key)}
                          onChange={() => toggle(p.key)}
                          className="mt-0.5 h-4 w-4 rounded border-ink-300"
                        />
                        <span>
                          {p.label}
                          <span className="block text-xs text-ink-400">{p.key}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        )}
      </form>
    </Modal>
  );
}
