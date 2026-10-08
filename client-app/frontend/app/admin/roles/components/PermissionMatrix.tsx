"use client";

import { useEffect, useMemo, useState } from "react";
import { FaLock, FaPen, FaTrash } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PermissionGroup, Role } from "@/lib/api/roles";

type Props = {
  role: Role;
  catalog: PermissionGroup[];
  /** Whether the viewer holds `roles:manage`; otherwise the matrix is read-only. */
  canManage: boolean;
  saving: boolean;
  onSave: (permissions: string[]) => Promise<void>;
  onEditDetails: () => void;
  onDelete: () => void;
};

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((key) => b.includes(key));

/**
 * The permissions of one role, grouped by area, as a checkbox grid. Changes are
 * held locally until "Save" so an admin can review the whole set before it
 * takes effect for everyone holding the role.
 */
export function PermissionMatrix({
  role,
  catalog,
  canManage,
  saving,
  onSave,
  onEditDetails,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(role.permissions);

  // Switching roles (or a save landing) resets the draft to what the server holds.
  useEffect(() => setSelected(role.permissions), [role.key, role.permissions]);

  const editable = canManage && !role.locked;
  const dirty = useMemo(() => !sameSet(selected, role.permissions), [selected, role.permissions]);
  const deletable = canManage && !role.is_system && role.users_count === 0;

  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  const setGroup = (group: PermissionGroup, on: boolean) => {
    const keys = group.permissions.map((p) => p.key);
    setSelected((current) =>
      on ? Array.from(new Set([...current, ...keys])) : current.filter((k) => !keys.includes(k)),
    );
  };

  return (
    <section aria-labelledby="role-heading" className="flex h-full flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
        <div className="min-w-0">
          <h2 id="role-heading" className="font-display text-lg font-bold text-ink-900">
            {role.name}
            <span className="ms-2 font-mono text-xs font-normal text-ink-400">{role.key}</span>
          </h2>
          <p className="mt-0.5 text-sm text-ink-500">{role.description || t("roles.noDescription")}</p>
          {role.locked && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-honey-50 px-2.5 py-1 text-xs font-medium text-honey-800">
              <FaLock className="text-[10px]" /> {t("roles.lockedHint")}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            {!role.is_system && (
              <Button variant="outline" size="sm" onClick={onEditDetails}>
                <FaPen /> {t("roles.editDetails")}
              </Button>
            )}
            {deletable && (
              <Button variant="outline" size="sm" className="text-brick-700" onClick={onDelete}>
                <FaTrash /> {t("common.delete")}
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 space-y-5 overflow-auto px-5 py-4">
        {catalog.map((group) => {
          const keys = group.permissions.map((p) => p.key);
          const checked = keys.filter((k) => selected.includes(k)).length;
          return (
            <fieldset key={group.key} disabled={!editable} className="min-w-0">
              <legend className="flex w-full items-center justify-between gap-3 pb-2">
                <span className="text-sm font-semibold text-ink-800">{group.label}</span>
                {editable && (
                  <button
                    type="button"
                    onClick={() => setGroup(group, checked < keys.length)}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    {checked < keys.length ? t("roles.selectAll") : t("roles.clearAll")}
                  </button>
                )}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.permissions.map((permission) => {
                  const on = selected.includes(permission.key);
                  return (
                    <label
                      key={permission.key}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                        on ? "border-brand-200 bg-brand-50/60" : "border-ink-200 bg-card",
                        !editable && "cursor-default opacity-80",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-brand-600"
                        checked={on}
                        onChange={() => toggle(permission.key)}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-ink-900">{permission.label}</span>
                        <span className="block font-mono text-[11px] text-ink-400">{permission.key}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      {editable && (
        <footer className="flex items-center justify-between gap-3 border-t border-ink-200 px-5 py-3">
          <span className="text-xs text-ink-500">
            {dirty ? t("roles.unsavedChanges") : t("roles.allSaved")}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => setSelected(role.permissions)}
            >
              {t("roles.discard")}
            </Button>
            <Button size="sm" disabled={!dirty || saving} onClick={() => onSave(selected)}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </footer>
      )}
    </section>
  );
}
