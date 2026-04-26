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

export default function PatientsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "info" | "appointments" | "treatments" | "documents"
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
  const [bookStartTime, setBookStartTime] = useState("09:00");
  const [bookEndTime, setBookEndTime] = useState("10:00");
  const [bookDoctorId, setBookDoctorId] = useState<number | null>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
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

  const fetchDoctors = async () => {
    try {
      const res = await apiFetch(`/api/users`);
      const data = await res.json();
      const list: any[] = Array.isArray(data) ? data : (data.data ?? []);
      setDoctors(list.filter((u: any) => u.role === 'doctor' || u.role === 'admin'));
    } catch {}
  };

  const handleBookAppointment = async () => {
    if (!selectedPatient) return;
    const effectiveDoctorId = bookDoctorId ?? doctorId;
    if (!effectiveDoctorId) {
      setBookError("Please select a doctor.");
      return;
    }
    if (bookStartTime >= bookEndTime) {
      setBookError("End time must be after start time.");
      return;
    }
    setBookLoading(true);
    setBookError("");
    try {
      const res = await apiFetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          doctor_id: effectiveDoctorId,
          appointment_date: bookDate,
          start_time: bookStartTime,
          end_time: bookEndTime,
          reason: bookReason || undefined,
          auto_confirm: true,
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
        const msg = Array.isArray(err.message) ? err.message.join(", ") : (err.message || "Failed to book appointment.");
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

  const handleTabChange = (tab: "info" | "appointments" | "treatments" | "documents") => {
    setActiveTab(tab);
    if (tab === "documents" && selectedPatient && documents.length === 0) {
      fetchDocuments(selectedPatient.id);
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Avatar name={selectedPatient.name} size="xl" src={selectedPatient.photoUrl} />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedPatient.name}
                  </h2>
                  <p className="text-gray-500">
                    {t("patients.patientSince")}{" "}
                    {formatDate(selectedPatient.registeredDate)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={togglingStatusId === selectedPatient.id}
                  onClick={() => handleToggleStatus(selectedPatient)}
                  className={selectedPatient.status === "active" ? "text-gray-600 border-gray-300" : "text-green-700 border-green-300"}
                >
                  {togglingStatusId === selectedPatient.id ? (
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  ) : null}
                  {selectedPatient.status === "active" ? "Set Inactive" : "Set Active"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleOpenEditPatient(selectedPatient)}>
                  <FaEdit className="mr-2 rtl:mr-0 rtl:ml-2" /> {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  className="bg-dental-blue hover:bg-dental-blue/90"
                  onClick={() => { setBookDate(new Date().toISOString().split("T")[0]); setBookStartTime("09:00"); setBookEndTime("10:00"); setBookDoctorId(doctorId); setBookError(""); fetchDoctors(); setShowBookModal(true); }}
                >
                  <FaCalendarPlus className="mr-2 rtl:mr-0 rtl:ml-2" /> {t("patients.bookAppointment")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => handleDeletePatient(selectedPatient)}
                >
                  <FaTrash className="mr-2 rtl:mr-0 rtl:ml-2" /> Delete
                </Button>
                <button
                  onClick={() => setShowPatientModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <FaTimes className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6">
              {(["info", "appointments", "treatments", "documents"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`px-5 py-4 font-medium transition-colors relative text-sm ${
                    activeTab === tab ? "text-dental-blue" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab === "info" && <><FaIdCard className="inline mr-2" />{t("patients.info")}</>}
                  {tab === "appointments" && <><FaCalendarAlt className="inline mr-2" />{t("appointments.appointments")}</>}
                  {tab === "treatments" && <><FaTooth className="inline mr-2" />{t("patients.treatmentsTab")}</>}
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
                onClick={() => { setShowBookModal(false); setBookReason(""); setBookError(""); setDoctors([]); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <FaTimes className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">Patient: <span className="font-medium text-gray-900">{selectedPatient.name}</span></p>

              {/* Doctor selector — shown to admins/secretaries; auto-set for doctors */}
              {(userRole === "admin" || userRole === "secretary" || !doctorId) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Doctor</label>
                  <select
                    value={bookDoctorId ?? ""}
                    onChange={(e) => { setBookDoctorId(Number(e.target.value) || null); setBookError(""); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  >
                    <option value="">Select a doctor…</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                    ))}
                  </select>
                </div>
              )}

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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={bookStartTime}
                    onChange={(e) => { setBookStartTime(e.target.value); setBookError(""); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={bookEndTime}
                    onChange={(e) => { setBookEndTime(e.target.value); setBookError(""); }}
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
                onClick={() => { setShowBookModal(false); setBookReason(""); setBookError(""); setDoctors([]); }}
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
                    onChange={(e) => setEditPatientForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9+\-\s()]/g, "") }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-dental-blue/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.dateOfBirth")}</label>
                  <input
                    type="date"
                    value={editPatientForm.dateOfBirth}
                    max={new Date().toISOString().split("T")[0]}
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
