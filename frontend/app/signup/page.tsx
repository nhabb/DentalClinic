"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
import { ar, fr, enUS } from "date-fns/locale";
import { FaTooth } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";

export default function SignupPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const dateLocale = language === "ar" ? ar : language === "fr" ? fr : enUS;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [form, setForm] = useState({
    // Account
    email: "",
    password: "",
    confirmPassword: "",
    // Personal
    firstName: "",
    lastName: "",
    phone: "",
    dateOfBirth: null as string | null,
    // Address
    address: "",
    city: "",
    governate: "",
    // Emergency
    emergencyContact: "",
    emergencyPhone: "",
    // Insurance
    insuranceProvider: "",
    insurancePolicy: "",
    // Medical
    bloodType: "",
    medicalConditions: "",
    allergies: "",
    currentMedications: "",
  });

  const handleGoogleSignup = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/auth/callback` },
      });
      if (error) {
        toast.error(error.message);
        setIsLoading(false);
      }
    } catch {
      toast.error("Failed to start Google sign-up. Please try again.");
      setIsLoading(false);
    }
  };

  const PHONE_FIELDS = ["phone", "emergencyPhone"];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = PHONE_FIELDS.includes(e.target.name)
      ? e.target.value.replace(/[^0-9+\-\s()]/g, "")
      : e.target.value;
    setForm({ ...form, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError(t("signup.passwordsDoNotMatch"));
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setIsLoading(true);

    try {
      const address = [form.address, form.city, form.governate]
        .filter(Boolean)
        .join(", ");

      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          first_name: form.firstName,
          last_name: form.lastName,
          phone: form.phone || undefined,
          date_of_birth: form.dateOfBirth || undefined,
          address: address || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Signup failed. Please try again.");
        return;
      }

      const { user, token } = data;

      sessionStorage.setItem("authToken", token);
      sessionStorage.setItem("userRole", user.role);
      sessionStorage.setItem(
        "adminUser",
        JSON.stringify({
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
        })
      );

      // Update patient profile with medical info
      if (form.bloodType || form.medicalConditions || form.allergies || form.currentMedications) {
        try {
          const profileRes = await fetch(`${API_URL}/api/patients/by-user/${user.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (profileRes.ok) {
            const profile = await profileRes.json();
            await fetch(`${API_URL}/api/patients/${profile.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                blood_type: form.bloodType || undefined,
                medical_notes: form.medicalConditions || undefined,
                allergies: form.allergies || undefined,
                current_medications: form.currentMedications || undefined,
              }),
            });
          }
        } catch {}
      }

      router.push("/patient-dashboard");
    } catch {
      setError("Unable to connect to server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 sm:px-6 lg:px-8 gradient-auth-bg py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <LanguageSwitcher />
          </div>
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="w-12 h-12 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center shadow-lg">
              <FaTooth className="text-white text-2xl" />
            </div>
            <span className="text-2xl font-bold text-white">BrightSmile</span>
          </Link>
          <h2 className="mt-4 text-3xl font-extrabold text-white tracking-tight">
            {t("signup.createAccount")}
          </h2>
          <p className="mt-2 text-base text-white/90 font-light">
            {t("signup.joinToday")}
          </p>
        </div>

        {/* Google OAuth */}
        <Button
          type="button"
          variant="outline"
          className="w-full py-6 flex items-center gap-3 justify-center bg-white hover:bg-gray-50"
          onClick={handleGoogleSignup}
          disabled={isLoading}
        >
          <FcGoogle className="text-xl" />
          Continue with Google
        </Button>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-white/30" />
          <span className="text-sm text-white/70">or sign up with email</span>
          <div className="flex-1 border-t border-white/30" />
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          {/* Personal Information */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              {t("continueLogin.personalInfo")}
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("continueLogin.personalInfoDesc")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="firstName"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("continueLogin.firstName")}
                  </FieldLabel>
                  <Input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={form.firstName}
                    onChange={handleChange}
                    required
                    placeholder="Ahmad"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="lastName"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("continueLogin.lastName")}
                  </FieldLabel>
                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={form.lastName}
                    onChange={handleChange}
                    required
                    placeholder="Khoury"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="phone"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("continueLogin.phone")}
                  </FieldLabel>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    dir="ltr"
                    value={form.phone}
                    onChange={handleChange}
                    required
                    placeholder="+961 3 123 456"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="dateOfBirth"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("continueLogin.dateOfBirth")}
                  </FieldLabel>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        id="dateOfBirth"
                        className="w-full justify-between font-normal"
                      >
                        {form.dateOfBirth
                          ? new Date(form.dateOfBirth).toLocaleDateString()
                          : t("continueLogin.selectDate")}
                        <ChevronDownIcon />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-4 max-h-[600px] overflow-auto"
                      align="center"
                      side="bottom"
                      sideOffset={10}
                      avoidCollisions={false}
                    >
                      <Calendar
                        mode="single"
                        selected={
                          form.dateOfBirth
                            ? new Date(form.dateOfBirth)
                            : undefined
                        }
                        onSelect={(date) => {
                          setForm({
                            ...form,
                            dateOfBirth: date ? date.toISOString() : null,
                          });
                          setCalendarOpen(false);
                        }}
                        captionLayout="dropdown"
                        locale={dateLocale}
                        fromYear={1920}
                        toYear={new Date().getFullYear()}
                        disabled={(date) => date > new Date()}
                        classNames={{ nav: "hidden" }}
                      />
                    </PopoverContent>
                  </Popover>
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Address */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              {t("continueLogin.addressInfo")}
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("continueLogin.addressInfoDesc")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <Field>
                <FieldLabel
                  htmlFor="address"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  {t("continueLogin.streetAddress")}
                </FieldLabel>
                <Input
                  id="address"
                  name="address"
                  type="text"
                  value={form.address}
                  onChange={handleChange}
                  required
                  placeholder="Hamra Street, Building 123"
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="city"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("continueLogin.city")}
                  </FieldLabel>
                  <Input
                    id="city"
                    name="city"
                    type="text"
                    value={form.city}
                    onChange={handleChange}
                    required
                    placeholder="Beirut"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="governate"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("continueLogin.governorate")}
                  </FieldLabel>
                  <Input
                    id="governate"
                    name="governate"
                    type="text"
                    value={form.governate}
                    onChange={handleChange}
                    required
                    placeholder="Beirut"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Emergency Contact */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              {t("continueLogin.emergencyContact")}
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("continueLogin.emergencyContactDesc")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="emergencyContact"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("continueLogin.contactName")}
                  </FieldLabel>
                  <Input
                    id="emergencyContact"
                    name="emergencyContact"
                    type="text"
                    value={form.emergencyContact}
                    onChange={handleChange}
                    required
                    placeholder="Layla Khoury"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="emergencyPhone"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("continueLogin.contactPhone")}
                  </FieldLabel>
                  <Input
                    id="emergencyPhone"
                    name="emergencyPhone"
                    type="tel"
                    dir="ltr"
                    value={form.emergencyPhone}
                    onChange={handleChange}
                    required
                    placeholder="+961 3 987 654"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Insurance */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              {t("continueLogin.insuranceInfo")}
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("continueLogin.insuranceInfoDesc")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="insuranceProvider"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("continueLogin.insuranceProvider")}
                  </FieldLabel>
                  <Input
                    id="insuranceProvider"
                    name="insuranceProvider"
                    type="text"
                    value={form.insuranceProvider}
                    onChange={handleChange}
                    placeholder="Globemed"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="insurancePolicy"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("continueLogin.policyNumber")}
                  </FieldLabel>
                  <Input
                    id="insurancePolicy"
                    name="insurancePolicy"
                    type="text"
                    value={form.insurancePolicy}
                    onChange={handleChange}
                    placeholder="ABC123456789"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Medical History */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              {t("continueLogin.medicalHistory")}
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("continueLogin.medicalHistoryDesc")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <Field>
                <FieldLabel
                  htmlFor="bloodType"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  Blood Type
                </FieldLabel>
                <select
                  id="bloodType"
                  name="bloodType"
                  value={form.bloodType}
                  onChange={(e) => setForm({ ...form, bloodType: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-dental-blue focus:border-dental-blue"
                >
                  <option value="">Select blood type</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bt) => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel
                  htmlFor="medicalConditions"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  {t("continueLogin.medicalConditions")}
                </FieldLabel>
                <Input
                  id="medicalConditions"
                  name="medicalConditions"
                  type="text"
                  value={form.medicalConditions}
                  onChange={handleChange}
                  placeholder="e.g., Diabetes, Hypertension"
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field>
              <Field>
                <FieldLabel
                  htmlFor="allergies"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  {t("continueLogin.allergies")}
                </FieldLabel>
                <Input
                  id="allergies"
                  name="allergies"
                  type="text"
                  value={form.allergies}
                  onChange={handleChange}
                  placeholder="e.g., Penicillin, Latex"
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field>
              <Field>
                <FieldLabel
                  htmlFor="currentMedications"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  {t("continueLogin.currentMedications")}
                </FieldLabel>
                <Input
                  id="currentMedications"
                  name="currentMedications"
                  type="text"
                  value={form.currentMedications}
                  onChange={handleChange}
                  placeholder="e.g., Aspirin, Lisinopril"
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field>
            </FieldGroup>
          </FieldSet>
          {/* Account */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              {t("signup.createAccount")}
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("signup.joinToday")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <Field>
                <FieldLabel
                  htmlFor="email"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  {t("signup.emailAddress")}
                </FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  placeholder="ahmad@example.com"
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="password"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("signup.password")}
                  </FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    required
                    placeholder={t("signup.createPassword")}
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="confirmPassword"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    {t("signup.confirmPassword")}
                  </FieldLabel>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    required
                    placeholder={t("signup.repeatPassword")}
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full py-6 gradient-auth-card hover:shadow-xl transition-all transform hover:scale-[1.02]"
            size="lg"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                {t("signup.creatingAccount")}
              </span>
            ) : (
              t("signup.createPatientAccount")
            )}
          </Button>

          <p className="text-center text-sm text-white/80">
            {t("signup.alreadyHaveAccount")}{" "}
            <Link
              href="/login"
              className="font-semibold text-white hover:text-white/80 underline"
            >
              {t("signup.signIn")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
