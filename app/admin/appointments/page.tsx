"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import {
  FaTooth,
  FaCalendarAlt,
  FaBoxes,
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
  FaPhone,
  FaEllipsisV,
  FaCalendarCheck,
  FaCalendarTimes,
  FaUserMd,
} from "react-icons/fa";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

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
}

interface Doctor {
  id: number;
  name: string;
  specialty: string;
  color: string;
}

export default function AppointmentsManagement() {
  const router = useRouter();
  const { t, language, setLanguage } = useTranslation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);

  // Role-based state
  const [userRole, setUserRole] = useState<string>("doctor");
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [assignedDoctorIds, setAssignedDoctorIds] = useState<number[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Data state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
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

  // Fetch appointments and doctors
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(false);
    };

    if (
      userRole &&
      (doctorId || assignedDoctorIds.length > 0 || userRole === "admin")
    ) {
      fetchData();
    }
  }, [selectedDate, userRole, doctorId, assignedDoctorIds]);

  const handleLogout = () => {
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("userRole");
    safeStorage.removeItem("doctorId");
    safeStorage.removeItem("assignedDoctorIds");
    router.push("/admin/login");
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
          <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            <FaCheckCircle className="text-xs" /> {t("appointments.completed")}
          </span>
        );
      case "in_progress":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
            <FaClock className="text-xs" /> {t("appointments.inProgress")}
          </span>
        );
      case "upcoming":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
            <FaClock className="text-xs" /> {t("appointments.upcoming")}
          </span>
        );
      case "cancelled":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            <FaTimes className="text-xs" /> {t("appointments.cancelled")}
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
    const matchesSearch =
      apt.patient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      apt.type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDoctor =
      selectedDoctor === "all" || apt.doctor === selectedDoctor;
    return matchesSearch && matchesDoctor;
  });

  const todayStats = {
    total: appointments.length,
    completed: appointments.filter((a) => a.status === "completed").length,
    upcoming: appointments.filter((a) => a.status === "upcoming").length,
    cancelled: appointments.filter((a) => a.status === "cancelled").length,
  };

  const navigateDate = (direction: "prev" | "next") => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1));
    setSelectedDate(newDate);
  };

  const handleStartAppointment = async (appointmentId: number) => {
    // API call removed
    setAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: "in_progress" } : apt,
      ),
    );
  };

  const handleCompleteAppointment = async (appointmentId: number) => {
    // API call removed
    setAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: "completed" } : apt,
      ),
    );
  };

  const handleCancelAppointment = async (appointmentId: number) => {
    // API call removed
    setAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: "cancelled" } : apt,
      ),
    );
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
              <p className="text-xs text-gray-400">{t("nav.adminPanel")}</p>
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
            <span className="font-medium">{t("nav.dashboard")}</span>
          </Link>
          <Link
            href="/admin/appointments"
            className="flex items-center space-x-3 px-4 py-3 bg-dental-blue/20 text-dental-lightblue rounded-xl"
          >
            <FaCalendarAlt className="text-lg" />
            <span className="font-medium">{t("nav.appointments")}</span>
          </Link>
          <Link
            href="/admin/inventory"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaBoxes className="text-lg" />
            <span className="font-medium">{t("nav.inventory")}</span>
          </Link>
          <Link
            href="/admin/patients"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaUsers className="text-lg" />
            <span className="font-medium">{t("nav.patients")}</span>
          </Link>
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-gray-700 space-y-2">
          {userRole === "doctor" && (
            <Link
              href="/admin/settings"
              className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
            >
              <FaCog className="text-lg" />
              <span className="font-medium">{t("nav.settings")}</span>
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors"
          >
            <FaSignOutAlt className="text-lg" />
            <span className="font-medium">{t("common.logout")}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("appointments.appointments")}</h1>
            <p className="text-gray-500 text-sm">
              {currentUser
                ? `${currentUser.firstName} ${currentUser.lastName}'s`
                : t("common.manage")}{" "}
              {t("appointments.manageAppointments")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {(["en", "fr", "ar"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    language === lang
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-dental-blue hover:bg-dental-blue/90"
            >
              <FaPlus className="mr-2 rtl:mr-0 rtl:ml-2" />
              {t("appointments.newAppointment")}
            </Button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-8 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-dental-blue/30 border-t-dental-blue rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <FaCalendarAlt className="text-blue-600 text-xl" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {todayStats.total}
                      </p>
                      <p className="text-sm text-gray-500">{t("appointments.todaysTotal")}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <FaCalendarCheck className="text-green-600 text-xl" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {todayStats.completed}
                      </p>
                      <p className="text-sm text-gray-500">{t("appointments.completed")}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                      <FaClock className="text-yellow-600 text-xl" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {todayStats.upcoming}
                      </p>
                      <p className="text-sm text-gray-500">{t("appointments.upcoming")}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                      <FaCalendarTimes className="text-red-600 text-xl" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {todayStats.cancelled}
                      </p>
                      <p className="text-sm text-gray-500">{t("appointments.cancelled")}</p>
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
                        <option value="all">{t("appointments.allDoctors")}</option>
                        {visibleDoctors.map((doctor) => (
                          <option key={doctor.id} value={doctor.name}>
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
                        className={`p-6 hover:bg-gray-50 transition-colors ${
                          apt.status === "cancelled" ? "opacity-60" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-6">
                            {/* Time */}
                            <div className="text-center min-w-[80px]">
                              <p className="text-xl font-bold text-gray-900">
                                {apt.time}
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
                                <p className="font-bold text-gray-900 text-lg">
                                  {apt.patient}
                                </p>
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
                                <p className="text-sm text-gray-400 mt-2 italic">
                                  {t("appointments.notePrefix")} {apt.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            {apt.status === "upcoming" && (
                              <>
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => handleStartAppointment(apt.id)}
                                >
                                  <FaCheckCircle className="mr-1 rtl:mr-0 rtl:ml-1" /> {t("appointments.start")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() =>
                                    handleCancelAppointment(apt.id)
                                  }
                                >
                                  <FaTimes className="mr-1 rtl:mr-0 rtl:ml-1" /> {t("appointments.cancel")}
                                </Button>
                              </>
                            )}
                            {apt.status === "in_progress" && (
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={() =>
                                  handleCompleteAppointment(apt.id)
                                }
                              >
                                <FaCheckCircle className="mr-1 rtl:mr-0 rtl:ml-1" /> {t("appointments.complete")}
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
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {t("appointments.noAppointments")}
                    </h3>
                    <p className="text-gray-500">
                      {t("appointments.noAppointmentsDesc")}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Add Appointment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              {t("appointments.newAppointment")}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("appointments.patientName")}
                </label>
                <input
                  type="text"
                  placeholder={t("appointments.patientNamePlaceholder")}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t("appointments.date")}
                  </label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t("appointments.time")}
                  </label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t("appointments.appointmentType")}
                  </label>
                  <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue">
                    <option>{t("appointments.regularCheckup")}</option>
                    <option>{t("appointments.teethCleaning")}</option>
                    <option>{t("appointments.cavityFilling")}</option>
                    <option>{t("appointments.rootCanal")}</option>
                    <option>{t("appointments.teethWhitening")}</option>
                    <option>{t("appointments.crownFitting")}</option>
                    <option>{t("appointments.extraction")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t("appointments.doctor")}
                  </label>
                  <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue">
                    {visibleDoctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("appointments.notesOptional")}
                </label>
                <textarea
                  rows={3}
                  placeholder={t("appointments.notesPlaceholder")}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAddModal(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90">
                {t("appointments.scheduleAppointment")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
