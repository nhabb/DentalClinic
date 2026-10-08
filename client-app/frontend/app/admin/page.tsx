"use client";
import { apiFetch } from '@/lib/api/client';

import { toast } from 'sonner';
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";
import DashboardAnalytics, { type DashboardData } from "@/components/dashboard/DashboardAnalytics";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
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
  FaSignOutAlt,
  FaCheckCircle,
  FaClock,
  FaChevronRight,
  FaBars,
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
  // Only offer what this role's API permissions allow (the API refuses the rest anyway).
  const { can } = usePermissions();
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

  // Normalised datasets for the analytics charts
  const [dash, setDash] = useState<DashboardData>({ records: [], appointments: [], expenses: [], payments: [], invoices: [], inventory: [], patients: [], doctors: [] });

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
        const [userRes, patientsRes, appointmentsRes, inventoryRes, paymentsRes, expensesRes, invoicesRes, doctorsRes, recordsRes] =
          await Promise.all([
            email ? fetch(`${API_URL}/api/users/by-email?email=${encodeURIComponent(email)}`) : Promise.resolve(null),
            apiFetch(`/api/patients`),
            apiFetch(`/api/appointments?limit=1000`),
            apiFetch(`/api/inventory`),
            apiFetch(`/api/billing/invoice-payments?limit=500`),
            apiFetch(`/api/expenses?limit=500`),
            apiFetch(`/api/billing/invoices?limit=200`),
            fetch(`${API_URL}/api/users/doctors`),
            apiFetch(`/api/patient-records?limit=1000`),
          ]);

        // ── User ──────────────────────────────────────────────────────────────
        if (userRes?.ok) {
          const u = await userRes.json();
          setUser({ id: Number(u.id), firstName: u.first_name || "", lastName: u.last_name || "", email: u.email, role: u.role });
          if (u.id) safeStorage.setItem("doctorDbId", String(u.id));
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
            const time = a.start_time ? new Date(a.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
            return { id: Number(a.id), time, patient: patientUser ? `${patientUser.first_name} ${patientUser.last_name}` : `Patient #${a.patient_id}`, type: a.reason || "Checkup", status: a.status, doctorId: Number(a.doctor_id || 0), patientId: Number(a.patient_id || 0), date: a.appointment_date?.split("T")[0] || today };
          })
        );

        // ── Patients + inventory stats ────────────────────────────────────────
        const patientsData = patientsRes.ok ? await patientsRes.json() : { data: [] };
        const inventoryData = inventoryRes.ok ? await inventoryRes.json() : { data: [] };
        const inventoryRows = (inventoryData.data || []).map((item: any) => {
          const quantity = Number(item.quantity ?? 0);
          const minimum = Number(item.minimum_quantity ?? 0);
          const status: "ok" | "low" | "out" = quantity === 0 ? "out" : quantity <= minimum ? "low" : "ok";
          const rawCat = String(item.category ?? "General").trim();
          const category = rawCat ? rawCat.charAt(0).toUpperCase() + rawCat.slice(1).toLowerCase() : "General";
          return { id: Number(item.id), name: String(item.name ?? ""), category, quantity, minimum, status };
        });
        const lowRows = inventoryRows.filter((i: { status: string }) => i.status !== "ok");
        setClinicStats({
          todayAppointments: todayAppts.length,
          completedToday,
          lowStockItems: lowRows.length,
          totalPatients: (patientsData.data || []).length,
        });
        setLowStockAlerts(lowRows.map((i: any) => ({ id: i.id, item: i.name, current: i.quantity, minimum: i.minimum })));

        // ── Datasets for the analytics charts ─────────────────────────────
        const invoicePayments: any[] = paymentsRes.ok ? ((await paymentsRes.json()) ?? []) : [];
        const expenses: any[] = expensesRes.ok ? ((await expensesRes.json()).data ?? []) : [];
        const invoicesJson = invoicesRes.ok ? await invoicesRes.json() : { data: [] };
        const invoices: any[] = Array.isArray(invoicesJson?.data) ? invoicesJson.data : Array.isArray(invoicesJson) ? invoicesJson : [];
        const doctorsList: any[] = doctorsRes?.ok ? await doctorsRes.json() : [];
        const recordsJson = recordsRes.ok ? await recordsRes.json() : { data: [] };
        const recordRows: any[] = Array.isArray(recordsJson?.data) ? recordsJson.data : [];
        const day = (v: any) => (typeof v === "string" ? v.slice(0, 10) : "");

        setDash({
          records: recordRows.map((r: any) => {
            const pu = r.patient_profiles?.users;
            return {
              id: Number(r.id),
              date: day(r.treatment_date || r.created_at),
              tooth: r.tooth_number ? String(r.tooth_number) : "",
              procedure: String(r.title || "—"),
              status: (r.record_type === "treatment_plan" ? "planned" : r.record_type === "missing_tooth" ? "missing" : "completed") as "completed" | "planned" | "missing",
              patientId: Number(r.patient_id || r.patient_profiles?.id || 0),
              patientName: pu ? `${pu.first_name ?? ""} ${pu.last_name ?? ""}`.trim() : `#${r.patient_id}`,
              doctorId: Number(r.created_by || r.users?.id || 0),
            };
          }),
          appointments: (appointmentsData.data || []).map((a: any) => ({
            id: Number(a.id),
            date: day(a.appointment_date),
            status: String(a.status ?? "scheduled"),
            type: String(a.reason || "Checkup"),
            doctorId: Number(a.doctor_id || a.created_by || 0),
          })),
          expenses: expenses.map((e: any) => ({
            id: Number(e.id),
            date: day(e.expense_date || e.created_at),
            category: String(e.category ?? "other").toLowerCase(),
            amount: Number(e.amount ?? 0),
          })),
          payments: invoicePayments
            .filter((p: any) => Number(p.amount ?? 0) > 0)
            .map((p: any) => ({ id: Number(p.id), date: day(p.created_at), amount: Number(p.amount), method: String(p.payment_method ?? "other") })),
          invoices: invoices.map((i: any) => ({
            id: Number(i.id),
            date: day(i.procedure_date || i.created_at),
            status: (["open", "partial", "paid"].includes(i.status) ? i.status : "open") as "open" | "partial" | "paid",
            total: Number(i.total_amount ?? 0),
            remaining: Number(i.remaining_amount ?? 0),
          })),
          inventory: inventoryRows,
          patients: (patientsData.data || []).map((p: any) => ({
            id: Number(p.id),
            registeredDate: day(p.users?.created_at || p.created_at),
          })),
          doctors: doctorsList.map((d: any) => ({ id: Number(d.id), name: `Dr. ${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() })),
        });
      } catch (e) {
        console.error("Failed to fetch dashboard data", e);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

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
      let slot = (slotsData.data || []).find((s: any) => {
        const t = new Date(s.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
        return t === postponeTime && !s.is_booked;
      });

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
        slot = (refetchData.data || []).find((s: any) => {
          const t = new Date(s.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
          return t === postponeTime && !s.is_booked;
        });
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
  return (
    <div className="min-h-screen bg-white flex">
      {/* The one shared sidebar — this page used to carry its own copy,
       * which is how it drifted out of sync with the rest of /admin. */}
      <AdminSidebar
        activePage="dashboard"
        sidebarOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onLogout={handleLogout}
        subtitle={userRole === "doctor" ? t("nav.doctorPanel") : t("nav.staffPanel")}
        badges={{ inventory: lowStockAlerts.length }}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <AdminPageHeader
          title={t("nav.dashboard")}
          subtitle={`${t("adminDashboard.welcomeBack")} ${userRole === "doctor" ? `${t("adminLogin.doctor")}. ` : ""}${displayName}`}
        />

        {/* Dashboard Content */}
        <main className="flex-1 p-8 overflow-auto">
          <DashboardAnalytics
            data={dash}
            loading={loading}
            operations={
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-gray-900">
                    {t("adminDashboard.todaysSchedule")}
                  </h2>
                  <Link
                    href="/admin/appointments"
                    className="text-brand text-sm font-medium flex items-center gap-1 hover:underline"
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
                            <p className="text-sm font-bold text-gray-900">{apt.time}</p>
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
                                  <FaCalendarPlus className="text-brand" /> {t("adminDashboard.postpone")}
                                </DropdownMenuItem>
                                {can("appointments:write") && (
                                <DropdownMenuItem
                                  onClick={() => handleCancelAppointment(apt.id)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <FaBan className="text-red-500" /> Cancel
                                </DropdownMenuItem>
                                )}
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

            }
          />
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
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setPostponeDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("adminDashboard.newTime")}</label>
                <input
                  type="time"
                  value={postponeTime}
                  onChange={(e) => setPostponeTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
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
              {(can("appointments:write") && can("slots:manage")) && (
              <button
                onClick={handlePostponeSubmit}
                disabled={!postponeDate || !postponeTime || postponeLoading}
                className="flex-1 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors"
              >
                {postponeLoading ? t("common.saving") : t("common.confirm")}
              </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
