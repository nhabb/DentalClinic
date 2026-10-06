"use client";

// Patients analytics sub-page.
//
// Backend contract (NestJS):
//   GET /api/patients?limit=N          → { data: PatientProfile[] }
//   GET /api/appointments?limit=N      → { data: Appointment[] } (for visit counts)
//   GET /api/patient-records?limit=N   → { data: PatientRecord[] } (for procedures + TeethReport)
// No dedicated patients-analytics aggregate endpoint exists, so — same as
// the cross-cutting dashboard — this page derives everything client-side
// from the flat list payloads.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { FaUsers, FaUserCheck, FaUserPlus, FaCalendarCheck } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { safeStorage } from "@/lib/browser-compat";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Card, Kpi, Donut, HBars, ChartTooltip, SERIES, INK, STATUS } from "@/components/dashboard/chart-kit";
import { RangeKey, RANGES, rangeBounds, bucketsFor, granularityFor, within, pct } from "@/components/dashboard/date-range";
import TeethReport, { type RecordRow } from "@/components/dashboard/TeethReport";

interface PatientRow {
  id: number;
  registeredDate: string;
  active: boolean;
}

const RANGE_LABEL: Record<RangeKey, string> = { "7d": "7D", "30d": "30D", "90d": "90D", "6m": "6M", "12m": "12M", all: "All" };

const bucketLabel = (b: { start: string; end: string }, g: ReturnType<typeof granularityFor>) => {
  const d = new Date(`${b.start}T12:00:00`);
  if (g === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function PatientsAnalyticsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [range, setRange] = useState<RangeKey>("12m");
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [completedVisits, setCompletedVisits] = useState(0);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedProcedure, setSelectedProcedure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch("/api/patients?limit=1000").then((r) => (r.ok ? r.json() : { data: [] })),
      apiFetch("/api/appointments?limit=2000").then((r) => (r.ok ? r.json() : { data: [] })),
      apiFetch("/api/patient-records?limit=1000").then((r) => (r.ok ? r.json() : { data: [] })),
    ])
      .then(([patientsJson, apptJson, recordsJson]) => {
        if (cancelled) return;

        const appts: any[] = Array.isArray(apptJson?.data) ? apptJson.data : [];
        setCompletedVisits(appts.filter((a) => a.status === "completed").length);

        setPatients(
          (Array.isArray(patientsJson?.data) ? patientsJson.data : []).map((p: any) => {
            const u = p.users;
            const day = (v: any) => (typeof v === "string" ? v.slice(0, 10) : "");
            return {
              id: Number(p.id),
              registeredDate: day(u?.created_at || p.created_at),
              active: u ? u.is_active !== false : true,
            };
          }),
        );

        setRecords(
          (Array.isArray(recordsJson?.data) ? recordsJson.data : []).map((r: any) => {
            const pu = r.patient_profiles?.users;
            const day = (v: any) => (typeof v === "string" ? v.slice(0, 10) : "");
            return {
              id: Number(r.id),
              date: day(r.treatment_date || r.created_at),
              tooth: r.tooth_number ? String(r.tooth_number) : "",
              procedure: String(r.title || "—"),
              status: (r.record_type === "treatment_plan" ? "planned" : r.record_type === "missing_tooth" ? "missing" : "completed") as RecordRow["status"],
              patientId: Number(r.patient_id || r.patient_profiles?.id || 0),
              patientName: pu ? `${pu.first_name ?? ""} ${pu.last_name ?? ""}`.trim() : `#${r.patient_id}`,
              doctorId: Number(r.created_by || r.users?.id || 0),
            };
          }),
        );
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load patient analytics.");
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
    () => patients.reduce<string | null>((min, p) => (p.registeredDate && (!min || p.registeredDate < min) ? p.registeredDate : min), null),
    [patients],
  );

  const newInRange = useMemo(() => patients.filter((p) => within(p.registeredDate, bounds.start, bounds.end)), [patients, bounds]);
  const newInPrevRange = useMemo(
    () => (bounds.prevStart ? patients.filter((p) => within(p.registeredDate, bounds.prevStart, bounds.prevEnd)) : []),
    [patients, bounds],
  );

  const activeCount = patients.filter((p) => p.active).length;
  const inactiveCount = patients.length - activeCount;
  const avgVisits = patients.length > 0 ? completedVisits / patients.length : 0;

  const granularity = granularityFor(range);
  const buckets = useMemo(() => bucketsFor(range, bounds.start, bounds.end, earliest), [range, bounds, earliest]);
  const registrationChart = buckets.map((b) => ({
    label: bucketLabel(b, granularity),
    count: patients.filter((p) => within(p.registeredDate, b.start, b.end)).length,
  }));

  const statusSlices = [
    { key: "active", label: "Active", value: activeCount, color: STATUS.good },
    { key: "inactive", label: "Inactive", value: inactiveCount, color: INK.muted },
  ].filter((s) => s.value > 0);

  const recordsInRange = useMemo(() => records.filter((r) => within(r.date, bounds.start, bounds.end)), [records, bounds]);
  const procedureCounts: Record<string, number> = {};
  recordsInRange.forEach((r) => (procedureCounts[r.procedure] = (procedureCounts[r.procedure] ?? 0) + 1));
  const procedureRows = Object.entries(procedureCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([proc, count], i) => ({ key: proc, label: proc, value: count, color: SERIES[i % SERIES.length] }));

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminPageHeader
          title="Patients Analytics"
          subtitle="Growth, retention, and clinical activity"
          actions={[{ key: "back", label: "Back to Patients", icon: <FaUsers />, href: "/admin/patients" }]}
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

          {loading && patients.length === 0 ? (
            <LoadingSpinner label="Loading patient analytics" />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Kpi icon={<FaUsers />} label="Total patients" value={patients.length.toLocaleString()} />
                <Kpi icon={<FaUserCheck />} label="Active" value={`${activeCount.toLocaleString()} (${patients.length ? Math.round((activeCount / patients.length) * 100) : 0}%)`} tone="good" />
                <Kpi icon={<FaUserPlus />} label="New patients" value={newInRange.length.toLocaleString()} delta={pct(newInRange.length, newInPrevRange.length)} />
                <Kpi icon={<FaCalendarCheck />} label="Avg visits / patient" value={avgVisits.toFixed(1)} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
                <Card title="New patient registrations" subtitle={`${newInRange.length} in this period`} className="lg:col-span-2">
                  {registrationChart.every((b) => b.count === 0) ? (
                    <p className="flex h-64 items-center justify-center text-sm text-gray-400">No registrations in this period.</p>
                  ) : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={registrationChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={INK.grid} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="New patients" fill={SERIES[0]} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                <Card title="Active vs inactive">
                  <Donut
                    slices={statusSlices}
                    selected={selectedStatus}
                    onSelect={(key) => setSelectedStatus((prev) => (prev === key ? null : key))}
                    emptyLabel="No patients yet."
                    hint="total"
                  />
                </Card>
              </div>

              <Card title="Top procedures" subtitle="This period, clinic-wide" className="mb-5">
                <HBars
                  rows={procedureRows}
                  selected={selectedProcedure}
                  onSelect={(key) => setSelectedProcedure((prev) => (prev === key ? null : key))}
                  emptyLabel="No dental records in this period."
                />
              </Card>

              {/* TeethReport renders its own card chrome (header, legend, 3D
               * canvas) — it's meant to stand alone, not nest inside Card. */}
              <TeethReport records={recordsInRange} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
