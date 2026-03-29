"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useRouter } from "next/navigation";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import {
  FaTooth,
  FaCalendarAlt,
  FaBoxes,
  FaUsers,
  FaChartLine,
  FaCog,
  FaSignOutAlt,
  FaBell,
  FaExclamationTriangle,
  FaCheckCircle,
  FaClock,
  FaCalendarCheck,
  FaChevronRight,
  FaBars,
} from "react-icons/fa";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface AdminUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  specialty?: string;
  doctorId?: number;
  role: string;
}

export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [userRole, setUserRole] = useState<string>("doctor");
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [clinicStats, setClinicStats] = useState({
    todayAppointments: 0,
    completedToday: 0,
    lowStockItems: 0,
    totalPatients: 0,
  });
  const [todayAppointments, setTodayAppointments] = useState<
    {
      id: number;
      time: string;
      patient: string;
      type: string;
      status: string;
    }[]
  >([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<
    {
      id: number;
      item: string;
      current: number;
      minimum: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Load user info from localStorage on mount
  useEffect(() => {
    const storedUser = safeStorage.getItem("adminUser");
    const storedRole = safeStorage.getItem("userRole");
    const storedDoctorId = safeStorage.getItem("doctorId");

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    if (storedRole) {
      setUserRole(storedRole);
    }
    if (storedDoctorId) {
      setDoctorId(parseInt(storedDoctorId));
    }
  }, []);

  // Fetch admin stats (filtered by doctorId)
  useEffect(() => {
    const fetchStats = async () => {
      // API call removed
    };
    fetchStats();
  }, [doctorId]);

  // Fetch today's appointments (filtered by doctorId)
  useEffect(() => {
    const fetchTodayAppointments = async () => {
      // API call removed
    };
    fetchTodayAppointments();
  }, [doctorId]);

  // Fetch low stock alerts (shared across clinic)
  useEffect(() => {
    const fetchLowStock = async () => {
      setLoading(false);
    };
    fetchLowStock();
  }, []);

  const handleLogout = () => {
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("userRole");
    safeStorage.removeItem("doctorId");
    safeStorage.removeItem("assignedDoctorIds");
    router.push("/login");
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
          <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
            <FaClock className="text-xs" /> {t("appointments.upcoming")}
          </span>
        );
      default:
        return null;
    }
  };

  // Get user display name and initials
  const displayName = user ? `${user.firstName} ${user.lastName}` : "User";
  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`
    : "U";
  const specialty =
    user?.specialty ||
    (userRole === "secretary"
      ? t("adminLogin.secretary")
      : "General Dentistry");

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } bg-gradient-to-b from-gray-900 to-gray-800 text-white transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-700">
          <Link href="/admin" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
              <FaTooth className="text-white text-xl" />
            </div>
            {sidebarOpen && (
              <div>
                <span className="text-lg font-bold">BrightSmile</span>
                <p className="text-xs text-gray-400">
                  {userRole === "doctor"
                    ? t("nav.doctorPanel")
                    : t("nav.staffPanel")}
                </p>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <Link
            href="/admin"
            className="flex items-center space-x-3 px-4 py-3 bg-dental-blue/20 text-dental-lightblue rounded-xl"
          >
            <FaChartLine className="text-lg" />
            {sidebarOpen && (
              <span className="font-medium">{t("nav.dashboard")}</span>
            )}
          </Link>
          <Link
            href="/admin/appointments"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaCalendarAlt className="text-lg" />
            {sidebarOpen && (
              <span className="font-medium">{t("nav.appointments")}</span>
            )}
          </Link>
          <Link
            href="/admin/inventory"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaBoxes className="text-lg" />
            {sidebarOpen && (
              <span className="font-medium">{t("nav.inventory")}</span>
            )}
            {sidebarOpen && lowStockAlerts.length > 0 && (
              <span className="ml-auto rtl:ml-0 rtl:mr-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {lowStockAlerts.length}
              </span>
            )}
          </Link>
          <Link
            href="/admin/patients"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaUsers className="text-lg" />
            {sidebarOpen && (
              <span className="font-medium">{t("nav.patients")}</span>
            )}
          </Link>
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-gray-700 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors"
          >
            <FaSignOutAlt className="text-lg" />
            {sidebarOpen && (
              <span className="font-medium">{t("common.logout")}</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Header */}
        <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FaBars className="text-xl text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {t("nav.dashboard")}
              </h1>
              <p className="text-gray-500 text-sm">
                {t("adminDashboard.welcomeBack")},{" "}
                {userRole === "doctor" ? `${t("adminLogin.doctor")}. ` : ""}
                {displayName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <div className="flex items-center gap-3 pl-4 rtl:pl-0 rtl:pr-4 border-l rtl:border-l-0 rtl:border-r border-gray-200">
              <Avatar name={displayName} size="md" />
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {userRole === "doctor" ? `${t("adminLogin.doctor")}. ` : ""}
                  {displayName}
                </p>
                <p className="text-xs text-gray-500">{specialty}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 p-8 overflow-auto">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Today's Appointments - shown for all roles */}
            <div
              className={`bg-white rounded-2xl p-6 shadow-sm border border-gray-100 ${userRole === "secretary" ? "col-span-2" : ""}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <FaCalendarCheck className="text-purple-600 text-xl" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {clinicStats.completedToday}/{clinicStats.todayAppointments}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {t("adminDashboard.todaysAppointments")}
              </p>
            </div>

            {/* Total Patients - shown for secretaries */}
            {userRole === "secretary" && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <FaUsers className="text-blue-600 text-xl" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {clinicStats.totalPatients}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {t("adminDashboard.totalPatients")}
                </p>
              </div>
            )}
          </div>

          {/* Main Grid */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Today's Schedule */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">
                  {t("adminDashboard.todaysSchedule")}
                </h2>
                <Link
                  href="/admin/appointments"
                  className="text-dental-blue text-sm font-medium flex items-center gap-1 hover:underline"
                >
                  {t("common.viewAll")}{" "}
                  <FaChevronRight className="text-xs rtl:rotate-180" />
                </Link>
              </div>
              <div className="space-y-3">
                {todayAppointments.length > 0 ? (
                  todayAppointments.map((apt) => (
                    <div
                      key={apt.id}
                      className={`flex items-center justify-between p-4 rounded-xl border ${
                        apt.status === "in_progress"
                          ? "border-blue-200 bg-blue-50"
                          : apt.status === "completed"
                            ? "border-gray-100 bg-gray-50"
                            : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-sm font-bold text-gray-900">
                            {apt.time}
                          </p>
                        </div>
                        <div className="w-px h-10 bg-gray-200"></div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {apt.patient}
                          </p>
                          <p className="text-sm text-gray-500">{apt.type}</p>
                        </div>
                      </div>
                      {getStatusBadge(apt.status)}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FaCalendarAlt className="text-4xl mx-auto mb-2 text-gray-300" />
                    <p>{t("adminDashboard.noAppointmentsToday")}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Low Stock Alerts */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">
                    {t("adminDashboard.lowStockAlerts")}
                  </h2>
                  <Link
                    href="/admin/inventory"
                    className="text-dental-blue text-sm font-medium flex items-center gap-1 hover:underline"
                  >
                    {t("common.manage")}{" "}
                    <FaChevronRight className="text-xs rtl:rotate-180" />
                  </Link>
                </div>
                {lowStockAlerts.length > 0 ? (
                  <div className="space-y-3">
                    {lowStockAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                            <FaExclamationTriangle className="text-red-500" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {alert.item}
                            </p>
                            <p className="text-xs text-gray-500">
                              {alert.current} left (min: {alert.minimum})
                            </p>
                          </div>
                        </div>
                        <button className="text-xs text-red-600 font-medium hover:underline">
                          {t("adminDashboard.reorder")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">
                    {t("adminDashboard.allItemsWellStocked")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
