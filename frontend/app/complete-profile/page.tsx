"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FaTooth } from "react-icons/fa";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  phone: "",
  date_of_birth: "",
  gender: "",
  address: "",
  city: "",
  governate: "",
  blood_type: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  insurance_provider: "",
  insurance_policy: "",
  allergies: "",
  current_medications: "",
  medical_notes: "",
};

export type OAuthPendingProfile = typeof EMPTY_FORM;

export default function CompleteProfilePage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = sessionStorage.getItem("authToken");
    const userId = sessionStorage.getItem("userId");

    if (!token || !userId) {
      // Arrived here without an OAuth session — go back to login
      router.replace("/login");
      return;
    }

    // Pre-fill name from Google (stored in sessionStorage by the callback)
    const raw = sessionStorage.getItem("adminUser");
    if (raw) {
      try {
        const { firstName, lastName } = JSON.parse(raw);
        setForm((prev) => ({
          ...prev,
          first_name: firstName || prev.first_name,
          last_name: lastName || prev.last_name,
        }));
      } catch {}
    }

    setIsLoading(false);
  }, [router]);

  const PHONE_FIELDS = ["phone", "emergency_contact_phone"];

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const value = PHONE_FIELDS.includes(e.target.name)
      ? e.target.value.replace(/[^0-9+\-\s()]/g, "")
      : e.target.value;
    setForm({ ...form, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError("");

    const token = sessionStorage.getItem("authToken")!;
    const userId = sessionStorage.getItem("userId")!;

    const {
      city, governate, emergency_contact_name, emergency_contact_phone,
      blood_type, allergies, current_medications, medical_notes,
      insurance_provider, insurance_policy,
      ...userFields
    } = form;

    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    try {
      await Promise.all([
        fetch(`${API_URL}/api/users/${userId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(userFields),
        }),
        fetch(`${API_URL}/api/patients/by-user/${userId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            city,
            governate,
            emergency_contact_name,
            emergency_contact_phone,
            blood_type: blood_type || undefined,
            allergies,
            current_medications,
            medical_notes,
            insurance_provider,
            insurance_policy,
            profile_complete: true,
          }),
        }),
      ]);

      router.replace("/patient-dashboard");
    } catch {
      setError("Failed to save your profile. Please try again.");
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="w-8 h-8 border-4 border-dental-blue/30 border-t-dental-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-dental-blue to-dental-teal flex items-center justify-center shadow-lg">
              <FaTooth className="text-white text-xl" />
            </div>
            <span className="text-2xl font-bold text-gray-900">BrightSmile</span>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Complete Your Profile</h1>
          <p className="mt-2 text-gray-500">
            We&apos;ve connected your Google account. Just fill in a few more details to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-8 space-y-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Personal Information */}
          <Section title="Personal Information">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name" required>
                <input name="first_name" value={form.first_name} onChange={handleChange}
                  required className={input} placeholder="Jane" />
              </Field>
              <Field label="Last Name" required>
                <input name="last_name" value={form.last_name} onChange={handleChange}
                  required className={input} placeholder="Doe" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone Number" required>
                <input name="phone" type="tel" value={form.phone} onChange={handleChange}
                  required className={input} placeholder="+961 71 000 000" />
              </Field>
              <Field label="Date of Birth" required>
                <input name="date_of_birth" type="date" value={form.date_of_birth}
                  onChange={handleChange} required className={input}
                  max={new Date().toISOString().split("T")[0]} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Gender">
                <select name="gender" value={form.gender} onChange={handleChange} className={input}>
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Blood Type">
                <select name="blood_type" value={form.blood_type} onChange={handleChange} className={input}>
                  <option value="">Select…</option>
                  {BLOOD_TYPES.map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Address">
              <input name="address" value={form.address} onChange={handleChange}
                className={input} placeholder="Street address" />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="City">
                <input name="city" value={form.city} onChange={handleChange}
                  className={input} placeholder="Beirut" />
              </Field>
              <Field label="Governate">
                <input name="governate" value={form.governate} onChange={handleChange}
                  className={input} placeholder="Mount Lebanon" />
              </Field>
            </div>
          </Section>

          {/* Emergency Contact */}
          <Section title="Emergency Contact">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact Name">
                <input name="emergency_contact_name" value={form.emergency_contact_name}
                  onChange={handleChange} className={input} placeholder="John Doe" />
              </Field>
              <Field label="Contact Phone">
                <input name="emergency_contact_phone" type="tel" value={form.emergency_contact_phone}
                  onChange={handleChange} className={input} placeholder="+961 70 000 000" />
              </Field>
            </div>
          </Section>

          {/* Insurance */}
          <Section title="Insurance (Optional)">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Provider">
                <input name="insurance_provider" value={form.insurance_provider}
                  onChange={handleChange} className={input} placeholder="CNSS, Allianz…" />
              </Field>
              <Field label="Policy Number">
                <input name="insurance_policy" value={form.insurance_policy}
                  onChange={handleChange} className={input} placeholder="ABC123456" />
              </Field>
            </div>
          </Section>

          {/* Medical History */}
          <Section title="Medical History (Optional)">
            <Field label="Known Allergies">
              <textarea name="allergies" value={form.allergies} onChange={handleChange}
                rows={2} className={input} placeholder="Penicillin, latex…" />
            </Field>
            <Field label="Current Medications">
              <textarea name="current_medications" value={form.current_medications}
                onChange={handleChange} rows={2} className={input}
                placeholder="List any medications you take regularly" />
            </Field>
            <Field label="Medical Notes">
              <textarea name="medical_notes" value={form.medical_notes} onChange={handleChange}
                rows={3} className={input}
                placeholder="Previous surgeries, chronic conditions, etc." />
            </Field>
          </Section>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-gradient-to-r from-dental-blue to-dental-teal text-white font-semibold text-base hover:shadow-lg disabled:opacity-60 transition-all"
          >
            {isSaving ? (
              <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : null}
            {isSaving ? "Saving…" : "Save & Go to Dashboard"}
          </button>

          <p className="text-center text-xs text-gray-400">
            You can update these details anytime from your profile settings.
          </p>
        </form>
      </div>
    </div>
  );
}

const input =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-800 pb-2 border-b border-gray-100">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
