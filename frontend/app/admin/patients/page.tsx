"use client";
import { apiFetch } from '@/lib/api/client';
import { toast } from 'sonner';

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { StatsCard } from "@/components/ui/StatsCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Avatar } from "@/components/ui/Avatar";
import { getStoredPhoto } from "@/lib/profilePhoto";
import { FilterBar } from "@/components/ui/FilterBar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import ToothChart, { type ToothState } from "@/components/dental/ToothChart";
import dynamic from "next/dynamic";

// WebGL viewer: client-only and loaded on demand so the patients page stays light.
const ToothModel3D = dynamic(() => import("@/components/dental/ToothModel3D"), {
  ssr: false,
  loading: () => (
    <div className="h-[440px] flex items-center justify-center rounded-xl bg-slate-100">
      <LoadingSpinner />
    </div>
  ),
});
import {
  FaTooth,
  FaCalendarAlt,
  FaUsers,
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaCalendarPlus,
  FaTimes,
  FaAllergies,
  FaNotesMedical,
  FaCheckCircle,
  FaEdit,
  FaIdCard,
  FaFileAlt,
  FaUpload,
  FaDownload,
  FaTrash,
  FaClock,
  FaMoneyBillWave,
} from "react-icons/fa";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

interface Patient {
  id: number;
  userId: number;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  bloodType: string;
  allergies: string[];
  insurance: string;
  registeredDate: string;
  lastVisit: string;
  totalVisits: number;
  status: string;
  notes: string;
  photoUrl?: string;
  /** Account was created by staff and the patient has not chosen a password yet. */
  mustSetPassword: boolean;
}

interface InviteResult {
  name: string;
  email: string | null;
  link: string;
  emailed: boolean;
}

interface PatientHistory {
  appointments: {
    date: string;
    type: string;
    doctor: string;
    status: string;
  }[];
  treatments: {
    tooth: string;
    treatment: string;
    date: string;
    doctor: string;
  }[];
}

// ── Dental chart / work ────────────────────────────────────────────────────────
const PROCEDURES = [
  "Checkup", "X-Ray", "Teeth Cleaning", "Whitening", "Tooth Extraction", "Root Canal",
  "Filling", "Crown", "Bridge", "Implant", "Orthodontic", "Veneers", "Gum Treatment", "Fluoride Treatment",
] as const;

/** Suggested prices (USD) pre-filled in the work form; always editable per item. */
const DEFAULT_PRICES: Record<string, number> = {
  "Checkup": 30, "X-Ray": 20, "Teeth Cleaning": 50, "Whitening": 150, "Tooth Extraction": 60,
  "Root Canal": 200, "Filling": 50, "Crown": 250, "Bridge": 500, "Implant": 800,
  "Orthodontic": 1500, "Veneers": 300, "Gum Treatment": 100, "Fluoride Treatment": 25,
};

type WorkStatus = "completed" | "planned" | "missing";

interface WorkItem {
  tooth: string;
  procedure: string;
  status: WorkStatus;
  amount: number;
  notes: string;
  /** Put this item on the invoice created when saving (completed, priced items only). */
  bill: boolean;
}

interface ChartHistoryEntry {
  id: number;
  tooth: string;
  procedure: string;
  status: WorkStatus;
  date: string;
  doctor: string;
  notes: string;
  invoiceId: number | null;
  invoiceStatus: "open" | "partial" | "paid" | null;
  invoiceTotal: number;
  invoiceRemaining: number;
}

interface PayInvoice {
  id: number;
  total: number;
  remaining: number;
}

const PAYMENT_METHODS = ["cash", "card", "insurance", "bank_transfer"] as const;

interface ChartData {
  teeth: Record<string, ToothState>;
  history: ChartHistoryEntry[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapChart(raw: any): ChartData {
  const teeth: Record<string, ToothState> = {};
  for (const [fdi, v] of Object.entries<any>(raw?.teeth ?? {})) {
    const count = Number(v.count) || 0;
    teeth[fdi] = {
      status: v.status,
      label:
        [v.last_procedure, v.last_date].filter(Boolean).join(" · ") + (count > 1 ? ` · ×${count}` : "") || undefined,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history: ChartHistoryEntry[] = (raw?.history ?? []).map((r: any) => ({
    id: Number(r.id),
    tooth: String(r.tooth_number ?? ""),
    procedure: r.title ?? "",
    status:
      r.record_type === "treatment_plan" ? "planned" : r.record_type === "missing_tooth" ? "missing" : "completed",
    date: r.treatment_date ? String(r.treatment_date).split("T")[0] : "",
    doctor: r.users ? `Dr. ${r.users.first_name} ${r.users.last_name}` : "",
    notes: r.description ?? "",
    invoiceId: r.invoice?.id != null ? Number(r.invoice.id) : null,
    invoiceStatus: r.invoice?.status ?? null,
    invoiceTotal: Number(r.invoice?.total_amount) || 0,
    invoiceRemaining: Number(r.invoice?.remaining_amount) || 0,
  }));
  // Every treatment per tooth (history is newest first) so hovering a tooth
  // can list all of them, not just the latest.
  for (const h of history) {
    if (!h.tooth) continue;
    const state = (teeth[h.tooth] ??= { status: "healthy" });
    (state.treatments ??= []).push({
      procedure: h.status === "missing" ? "Missing tooth" : h.procedure,
      date: h.date || undefined,
      status: h.status,
    });
  }
  return { teeth, history };
}

const emptyNewPatient = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  bloodType: "",
  allergies: "",
  insurance: "",
  notes: "",
};

export default function PatientsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "info" | "appointments" | "treatments" | "chart" | "documents"
  >("info");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  // Role-based state
  const [userRole, setUserRole] = useState<string>("doctor");
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [assignedDoctorIds, setAssignedDoctorIds] = useState<number[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Data state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientHistory, setPatientHistory] = useState<PatientHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Book appointment state
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookDate, setBookDate] = useState(new Date().toISOString().split("T")[0]);
  const [bookTime, setBookTime] = useState("09:00");
  const [bookReason, setBookReason] = useState("");
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState("");

  // Documents state
  const [documents, setDocuments] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  // Toggle active/inactive state
  const [togglingStatusId, setTogglingStatusId] = useState<number | null>(null);

  // Edit patient state
  const [showEditPatientModal, setShowEditPatientModal] = useState(false);
  const [editPatientForm, setEditPatientForm] = useState({
    phone: "",
    dateOfBirth: "",
    bloodType: "",
    allergies: "",
    insurance: "",
    notes: "",
  });
  const [editPatientSaving, setEditPatientSaving] = useState(false);

  // Add patient state
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [newPatient, setNewPatient] = useState(emptyNewPatient);
  const [addPatientSaving, setAddPatientSaving] = useState(false);

  // Password setup link (invite) state
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);

