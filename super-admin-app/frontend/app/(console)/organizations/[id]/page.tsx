"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FaUsers, FaCalendarCheck, FaFileInvoiceDollar, FaMoneyBillWave, FaMapMarkerAlt, FaUserMd, FaPlus, FaPaperPlane, FaBan, FaCheck } from "react-icons/fa";
import { PageHeader } from "@/components/console/PageHeader";
import { DataTable, type Column } from "@/components/console/DataTable";
import { ActivityBars } from "@/components/console/ActivityBars";
import { ActiveBadge, RoleBadge } from "@/components/console/StatusBadge";
import { ErrorNote } from "@/components/console/ErrorNote";
import { InviteLinkCard } from "@/components/console/InviteLinkCard";
import { StatsCard } from "@/components/ui/StatsCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useApi } from "@/lib/useApi";
import { ApiError, patch, post } from "@/lib/api";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Branch, Invite, OrganizationDetail, StaffMember } from "@/lib/types";

type Tab = "overview" | "branches" | "staff" | "settings";

export default function ClinicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: org, error, loading, reload } = useApi<OrganizationDetail>(`/organizations/${id}`);
  const [tab, setTab] = useState<Tab>("overview");

  if (error) {
    return (
      <>
        <PageHeader eyebrow={<Link href="/organizations">Clinics</Link>} title="Clinic" />
        <main className="p-6">
          <ErrorNote message={error} />
        </main>
      </>
    );
  }
  if (loading || !org) {
    return (
      <>
        <PageHeader eyebrow="Clinics" title="Loading…" />
        <LoadingSpinner label="Loading clinic" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href="/organizations" className="hover:text-brand-700">
              Clinics
            </Link>
            <span aria-hidden>/</span>
            <span>{org.slug}</span>
          </>
        }
        title={org.name}
        subtitle={`Since ${formatDate(org.created_at)} · ${org.currency} · ${org.timezone}`}
        actions={<SuspendButton org={org} onChanged={reload} />}
      />

      <main className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard icon={FaUsers} tone="brand" value={formatNumber(org.stats.patients)} label="Patients" />
          <StatsCard icon={FaCalendarCheck} tone="clay" value={formatNumber(org.stats.appointments)} label="Appointments" />
          <StatsCard icon={FaMoneyBillWave} tone="leaf" value={formatMoney(org.stats.revenue_collected, org.currency)} label="Collected" />
          <StatsCard
            icon={FaFileInvoiceDollar}
            tone="honey"
            value={formatMoney(org.stats.outstanding, org.currency)}
            label="Outstanding"
            hint={`${formatNumber(org.stats.invoices)} invoices`}
          />
        </section>

        <Tabs
          label="Clinic sections"
          value={tab}
          onChange={setTab}
          items={[
            { id: "overview", label: "Overview" },
            { id: "branches", label: "Branches", count: org.branches.length },
            { id: "staff", label: "Staff", count: org.staff.length },
            { id: "settings", label: "Settings" },
          ]}
        />

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "overview" && <OverviewTab org={org} />}
          {tab === "branches" && <BranchesTab org={org} onChanged={reload} />}
          {tab === "staff" && <StaffTab org={org} onChanged={reload} />}
          {tab === "settings" && <SettingsTab org={org} onChanged={reload} />}
        </div>
      </main>
    </>
  );
}

// ── Header action ─────────────────────────────────────────────────────────────

