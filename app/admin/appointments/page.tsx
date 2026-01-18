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
  FaCheckCircle,
  FaClock,
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
  FaFilter,
  FaPhone,
  FaEllipsisV,
  FaCalendarCheck,
  FaCalendarTimes,
  FaUserMd,
} from "react-icons/fa";

const appointments = [
  {
    id: 1,
    date: "2026-01-18",
    time: "09:00 AM",
    patient: "Ahmad Khoury",
    phone: "+961 3 123 456",
    type: "Regular Checkup",
    duration: 30,
    status: "completed",
    notes: "Routine checkup, patient in good health",
    doctor: "Dr. Sarah Haddad",
  },
  {
    id: 2,
    date: "2026-01-18",
    time: "10:00 AM",
    patient: "Sara Mansour",
    phone: "+961 3 234 567",
    type: "Teeth Cleaning",
    duration: 45,
    status: "completed",
    notes: "",
    doctor: "Dr. Sarah Haddad",
  },
  {
    id: 3,
    date: "2026-01-18",
    time: "11:00 AM",
    patient: "Rami Haddad",
    phone: "+961 3 345 678",
    type: "Cavity Filling",
    duration: 60,
    status: "completed",
    notes: "Filling on tooth #14",
    doctor: "Dr. Michel Khoury",
  },
  {
    id: 4,
    date: "2026-01-18",
    time: "02:00 PM",
    patient: "Nadia Khalil",
    phone: "+961 3 456 789",
    type: "Teeth Whitening",
    duration: 90,
    status: "completed",
    notes: "",
    doctor: "Dr. Layla Nassar",
  },
  {
    id: 5,
    date: "2026-01-18",
    time: "03:30 PM",
    patient: "Karim Nassar",
    phone: "+961 3 567 890",
    type: "Root Canal",
    duration: 90,
    status: "in_progress",
    notes: "Root canal on tooth #19",
    doctor: "Dr. Michel Khoury",
  },
  {
    id: 6,
    date: "2026-01-18",
    time: "05:00 PM",
    patient: "Lina Aoun",
    phone: "+961 3 678 901",
    type: "Crown Fitting",
    duration: 60,
    status: "upcoming",
    notes: "",
    doctor: "Dr. Layla Nassar",
  },
  {
    id: 7,
    date: "2026-01-19",
    time: "09:00 AM",
    patient: "Fadi Karam",
    phone: "+961 3 789 012",
    type: "Regular Checkup",
    duration: 30,
    status: "upcoming",
    notes: "",
    doctor: "Dr. Sarah Haddad",
  },
  {
    id: 8,
    date: "2026-01-19",
    time: "10:00 AM",
    patient: "Maya Rizk",
    phone: "+961 3 890 123",
    type: "Extraction",
    duration: 45,
    status: "upcoming",
    notes: "Wisdom tooth extraction",
    doctor: "Dr. Michel Khoury",
  },
  {
    id: 9,
    date: "2026-01-19",
    time: "11:30 AM",
    patient: "Jad Salameh",
    phone: "+961 3 901 234",
    type: "Teeth Cleaning",
    duration: 45,
    status: "upcoming",
    notes: "",
    doctor: "Dr. Sarah Haddad",
  },
  {
    id: 10,
    date: "2026-01-17",
    time: "02:00 PM",
    patient: "Rana Abboud",
    phone: "+961 3 012 345",
    type: "Regular Checkup",
    duration: 30,
    status: "cancelled",
    notes: "Patient cancelled - rescheduling",
    doctor: "Dr. Sarah Haddad",
  },
];

const doctors = [
  { id: 1, name: "Dr. Sarah Haddad", specialty: "General Dentistry", color: "bg-blue-500" },
  { id: 2, name: "Dr. Michel Khoury", specialty: "Orthodontics", color: "bg-purple-500" },
  { id: 3, name: "Dr. Layla Nassar", specialty: "Cosmetic Dentistry", color: "bg-pink-500" },
];

