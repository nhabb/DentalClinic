"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FaTooth,
  FaArrowLeft,
  FaPills,
  FaCalendarAlt,
  FaUserMd,
  FaClock,
  FaRedo,
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaChevronDown,
  FaChevronUp,
  FaPrescriptionBottleAlt,
  FaNotesMedical,
  FaSearch,
  FaExclamationCircle,
  FaCalendarPlus,
} from "react-icons/fa";

const currentPrescriptions = [
  {
    id: 1,
    name: "Amoxicillin 500mg",
    purpose: "Post-procedure antibiotic",
    dosage: "1 capsule",
    frequency: "3 times daily",
    duration: "7 days",
    startDate: "2025-12-10",
    endDate: "2025-12-17",
    refillsLeft: 0,
    prescribedBy: "Dr. Sarah Haddad",
    instructions: "Take with food. Complete the full course even if you feel better.",
    status: "active",
  },
  {
    id: 2,
    name: "Ibuprofen 400mg",
    purpose: "Pain relief",
    dosage: "1 tablet",
    frequency: "Every 6 hours as needed",
    duration: "5 days",
    startDate: "2025-12-10",
    endDate: "2025-12-15",
    refillsLeft: 2,
    prescribedBy: "Dr. Sarah Haddad",
    instructions: "Take with food or milk. Do not exceed 4 tablets in 24 hours.",
    status: "active",
  },
];

const pastPrescriptions = [
  {
    id: 3,
    name: "Chlorhexidine Mouthwash",
    purpose: "Antibacterial rinse",
    dosage: "15ml",
    frequency: "Twice daily",
    duration: "14 days",
    startDate: "2025-09-05",
    endDate: "2025-09-19",
    refillsLeft: 0,
    prescribedBy: "Dr. Michel Khoury",
    instructions: "Rinse for 30 seconds after brushing. Do not eat or drink for 30 minutes after use.",
    status: "completed",
  },
  {
    id: 4,
    name: "Sensodyne Toothpaste",
    purpose: "Sensitivity treatment",
    dosage: "Pea-sized amount",
    frequency: "Twice daily",
    duration: "Ongoing",
    startDate: "2025-06-20",
    endDate: null,
    refillsLeft: null,
    prescribedBy: "Dr. Sarah Haddad",
    instructions: "Use as regular toothpaste. For best results, don't rinse after brushing.",
    status: "ongoing",
  },
  {
    id: 5,
    name: "Amoxicillin 500mg",
    purpose: "Pre-procedure antibiotic",
    dosage: "2 capsules",
    frequency: "1 hour before procedure",
    duration: "Single dose",
    startDate: "2025-09-05",
    endDate: "2025-09-05",
    refillsLeft: 0,
    prescribedBy: "Dr. Michel Khoury",
    instructions: "Take 1 hour before your scheduled procedure.",
    status: "completed",
  },
];

const recommendedProcedures = [
  {
    id: 1,
    procedure: "Deep Cleaning (Scaling)",
    reason: "Moderate tartar buildup detected during last checkup",
    urgency: "recommended",
    recommendedBy: "Dr. Sarah Haddad",
    date: "2025-12-10",
    estimatedCost: "250,000 LBP",
    notes: "Recommended within the next 3 months to prevent gum disease progression.",
  },
  {
    id: 2,
    procedure: "Wisdom Tooth Evaluation",
    reason: "X-ray shows partial impaction of lower right wisdom tooth",
    urgency: "monitor",
    recommendedBy: "Dr. Michel Khoury",
    date: "2025-09-05",
    estimatedCost: "Consultation: 75,000 LBP",
    notes: "No immediate action needed. Re-evaluate in 6 months or if pain occurs.",
  },
  {
    id: 3,
    procedure: "Crown Replacement",
    reason: "Existing crown on tooth #4 showing signs of wear",
    urgency: "necessary",
    recommendedBy: "Dr. Layla Nassar",
    date: "2025-06-20",
    estimatedCost: "800,000 LBP",
    notes: "Should be replaced within 2-3 months to prevent further damage.",
  },
];

