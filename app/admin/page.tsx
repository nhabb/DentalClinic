"use client";

import Link from "next/link";
import { useState } from "react";
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

// TODO: Fetch from API
const clinicStats = {
  totalFunds: 0,
  monthlyRevenue: 0,
  monthlyExpenses: 0,
  pendingPayments: 0,
  todayAppointments: 0,
  completedToday: 0,
  lowStockItems: 0,
  totalPatients: 0,
};

// TODO: Fetch from API
const recentTransactions: {
  id: number;
  type: string;
  description: string;
  amount: number;
  date: string;
}[] = [];

// TODO: Fetch from API
const todayAppointments: {
  id: number;
  time: string;
  patient: string;
  type: string;
  status: string;
}[] = [];

// TODO: Fetch from API
const lowStockAlerts: {
  id: number;
  item: string;
  current: number;
  minimum: number;
}[] = [];

export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("adminAuth");
    localStorage.removeItem("adminUser");
    router.push("/admin/login");
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
                <p className="text-xs text-gray-400">Admin Panel</p>
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
          <Link
            href="/admin/transactions"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaMoneyBillWave className="text-lg" />
            {sidebarOpen && <span className="font-medium">Transactions</span>}
          </Link>
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
          <Link
            href="/admin/settings"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaCog className="text-lg" />
            {sidebarOpen && <span className="font-medium">Settings</span>}
          </Link>
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
              Welcome back, Dr. Sarah Haddad
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
                SH
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  Dr. Sarah Haddad
                </p>
                <p className="text-xs text-gray-500">General Dentistry</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 p-8 overflow-auto">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Clinic Funds */}
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
              <p className="text-sm text-white/80 mt-1">Clinic Balance</p>
            </div>

            {/* Monthly Revenue */}
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

            {/* Monthly Expenses */}
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

            {/* Today's Appointments */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
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
                {todayAppointments.map((apt) => (
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
                ))}
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

              {/* Recent Transactions */}
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
                  {recentTransactions.slice(0, 4).map((txn) => (
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
                          <p className="text-xs text-gray-500">{txn.date}</p>
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
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
