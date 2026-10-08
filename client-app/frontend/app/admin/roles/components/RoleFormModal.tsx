"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import { useTranslation } from "@/lib/i18n";
import type { Role } from "@/lib/api/roles";

type Props = {
  isOpen: boolean;
  /** When set, the modal renames this role; otherwise it creates a new one. */
  role: Role | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: { key?: string; name: string; description: string }) => Promise<void>;
};

/** Lower-case letters, digits, `-` and `_`; must start with a letter (mirrors the API rule). */
const KEY_PATTERN = /^[a-z][a-z0-9_-]{1,39}$/;

/** Suggest a key from the display name: "Dental Hygienist" → "dental-hygienist". */
const keyFromName = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Create a custom role, or rename an existing one. Permissions are edited in the matrix. */
export function RoleFormModal({ isOpen, role, saving, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setName(role?.name ?? "");
    setKey(role?.key ?? "");
    setKeyTouched(!!role);
    setDescription(role?.description ?? "");
  }, [isOpen, role]);

  const creating = role === null;
  const keyValid = !creating || KEY_PATTERN.test(key);
  const valid = name.trim().length >= 2 && keyValid;

  const changeName = (value: string) => {
    setName(value);
    if (creating && !keyTouched) setKey(keyFromName(value));
  };

  const submit = () =>
    onSubmit({
      key: creating ? key : undefined,
      name: name.trim(),
      description: description.trim(),
    });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={creating ? t("roles.newRole") : t("roles.editRole")}
      description={creating ? t("roles.newRoleHint") : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!valid || saving}>
            {saving ? t("common.loading") : creating ? t("roles.create") : t("common.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label={t("roles.name")} required>
          <input
            type="text"
            className={inputClass}
            value={name}
            maxLength={60}
            onChange={(e) => changeName(e.target.value)}
            placeholder={t("roles.namePlaceholder")}
          />
        </FormField>
        {creating && (
          <FormField
            label={t("roles.key")}
            required
            hint={t("roles.keyHint")}
            error={key && !keyValid ? t("roles.keyInvalid") : undefined}
          >
            <input
              type="text"
              className={`${inputClass} font-mono`}
              value={key}
              maxLength={40}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value.toLowerCase());
              }}
            />
          </FormField>
        )}
        <FormField label={t("roles.description")}>
          <textarea
            className={`${inputClass} min-h-20`}
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