function SuspendButton({ org, onChanged }: { org: OrganizationDetail; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await patch(`/organizations/${org.id}/active`, { is_active: !org.is_active });
      toast.success(org.is_active ? `${org.name} suspended` : `${org.name} reactivated`);
      setConfirming(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ActiveBadge active={org.is_active} />
      <Button variant={org.is_active ? "outline" : "default"} onClick={() => setConfirming(true)}>
        {org.is_active ? <FaBan /> : <FaCheck />}
        {org.is_active ? "Suspend" : "Reactivate"}
      </Button>
      <Modal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={org.is_active ? `Suspend ${org.name}?` : `Reactivate ${org.name}?`}
        description={
          org.is_active
            ? "Every user of this clinic is locked out within a minute. Data is kept."
            : "Its users can sign in again right away."
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant={org.is_active ? "destructive" : "default"} onClick={toggle} disabled={busy}>
              {busy ? "Working…" : org.is_active ? "Suspend clinic" : "Reactivate clinic"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600">Slug: {org.slug}</p>
      </Modal>
    </>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab({ org }: { org: OrganizationDetail }) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader title="Activity, last six months" icon={<FaCalendarCheck />} />
        <CardBody>
          <ActivityBars
            months={org.monthly.map((m) => m.month)}
            series={[
              { label: "Appointments", barClass: "bg-brand-500", values: org.monthly.map((m) => m.appointments) },
              { label: "Collected", barClass: "bg-honey-400", values: org.monthly.map((m) => m.collected), format: (n) => formatMoney(n, org.currency) },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Contact" />
        <CardBody className="space-y-3 text-sm">
          <Row label="Email" value={org.email} />
          <Row label="Phone" value={org.phone} />
          <Row label="Website" value={org.website_url} />
          <Row label="Legal name" value={org.legal_name} />
          <Row label="Default branch" value={org.branches.find((b) => b.is_default)?.name ?? null} />
          {org.description && <p className="pt-2 text-ink-600">{org.description}</p>}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ink-100 pb-2 last:border-0">
      <span className="text-ink-500">{label}</span>
      <span className="truncate font-medium text-ink-900">{value || "—"}</span>
    </div>
  );
}

// ── Branches ──────────────────────────────────────────────────────────────────

function BranchesTab({ org, onChanged }: { org: OrganizationDetail; onChanged: () => void }) {
  const [editing, setEditing] = useState<Branch | "new" | null>(null);

  const run = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast.success(label);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Request failed");
    }
  };
  const makeDefault = (b: Branch) => run(`${b.name} is now the default branch`, () => patch(`/organizations/${org.id}/branches/${b.id}/default`, {}));
  const toggleActive = (b: Branch) =>
    run(b.is_active ? `${b.name} deactivated` : `${b.name} reactivated`, () =>
      patch(`/organizations/${org.id}/branches/${b.id}`, { is_active: !b.is_active }),
    );

  const columns: Column<Branch>[] = [
    {
      key: "name",
      header: "Branch",
      render: (b) => (
        <span className="flex items-center gap-2">
          <span className="font-semibold text-ink-900">{b.name}</span>
          {b.is_default && <Badge tone="brand">default</Badge>}
        </span>
      ),
    },
    { key: "code", header: "Code", render: (b) => b.code ?? "—" },
    { key: "city", header: "City", render: (b) => b.city ?? "—" },
    { key: "address", header: "Address", render: (b) => b.address ?? "—" },
    { key: "phone", header: "Phone", render: (b) => b.phone ?? "—" },
    { key: "status", header: "Status", render: (b) => <ActiveBadge active={b.is_active} /> },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (b) => (
        <span className="inline-flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
            Edit
          </Button>
          {!b.is_default && b.is_active && (
            <Button variant="ghost" size="sm" onClick={() => makeDefault(b)}>
              Make default
            </Button>
          )}
          {!b.is_default && (
            <Button variant="ghost" size="sm" onClick={() => toggleActive(b)}>
              {b.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <Card>
        <CardHeader
          title="Branches"
          subtitle="Clinic locations. New slots, stock and invoices land on the default branch unless told otherwise."
          icon={<FaMapMarkerAlt />}
          action={
            <Button size="sm" onClick={() => setEditing("new")}>
              <FaPlus /> Add branch
            </Button>
          }
        />
        <DataTable
          columns={columns}
          rows={org.branches}
          rowKey={(b) => b.id}
          empty={
            <EmptyState
              icon={FaMapMarkerAlt}
              title="No branches"
              action={<Button onClick={() => setEditing("new")}>Add branch</Button>}
            />
          }
        />
      </Card>
      <BranchModal
        organizationId={org.id}
        branch={editing === "new" ? null : editing}
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={onChanged}
      />
    </>
  );
}

const emptyBranchForm = { name: "", code: "", city: "", address: "", phone: "", opening_hours: "", is_default: false };

/** Create (branch = null) or edit a branch. */
function BranchModal({
  organizationId,
  branch,
  isOpen,
  onClose,
  onSaved,
}: {
  organizationId: string;
  branch: Branch | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(emptyBranchForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  // Load the branch into the form each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setForm(
      branch
        ? {
            name: branch.name,
            code: branch.code ?? "",
            city: branch.city ?? "",
            address: branch.address ?? "",
            phone: branch.phone ?? "",
            opening_hours: branch.opening_hours ?? "",
            is_default: branch.is_default,
          }
        : emptyBranchForm,
    );
  }, [isOpen, branch]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const orUndefined = (v: string) => (v.trim() ? v.trim() : undefined);
    const details = {
      name: form.name.trim(),
      code: orUndefined(form.code),
      city: orUndefined(form.city),
      address: orUndefined(form.address),
      phone: orUndefined(form.phone),
      opening_hours: orUndefined(form.opening_hours),
    };
    try {
      if (branch) {
        await patch(`/organizations/${organizationId}/branches/${branch.id}`, details);
        toast.success("Branch saved");
      } else {
        await post(`/organizations/${organizationId}/branches`, { ...details, is_default: form.is_default });
        toast.success("Branch opened");
      }
      onClose();
      onSaved();
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
      title={branch ? `Edit ${branch.name}` : "Add branch"}
      description={branch ? undefined : "A new clinic location for this organization."}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="branch-form" disabled={busy}>
            {busy ? "Saving…" : branch ? "Save changes" : "Open branch"}
          </Button>
        </div>
      }
    >
      <form id="branch-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <ErrorNote message={error} />
          </div>
        )}
        <FormField label="Branch name" required className="sm:col-span-2">
          <Input required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Tyre Branch" />
        </FormField>
        <FormField label="Code" hint="Short label shown on documents">
          <Input value={form.code} maxLength={20} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="TYR" />
        </FormField>
        <FormField label="City">
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Tyre" />
        </FormField>
        <FormField label="Address" className="sm:col-span-2">
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Al Bass Street, Tyre" />
        </FormField>
        <FormField label="Phone">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+961 7 123 456" />
        </FormField>
        <FormField label="Opening hours">
          <Input value={form.opening_hours} onChange={(e) => set("opening_hours", e.target.value)} placeholder="Mon-Sat 9:00-17:00" />
        </FormField>
        {!branch && (
          <label className="flex items-center gap-2 text-sm text-ink-700 sm:col-span-2">
            <input type="checkbox" checked={form.is_default} onChange={(e) => set("is_default", e.target.checked)} className="size-4 accent-brand-600" />
            Make this the default branch
          </label>
        )}
      </form>
    </Modal>
  );
}

// ── Staff ─────────────────────────────────────────────────────────────────────

function StaffTab({ org, onChanged }: { org: OrganizationDetail; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [invite, setInvite] = useState<{ invite: Invite; recipient: string } | null>(null);
  const branchName = (id: string | null) => org.branches.find((b) => b.id === id)?.name ?? "All branches";

  const resend = async (member: StaffMember) => {
    try {
      const result = await post<{ invite: Invite }>(`/organizations/${org.id}/staff/${member.id}/invite`);
      setInvite({ invite: result.invite, recipient: `${member.first_name} ${member.last_name}` });
      toast.success("New setup link issued");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Request failed");
    }
  };

  const columns: Column<StaffMember>[] = [
    {
      key: "name",
      header: "Name",
      render: (m) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-ink-900">
            {m.first_name} {m.last_name}
          </span>
          <span className="block truncate text-xs text-ink-400">{m.email ?? "no email"}</span>
        </span>
      ),
    },
    { key: "role", header: "Role", render: (m) => <RoleBadge role={m.role} /> },
    {
      key: "branch",
      header: "Branch",
      render: (m) => (
        <span className="text-ink-700">
          {branchName(m.branch_id)}
          {m.restrict_to_branch && <span className="ms-1 text-xs text-ink-400">(restricted)</span>}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (m) =>
        !m.is_active ? <Badge tone="brick" dot>Disabled</Badge> : m.must_set_password ? <Badge tone="honey" dot>Awaiting password</Badge> : <Badge tone="leaf" dot>Active</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (m) => (
        <Button variant="ghost" size="sm" onClick={() => resend(m)} title="Issue a new password setup link">
          <FaPaperPlane /> Setup link
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {invite && <InviteLinkCard invite={invite.invite} recipient={invite.recipient} />}
      <Card>
        <CardHeader
          title="Staff"
          subtitle="Doctors, secretaries and admins of this clinic"
          icon={<FaUserMd />}
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              <FaPlus /> Add staff
            </Button>
          }
        />
        <DataTable columns={columns} rows={org.staff} rowKey={(m) => m.id} empty={<EmptyState icon={FaUserMd} title="No staff yet" />} />
      </Card>
      <AddStaffModal
        organizationId={org.id}
        isOpen={adding}
        onClose={() => setAdding(false)}
        onCreated={(result) => {
          setInvite(result);
          onChanged();
        }}
      />
    </div>
  );
}

function AddStaffModal({
  organizationId,
  isOpen,
  onClose,
  onCreated,
}: {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result: { invite: Invite; recipient: string }) => void;
}) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", role: "admin" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      setForm({ first_name: "", last_name: "", email: "", phone: "", role: "admin" });
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
        <FormField label="Role" className="sm:col-span-2">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="h-11 w-full rounded-xl border border-ink-200 bg-ink-50/70 px-3.5 text-sm text-ink-900 focus:border-brand-400 focus:bg-card focus:outline-none focus:ring-4 focus:ring-brand-500/12"
          >
            <option value="admin">Admin (manages the whole clinic)</option>
            <option value="doctor">Doctor</option>
            <option value="secretary">Secretary</option>
          </select>
        </FormField>
      </form>
    </Modal>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function SettingsTab({ org, onChanged }: { org: OrganizationDetail; onChanged: () => void }) {
  const [form, setForm] = useState({
    name: org.name,
    legal_name: org.legal_name ?? "",
    email: org.email ?? "",
    phone: org.phone ?? "",
    website_url: org.website_url ?? "",
    description: org.description ?? "",
    timezone: org.timezone,
    currency: org.currency,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const orUndefined = (v: string) => (v.trim() ? v.trim() : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await patch(`/organizations/${org.id}`, {
        name: form.name.trim(),
        legal_name: orUndefined(form.legal_name),
        email: orUndefined(form.email),
        phone: orUndefined(form.phone),
        website_url: orUndefined(form.website_url),
        description: orUndefined(form.description),
        timezone: form.timezone,
        currency: form.currency,
      });
      toast.success("Clinic profile saved");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Clinic profile" subtitle={`Slug ${org.slug} cannot be changed; it is part of the clinic's URLs`} />
      <CardBody>
        <form onSubmit={submit} className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {error && (
            <div className="sm:col-span-2">
              <ErrorNote message={error} />
            </div>
          )}
          <FormField label="Name" required className="sm:col-span-2">
            <Input required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </FormField>
          <FormField label="Legal name">
            <Input value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
          </FormField>
          <FormField label="Website">
            <Input value={form.website_url} onChange={(e) => set("website_url", e.target.value)} />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </FormField>
          <FormField label="Timezone">
            <Input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
          </FormField>
          <FormField label="Currency">
            <Input value={form.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
          </FormField>
          <FormField label="Description" className="sm:col-span-2">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-ink-200 bg-ink-50/70 px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-400 focus:bg-card focus:outline-none focus:ring-4 focus:ring-brand-500/12"
            />
          </FormField>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