  // Dental chart / work state
  const [chart, setChart] = useState<ChartData | null>(null);
  const [chartPatientId, setChartPatientId] = useState<number | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartView, setChartView] = useState<"3d" | "2d">("3d");
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [workForm, setWorkForm] = useState<{ procedure: string; status: WorkStatus; amount: string; notes: string }>({
    procedure: "Filling",
    status: "completed",
    amount: String(DEFAULT_PRICES["Filling"]),
    notes: "",
  });
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [workNotes, setWorkNotes] = useState("");
  const [savingWork, setSavingWork] = useState(false);

  // Completing planned work from the history, and paying its invoice
  const [completeSelection, setCompleteSelection] = useState<number[]>([]);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeItems, setCompleteItems] = useState<{ id: number; tooth: string; procedure: string; amount: string; status: WorkStatus; bill: boolean }[]>([]);
  const [completeDate, setCompleteDate] = useState(new Date().toISOString().split("T")[0]);
  const [completeNotes, setCompleteNotes] = useState("");
  const [completing, setCompleting] = useState(false);
  const [removingRecordId, setRemovingRecordId] = useState<number | null>(null);
  const [payInvoice, setPayInvoice] = useState<PayInvoice | null>(null);
  const [payForm, setPayForm] = useState<{ amount: string; method: (typeof PAYMENT_METHODS)[number]; notes: string }>({
    amount: "",
    method: "cash",
    notes: "",
  });
  const [paying, setPaying] = useState(false);

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
  }, [router]);

  // Fetch patients
  const fetchPatients = async () => {
    try {
      const [patientsRes, usersRes, apptRes] = await Promise.all([
        apiFetch(`/api/patients`),
        apiFetch(`/api/users`),
        apiFetch(`/api/appointments?limit=2000`),
      ]);
      const patientsData = await patientsRes.json();
      const users: any[] = usersRes.ok ? await usersRes.json() : [];
      const apptData = apptRes.ok ? await apptRes.json() : { data: [] };

      const visitsByPatient: Record<number, number> = {};
      const lastVisitByPatient: Record<number, string> = {};
      for (const a of (apptData.data || [])) {
        if (a.status === "completed") {
          const pid = Number(a.patient_id);
          visitsByPatient[pid] = (visitsByPatient[pid] || 0) + 1;
          const date = a.appointment_date?.split("T")[0] || "";
          if (date && (!lastVisitByPatient[pid] || date > lastVisitByPatient[pid])) {
            lastVisitByPatient[pid] = date;
          }
        }
      }

      const mapped = (patientsData.data || []).map((p: any) => {
        // date_of_birth lives on users, returned as p.users.date_of_birth
        const userEmbed = p.users;
        const user = users.find((u) => u.id === p.user_id || u.id === String(p.user_id));
        const dob = userEmbed?.date_of_birth || user?.date_of_birth || "";
        const dobStr = dob ? (typeof dob === "string" ? dob.split("T")[0] : new Date(dob).toISOString().split("T")[0]) : "";
        const isActive = userEmbed ? userEmbed.is_active !== false : (user?.is_active !== false);
        return {
          id: Number(p.id),
          userId: userEmbed ? Number(userEmbed.id) : (user ? Number(user.id) : 0),
          name: userEmbed ? `${userEmbed.first_name} ${userEmbed.last_name}` : (user ? `${user.first_name} ${user.last_name}` : `Patient #${p.id}`),
          email: userEmbed?.email || user?.email || "",
          phone: userEmbed?.phone || user?.phone || "",
          dateOfBirth: dobStr,
          address: `${p.city || ""}, ${p.governate || ""}`.trim().replace(/^,\s*|,\s*$/, ""),
          bloodType: p.blood_type || "",
          allergies: p.allergies ? p.allergies.split(",").map((a: string) => a.trim()).filter(Boolean) : [],
          insurance: p.insurance_provider || "",
          registeredDate: (userEmbed?.created_at || user?.created_at || "").split("T")[0],
          lastVisit: lastVisitByPatient[Number(p.id)] || "",
          totalVisits: visitsByPatient[Number(p.id)] || 0,
          status: isActive ? "active" : "inactive",
          notes: p.medical_notes || "",
          photoUrl: getStoredPhoto(userEmbed?.email || user?.email || ""),
          mustSetPassword: userEmbed?.must_set_password === true || user?.must_set_password === true,
        };
      });
      setPatients(mapped);
    } catch (e) {
      console.error("Failed to fetch patients", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchPatients(); }, []);

  // Fetch patient history when patient is selected
  const fetchPatientHistory = async (patientId: number) => {
    try {
      const [appointmentsRes, recordsRes, usersRes] = await Promise.all([
        apiFetch(`/api/appointments`),
        apiFetch(`/api/patient-records`),
        apiFetch(`/api/users`),
      ]);
      const appointmentsData = await appointmentsRes.json();
      const recordsData = await recordsRes.json();
      const users: any[] = await usersRes.json();

      const appointments = (appointmentsData.data || [])
        .filter((a: any) => Number(a.patient_id) === patientId)
        .map((a: any) => {
          const doctor = users.find((u) => u.id === a.created_by || u.id === String(a.created_by));
          return {
            date: a.appointment_date?.split("T")[0] || "",
            type: a.reason || "Checkup",
            doctor: doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : "",
            status: a.status,
          };
        });

      const treatments = (recordsData.data || [])
        .filter((r: any) => Number(r.patient_id) === patientId)
        .map((r: any) => {
          const doctor = users.find((u) => u.id === r.created_by || u.id === String(r.created_by));
          return {
            tooth: r.tooth_number ? `Tooth ${r.tooth_number}` : "",
            treatment: r.title || "",
            date: r.treatment_date?.split("T")[0] || "",
            doctor: doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : "",
          };
        });

      setPatientHistory({ appointments, treatments });
    } catch (e) {
      console.error("Failed to fetch patient history", e);
      setPatientHistory(null);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedPatient) return;
    setBookLoading(true);
    setBookError("");
    try {
      // Fetch available slots for the chosen date and find one matching the chosen time
      const slotsRes = await apiFetch(`/api/appointment-slots?date=${bookDate}&available_only=true&limit=100`);
      const slotsData = await slotsRes.json();
      const slots: any[] = slotsData.data || [];

      // Find an exact or nearest-after match on start_time
      const target = bookTime; // "HH:MM"
      let matched = slots.find((s) => s.start_time?.slice(0, 5) === target);
      if (!matched) matched = slots.find((s) => (s.start_time?.slice(0, 5) ?? "00:00") >= target);
      if (!matched) matched = slots[0]; // fallback to first available

      if (!matched) {
        setBookError("No available slots on this date. Please try a different date.");
        return;
      }

      const res = await apiFetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          slot_id: matched.id,
          reason: bookReason || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Appointment booked.");
        setShowBookModal(false);
        setBookReason("");
        setBookError("");
        fetchPatientHistory(selectedPatient.id);
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err.message || "Failed to book appointment.";
        setBookError(msg);
        toast.error(msg);
      }
    } catch {
      setBookError("An error occurred. Please try again.");
    } finally {
      setBookLoading(false);
    }
  };

  const fetchDocuments = async (patientId: number) => {
    setDocsLoading(true);
    try {
      const res = await apiFetch(`/api/patient-documents?patient_id=${patientId}&limit=50`);
      const data = await res.json();
      setDocuments(data.data || []);
    } catch {
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleDocumentUpload = async (file: File) => {
    if (!selectedPatient) return;
    setUploadingDoc(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("patient_id", String(selectedPatient.id));
      form.append("uploaded_by", String(doctorId ?? 1));
      const res = await apiFetch("/api/patient-documents", { method: "POST", body: form });
      if (res.ok) { toast.success("Document uploaded."); await fetchDocuments(selectedPatient.id); }
      else toast.error("Failed to upload document.");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    if (!selectedPatient) return;
    setDeletingDocId(docId);
    try {
      const res = await apiFetch(`/api/patient-documents/${docId}`, { method: "DELETE" });
      if (res.ok) { toast.success("Document deleted."); setDocuments((prev) => prev.filter((d) => d.id !== docId)); }
      else toast.error("Failed to delete document.");
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleToggleStatus = async (patient: Patient) => {
    setTogglingStatusId(patient.id);
    const newIsActive = patient.status !== "active";
    try {
      const res = await apiFetch(`/api/patients/${patient.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newIsActive }),
      });
      if (res.ok) {
        const newStatusStr = newIsActive ? "active" : "inactive";
        setPatients((prev) =>
          prev.map((p) => p.id === patient.id ? { ...p, status: newStatusStr } : p)
        );
        if (selectedPatient?.id === patient.id) {
          setSelectedPatient((prev) => prev ? { ...prev, status: newStatusStr } : prev);
        }
        toast.success(`Patient marked as ${newStatusStr}.`);
      } else {
        toast.error("Failed to update patient status.");
      }
    } catch {
      toast.error("Failed to update patient status.");
    } finally {
      setTogglingStatusId(null);
    }
  };

  const handleDeletePatient = async (patient: Patient) => {
    if (!window.confirm(`Delete ${patient.name}? This will permanently remove their account and all records.`)) return;
    try {
      const res = await apiFetch(`/api/patients/${patient.id}`, { method: "DELETE" });
      if (res.ok) {
        setPatients((prev) => prev.filter((p) => p.id !== patient.id));
        setShowPatientModal(false);
        toast.success("Patient deleted.");
      } else {
        toast.error("Failed to delete patient.");
      }
    } catch {
      toast.error("Failed to delete patient.");
    }
  };

  const handleOpenEditPatient = (patient: Patient) => {
    setEditPatientForm({
      phone: patient.phone,
      dateOfBirth: patient.dateOfBirth,
      bloodType: patient.bloodType,
      allergies: patient.allergies.join(", "),
      insurance: patient.insurance,
      notes: patient.notes,
    });
    setShowEditPatientModal(true);
  };

  const handleEditPatientSave = async () => {
    if (!selectedPatient) return;
    setEditPatientSaving(true);
    try {
      // NOTE FOR BACKEND TEAM:
      // PATCH /api/patients/:id should accept:
      //   blood_type, allergies (string), insurance_provider, medical_notes, date_of_birth
      // PATCH /api/users/:userId should accept: phone
      await apiFetch(`/api/patients/${selectedPatient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blood_type: editPatientForm.bloodType || undefined,
          allergies: editPatientForm.allergies || undefined,
          insurance_provider: editPatientForm.insurance || undefined,
          medical_notes: editPatientForm.notes || undefined,
          date_of_birth: editPatientForm.dateOfBirth || undefined,
        }),
      });
      if (selectedPatient.userId) {
        await apiFetch(`/api/users/${selectedPatient.userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: editPatientForm.phone || undefined,
            date_of_birth: editPatientForm.dateOfBirth || undefined,
          }),
        });
      }
      const updatedPatient: Patient = {
        ...selectedPatient,
        phone: editPatientForm.phone,
        dateOfBirth: editPatientForm.dateOfBirth,
        bloodType: editPatientForm.bloodType,
        allergies: editPatientForm.allergies.split(",").map((a) => a.trim()).filter(Boolean),
        insurance: editPatientForm.insurance,
        notes: editPatientForm.notes,
      };
      setSelectedPatient(updatedPatient);
      setPatients((prev) => prev.map((p) => p.id === selectedPatient.id ? updatedPatient : p));
      toast.success("Patient updated.");
      setShowEditPatientModal(false);
    } catch {
      toast.error("Failed to update patient.");
    } finally {
      setEditPatientSaving(false);
    }
  };

  const handleOpenAddPatient = () => {
    setNewPatient(emptyNewPatient);
    setShowAddPatientModal(true);
  };

  const handleAddPatient = async () => {
    const firstName = newPatient.firstName.trim();
    const lastName = newPatient.lastName.trim();
    const email = newPatient.email.trim();
    const phone = newPatient.phone.trim();
    if (!firstName || !lastName) {
      toast.error(t("patients.requiredFields"));
      return;
    }
    if (!email && !phone) {
      toast.error(t("patients.emailOrPhoneRequired"));
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t("patients.invalidEmail"));
      return;
    }
    setAddPatientSaving(true);
    try {
      const res = await apiFetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(newPatient.dateOfBirth ? { date_of_birth: newPatient.dateOfBirth } : {}),
          ...(newPatient.gender ? { gender: newPatient.gender } : {}),
          ...(newPatient.address.trim() ? { address: newPatient.address.trim() } : {}),
          ...(newPatient.bloodType ? { blood_type: newPatient.bloodType } : {}),
          ...(newPatient.allergies.trim() ? { allergies: newPatient.allergies.trim() } : {}),
          ...(newPatient.insurance.trim() ? { insurance_provider: newPatient.insurance.trim() } : {}),
          ...(newPatient.notes.trim() ? { medical_notes: newPatient.notes.trim() } : {}),
        }),
      });
      if (!res.ok) {
        let message = t("patients.patientAddFailed");
        try {
          const body = await res.json();
          if (Array.isArray(body?.message)) message = body.message.join(", ");
          else if (typeof body?.message === "string" && body.message) message = body.message;
        } catch { /* keep fallback */ }
        toast.error(message);
        return;
      }
      const created = await res.json().catch(() => null);
      await fetchPatients();
      toast.success(t("patients.patientAdded"));
      setShowAddPatientModal(false);
      if (created?.invite?.link) {
        setInviteResult({
          name: `${firstName} ${lastName}`,
          email: created.invite.email ?? email,
          link: created.invite.link,
          emailed: created.invite.emailed === true,
        });
      }
    } catch {
      toast.error(t("patients.patientAddFailed"));
    } finally {
      setAddPatientSaving(false);
    }
  };

  const handleSendInvite = async (patient: Patient) => {
    if (!patient.email) {
      toast.error(t("patients.inviteNeedsEmail"));
      return;
    }
    setSendingInvite(true);
    try {
      const res = await apiFetch(`/api/patients/${patient.id}/invite`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
        toast.error(msg || t("patients.inviteFailed"));
        return;
      }
      setInviteResult({
        name: patient.name,
        email: data?.email ?? patient.email,
        link: data?.link ?? "",
        emailed: data?.emailed === true,
      });
      setPatients((prev) => prev.map((p) => (p.id === patient.id ? { ...p, mustSetPassword: true } : p)));
      setSelectedPatient((prev) => (prev && prev.id === patient.id ? { ...prev, mustSetPassword: true } : prev));
    } catch {
      toast.error(t("patients.inviteFailed"));
    } finally {
      setSendingInvite(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteResult?.link) return;
    try {
      await navigator.clipboard.writeText(inviteResult.link);
      toast.success(t("patients.linkCopied"));
    } catch {
      toast.error(t("patients.copyFailed"));
    }
  };

  // ── Dental chart / work ─────────────────────────────────────────────────────

  const fetchChart = async (patientId: number) => {
    setChartLoading(true);
    try {
      const res = await apiFetch(`/api/patient-work/chart/${patientId}`);
      if (!res.ok) throw new Error();
      setChart(mapChart(await res.json()));
      setChartPatientId(patientId);
    } catch {
      setChart({ teeth: {}, history: [] });
      setChartPatientId(patientId);
    } finally {
      setChartLoading(false);
    }
  };

  const toggleTooth = (fdi: string) => {
    setSelectedTeeth((prev) => (prev.includes(fdi) ? prev.filter((t) => t !== fdi) : [...prev, fdi]));
  };

  const handleWorkProcedureChange = (procedure: string) => {
    setWorkForm((f) => ({ ...f, procedure, amount: String(DEFAULT_PRICES[procedure] ?? "") }));
  };

  const handleAddWorkItems = () => {
    if (selectedTeeth.length === 0) {
      toast.error(t("dentalChart.selectTeethFirst"));
      return;
    }
    const amount = parseFloat(workForm.amount);
    const isMissing = workForm.status === "missing";
    const safeAmount = !isMissing && Number.isFinite(amount) && amount >= 0 ? amount : 0;
    // Append, never merge: the same tooth can receive several treatments,
    // including the same procedure more than once (e.g. two fillings).
    setWorkItems((prev) => [
      ...prev,
      ...[...selectedTeeth].sort().map<WorkItem>((tooth) => ({
        tooth,
        procedure: workForm.procedure,
        status: workForm.status,
        amount: safeAmount,
        notes: workForm.notes.trim(),
        bill: workForm.status === "completed" && safeAmount > 0,
      })),
    ]);
    setSelectedTeeth([]);
    setWorkForm((f) => ({ ...f, notes: "" }));
  };

  const workStatusLabel = (status: WorkStatus) =>
    status === "planned"
      ? t("dentalChart.plannedStatus")
      : status === "missing"
        ? t("dentalChart.missingStatus")
        : t("dentalChart.completed");

  const procedureLabel = (status: WorkStatus, procedure: string) =>
    status === "missing" ? t("dentalChart.missingTooth") : procedure;

  const handleWorkStatusChange = (status: WorkStatus) => {
    setWorkForm((f) => ({
      ...f,
      status,
      amount: status === "missing" ? "0" : f.amount === "0" ? String(DEFAULT_PRICES[f.procedure] ?? "") : f.amount,
    }));
  };

  const handleRemoveWorkItem = (index: number) => {
    setWorkItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Only completed items with a price can be billed; each one can be left off
  // the invoice and billed later from the history (so one visit can end up
  // on several invoices, like on the billing page).
  const isBillableWorkItem = (i: WorkItem) => i.status === "completed" && i.amount > 0;
  const workBillableCount = workItems.filter(isBillableWorkItem).length;
  const workBilledItems = workItems.filter((i) => isBillableWorkItem(i) && i.bill);
  const workBilledCount = workBilledItems.length;
  const workInvoiceTotal = workBilledItems.reduce((s, i) => s + i.amount, 0);

  const handleToggleWorkItemBill = (index: number) =>
    setWorkItems((prev) => prev.map((it, i) => (i === index ? { ...it, bill: !it.bill } : it)));
  const setAllWorkItemsBill = (bill: boolean) => setWorkItems((prev) => prev.map((it) => ({ ...it, bill })));

  /** Current staff user id for created_by fields; falls back to the session's /me. */
  const resolveCreatedBy = async (): Promise<number | null> => {
    if (doctorId) return doctorId;
    try {
      const me = await apiFetch("/api/auth/me");
      if (me.ok) {
        const u = await me.json();
        return Number(u?.id) || null;
      }
    } catch { /* unknown user */ }
    return null;
  };

  const readApiError = async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => null);
    const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    return (typeof msg === "string" && msg) || fallback;
  };

  const handleSaveWork = async () => {
    if (!selectedPatient || workItems.length === 0) return;
    setSavingWork(true);
    try {
      const createdBy = await resolveCreatedBy();
      const res = await apiFetch("/api/patient-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          treatment_date: workDate,
          ...(workNotes.trim() ? { notes: workNotes.trim() } : {}),
          ...(createdBy ? { created_by: createdBy } : {}),
          create_invoice: workBilledCount > 0,
          items: workItems.map((i) => ({
            tooth_number: i.tooth,
            // An unticked completed item is saved with no price, so it stays
            // unbilled and can be put on its own invoice later from the history.
            ...(i.status === "missing"
              ? {}
              : { procedure_name: i.procedure, amount: i.status === "completed" && !i.bill ? 0 : i.amount }),
            status: i.status,
            ...(i.notes ? { notes: i.notes } : {}),
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
        toast.error(msg || t("dentalChart.saveFailed"));
        return;
      }
      if (data?.chart) setChart(mapChart(data.chart));
      setWorkItems([]);
      setSelectedTeeth([]);
      setWorkNotes("");
      fetchPatientHistory(selectedPatient.id);
      toast.success(data?.invoice ? t("dentalChart.savedWithInvoice") : t("dentalChart.saved"));
    } catch {
      toast.error(t("dentalChart.saveFailed"));
    } finally {
      setSavingWork(false);
    }
  };

  // ── Complete planned work / remove / pay ───────────────────────────────────

  /** Rows that can be completed and/or billed: planned work, or completed work not yet on an invoice. */
  const isBillable = (h: ChartHistoryEntry) => h.status === "planned" || (h.status === "completed" && !h.invoiceId);
  const selectionHasPlanned = chart?.history.some((h) => completeSelection.includes(h.id) && h.status === "planned") ?? false;
  const completeAllDone = completeItems.length > 0 && completeItems.every((i) => i.status === "completed");

  const toggleCompleteSelection = (id: number) =>
    setCompleteSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const openCompleteModal = (ids: number[]) => {
    if (!chart) return;
    const items = chart.history
      .filter((h) => ids.includes(h.id) && isBillable(h))
      .map((h) => ({ id: h.id, tooth: h.tooth, procedure: h.procedure, amount: String(DEFAULT_PRICES[h.procedure] ?? ""), status: h.status, bill: true }));
    if (items.length === 0) return;
    setCompleteItems(items);
    setCompleteDate(new Date().toISOString().split("T")[0]);
    setCompleteNotes("");
    setShowCompleteModal(true);
  };

  const completeAmount = (i: { amount: string; bill: boolean }) => {
    const n = parseFloat(i.amount);
    return i.bill && Number.isFinite(n) && n > 0 ? n : 0;
  };
  const completeBilledCount = completeItems.filter((i) => completeAmount(i) > 0).length;
  const completeTotal = completeItems.reduce((s, i) => s + completeAmount(i), 0);
  const setAllCompleteItemsBill = (bill: boolean) => setCompleteItems((prev) => prev.map((it) => ({ ...it, bill })));

  const openPayModal = (inv: PayInvoice) => {
    setPayInvoice(inv);
    setPayForm({ amount: inv.remaining > 0 ? inv.remaining.toFixed(2) : "", method: "cash", notes: "" });
  };

  const handleCompleteConfirm = async () => {
    if (!selectedPatient || completeItems.length === 0) return;
    setCompleting(true);
    try {
      const createdBy = await resolveCreatedBy();
      const res = await apiFetch("/api/patient-work/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          treatment_date: completeDate,
          ...(completeNotes.trim() ? { notes: completeNotes.trim() } : {}),
          ...(createdBy ? { created_by: createdBy } : {}),
          create_invoice: completeBilledCount > 0,
          items: completeItems.map((i) => ({ record_id: i.id, amount: completeAmount(i) })),
        }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, t("dentalChart.completeFailed")));
        return;
      }
      const data = await res.json();
      if (data?.chart) setChart(mapChart(data.chart));
      setCompleteSelection([]);
      setShowCompleteModal(false);
      fetchPatientHistory(selectedPatient.id);
      if (data?.invoice) {
        toast.success(t("dentalChart.completedWithInvoiceToast"));
        openPayModal({
          id: Number(data.invoice.id),
          total: Number(data.invoice.total_amount) || 0,
          remaining: Number(data.invoice.remaining_amount) || 0,
        });
      } else {
        toast.success(t("dentalChart.completedToast"));
      }
    } catch {
      toast.error(t("dentalChart.completeFailed"));
    } finally {
      setCompleting(false);
    }
  };

  const handleRemoveRecord = async (id: number) => {
    if (!window.confirm(t("dentalChart.removePlanConfirm"))) return;
    setRemovingRecordId(id);
    try {
      const res = await apiFetch(`/api/patient-work/records/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readApiError(res, t("dentalChart.removeFailed")));
        return;
      }
      const data = await res.json();
      if (data?.chart) setChart(mapChart(data.chart));
      setCompleteSelection((prev) => prev.filter((x) => x !== id));
      if (selectedPatient) fetchPatientHistory(selectedPatient.id);
      toast.success(t("dentalChart.removed"));
    } catch {
      toast.error(t("dentalChart.removeFailed"));
    } finally {
      setRemovingRecordId(null);
    }
  };

  const handlePayConfirm = async () => {
    if (!payInvoice) return;
    const amount = parseFloat(payForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("expenses.invalidAmount"));
      return;
    }
    if (amount > payInvoice.remaining + 0.005) {
      toast.error(t("dentalChart.exceedsRemaining"));
      return;
    }
    setPaying(true);
    try {
      const createdBy = await resolveCreatedBy();
      const res = await apiFetch(`/api/billing/invoices/${payInvoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          payment_method: payForm.method,
          ...(payForm.notes.trim() ? { notes: payForm.notes.trim() } : {}),
          ...(createdBy ? { created_by: createdBy } : {}),
        }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, t("dentalChart.paymentFailed")));
        return;
      }
      const inv = await res.json();
      const remaining = Number(inv?.remaining_amount) || 0;
      toast.success(t("dentalChart.paymentRecorded"));
      if (selectedPatient) await fetchChart(selectedPatient.id);
      if (remaining <= 0) {
        setPayInvoice(null);
      } else {
        setPayInvoice({ id: payInvoice.id, total: Number(inv?.total_amount) || payInvoice.total, remaining });
        setPayForm((f) => ({ ...f, amount: remaining.toFixed(2), notes: "" }));
      }
    } catch {
      toast.error(t("dentalChart.paymentFailed"));
    } finally {
      setPaying(false);
    }
  };

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

  const calculateAge = (dateOfBirth: string): number | null => {
    if (!dateOfBirth) return null;
    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  };

  const filteredPatients = patients.filter((patient) => {
    const matchesSearch =
      patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.phone.includes(searchQuery);
    const matchesStatus =
      statusFilter === "all" || patient.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openPatientDetails = (patient: Patient) => {
    setSelectedPatient(patient);
    setActiveTab("info");
    setShowPatientModal(true);
    setPatientHistory(null);
    setDocuments([]);
    fetchPatientHistory(patient.id);
  };

  const handleTabChange = (tab: "info" | "appointments" | "treatments" | "chart" | "documents") => {
    setActiveTab(tab);
    if (tab === "documents" && selectedPatient && documents.length === 0) {
      fetchDocuments(selectedPatient.id);
    }
    if (tab === "chart" && selectedPatient && chartPatientId !== selectedPatient.id) {
      setSelectedTeeth([]);
      setWorkItems([]);
      fetchChart(selectedPatient.id);
    }
  };

  // Calculate stats
  const totalPatients = patients.length;
  const activePatients = patients.filter((p) => p.status === "active").length;
  const totalVisits = patients.reduce((sum, p) => sum + p.totalVisits, 0);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar activePage="patients" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <AdminPageHeader
          title={t("patients.patients")}
          subtitle={`${currentUser ? `${currentUser.firstName} ${currentUser.lastName}'s` : t("common.manage")} ${t("patients.patientRecords")}`}
          data={patients}
          filename="patients"
          onImport={async (rows) => {
            let ok = 0; let fail = 0;
            for (const row of rows as Record<string, unknown>[]) {
              try {
                const fullName = String(row.name ?? "");
                const parts = fullName.trim().split(/\s+/);
                const first_name = parts[0] || "Imported";
                const last_name = parts.slice(1).join(" ") || "Patient";
                const email = String(row.email ?? "");
                if (!email) { fail++; continue; }
                const res = await apiFetch("/api/users/register", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email, first_name, last_name, phone: String(row.phone ?? ""), role: "patient" }),
                });
                if (res.ok) ok++; else fail++;
              } catch { fail++; }
            }
            await fetchPatients();
            if (ok > 0) toast.success(`${ok} patient${ok > 1 ? "s" : ""} imported.`);
            if (fail > 0) toast.error(`${fail} row${fail > 1 ? "s" : ""} failed (missing email or duplicate).`);
          }}
          onAdd={handleOpenAddPatient}
          addLabel={t("patients.addPatient")}
        />

        <main className="flex-1 p-8 overflow-auto">
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatsCard icon={FaUsers} iconBgClass="bg-blue-100" iconColorClass="text-blue-600" value={totalPatients} label={t("patients.totalPatients")} />
                <StatsCard icon={FaCheckCircle} iconBgClass="bg-green-100" iconColorClass="text-green-600" value={activePatients} label={t("patients.activePatients")} />
                <StatsCard icon={FaCalendarAlt} iconBgClass="bg-purple-100" iconColorClass="text-purple-600" value={totalVisits} label={t("patients.totalVisits")} />
              </div>

              <FilterBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder={t("patients.searchPlaceholder")}
                filters={[
                  { value: "all", label: t("patients.all") },
                  { value: "active", label: t("patients.active"), activeClass: "bg-green-500 text-white" },
                  { value: "inactive", label: t("patients.inactive"), activeClass: "bg-gray-500 text-white" },
                ]}
                activeFilter={statusFilter}
                onFilterChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}
              />

              {/* Patients Grid */}
              {filteredPatients.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredPatients.map((patient) => (
                    <div
                      key={patient.id}
                      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => openPatientDetails(patient)}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <Avatar name={patient.name} size="lg" src={patient.photoUrl} />
                          <div>
                            <h3 className="font-bold text-gray-900">
                              {patient.name}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {calculateAge(patient.dateOfBirth) !== null ? `${calculateAge(patient.dateOfBirth)} ${t("patients.yearsOld")}` : "—"}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            patient.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {patient.status === "active" ? t("patients.active") : t("patients.inactive")}
                        </span>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <FaPhone className="text-gray-400 text-xs" />
                          {patient.phone}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <FaEnvelope className="text-gray-400 text-xs" />
                          {patient.email}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <FaIdCard className="text-gray-400 text-xs" />
                          {patient.insurance}
                        </div>
                      </div>

                      <div className="border-t border-gray-100 pt-4 flex justify-between text-sm">
                        <div>
                          <p className="text-gray-500">{t("patients.lastVisit")}</p>
                          <p className="font-semibold text-gray-900">
                            {formatDate(patient.lastVisit)}
                          </p>
                        </div>
                        <div className="text-right rtl:text-left">
                          <p className="text-gray-500">{t("patients.totalVisits")}</p>
                          <p className="font-semibold text-gray-900">
                            {patient.totalVisits}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
                  <EmptyState
                    icon={FaUsers}
                    title={t("patients.noPatientsFound")}
                    description={t("patients.noPatientsDesc")}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Patient Details Modal */}
      {showPatientModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full min-h-[70vh] max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header: identity row, then an actions row that wraps cleanly */}
            <div className="border-b border-gray-100">
              <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <Avatar name={selectedPatient.name} size="xl" src={selectedPatient.photoUrl} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold text-gray-900 leading-tight truncate">
                        {selectedPatient.name}
                      </h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          selectedPatient.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {selectedPatient.status === "active" ? t("patients.active") : t("patients.inactive")}
                      </span>
                      {selectedPatient.mustSetPassword && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                          <FaClock className="text-[10px]" /> {t("patients.noPortalAccess")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500 truncate">
                      {t("patients.patientSince")} {formatDate(selectedPatient.registeredDate)}
                      {calculateAge(selectedPatient.dateOfBirth) !== null && (
                        <> · {calculateAge(selectedPatient.dateOfBirth)} {t("patients.yearsOld")}</>
                      )}
                      {selectedPatient.phone && <> · {selectedPatient.phone}</>}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPatientModal(false)}
                  className="shrink-0 p-2 -mr-2 hover:bg-gray-100 rounded-lg"
                  aria-label={t("common.close")}
                >
                  <FaTimes className="text-gray-500" />
                </button>
              </div>

              <div className="px-6 pb-4 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="bg-dental-blue hover:bg-dental-blue/90 whitespace-nowrap"
                  onClick={() => { setBookDate(new Date().toISOString().split("T")[0]); setBookTime("09:00"); setBookError(""); setShowBookModal(true); }}
                >
                  <FaCalendarPlus className="mr-2 rtl:mr-0 rtl:ml-2" /> {t("patients.bookAppointment")}
                </Button>
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => handleOpenEditPatient(selectedPatient)}>
                  <FaEdit className="mr-2 rtl:mr-0 rtl:ml-2" /> {t("common.edit")}
                </Button>
                {selectedPatient.email && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap"
                    disabled={sendingInvite}
                    onClick={() => handleSendInvite(selectedPatient)}
                    title={t("patients.sendSetupLinkHint")}
                  >
                    {sendingInvite ? (
                      <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    ) : (
                      <FaEnvelope className="mr-2 rtl:mr-0 rtl:ml-2" />
                    )}
                    {t("patients.sendSetupLink")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={togglingStatusId === selectedPatient.id}
                  onClick={() => handleToggleStatus(selectedPatient)}
                  className={`whitespace-nowrap ${selectedPatient.status === "active" ? "text-gray-600" : "text-green-700 border-green-300"}`}
                >
                  {togglingStatusId === selectedPatient.id ? (
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  ) : null}
                  {selectedPatient.status === "active" ? "Set Inactive" : "Set Active"}
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="whitespace-nowrap text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => handleDeletePatient(selectedPatient)}
                >
                  <FaTrash className="mr-2 rtl:mr-0 rtl:ml-2" /> Delete
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6">
              {(["info", "appointments", "treatments", "chart", "documents"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`px-5 py-4 font-medium transition-colors relative text-sm ${
                    activeTab === tab ? "text-dental-blue" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab === "info" && <><FaIdCard className="inline mr-2" />{t("patients.info")}</>}
                  {tab === "appointments" && <><FaCalendarAlt className="inline mr-2" />{t("appointments.appointments")}</>}
                  {tab === "treatments" && <><FaNotesMedical className="inline mr-2" />{t("patients.treatmentsTab")}</>}
                  {tab === "chart" && <><FaTooth className="inline mr-2" />{t("dentalChart.tab")}</>}
                  {tab === "documents" && <><FaFileAlt className="inline mr-2" />Documents</>}
                  {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dental-blue" />}
                </button>
              ))}
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-6">
              {/* Info Tab */}
              {activeTab === "info" && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4">
                        {t("patients.contactInformation")}
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <FaPhone className="text-dental-blue" />
                          <span className="text-gray-700">
                            {selectedPatient.phone}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <FaEnvelope className="text-dental-blue" />
                          <span className="text-gray-700">
                            {selectedPatient.email}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <FaMapMarkerAlt className="text-dental-blue" />
                          <span className="text-gray-700">
                            {selectedPatient.address}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4">
                        {t("patients.personalDetails")}
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-gray-500">{t("patients.dateOfBirth")}</span>
                          <span className="font-medium text-gray-900">
                            {formatDate(selectedPatient.dateOfBirth)}
                            {calculateAge(selectedPatient.dateOfBirth) !== null && ` (${calculateAge(selectedPatient.dateOfBirth)} years)`}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">{t("patients.bloodType")}</span>
                          <span className="font-medium text-gray-900">
                            {selectedPatient.bloodType}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">{t("patients.insurance")}</span>
                          <span className="font-medium text-gray-900">
                            {selectedPatient.insurance}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-red-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FaAllergies className="text-red-500" /> {t("patients.allergies")}
                      </h3>
                      {selectedPatient.allergies.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedPatient.allergies.map((allergy) => (
                            <span
                              key={allergy}
                              className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium"
                            >
                              {allergy}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">{t("patients.noKnownAllergies")}</p>
                      )}
                    </div>

                    <div className="bg-blue-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FaNotesMedical className="text-blue-500" /> {t("patients.notesSection")}
                      </h3>
                      <p className="text-gray-700">
                        {selectedPatient.notes || t("patients.noNotes")}
                      </p>
                    </div>

                    <div className="bg-green-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4">
                        {t("patients.statistics")}
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-white rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">
                            {selectedPatient.totalVisits}
                          </p>
                          <p className="text-xs text-gray-500">{t("patients.totalVisits")}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Appointments Tab */}
              {activeTab === "appointments" && patientHistory && (
                <div className="space-y-4">
                  {patientHistory.appointments.length > 0 ? (
                    patientHistory.appointments.map((apt, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
                            <FaCalendarAlt className="text-dental-blue" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {apt.type}
                            </p>
                            <p className="text-sm text-gray-500">
                              {apt.doctor} •{" "}
                              {new Date(apt.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            {apt.status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {t("patients.noAppointmentsFound")}
                    </div>
                  )}
                </div>
              )}

              {/* Treatments Tab */}
              {activeTab === "treatments" && patientHistory && (
                <div className="space-y-4">
                  {patientHistory.treatments.length > 0 ? (
                    patientHistory.treatments.map((treatment, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <FaTooth className="text-purple-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {treatment.treatment}
                            </p>
                            <p className="text-sm text-gray-500">
                              {t("patients.tooth")} {treatment.tooth} • {treatment.doctor}
                            </p>
                          </div>
                        </div>
                        <span className="text-gray-500">
                          {new Date(treatment.date).toLocaleDateString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {t("patients.noTreatmentsFound")}
                    </div>
                  )}
                </div>
              )}

              {/* Dental Chart Tab */}
              {activeTab === "chart" && (
                <div className="space-y-6">
                  {chartLoading || !chart ? (
                    <LoadingSpinner />
                  ) : (
                    <>
                      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
                        {/* Chart: 3D model or 2D diagram, same selection and data */}
                        <div className="bg-gray-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="inline-flex rounded-lg bg-white border border-gray-200 p-0.5">
                              {(["3d", "2d"] as const).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => setChartView(v)}
                                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                    chartView === v ? "bg-dental-blue text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
                                  }`}
                                >
                                  {v === "3d" ? t("dentalChart.view3d") : t("dentalChart.view2d")}
                                </button>
                              ))}
                            </div>
                            {selectedTeeth.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedTeeth([])}
                                className="text-xs font-medium text-gray-500 hover:text-gray-800"
                              >
                                {t("dentalChart.clearSelection")} ({selectedTeeth.length})
                              </button>
                            )}
                          </div>
                          {chartView === "3d" ? (
                            <ToothModel3D
                              teeth={chart.teeth}
                              selected={selectedTeeth}
                              onToggle={toggleTooth}
                              labels={{
                                healthy: t("dentalChart.healthy"),
                                treated: t("dentalChart.treated"),
                                planned: t("dentalChart.planned"),
                                missing: t("dentalChart.missing"),
                                selected: t("dentalChart.selected"),
                                front: t("dentalChart.viewFront"),
                                upper: t("dentalChart.viewUpper"),
                                lower: t("dentalChart.viewLower"),
                                hint: t("dentalChart.dragHint"),
                                credit: t("dentalChart.modelCredit"),
                              }}
                            />
                          ) : (
                            <ToothChart
                              teeth={chart.teeth}
                              selected={selectedTeeth}
                              onToggle={toggleTooth}
                              labels={{
                                healthy: t("dentalChart.healthy"),
                                treated: t("dentalChart.treated"),
                                planned: t("dentalChart.planned"),
                                missing: t("dentalChart.missing"),
                                selected: t("dentalChart.selected"),
                                upper: t("dentalChart.upper"),
                                lower: t("dentalChart.lower"),
                              }}
                            />
                          )}
                        </div>

                        {/* Work panel */}
                        <div className="space-y-4">
                          <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                            <h3 className="font-semibold text-gray-900">{t("dentalChart.addWork")}</h3>
                            {selectedTeeth.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {[...selectedTeeth].sort().map((tooth) => (
                                  <button
                                    key={tooth}
                                    type="button"
                                    onClick={() => toggleTooth(tooth)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dental-blue text-white text-xs font-semibold"
                                    title={t("common.remove")}
                                  >
                                    {tooth} <FaTimes className="text-[9px]" />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500">{t("dentalChart.selectTeethHint")}</p>
                            )}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">{t("dentalChart.procedure")}</label>
                              <select
                                value={workForm.procedure}
                                onChange={(e) => handleWorkProcedureChange(e.target.value)}
                                disabled={workForm.status === "missing"}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30 disabled:bg-gray-100 disabled:text-gray-400"
                              >
                                {PROCEDURES.map((p) => <option key={p} value={p}>{p}</option>)}
                              </select>
                              {workForm.status === "missing" && (
                                <p className="mt-1 text-xs text-gray-500">{t("dentalChart.missingHint")}</p>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t("common.status")}</label>
                                <select
                                  value={workForm.status}
                                  onChange={(e) => handleWorkStatusChange(e.target.value as WorkStatus)}
                                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                                >
                                  <option value="completed">{t("dentalChart.completed")}</option>
                                  <option value="planned">{t("dentalChart.plannedStatus")}</option>
                                  <option value="missing">{t("dentalChart.missingStatus")}</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t("dentalChart.pricePerTooth")}</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={workForm.amount}
                                  onChange={(e) => setWorkForm((f) => ({ ...f, amount: e.target.value }))}
                                  disabled={workForm.status === "missing"}
                                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30 disabled:bg-gray-100 disabled:text-gray-400"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">{t("patients.notesSection")}</label>
                              <input
                                type="text"
                                value={workForm.notes}
                                onChange={(e) => setWorkForm((f) => ({ ...f, notes: e.target.value }))}
                                placeholder={t("dentalChart.notesPlaceholder")}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                              />
                            </div>
                            <Button
                              size="sm"
                              className="w-full bg-dental-blue hover:bg-dental-blue/90"
                              disabled={selectedTeeth.length === 0}
                              onClick={handleAddWorkItems}
                            >
                              {t("dentalChart.addToList")}
                              {selectedTeeth.length > 0 ? ` (${selectedTeeth.length})` : ""}
                            </Button>
                          </div>

                          {workItems.length > 0 && (
                            <div className="border border-dental-blue/30 bg-blue-50/40 rounded-xl p-4 space-y-3">
                              <h3 className="font-semibold text-gray-900">
                                {t("dentalChart.pendingWork")} ({workItems.length})
                              </h3>
                              <ul className="divide-y divide-gray-100 rounded-lg bg-white border border-gray-100 max-h-48 overflow-y-auto">
                                {workItems.map((item, index) => (
                                  <li key={`${item.tooth}-${item.procedure}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                    <div className="min-w-0">
                                      <p className="font-medium text-gray-900 truncate">
                                        <span className="inline-block w-8 text-dental-blue font-bold">{item.tooth}</span>
                                        {procedureLabel(item.status, item.procedure)}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {workStatusLabel(item.status)}
                                        {item.notes ? ` · ${item.notes}` : ""}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {isBillableWorkItem(item) && (
                                        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                                          <input type="checkbox" checked={item.bill} onChange={() => handleToggleWorkItemBill(index)} />
                                          {t("dentalChart.addToInvoice")}
                                        </label>
                                      )}
                                      {item.status !== "missing" && (
                                        <span
                                          className={`text-sm font-semibold ${
                                            isBillableWorkItem(item) && !item.bill ? "text-gray-400 line-through" : "text-gray-700"
                                          }`}
                                        >
                                          ${item.amount.toFixed(2)}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveWorkItem(index)}
                                        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-100"
                                      >
                                        <FaTrash className="text-xs" />
                                      </button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">{t("common.date")}</label>
                                  <input
                                    type="date"
                                    value={workDate}
                                    onChange={(e) => setWorkDate(e.target.value)}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">{t("dentalChart.visitNotes")}</label>
                                  <input
                                    type="text"
                                    value={workNotes}
                                    onChange={(e) => setWorkNotes(e.target.value)}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                                  />
                                </div>
                              </div>
                              {workBillableCount > 0 && (
                                <div className="rounded-lg bg-white border border-gray-100 px-3 py-2 text-sm text-gray-700">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      {workBilledCount > 0 ? (
                                        <>
                                          <p>
                                            {t("dentalChart.newInvoice")}: <span className="font-semibold text-gray-900">${workInvoiceTotal.toFixed(2)}</span>
                                            <span className="text-gray-500"> · {workBilledCount}/{workBillableCount} {t("dentalChart.items")}</span>
                                          </p>
                                          <p className="text-xs text-gray-500">
                                            {t("dentalChart.payAfterHint")}
                                            {workBilledCount < workBillableCount ? ` ${t("dentalChart.unbilledLaterHint")}` : ""}
                                          </p>
                                        </>
                                      ) : (
                                        <p className="text-xs text-gray-500">{t("dentalChart.noInvoiceHint")}</p>
                                      )}
                                    </div>
                                    {workBillableCount > 1 && (
                                      <div className="flex gap-3 text-xs whitespace-nowrap shrink-0">
                                        <button type="button" onClick={() => setAllWorkItemsBill(true)} className="font-medium text-dental-blue hover:underline">
                                          {t("dentalChart.billAll")}
                                        </button>
                                        <button type="button" onClick={() => setAllWorkItemsBill(false)} className="font-medium text-gray-500 hover:underline">
                                          {t("dentalChart.billNone")}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              <Button
                                className="w-full bg-dental-blue hover:bg-dental-blue/90"
                                disabled={savingWork}
                                onClick={handleSaveWork}
                              >
                                {savingWork ? (
                                  <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Saving...</>
                                ) : t("dentalChart.saveWork")}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* History */}
                      <div>
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                          <h3 className="font-semibold text-gray-900">{t("dentalChart.history")}</h3>
                          {chart.history.some(isBillable) && (
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              {completeSelection.length > 0 ? (
                                <>
                                  <button type="button" onClick={() => setCompleteSelection([])} className="hover:text-gray-800">
                                    {t("dentalChart.clearSelection")}
                                  </button>
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 whitespace-nowrap" onClick={() => openCompleteModal(completeSelection)}>
                                    <FaCheckCircle className="mr-2 rtl:mr-0 rtl:ml-2" />
                                    {selectionHasPlanned ? t("dentalChart.markCompleted") : t("dentalChart.createInvoiceAction")} ({completeSelection.length})
                                  </Button>
                                </>
                              ) : (
                                <span>{t("dentalChart.selectPlannedHint")}</span>
                              )}
                            </div>
                          )}
                        </div>
                        {chart.history.length === 0 ? (
                          <p className="text-sm text-gray-500">{t("dentalChart.noHistory")}</p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-gray-100">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 text-left rtl:text-right text-xs font-semibold text-gray-600">
                                <tr>
                                  <th className="py-2.5 pl-4 pr-1 w-8">
                                    {chart.history.some(isBillable) && (
                                      <input
                                        type="checkbox"
                                        aria-label={t("dentalChart.selectAllPlanned")}
                                        checked={
                                          completeSelection.length > 0 &&
                                          chart.history.filter(isBillable).every((h) => completeSelection.includes(h.id))
                                        }
                                        onChange={(e) =>
                                          setCompleteSelection(e.target.checked ? chart.history.filter(isBillable).map((h) => h.id) : [])
                                        }
                                      />
                                    )}
                                  </th>
                                  <th className="py-2.5 px-3">{t("common.date")}</th>
                                  <th className="py-2.5 px-3">{t("dentalChart.toothCol")}</th>
                                  <th className="py-2.5 px-3">{t("dentalChart.procedure")}</th>
                                  <th className="py-2.5 px-3">{t("common.status")}</th>
                                  <th className="py-2.5 px-3">{t("dentalChart.doctor")}</th>
                                  <th className="py-2.5 px-3">{t("dentalChart.invoice")}</th>
                                  <th className="py-2.5 px-3 text-right rtl:text-left">{t("common.actions")}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {chart.history.map((h) => (
                                  <tr key={h.id} className={`hover:bg-gray-50 ${completeSelection.includes(h.id) ? "bg-green-50/60" : ""}`}>
                                    <td className="py-2.5 pl-4 pr-1">
                                      {isBillable(h) && (
                                        <input
                                          type="checkbox"
                                          checked={completeSelection.includes(h.id)}
                                          onChange={() => toggleCompleteSelection(h.id)}
                                          aria-label={`${h.tooth} ${h.procedure}`}
                                        />
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{h.date ? new Date(`${h.date}T12:00:00`).toLocaleDateString() : "—"}</td>
                                    <td className="py-2.5 px-3 font-bold text-dental-blue">{h.tooth}</td>
                                    <td className="py-2.5 px-3 text-gray-900">
                                      {procedureLabel(h.status, h.procedure)}
                                      {h.notes && h.notes !== h.procedure && (
                                        <span className="block text-xs text-gray-500 truncate max-w-[240px]">{h.notes}</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {h.status === "planned" ? (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">{t("dentalChart.plannedStatus")}</span>
                                      ) : h.status === "missing" ? (
                                        <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs font-medium">{t("dentalChart.missingStatus")}</span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">{t("dentalChart.completed")}</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{h.doctor || "—"}</td>
                                    <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                                      {h.invoiceId ? (
                                        <span className="inline-flex items-center gap-1.5">
                                          <span className="font-medium text-gray-800">#{h.invoiceId}</span>
                                          {h.invoiceStatus === "paid" ? (
                                            <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[11px] font-medium">{t("dentalChart.invoicePaid")}</span>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[11px] font-medium">
                                              ${h.invoiceRemaining.toFixed(2)} {t("dentalChart.invoiceRemaining")}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        "—"
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {h.status === "planned" && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50 whitespace-nowrap"
                                            onClick={() => openCompleteModal([h.id])}
                                          >
                                            <FaCheckCircle className="mr-1" /> {t("dentalChart.complete")}
                                          </Button>
                                        )}
                                        {h.status === "completed" && !h.invoiceId && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-xs whitespace-nowrap"
                                            onClick={() => openCompleteModal([h.id])}
                                            title={t("dentalChart.unbilled")}
                                          >
                                            <FaMoneyBillWave className="mr-1" /> {t("dentalChart.bill")}
                                          </Button>
                                        )}
                                        {h.invoiceId && h.invoiceStatus !== "paid" && h.invoiceRemaining > 0 && (
                                          <Button
                                            size="sm"
                                            className="h-7 px-2 text-xs bg-dental-blue hover:bg-dental-blue/90 whitespace-nowrap"
                                            onClick={() => openPayModal({ id: h.invoiceId as number, total: h.invoiceTotal, remaining: h.invoiceRemaining })}
                                          >
                                            <FaMoneyBillWave className="mr-1" /> {t("dentalChart.pay")}
                                          </Button>
                                        )}
                                        {(h.status === "planned" || h.status === "missing") && !h.invoiceId && (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveRecord(h.id)}
                                            disabled={removingRecordId === h.id}
                                            title={t("dentalChart.removePlan")}
                                            className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-gray-100 disabled:opacity-40"
                                          >
                                            {removingRecordId === h.id ? (
                                              <span className="block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                              <FaTrash className="text-xs" />
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Documents Tab */}
              {activeTab === "documents" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">Patient Documents</h3>
                    <div>
                      <input
                        ref={docInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleDocumentUpload(file);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        size="sm"
                        className="bg-dental-blue hover:bg-dental-blue/90"
                        onClick={() => docInputRef.current?.click()}
                        disabled={uploadingDoc}
                      >
                        <FaUpload className="mr-2" />
                        {uploadingDoc ? "Uploading..." : "Upload Document"}
                      </Button>
                    </div>
                  </div>

                  {docsLoading ? (
                    <div className="text-center py-12"><LoadingSpinner /></div>
                  ) : documents.length > 0 ? (
                    <div className="space-y-3">
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                              <FaFileAlt className="text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{doc.file_name || doc.original_name || "Document"}</p>
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <FaClock className="text-xs" />
                                {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : "—"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.url && (
                              <button
                                onClick={() => setPreviewDoc(doc)}
                                className="p-2 text-dental-blue hover:bg-blue-50 rounded-lg transition-colors"
                                title="View"
                              >
                                <FaFileAlt />
                              </button>
                            )}
                            {doc.url && (
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Download"
                              >
                                <FaDownload />
                              </a>
                            )}
                            <button
                              onClick={() => handleDeleteDocument(doc.id)}
                              disabled={deletingDocId === doc.id}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                              title="Delete"
                            >
                              {deletingDocId === doc.id ? (
                                <span className="block w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <FaTrash />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <FaFileAlt className="mx-auto text-3xl mb-3 text-gray-300" />
                      <p>No documents uploaded yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* Loading state for history */}
              {(activeTab === "appointments" || activeTab === "treatments") && !patientHistory && (
                <div className="text-center py-12">
                  <LoadingSpinner />
                  <p className="text-gray-500 mt-4">{t("patients.loadingHistory")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Book Appointment Modal */}
      {showBookModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Book Appointment</h2>
              <button
                onClick={() => { setShowBookModal(false); setBookReason(""); setBookError(""); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <FaTimes className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">Patient: <span className="font-medium text-gray-900">{selectedPatient.name}</span></p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={bookDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => { setBookDate(e.target.value); setBookError(""); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Time</label>
                  <input
                    type="time"
                    value={bookTime}
                    onChange={(e) => { setBookTime(e.target.value); setBookError(""); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={bookReason}
                  onChange={(e) => setBookReason(e.target.value)}
                  placeholder="e.g. Routine checkup, tooth pain..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                />
              </div>

              {bookError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{bookError}</p>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowBookModal(false); setBookReason(""); setBookError(""); }}
              >
                Cancel
              </Button>
              <Button
                className="bg-dental-blue hover:bg-dental-blue/90"
                disabled={bookLoading}
                onClick={handleBookAppointment}
              >
                {bookLoading ? "Booking..." : "Book Appointment"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Planned Work Modal */}
      {showCompleteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !completing) setShowCompleteModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {completeAllDone ? t("dentalChart.billTitle") : t("dentalChart.completeTitle")}
              </h2>
              <button onClick={() => setShowCompleteModal(false)} className="p-2 hover:bg-gray-100 rounded-lg" disabled={completing}>
                <FaTimes className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">{completeAllDone ? t("dentalChart.billHint") : t("dentalChart.completeHint")}</p>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 max-h-60 overflow-y-auto">
                {completeItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        <span className="inline-block w-8 text-dental-blue font-bold">{item.tooth}</span>
                        {item.procedure}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.status === "planned" ? `${t("dentalChart.plannedStatus")} → ${t("dentalChart.completed")}` : t("dentalChart.unbilled")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right rtl:text-left">
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer whitespace-nowrap mb-1.5">
                        <input
                          type="checkbox"
                          checked={item.bill}
                          onChange={(e) =>
                            setCompleteItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, bill: e.target.checked } : p)))
                          }
                        />
                        {t("dentalChart.addToInvoice")}
                      </label>
                      {item.bill ? (
                        <div>
                          <label htmlFor={`complete-price-${item.id}`} className="block text-[11px] text-gray-500 mb-0.5">
                            {t("dentalChart.priceToBill")}
                          </label>
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-sm text-gray-500">$</span>
                            <input
                              id={`complete-price-${item.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.amount}
                              onChange={(e) =>
                                setCompleteItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, amount: e.target.value } : p)))
                              }
                              className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-400">{t("dentalChart.notBilledNow")}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t("common.date")}</label>
                  <input
                    type="date"
                    value={completeDate}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setCompleteDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t("dentalChart.visitNotes")}</label>
                  <input
                    type="text"
                    value={completeNotes}
                    onChange={(e) => setCompleteNotes(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {completeBilledCount > 0 ? (
                      <>
                        <p>
                          {t("dentalChart.newInvoice")}: <span className="font-semibold text-gray-900">${completeTotal.toFixed(2)}</span>
                          <span className="text-gray-500"> · {completeBilledCount}/{completeItems.length} {t("dentalChart.items")}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {t("dentalChart.payAfterHint")}
                          {completeBilledCount < completeItems.length ? ` ${t("dentalChart.unbilledLaterHint")}` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-500">{t("dentalChart.noInvoiceHint")}</p>
                    )}
                  </div>
                  {completeItems.length > 1 && (
                    <div className="flex gap-3 text-xs whitespace-nowrap shrink-0">
                      <button type="button" onClick={() => setAllCompleteItemsBill(true)} className="font-medium text-dental-blue hover:underline">
                        {t("dentalChart.billAll")}
                      </button>
                      <button type="button" onClick={() => setAllCompleteItemsBill(false)} className="font-medium text-gray-500 hover:underline">
                        {t("dentalChart.billNone")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCompleteModal(false)} disabled={completing}>
                {t("common.cancel")}
              </Button>
              <Button className="bg-green-600 hover:bg-green-700" disabled={completing} onClick={handleCompleteConfirm}>
                {completing ? (
                  <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Saving...</>
                ) : (
                  <>
                    <FaCheckCircle className="mr-2 rtl:mr-0 rtl:ml-2" />
                    {completeAllDone ? t("dentalChart.createInvoiceAction") : t("dentalChart.markCompleted")} ({completeItems.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Payment Modal */}
      {payInvoice && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !paying) setPayInvoice(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {t("dentalChart.payInvoice")} <span className="text-gray-400 font-semibold">#{payInvoice.id}</span>
              </h2>
              <button onClick={() => setPayInvoice(null)} className="p-2 hover:bg-gray-100 rounded-lg" disabled={paying}>
                <FaTimes className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3 rounded-xl bg-gray-50 border border-gray-100 p-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{t("expenses.totalAmount")}</p>
                  <p className="mt-1 font-semibold text-gray-900">${payInvoice.total.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{t("expenses.amountPaid")}</p>
                  <p className="mt-1 font-semibold text-green-700">${(payInvoice.total - payInvoice.remaining).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{t("expenses.remaining")}</p>
                  <p className="mt-1 font-semibold text-red-600">${payInvoice.remaining.toFixed(2)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t("dentalChart.paymentAmount")}</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={payInvoice.remaining}
                    value={payForm.amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setPayForm((f) => ({ ...f, amount: payInvoice.remaining.toFixed(2) }))}
                    className="mt-1 text-xs font-medium text-dental-blue hover:underline"
                  >
                    {t("expenses.payRemaining")}
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t("dentalChart.paymentMethod")}</label>
                  <select
                    value={payForm.method}
                    onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value as (typeof PAYMENT_METHODS)[number] }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  >
                    <option value="cash">{t("expenses.cash")}</option>
                    <option value="card">{t("expenses.card")}</option>
                    <option value="insurance">{t("dentalChart.insurance")}</option>
                    <option value="bank_transfer">{t("expenses.bankTransfer")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t("expenses.notes")}</label>
                <input
                  type="text"
                  value={payForm.notes}
                  onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder={t("expenses.notesPlaceholder")}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setPayInvoice(null)} disabled={paying}>
                {t("common.close")}
              </Button>
              <Button className="bg-dental-blue hover:bg-dental-blue/90" disabled={paying} onClick={handlePayConfirm}>
                {paying ? (
                  <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Saving...</>
                ) : (
                  <><FaMoneyBillWave className="mr-2 rtl:mr-0 rtl:ml-2" />{t("dentalChart.recordPayment")}</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Password Setup Link Modal */}
      {inviteResult && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setInviteResult(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">{t("patients.setupLink")}</h2>
              <button onClick={() => setInviteResult(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <FaTimes className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">{inviteResult.name}</span>
                {inviteResult.email ? <span className="text-gray-500"> · {inviteResult.email}</span> : null}
              </p>
              {inviteResult.emailed ? (
                <div className="flex items-start gap-2 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800">
                  <FaCheckCircle className="mt-0.5 shrink-0" />
                  <span>{t("patients.setupLinkEmailed")}</span>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
                  {t("patients.setupLinkNotEmailed")}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.setupLink")}</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={inviteResult.link}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 bg-gray-50 focus:outline-none"
                  />
                  <Button variant="outline" size="sm" onClick={handleCopyInviteLink}>
                    {t("patients.copyLink")}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-gray-500">{t("patients.setupLinkExpiry")}</p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end">
              <Button className="bg-dental-blue hover:bg-dental-blue/90" onClick={() => setInviteResult(null)}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Patient Modal */}
      {showAddPatientModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !addPatientSaving) setShowAddPatientModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">{t("patients.addNewPatient")}</h2>
              <button
                onClick={() => setShowAddPatientModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
                disabled={addPatientSaving}
              >
                <FaTimes className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[65vh]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.firstName")} *</label>
                  <input
                    type="text"
                    value={newPatient.firstName}
                    onChange={(e) => setNewPatient((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.lastName")} *</label>
                  <input
                    type="text"
                    value={newPatient.lastName}
                    onChange={(e) => setNewPatient((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.email")}</label>
                  <input
                    type="email"
                    value={newPatient.email}
                    onChange={(e) => setNewPatient((f) => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.phone")}</label>
                  <input
                    type="tel"
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 -mt-2">{t("patients.emailOrPhoneHint")}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.dateOfBirth")}</label>
                  <input
                    type="date"
                    value={newPatient.dateOfBirth}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setNewPatient((f) => ({ ...f, dateOfBirth: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.gender")}</label>
                  <select
                    value={newPatient.gender}
                    onChange={(e) => setNewPatient((f) => ({ ...f, gender: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  >
                    <option value="">{t("patients.selectGender")}</option>
                    <option value="male">{t("patients.male")}</option>
                    <option value="female">{t("patients.female")}</option>
                    <option value="other">{t("patients.otherGender")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.address")}</label>
                <input
                  type="text"
                  value={newPatient.address}
                  onChange={(e) => setNewPatient((f) => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.bloodType")}</label>
                  <select
                    value={newPatient.bloodType}
                    onChange={(e) => setNewPatient((f) => ({ ...f, bloodType: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  >
                    <option value="">{t("patients.unknown")}</option>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bt) => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.insurance")}</label>
                  <input
                    type="text"
                    value={newPatient.insurance}
                    onChange={(e) => setNewPatient((f) => ({ ...f, insurance: e.target.value }))}
                    placeholder="e.g. AXA, BUPA, Self-pay"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.allergies")}</label>
                <input
                  type="text"
                  value={newPatient.allergies}
                  onChange={(e) => setNewPatient((f) => ({ ...f, allergies: e.target.value }))}
                  placeholder="Comma-separated, e.g. Penicillin, Latex"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.notesSection")}</label>
                <textarea
                  value={newPatient.notes}
                  onChange={(e) => setNewPatient((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30 resize-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAddPatientModal(false)} disabled={addPatientSaving}>
                {t("common.cancel")}
              </Button>
              <Button
                className="bg-dental-blue hover:bg-dental-blue/90"
                disabled={addPatientSaving}
                onClick={handleAddPatient}
              >
                {addPatientSaving ? (
                  <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Saving...</>
                ) : t("patients.addPatient")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Patient Modal */}
      {showEditPatientModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Patient</h2>
              <button
                onClick={() => setShowEditPatientModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <FaTimes className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[65vh]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={editPatientForm.phone}
                    onChange={(e) => setEditPatientForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.dateOfBirth")}</label>
                  <input
                    type="date"
                    value={editPatientForm.dateOfBirth}
                    onChange={(e) => setEditPatientForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.bloodType")}</label>
                  <select
                    value={editPatientForm.bloodType}
                    onChange={(e) => setEditPatientForm((f) => ({ ...f, bloodType: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  >
                    <option value="">Unknown</option>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bt) => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.insurance")}</label>
                  <input
                    type="text"
                    value={editPatientForm.insurance}
                    onChange={(e) => setEditPatientForm((f) => ({ ...f, insurance: e.target.value }))}
                    placeholder="e.g. AXA, BUPA, Self-pay"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.allergies")}</label>
                <input
                  type="text"
                  value={editPatientForm.allergies}
                  onChange={(e) => setEditPatientForm((f) => ({ ...f, allergies: e.target.value }))}
                  placeholder="Comma-separated, e.g. Penicillin, Latex"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.notesSection")}</label>
                <textarea
                  value={editPatientForm.notes}
                  onChange={(e) => setEditPatientForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30 resize-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowEditPatientModal(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                className="bg-dental-blue hover:bg-dental-blue/90"
                disabled={editPatientSaving}
                onClick={handleEditPatientSave}
              >
                {editPatientSaving ? (
                  <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Saving...</>
                ) : t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-900 truncate">{previewDoc.file_name || "Document"}</p>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <a
                  href={previewDoc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-dental-blue border border-dental-blue/30 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <FaDownload className="text-xs" /> Download
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <FaTimes className="text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 bg-gray-100">
              {/\.(png|jpe?g|gif|webp|svg)$/i.test(previewDoc.file_name || "") ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.file_name || "document"}
                  className="max-w-full max-h-[75vh] mx-auto rounded-lg object-contain"
                />
              ) : (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.file_name || "document"}
                  className="w-full rounded-lg bg-white"
                  style={{ height: "75vh" }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
