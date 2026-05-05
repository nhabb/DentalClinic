"use client";
import { apiFetch } from '@/lib/api/client';
import { toast } from 'sonner';

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { safeStorage } from "@/lib/browser-compat";
import { supabase } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { StatsCard } from "@/components/ui/StatsCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Badge } from "@/components/ui/Badge";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import {
  FaCalendarAlt,
  FaSearch,
  FaCheckCircle,
  FaClock,
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
  FaPhone,
  FaEllipsisV,
  FaCalendarCheck,
  FaCalendarTimes,
  FaUserMd,
  FaCalendarPlus,
  FaBan,
} from "react-icons/fa";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const PROCEDURE_DURATIONS: Record<string, number> = {
  "Regular Checkup": 30,
  "Teeth Cleaning": 60,
  "Cavity Filling": 60,
  "Root Canal": 90,
  "Teeth Whitening": 60,
  "Crown Fitting": 90,
  "Extraction": 45,
};

const getProcedureDuration = (reason: string) =>
  PROCEDURE_DURATIONS[reason.replace(/^Rescheduled: /, "")] ?? 30;

const addMinutesToTime = (hhmm: string, minutes: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

interface Appointment {
  id: number;
  date: string;
  time: string;
  patient: string;
  phone: string;
  type: string;
  duration: number;
  status: string;
  notes: string;
  doctor: string;
  doctorId: number;
  patientId: number;
  isRescheduled: boolean;
}

interface Doctor {
  id: number;
  name: string;
  specialty: string;
  color: string;
}

export default function AppointmentsManagement() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAppt, setNewAppt] = useState({ patientId: "", doctorId: "", date: "", startTime: "09:00", endTime: "10:00", reason: "Regular Checkup" });
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<{ id: number; label: string }[]>([]);
  const [patients, setPatients] = useState<{ id: number; name: string }[]>([]);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [timeRanges, setTimeRanges] = useState<{ fromTime: string; toTime: string; slotDuration: number }[]>([
    { fromTime: "09:00", toTime: "17:00", slotDuration: 30 },
  ]);
  const [existingSlots, setExistingSlots] = useState<{ id: number; time: string; isBooked: boolean }[]>([]);
  const [loadingExistingSlots, setLoadingExistingSlots] = useState(false);
  const [selectedAvailabilityDoctorId, setSelectedAvailabilityDoctorId] = useState<number | null>(null);
  const [availabilityMsg, setAvailabilityMsg] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [currentDoctorDbId, setCurrentDoctorDbId] = useState<number | null>(null);

  // Slot calendar state
  const [showSlotCalendar, setShowSlotCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarDoctorId, setCalendarDoctorId] = useState<number | null>(null);
  const [monthSlots, setMonthSlots] = useState<Record<string, {
    id: number;
    appointmentId?: number;
    time: string;
    endTime?: string;
    isBooked: boolean;
    appointmentStatus?: string;
    patientName?: string;
  }[]>>({});
  const [loadingMonthSlots, setLoadingMonthSlots] = useState(false);
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<string | null>(null);

  // Role-based state
  const [userRole, setUserRole] = useState<string>("doctor");
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [assignedDoctorIds, setAssignedDoctorIds] = useState<number[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Data state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Postpone state
  const [postponeApptId, setPostponeApptId] = useState<number | null>(null);
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeTime, setPostponeTime] = useState("");
  const [postponeEndTime, setPostponeEndTime] = useState("");
  const [postponeLoading, setPostponeLoading] = useState(false);

  // Check auth and load user data (auth disabled)
  useEffect(() => {
    // Auth disabled - allow access
    // const isAuthenticated = safeStorage.getItem("adminAuth") === "true";
    // if (!isAuthenticated) {
    //   router.push("/admin/login");
    //   return;
    // }

    const role = safeStorage.getItem("userRole") || "doctor";
    const storedDoctorId = safeStorage.getItem("doctorId");
    const storedAssignedIds = safeStorage.getItem("assignedDoctorIds");
    const storedUser = safeStorage.getItem("adminUser");

    setUserRole(role);
    if (storedDoctorId) setDoctorId(parseInt(storedDoctorId));
    if (storedAssignedIds) setAssignedDoctorIds(JSON.parse(storedAssignedIds));
    if (storedUser) setCurrentUser(JSON.parse(storedUser));

    // Resolve the logged-in user's DB id via Supabase session or localStorage fallback
    const resolveDbUser = async () => {
      let email: string | null = null;

      // Try Supabase session first, fall back to localStorage
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) email = session.user.email;
      } catch {}

      if (!email) {
        const stored = safeStorage.getItem("adminUser");
        if (stored) {
          try { email = JSON.parse(stored)?.email ?? null; } catch {}
        }
      }

      if (!email) return;

      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
        const res = await fetch(`${API_URL}/api/users/by-email?email=${encodeURIComponent(email)}`);
        if (!res.ok) return;
        const user = await res.json();
        if (user?.id) setCurrentDoctorDbId(Number(user.id));
      } catch {}
    };
    resolveDbUser();
  }, [router]);

  // Fetch appointments and doctors
  useEffect(() => {
    const fetchData = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
        const [appointmentsRes, usersRes, doctorsRes] = await Promise.all([
          apiFetch(`/api/appointments?limit=1000`),
          apiFetch(`/api/users`),
          fetch(`${API_URL}/api/users/doctors`),
        ]);
        const appointmentsData = await appointmentsRes.json();
        const users: any[] = usersRes.ok ? await usersRes.json() : [];
        const doctorsList: any[] = doctorsRes.ok ? await doctorsRes.json() : [];

        const doctors = doctorsList
          .filter((u) => u.first_name === "Ahmed" && u.last_name === "Hassan")
          .map((u, i) => ({
          id: Number(u.id),
          name: `${u.first_name} ${u.last_name}`,
          specialty: "Dentist",
          color: ["bg-blue-500", "bg-teal-500", "bg-purple-500"][i % 3],
        }));
        setDoctors(doctors);

        const mapped = (appointmentsData.data || []).map((a: any) => {
          const patientUser = a.patient_profiles?.users;
          const doctorId = a.doctor_id || a.created_by;
          const doctor = users.find((u) => u.id === doctorId || u.id === String(doctorId));
          const time = a.start_time ? (() => { const d = new Date(a.start_time); return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`; })() : "";
          return {
            id: Number(a.id),
            date: a.appointment_date ? String(a.appointment_date).slice(0, 10) : "",
            time,
            patient: patientUser ? `${patientUser.first_name} ${patientUser.last_name}` : `Patient #${a.patient_id}`,
            phone: patientUser?.phone || "",
            type: (a.reason || "Checkup").replace(/^Rescheduled: /, ""),
            duration: a.end_time && a.start_time
              ? Math.round((new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000)
              : getProcedureDuration(a.reason || ""),
            status: a.status,
            notes: a.notes || "",
            doctor: doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : "",
            doctorId: Number(doctorId),
            patientId: Number(a.patient_id || 0),
            isRescheduled: (a.reason || "").startsWith("Rescheduled:"),
          };
        });
        setAppointments(mapped);
      } catch (e) {
        console.error("Failed to fetch appointments", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedDate]);


  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("userRole");
    safeStorage.removeItem("doctorId");
    safeStorage.removeItem("assignedDoctorIds");
    router.push("/login");
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge icon={FaCheckCircle} bgClass="bg-green-100" textClass="text-green-700">
            Completed
          </Badge>
        );
      case "confirmed":
        return (
          <Badge icon={FaCheckCircle} bgClass="bg-blue-100" textClass="text-blue-700">
            Confirmed
          </Badge>
        );
      case "scheduled":
        return (
          <Badge icon={FaClock} bgClass="bg-yellow-100" textClass="text-yellow-700">
            Scheduled
          </Badge>
        );
      case "no_show":
        return (
          <Badge icon={FaTimes} bgClass="bg-orange-100" textClass="text-orange-700">
            No Show
          </Badge>
        );
      case "cancelled":
        return (
          <Badge icon={FaTimes} bgClass="bg-red-100" textClass="text-red-700">
            {t("appointments.cancelled")}
          </Badge>
        );
      default:
        return null;
    }
  };

  const getDoctorColor = (doctorName: string) => {
    const doctor = doctors.find((d) => d.name === doctorName);
    return doctor?.color || "bg-gray-500";
  };

  const selectedDateStr = (() => {
    const d = selectedDate;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  const filteredAppointments = appointments.filter((apt) => {
    const matchesSearch =
      apt.patient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      apt.type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDoctor =
      selectedDoctor === "all" || apt.doctorId === Number(selectedDoctor);
    const matchesDate = apt.date === selectedDateStr;
    return matchesSearch && matchesDoctor && matchesDate;
  });

  const dateAppointments = appointments.filter((a) => a.date === selectedDateStr);

  const todayStats = {
    total: dateAppointments.length,
    completed: dateAppointments.filter((a) => a.status === "completed").length,
    upcoming: dateAppointments.filter((a) => ["scheduled", "confirmed"].includes(a.status)).length,
    cancelled: dateAppointments.filter((a) => ["cancelled", "no_show"].includes(a.status)).length,
  };

  const navigateDate = (direction: "prev" | "next") => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1));
    setSelectedDate(newDate);
  };

  const fetchMonthSlots = async (doctorId: number, targetMonth?: Date) => {
    setLoadingMonthSlots(true);
    try {
      const toTime = (raw: string) => { const d = new Date(raw); return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`; };

      const month = targetMonth ?? calendarMonth;
      const year = month.getFullYear();
      const monthNum = month.getMonth();
      const daysInMonth = new Date(year, monthNum + 1, 0).getDate();
      const pad = (n: number) => String(n).padStart(2, "0");

      // Build date strings for every day of the month
      const dayDates = Array.from({ length: daysInMonth }, (_, i) =>
        `${year}-${pad(monthNum + 1)}-${pad(i + 1)}`
      );

      // Fetch slots per day (same API as Open Availability) + appointments in parallel
      const [daySlotResults, apptRes] = await Promise.all([
        Promise.all(
          dayDates.map((date) =>
            apiFetch(`/api/appointment-slots?doctor_id=${doctorId}&date=${date}&limit=100`)
              .then((r) => (r.ok ? r.json() : { data: [] }))
              .catch((e) => { console.error("[MySlots] fetch error:", e); return { data: [] }; })
          )
        ),
        apiFetch(`/api/appointments?limit=1000`),
      ]);

      const apptData = apptRes.ok ? await apptRes.json() : { data: [] };
      const grouped: typeof monthSlots = {};

      // Open (unbooked) slots — one batch per day
      for (let i = 0; i < dayDates.length; i++) {
        const date = dayDates[i];
        for (const s of (daySlotResults[i].data || []) as any[]) {
          if (s.is_booked) continue;
          (grouped[date] ??= []).push({
            id: Number(s.id),
            time: s.start_time ? toTime(s.start_time) : "",
            endTime: s.end_time ? toTime(s.end_time) : undefined,
            isBooked: false,
          });
        }
      }

      // Booked appointments
      for (const a of (apptData.data || []) as any[]) {
        if (a.status === "cancelled") continue;
        const dateStr = a.appointment_date ? String(a.appointment_date).slice(0, 10) : "";
        if (!dateStr) continue;
        const patientUser = a.patient_profiles?.users;
        const patientName = patientUser
          ? `${patientUser.first_name} ${patientUser.last_name}`
          : `Patient #${a.patient_id}`;
        const time = a.start_time ? toTime(a.start_time) : "";
        (grouped[dateStr] ??= []).push({
          id: Number(a.id),
          appointmentId: Number(a.id),
          time,
          isBooked: true,
          appointmentStatus: a.status,
          patientName,
        });
      }

      setMonthSlots(grouped);
    } catch {
      setMonthSlots({});
    } finally {
      setLoadingMonthSlots(false);
    }
  };

  const handleCalendarDeleteSlot = async (slotId: number, date: string) => {
    try {
      const res = await apiFetch(`/api/appointment-slots/${slotId}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete slot."); return; }
      toast.success("Slot deleted.");
      setMonthSlots((prev) => {
        const updated = { ...prev };
        updated[date] = (updated[date] || []).filter((s) => s.id !== slotId);
        if (updated[date].length === 0) delete updated[date];
        return updated;
      });
      if ((monthSlots[date] || []).filter((s) => s.id !== slotId).length === 0) {
        setCalendarSelectedDay(null);
      }
    } catch {}
  };

  const fetchExistingSlots = async (doctorId: number, date: string) => {
    if (!doctorId || !date) return;
    setLoadingExistingSlots(true);
    try {
      const res = await apiFetch(`/api/appointment-slots?doctor_id=${doctorId}&date=${date}&limit=100`);
      const data = await res.json();
      setExistingSlots(
        (data.data || []).map((s: any) => ({
          id: Number(s.id),
          time: (() => { const d = new Date(s.start_time); return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`; })(),
          isBooked: s.is_booked,
        }))
      );
    } catch {
      setExistingSlots([]);
    } finally {
      setLoadingExistingSlots(false);
    }
  };

  const handleDeleteSlot = async (slotId: number) => {
    try {
      const res = await apiFetch(`/api/appointment-slots/${slotId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message || "Failed to delete slot.");
        return;
      }
      toast.success("Slot deleted.");
      setExistingSlots((prev) => prev.filter((s) => s.id !== slotId));
    } catch {
      toast.error("Failed to delete slot.");
    }
  };

  const handleOpenAvailability = async () => {
    if (!availabilityDate) { setAvailabilityMsg("Please select a date."); return; }
    const doctorId = selectedAvailabilityDoctorId;
    if (!doctorId) { setAvailabilityMsg("Please select a doctor."); return; }
    setAvailabilityLoading(true);
    setAvailabilityMsg("");
    let totalCreated = 0, totalSkipped = 0;
    try {
      for (const range of timeRanges) {
        const [fh, fm] = range.fromTime.split(":").map(Number);
        const [th, tm] = range.toTime.split(":").map(Number);
        const totalMinutes = (th * 60 + tm) - (fh * 60 + fm);
        if (totalMinutes <= 0) continue;
        const duration_minutes = range.slotDuration > 0 ? range.slotDuration : 30;
        const res = await apiFetch(`/api/appointment-slots/bulk`, {
          method: "POST",
          body: JSON.stringify({
            doctor_id: doctorId,
            slot_date: availabilityDate,
            from_time: range.fromTime,
            to_time: range.toTime,
            duration_minutes,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to create slots");
        totalCreated += data.created;
        totalSkipped += data.skipped;
      }
      setAvailabilityMsg(`Created ${totalCreated} slot(s)${totalSkipped > 0 ? `, skipped ${totalSkipped} duplicate(s)` : ""}.`);
      toast.success(`Created ${totalCreated} slot(s)${totalSkipped > 0 ? `, skipped ${totalSkipped} duplicate(s)` : ""}.`);
      fetchExistingSlots(doctorId, availabilityDate);
    } catch (e: any) {
      setAvailabilityMsg(e.message || "Failed to create slots.");
      toast.error(e.message || "Failed to create slots.");
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const openAddModal = async () => {
    setAddError("");
    setNewAppt({ patientId: "", doctorId: "", date: "", startTime: "09:00", endTime: "10:00", reason: "Regular Checkup" });
    setShowAddModal(true);
    try {
      const patientsRes = await apiFetch(`/api/patients`);
      const patientsData = await patientsRes.json();
      const mappedPatients = (patientsData.data || []).map((p: any) => ({
        id: Number(p.id),
        name: p.users ? `${p.users.first_name} ${p.users.last_name}` : `Patient #${p.id}`,
      }));
      setPatients(mappedPatients);
    } catch (e) {
      setAddError("Failed to load patients.");
    }
  };

  const handleAddAppointment = async () => {
    if (!newAppt.patientId || !newAppt.doctorId || !newAppt.date || !newAppt.startTime || !newAppt.endTime) {
      setAddError("Please fill in all required fields.");
      return;
    }
    if (newAppt.startTime >= newAppt.endTime) {
      setAddError("End time must be after start time.");
      return;
    }
    setAddLoading(true);
    setAddError("");
    try {
      const res = await apiFetch(`/api/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: Number(newAppt.patientId),
          doctor_id: Number(newAppt.doctorId),
          appointment_date: newAppt.date,
          start_time: newAppt.startTime,
          end_time: newAppt.endTime,
          reason: newAppt.reason,
          auto_confirm: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(Array.isArray(err.message) ? err.message.join(", ") : (err.message || "Failed to create appointment."));
      }
      toast.success("Appointment created.");
      setShowAddModal(false);
      const [y, mo, d] = newAppt.date.split("-").map(Number);
      setSelectedDate(new Date(y, mo - 1, d));
    } catch (e: any) {
      setAddError(e.message || "Failed to create appointment.");
    } finally {
      setAddLoading(false);
    }
  };

  const handleConfirmAppointment = async (appointmentId: number) => {
    try {
      const res = await apiFetch(`/api/appointments/${appointmentId}/confirm`, { method: "PATCH" });
      if (!res.ok) { toast.error("Failed to confirm appointment."); return; }
      setAppointments((prev) =>
        prev.map((apt) => apt.id === appointmentId ? { ...apt, status: "confirmed" } : apt),
      );
      toast.success("Appointment confirmed.");
    } catch {
      toast.error("Failed to confirm appointment.");
    }
  };

  const handleCompleteAppointment = async (appointmentId: number) => {
    try {
      const res = await apiFetch(`/api/appointments/${appointmentId}/complete`, { method: "PATCH" });
      if (!res.ok) { toast.error("Failed to complete appointment."); return; }
      setAppointments((prev) =>
        prev.map((apt) => apt.id === appointmentId ? { ...apt, status: "completed" } : apt),
      );
      toast.success("Appointment completed.");
    } catch {
      toast.error("Failed to complete appointment.");
    }
  };

  const handleNoShowAppointment = async (appointmentId: number) => {
    try {
      const res = await apiFetch(`/api/appointments/${appointmentId}/no-show`, { method: "PATCH" });
      if (!res.ok) { toast.error("Failed to mark as no-show."); return; }
      setAppointments((prev) =>
        prev.map((apt) => apt.id === appointmentId ? { ...apt, status: "no_show" } : apt),
      );
      toast.success("Marked as no-show.");
    } catch {
      toast.error("Failed to mark as no-show.");
    }
  };

  const handleCancelAppointment = async (appointmentId: number) => {
    try {
      const res = await apiFetch(`/api/appointments/${appointmentId}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) { toast.error("Failed to cancel appointment."); return; }
      toast.success("Appointment cancelled.");
      setAppointments((prev) =>
        prev.map((apt) => apt.id === appointmentId ? { ...apt, status: "cancelled" } : apt),
      );
    } catch {
      toast.error("Failed to cancel appointment.");
    }
  };

  const handlePostponeSubmit = async () => {
    const appt = appointments.find((a) => a.id === postponeApptId);
    if (!appt || !postponeDate || !postponeTime || !postponeEndTime) return;
    if (postponeTime >= postponeEndTime) { toast.error("End time must be after start time."); return; }
    setPostponeLoading(true);
    try {
      const cancelRes = await apiFetch(`/api/appointments/${appt.id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Postponed" }),
      });
      if (!cancelRes.ok) { toast.error("Failed to cancel original appointment."); return; }

      const bookRes = await apiFetch(`/api/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: appt.patientId,
          doctor_id: appt.doctorId,
          appointment_date: postponeDate,
          start_time: postponeTime,
          end_time: postponeEndTime,
          reason: `Rescheduled: ${appt.type}`,
          auto_confirm: true,
        }),
      });
      if (!bookRes.ok) { toast.error("Failed to book new appointment."); return; }

      toast.success(`Appointment rescheduled to ${postponeDate} at ${postponeTime}.`);
      setPostponeApptId(null);
      const [y, mo, d] = postponeDate.split("-").map(Number);
      setSelectedDate(new Date(y, mo - 1, d));
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setPostponeLoading(false);
    }
  };

  // Filter doctors list based on role
  const visibleDoctors =
    userRole === "doctor" && doctorId
      ? doctors.filter((d) => d.id === doctorId)
      : userRole === "secretary" && assignedDoctorIds.length > 0
        ? doctors.filter((d) => assignedDoctorIds.includes(d.id))
        : doctors;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar
        onToggle={() => setSidebarOpen((v) => !v)}
        activePage="appointments"
        sidebarOpen={sidebarOpen}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <AdminPageHeader
          title={t("appointments.appointments")}
          subtitle={`${currentUser ? `${currentUser.firstName} ${currentUser.lastName}'s` : t("common.manage")} ${t("appointments.manageAppointments")}`}
          data={appointments}
          filename="appointments"
          onImport={(rows) =>
            setAppointments((prev) => [...prev, ...(rows as Appointment[])])
          }
          onAdd={openAddModal}
          addLabel={t("appointments.newAppointment")}
          extraActions={
            <div className="flex gap-2">
              <button
                onClick={() => { setAvailabilityMsg(""); setExistingSlots([]); setAvailabilityDate(""); setTimeRanges([{ fromTime: "09:00", toTime: "17:00", slotDuration: 30 }]); setShowAvailabilityModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Open Availability
              </button>
              <button
                onClick={() => {
                  setCalendarMonth(new Date());
                  setCalendarSelectedDay(null);
                  const isDoctor = doctors.some((d) => d.id === currentDoctorDbId);
                  const docId = (isDoctor ? currentDoctorDbId : null) || (doctors[0]?.id ?? null);
                  setCalendarDoctorId(docId);
                  if (docId) fetchMonthSlots(docId);
                  setShowSlotCalendar(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <FaCalendarAlt className="text-xs" /> My Slots
              </button>
            </div>
          }
        />

        {/* Content */}
        <main className="flex-1 p-8 overflow-auto">
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatsCard
                  icon={FaCalendarAlt}
                  iconBgClass="bg-blue-100"
                  iconColorClass="text-blue-600"
                  value={todayStats.total}
                  label={selectedDateStr === new Date().toISOString().split("T")[0] ? t("appointments.todaysTotal") : t("billing.colTotal")}
                />
                <StatsCard
                  icon={FaCalendarCheck}
                  iconBgClass="bg-green-100"
                  iconColorClass="text-green-600"
                  value={todayStats.completed}
                  label={t("appointments.completed")}
                />
                <StatsCard
                  icon={FaClock}
                  iconBgClass="bg-yellow-100"
                  iconColorClass="text-yellow-600"
                  value={todayStats.upcoming}
                  label={t("appointments.upcoming")}
                />
                <StatsCard
                  icon={FaCalendarTimes}
                  iconBgClass="bg-red-100"
                  iconColorClass="text-red-600"
                  value={todayStats.cancelled}
                  label={t("appointments.cancelled")}
                />
              </div>

              {/* Date Navigation & Filters */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
                <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                  {/* Date Navigation */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => navigateDate("prev")}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <FaChevronLeft className="text-gray-600 rtl:rotate-180" />
                    </button>
                    <div className="text-center min-w-[250px]">
                      <p className="text-lg font-bold text-gray-900">
                        {formatDate(selectedDate)}
                      </p>
                    </div>
                    <button
                      onClick={() => navigateDate("next")}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <FaChevronRight className="text-gray-600 rtl:rotate-180" />
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedDate(new Date())}
                    >
                      {t("common.today")}
                    </Button>
                  </div>

                  {/* Filters */}
                  <div className="flex gap-4">
                    <div className="relative">
                      <FaSearch className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder={t("appointments.searchPlaceholder")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 rtl:pl-4 rtl:pr-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue w-64"
                      />
                    </div>
                    {visibleDoctors.length > 1 && (
                      <select
                        value={selectedDoctor}
                        onChange={(e) => setSelectedDoctor(e.target.value)}
                        className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                      >
                        <option value="all">
                          {t("appointments.allDoctors")}
                        </option>
                        {visibleDoctors.map((doctor) => (
                          <option key={doctor.id} value={String(doctor.id)}>
                            {doctor.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Doctor Legend */}
              {visibleDoctors.length > 0 && (
                <div className="flex gap-4 mb-6">
                  {visibleDoctors.map((doctor) => (
                    <div key={doctor.id} className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full ${doctor.color || "bg-dental-blue"}`}
                      ></div>
                      <span className="text-sm text-gray-600">
                        {doctor.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Appointments List */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {filteredAppointments.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {filteredAppointments.map((apt) => (
                      <div
                        key={apt.id}
                        className={`p-6 transition-colors ${
                          apt.status === "cancelled" && !apt.notes.includes("Postponed")
                            ? "bg-red-50 border-l-4 border-red-400"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-6">
                            {/* Time */}
                            <div className="text-center min-w-[80px]">
                              <p className="text-xl font-bold text-gray-900">
                                {apt.time ? (() => { const [h,m] = apt.time.split(":").map(Number); return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`; })() : ""}
                              </p>
                              <p className="text-xs text-gray-500">
                                {apt.duration} min
                              </p>
                            </div>

                            {/* Doctor Color Bar */}
                            <div
                              className={`w-1 h-16 rounded-full ${getDoctorColor(apt.doctor)}`}
                            ></div>

                            {/* Patient Info */}
                            <div>
                              <div className="flex items-center gap-3 mb-1">
                                <p className={`font-bold text-lg ${apt.status === "cancelled" && !apt.notes.includes("Postponed") ? "line-through text-red-400" : "text-gray-900"}`}>
                                  {apt.patient}
                                </p>
                                {apt.status === "cancelled" && apt.notes.includes("Postponed")
                                  ? <Badge icon={FaCalendarPlus} bgClass="bg-orange-100" textClass="text-orange-700">{t("appointments.postponed")}</Badge>
                                  : apt.isRescheduled
                                  ? <Badge icon={FaCalendarCheck} bgClass="bg-teal-100" textClass="text-teal-700">Rescheduled</Badge>
                                  : getStatusBadge(apt.status)
                                }
                              </div>
                              <p className="text-gray-600">{apt.type}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span className="flex items-center gap-1">
                                  <FaPhone className="text-xs" />
                                  {apt.phone}
                                </span>
                                <span className="flex items-center gap-1">
                                  <FaUserMd className="text-xs" />
                                  {apt.doctor}
                                </span>
                              </div>
                              {apt.notes && (
                                <p className="text-sm text-gray-400 mt-2 italic">
                                  {t("appointments.notePrefix")} {apt.notes.replace(/^Cancelled: /, "")}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            {apt.status === "scheduled" && (
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={() => handleConfirmAppointment(apt.id)}
                              >
                                <FaCheckCircle className="mr-1 rtl:mr-0 rtl:ml-1" /> {t("appointments.confirmAppt")}
                              </Button>
                            )}
                            {(apt.status === "confirmed" || apt.status === "scheduled") && (
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => handleCompleteAppointment(apt.id)}
                              >
                                <FaCheckCircle className="mr-1 rtl:mr-0 rtl:ml-1" /> {t("appointments.complete")}
                              </Button>
                            )}
                            {(apt.status === "scheduled" || apt.status === "confirmed") && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-orange-600 border-orange-200 hover:bg-orange-50"
                                onClick={() => handleNoShowAppointment(apt.id)}
                              >
                                <FaTimes className="mr-1 rtl:mr-0 rtl:ml-1" /> {t("appointments.noShow")}
                              </Button>
                            )}
                            {!["completed", "cancelled", "no_show"].includes(apt.status) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-700">
                                    <FaEllipsisV className="text-sm" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setPostponeApptId(apt.id);
                                      setPostponeDate("");
                                      setPostponeTime(apt.time);
                                    }}
                                  >
                                    <FaCalendarPlus className="text-dental-blue" /> {t("appointments.postpone")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleCancelAppointment(apt.id)}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <FaBan className="text-red-500" /> {t("appointments.cancelAppt")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={FaCalendarAlt}
                    title={t("appointments.noAppointments")}
                    description={t("appointments.noAppointmentsDesc")}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Add Appointment Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t("appointments.newAppointment")}
      >
        <div className="space-y-4">
          {addError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{addError}</p>}

          <FormField label={t("appointments.patientName")}>
            <select className={inputClass} value={newAppt.patientId} onChange={(e) => setNewAppt({ ...newAppt, patientId: e.target.value })}>
              <option value="">{t("billing.selectPatient")}</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormField>

          <FormField label={t("appointments.doctor")}>
            <select className={inputClass} value={newAppt.doctorId} onChange={(e) => setNewAppt({ ...newAppt, doctorId: e.target.value })}>
              <option value="">{t("appointments.allDoctors")}</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("appointments.date")}>
              <input
                type="date"
                className={inputClass}
                value={newAppt.date}
                min={new Date().toLocaleDateString("en-CA")}
                onChange={(e) => setNewAppt({ ...newAppt, date: e.target.value })}
              />
            </FormField>
            <FormField label="Start Time">
              <input
                type="time"
                className={inputClass}
                value={newAppt.startTime}
                onChange={(e) => setNewAppt({ ...newAppt, startTime: e.target.value })}
              />
            </FormField>
            <FormField label="End Time">
              <input
                type="time"
                className={inputClass}
                value={newAppt.endTime}
                onChange={(e) => setNewAppt({ ...newAppt, endTime: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label={t("appointments.appointmentType")}>
            <select className={inputClass} value={newAppt.reason} onChange={(e) => setNewAppt({ ...newAppt, reason: e.target.value })}>
              <option>Regular Checkup</option>
              <option>Teeth Cleaning</option>
              <option>Cavity Filling</option>
              <option>Root Canal</option>
              <option>Teeth Whitening</option>
              <option>Crown Fitting</option>
              <option>Extraction</option>
            </select>
          </FormField>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>
            {t("common.cancel")}
          </Button>
          <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90" onClick={handleAddAppointment} disabled={addLoading}>
            {addLoading ? t("appointments.scheduling") : t("appointments.scheduleAppointment")}
          </Button>
        </div>
      </Modal>

      {/* Open Availability Modal */}
      <Modal isOpen={showAvailabilityModal} onClose={() => setShowAvailabilityModal(false)} title={t("appointments.manageAvailability")}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">

          {availabilityMsg && (
            <p className={`text-sm px-3 py-2 rounded border ${availabilityMsg.includes("Created") ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"}`}>
              {availabilityMsg}
            </p>
          )}

          {/* Doctor + Date */}
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("appointments.doctor")}>
              <select className={inputClass} value={selectedAvailabilityDoctorId ?? ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setSelectedAvailabilityDoctorId(id);
                  if (id && availabilityDate) fetchExistingSlots(id, availabilityDate);
                }}>
                <option value="">{t("appointments.selectDoctor")}</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label={t("common.date")}>
              <input type="date" className={inputClass} value={availabilityDate}
                min={new Date().toLocaleDateString("en-CA")}
                onChange={(e) => {
                  setAvailabilityDate(e.target.value);
                  if (selectedAvailabilityDoctorId && e.target.value) fetchExistingSlots(selectedAvailabilityDoctorId, e.target.value);
                }} />
            </FormField>
          </div>

          {/* Existing Slots */}
          {(existingSlots.length > 0 || loadingExistingSlots) && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">{t("appointments.existingSlots")}</p>
              {loadingExistingSlots ? (
                <p className="text-xs text-gray-400">{t("common.loading")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {existingSlots.map((s) => (
                    <div key={s.id} className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${s.isBooked ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
                      <span>{s.time}</span>
                      {s.isBooked ? (
                        <span className="text-blue-400 text-[10px] ml-1">{t("appointments.booked")}</span>
                      ) : (
                        <button
                          onClick={() => handleDeleteSlot(s.id)}
                          className="ml-1 text-red-400 hover:text-red-600 leading-none"
                          title="Delete slot"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Time Ranges */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">{t("appointments.timeRanges")}</p>
              <button
                onClick={() => setTimeRanges((prev) => [...prev, { fromTime: "09:00", toTime: "17:00", slotDuration: 30 }])}
                className="text-xs text-teal-600 hover:text-teal-800 font-medium"
              >
                {t("appointments.addRange")}
              </button>
            </div>

            <div className="space-y-3">
              {timeRanges.map((range, i) => {
                const [fh, fm] = range.fromTime.split(":").map(Number);
                const [th, tm] = range.toTime.split(":").map(Number);
                const totalMin = (th * 60 + tm) - (fh * 60 + fm);
                const slotDur = range.slotDuration > 0 ? range.slotDuration : 30;
                const slotCount = totalMin > 0 ? Math.floor(totalMin / slotDur) : 0;
                const preview = totalMin > 0 && slotCount > 0
                  ? `→ ${slotCount} slot${slotCount !== 1 ? "s" : ""} × ${slotDur} min`
                  : totalMin <= 0 ? t("appointments.invalidRange") : t("appointments.slotDurationTooLarge");
                return (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">{t("appointments.from")}</label>
                        <input type="time" className={inputClass} value={range.fromTime}
                          onChange={(e) => setTimeRanges((prev) => prev.map((r, j) => j === i ? { ...r, fromTime: e.target.value } : r))} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">{t("appointments.to")}</label>
                        <input type="time" className={inputClass} value={range.toTime}
                          onChange={(e) => setTimeRanges((prev) => prev.map((r, j) => j === i ? { ...r, toTime: e.target.value } : r))} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">{t("appointments.slotMin")}</label>
                        <select className={inputClass} value={range.slotDuration}
                          onChange={(e) => setTimeRanges((prev) => prev.map((r, j) => j === i ? { ...r, slotDuration: Number(e.target.value) } : r))}>
                          <option value={15}>15 min</option>
                          <option value={20}>20 min</option>
                          <option value={30}>30 min</option>
                          <option value={45}>45 min</option>
                          <option value={60}>60 min</option>
                          <option value={90}>90 min</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${slotCount > 0 ? "text-teal-600 font-medium" : "text-red-500"}`}>{preview}</span>
                      {timeRanges.length > 1 && (
                        <button onClick={() => setTimeRanges((prev) => prev.filter((_, j) => j !== i))}
                          className="text-xs text-red-400 hover:text-red-600">
                          {t("appointments.remove")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={() => setShowAvailabilityModal(false)}>{t("common.close")}</Button>
          <Button className="flex-1 bg-teal-600 hover:bg-teal-700" onClick={handleOpenAvailability} disabled={availabilityLoading}>
            {availabilityLoading ? t("common.creating") : t("appointments.scheduleAppointment")}
          </Button>
        </div>
      </Modal>

      {/* Slot Calendar Modal */}
      <Modal isOpen={showSlotCalendar} onClose={() => { setShowSlotCalendar(false); setCalendarSelectedDay(null); }} title={t("appointments.myOpenedSlots")}>
        <div className="space-y-3">

          {/* Doctor selector (admins only) */}
          {doctors.length > 1 && (
            <FormField label={t("appointments.doctor")}>
              <select className={inputClass} value={calendarDoctorId ?? ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setCalendarDoctorId(id);
                  setCalendarSelectedDay(null);
                  if (id) fetchMonthSlots(id);
                }}>
                <option value="">{t("appointments.selectDoctor")}</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </FormField>
          )}

          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const prev = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
                setCalendarMonth(prev);
                setCalendarSelectedDay(null);
                if (calendarDoctorId) fetchMonthSlots(calendarDoctorId, prev);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            ><FaChevronLeft className="text-gray-600" /></button>
            <p className="font-semibold text-gray-800">
              {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
            <button
              onClick={() => {
                const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
                setCalendarMonth(next);
                setCalendarSelectedDay(null);
                if (calendarDoctorId) fetchMonthSlots(calendarDoctorId, next);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            ><FaChevronRight className="text-gray-600" /></button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 justify-center">
            {[
              { color: "bg-teal-400",  label: "Open slot" },
              { color: "bg-blue-500",  label: "Confirmed" },
              { color: "bg-green-500", label: "Completed" },
              { color: "bg-red-400",   label: "No-show" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1 text-xs text-gray-500">
                <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block`} /> {label}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {loadingMonthSlots ? (
            <div className="text-center py-6 text-sm text-gray-400">Loading…</div>
          ) : (() => {
            const year  = calendarMonth.getFullYear();
            const month = calendarMonth.getMonth();
            const firstDow   = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const pad = (n: number) => String(n).padStart(2, "0");
            const todayStr = new Date().toLocaleDateString("en-CA");
            const cells: (number | null)[] = [
              ...Array(firstDow).fill(null),
              ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
            ];
            while (cells.length % 7 !== 0) cells.push(null);

            const STATUS_COLOR: Record<string, string> = {
              confirmed: "bg-blue-500",
              completed: "bg-green-500",
              no_show:   "bg-red-400",
            };

            return (
              <div>
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 mb-1">
                  {Array.from({ length: 7 }, (_, i) =>
                    new Intl.DateTimeFormat(language, { weekday: "short" }).format(new Date(2023, 0, 1 + i))
                  ).map((d) => (
                    <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-1">{d}</div>
                  ))}
                </div>

                {/* Weeks */}
                {Array.from({ length: cells.length / 7 }, (_, wi) => (
                  <div key={wi} className="grid grid-cols-7">
                    {cells.slice(wi * 7, wi * 7 + 7).map((day, di) => {
                      if (!day) return <div key={di} className="m-0.5 min-h-[56px]" />;

                      const dateStr  = `${year}-${pad(month + 1)}-${pad(day)}`;
                      const dayData  = monthSlots[dateStr] || [];
                      const hasData  = dayData.length > 0;
                      const isToday  = dateStr === todayStr;
                      const isSelected = dateStr === calendarSelectedDay;

                      const openCount      = dayData.filter((s) => !s.isBooked).length;
                      const confirmedCount = dayData.filter((s) => s.appointmentStatus === "confirmed").length;
                      const completedCount = dayData.filter((s) => s.appointmentStatus === "completed").length;
                      const noShowCount    = dayData.filter((s) => s.appointmentStatus === "no_show").length;

                      return (
                        <div
                          key={di}
                          onClick={() => setCalendarSelectedDay(isSelected ? null : dateStr)}
                          className={`m-0.5 rounded-xl p-1.5 cursor-pointer transition-all min-h-[56px] flex flex-col items-center select-none
                            ${!hasData ? "bg-gray-50 text-gray-300" : "hover:bg-gray-50"}
                            ${isSelected ? "ring-2 ring-blue-400 bg-blue-50" : ""}
                            ${isToday ? "ring-2 ring-blue-500" : ""}
                          `}
                        >
                          <span className={`text-sm font-semibold mb-1
                            ${!hasData ? "text-gray-300" : isToday ? "text-blue-600" : "text-gray-800"}
                          `}>{day}</span>

                          {hasData && (
                            <div className="flex flex-wrap gap-0.5 justify-center">
                              {openCount > 0 && (
                                <span className="min-w-[16px] h-4 rounded-full bg-teal-400 text-white text-[9px] font-bold flex items-center justify-center px-1">
                                  {openCount}
                                </span>
                              )}
                              {confirmedCount > 0 && (
                                <span className="min-w-[16px] h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
                                  {confirmedCount}
                                </span>
                              )}
                              {completedCount > 0 && (
                                <span className="min-w-[16px] h-4 rounded-full bg-green-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
                                  {completedCount}
                                </span>
                              )}
                              {noShowCount > 0 && (
                                <span className="min-w-[16px] h-4 rounded-full bg-red-400 text-white text-[9px] font-bold flex items-center justify-center px-1">
                                  {noShowCount}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Inline dropdown for selected day */}
                {calendarSelectedDay && (() => {
                  const dayData = (monthSlots[calendarSelectedDay] || [])
                    .slice().sort((a, b) => a.time.localeCompare(b.time));
                  return (
                    <div className="mt-3 border border-gray-200 rounded-xl shadow-sm bg-white overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-800">
                          {new Date(calendarSelectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                        </p>
                        <button onClick={() => setCalendarSelectedDay(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                      </div>
                      {dayData.length === 0 ? (
                        <p className="text-xs text-gray-400 px-4 py-3">No appointments or slots for this day.</p>
                      ) : (
                        <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                          {dayData.map((s) => {
                            const dotColor = !s.isBooked ? "bg-teal-400"
                              : STATUS_COLOR[s.appointmentStatus ?? ""] ?? "bg-blue-500";
                            const label = !s.isBooked ? "Open slot"
                              : (s.appointmentStatus ?? "booked").replace("_", " ");
                            return (
                              <div key={`${s.id}-${s.appointmentId}`}
                                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 truncate">
                                    {s.patientName ?? "Open slot"}{" "}
                                    <span className="font-normal text-gray-500">
                                      · {s.time}{s.endTime ? ` – ${s.endTime}` : ""}
                                    </span>
                                  </p>
                                  <p className="text-[11px] capitalize text-gray-400">{label}</p>
                                </div>
                                {!s.isBooked && (
                                  <button
                                    onClick={() => handleCalendarDeleteSlot(s.id, calendarSelectedDay)}
                                    className="text-red-400 hover:text-red-600 text-sm font-bold flex-shrink-0"
                                    title="Delete slot"
                                  >×</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>

        <div className="flex gap-3 mt-4">
          <Button className="flex-1" variant="outline" onClick={() => { setShowSlotCalendar(false); setCalendarSelectedDay(null); }}>{t("common.close")}</Button>
        </div>
      </Modal>

      {/* Postpone Modal */}
      {postponeApptId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{t("appointments.postponeAppointment")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("appointments.newDate")}</label>
                <input
                  type="date"
                  value={postponeDate}
                  min={new Date().toLocaleDateString("en-CA")}
                  onChange={(e) => setPostponeDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={postponeTime}
                    onChange={(e) => setPostponeTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={postponeEndTime}
                    onChange={(e) => setPostponeEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setPostponeApptId(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handlePostponeSubmit}
                disabled={!postponeDate || !postponeTime || !postponeEndTime || postponeLoading}
                className="flex-1 px-4 py-2 bg-dental-blue text-white rounded-lg text-sm font-medium hover:bg-dental-blue/90 disabled:opacity-50 transition-colors"
              >
                {postponeLoading ? t("common.saving") : t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