export default function Prescriptions() {
  const [activeTab, setActiveTab] = useState<"current" | "history" | "procedures">("current");
  const [expandedPrescription, setExpandedPrescription] = useState<number | null>(1);
  const [searchQuery, setSearchQuery] = useState("");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            <FaCheckCircle className="text-xs" />
            Active
          </span>
        );
      case "completed":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
            <FaCheckCircle className="text-xs" />
            Completed
          </span>
        );
      case "ongoing":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
            <FaRedo className="text-xs" />
            Ongoing
          </span>
        );
      default:
        return null;
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case "necessary":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            <FaExclamationCircle className="text-xs" />
            Necessary
          </span>
        );
      case "recommended":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
            <FaExclamationTriangle className="text-xs" />
            Recommended
          </span>
        );
      case "monitor":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
            <FaInfoCircle className="text-xs" />
            Monitor
          </span>
        );
      default:
        return null;
    }
  };

  const filteredCurrentPrescriptions = currentPrescriptions.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.purpose.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPastPrescriptions = pastPrescriptions.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.purpose.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/patient-dashboard" className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
                <FaTooth className="text-white text-xl" />
              </div>
              <span className="text-xl font-bold text-gray-900">BrightSmile</span>
            </Link>
            <Link
              href="/patient-dashboard"
              className="text-gray-600 hover:text-dental-blue transition-colors flex items-center gap-2"
            >
              <FaArrowLeft className="text-sm" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Prescriptions & Procedures</h1>
          <p className="text-gray-600">Manage your medications and view recommended treatments</p>
        </div>

        {/* Summary Cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl shadow-sm p-6 border-l-4 border-green-500">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <FaPills className="text-green-600 text-xl" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{currentPrescriptions.length}</p>
                <p className="text-sm text-gray-500">Active Prescriptions</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6 border-l-4 border-yellow-500">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                <FaExclamationTriangle className="text-yellow-600 text-xl" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {recommendedProcedures.filter((p) => p.urgency === "recommended" || p.urgency === "necessary").length}
                </p>
                <p className="text-sm text-gray-500">Pending Procedures</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6 border-l-4 border-red-500">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <FaExclamationCircle className="text-red-600 text-xl" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {recommendedProcedures.filter((p) => p.urgency === "necessary").length}
                </p>
                <p className="text-sm text-gray-500">Necessary Procedures</p>
              </div>
            </div>
          </div>
        </div>

        {/* Alert for Necessary Procedures */}
        {recommendedProcedures.some((p) => p.urgency === "necessary") && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-8 flex items-start gap-4">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <FaExclamationCircle className="text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-800">Action Required</h3>
              <p className="text-sm text-red-700 mt-1">
                You have {recommendedProcedures.filter((p) => p.urgency === "necessary").length} necessary procedure(s) that require your attention. Please schedule an appointment soon.
              </p>
            </div>
            <Link href="/book-appointment">
              <Button size="sm" className="bg-red-600 hover:bg-red-700">
                Book Now
              </Button>
            </Link>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("current")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "current"
                ? "bg-white text-dental-blue shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FaPills className="inline mr-2" />
            Current ({currentPrescriptions.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "history"
                ? "bg-white text-dental-blue shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FaPrescriptionBottleAlt className="inline mr-2" />
            History
          </button>
          <button
            onClick={() => setActiveTab("procedures")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all relative ${
              activeTab === "procedures"
                ? "bg-white text-dental-blue shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FaNotesMedical className="inline mr-2" />
            Procedures
            {recommendedProcedures.filter((p) => p.urgency === "necessary").length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {recommendedProcedures.filter((p) => p.urgency === "necessary").length}
              </span>
            )}
          </button>
        </div>

        {/* Current Prescriptions Tab */}
        {activeTab === "current" && (
          <div className="animate-fadeIn">
            {currentPrescriptions.length > 0 ? (
              <div className="space-y-4">
                {filteredCurrentPrescriptions.map((prescription) => (
                  <div
                    key={prescription.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedPrescription(
                          expandedPrescription === prescription.id ? null : prescription.id
                        )
                      }
                      className="w-full p-6 flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-green-50 rounded-2xl flex items-center justify-center">
                          <FaPills className="text-green-600 text-2xl" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-bold text-gray-900 text-lg">{prescription.name}</h3>
                            {getStatusBadge(prescription.status)}
                          </div>
                          <p className="text-gray-600 text-sm">{prescription.purpose}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                            <span className="flex items-center gap-1">
                              <FaCalendarAlt className="text-dental-blue" />
                              {new Date(prescription.startDate).toLocaleDateString()} -{" "}
                              {prescription.endDate
                                ? new Date(prescription.endDate).toLocaleDateString()
                                : "Ongoing"}
                            </span>
                            <span className="flex items-center gap-1">
                              <FaUserMd className="text-dental-blue" />
                              {prescription.prescribedBy}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {prescription.refillsLeft !== null && prescription.refillsLeft > 0 && (
                          <span className="text-sm text-dental-blue font-medium hidden sm:block">
                            {prescription.refillsLeft} refill(s) left
                          </span>
                        )}
                        {expandedPrescription === prescription.id ? (
                          <FaChevronUp className="text-gray-400" />
                        ) : (
                          <FaChevronDown className="text-gray-400" />
                        )}
                      </div>
                    </button>

                    {expandedPrescription === prescription.id && (
                      <div className="px-6 pb-6 border-t border-gray-100 pt-4 animate-fadeIn">
                        <div className="grid md:grid-cols-3 gap-6 mb-6">
                          <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Dosage</p>
                            <p className="font-semibold text-gray-900">{prescription.dosage}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Frequency</p>
                            <p className="font-semibold text-gray-900">{prescription.frequency}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Duration</p>
                            <p className="font-semibold text-gray-900">{prescription.duration}</p>
                          </div>
                        </div>

                        <div className="bg-blue-50 rounded-xl p-4 mb-4">
                          <div className="flex items-start gap-3">
                            <FaInfoCircle className="text-blue-600 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-blue-900">Instructions</p>
                              <p className="text-sm text-blue-800 mt-1">{prescription.instructions}</p>
                            </div>
                          </div>
                        </div>

                        {prescription.refillsLeft !== null && prescription.refillsLeft > 0 && (
                          <div className="flex justify-end">
                            <Button className="bg-dental-blue hover:bg-dental-blue/90">
                              <FaRedo className="mr-2" />
                              Request Refill ({prescription.refillsLeft} left)
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaPills className="text-gray-400 text-2xl" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Prescriptions</h3>
                <p className="text-gray-500">You don't have any active prescriptions at the moment.</p>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="animate-fadeIn">
            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <div className="relative">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search prescriptions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>
            </div>

            <div className="space-y-4">
              {filteredPastPrescriptions.map((prescription) => (
                <div
                  key={prescription.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          prescription.status === "completed"
                            ? "bg-gray-100"
                            : "bg-blue-100"
                        }`}
                      >
                        <FaPrescriptionBottleAlt
                          className={
                            prescription.status === "completed"
                              ? "text-gray-500 text-xl"
                              : "text-blue-600 text-xl"
                          }
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-gray-900">{prescription.name}</h3>
                          {getStatusBadge(prescription.status)}
                        </div>
                        <p className="text-gray-600 text-sm">{prescription.purpose}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                          <span>{prescription.dosage} • {prescription.frequency}</span>
                          <span>•</span>
                          <span>{prescription.prescribedBy}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">
                        {new Date(prescription.startDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Procedures Tab */}
        {activeTab === "procedures" && (
          <div className="animate-fadeIn">
            <div className="space-y-4">
              {recommendedProcedures
                .sort((a, b) => {
                  const urgencyOrder = { necessary: 0, recommended: 1, monitor: 2 };
                  return urgencyOrder[a.urgency as keyof typeof urgencyOrder] - urgencyOrder[b.urgency as keyof typeof urgencyOrder];
                })
                .map((procedure) => (
                  <div
                    key={procedure.id}
                    className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden ${
                      procedure.urgency === "necessary"
                        ? "border-red-200"
                        : procedure.urgency === "recommended"
                        ? "border-yellow-200"
                        : "border-gray-100"
                    }`}
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                              procedure.urgency === "necessary"
                                ? "bg-red-100"
                                : procedure.urgency === "recommended"
                                ? "bg-yellow-100"
                                : "bg-blue-100"
                            }`}
                          >
                            <FaTooth
                              className={`text-2xl ${
                                procedure.urgency === "necessary"
                                  ? "text-red-600"
                                  : procedure.urgency === "recommended"
                                  ? "text-yellow-600"
                                  : "text-blue-600"
                              }`}
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="font-bold text-gray-900 text-lg">{procedure.procedure}</h3>
                              {getUrgencyBadge(procedure.urgency)}
                            </div>
                            <p className="text-gray-600 text-sm">{procedure.reason}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-dental-blue">{procedure.estimatedCost}</p>
                          <p className="text-xs text-gray-500">Estimated cost</p>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-4 mb-4">
                        <div className="flex items-start gap-3">
                          <FaInfoCircle className="text-gray-500 mt-0.5" />
                          <div>
                            <p className="text-sm text-gray-700">{procedure.notes}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <FaUserMd className="text-dental-blue" />
                                {procedure.recommendedBy}
                              </span>
                              <span className="flex items-center gap-1">
                                <FaCalendarAlt className="text-dental-blue" />
                                Recommended on {new Date(procedure.date).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3">
                        {procedure.urgency !== "monitor" && (
                          <Link href="/book-appointment">
                            <Button
                              className={
                                procedure.urgency === "necessary"
                                  ? "bg-red-600 hover:bg-red-700"
                                  : "bg-dental-blue hover:bg-dental-blue/90"
                              }
                            >
                              <FaCalendarPlus className="mr-2" />
                              Schedule Appointment
                            </Button>
                          </Link>
                        )}
                        {procedure.urgency === "monitor" && (
                          <Button variant="outline">
                            <FaClock className="mr-2" />
                            Set Reminder
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {/* Info Card */}
            <div className="mt-8 bg-dental-blue/5 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-dental-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <FaInfoCircle className="text-dental-blue" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Understanding Procedure Urgency</h3>
                  <div className="mt-3 space-y-2 text-sm text-gray-600">
                    <p>
                      <span className="font-medium text-red-600">Necessary:</span> Requires immediate attention to prevent further complications
                    </p>
                    <p>
                      <span className="font-medium text-yellow-600">Recommended:</span> Should be scheduled within the suggested timeframe
                    </p>
                    <p>
                      <span className="font-medium text-blue-600">Monitor:</span> Keep an eye on the condition; no immediate action required
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
