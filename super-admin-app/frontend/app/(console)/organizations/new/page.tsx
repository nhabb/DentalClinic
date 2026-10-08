"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { FaHospital, FaMapMarkerAlt, FaUserTie, FaCheckCircle } from "react-icons/fa";
import { PageHeader } from "@/components/console/PageHeader";
import { ErrorNote } from "@/components/console/ErrorNote";
import { InviteLinkCard } from "@/components/console/InviteLinkCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/FormField";
import { ApiError, post } from "@/lib/api";
import { slugify } from "@/lib/format";
import type { OnboardResult } from "@/lib/types";

interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  email: string;
  phone: string;
  currency: string;
  timezone: string;
  branchName: string;
  branchCity: string;
  branchAddress: string;
  branchPhone: string;
  ownerFirst: string;
  ownerLast: string;
  ownerEmail: string;
  ownerPhone: string;
}

const initial: FormState = {
  name: "",
  slug: "",
  slugTouched: false,
  email: "",
  phone: "",
  currency: "USD",
  timezone: "Asia/Beirut",
  branchName: "Main Branch",
  branchCity: "",
  branchAddress: "",
  branchPhone: "",
  ownerFirst: "",
  ownerLast: "",
  ownerEmail: "",
  ownerPhone: "",
};

/** One page, three sections: the clinic, its first branch, its first admin. */
export default function OnboardClinicPage() {
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OnboardResult | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setName = (name: string) => setForm((f) => ({ ...f, name, slug: f.slugTouched ? f.slug : slugify(name) }));

  const hasOwner = form.ownerEmail.trim() !== "" || form.ownerFirst.trim() !== "" || form.ownerLast.trim() !== "";
  const orNull = (v: string) => (v.trim() ? v.trim() : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const created = await post<OnboardResult>("/organizations", {
        name: form.name.trim(),
        slug: form.slug.trim(),
        email: orNull(form.email),
        phone: orNull(form.phone),
        currency: form.currency,
        timezone: form.timezone,
        default_branch: {
          name: form.branchName.trim() || "Main Branch",
          city: orNull(form.branchCity),
          address: orNull(form.branchAddress),
          phone: orNull(form.branchPhone),
        },
        ...(hasOwner
          ? {
              owner: {
                first_name: form.ownerFirst.trim(),
                last_name: form.ownerLast.trim(),
                email: form.ownerEmail.trim(),
                phone: orNull(form.ownerPhone),
              },
            }
          : {}),
      });
      setResult(created);
      toast.success(`${created.name} is onboarded`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the platform API");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <>
        <PageHeader eyebrow="Clinics" title="Clinic onboarded" subtitle={result.name} />
        <main className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          <Card>
            <CardBody className="space-y-5">
              <div className="flex items-start gap-3">
                <FaCheckCircle className="mt-0.5 text-xl text-leaf-600" />
                <div>
                  <p className="font-semibold text-ink-900">
                    {result.name} <span className="font-normal text-ink-500">({result.slug})</span> is ready.
                  </p>
                  <p className="text-sm text-ink-600">
                    Default branch: {result.branches[0]?.name}. Clinic staff sign in at the clinic app; anonymous
                    visitors reach this clinic with the <code className="rounded bg-ink-100 px-1">X-Organization: {result.slug}</code>{" "}
                    header or its subdomain.
                  </p>
                </div>
              </div>
              {result.invite && result.owner && (
                <InviteLinkCard invite={result.invite} recipient={`${result.owner.first_name} ${result.owner.last_name} (${result.owner.email})`} />
              )}
              <div className="flex flex-wrap gap-2">
                <Link href={`/organizations/${result.id}`}>
                  <Button>Open clinic</Button>
                </Link>
                <Button variant="outline" onClick={() => { setResult(null); setForm(initial); }}>
                  Onboard another
                </Button>
              </div>
            </CardBody>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Clinics" title="Onboard a clinic" subtitle="Creates the organization, its first branch and its first administrator" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
          {error && <ErrorNote message={error} />}

          <Card>
            <CardHeader title="Clinic" subtitle="The organization that owns every branch" icon={<FaHospital />} />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Clinic name" required className="sm:col-span-2">
                <Input required value={form.name} onChange={(e) => setName(e.target.value)} placeholder="Smile Center" />
              </FormField>
              <FormField label="Slug" required hint="Lowercase letters, digits and dashes. Used in URLs and the X-Organization header.">
                <Input
                  required
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value, slugTouched: true }))}
                  placeholder="smile-center"
                />
              </FormField>
              <FormField label="Contact email">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="contact@clinic.com" />
              </FormField>
              <FormField label="Phone">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+961 1 234 567" />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Currency">
                  <Input value={form.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
                </FormField>
                <FormField label="Timezone">
                  <Input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
                </FormField>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="First branch" subtitle="Where new slots, stock and invoices land by default" icon={<FaMapMarkerAlt />} />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Branch name" required>
                <Input required value={form.branchName} onChange={(e) => set("branchName", e.target.value)} />
              </FormField>
              <FormField label="City">
                <Input value={form.branchCity} onChange={(e) => set("branchCity", e.target.value)} placeholder="Beirut" />
              </FormField>
              <FormField label="Address" className="sm:col-span-2">
                <Input value={form.branchAddress} onChange={(e) => set("branchAddress", e.target.value)} placeholder="Hamra Street, Beirut" />
              </FormField>
              <FormField label="Branch phone">
                <Input value={form.branchPhone} onChange={(e) => set("branchPhone", e.target.value)} />
              </FormField>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="First administrator"
              subtitle="Optional. Gets a link to set a password and sign in to the clinic app as admin."
              icon={<FaUserTie />}
            />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="First name" required={hasOwner}>
                <Input required={hasOwner} value={form.ownerFirst} onChange={(e) => set("ownerFirst", e.target.value)} />
              </FormField>
              <FormField label="Last name" required={hasOwner}>
                <Input required={hasOwner} value={form.ownerLast} onChange={(e) => set("ownerLast", e.target.value)} />
              </FormField>
              <FormField label="Email" required={hasOwner}>
                <Input type="email" required={hasOwner} value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} />
              </FormField>
              <FormField label="Phone">
                <Input value={form.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} />
              </FormField>
            </CardBody>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Link href="/organizations">
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? "Creating…" : "Create clinic"}
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
