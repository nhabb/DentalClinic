"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { FaTooth } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import Link from "next/link";

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
  const [error, setError] = useState("");

  // If the user already has an active Google session, skip the form and sign in directly
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        // Already authenticated with Google — go straight to the callback to provision/login
        router.replace("/auth/callback");
      } else {
        setIsLoading(false);
      }
    });
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="w-8 h-8 border-4 border-dental-blue/30 border-t-dental-blue rounded-full animate-spin" />
      </div>
    );
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); // show spinner on the button while redirecting to Google
    setError("");

    // Persist the form data so the OAuth callback can save it after account creation
    localStorage.setItem("oauthPendingProfile", JSON.stringify(form));

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthError) {
        localStorage.removeItem("oauthPendingProfile");
        setError(oauthError.message);
        setIsLoading(false);
      }
      // If no error: browser is redirecting to Google — nothing more to do
    } catch {
      localStorage.removeItem("oauthPendingProfile");
      setError("Failed to start Google sign-in. Please try again.");
      setIsLoading(false);
    }
  };

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
          <h1 className="text-3xl font-bold text-gray-900">Create Your Patient Profile</h1>
          <p className="mt-2 text-gray-500">
            Fill in your details, then we&apos;ll connect your Google account.
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
                  onChange={handleChange} required className={input} />
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

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-white border-2 border-gray-300 hover:border-blue-500 hover:shadow-md disabled:opacity-60 transition-all font-semibold text-gray-700 text-base"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-gray-400 border-t-blue-600 rounded-full animate-spin" />
            ) : (
              <FcGoogle className="text-2xl" />
            )}
            {isLoading ? "Redirecting to Google…" : "Save & Continue with Google"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-blue-600 hover:underline">
              Sign in
            </Link>
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
