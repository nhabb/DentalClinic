"use client";

// Clinic settings: the clinic's details, its address/hours/logo, its branches,
// and a way into Roles & access. Opened from the profile menu.
//
// Each section is shown to anyone on the staff and editable only with the
// permission its API needs (clinic:settings, branches:*); the API refuses the
// rest anyway. Roles & access is a link to /admin/roles, not a copy of it.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FaBuilding,
  FaClock,
  FaCodeBranch,
  FaImage,
  FaStar,
  FaTrash,
  FaUserShield,
  FaEdit,
  FaChevronRight,
} from "react-icons/fa";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useTranslation } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";
import { useSignOut } from "@/lib/auth/useSignOut";
import { resetClinicIdentity } from "@/lib/clinic";
import {
  deleteBranch,
  fetchBranches,
  fetchClinicProfile,
  fetchOrganization,
  makeDefaultBranch,
  orNull,
  updateBranch,
  updateClinicProfile,
  updateOrganization,
  uploadClinicLogo,
  type Branch,
  type ClinicProfile,
  type Organization,
} from "@/lib/api/settings";
import { BranchModal } from "./components/BranchModal";

const textareaClass = inputClass.replace("h-11", "min-h-24 py-2.5");

function timezones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {}
  return zones.includes(current) ? zones : [current, ...zones];
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const handleLogout = useSignOut();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [org, setOrg] = useState<Organization | null>(null);
  const [profile, setProfile] = useState<ClinicProfile | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [o, p, b] = await Promise.all([fetchOrganization(), fetchClinicProfile(), fetchBranches()]);
      setOrg(o);
      setProfile(p);
      setBranches(b);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

        <main className="flex-1 overflow-auto p-4 sm:p-8">
          {loading ? (
            <LoadingSpinner label={t("common.loading")} />
          ) : failed || !org || !profile ? (
            <EmptyState icon={FaBuilding} title={t("settings.loadFailed")} />
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-6">
              <ClinicDetailsCard org={org} canEdit={can("clinic:settings")} onSaved={setOrg} />
              <LocationCard profile={profile} canEdit={can("clinic:settings")} onSaved={setProfile} />
              <BranchesCard
                branches={branches}
                canCreate={can("branches:create")}
                canEdit={can("branches:edit")}
                canDelete={can("branches:delete")}
                onChanged={load}
              />
              {can("staff:read") && <AccessCard />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ReadOnlyNote() {
  const { t } = useTranslation();
  return <p className="mb-4 rounded-xl bg-ink-50 px-3.5 py-2.5 text-xs text-ink-600">{t("settings.readOnly")}</p>;
}

// ── Clinic details (the organization) ─────────────────────────────────────────

function ClinicDetailsCard({
  org,
  canEdit,
  onSaved,
}: {
  org: Organization;
  canEdit: boolean;
  onSaved: (org: Organization) => void;
}) {
  const { t } = useTranslation();
  const formFrom = (o: Organization) => ({
    name: o.name,
    legal_name: o.legal_name ?? "",
    email: o.email ?? "",
    phone: o.phone ?? "",
    website_url: o.website_url ?? "",
    description: o.description ?? "",
    timezone: o.timezone,
    currency: o.currency,
  });
  const [form, setForm] = useState(() => formFrom(org));
  const [saving, setSaving] = useState(false);
  type Field = keyof typeof form;
  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await updateOrganization({
        name: form.name.trim(),
        legal_name: orNull(form.legal_name),
        email: orNull(form.email),
        phone: orNull(form.phone),
        website_url: orNull(form.website_url),
        description: orNull(form.description),
        timezone: form.timezone,
        currency: form.currency.trim().toUpperCase(),
      });
      onSaved(saved);
      setForm(formFrom(saved));
      // Headers show the clinic name from /auth/me; let them ask again.
      resetClinicIdentity();
      toast.success(t("settings.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={<FaBuilding />} title={t("settings.clinicDetails")} subtitle={t("settings.clinicDetailsDesc")} />
      <CardBody>
        {!canEdit && <ReadOnlyNote />}
        <form onSubmit={save}>
          <fieldset disabled={!canEdit || saving} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t("settings.clinicName")} required>
              <input className={inputClass} value={form.name} onChange={set("name")} maxLength={150} required />
            </FormField>
            <FormField label={t("settings.legalName")}>
              <input className={inputClass} value={form.legal_name} onChange={set("legal_name")} maxLength={200} />
            </FormField>
            <FormField label={t("settings.email")}>
              <input className={inputClass} type="email" value={form.email} onChange={set("email")} maxLength={255} />
            </FormField>
            <FormField label={t("settings.phone")}>
              <input className={inputClass} type="tel" value={form.phone} onChange={set("phone")} maxLength={30} />
            </FormField>
            <FormField label={t("settings.website")} className="sm:col-span-2">
              <input className={inputClass} value={form.website_url} onChange={set("website_url")} maxLength={500} />
            </FormField>
            <FormField label={t("settings.about")} className="sm:col-span-2">
              <textarea className={textareaClass} value={form.description} onChange={set("description")} maxLength={2000} />
            </FormField>
            <FormField label={t("settings.timezone")}>
              <select className={inputClass} value={form.timezone} onChange={set("timezone")}>
                {timezones(org.timezone).map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("settings.currency")} hint={t("settings.currencyHint")}>
              <input
                className={inputClass}
                value={form.currency}
                onChange={set("currency")}
                minLength={3}
                maxLength={3}
                pattern="[A-Za-z]{3}"
                required
              />
            </FormField>
          </fieldset>
          {canEdit && (
            <div className="mt-5 flex justify-end">
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? t("common.saving") : t("settings.saveChanges")}
              </Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

// ── Address, opening hours and logo (the clinic profile) ──────────────────────

function LocationCard({
  profile,
  canEdit,
  onSaved,
}: {
  profile: ClinicProfile;
  canEdit: boolean;
  onSaved: (profile: ClinicProfile) => void;
}) {
  const { t } = useTranslation();
  const [address, setAddress] = useState(profile.address ?? "");
  const [hours, setHours] = useState(profile.opening_hours ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      onSaved(await updateClinicProfile({ address: orNull(address), opening_hours: orNull(hours) }));
      toast.success(t("settings.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      onSaved(await uploadClinicLogo(file));
      toast.success(t("settings.logoUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.saveFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={<FaClock />} title={t("settings.locationHours")} />
      <CardBody>
        {!canEdit && <ReadOnlyNote />}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_12rem]">
          <form onSubmit={save}>
            <fieldset disabled={!canEdit || saving} className="flex flex-col gap-4">
              <FormField label={t("settings.address")}>
                <textarea className={textareaClass} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
              </FormField>
              <FormField label={t("settings.openingHours")} hint={t("settings.openingHoursHint")}>
                <textarea className={textareaClass} value={hours} onChange={(e) => setHours(e.target.value)} maxLength={500} />
              </FormField>
            </fieldset>
            {canEdit && (
              <div className="mt-5 flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? t("common.saving") : t("settings.saveChanges")}
                </Button>
              </div>
            )}
          </form>

          <div className="flex flex-col items-center gap-3 text-center">
            <span className="self-start text-sm font-medium text-ink-800">{t("settings.logo")}</span>
            <div className="flex size-36 items-center justify-center overflow-hidden rounded-2xl border border-ink-200 bg-ink-50">
              {profile.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logo_url} alt={t("settings.logo")} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-xs text-ink-400">
                  <FaImage className="size-6" />
                  {t("settings.noLogo")}
                </span>
              )}
            </div>
            {canEdit && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={upload}
                />
                <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                  {uploading ? t("common.saving") : profile.logo_url ? t("settings.replaceLogo") : t("settings.uploadLogo")}
                </Button>
                <p className="text-xs text-ink-500">{t("settings.logoHint")}</p>
              </>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ── Branches ──────────────────────────────────────────────────────────────────

function BranchesCard({
  branches,
  canCreate,
  canEdit,
  canDelete,
  onChanged,
}: {
  branches: Branch[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  // undefined: closed; null: adding; a branch: editing it.
  const [editing, setEditing] = useState<Branch | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (branch: Branch, run: () => Promise<unknown>, done: string) => {
    setBusy(branch.id);
    try {
      await run();
      toast.success(done);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.saveFailed"));
    } finally {
      setBusy(null);
    }
  };

  const remove = (branch: Branch) => {
    if (!window.confirm(t("settings.deleteBranchConfirm"))) return;
    void act(branch, () => deleteBranch(branch.id), t("settings.branchDeleted"));
  };

  return (
    <Card>
      <CardHeader
        icon={<FaCodeBranch />}
        title={t("settings.branches")}
        subtitle={t("settings.branchesDesc")}
        action={
          canCreate && (
            <Button size="sm" onClick={() => setEditing(null)}>
              {t("settings.addBranch")}
            </Button>
          )
        }
      />
      {branches.length === 0 ? (
        <CardBody>
          <EmptyState icon={FaCodeBranch} title={t("settings.noBranches")} />
        </CardBody>
      ) : (
        <ul className="divide-y divide-ink-200/70">
          {branches.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900">{b.name}</span>
                  {b.code && <span className="text-xs text-ink-500">{b.code}</span>}
                  {b.is_default && <Badge tone="brand">{t("settings.defaultBranch")}</Badge>}
                  {!b.is_active && <Badge tone="neutral">{t("common.inactive")}</Badge>}
                </div>
                <p className="truncate text-xs text-ink-500">
                  {[b.address, b.city, b.governate, b.phone].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {canEdit && (
                  <Button variant="ghost" size="sm" disabled={busy === b.id} onClick={() => setEditing(b)}>
                    <FaEdit /> {t("common.edit")}
                  </Button>
                )}
                {canEdit && b.is_active && !b.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === b.id}
                    onClick={() => act(b, () => makeDefaultBranch(b.id), t("settings.branchSaved"))}
                  >
                    <FaStar /> {t("settings.makeDefault")}
                  </Button>
                )}
                {canEdit && !b.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === b.id}
                    onClick={() =>
                      act(b, () => updateBranch(b.id, { is_active: !b.is_active }), t("settings.branchSaved"))
                    }
                  >
                    {b.is_active ? t("settings.deactivate") : t("settings.activate")}
                  </Button>
                )}
                {canDelete && !b.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-brick-700 hover:bg-brick-50 hover:text-brick-700"
                    disabled={busy === b.id}
                    onClick={() => remove(b)}
                    aria-label={t("common.delete")}
                  >
                    <FaTrash />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined && (
        <BranchModal
          branch={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

// ── Roles & access: a way into the page that handles it ───────────────────────

function AccessCard() {
  const { t } = useTranslation();
  return (
    <Link href="/admin/roles" className="group block">
      <Card interactive>
        <CardHeader
          icon={<FaUserShield />}
          title={t("settings.access")}
          subtitle={t("settings.accessDesc")}
          action={
            <span className="flex items-center gap-2 text-sm font-medium text-brand-700">
              {t("settings.openAccess")}
              <FaChevronRight className="size-3 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
            </span>
          }
          className="border-b-0"
        />
      </Card>
    </Link>
  );
}
