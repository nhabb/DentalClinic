"use client";
import { apiFetch } from '@/lib/api/client';

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { StatsCard } from "@/components/ui/StatsCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Avatar } from "@/components/ui/Avatar";
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
} from "react-icons/fa";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface Patient {
  id: number;
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
    "info" | "appointments" | "treatments"
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
  const [patientHistory, setPatientHistory] = useState<PatientHistory | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

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
  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const [patientsRes, usersRes] = await Promise.all([
          apiFetch(`/api/patients`),
          apiFetch(`/api/users`),
        ]);
        const patientsData = await patientsRes.json();
        const users: any[] = await usersRes.json();

        const mapped = (patientsData.data || []).map((p: any) => {
          const user = users.find((u) => u.id === p.user_id || u.id === String(p.user_id));
          return {
            id: Number(p.id),
            name: user ? `${user.first_name} ${user.last_name}` : `Patient #${p.id}`,
            email: user?.email || "",
            phone: user?.phone || "",
            dateOfBirth: "",
            address: `${p.city || ""}, ${p.governate || ""}`.trim().replace(/^,\s*|,\s*$/, ""),
            bloodType: p.blood_type || "",
            allergies: p.allergies ? p.allergies.split(",").map((a: string) => a.trim()) : [],
            insurance: p.insurance_provider || "",
            registeredDate: user?.created_at?.split("T")[0] || "",
            lastVisit: "",
            totalVisits: 0,
            status: user?.is_active ? "active" : "inactive",
            notes: p.medical_notes || "",
          };
        });
        setPatients(mapped);
      } catch (e) {
        console.error("Failed to fetch patients", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPatients();
  }, []);

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

  const handleLogout = () => {
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("userRole");
    safeStorage.removeItem("doctorId");
    safeStorage.removeItem("assignedDoctorIds");
    router.push("/login");
  };

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
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
    fetchPatientHistory(patient.id);
  };

  // Calculate stats
  const totalPatients = patients.length;
  const activePatients = patients.filter((p) => p.status === "active").length;
  const totalVisits = patients.reduce((sum, p) => sum + p.totalVisits, 0);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar activePage="patients" sidebarOpen={sidebarOpen} onLogout={handleLogout} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <AdminPageHeader
          title={t("patients.patients")}
          subtitle={`${currentUser ? `${currentUser.firstName} ${currentUser.lastName}'s` : t("common.manage")} ${t("patients.patientRecords")}`}
          data={patients}
          filename="patients"
          onImport={(rows) => setPatients((prev) => [...prev, ...(rows as Patient[])])}
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
                          <Avatar name={patient.name} size="lg" />
                          <div>
                            <h3 className="font-bold text-gray-900">
                              {patient.name}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {calculateAge(patient.dateOfBirth)} {t("patients.yearsOld")}
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
                            {new Date(patient.lastVisit).toLocaleDateString()}
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
                <Avatar name={selectedPatient.name} size="xl" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedPatient.name}
                  </h2>
                  <p className="text-gray-500">
                    {t("patients.patientSince")}{" "}
                    {new Date(
                      selectedPatient.registeredDate,
                    ).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm">
                  <FaEdit className="mr-2 rtl:mr-0 rtl:ml-2" /> {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  className="bg-dental-blue hover:bg-dental-blue/90"
                >
                  <FaCalendarPlus className="mr-2 rtl:mr-0 rtl:ml-2" /> {t("patients.bookAppointment")}
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
              <button
                onClick={() => setActiveTab("info")}
                className={`px-6 py-4 font-medium transition-colors relative ${
                  activeTab === "info"
                    ? "text-dental-blue"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FaIdCard className="inline mr-2 rtl:mr-0 rtl:ml-2" /> {t("patients.info")}
                {activeTab === "info" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dental-blue" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("appointments")}
                className={`px-6 py-4 font-medium transition-colors relative ${
                  activeTab === "appointments"
                    ? "text-dental-blue"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FaCalendarAlt className="inline mr-2 rtl:mr-0 rtl:ml-2" /> {t("appointments.appointments")}
                {activeTab === "appointments" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dental-blue" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("treatments")}
                className={`px-6 py-4 font-medium transition-colors relative ${
                  activeTab === "treatments"
                    ? "text-dental-blue"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FaTooth className="inline mr-2 rtl:mr-0 rtl:ml-2" /> {t("patients.treatmentsTab")}
                {activeTab === "treatments" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dental-blue" />
                )}
              </button>
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
                            {new Date(
                              selectedPatient.dateOfBirth,
                            ).toLocaleDateString()}{" "}
                            ({calculateAge(selectedPatient.dateOfBirth)} years)
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

              {/* Loading state for history */}
              {activeTab !== "info" && !patientHistory && (
                <div className="text-center py-12">
                  <LoadingSpinner />
                  <p className="text-gray-500 mt-4">{t("patients.loadingHistory")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
