"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FaTooth,
  FaCalendarAlt,
  FaBoxes,
  FaMoneyBillWave,
  FaUsers,
  FaChartLine,
  FaCog,
  FaSignOutAlt,
  FaBell,
  FaUserMd,
  FaClipboardList,
  FaExclamationTriangle,
  FaCheckCircle,
  FaClock,
  FaArrowUp,
  FaArrowDown,
  FaCalendarCheck,
  FaChevronRight,
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
  const [user, setUser] = useState<AdminUser | null>(null);
  const [userRole, setUserRole] = useState<string>("doctor");
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [clinicStats, setClinicStats] = useState({
    totalFunds: 0,
    monthlyRevenue: 0,
    monthlyExpenses: 0,
    pendingPayments: 0,
    todayAppointments: 0,
    completedToday: 0,
    lowStockItems: 0,
    totalPatients: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<
    {
      id: number;
      type: string;
      description: string;
      amount: number;
      date: string;
    }[]
  >([]);
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
    const storedUser = localStorage.getItem("adminUser");
    const storedRole = localStorage.getItem("userRole");
    const storedDoctorId = localStorage.getItem("doctorId");

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

  // Fetch recent transactions (filtered by doctorId) - only for doctors
  useEffect(() => {
    if (userRole === "secretary") return; // Secretaries don't see transactions

    const fetchTransactions = async () => {
      // API call removed
    };
    fetchTransactions();
  }, [doctorId, userRole]);

  // Fetch low stock alerts (shared across clinic)
  useEffect(() => {
    const fetchLowStock = async () => {
      setLoading(false);
    };
    fetchLowStock();
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem("adminAuth");
    localStorage.removeItem("adminUser");
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    localStorage.removeItem("doctorId");
    localStorage.removeItem("assignedDoctorIds");
    // Logout disabled - no redirect
    // router.push("/admin/login");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-LB").format(Math.abs(amount)) + " LBP";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            <FaCheckCircle className="text-xs" /> Done
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
          <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
            <FaClock className="text-xs" /> Upcoming
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
    (userRole === "secretary" ? "Secretary" : "General Dentistry");

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
                  {userRole === "doctor" ? "Doctor Panel" : "Staff Panel"}
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
            {sidebarOpen && <span className="font-medium">Dashboard</span>}
          </Link>
          <Link
            href="/admin/appointments"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaCalendarAlt className="text-lg" />
            {sidebarOpen && <span className="font-medium">Appointments</span>}
          </Link>
          <Link
            href="/admin/inventory"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaBoxes className="text-lg" />
            {sidebarOpen && <span className="font-medium">Inventory</span>}
            {sidebarOpen && lowStockAlerts.length > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {lowStockAlerts.length}
              </span>
            )}
          </Link>
          {/* Only show Transactions for doctors */}
          {userRole === "doctor" && (
            <Link
              href="/admin/transactions"
              className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
            >
              <FaMoneyBillWave className="text-lg" />
              {sidebarOpen && <span className="font-medium">Transactions</span>}
            </Link>
          )}
          <Link
            href="/admin/patients"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaUsers className="text-lg" />
            {sidebarOpen && <span className="font-medium">Patients</span>}
          </Link>
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-gray-700 space-y-2">
          {/* Only show Settings for doctors */}
          {userRole === "doctor" && (
            <Link
              href="/admin/settings"
              className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
            >
              <FaCog className="text-lg" />
              {sidebarOpen && <span className="font-medium">Settings</span>}
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors"
          >
            <FaSignOutAlt className="text-lg" />
            {sidebarOpen && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Header */}
        <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 text-sm">
              Welcome back, {userRole === "doctor" ? "Dr. " : ""}
              {displayName}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/notifications"
              className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FaBell className="text-xl" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </Link>
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-full flex items-center justify-center text-white font-semibold">
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {userRole === "doctor" ? "Dr. " : ""}
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
            {/* Clinic Funds - only for doctors */}
            {userRole === "doctor" && (
              <div className="bg-gradient-to-br from-dental-blue to-dental-teal rounded-2xl p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <FaMoneyBillWave className="text-2xl" />
                  </div>
                  <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                    Total Funds
                  </span>
                </div>
                <p className="text-3xl font-bold">
                  {formatCurrency(clinicStats.totalFunds)}
                </p>
                <p className="text-sm text-white/80 mt-1">Your Balance</p>
              </div>
            )}

            {/* Monthly Revenue - only for doctors */}
            {userRole === "doctor" && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <FaArrowUp className="text-green-600 text-xl" />
                  </div>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
                    <FaArrowUp className="text-xs" /> +12%
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(clinicStats.monthlyRevenue)}
                </p>
                <p className="text-sm text-gray-500 mt-1">Monthly Revenue</p>
              </div>
            )}

            {/* Monthly Expenses - only for doctors */}
            {userRole === "doctor" && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                    <FaArrowDown className="text-red-600 text-xl" />
                  </div>
                  <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full flex items-center gap-1">
                    <FaArrowDown className="text-xs" /> -5%
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(clinicStats.monthlyExpenses)}
                </p>
                <p className="text-sm text-gray-500 mt-1">Monthly Expenses</p>
              </div>
            )}

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
              <p className="text-sm text-gray-500 mt-1">Today's Appointments</p>
            </div>

            {/* Total Patients - shown for all roles */}
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
                <p className="text-sm text-gray-500 mt-1">Total Patients</p>
              </div>
            )}
          </div>

          {/* Main Grid */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Today's Schedule */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">
                  Today's Schedule
                </h2>
                <Link
                  href="/admin/appointments"
                  className="text-dental-blue text-sm font-medium flex items-center gap-1 hover:underline"
                >
                  View All <FaChevronRight className="text-xs" />
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
                    <p>No appointments scheduled for today</p>
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
                    Low Stock Alerts
                  </h2>
                  <Link
                    href="/admin/inventory"
                    className="text-dental-blue text-sm font-medium flex items-center gap-1 hover:underline"
                  >
                    Manage <FaChevronRight className="text-xs" />
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
                          Reorder
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">
                    All items are well stocked
                  </p>
                )}
              </div>

              {/* Recent Transactions - only for doctors */}
              {userRole === "doctor" && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900">
                      Recent Transactions
                    </h2>
                    <Link
                      href="/admin/transactions"
                      className="text-dental-blue text-sm font-medium flex items-center gap-1 hover:underline"
                    >
                      View All <FaChevronRight className="text-xs" />
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {recentTransactions.length > 0 ? (
                      recentTransactions.slice(0, 4).map((txn) => (
                        <div
                          key={txn.id}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                txn.type === "income"
                                  ? "bg-green-100"
                                  : "bg-red-100"
                              }`}
                            >
                              {txn.type === "income" ? (
                                <FaArrowUp className="text-green-600" />
                              ) : (
                                <FaArrowDown className="text-red-600" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 text-sm">
                                {txn.description}
                              </p>
                              <p className="text-xs text-gray-500">
                                {txn.date}
                              </p>
                            </div>
                          </div>
                          <p
                            className={`font-semibold ${
                              txn.type === "income"
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {txn.type === "income" ? "+" : "-"}
                            {formatCurrency(txn.amount)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-sm">
                        No recent transactions
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
