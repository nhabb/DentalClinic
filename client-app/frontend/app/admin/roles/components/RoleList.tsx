"use client";

import { FaLock, FaUserShield, FaUsers } from "react-icons/fa";
import { Badge } from "@/components/ui/Badge";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/api/roles";

type Props = {
  roles: Role[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

/** The clinic's roles as a selectable list; the matrix beside it edits the selected one. */
export function RoleList({ roles, selectedKey, onSelect }: Props) {
  const { t } = useTranslation();

  return (
    <ul className="space-y-1.5" aria-label={t("roles.tabRoles")}>
      {roles.map((role) => {
        const selected = role.key === selectedKey;
        return (
          <li key={role.key}>
            <button
              type="button"
              onClick={() => onSelect(role.key)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-start transition-colors",
                selected
                  ? "border-brand-300 bg-brand-50"
                  : "border-transparent hover:border-ink-200 hover:bg-ink-50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                  selected ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500",
                )}
              >
                {role.locked ? <FaLock className="text-xs" /> : <FaUserShield className="text-sm" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-ink-900">{role.name}</span>
                  <Badge tone={role.is_system ? "neutral" : "brand"}>
                    {role.is_system ? t("roles.system") : t("roles.custom")}
                  </Badge>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                  <FaUsers className="text-[10px]" />
                  <span className="tabular-nums">{role.users_count}</span>
                  <span>{t("roles.usersLabel")}</span>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{role.permissions.length}</span>
                  <span>{t("roles.permissionsLabel")}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
