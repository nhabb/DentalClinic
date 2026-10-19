"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { useTranslation } from "@/lib/i18n";
import { PATIENT_ROLE_KEY, type Role, type StaffCreated, type StaffInput } from "@/lib/api/roles";
import { InviteLinkModal } from "./InviteLinkModal";

type Props = {
  isOpen: boolean;
  roles: Role[];
  saving: boolean;
  onClose: () => void;
  /** Resolves with the created account, or null when the request failed (the page already toasted). */
  onSubmit: (input: StaffInput) => Promise<StaffCreated | null>;
};

const empty: StaffInput = { first_name: "", last_name: "", email: "", phone: "", role: "" };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add a staff member to the clinic. The account starts without a usable
 * password: the person gets a one-time set-password link, emailed when the
 * server has SMTP configured and otherwise shown here to copy and send.
 */
export function AddStaffModal({ isOpen, roles, saving, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const staffRoles = roles.filter((r) => r.key !== PATIENT_ROLE_KEY);
  const [form, setForm] = useState<StaffInput>(empty);
  const [created, setCreated] = useState<StaffCreated | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const staff = roles.filter((r) => r.key !== PATIENT_ROLE_KEY);
    setForm({ ...empty, role: staff.find((r) => r.key !== "admin")?.key ?? staff[0]?.key ?? "" });
    setCreated(null);
  }, [isOpen, roles]);

  const valid =
    form.first_name.trim().length > 0 &&
    form.last_name.trim().length > 0 &&
    EMAIL_PATTERN.test(form.email.trim()) &&
    form.role.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    const result = await onSubmit({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      phone: form.phone?.trim() || undefined,
      role: form.role,
    });
    if (result) setCreated(result);
  };

  const field = (key: keyof StaffInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  if (created) {
    const { user, invite } = created;
    return (
      <InviteLinkModal
        isOpen={isOpen}
        title={t("roles.staffCreated")}
        description={`${user.first_name} ${user.last_name} (${user.email})`}
        invite={invite}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("roles.addStaff")}
      description={t("roles.addStaffHint")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="add-staff-form" disabled={!valid || saving}>
            {saving ? t("common.creating") : t("roles.createAccount")}
          </Button>
        </div>
      }
    >
      <form id="add-staff-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t("roles.firstName")} required>
          <input
            type="text"
            className={inputClass}
            required
            maxLength={60}
            value={form.first_name}
            onChange={field("first_name")}
          />
        </FormField>
        <FormField label={t("roles.lastName")} required>
          <input
            type="text"
            className={inputClass}
            required
            maxLength={60}
            value={form.last_name}
            onChange={field("last_name")}
          />
        </FormField>
        <FormField label={t("roles.email")} required>
          <input type="email" className={inputClass} required value={form.email} onChange={field("email")} />
        </FormField>
        <FormField label={t("roles.phone")}>
          <input type="tel" className={inputClass} value={form.phone ?? ""} onChange={field("phone")} />
        </FormField>
        <FormField label={t("roles.role")} required className="sm:col-span-2" hint={t("roles.roleHint")}>
          <select className={inputClass} value={form.role} onChange={field("role")}>
            {staffRoles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </FormField>
      </form>
    </Modal>
  );
}
