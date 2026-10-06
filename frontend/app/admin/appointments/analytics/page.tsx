"use client";

// Appointments analytics sub-page.
//
// Backend contract (NestJS, see backend/src/doctor/appointments):
//   GET /api/appointments?limit=1000 → { data: Appointment[] }
//   GET /api/users/doctors           → Doctor[]
// No aggregate/analytics endpoint exists for appointments, so — same as the
// cross-cutting dashboard (components/dashboard/DashboardAnalytics.tsx) —
// this page fetches the flat list and buckets/groups it client-side.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { FaCalendarAlt, FaCheckCircle, FaUserSlash, FaBan } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { safeStorage } from "@/lib/browser-compat";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Card, Kpi, Donut, HBars, ChartTooltip, SERIES, INK, APPT_STATUS_COLOR } from "@/components/dashboard/chart-kit";
import { RangeKey, RANGES, rangeBounds, bucketsFor, granularityFor, within, pct } from "@/components/dashboard/date-range";

interface Appt {
  id: number;
  date: string;
  status: string;
  type: string;
  doctorId: number;
}

interface Doctor {
  id: number;
  name: string;
}

const RANGE_LABEL: Record<RangeKey, string> = { "7d": "7D", "30d": "30D", "90d": "90D", "6m": "6M", "12m": "12M", all: "All" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const bucketLabel = (b: { start: string; end: string }, g: ReturnType<typeof granularityFor>) => {
  const d = new Date(`${b.start}T12:00:00`);
  if (g === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function AppointmentsAnalyticsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [range, setRange] = useState<RangeKey>("6m");
  const [appointments, setAppointments] = useState<Appt[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch("/api/appointments?limit=1000").then((r) => (r.ok ? r.json() : { data: [] })),
      apiFetch("/api/users/doctors").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([apptJson, doctorsJson]) => {
        if (cancelled) return;
        setAppointments(
          (Array.isArray(apptJson?.data) ? apptJson.data : []).map((a: any) => ({
            id: Number(a.id),
            date: a.appointment_date ? String(a.appointment_date).slice(0, 10) : "",
            status: a.status,
            type: (a.reason || "Checkup").replace(/^Rescheduled: /, ""),
            doctorId: Number(a.doctor_id || a.created_by || 0),
          })),
        );
        setDoctors(
          (Array.isArray(doctorsJson) ? doctorsJson : []).map((d: any) => ({
            id: Number(d.id),
            name: `Dr. ${d.first_name} ${d.last_name}`,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load appointment analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("userRole");
    safeStorage.removeItem("doctorId");
    safeStorage.removeItem("assignedDoctorIds");
    router.push("/login");
  };

  const bounds = useMemo(() => rangeBounds(range), [range]);
  const earliest = useMemo(
    () => appointments.reduce<string | null>((min, a) => (a.date && (!min || a.date < min) ? a.date : min), null),
    [appointments],
  );

  const inRange = useMemo(() => appointments.filter((a) => within(a.date, bounds.start, bounds.end)), [appointments, bounds]);
  const inPrevRange = useMemo(
    () => (bounds.prevStart ? appointments.filter((a) => within(a.date, bounds.prevStart, bounds.prevEnd)) : []),
    [appointments, bounds],
  );

  const doctorName = (id: number) => doctors.find((d) => d.id === id)?.name ?? `Doctor #${id}`;

  const rate = (rows: Appt[], statuses: string[]) =>
    rows.length === 0 ? 0 : (rows.filter((a) => statuses.includes(a.status)).length / rows.length) * 100;

  const completionRate = rate(inRange, ["completed"]);
  const prevCompletionRate = rate(inPrevRange, ["completed"]);
  const noShowRate = rate(inRange, ["no_show"]);
  const prevNoShowRate = rate(inPrevRange, ["no_show"]);
  const cancelRate = rate(inRange, ["cancelled"]);
  const prevCancelRate = rate(inPrevRange, ["cancelled"]);

  const granularity = granularityFor(range);
  const buckets = useMemo(() => bucketsFor(range, bounds.start, bounds.end, earliest), [range, bounds, earliest]);
  const volumeChart = buckets.map((b) => ({
    label: bucketLabel(b, granularity),
    count: inRange.filter((a) => within(a.date, b.start, b.end)).length,
  }));

  const statusCounts: Record<string, number> = {};
  inRange.forEach((a) => (statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1));
  const statusSlices = Object.entries(statusCounts).map(([status, count]) => ({
    key: status,
    label: status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    value: count,
    color: APPT_STATUS_COLOR[status] ?? SERIES[0],
  }));

  const typeCounts: Record<string, number> = {};
  inRange.forEach((a) => (typeCounts[a.type] = (typeCounts[a.type] ?? 0) + 1));
  const typeRows = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([type, count], i) => ({ key: type, label: type, value: count, color: SERIES[i % SERIES.length] }));

  const doctorCounts: Record<string, number> = {};
  inRange.forEach((a) => (doctorCounts[a.doctorId] = (doctorCounts[a.doctorId] ?? 0) + 1));
  const doctorSlices = Object.entries(doctorCounts).map(([id, count], i) => ({
    key: id,
    label: doctorName(Number(id)),
    value: count,
    color: SERIES[i % SERIES.length],
  }));

  const weekdayCounts = new Array(7).fill(0);
  inRange.forEach((a) => {
    if (a.date) weekdayCounts[new Date(`${a.date}T12:00:00`).getDay()]++;
  });
  const weekdayChart = WEEKDAYS.map((label, i) => ({ label, count: weekdayCounts[i] }));

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title="Appointments Analytics"
          subtitle="Volume, completion, and scheduling patterns"
          actions={[{ key: "back", label: "Back to Appointments", icon: <FaCalendarAlt />, href: "/admin/appointments" }]}
        />

        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          <div className="mb-6 inline-flex items-center gap-0.5 rounded-xl bg-gray-100 p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  range === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>

          {loading && appointments.length === 0 ? (
            <LoadingSpinner label="Loading appointment analytics" />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Kpi icon={<FaCalendarAlt />} label="Appointments" value={inRange.length.toLocaleString()} delta={pct(inRange.length, inPrevRange.length)} />
                <Kpi icon={<FaCheckCircle />} label="Completion rate" value={`${Math.round(completionRate)}%`} tone="good" delta={pct(completionRate, prevCompletionRate)} />
                <Kpi icon={<FaUserSlash />} label="No-show rate" value={`${Math.round(noShowRate)}%`} tone={noShowRate > 10 ? "warn" : "neutral"} delta={pct(noShowRate, prevNoShowRate)} />
                <Kpi icon={<FaBan />} label="Cancellation rate" value={`${Math.round(cancelRate)}%`} tone={cancelRate > 10 ? "bad" : "neutral"} delta={pct(cancelRate, prevCancelRate)} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
                <Card title="Volume over time" subtitle={`${inRange.length} appointments`} className="lg:col-span-2">
                  {volumeChart.every((b) => b.count === 0) ? (
                    <p className="flex h-64 items-center justify-center text-sm text-gray-400">No appointments in this period.</p>
                  ) : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={volumeChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={INK.grid} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Appointments" fill={SERIES[0]} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                <Card title="By status">
                  <Donut
                    slices={statusSlices}
                    selected={selectedStatus}
                    onSelect={(key) => setSelectedStatus((prev) => (prev === key ? null : key))}
                    emptyLabel="No appointments in this period."
                    hint="total"
                  />
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <Card title="By type">
                  <HBars
                    rows={typeRows}
                    selected={selectedType}
                    onSelect={(key) => setSelectedType((prev) => (prev === key ? null : key))}
                    emptyLabel="No appointments in this period."
                  />
                </Card>

                <Card title="By doctor">
                  <Donut
                    slices={doctorSlices}
                    selected={selectedDoctor}
                    onSelect={(key) => setSelectedDoctor((prev) => (prev === key ? null : key))}
                    emptyLabel="No appointments in this period."
                    hint="total"
                  />
                </Card>

                <Card title="Busiest weekday">
                  {weekdayChart.every((d) => d.count === 0) ? (
                    <p className="flex h-44 items-center justify-center text-sm text-gray-400">No appointments in this period.</p>
                  ) : (
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weekdayChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={INK.grid} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Appointments" fill={SERIES[2]} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
