"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FaTooth, FaUser, FaHospital, FaCheckCircle, FaClock } from "react-icons/fa";
import { useState } from "react";
import { useRouter } from "next/navigation";

type SignupType = "patient" | "clinic";

const SPECIALTIES = [
  { value: "general",      label: "General Dentistry" },
  { value: "orthodontics", label: "Orthodontics" },
  { value: "pediatric",    label: "Pediatric Dentistry" },
  { value: "cosmetic",     label: "Cosmetic Dentistry" },
  { value: "oral_surgery", label: "Oral Surgery" },
  { value: "periodontics", label: "Periodontics" },
  { value: "multi",        label: "Multi-Specialty" },
];

export default function SignupPage() {
  const router = useRouter();
  const [type, setType]         = useState<SignupType>("patient");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess]   = useState(false);

  // Patient form
  const [patient, setPatient] = useState({
    firstName: "", lastName: "", email: "", password: "", confirmPassword: "",
  });
  const [patientError, setPatientError] = useState("");

  // Clinic form
  const [clinic, setClinic] = useState({
    clinicName: "", ownerName: "", email: "", phone: "",
    address: "", city: "", licenseNumber: "", specialty: "",
    password: "", confirmPassword: "",
  });
  const [clinicError, setClinicError] = useState("");

  const handlePatientChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setPatient({ ...patient, [e.target.name]: e.target.value });

  const handleClinicChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setClinic({ ...clinic, [e.target.name]: e.target.value });

  const handlePatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPatientError("");
    if (patient.password !== patient.confirmPassword) {
      setPatientError("Passwords do not match.");
      return;
    }
    setIsLoading(true);
    localStorage.setItem("patientAuth", "true");
    localStorage.setItem("userRole", "patient");
    router.push("/select-clinic");
  };

  const handleClinicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClinicError("");
    if (clinic.password !== clinic.confirmPassword) {
      setClinicError("Passwords do not match.");
      return;
    }
    setIsLoading(true);

    // Save to localStorage as pending — super admin will review
    const existing = JSON.parse(localStorage.getItem("clinicRegistrations") || "[]");
    const newClinic = {
      id: Date.now(),
      clinicName:    clinic.clinicName,
      ownerName:     clinic.ownerName,
      email:         clinic.email,
      phone:         clinic.phone,
      address:       clinic.address,
      city:          clinic.city,
      licenseNumber: clinic.licenseNumber,
      specialty:     clinic.specialty,
      status:        "pending",
      submittedAt:   new Date().toISOString(),
    };
    localStorage.setItem("clinicRegistrations", JSON.stringify([...existing, newClinic]));

    setIsLoading(false);
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 gradient-auth-bg">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
            <FaClock className="text-amber-500 text-4xl" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Registration Submitted!</h2>
          <p className="text-gray-600">
            Your clinic registration is now pending review. Our super admin will
            verify your details and approve your account within 2–3 business days.
            You&apos;ll receive a confirmation email once approved.
          </p>
          <div className="flex items-center gap-2 justify-center text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <FaClock className="shrink-0" />
            Awaiting super admin approval
          </div>
          <Link href="/login">
            <Button className="w-full gradient-auth-card" size="lg">
              Back to Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 gradient-auth-bg py-12">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10 space-y-6">
          {/* Logo */}
          <div className="text-center">
            <Link href="/" className="inline-flex items-center space-x-2">
              <div className="w-12 h-12 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center shadow-lg">
                <FaTooth className="text-white text-2xl" />
              </div>
              <span className="text-2xl font-bold text-gray-900">BrightSmile</span>
            </Link>
            <h2 className="mt-6 text-3xl font-bold text-gray-900">Create an account</h2>
            <p className="mt-2 text-sm text-gray-600">Join BrightSmile today</p>
          </div>

          {/* Type Selector */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
            {([
              { id: "patient", label: "Patient",  icon: FaUser     },
              { id: "clinic",  label: "Clinic",   icon: FaHospital },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setType(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
                  type === id
                    ? "bg-gradient-to-r from-dental-blue to-dental-teal text-white shadow-md"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>

          {/* ── PATIENT FORM ── */}
          {type === "patient" && (
            <form className="space-y-4" onSubmit={handlePatientSubmit}>
              {patientError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {patientError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: "firstName", label: "First Name", placeholder: "Ahmad" },
                  { name: "lastName",  label: "Last Name",  placeholder: "Khoury" },
                ].map((f) => (
                  <div key={f.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                    <input
                      name={f.name}
                      value={(patient as any)[f.name]}
                      onChange={handlePatientChange}
                      type="text"
                      required
                      placeholder={f.placeholder}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <input
                  name="email"
                  value={patient.email}
                  onChange={handlePatientChange}
                  type="email"
                  required
                  placeholder="ahmad@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  name="password"
                  value={patient.password}
                  onChange={handlePatientChange}
                  type="password"
                  required
                  placeholder="Create a password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  name="confirmPassword"
                  value={patient.confirmPassword}
                  onChange={handlePatientChange}
                  type="password"
                  required
                  placeholder="Repeat your password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                />
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full py-6 gradient-auth-card hover:shadow-xl transition-all transform hover:scale-[1.02]"
                size="lg"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Creating account...
                  </span>
                ) : "Create Patient Account"}
              </Button>
            </form>
          )}

          {/* ── CLINIC FORM ── */}
          {type === "clinic" && (
            <form className="space-y-4" onSubmit={handleClinicSubmit}>
              {clinicError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {clinicError}
                </p>
              )}

              {/* Info banner */}
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                <FaClock className="mt-0.5 shrink-0" />
                <span>Clinic accounts require super admin approval before activation.</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Name</label>
                <input
                  name="clinicName"
                  value={clinic.clinicName}
                  onChange={handleClinicChange}
                  type="text"
                  required
                  placeholder="BrightSmile Dental Clinic"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Owner / Director</label>
                  <input
                    name="ownerName"
                    value={clinic.ownerName}
                    onChange={handleClinicChange}
                    type="text"
                    required
                    placeholder="Dr. Sarah Mansour"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    name="phone"
                    value={clinic.phone}
                    onChange={handleClinicChange}
                    type="tel"
                    required
                    placeholder="+961 1 234 567"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Email</label>
                <input
                  name="email"
                  value={clinic.email}
                  onChange={handleClinicChange}
                  type="email"
                  required
                  placeholder="contact@myclinic.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    name="address"
                    value={clinic.address}
                    onChange={handleClinicChange}
                    type="text"
                    required
                    placeholder="Hamra Street, Blvd 12"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    name="city"
                    value={clinic.city}
                    onChange={handleClinicChange}
                    type="text"
                    required
                    placeholder="Beirut"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                  <input
                    name="licenseNumber"
                    value={clinic.licenseNumber}
                    onChange={handleClinicChange}
                    type="text"
                    required
                    placeholder="LBN-2024-00123"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
                  <select
                    name="specialty"
                    value={clinic.specialty}
                    onChange={handleClinicChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 bg-white"
                  >
                    <option value="">Select specialty</option>
                    {SPECIALTIES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  name="password"
                  value={clinic.password}
                  onChange={handleClinicChange}
                  type="password"
                  required
                  placeholder="Create a password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  name="confirmPassword"
                  value={clinic.confirmPassword}
                  onChange={handleClinicChange}
                  type="password"
                  required
                  placeholder="Repeat your password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent text-gray-900 placeholder-gray-400"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full py-6 gradient-auth-card hover:shadow-xl transition-all transform hover:scale-[1.02]"
                size="lg"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </span>
                ) : "Register Clinic"}
              </Button>
            </form>
          )}

          {/* Sign In Link */}
          <p className="text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-auth-blue hover:text-auth-blue-light">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
