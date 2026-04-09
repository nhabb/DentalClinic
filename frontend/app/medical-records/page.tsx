"use client";

import { useState, useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { PatientPageHeader } from "@/components/ui/PatientPageHeader";
import { Button } from "@/components/ui/button";
import {
  FaTooth,
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
    }[]
  >([]);
  const [documents, setDocuments] = useState<
    {
      id: number;
      name: string;
      date: string;
      type: string;
      size: string;
    }[]
  >([]);
  const [dentalChart, setDentalChart] = useState<
    {
      tooth: number;
      status: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Fetch patient profile
  useEffect(() => {
    const fetchPatientInfo = async () => {
      // API call removed
    };
    fetchPatientInfo();
  }, []);

  // Fetch visit history (medical records)
  useEffect(() => {
    const fetchVisitHistory = async () => {
      // API call removed
    };
    fetchVisitHistory();
  }, []);

  // Fetch documents
  useEffect(() => {
    const fetchDocuments = async () => {
      // API call removed
    };
    fetchDocuments();
  }, []);

  // Fetch dental chart
  useEffect(() => {
    const fetchDentalChart = async () => {
      setLoading(false);
    };
    fetchDentalChart();
  }, []);

  // Download document handler
  const handleDownloadDocument = async (docId: number) => {
    // API call removed
    console.log("Download document", docId);
  };
  const [expandedVisit, setExpandedVisit] = useState<number | null>(1);
  const [activeTab, setActiveTab] = useState<"history" | "documents" | "chart">(
    "history",
  );
  const [searchQuery, setSearchQuery] = useState("");

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-100 text-green-600";
      case "filling":
        return "bg-yellow-100 text-yellow-600";
      case "crown":
        return "bg-blue-100 text-blue-600";
      case "extracted":
        return "bg-gray-200 text-gray-400";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

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
              <Avatar name={patientInfo.name} size="xl" />
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
          <button
            onClick={() => setActiveTab("chart")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "chart"
                ? "bg-white text-dental-blue shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FaTooth className="inline mr-2" />
            Dental Chart
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
                          {new Date(doc.date).toLocaleDateString()} • {doc.size}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-dental-blue transition-colors">
                        <FaEye />
                      </button>
                      <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-dental-blue transition-colors">
                        <FaDownload />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Dental Chart Tab */}
        {activeTab === "chart" && (
          <div className="animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-sm p-8">
              <div className="text-center mb-8">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Your Dental Chart
                </h3>
                <p className="text-gray-600">
                  Visual overview of your dental health status
                </p>
              </div>

              {/* Legend */}
              <div className="flex justify-center gap-6 mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-100 border-2 border-green-300"></div>
                  <span className="text-sm text-gray-600">Healthy</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-100 border-2 border-yellow-300"></div>
                  <span className="text-sm text-gray-600">Filling</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-100 border-2 border-blue-300"></div>
                  <span className="text-sm text-gray-600">Crown</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-gray-200 border-2 border-gray-300"></div>
                  <span className="text-sm text-gray-600">Extracted</span>
                </div>
              </div>

              {/* Upper Teeth */}
              <div className="mb-4">
                <p className="text-center text-sm font-medium text-gray-500 mb-3">
                  Upper Teeth
                </p>
                <div className="flex justify-center gap-1">
                  {dentalChart.slice(0, 16).map((tooth) => (
                    <div
                      key={tooth.tooth}
                      className={`w-8 h-10 sm:w-10 sm:h-12 rounded-b-lg flex items-center justify-center text-xs font-medium cursor-pointer hover:scale-110 transition-transform ${getStatusColor(
                        tooth.status,
                      )}`}
                      title={`Tooth ${tooth.tooth}: ${tooth.status}`}
                    >
                      {tooth.tooth}
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t-2 border-dashed border-gray-200 my-4"></div>

              {/* Lower Teeth */}
              <div>
                <div className="flex justify-center gap-1">
                  {dentalChart.slice(16, 32).map((tooth) => (
                    <div
                      key={tooth.tooth}
                      className={`w-8 h-10 sm:w-10 sm:h-12 rounded-t-lg flex items-center justify-center text-xs font-medium cursor-pointer hover:scale-110 transition-transform ${getStatusColor(
                        tooth.status,
                      )}`}
                      title={`Tooth ${tooth.tooth}: ${tooth.status}`}
                    >
                      {tooth.tooth}
                    </div>
                  ))}
                </div>
                <p className="text-center text-sm font-medium text-gray-500 mt-3">
                  Lower Teeth
                </p>
              </div>

              {/* Summary Stats */}
              <div className="mt-8 grid grid-cols-4 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <p className="text-2xl font-bold text-green-600">
                    {dentalChart.filter((t) => t.status === "healthy").length}
                  </p>
                  <p className="text-sm text-gray-600">Healthy</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-xl">
                  <p className="text-2xl font-bold text-yellow-600">
                    {dentalChart.filter((t) => t.status === "filling").length}
                  </p>
                  <p className="text-sm text-gray-600">Fillings</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <p className="text-2xl font-bold text-blue-600">
                    {dentalChart.filter((t) => t.status === "crown").length}
                  </p>
                  <p className="text-sm text-gray-600">Crowns</p>
                </div>
                <div className="text-center p-4 bg-gray-100 rounded-xl">
                  <p className="text-2xl font-bold text-gray-500">
                    {dentalChart.filter((t) => t.status === "extracted").length}
                  </p>
                  <p className="text-sm text-gray-600">Extracted</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
