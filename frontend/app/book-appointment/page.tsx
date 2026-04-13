"use client";

import { apiFetch } from "@/lib/api/client";
import { toast } from 'sonner';
import Link from "next/link";
import { useState, useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { getStoredPhoto } from "@/lib/profilePhoto";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  FaTooth,
  FaCalendarAlt,
  FaClock,
  FaUserMd,
  FaCheckCircle,
  FaArrowLeft,
  FaArrowRight,
  FaStethoscope,
  FaTeeth,
  FaStar,
} from "react-icons/fa";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

type ServiceType = "checkup" | "procedure" | null;

interface TimeSlot {
  time: string;
  available: boolean;
}

interface Doctor {
  id: number;
  name: string;
  specialty: string;
  available: boolean;
  avatar?: string;
  bio?: string;
}

interface Procedure {
  id: string;
  name: string;
  duration: string;
}

const fallbackTimeSlots = [
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
];

const fallbackDoctors: Doctor[] = [
  {
    id: 1,
    name: "Dr. Sarah Haddad",
    specialty: "General Dentistry",
    available: true,
    bio: "15+ years of experience in general dental care",
  },
  {
    id: 2,
    name: "Dr. Michel Khoury",
    specialty: "Orthodontics",
    available: true,
    bio: "Specialist in braces and teeth alignment",
  },
  {
    id: 3,
    name: "Dr. Layla Nassar",
    specialty: "Cosmetic Dentistry",
    available: true,
    bio: "Expert in smile makeovers and veneers",
  },
];

const procedures: Procedure[] = [
  { id: "cleaning", name: "Teeth Cleaning", duration: "60 min" },
  { id: "whitening", name: "Teeth Whitening", duration: "60 min" },
  { id: "filling", name: "Cavity Filling", duration: "60 min" },
  { id: "extraction", name: "Extraction", duration: "45 min" },
  { id: "rootcanal", name: "Root Canal", duration: "90 min" },
  { id: "crown", name: "Crown Fitting", duration: "90 min" },
];

