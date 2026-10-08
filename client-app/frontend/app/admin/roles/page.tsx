"use client";

// Roles & permissions admin page.
//
// The clinic's administrator decides what each role may do on the API. The
// catalog of permissions comes from the backend (it mirrors the endpoints), the
// roles and their permission sets are the clinic's own data. See lib/api/roles.ts
// for the contract.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FaShieldAlt } from "react-icons/fa";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import {
  assignStaffRole,
  createRole,
  deleteRole,
  fetchMe,
  fetchPermissionCatalog,
  fetchRoles,
  fetchStaff,
  updateRole,
  type Me,
  type PermissionGroup,
  type Role,
  type StaffMember,
} from "@/lib/api/roles";
import { RoleList } from "./components/RoleList";
import { PermissionMatrix } from "./components/PermissionMatrix";
import { RoleFormModal } from "./components/RoleFormModal";
import { StaffRolesTable } from "./components/StaffRolesTable";

type Tab = "roles" | "staff";

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function RolesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("roles");

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [catalog, setCatalog] = useState<PermissionGroup[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; role: Role | null }>({ open: false, role: null });

  const canManageRoles = me?.permissions.includes("roles:manage") ?? false;
  const canAssignStaff = me?.permissions.includes("staff:manage") ?? false;

  const loadAll = useCallback(async () => {
    try {
      const [viewer, groups, roleList, staffList] = await Promise.all([
        fetchMe(),
        fetchPermissionCatalog(),
        fetchRoles(),
        fetchStaff(),
      ]);
      setMe(viewer);
      setCatalog(groups);
      setRoles(roleList);
      setStaff(staffList);
      setSelectedKey((current) => current ?? roleList[0]?.key ?? null);
    } catch (e) {
      setForbidden(true);
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const refreshRoles = async () => setRoles(await fetchRoles());

  const handleLogout = () => {
    toast.success("Logged out.");
    ["adminAuth", "adminUser", "authToken", "userRole"].forEach((k) => safeStorage.removeItem(k));
    router.push("/login");
  };

  const savePermissions = async (permissions: string[]) => {
    if (!selectedKey) return;
    setSaving(true);
    try {
      const updated = await updateRole(selectedKey, { permissions });
      setRoles((list) => list.map((r) => (r.key === updated.key ? updated : r)));
      toast.success(t("roles.saved"));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const submitRoleForm = async (values: { key?: string; name: string; description: string }) => {
    setSaving(true);
    try {
      if (form.role) {
        const updated = await updateRole(form.role.key, {
          name: values.name,
          description: values.description,
        });
        setRoles((list) => list.map((r) => (r.key === updated.key ? updated : r)));
      } else {
        const created = await createRole({ ...values, key: values.key!, permissions: [] });
        setRoles((list) => [...list, created]);
        setSelectedKey(created.key);
      }
      setForm({ open: false, role: null });
      toast.success(form.role ? t("roles.saved") : t("roles.created"));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (role: Role) => {
    if (!window.confirm(`${t("roles.deleteConfirm")} "${role.name}"?`)) return;
    try {
      await deleteRole(role.key);
      setRoles((list) => list.filter((r) => r.key !== role.key));
      setSelectedKey(roles.find((r) => r.key !== role.key)?.key ?? null);
      toast.success(t("roles.deleted"));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const assignRole = async (member: StaffMember, roleKey: string) => {
    setBusyUserId(member.id);
    try {
      const updated = await assignStaffRole(member.id, roleKey);
      setStaff((list) => list.map((u) => (u.id === updated.id ? { ...u, role: updated.role } : u)));
      await refreshRoles();
      toast.success(t("roles.roleUpdated"));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyUserId(null);
    }
  };

  const selectedRole = roles.find((r) => r.key === selectedKey) ?? null;
  const tabs = [
    { id: "roles" as const, label: t("roles.tabRoles"), count: roles.length },
    { id: "staff" as const, label: t("roles.tabStaff"), count: staff.length },
  ];

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar
        activePage="roles"
        sidebarOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title={t("roles.title")}
          subtitle={t("roles.subtitle")}
          onAdd={canManageRoles ? () => setForm({ open: true, role: null }) : undefined}
          addLabel={t("roles.newRole")}
        />

        <main className="flex-1 overflow-auto p-4 sm:p-8">
          {loading ? (
            <LoadingSpinner label={t("common.loading")} />
          ) : forbidden ? (
            <EmptyState icon={FaShieldAlt} title={t("roles.forbiddenTitle")} description={t("roles.forbiddenHint")} />
          ) : (
            <>
              <Tabs items={tabs} value={tab} onChange={setTab} variant="pill" label={t("roles.title")} className="mb-5" />

              {tab === "roles" && (
                <div role="tabpanel" id="panel-roles" aria-labelledby="tab-roles" className="grid gap-5 lg:grid-cols-[18rem_1fr]">
                  <Card className="p-2">
                    <RoleList roles={roles} selectedKey={selectedKey} onSelect={setSelectedKey} />
                  </Card>
                  <Card className="min-h-[32rem]">
                    {selectedRole ? (
                      <PermissionMatrix
                        role={selectedRole}
                        catalog={catalog}
                        canManage={canManageRoles}
                        saving={saving}
                        onSave={savePermissions}
                        onEditDetails={() => setForm({ open: true, role: selectedRole })}
                        onDelete={() => removeRole(selectedRole)}
                      />
                    ) : (
                      <EmptyState icon={FaShieldAlt} title={t("roles.noRoles")} />
                    )}
                  </Card>
                </div>
              )}

              {tab === "staff" && (
                <div role="tabpanel" id="panel-staff" aria-labelledby="tab-staff">
                  <Card>
                    <StaffRolesTable
                    staff={staff}
                    roles={roles}
                    canAssign={canAssignStaff}
                    selfId={me?.id ?? null}
                    busyUserId={busyUserId}
                    onAssign={assignRole}
                    />
                  </Card>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <RoleFormModal
        isOpen={form.open}
        role={form.role}
        saving={saving}
        onClose={() => setForm({ open: false, role: null })}
        onSubmit={submitRoleForm}
      />
    </div>
  );
}
