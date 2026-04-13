"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api/client";
import { getStoredPhoto } from "@/lib/profilePhoto";
import { toast } from 'sonner';
import { Avatar } from "@/components/ui/Avatar";
import { PatientPageHeader } from "@/components/ui/PatientPageHeader";
import { Button } from "@/components/ui/button";
import {
  FaFileMedical,
  FaCalendarAlt,
  FaUserMd,
  FaNotesMedical,
  FaXRay,
  FaDownload,
  FaEye,
  FaChevronDown,
  FaChevronUp,
  FaAllergies,
  FaPills,
  FaHeartbeat,
  FaSearch,
  FaFilter,
  FaTimes,
} from "react-icons/fa";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function MedicalRecords() {
  const [patientInfo, setPatientInfo] = useState({
    name: "",
    dateOfBirth: "",
    bloodType: "",
    allergies: [] as string[],
    conditions: [] as string[],
    medications: [] as string[],
    lastVisit: "",
    nextAppointment: "",
  });
  const [visitHistory, setVisitHistory] = useState<
    {
      id: number;
      date: string;
      type: string;
      doctor: string;
      notes: string;
      treatments: string[];
      cost: string;
      _source?: string;
    }[]
  >([]);
  const [documents, setDocuments] = useState<
    {
      id: number;
      name: string;
      date: string;
      type: string;
      size: string;
      url?: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const meRes = await apiFetch(`/api/auth/me`);
        if (!meRes.ok) return;
        const me = await meRes.json();

        setPhotoUrl(getStoredPhoto(me.email));

        setPatientInfo((prev) => ({
          ...prev,
          name: `${me.first_name || ""} ${me.last_name || ""}`.trim(),
          dateOfBirth: me.date_of_birth || "",
          allergies: me.allergies ? me.allergies.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          medications: me.current_medications ? me.current_medications.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        }));

        const [recordsRes, profileRes, historyRes] = await Promise.all([
          apiFetch(`/api/patient/patient-records?user_id=${me.id}&limit=50`),
          apiFetch(`/api/patients/by-user/${me.id}`),
          apiFetch(`/api/patient/appointments/history?user_id=${me.id}&limit=50`),
        ]);

        // Build visit history from patient records first
        const recordsData = recordsRes.ok ? await recordsRes.json() : { data: [] };
        const fromRecords = (recordsData.data || []).map((r: any) => ({
          id: Number(r.id),
          date: r.treatment_date || r.created_at,
          type: r.title || r.record_type || "Visit",
          doctor: r.users
            ? `Dr. ${r.users.first_name} ${r.users.last_name}`
            : "Doctor",
          notes: r.description || "",
          treatments: r.title ? [r.title] : [],
          cost: "—",
          _source: "record",
        }));

        // Supplement with completed appointments if no records exist
        const historyData = historyRes.ok ? await historyRes.json() : { data: [] };
        const fromAppointments = (historyData.data || []).map((a: any) => ({
          id: Number(a.id) + 1000000, // avoid id collision with records
          date: a.appointment_date || a.created_at,
          type: a.reason || "Checkup",
          doctor: a.users_appointments_doctor_idTousers
            ? `Dr. ${a.users_appointments_doctor_idTousers.first_name} ${a.users_appointments_doctor_idTousers.last_name}`
            : "Doctor",
          notes: a.notes || "",
          treatments: a.reason ? [a.reason] : [],
          cost: "—",
          _source: "appointment",
        }));

        const mapped = fromRecords.length > 0 ? fromRecords : fromAppointments;

        if (mapped.length > 0) {
          setPatientInfo((prev) => ({
            ...prev,
            lastVisit: mapped[0].date,
          }));
        }

        setVisitHistory(mapped);

        if (profileRes.ok) {
          const profile = await profileRes.json();
          setPatientInfo((prev) => ({
            ...prev,
            bloodType: profile.blood_type || prev.bloodType,
            conditions: profile.medical_notes
              ? profile.medical_notes.split(",").map((s: string) => s.trim()).filter(Boolean)
              : prev.conditions,
            allergies: profile.allergies
              ? profile.allergies.split(",").map((s: string) => s.trim()).filter(Boolean)
              : prev.allergies,
            medications: profile.current_medications
              ? profile.current_medications.split(",").map((s: string) => s.trim()).filter(Boolean)
              : prev.medications,
          }));
          const docsRes = await apiFetch(`/api/patient-documents?patient_id=${profile.id}&limit=50`);
          if (docsRes.ok) {
            const docsData = await docsRes.json();
            setDocuments(
              (docsData.data || []).map((d: any) => ({
                id: Number(d.id),
                name: d.file_name,
                date: d.uploaded_at,
                type: d.document_type,
                url: d.url,
                size: "",
              }))
            );
          }
        }
      } catch (e) {
        console.error("Failed to fetch medical records", e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // Download document handler
  const handleDownloadDocument = async (docId: number) => {
    // API call removed
    console.log("Download document", docId);
  };
  const [expandedVisit, setExpandedVisit] = useState<number | null>(1);
  const [activeTab, setActiveTab] = useState<"history" | "documents">("history");
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredVisits = visitHistory.filter(
    (visit) =>
      visit.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      visit.doctor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      visit.notes.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50">
      <PatientPageHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Medical Records
          </h1>
          <p className="text-gray-600">
            View your complete dental health history
          </p>
        </div>

        {/* Patient Summary Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Patient Info */}
            <div className="flex items-center gap-4">
              <Avatar name={patientInfo.name} size="xl" src={photoUrl} />
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {patientInfo.name}
                </h2>
                <p className="text-gray-500">
                  DOB: {new Date(patientInfo.dateOfBirth).toLocaleDateString()}{" "}
                  | Blood Type: {patientInfo.bloodType}
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-red-50 rounded-xl">
                <FaAllergies className="text-red-500 text-xl mx-auto mb-1" />
                <p className="text-xs text-gray-500">Allergies</p>
                <p className="text-sm font-semibold text-gray-900">
                  {patientInfo.allergies.length}
                </p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-xl">
                <FaCalendarAlt className="text-blue-500 text-xl mx-auto mb-1" />
                <p className="text-xs text-gray-500">Last Visit</p>
                <p className="text-sm font-semibold text-gray-900">
                  {new Date(patientInfo.lastVisit).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-xl">
                <FaHeartbeat className="text-green-500 text-xl mx-auto mb-1" />
                <p className="text-xs text-gray-500">Conditions</p>
                <p className="text-sm font-semibold text-gray-900">
                  {patientInfo.conditions[0]}
                </p>
              </div>
            </div>
          </div>

          {/* Allergies & Medications */}
          <div className="mt-6 pt-6 border-t border-gray-100 grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <FaAllergies className="text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Allergies</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {patientInfo.allergies.map((allergy) => (
                    <span
                      key={allergy}
                      className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium"
                    >
                      {allergy}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <FaPills className="text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Current Medications
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {patientInfo.medications.join(", ")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("history")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "history"
                ? "bg-white text-dental-blue shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FaNotesMedical className="inline mr-2" />
            Visit History
          </button>
          <button
            onClick={() => setActiveTab("documents")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "documents"
                ? "bg-white text-dental-blue shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FaFileMedical className="inline mr-2" />
            Documents
          </button>
        </div>

        {/* Visit History Tab */}
        {activeTab === "history" && (
          <div className="animate-fadeIn">
            {/* Search Bar */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search visits by type, doctor, or notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
                <Button variant="outline" className="px-4">
                  <FaFilter className="mr-2" />
                  Filter
                </Button>
              </div>
            </div>

            {/* Visit Cards */}
            <div className="space-y-4">
              {filteredVisits.map((visit) => (
                <div
                  key={visit.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Visit Header */}
                  <button
                    onClick={() =>
                      setExpandedVisit(
                        expandedVisit === visit.id ? null : visit.id,
                      )
                    }
                    className="w-full p-6 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-dental-blue/10 rounded-xl flex items-center justify-center">
                        <FaNotesMedical className="text-dental-blue text-xl" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">
                          {visit.type}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <FaCalendarAlt className="text-dental-blue" />
                            {new Date(visit.date).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </span>
                          <span className="flex items-center gap-1">
                            <FaUserMd className="text-dental-blue" />
                            {visit.doctor}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-dental-blue font-semibold hidden sm:block">
                        {visit.cost}
                      </span>
                      {expandedVisit === visit.id ? (
                        <FaChevronUp className="text-gray-400" />
                      ) : (
                        <FaChevronDown className="text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {expandedVisit === visit.id && (
                    <div className="px-6 pb-6 border-t border-gray-100 pt-4 animate-fadeIn">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">
                            Notes
                          </h4>
                          <p className="text-gray-600 text-sm leading-relaxed">
                            {visit.notes}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">
                            Treatments Performed
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {visit.treatments.map((treatment) => (
                              <span
                                key={treatment}
                                className="px-3 py-1.5 bg-dental-blue/10 text-dental-blue text-sm rounded-lg font-medium"
                              >
                                {treatment}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-sm text-gray-500">
                          Cost:{" "}
                          <span className="font-semibold text-gray-900">
                            {visit.cost}
                          </span>
                        </span>
                        <Button variant="outline" size="sm">
                          <FaDownload className="mr-2" />
                          Download Report
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className="animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              {documents.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No documents found.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-dental-blue/30 hover:bg-dental-blue/5 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            doc.type === "xray" ? "bg-purple-100" : "bg-blue-100"
                          }`}
                        >
                          {doc.type === "xray" ? (
                            <FaXRay className="text-purple-600 text-xl" />
                          ) : (
                            <FaFileMedical className="text-blue-600 text-xl" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {doc.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {new Date(doc.date).toLocaleDateString()} · {doc.type}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {doc.url && (
                          <>
                            <button
                              onClick={() => setPreviewDoc({ name: doc.name, url: doc.url! })}
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-dental-blue transition-colors"
                            >
                              <FaEye />
                            </button>
                            <a
                              href={doc.url}
                              download={doc.name}
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-dental-blue transition-colors"
                            >
                              <FaDownload />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-900 truncate">{previewDoc.name}</p>
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
              {/\.(png|jpe?g|gif|webp|svg)$/i.test(previewDoc.name) ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.name}
                  className="max-w-full max-h-[75vh] mx-auto rounded-lg object-contain"
                />
              ) : (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.name}
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
