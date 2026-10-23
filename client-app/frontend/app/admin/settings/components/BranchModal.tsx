"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { createBranch, orNull, updateBranch, type Branch, type BranchInput } from "@/lib/api/settings";

const FIELDS = ["name", "code", "address", "city", "governate", "phone", "email", "opening_hours"] as const;
type Field = (typeof FIELDS)[number];

function formFrom(branch: Branch | null): Record<Field, string> {
  return Object.fromEntries(FIELDS.map((f) => [f, branch?.[f] ?? ""])) as Record<Field, string>;
}

/** Adds a branch, or edits one when `branch` is given. */
export function BranchModal({
  branch,
  onClose,
  onSaved,
}: {
  branch: Branch | null;
  onClose: () => void;
  onSaved: (branch: Branch) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => formFrom(branch));
  const [saving, setSaving] = useState(false);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // A new branch only sends what was filled in; an edit sends null to clear.
    const input = Object.fromEntries(
      FIELDS.map((f) => [f, f === "name" ? form.name.trim() : orNull(form[f])]).filter(
        ([, v]) => branch || v !== null,
      ),
    ) as BranchInput;
    try {
      const saved = branch ? await updateBranch(branch.id, input) : await createBranch(input);
      toast.success(t("settings.branchSaved"));
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={branch ? t("settings.editBranch") : t("settings.addBranch")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="branch-form" disabled={saving || !form.name.trim()}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      }
    >
      <form id="branch-form" onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t("settings.branchName")} required>
          <input className={inputClass} value={form.name} onChange={set("name")} maxLength={150} required />
        </FormField>
        <FormField label={t("settings.branchCode")} hint={t("settings.branchCodeHint")}>
          <input className={inputClass} value={form.code} onChange={set("code")} maxLength={20} />
        </FormField>
        <FormField label={t("settings.address")} className="sm:col-span-2">
          <input className={inputClass} value={form.address} onChange={set("address")} maxLength={500} />
        </FormField>
        <FormField label={t("settings.city")}>
          <input className={inputClass} value={form.city} onChange={set("city")} maxLength={100} />
        </FormField>
        <FormField label={t("settings.governate")}>
          <input className={inputClass} value={form.governate} onChange={set("governate")} maxLength={100} />
        </FormField>
        <FormField label={t("settings.phone")}>
          <input className={inputClass} type="tel" value={form.phone} onChange={set("phone")} maxLength={30} />
        </FormField>
        <FormField label={t("settings.email")}>
          <input className={inputClass} type="email" value={form.email} onChange={set("email")} maxLength={255} />
        </FormField>
        <FormField label={t("settings.openingHours")} hint={t("settings.openingHoursHint")} className="sm:col-span-2">
          <input className={inputClass} value={form.opening_hours} onChange={set("opening_hours")} maxLength={500} />
        </FormField>
      </form>
    </Modal>
  );
}
