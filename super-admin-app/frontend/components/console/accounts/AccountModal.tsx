"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorNote } from "@/components/console/ErrorNote";
import { Button } from "@/components/ui/button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { ApiError, patch } from "@/lib/api";
import type { Account, Branch, Role } from "@/lib/types";

/** Edit one account: contact details for everyone; role, branch and restriction for staff. */
export function AccountModal({
  account,
  roles,
  branches,
  isOpen,
  onClose,
  onSaved,
}: {
  account: Account | null;
  roles: Role[];
  branches: Branch[];
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isPatient = account?.role === "patient";
  const staffRoles = roles.filter((r) => r.key !== "patient");
  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!isOpen || !account) return;
    setError("");
    setForm({
      first_name: account.first_name,
      last_name: account.last_name,
      email: account.email ?? "",
      phone: account.phone ?? "",
      role: account.role,
      branch_id: account.branch_id ?? "",
      restrict_to_branch: account.restrict_to_branch,
      is_active: account.is_active,
    });
  }, [isOpen, account]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setBusy(true);
    setError("");
    try {
      await patch(`/organizations/${account.organization_id}/accounts/${account.id}`, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone,
        is_active: form.is_active,
        ...(isPatient
          ? {}
          : {
              role: form.role,
              branch_id: form.branch_id ? Number(form.branch_id) : null,
              restrict_to_branch: form.restrict_to_branch,
            }),
      });
      toast.success("Account saved");
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
      title={account ? `Edit ${account.first_name} ${account.last_name}` : "Edit account"}
      description={isPatient ? "Patient account: contact details and access only." : "Changes reach the clinic app within a minute."}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-account" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <form id="edit-account" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <ErrorNote message={error} />
          </div>
        )}
        <FormField label="First name" required>
          <Input required value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
        </FormField>
        <FormField label="Last name" required>
          <Input required value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
        </FormField>
        <FormField label="Email" required>
          <Input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
        </FormField>
        <FormField label="Phone">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </FormField>

        {!isPatient && (
          <>
            <FormField label="Role" required>
              <select value={form.role} onChange={(e) => set("role", e.target.value)} className={inputClass}>
                {staffRoles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name} ({r.key})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Home branch" hint="Where their new slots, stock and invoices land by default.">
              <select value={form.branch_id} onChange={(e) => set("branch_id", e.target.value)} className={inputClass}>
                <option value="">No home branch</option>
                {branches
                  .filter((b) => b.is_active || b.id === form.branch_id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <label className="flex items-center gap-3 text-sm text-ink-800 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.restrict_to_branch}
                disabled={!form.branch_id || form.role === "admin"}
                onChange={(e) => set("restrict_to_branch", e.target.checked)}
                className="h-4 w-4 rounded border-ink-300"
              />
              <span>
                Restrict to the home branch
                <span className="block text-xs text-ink-400">
                  They only see that branch&apos;s appointments, stock and invoices. Not available for administrators.
                </span>
              </span>
            </label>
          </>
        )}

        <label className="flex items-center gap-3 text-sm text-ink-800 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set("is_active", e.target.checked)}
            className="h-4 w-4 rounded border-ink-300"
          />
          <span>
            Account enabled
            <span className="block text-xs text-ink-400">A disabled account cannot sign in; its data stays.</span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  role: "",
  branch_id: "",
  restrict_to_branch: false,
  is_active: true,
};