export default function BookAppointment() {
  const [step, setStep] = useState(1);
  const [selectedDoctor, setSelectedDoctor] = useState<number | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>(null);
  const [selectedProcedure, setSelectedProcedure] = useState<string | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // API state
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>(fallbackDoctors);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [patientName, setPatientName] = useState("");

  const totalSteps = 4;

  // Load patient photo
  useEffect(() => {
    const loadPhoto = async () => {
      let email: string | null = null;
      let name = "";
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) email = session.user.email;
      } catch {}
      const stored = localStorage.getItem("adminUser");
      if (stored) {
        try {
          const u = JSON.parse(stored);
          if (!email) email = u.email ?? null;
          name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
        } catch {}
      }
      if (name) setPatientName(name);
      if (email) setPhotoUrl(getStoredPhoto(email));
    };
    loadPhoto();
  }, []);

  // Fetch doctors on mount
  useEffect(() => {
    fetchDoctors();
  }, []);

  // Fetch available time slots when date changes (filtered by doctor)
  useEffect(() => {
    if (selectedDate && selectedDoctor) {
      fetchAvailableSlots(selectedDate, selectedDoctor);
    }
  }, [selectedDate, selectedDoctor]);

  // Fetch all available dates for the selected doctor when entering step 3
  useEffect(() => {
    if (step === 3 && selectedDoctor) {
      fetchAvailableDates(selectedDoctor);
    }
  }, [step, selectedDoctor]);

  const fetchDoctors = async () => {
    setLoadingDoctors(true);
    try {
      const res = await apiFetch(`/api/users/doctors`);
      const json = await res.json();
      const users: any[] = Array.isArray(json) ? json : (json.data ?? []);
      const mapped = users
        .filter((u) => u.role === "admin" || u.role === "doctor")
        .map((u) => ({
          id: Number(u.id),
          name: `Dr. ${u.first_name} ${u.last_name}`,
          specialty: "General Dentistry",
          available: u.is_active,
          bio: `Available for appointments`,
        }));
      if (mapped.length > 0) setDoctors(mapped);
    } catch (e) {
      console.error("Failed to fetch doctors", e);
    } finally {
      setLoadingDoctors(false);
    }
  };

  const fetchAvailableDates = async (doctorId: number) => {
    setLoadingDates(true);
    try {
      const params = new URLSearchParams({
        doctor_id: String(doctorId),
        limit: "500",
      });
      const res = await apiFetch(`/api/patient/available-slots?${params}`);
      const data = await res.json();
      const dates = new Set<string>(
        (data.data || []).map((s: any) =>
          (s.slot_date || s.start_time || "").slice(0, 10)
        )
      );
      setAvailableDates(dates);
    } catch {
      setAvailableDates(new Set());
    } finally {
      setLoadingDates(false);
    }
  };

  const fetchAvailableSlots = async (date: Date, doctorId: number) => {
    setLoadingSlots(true);
    try {
      const pad = (n: number) => String(n).padStart(2, "0");
      const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const params = new URLSearchParams({
        doctor_id: String(doctorId),
        date: dateStr,
        limit: "100",
      });
      const res = await apiFetch(`/api/patient/available-slots?${params}`);
      const data = await res.json();
      const slots = (data.data || []).map((s: any) => ({
        time: new Date(s.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
        available: true,
      }));
      setTimeSlots(slots);
    } catch (e) {
      setTimeSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedDate || !selectedTime || !selectedDoctor) return;

    setSubmitting(true);
    setError(null);
    try {
      // Resolve current user via backend JWT
      const meRes = await apiFetch(`/api/auth/me`);
      if (!meRes.ok) throw new Error("Could not resolve your account. Please log in again.");
      const dbUser = await meRes.json();

      // Resolve patient profile ID
      const profileRes = await apiFetch(`/api/patients/by-user/${dbUser.id}`);
      if (!profileRes.ok) {
        throw new Error("Patient profile not found. Please complete your profile before booking.");
      }
      const profile = await profileRes.json();

      const pad2 = (n: number) => String(n).padStart(2, "0");
      const dateStr = `${selectedDate.getFullYear()}-${pad2(selectedDate.getMonth() + 1)}-${pad2(selectedDate.getDate())}`;

      const slotsRes = await apiFetch(
        `/api/patient/available-slots?doctor_id=${selectedDoctor}&date=${dateStr}&limit=100`
      );
      const slotsData = await slotsRes.json();

      const slot = (slotsData.data || []).find((s: any) => {
        const slotTime = new Date(s.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
        return slotTime === selectedTime;
      });

      if (!slot) {
        throw new Error("This time slot is no longer available. Please select another slot.");
      }

      const res = await apiFetch(`/api/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: Number(profile.id),
          slot_id: Number(slot.id),
          reason: getSelectedProcedureInfo()?.name ?? (serviceType === "checkup" ? "Regular Checkup" : "Checkup"),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(Array.isArray(err.message) ? err.message.join(", ") : err.message || "Booking failed");
      }
      toast.success("Appointment booked successfully!");
      setBookingSuccess(true);
    } catch (e: any) {
      setError(e.message || "Failed to book appointment. Please try again.");
      toast.error(e.message || "Failed to book appointment.");
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return selectedDoctor !== null;
      case 2:
        return (
          serviceType !== null &&
          (serviceType === "checkup" || selectedProcedure !== null)
        );
      case 3:
        return selectedDate !== undefined;
      case 4:
        return selectedTime !== null;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < totalSteps && canProceed()) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const getSelectedDoctorInfo = () =>
    doctors.find((d) => d.id === selectedDoctor);
  const getSelectedProcedureInfo = () =>
    procedures.find((p) => p.id === selectedProcedure);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link
              href="/patient-dashboard"
              className="flex items-center space-x-2"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
                <FaTooth className="text-white text-xl" />
              </div>
              <span className="text-xl font-bold text-gray-900">
                BrightSmile
              </span>
            </Link>
            <div className="flex items-center gap-4">
              {(photoUrl || patientName) && (
                <Avatar name={patientName || "User"} size="sm" src={photoUrl} />
              )}
              <Link
                href="/patient-dashboard"
                className="text-gray-600 hover:text-dental-blue transition-colors flex items-center gap-2"
              >
                <FaArrowLeft className="text-sm" />
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page Title */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Book Your Appointment
          </h1>
          <p className="text-gray-600 text-lg">
            Schedule your visit in just a few simple steps
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-center">
            {[1, 2, 3, 4].map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg transition-all duration-300 ${
                    step > s
                      ? "bg-green-500 text-white"
                      : step === s
                        ? "bg-dental-blue text-white shadow-lg shadow-dental-blue/30 scale-110"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {step > s ? <FaCheckCircle /> : s}
                </div>
                {i < 3 && (
                  <div
                    className={`w-16 sm:w-24 h-1 mx-2 rounded-full transition-all duration-300 ${
                      step > s ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-4">
            <div className="grid grid-cols-4 gap-4 sm:gap-16 text-center text-sm">
              <span
                className={
                  step >= 1 ? "text-dental-blue font-medium" : "text-gray-400"
                }
              >
                Doctor
              </span>
              <span
                className={
                  step >= 2 ? "text-dental-blue font-medium" : "text-gray-400"
                }
              >
                Service
              </span>
              <span
                className={
                  step >= 3 ? "text-dental-blue font-medium" : "text-gray-400"
                }
              >
                Date
              </span>
              <span
                className={
                  step >= 4 ? "text-dental-blue font-medium" : "text-gray-400"
                }
              >
                Time
              </span>
            </div>
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-10 mb-8">
          {/* Step 1: Doctor Selection */}
          {step === 1 && (
            <div className="animate-fadeIn">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Choose Your Dentist
              </h2>
              <p className="text-gray-600 mb-8">
                Select the doctor you'd like to see for your appointment
              </p>

              {loadingDoctors ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-dental-blue"></div>
                  <span className="ml-3 text-gray-600">Loading doctors...</span>
                </div>
              ) : (
                <div className="grid md:grid-cols-3 gap-6">
                  {doctors.map((doctor) => {
                    const isSelected = selectedDoctor === doctor.id;
                    return (
                      <button
                        key={doctor.id}
                        onClick={() => {
                          if (!doctor.available) return;
                          setSelectedDoctor(isSelected ? null : doctor.id);
                        }}
                        disabled={!doctor.available}
                        className={`relative p-6 rounded-2xl border-2 transition-all text-left ${
                          !doctor.available
                            ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                            : isSelected
                              ? "border-dental-blue bg-dental-blue/5 shadow-lg"
                              : "border-gray-200 hover:border-dental-blue/50 hover:shadow-md"
                        }`}
                      >
                        <div className="mb-4 mx-auto w-fit">
                          <Avatar name={doctor.name} size="xl" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 text-center">
                          {doctor.name}
                        </h3>
                        <p className="text-dental-blue text-sm text-center font-medium mb-2">
                          {doctor.specialty}
                        </p>
                        {doctor.bio && (
                          <p className="text-gray-500 text-xs text-center">
                            {doctor.bio}
                          </p>
                        )}
                        <div className="flex items-center justify-center gap-1 mt-3">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <FaStar key={star} className="text-yellow-400 text-sm" />
                          ))}
                        </div>
                        {!doctor.available && (
                          <span className="inline-block mt-3 text-xs font-medium text-red-500 bg-red-50 px-2 py-1 rounded-full w-full text-center">
                            Not Available Today
                          </span>
                        )}
                        {doctor.available && isSelected && (
                          <div className="absolute top-3 right-3 flex flex-col items-center gap-1">
                            <div className="w-8 h-8 bg-dental-blue rounded-full flex items-center justify-center">
                              <FaCheckCircle className="text-white" />
                            </div>
                            <span className="text-[10px] text-dental-blue font-medium">tap to deselect</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Service Type */}
          {step === 2 && (
            <div className="animate-fadeIn">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                What would you like to book?
              </h2>
              <p className="text-gray-600 mb-8">
                Choose between a routine checkup or a specific procedure
              </p>

              <div className="grid md:grid-cols-2 gap-6 mb-8">
                {/* Checkup Option */}
                <button
                  onClick={() => {
                    setServiceType("checkup");
                    setSelectedProcedure(null);
                  }}
                  className={`relative p-8 rounded-2xl border-2 transition-all duration-300 text-left group hover:shadow-lg ${
                    serviceType === "checkup"
                      ? "border-dental-blue bg-dental-blue/5 shadow-lg"
                      : "border-gray-200 hover:border-dental-blue/50"
                  }`}
                >
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                      serviceType === "checkup"
                        ? "bg-dental-blue text-white"
                        : "bg-gray-100 text-gray-500 group-hover:bg-dental-blue/10 group-hover:text-dental-blue"
                    }`}
                  >
                    <FaStethoscope className="text-3xl" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Regular Checkup
                  </h3>
                  <p className="text-gray-600">
                    Routine dental examination to ensure your oral health is in
                    great shape
                  </p>
                  <span className="inline-block mt-4 text-sm font-medium text-dental-blue">
                    Duration: 30 min
                  </span>
                  {serviceType === "checkup" && (
                    <div className="absolute top-4 right-4 w-8 h-8 bg-dental-blue rounded-full flex items-center justify-center">
                      <FaCheckCircle className="text-white" />
                    </div>
                  )}
                </button>

                {/* Procedure Option */}
                <button
                  onClick={() => setServiceType("procedure")}
                  className={`relative p-8 rounded-2xl border-2 transition-all duration-300 text-left group hover:shadow-lg ${
                    serviceType === "procedure"
                      ? "border-dental-blue bg-dental-blue/5 shadow-lg"
                      : "border-gray-200 hover:border-dental-blue/50"
                  }`}
                >
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                      serviceType === "procedure"
                        ? "bg-dental-blue text-white"
                        : "bg-gray-100 text-gray-500 group-hover:bg-dental-blue/10 group-hover:text-dental-blue"
                    }`}
                  >
                    <FaTeeth className="text-3xl" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Dental Procedure
                  </h3>
                  <p className="text-gray-600">
                    Specific treatments like cleaning, whitening, fillings, and
                    more
                  </p>
                  <span className="inline-block mt-4 text-sm font-medium text-dental-blue">
                    Various durations
                  </span>
                  {serviceType === "procedure" && (
                    <div className="absolute top-4 right-4 w-8 h-8 bg-dental-blue rounded-full flex items-center justify-center">
                      <FaCheckCircle className="text-white" />
                    </div>
                  )}
                </button>
              </div>

              {/* Procedure Selection */}
              {serviceType === "procedure" && (
                <div className="animate-fadeIn">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Select a procedure
                  </h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {procedures.map((proc) => (
                      <button
                        key={proc.id}
                        onClick={() => setSelectedProcedure(proc.id)}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          selectedProcedure === proc.id
                            ? "border-dental-blue bg-dental-blue/5"
                            : "border-gray-200 hover:border-dental-blue/50"
                        }`}
                      >
                        <p className="font-semibold text-gray-900">
                          {proc.name}
                        </p>
                        <p className="text-sm text-gray-500">{proc.duration}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Doctor Info */}
              <div className="mt-8 p-4 bg-gray-50 rounded-xl flex items-center gap-4">
                <Avatar name={getSelectedDoctorInfo()?.name ?? ""} size="md" />
                <div>
                  <p className="text-sm text-gray-500">Your selected doctor</p>
                  <p className="font-semibold text-gray-900">
                    {getSelectedDoctorInfo()?.name}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Date Selection */}
          {step === 3 && (
            <div className="animate-fadeIn">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Choose a Date
              </h2>
              <p className="text-gray-600 mb-8">
                Select your preferred appointment date with{" "}
                {getSelectedDoctorInfo()?.name}
              </p>

              <div className="flex justify-center">
                {loadingDates ? (
                  <div className="flex items-center gap-3 py-16 text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dental-blue" />
                    Loading available dates...
                  </div>
                ) : (
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (date < today || date.getDay() === 0) return true;
                    if (availableDates.size > 0) {
                      const pad = (n: number) => String(n).padStart(2, "0");
                      const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
                      if (!availableDates.has(key)) return true;
                    }
                    return false;
                  }}
                  className="rounded-2xl border-2 border-gray-200 p-4"
                  classNames={{
                    months: "space-y-4",
                    month: "space-y-4",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-lg font-semibold",
                    nav: "space-x-1 flex items-center",
                    nav_button:
                      "h-9 w-9 bg-transparent p-0 hover:bg-gray-100 rounded-lg",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    head_cell:
                      "text-gray-500 rounded-md w-12 font-medium text-sm",
                    row: "flex w-full mt-2",
                    cell: "text-center text-sm p-0 relative",
                    day: "h-12 w-12 p-0 font-normal rounded-xl hover:bg-dental-blue/10 transition-colors",
                    day_selected:
                      "bg-dental-blue text-white hover:bg-dental-blue hover:text-white focus:bg-dental-blue focus:text-white",
                    day_today: "bg-gray-100 text-gray-900 font-semibold",
                    day_outside: "text-gray-300",
                    day_disabled: "text-gray-300 hover:bg-transparent",
                  }}
                />
              // </div>

                )}
              </div>

              {selectedDate && (
                <div className="mt-6 text-center">
                  <p className="text-lg">
                    Selected:{" "}
                    <span className="font-semibold text-dental-blue">
                      {selectedDate.toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Time Selection */}
          {step === 4 && (
            <div className="animate-fadeIn">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Select a Time
              </h2>
              <p className="text-gray-600 mb-8">
                Choose an available time slot with{" "}
                {getSelectedDoctorInfo()?.name}
              </p>

              {loadingSlots ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-dental-blue"></div>
                  <span className="ml-3 text-gray-600">
                    Loading {getSelectedDoctorInfo()?.name}'s available slots...
                  </span>
                </div>
              ) : timeSlots.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FaClock className="mx-auto text-4xl mb-3 text-gray-300" />
                  <p className="font-medium">No available slots for this date.</p>
                  <p className="text-sm mt-1">Please select a different date or doctor.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                  {timeSlots.map((slot) => {
                    const isSelected = selectedTime === slot.time;
                    return (
                      <button
                        key={slot.time}
                        onClick={() => {
                          if (!slot.available) return;
                          setSelectedTime(isSelected ? null : slot.time);
                        }}
                        disabled={!slot.available}
                        className={`p-4 rounded-xl border-2 font-medium transition-all ${
                          !slot.available
                            ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed line-through"
                            : isSelected
                              ? "border-dental-blue bg-dental-blue text-white shadow-lg shadow-dental-blue/30"
                              : "border-gray-200 hover:border-dental-blue/50 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <FaClock
                          className={`mx-auto mb-2 ${
                            !slot.available
                              ? "text-gray-400"
                              : isSelected
                                ? "text-white"
                                : "text-dental-blue"
                          }`}
                        />
                        {slot.time}
                        {isSelected && (
                          <span className="block text-[10px] mt-1 text-white/80">
                            tap to deselect
                          </span>
                        )}
                        {!slot.available && (
                          <span className="block text-xs mt-1 text-gray-400">
                            Booked
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Appointment Summary */}
              {selectedTime && (
                <div className="mt-8 p-6 bg-gradient-to-r from-dental-blue/5 to-dental-teal/5 rounded-2xl">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    Appointment Summary
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-dental-blue/10 rounded-lg flex items-center justify-center">
                        <FaUserMd className="text-dental-blue" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Dentist</p>
                        <p className="font-semibold text-gray-900">
                          {getSelectedDoctorInfo()?.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-dental-blue/10 rounded-lg flex items-center justify-center">
                        <FaStethoscope className="text-dental-blue" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Service</p>
                        <p className="font-semibold text-gray-900">
                          {serviceType === "checkup"
                            ? "Regular Checkup"
                            : getSelectedProcedureInfo()?.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-dental-blue/10 rounded-lg flex items-center justify-center">
                        <FaCalendarAlt className="text-dental-blue" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Date & Time</p>
                        <p className="font-semibold text-gray-900">
                          {selectedDate?.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          at {selectedTime}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-dental-blue/10 rounded-lg flex items-center justify-center">
                        <FaClock className="text-dental-blue" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Duration</p>
                        <p className="font-semibold text-gray-900">
                          {serviceType === "checkup"
                            ? "30 min"
                            : getSelectedProcedureInfo()?.duration}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center">
            {error}
          </div>
        )}

        {/* Navigation Buttons */}
        {!bookingSuccess && (
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 1 || submitting}
              className={`px-6 py-3 ${step === 1 ? "opacity-0 pointer-events-none" : ""}`}
            >
              <FaArrowLeft className="mr-2" />
              Back
            </Button>

            {step < totalSteps ? (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
                className="px-8 py-3 bg-dental-blue hover:bg-dental-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
                <FaArrowRight className="ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleBookAppointment}
                disabled={!canProceed() || submitting}
                className="px-8 py-3 bg-gradient-to-r from-dental-blue to-dental-teal hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Booking...
                  </>
                ) : (
                  <>
                    Confirm Appointment
                    <FaCheckCircle className="ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Success Message */}
        {bookingSuccess && (
          <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-10 text-center animate-fadeIn">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <FaCheckCircle className="text-green-500 text-4xl" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Appointment Booked!
            </h2>
            <p className="text-gray-600 mb-6">
              Your appointment has been successfully scheduled for{" "}
              <span className="font-semibold">
                {selectedDate?.toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>{" "}
              at <span className="font-semibold">{selectedTime}</span>
            </p>
            <p className="text-gray-600 mb-8">
              with{" "}
              <span className="font-semibold">
                {getSelectedDoctorInfo()?.name}
              </span>
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/patient-dashboard">
                <Button className="px-6 py-3 bg-dental-blue hover:bg-dental-blue/90">
                  Go to Dashboard
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  setStep(1);
                  setSelectedDoctor(null);
                  setServiceType(null);
                  setSelectedProcedure(null);
                  setSelectedDate(undefined);
                  setSelectedTime(null);
                  setBookingSuccess(false);
                  setTimeSlots([]);
                }}
                className="px-6 py-3"
              >
                Book Another
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
