"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FaTooth,
  FaCalendarAlt,
  FaBoxes,
  FaMoneyBillWave,
  FaUsers,
  FaChartLine,
  FaCog,
  FaSignOutAlt,
  FaSearch,
  FaPlus,
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaUserMd,
  FaHistory,
  FaFileMedical,
  FaCalendarPlus,
  FaTimes,
  FaChevronRight,
  FaAllergies,
  FaNotesMedical,
  FaReceipt,
  FaCreditCard,
  FaCheckCircle,
  FaClock,
  FaEdit,
  FaBirthdayCake,
  FaIdCard,
} from "react-icons/fa";

// TODO: Fetch from API
const patients: {
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
  totalSpent: number;
  status: string;
  notes: string;
}[] = [];

// TODO: Fetch from API
const patientHistory: Record<number, {
  appointments: { date: string; type: string; doctor: string; status: string; cost: number }[];
  payments: { date: string; amount: number; method: string; invoice: string }[];
  treatments: { tooth: string; treatment: string; date: string; doctor: string }[];
}> = {};

export default function PatientsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<typeof patients[0] | null>(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "appointments" | "payments" | "treatments">("info");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-LB").format(amount) + " LBP";
  };

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const filteredPatients = patients.filter((patient) => {
    const matchesSearch =
      patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.phone.includes(searchQuery);
    const matchesStatus = statusFilter === "all" || patient.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openPatientDetails = (patient: typeof patients[0]) => {
    setSelectedPatient(patient);
    setActiveTab("info");
    setShowPatientModal(true);
  };

  const history = selectedPatient ? patientHistory[selectedPatient.id as keyof typeof patientHistory] : null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col">
        <div className="p-6 border-b border-gray-700">
          <Link href="/admin" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
              <FaTooth className="text-white text-xl" />
            </div>
            <div>
              <span className="text-lg font-bold">BrightSmile</span>
              <p className="text-xs text-gray-400">Admin Panel</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link href="/admin" className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors">
            <FaChartLine className="text-lg" />
            <span className="font-medium">Dashboard</span>
          </Link>
          <Link href="/admin/appointments" className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors">
            <FaCalendarAlt className="text-lg" />
            <span className="font-medium">Appointments</span>
          </Link>
          <Link href="/admin/inventory" className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors">
            <FaBoxes className="text-lg" />
            <span className="font-medium">Inventory</span>
          </Link>
          <Link href="/admin/transactions" className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors">
            <FaMoneyBillWave className="text-lg" />
            <span className="font-medium">Transactions</span>
          </Link>
          <Link href="/admin/patients" className="flex items-center space-x-3 px-4 py-3 bg-dental-blue/20 text-dental-lightblue rounded-xl">
            <FaUsers className="text-lg" />
            <span className="font-medium">Patients</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-700 space-y-2">
          <Link href="/admin/settings" className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors">
            <FaCog className="text-lg" />
            <span className="font-medium">Settings</span>
          </Link>
          <Link href="/" className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors">
            <FaSignOutAlt className="text-lg" />
            <span className="font-medium">Logout</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
            <p className="text-gray-500 text-sm">Manage patient records and history</p>
          </div>
          <Button className="bg-dental-blue hover:bg-dental-blue/90">
            <FaPlus className="mr-2" />
            Add Patient
          </Button>
        </header>

        <main className="flex-1 p-8 overflow-auto">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <FaUsers className="text-blue-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{patients.length}</p>
                  <p className="text-sm text-gray-500">Total Patients</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <FaCheckCircle className="text-green-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{patients.filter(p => p.status === "active").length}</p>
                  <p className="text-sm text-gray-500">Active Patients</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <FaCalendarAlt className="text-purple-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{patients.reduce((sum, p) => sum + p.totalVisits, 0)}</p>
                  <p className="text-sm text-gray-500">Total Visits</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <FaMoneyBillWave className="text-yellow-600 text-xl" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(patients.reduce((sum, p) => sum + p.totalSpent, 0))}</p>
                  <p className="text-sm text-gray-500">Total Revenue</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex-1 relative">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    statusFilter === "all" ? "bg-dental-blue text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter("active")}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    statusFilter === "active" ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setStatusFilter("inactive")}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    statusFilter === "inactive" ? "bg-gray-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Inactive
                </button>
              </div>
            </div>
          </div>

          {/* Patients Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPatients.map((patient) => (
              <div
                key={patient.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openPatientDetails(patient)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-dental-blue to-dental-teal rounded-full flex items-center justify-center text-white text-xl font-bold">
                      {patient.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{patient.name}</h3>
                      <p className="text-sm text-gray-500">{calculateAge(patient.dateOfBirth)} years old</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    patient.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {patient.status === "active" ? "Active" : "Inactive"}
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
                    <p className="text-gray-500">Last Visit</p>
                    <p className="font-semibold text-gray-900">{new Date(patient.lastVisit).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500">Total Visits</p>
                    <p className="font-semibold text-gray-900">{patient.totalVisits}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500">Total Spent</p>
                    <p className="font-semibold text-dental-blue">{formatCurrency(patient.totalSpent)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Patient Details Modal */}
      {showPatientModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-dental-blue to-dental-teal rounded-full flex items-center justify-center text-white text-2xl font-bold">
                  {selectedPatient.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedPatient.name}</h2>
                  <p className="text-gray-500">Patient since {new Date(selectedPatient.registeredDate).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm">
                  <FaEdit className="mr-2" /> Edit
                </Button>
                <Button size="sm" className="bg-dental-blue hover:bg-dental-blue/90">
                  <FaCalendarPlus className="mr-2" /> Book Appointment
                </Button>
                <button onClick={() => setShowPatientModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <FaTimes className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6">
              <button
                onClick={() => setActiveTab("info")}
                className={`px-6 py-4 font-medium transition-colors relative ${
                  activeTab === "info" ? "text-dental-blue" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FaIdCard className="inline mr-2" /> Info
                {activeTab === "info" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dental-blue" />}
              </button>
              <button
                onClick={() => setActiveTab("appointments")}
                className={`px-6 py-4 font-medium transition-colors relative ${
                  activeTab === "appointments" ? "text-dental-blue" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FaCalendarAlt className="inline mr-2" /> Appointments
                {activeTab === "appointments" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dental-blue" />}
              </button>
              <button
                onClick={() => setActiveTab("payments")}
                className={`px-6 py-4 font-medium transition-colors relative ${
                  activeTab === "payments" ? "text-dental-blue" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FaCreditCard className="inline mr-2" /> Payments
                {activeTab === "payments" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dental-blue" />}
              </button>
              <button
                onClick={() => setActiveTab("treatments")}
                className={`px-6 py-4 font-medium transition-colors relative ${
                  activeTab === "treatments" ? "text-dental-blue" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FaTooth className="inline mr-2" /> Treatments
                {activeTab === "treatments" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dental-blue" />}
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-6">
              {/* Info Tab */}
              {activeTab === "info" && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4">Contact Information</h3>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <FaPhone className="text-dental-blue" />
                          <span className="text-gray-700">{selectedPatient.phone}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <FaEnvelope className="text-dental-blue" />
                          <span className="text-gray-700">{selectedPatient.email}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <FaMapMarkerAlt className="text-dental-blue" />
                          <span className="text-gray-700">{selectedPatient.address}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4">Personal Details</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Date of Birth</span>
                          <span className="font-medium text-gray-900">{new Date(selectedPatient.dateOfBirth).toLocaleDateString()} ({calculateAge(selectedPatient.dateOfBirth)} years)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Blood Type</span>
                          <span className="font-medium text-gray-900">{selectedPatient.bloodType}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Insurance</span>
                          <span className="font-medium text-gray-900">{selectedPatient.insurance}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-red-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FaAllergies className="text-red-500" /> Allergies
                      </h3>
                      {selectedPatient.allergies.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedPatient.allergies.map((allergy) => (
                            <span key={allergy} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                              {allergy}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">No known allergies</p>
                      )}
                    </div>

                    <div className="bg-blue-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FaNotesMedical className="text-blue-500" /> Notes
                      </h3>
                      <p className="text-gray-700">{selectedPatient.notes || "No notes available"}</p>
                    </div>

                    <div className="bg-green-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4">Statistics</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-white rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">{selectedPatient.totalVisits}</p>
                          <p className="text-xs text-gray-500">Total Visits</p>
                        </div>
                        <div className="text-center p-3 bg-white rounded-lg">
                          <p className="text-lg font-bold text-dental-blue">{formatCurrency(selectedPatient.totalSpent)}</p>
                          <p className="text-xs text-gray-500">Total Spent</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Appointments Tab */}
              {activeTab === "appointments" && history && (
                <div className="space-y-4">
                  {history.appointments.map((apt, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
                          <FaCalendarAlt className="text-dental-blue" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{apt.type}</p>
                          <p className="text-sm text-gray-500">{apt.doctor} • {new Date(apt.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-gray-900">{formatCurrency(apt.cost)}</span>
                        <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                          {apt.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payments Tab */}
              {activeTab === "payments" && history && (
                <div className="space-y-4">
                  {history.payments.map((payment, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                          <FaReceipt className="text-green-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{payment.invoice}</p>
                          <p className="text-sm text-gray-500">{payment.method} • {new Date(payment.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <span className="font-bold text-green-600">+{formatCurrency(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Treatments Tab */}
              {activeTab === "treatments" && history && (
                <div className="space-y-4">
                  {history.treatments.map((treatment, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                          <FaTooth className="text-purple-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{treatment.treatment}</p>
                          <p className="text-sm text-gray-500">Tooth: {treatment.tooth} • {treatment.doctor}</p>
                        </div>
                      </div>
                      <span className="text-gray-500">{new Date(treatment.date).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* No history available */}
              {(activeTab !== "info" && !history) && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaHistory className="text-gray-400 text-2xl" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No History Available</h3>
                  <p className="text-gray-500">This patient's history will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
