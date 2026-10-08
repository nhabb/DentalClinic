"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorNote } from "@/components/console/ErrorNote";
import { Button } from "@/components/ui/button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { ApiError, post } from "@/lib/api";
import type { Invite, Role } from "@/lib/types";

const empty = { first_name: "", last_name: "", email: "", phone: "", role: "admin" };

/** Creates a staff account; the person receives a link to set their password in the clinic app. */
export function AddStaffModal({
  organizationId,
  roles,
  isOpen,
  onClose,
  onCreated,
}: {
  organizationId: string;
  roles: Role[];
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result: { invite: Invite; recipient: string }) => void;
}) {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const staffRoles = roles.filter((r) => r.key !== "patient");

  useEffect(() => {
    if (isOpen) {
      setError("");
      setForm(empty);
    }
  }, [isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await post<{ invite: Invite; first_name: string; last_name: string; email: string }>(
        `/organizations/${organizationId}/staff`,
        { ...form, phone: form.phone.trim() || undefined },
      );
      onCreated({ invite: created.invite, recipient: `${created.first_name} ${created.last_name} (${created.email})` });
      onClose();
      toast.success("Staff account created");
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
      title="Add staff"
      description="They receive a link to set their password in the clinic app."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-staff" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </div>
      }
    >
      <form id="add-staff" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <FormField label="Email" required>
          <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
        <FormField label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </FormField>
        <FormField label="Role" className="sm:col-span-2" hint="Roles come from the clinic's own list; edit them on the Roles tab.">
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputClass}>
            {staffRoles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} ({r.key})
              </option>
            ))}
          </select>
        </FormField>
      </form>
    </Modal>
  );
}