export default function AppointmentsManagement() {
  const [selectedDate, setSelectedDate] = useState(new Date("2026-01-18"));
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);

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
          <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            <FaCheckCircle className="text-xs" /> Completed
          </span>
        );
      case "in_progress":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
            <FaClock className="text-xs" /> In Progress
          </span>
        );
      case "upcoming":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
            <FaClock className="text-xs" /> Upcoming
          </span>
        );
      case "cancelled":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            <FaTimes className="text-xs" /> Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  const getDoctorColor = (doctorName: string) => {
    const doctor = doctors.find((d) => d.name === doctorName);
    return doctor?.color || "bg-gray-500";
  };

  const filteredAppointments = appointments.filter((apt) => {
    const aptDate = apt.date;
    const selectedDateStr = selectedDate.toISOString().split("T")[0];
    const matchesDate = aptDate === selectedDateStr;
    const matchesSearch =
      apt.patient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      apt.type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDoctor = selectedDoctor === "all" || apt.doctor === selectedDoctor;
    return matchesDate && matchesSearch && matchesDoctor;
  });

  const todayStats = {
    total: appointments.filter((a) => a.date === "2026-01-18").length,
    completed: appointments.filter((a) => a.date === "2026-01-18" && a.status === "completed").length,
    upcoming: appointments.filter((a) => a.date === "2026-01-18" && a.status === "upcoming").length,
    cancelled: appointments.filter((a) => a.date === "2026-01-18" && a.status === "cancelled").length,
  };

  const navigateDate = (direction: "prev" | "next") => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1));
    setSelectedDate(newDate);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col">
        {/* Logo */}
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

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <Link
            href="/admin"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaChartLine className="text-lg" />
            <span className="font-medium">Dashboard</span>
          </Link>
          <Link
            href="/admin/appointments"
            className="flex items-center space-x-3 px-4 py-3 bg-dental-blue/20 text-dental-lightblue rounded-xl"
          >
            <FaCalendarAlt className="text-lg" />
            <span className="font-medium">Appointments</span>
          </Link>
          <Link
            href="/admin/inventory"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaBoxes className="text-lg" />
            <span className="font-medium">Inventory</span>
          </Link>
          <Link
            href="/admin/transactions"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaMoneyBillWave className="text-lg" />
            <span className="font-medium">Transactions</span>
          </Link>
          <Link
            href="/admin/patients"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaUsers className="text-lg" />
            <span className="font-medium">Patients</span>
          </Link>
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-gray-700 space-y-2">
          <Link
            href="/admin/settings"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaCog className="text-lg" />
            <span className="font-medium">Settings</span>
          </Link>
          <Link
            href="/"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors"
          >
            <FaSignOutAlt className="text-lg" />
            <span className="font-medium">Logout</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
            <p className="text-gray-500 text-sm">Manage and schedule patient appointments</p>
          </div>
          <Button onClick={() => setShowAddModal(true)} className="bg-dental-blue hover:bg-dental-blue/90">
            <FaPlus className="mr-2" />
            New Appointment
          </Button>
        </header>

        {/* Content */}
        <main className="flex-1 p-8 overflow-auto">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <FaCalendarAlt className="text-blue-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{todayStats.total}</p>
                  <p className="text-sm text-gray-500">Today's Total</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <FaCalendarCheck className="text-green-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{todayStats.completed}</p>
                  <p className="text-sm text-gray-500">Completed</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <FaClock className="text-yellow-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{todayStats.upcoming}</p>
                  <p className="text-sm text-gray-500">Upcoming</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <FaCalendarTimes className="text-red-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{todayStats.cancelled}</p>
                  <p className="text-sm text-gray-500">Cancelled</p>
                </div>
              </div>
            </div>
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
                  <FaChevronLeft className="text-gray-600" />
                </button>
                <div className="text-center min-w-[250px]">
                  <p className="text-lg font-bold text-gray-900">{formatDate(selectedDate)}</p>
                </div>
                <button
                  onClick={() => navigateDate("next")}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <FaChevronRight className="text-gray-600" />
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(new Date("2026-01-18"))}
                >
                  Today
                </Button>
              </div>

              {/* Filters */}
              <div className="flex gap-4">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search patient or type..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue w-64"
                  />
                </div>
                <select
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                >
                  <option value="all">All Doctors</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.name}>
                      {doctor.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Doctor Legend */}
          <div className="flex gap-4 mb-6">
            {doctors.map((doctor) => (
              <div key={doctor.id} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${doctor.color}`}></div>
                <span className="text-sm text-gray-600">{doctor.name}</span>
              </div>
            ))}
          </div>

          {/* Appointments List */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {filteredAppointments.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {filteredAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className={`p-6 hover:bg-gray-50 transition-colors ${
                      apt.status === "cancelled" ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        {/* Time */}
                        <div className="text-center min-w-[80px]">
                          <p className="text-xl font-bold text-gray-900">{apt.time}</p>
                          <p className="text-xs text-gray-500">{apt.duration} min</p>
                        </div>

                        {/* Doctor Color Bar */}
                        <div className={`w-1 h-16 rounded-full ${getDoctorColor(apt.doctor)}`}></div>

                        {/* Patient Info */}
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <p className="font-bold text-gray-900 text-lg">{apt.patient}</p>
                            {getStatusBadge(apt.status)}
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
                            <p className="text-sm text-gray-400 mt-2 italic">Note: {apt.notes}</p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {apt.status === "upcoming" && (
                          <>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700">
                              <FaCheckCircle className="mr-1" /> Start
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                              <FaTimes className="mr-1" /> Cancel
                            </Button>
                          </>
                        )}
                        {apt.status === "in_progress" && (
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                            <FaCheckCircle className="mr-1" /> Complete
                          </Button>
                        )}
                        <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                          <FaEllipsisV />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaCalendarAlt className="text-gray-400 text-2xl" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Appointments</h3>
                <p className="text-gray-500">No appointments scheduled for this date.</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add Appointment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">New Appointment</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Patient Name</label>
                <input
                  type="text"
                  placeholder="Search or enter patient name"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue">
                    <option>09:00 AM</option>
                    <option>09:30 AM</option>
                    <option>10:00 AM</option>
                    <option>10:30 AM</option>
                    <option>11:00 AM</option>
                    <option>11:30 AM</option>
                    <option>02:00 PM</option>
                    <option>02:30 PM</option>
                    <option>03:00 PM</option>
                    <option>03:30 PM</option>
                    <option>04:00 PM</option>
                    <option>04:30 PM</option>
                    <option>05:00 PM</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Appointment Type</label>
                  <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue">
                    <option>Regular Checkup</option>
                    <option>Teeth Cleaning</option>
                    <option>Cavity Filling</option>
                    <option>Root Canal</option>
                    <option>Teeth Whitening</option>
                    <option>Crown Fitting</option>
                    <option>Extraction</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Doctor</label>
                  <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue">
                    {doctors.map((doctor) => (
                      <option key={doctor.id}>{doctor.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="Add any notes for this appointment"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90">
                Schedule Appointment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
