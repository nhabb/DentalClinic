"use client";

import { FaUserSlash } from "react-icons/fa";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/lib/i18n";
import { inputClass } from "@/components/ui/FormField";
import { PATIENT_ROLE_KEY, type Role, type StaffMember } from "@/lib/api/roles";

type Props = {
  staff: StaffMember[];
  roles: Role[];
  /** Whether the viewer holds `staff:manage`; otherwise roles are shown, not changed. */
  canAssign: boolean;
  /** The viewer's own user id: nobody may change their own role here. */
  selfId: string | null;
  busyUserId: string | null;
  onAssign: (user: StaffMember, role: string) => void;
};

/** Every staff account with its role, and a selector to move it to another role. */
export function StaffRolesTable({ staff, roles, canAssign, selfId, busyUserId, onAssign }: Props) {
  const { t } = useTranslation();
  const assignable = roles.filter((r) => r.key !== PATIENT_ROLE_KEY);
  const roleName = (key: string) => roles.find((r) => r.key === key)?.name ?? key;

  if (staff.length === 0) {
    return <EmptyState icon={FaUserSlash} title={t("roles.noStaff")} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-start text-xs uppercase tracking-wide text-ink-500">
            <th className="px-4 py-3 text-start font-semibold">{t("roles.member")}</th>
            <th className="px-4 py-3 text-start font-semibold">{t("roles.email")}</th>
            <th className="px-4 py-3 text-start font-semibold">{t("roles.role")}</th>
            <th className="px-4 py-3 text-start font-semibold">{t("roles.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {staff.map((member) => {
            const isSelf = member.id === selfId;
            const editable = canAssign && !isSelf;
            return (
              <tr key={member.id} className="hover:bg-ink-50/60">
                <td className="px-4 py-3 font-medium text-ink-900">
                  {member.first_name} {member.last_name}
                  {isSelf && <span className="ms-2 text-xs text-ink-400">({t("roles.you")})</span>}
                </td>
                <td className="px-4 py-3 text-ink-600">{member.email}</td>
                <td className="px-4 py-3">
                  {editable ? (
                    <select
                      aria-label={`${t("roles.changeRole")}: ${member.email}`}
                      className={`${inputClass} h-9 w-48 py-1`}
                      value={member.role}
                      disabled={busyUserId === member.id}
                      onChange={(e) => onAssign(member, e.target.value)}
                    >
                      {assignable.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-ink-800">{roleName(member.role)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={member.is_active ? "leaf" : "neutral"}>
                    {member.is_active ? t("roles.active") : t("roles.inactive")}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
