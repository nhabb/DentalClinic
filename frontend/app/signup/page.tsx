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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
import { ar, fr, enUS } from "date-fns/locale";
import { FaTooth } from "react-icons/fa";

function OptionalBadge() {
  return (
    <span className="ml-2 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
      Optional
    </span>
  );
}

function hasNumbers(value: string) {
  return /\d/.test(value);
}

function getAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

export default function SignupPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const dateLocale = language === "ar" ? ar : language === "fr" ? fr : enUS;

  const [isLoading, setIsLoading] = useState(false);
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

  // Per-field errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setFieldError = (field: string, msg: string) =>
    setErrors((prev) => ({ ...prev, [field]: msg }));
  const clearFieldError = (field: string) =>
    setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Phone fields: strip all non-digit characters except +, -, space, parens
    if (name === "phone" || name === "emergencyPhone") {
      const stripped = value.replace(/[^0-9+\-\s()]/g, "");
      setForm({ ...form, [name]: stripped });
      if (stripped !== value) return; // nothing more to validate yet
      clearFieldError(name);
      return;
    }

    setForm({ ...form, [name]: value });

    // Live validation for name fields
    if ((name === "firstName" || name === "lastName" || name === "emergencyContact") && value && hasNumbers(value)) {
      setFieldError(name, "Names cannot contain numbers.");
    } else {
      clearFieldError(name);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.firstName.trim()) newErrors.firstName = "First name is required.";
    else if (hasNumbers(form.firstName)) newErrors.firstName = "Names cannot contain numbers.";

    if (!form.lastName.trim()) newErrors.lastName = "Last name is required.";
    else if (hasNumbers(form.lastName)) newErrors.lastName = "Names cannot contain numbers.";

    if (!form.phone.trim()) newErrors.phone = "Phone is required.";
    else if (/[a-zA-Z]/.test(form.phone)) newErrors.phone = "Phone number cannot contain letters.";

    if (!form.dateOfBirth) {
      newErrors.dateOfBirth = "Date of birth is required.";
    } else if (getAge(form.dateOfBirth) < 18) {
      newErrors.dateOfBirth = "You must be at least 18 years old to sign up.";
    }

    if (!form.email.trim()) newErrors.email = "Email is required.";

    if (!form.password) {
      newErrors.password = "Password is required.";
    } else if (form.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters.";
    }

    if (!form.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password.";
    } else if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = t("signup.passwordsDoNotMatch");
    }

    if (!form.emergencyContact.trim()) {
      newErrors.emergencyContact = "Emergency contact name is required.";
    } else if (hasNumbers(form.emergencyContact)) {
      newErrors.emergencyContact = "Names cannot contain numbers.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

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
        setErrors({ email: data.message || "Signup failed. Please try again." });
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
      setErrors({ email: "Unable to connect to server. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? (
      <p className="text-xs text-red-600 mt-1">{errors[field]}</p>
    ) : null;

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

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Personal Information — Required (section 1) */}
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
                  <FieldLabel htmlFor="firstName" className="text-gray-900 font-semibold text-sm tracking-wide">
                    {t("continueLogin.firstName")}
                  </FieldLabel>
                  <Input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={form.firstName}
                    onChange={handleChange}
                    placeholder="Ahmad"
                    className={`focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal ${errors.firstName ? "border-red-400" : ""}`}
                  />
                  <FieldError field="firstName" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="lastName" className="text-gray-900 font-semibold text-sm tracking-wide">
                    {t("continueLogin.lastName")}
                  </FieldLabel>
                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={form.lastName}
                    onChange={handleChange}
                    placeholder="Khoury"
                    className={`focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal ${errors.lastName ? "border-red-400" : ""}`}
                  />
                  <FieldError field="lastName" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="phone" className="text-gray-900 font-semibold text-sm tracking-wide">
                    {t("continueLogin.phone")}
                  </FieldLabel>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    dir="ltr"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+961 3 123 456"
                    className={`focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal ${errors.phone ? "border-red-400" : ""}`}
                  />
                  <FieldError field="phone" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="dateOfBirth" className="text-gray-900 font-semibold text-sm tracking-wide">
                    {t("continueLogin.dateOfBirth")}
                  </FieldLabel>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        id="dateOfBirth"
                        className={`w-full justify-between font-normal ${errors.dateOfBirth ? "border-red-400" : ""}`}
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
                        selected={form.dateOfBirth ? new Date(form.dateOfBirth) : undefined}
                        onSelect={(date) => {
                          const iso = date ? date.toISOString() : null;
                          setForm({ ...form, dateOfBirth: iso });
                          setCalendarOpen(false);
                          if (iso && getAge(iso) < 18) {
                            setFieldError("dateOfBirth", "You must be at least 18 years old to sign up.");
                          } else {
                            clearFieldError("dateOfBirth");
                          }
                        }}
                        captionLayout="dropdown"
                        locale={dateLocale}
                        fromYear={1920}
                        toYear={new Date().getFullYear() - 18}
                        classNames={{ nav: "hidden" }}
                      />
                    </PopoverContent>
                  </Popover>
                  <FieldError field="dateOfBirth" />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Address — Optional (section 2) */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight flex items-center">
              {t("continueLogin.addressInfo")}
              <OptionalBadge />
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("continueLogin.addressInfoDesc")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <Field>
                <FieldLabel htmlFor="address" className="text-gray-900 font-semibold text-sm tracking-wide">
                  {t("continueLogin.streetAddress")}
                </FieldLabel>
                <Input
                  id="address"
                  name="address"
                  type="text"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Hamra Street, Building 123"
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="city" className="text-gray-900 font-semibold text-sm tracking-wide">
                    {t("continueLogin.city")}
                  </FieldLabel>
                  <Input
                    id="city"
                    name="city"
                    type="text"
                    value={form.city}
                    onChange={handleChange}
                    placeholder="Beirut"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="governate" className="text-gray-900 font-semibold text-sm tracking-wide">
                    {t("continueLogin.governorate")}
                  </FieldLabel>
                  <Input
                    id="governate"
                    name="governate"
                    type="text"
                    value={form.governate}
                    onChange={handleChange}
                    placeholder="Beirut"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Emergency Contact — Required (section 3) */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight flex items-center">
              {t("continueLogin.emergencyContact")}
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("continueLogin.emergencyContactDesc")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="emergencyContact" className="text-gray-900 font-semibold text-sm tracking-wide">
                    {t("continueLogin.contactName")}
                  </FieldLabel>
                  <Input
                    id="emergencyContact"
                    name="emergencyContact"
                    type="text"
                    value={form.emergencyContact}
                    onChange={handleChange}
                    placeholder="Layla Khoury"
                    className={`focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal ${errors.emergencyContact ? "border-red-400" : ""}`}
                  />
                  <FieldError field="emergencyContact" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="emergencyPhone" className="text-gray-900 font-semibold text-sm tracking-wide">
                    {t("continueLogin.contactPhone")}
                  </FieldLabel>
                  <Input
                    id="emergencyPhone"
                    name="emergencyPhone"
                    type="tel"
                    dir="ltr"
                    value={form.emergencyPhone}
                    onChange={handleChange}
                    placeholder="+961 3 987 654"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Insurance — Optional (section 4) */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight flex items-center">
              {t("continueLogin.insuranceInfo")}
              <OptionalBadge />
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("continueLogin.insuranceInfoDesc")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="insuranceProvider" className="text-gray-900 font-semibold text-sm tracking-wide">
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
                  <FieldLabel htmlFor="insurancePolicy" className="text-gray-900 font-semibold text-sm tracking-wide">
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

          {/* Medical History — Optional (section 5) */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight flex items-center">
              {t("continueLogin.medicalHistory")}
              <OptionalBadge />
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("continueLogin.medicalHistoryDesc")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <Field>
                <FieldLabel htmlFor="bloodType" className="text-gray-900 font-semibold text-sm tracking-wide">
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
                <FieldLabel htmlFor="medicalConditions" className="text-gray-900 font-semibold text-sm tracking-wide">
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
                <FieldLabel htmlFor="allergies" className="text-gray-900 font-semibold text-sm tracking-wide">
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
                <FieldLabel htmlFor="currentMedications" className="text-gray-900 font-semibold text-sm tracking-wide">
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

          {/* Account — Required (section 6 / last) */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              {t("signup.createAccount")}
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              {t("signup.joinToday")}
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <Field>
                <FieldLabel htmlFor="email" className="text-gray-900 font-semibold text-sm tracking-wide">
                  {t("signup.emailAddress")}
                </FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="ahmad@example.com"
                  className={`focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal ${errors.email ? "border-red-400" : ""}`}
                />
                <FieldError field="email" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="password" className="text-gray-900 font-semibold text-sm tracking-wide">
                    {t("signup.password")}
                  </FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder={t("signup.createPassword")}
                    className={`focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal ${errors.password ? "border-red-400" : ""}`}
                  />
                  <FieldError field="password" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirmPassword" className="text-gray-900 font-semibold text-sm tracking-wide">
                    {t("signup.confirmPassword")}
                  </FieldLabel>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    placeholder={t("signup.repeatPassword")}
                    className={`focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal ${errors.confirmPassword ? "border-red-400" : ""}`}
                  />
                  <FieldError field="confirmPassword" />
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
            <Link href="/login" className="font-semibold text-white hover:text-white/80 underline">
              {t("signup.signIn")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
