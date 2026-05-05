"use client";
import { apiFetch } from '@/lib/api/client';

import { toast } from 'sonner';
import Link from "next/link";
import { useState, useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useRouter } from "next/navigation";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
  FaDollarSign,
  FaWallet,
  FaMoneyBillWave,
  FaFileInvoiceDollar,
  FaEllipsisV,
  FaBan,
  FaCalendarPlus,
  FaTimes,
} from "react-icons/fa";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

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
      doctorId: number;
      patientId: number;
      date: string;
    }[]
  >([]);

  // postpone modal state
  const [postponeApptId, setPostponeApptId] = useState<number | null>(null);
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeTime, setPostponeTime] = useState("");
  const [postponeLoading, setPostponeLoading] = useState(false);
  const [lowStockAlerts, setLowStockAlerts] = useState<
    {
      id: number;
      item: string;
      current: number;
      minimum: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);

  // Financial state
  const [kpis, setKpis] = useState<any>(null);
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);

  // Single effect: fire all requests in parallel, set all state together
  useEffect(() => {
    const storedUser = safeStorage.getItem("adminUser");
    const storedRole = safeStorage.getItem("userRole");
    const storedDoctorId = safeStorage.getItem("doctorId");

    if (storedRole) setUserRole(storedRole);
    if (storedDoctorId) setDoctorId(parseInt(storedDoctorId));

    const fetchAll = async () => {
      // Resolve email for user lookup
      let email = "";
      if (storedUser) {
        try { email = JSON.parse(storedUser).email || ""; } catch {}
      }


      try {
        // Fire all requests simultaneously — one round-trip wave
        const [userRes, patientsRes, appointmentsRes, inventoryRes, summaryRes, paymentsRes, expensesRes] =
          await Promise.all([
            email ? fetch(`${API_URL}/api/users/by-email?email=${encodeURIComponent(email)}`) : Promise.resolve(null),
            apiFetch(`/api/patients`),
            apiFetch(`/api/appointments?limit=500`),
            apiFetch(`/api/inventory/low-stock`),
            apiFetch(`/api/billing/summary`),
            apiFetch(`/api/billing/invoice-payments?limit=500`),
            apiFetch(`/api/expenses?limit=500`),
          ]);

        // ── User ──────────────────────────────────────────────────────────────
        if (userRes?.ok) {
          const u = await userRes.json();
          if (u) {
            setUser({ id: Number(u.id), firstName: u.first_name || "", lastName: u.last_name || "", email: u.email, role: u.role });
            if (u.id) {
              safeStorage.setItem("doctorDbId", String(u.id));
              // Load avatar from backend (persists across devices)
              const detailRes = await apiFetch(`/api/users/${u.id}`);
              if (detailRes.ok) {
                const detail = await detailRes.json();
                if (detail.avatar_url) setPhotoUrl(detail.avatar_url);
              }
            }
          }
        } else if (storedUser) {
          const parsed = JSON.parse(storedUser);
          setUser({ ...parsed, firstName: parsed.firstName || parsed.first_name || "", lastName: parsed.lastName || parsed.last_name || "" });
        }

        // ── Appointments ──────────────────────────────────────────────────────
        const appointmentsData = appointmentsRes.ok ? await appointmentsRes.json() : { data: [] };
        const today = new Date().toISOString().split("T")[0];
        const todayAppts = (appointmentsData.data || []).filter((a: any) => a.appointment_date?.startsWith(today));
        const completedToday = todayAppts.filter((a: any) => a.status === "completed").length;
        setTodayAppointments(
          todayAppts.map((a: any) => {
            const patientUser = (a.patient_profiles ?? a.patient_profile)?.users;
            const time = a.start_time ? (() => { const d = new Date(a.start_time); return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`; })() : "";
            return { id: Number(a.id), time, patient: patientUser ? `${patientUser.first_name} ${patientUser.last_name}` : `Patient #${a.patient_id}`, type: a.reason || "Checkup", status: a.status, doctorId: Number(a.doctor_id || 0), patientId: Number(a.patient_id || 0), date: a.appointment_date?.split("T")[0] || today };
          })
        );

        // ── Patients + inventory stats ────────────────────────────────────────
        const patientsData = patientsRes.ok ? await patientsRes.json() : { data: [] };
        const inventoryData = inventoryRes.ok ? await inventoryRes.json() : { data: [] };
        setClinicStats({
          todayAppointments: todayAppts.length,
          completedToday,
          lowStockItems: (inventoryData.data || []).length,
          totalPatients: (patientsData.data || []).length,
        });
        setLowStockAlerts(
          (inventoryData.data || []).map((item: any) => ({
            id: Number(item.id), item: item.name, current: item.quantity, minimum: item.minimum_quantity,
          }))
        );

        // ── Financial KPIs ────────────────────────────────────────────────────
        if (summaryRes.ok) {
          const s = await summaryRes.json();
          setKpis({ total_income: Number(s.total_income ?? 0), total_expenses: Number(s.total_expenses ?? 0), net: Number(s.net ?? 0), total_outstanding: Number(s.total_outstanding ?? 0), payments_count: s.payments_count ?? 0 });
        }

        // ── Chart data ────────────────────────────────────────────────────────
        const invoicePayments: any[] = paymentsRes.ok ? ((await paymentsRes.json()) ?? []) : [];
        const expenses: any[] = expensesRes.ok ? ((await expensesRes.json()).data ?? []) : [];

        const monthKeys: string[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
          monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
        const incomeByMonth: Record<string, number> = {};
        const expensesByMonth: Record<string, number> = {};
        monthKeys.forEach((k) => { incomeByMonth[k] = 0; expensesByMonth[k] = 0; });

        invoicePayments.forEach((p: any) => {
          const amount = Number(p.amount ?? 0);
          if (amount <= 0) return;
          const key = (p.created_at || "").slice(0, 7);
          if (incomeByMonth[key] !== undefined) {
            incomeByMonth[key] += amount;
          }
        });

        expenses.forEach((e: any) => {
          const key = (e.expense_date || e.created_at || "").slice(0, 7);
          if (expensesByMonth[key] !== undefined) {
            expensesByMonth[key] += Number(e.amount ?? 0);
          }
        });

        const formatted = monthKeys.map((k) => ({
          month: k,
          Income: incomeByMonth[k],
          Expenses: expensesByMonth[k],
          Net: incomeByMonth[k] - expensesByMonth[k],
        }));
        setAnalyticsData(formatted);
      } catch (e) {
        console.error("Failed to fetch dashboard data", e);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  const handlePhotoUpload = async (file: File) => {
    if (!user?.id) return;
    const form = new FormData();
    form.append("file", file);
    const res = await apiFetch(`/api/users/${user.id}/avatar`, { method: "PATCH", body: form });
    if (res.ok) {
      const data = await res.json();
      if (data.avatar_url) setPhotoUrl(data.avatar_url);
    }
  };

  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("userRole");
    safeStorage.removeItem("doctorId");
    safeStorage.removeItem("assignedDoctorIds");
    router.push("/");
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
      case "cancelled":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            <FaTimes className="text-xs" /> {t("adminDashboard.cancelled")}
          </span>
        );
      default:
        return null;
    }
  };

  const handleCancelAppointment = async (id: number) => {
    try {
      const res = await apiFetch(`/api/appointments/${id}/cancel`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) { toast.error("Failed to cancel appointment."); return; }
      toast.success("Appointment cancelled.");
      setTodayAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status: "cancelled" } : a));
    } catch { toast.error("Failed to cancel appointment."); }
  };

  const handlePostponeSubmit = async () => {
    const appt = todayAppointments.find((a) => a.id === postponeApptId);
    if (!appt || !postponeDate || !postponeTime) return;
    setPostponeLoading(true);
    try {
      // 1. Find existing slots for that doctor/date
      const slotsRes = await apiFetch(`/api/appointment-slots?doctor_id=${appt.doctorId}&date=${postponeDate}&limit=100`);
      const slotsData = slotsRes.ok ? await slotsRes.json() : { data: [] };
      const toHHMM = (raw: string) => { const d = new Date(raw); return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`; };
      let slot = (slotsData.data || []).find((s: any) => toHHMM(s.start_time) === postponeTime && !s.is_booked);

      // 2. If no matching open slot, create one (30-min block)
      if (!slot) {
        const [h, m] = postponeTime.split(":").map(Number);
        const toH = h + Math.floor((m + 30) / 60);
        const toM = (m + 30) % 60;
        const toTime = `${String(toH).padStart(2, "0")}:${String(toM).padStart(2, "0")}`;
        const createRes = await apiFetch(`/api/appointment-slots/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doctor_id: appt.doctorId, slot_date: postponeDate, from_time: postponeTime, to_time: toTime, duration_minutes: 30 }),
        });
        if (!createRes.ok) { toast.error("Failed to create slot for new date."); return; }
        // Fetch the newly created slot
        const refetchRes = await apiFetch(`/api/appointment-slots?doctor_id=${appt.doctorId}&date=${postponeDate}&limit=100`);
        const refetchData = refetchRes.ok ? await refetchRes.json() : { data: [] };
        slot = (refetchData.data || []).find((s: any) => toHHMM(s.start_time) === postponeTime && !s.is_booked);
        if (!slot) { toast.error("Could not find the new slot after creation."); return; }
      }

      // 3. Cancel original appointment
      const cancelRes = await apiFetch(`/api/appointments/${appt.id}/cancel`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Postponed" }) });
      if (!cancelRes.ok) { toast.error("Failed to cancel original appointment."); return; }

      // 4. Book new appointment
      const bookRes = await apiFetch(`/api/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: appt.patientId, slot_id: Number(slot.id), reason: appt.type }),
      });
      if (!bookRes.ok) { toast.error("Failed to book new appointment."); return; }

      toast.success(`Appointment postponed to ${postponeDate} at ${postponeTime}.`);
      setTodayAppointments((prev) => prev.map((a) => a.id === appt.id ? { ...a, status: "cancelled" } : a));
      setPostponeApptId(null);
    } catch { toast.error("Something went wrong."); }
    finally { setPostponeLoading(false); }
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
        {/* Logo + Burger */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <Link href="/admin" className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
              <FaTooth className="text-white text-xl" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <span className="text-lg font-bold">BrightSmile</span>
                <p className="text-xs text-gray-400">
                  {userRole === "doctor"
                    ? t("nav.doctorPanel")
                    : t("nav.staffPanel")}
                </p>
              </div>
            )}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-700/60 rounded-lg transition-colors flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            <FaBars className="text-gray-300 text-lg" />
          </button>
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
          <Link
            href="/admin/expenses"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaMoneyBillWave className="text-lg" />
            {sidebarOpen && (
              <span className="font-medium">{t("nav.expenses")}</span>
            )}
          </Link>
          <Link
            href="/admin/billing"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaFileInvoiceDollar className="text-lg" />
            {sidebarOpen && (
              <span className="font-medium">{t("nav.billing")}</span>
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
              <Avatar name={displayName} size="md" src={photoUrl} onUpload={handlePhotoUpload} />
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Today's Appointments */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <FaCalendarCheck className="text-purple-600 text-xl" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {clinicStats.completedToday}/{clinicStats.todayAppointments}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {t("adminDashboard.todaysAppointments")}
              </p>
            </div>

            {/* Total Income */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                <FaDollarSign className="text-green-600 text-xl" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {kpis ? `$${kpis.total_income.toLocaleString()}` : "—"}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t("adminDashboard.totalIncome")}</p>
            </div>

            {/* Total Expenses */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                <FaWallet className="text-orange-500 text-xl" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {kpis ? `$${kpis.total_expenses.toLocaleString()}` : "—"}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t("adminDashboard.totalExpenses")}</p>
            </div>

            {/* Net Profit */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <FaChartLine className="text-blue-600 text-xl" />
              </div>
              <p className={`text-2xl font-bold ${kpis && kpis.net < 0 ? "text-red-600" : "text-gray-900"}`}>
                {kpis ? `$${kpis.net.toLocaleString()}` : "—"}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t("adminDashboard.netProfit")}</p>
            </div>

            {/* Outstanding */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center mb-4">
                <FaWallet className="text-yellow-600 text-xl" />
              </div>
              <p className="text-2xl font-bold text-yellow-700">
                {kpis ? `$${kpis.total_outstanding.toLocaleString()}` : "—"}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t("adminDashboard.outstanding")}</p>
            </div>

            {/* Total Patients - secretary only */}
            {userRole === "secretary" && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 col-span-2">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  <FaUsers className="text-blue-600 text-xl" />
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
                          : apt.status === "cancelled"
                            ? "border-red-200 bg-red-50"
                            : apt.status === "completed"
                              ? "border-gray-100 bg-gray-50 opacity-60"
                              : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-sm font-bold text-gray-900">{apt.time ? (() => { const [h,m] = apt.time.split(":").map(Number); const ampm = h >= 12 ? "PM" : "AM"; return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${ampm}`; })() : ""}</p>
                        </div>
                        <div className="w-px h-10 bg-gray-200"></div>
                        <div>
                          <p className="font-semibold text-gray-900">{apt.patient}</p>
                          <p className="text-sm text-gray-500">{apt.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(apt.status)}
                        {apt.status !== "completed" && apt.status !== "cancelled" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-700">
                                <FaEllipsisV className="text-sm" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => {
                                  setPostponeApptId(apt.id);
                                  setPostponeDate("");
                                  setPostponeTime(apt.time);
                                }}
                              >
                                <FaCalendarPlus className="text-dental-blue" /> {t("adminDashboard.postpone")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCancelAppointment(apt.id)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <FaBan className="text-red-500" /> Cancel
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
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

          {/* ── Financial Overview ── */}
          <div className="mt-8">
            {/* Line Chart */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-bold text-gray-900">{t("adminDashboard.revenueVsExpenses")}</h3>
                  <p className="text-xs text-gray-500">{t("adminDashboard.last6Months")}</p>
                </div>
                {kpis && (
                  <div className="flex gap-4 text-sm">
                    <span className="text-gray-500">
                      {t("adminDashboard.netProfitLabel")}{" "}
                      <span className="font-semibold text-gray-900">
                        ${kpis.net.toLocaleString()}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              {analyticsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={analyticsData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: any, name: any) => [`$${Number(value).toLocaleString()}`, name]}
                      contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: 13 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Line type="monotone" dataKey="Income" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Expenses" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Net" stroke="#10b981" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
                  {t("adminDashboard.noFinancialData")}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Postpone Modal */}
      {postponeApptId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{t("adminDashboard.postponeAppointment")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("adminDashboard.newDate")}</label>
                <input
                  type="date"
                  value={postponeDate}
                  min={new Date().toLocaleDateString("en-CA")}
                  onChange={(e) => setPostponeDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("adminDashboard.newTime")}</label>
                <input
                  type="time"
                  value={postponeTime}
                  onChange={(e) => setPostponeTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>
              <p className="text-xs text-gray-500">{t("adminDashboard.slotAutoCreate")}</p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setPostponeApptId(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handlePostponeSubmit}
                disabled={!postponeDate || !postponeTime || postponeLoading}
                className="flex-1 px-4 py-2 bg-dental-blue text-white rounded-lg text-sm font-medium hover:bg-dental-blue/90 disabled:opacity-50 transition-colors"
              >
                {postponeLoading ? t("common.saving") : t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
