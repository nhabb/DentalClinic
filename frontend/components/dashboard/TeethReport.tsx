"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { FaTooth, FaTimes, FaUserFriends, FaCalendarAlt } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { ToothState } from "@/components/dental/ToothChart";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const ToothModel3D = dynamic(() => import("@/components/dental/ToothModel3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] items-center justify-center rounded-xl bg-slate-100">
      <LoadingSpinner />
    </div>
  ),
});

/* ──────────────────────────────────────────────────────────────────────────
 * Aggregated per-tooth report across every patient's dental records.
 * Hover a tooth for a transient report, click to pin it.
 * ────────────────────────────────────────────────────────────────────────── */
export interface RecordRow {
  id: number;
  date: string;
  tooth: string;
  procedure: string;
  status: "completed" | "planned" | "missing";
  patientId: number;
  patientName: string;
  doctorId: number;
}

interface ToothAgg {
  fdi: string;
  completed: number;
  planned: number;
  missing: number;
  procedures: Record<string, number>;
  patients: Map<number, string>;
  lastDate: string;
}

const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"] as const;

function toothName(fdi: string, t: (k: string) => string) {
  const q = Number(fdi[0]);
  const pos = Number(fdi[1]);
  const quadrant =
    q === 1 ? t("adminDashboard.upperRight") : q === 2 ? t("adminDashboard.upperLeft") : q === 3 ? t("adminDashboard.lowerLeft") : t("adminDashboard.lowerRight");
  const name =
    pos === 1 ? t("adminDashboard.toothCentralIncisor") : pos === 2 ? t("adminDashboard.toothLateralIncisor") : pos === 3 ? t("adminDashboard.toothCanine")
    : pos === 4 ? t("adminDashboard.toothFirstPremolar") : pos === 5 ? t("adminDashboard.toothSecondPremolar") : pos === 6 ? t("adminDashboard.toothFirstMolar")
    : pos === 7 ? t("adminDashboard.toothSecondMolar") : t("adminDashboard.toothThirdMolar");
  return `${quadrant} · ${name}`;
}

export default function TeethReport({ records }: { records: RecordRow[] }) {
  const { t, language } = useTranslation();
  const locale = language === "ar" ? "ar-LB" : language === "fr" ? "fr-FR" : "en-US";
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  // Hover is a *preview*: it only switches the panel once the pointer has rested
  // on a tooth, never while the model is being dragged, and a pinned tooth wins.
  const hoverTimer = useRef<number | null>(null);
  const dragging = useRef(false);
  const settleHover = useCallback((fdi: string | null, delay: number) => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHovered(fdi), delay);
  }, []);
  const onHover = useCallback((fdi: string | null) => {
    if (dragging.current) return;
    settleHover(fdi, fdi ? 250 : 150);
  }, [settleHover]);
  const clearHover = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setHovered(null);
  }, []);
  // A hovered list row unmounts when the panel switches to a pinned tooth, so its
  // mouse-leave never fires; reset the transient hover whenever the pin changes.
  const pin = useCallback((fdi: string | null) => { setPinned(fdi); clearHover(); }, [clearHover]);

  /* Easy filters: what kind of work to show, and which procedure */
  const [statusFilter, setStatusFilter] = useState<"all" | "treated" | "planned" | "missing">("all");
  const [procFilter, setProcFilter] = useState<string | null>(null);
  const procedureOptions = useMemo(() => {
    const c: Record<string, number> = {};
    records.forEach((r) => { if (r.tooth && r.status !== "missing") c[r.procedure] = (c[r.procedure] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p, n]) => ({ name: p, count: n }));
  }, [records]);
  const visible = useMemo(
    () =>
      records.filter(
        (r) =>
          (procFilter === null || r.procedure === procFilter) &&
          (statusFilter === "all" || (statusFilter === "treated" ? r.status === "completed" : r.status === statusFilter)),
      ),
    [records, statusFilter, procFilter],
  );

  const agg = useMemo(() => {
    const byTooth: Record<string, ToothAgg> = {};
    const procedures: Record<string, number> = {};
    for (const r of visible) {
      if (!r.tooth) continue;
      const a = (byTooth[r.tooth] ??= { fdi: r.tooth, completed: 0, planned: 0, missing: 0, procedures: {}, patients: new Map(), lastDate: "" });
      a[r.status] += 1;
      if (r.status !== "missing") {
        a.procedures[r.procedure] = (a.procedures[r.procedure] || 0) + 1;
        procedures[r.procedure] = (procedures[r.procedure] || 0) + 1;
      }
      a.patients.set(r.patientId, r.patientName);
      if (r.date > a.lastDate) a.lastDate = r.date;
    }
    const teeth: Record<string, ToothState> = {};
    for (const a of Object.values(byTooth)) {
      const total = a.completed + a.planned;
      teeth[a.fdi] = {
        status: a.completed > 0 ? "treated" : a.planned > 0 ? "planned" : "missing",
        label: `${total} ${t("adminDashboard.treatmentsWord")} · ${a.patients.size} ${t("adminDashboard.patientsWord")}`,
        treatments: Object.entries(a.procedures)
          .sort((x, y) => y[1] - x[1])
          .slice(0, 6)
          .map(([p, n]) => ({ procedure: n > 1 ? `${p} ×${n}` : p, status: "completed" as const })),
      };
    }
    const ranked = Object.values(byTooth)
      .map((a) => ({ ...a, total: a.completed + a.planned }))
      .sort((x, y) => y.total - x.total || x.fdi.localeCompare(y.fdi));
    const procColor: Record<string, string> = {};
    Object.entries(procedures).sort((x, y) => y[1] - x[1]).forEach(([p], i) => (procColor[p] = SERIES[Math.min(i, SERIES.length - 1)]));
    return { byTooth, teeth, ranked, procedures, procColor, totalTreatments: ranked.reduce((s, a) => s + a.total, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, language]);

  const focus = pinned ?? hovered;
  const current = focus ? agg.byTooth[focus] : undefined;
  const fmtDate = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—");
  const maxProc = Math.max(1, ...Object.values(current?.procedures ?? agg.procedures));

  const Bars = ({ rows }: { rows: [string, number][] }) => (
    <ul className="space-y-1.5">
      {rows.map(([name, n]) => (
        <li key={name}>
          <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-gray-700">{name}</span>
            <span className="tabular-nums font-medium text-gray-900">{n}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full" style={{ width: `${(n / maxProc) * 100}%`, background: agg.procColor[name] ?? "#b5b4ae" }} />
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t("adminDashboard.teethReport")}</h3>
          <p className="text-xs text-gray-500">{t("adminDashboard.teethHint")}</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#60a5fa" }} />{t("dentalChart.treated")}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#fbbf24" }} />{t("dentalChart.planned")}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#cbd5e1" }} />{t("dentalChart.missing")}</span>
        </div>
      </header>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-xl bg-gray-100/80 p-1" role="group" aria-label={t("adminDashboard.show")}>
          {(
            [
              { v: "all", label: t("adminDashboard.allWork") },
              { v: "treated", label: t("dentalChart.treated"), dot: "#60a5fa" },
              { v: "planned", label: t("dentalChart.planned"), dot: "#fbbf24" },
              { v: "missing", label: t("dentalChart.missing"), dot: "#cbd5e1" },
            ] as const
          ).map((o) => {
            const active = statusFilter === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setStatusFilter(o.v)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-all",
                  active ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-900",
                )}
              >
                {"dot" in o && <span className="h-2 w-2 rounded-full" style={{ background: o.dot }} />}
                {o.label}
              </button>
            );
          })}
        </div>
        {procedureOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t("adminDashboard.procedure")}</span>
            {[{ name: null as string | null, count: 0 }, ...procedureOptions].map((p) => {
              const active = procFilter === p.name;
              return (
                <button
                  key={p.name ?? "__all"}
                  type="button"
                  onClick={() => setProcFilter(p.name)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-all",
                    active ? "border-brand/30 bg-brand/10 text-brand" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900",
                  )}
                >
                  {p.name === null ? t("adminDashboard.allProcedures") : p.name}
                  {p.name !== null && <span className={cn("rounded-full px-1.5 py-px text-[11px] leading-4 tabular-nums", active ? "bg-brand/15 text-brand" : "bg-gray-100 text-gray-500")}>{p.count}</span>}
                </button>
              );
            })}
          </div>
        )}
        <label className="ms-auto flex items-center gap-2 text-xs text-gray-500">
          <FaTooth className="text-gray-300" />
          <select
            value={pinned ?? ""}
            onChange={(e) => pin(e.target.value || null)}
            className="h-8 rounded-xl border border-gray-200 bg-white px-2 text-sm text-gray-700 shadow-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
          >
            <option value="">{t("adminDashboard.allTeeth")}</option>
            {agg.ranked.map((a) => (
              <option key={a.fdi} value={a.fdi}>{a.fdi} · {toothName(a.fdi, t)} ({a.total})</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div
          className="rounded-xl bg-slate-50 p-2"
          onPointerDown={() => { dragging.current = true; clearHover(); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
          onMouseLeave={() => { dragging.current = false; clearHover(); }}
        >
          <ToothModel3D
            teeth={agg.teeth}
            selected={pinned ? [pinned] : []}
            onToggle={(fdi) => pin(pinned === fdi ? null : fdi)}
            onHover={onHover}
            height={380}
            labels={{
              healthy: t("dentalChart.healthy"),
              treated: t("dentalChart.treated"),
              planned: t("dentalChart.planned"),
              missing: t("dentalChart.missing"),
              selected: t("dentalChart.selected"),
              front: t("dentalChart.viewFront"),
              upper: t("dentalChart.viewUpper"),
              lower: t("dentalChart.viewLower"),
              hint: t("dentalChart.dragHint"),
              credit: t("dentalChart.modelCredit"),
            }}
          />
        </div>

        {/* Report panel */}
        {/* Fixed height = viewer height, so hovering never reflows the page */}
        <aside className="flex h-[396px] flex-col overflow-y-auto rounded-xl border border-gray-100 p-4">
          {current ? (
            <>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-400">
                    {t("dentalChart.toothCol")} {current.fdi}
                    <span className={cn("rounded-full px-1.5 py-px text-[10px] normal-case tracking-normal", pinned === current.fdi ? "bg-brand/10 text-brand" : "bg-gray-100 text-gray-500")}>
                      {pinned === current.fdi ? t("adminDashboard.pinned") : t("adminDashboard.previewClickToPin")}
                    </span>
                  </p>
                  <p className="truncate text-sm font-semibold text-gray-900">{toothName(current.fdi, t)}</p>
                </div>
                {pinned === current.fdi && (
                  <button type="button" onClick={() => pin(null)} aria-label={t("common.close")} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                    <FaTimes className="text-xs" />
                  </button>
                )}
              </div>
              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-blue-50 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-blue-700/70">{t("appointments.completed")}</p>
                  <p className="text-lg font-bold tabular-nums text-blue-700">{current.completed}</p>
                </div>
                <div className="rounded-lg bg-amber-50 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-amber-700/70">{t("dentalChart.planned")}</p>
                  <p className="text-lg font-bold tabular-nums text-amber-700">{current.planned}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">{t("adminDashboard.patientsWord")}</p>
                  <p className="text-lg font-bold tabular-nums text-gray-900">{current.patients.size}</p>
                </div>
              </div>
              {Object.keys(current.procedures).length > 0 && (
                <div className="mb-4">
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-gray-400">{t("adminDashboard.procedures")}</p>
                  <Bars rows={Object.entries(current.procedures).sort((x, y) => y[1] - x[1]).slice(0, 6)} />
                </div>
              )}
              {current.missing > 0 && <p className="mb-3 text-xs text-gray-500">{t("adminDashboard.markedMissing")}: {current.missing}</p>}
              <div className="mt-auto space-y-1.5 text-xs text-gray-500">
                <p className="flex items-center gap-2"><FaCalendarAlt className="text-gray-300" /> {t("adminDashboard.lastTreated")}: <span className="text-gray-900">{fmtDate(current.lastDate)}</span></p>
                <p className="flex items-start gap-2">
                  <FaUserFriends className="mt-0.5 text-gray-300" />
                  <span className="min-w-0 truncate text-gray-700">{Array.from(current.patients.values()).slice(0, 4).join(", ")}{current.patients.size > 4 ? ` +${current.patients.size - 4}` : ""}</span>
                </p>
              </div>
            </>
          ) : agg.ranked.length === 0 ? (
            <div className="m-auto text-center text-sm text-gray-400">
              <FaTooth className="mx-auto mb-2 text-2xl text-gray-300" />
              {t("adminDashboard.noToothData")}
            </div>
          ) : (
            <>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">{t("adminDashboard.allTeeth")}</p>
              <p className="text-2xl font-bold tabular-nums text-gray-900">{agg.totalTreatments}</p>
              <p className="mb-4 text-xs text-gray-500">{t("adminDashboard.treatmentsWord")} · {agg.ranked.length} {t("adminDashboard.teethTouched")}</p>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-gray-400">{t("adminDashboard.procedures")}</p>
              <div className="mb-4">
                <Bars rows={Object.entries(agg.procedures).sort((x, y) => y[1] - x[1]).slice(0, 5)} />
              </div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-gray-400">{t("adminDashboard.teethReport")} · {agg.ranked.length}</p>
              <ul className="space-y-1">
                {agg.ranked.map((a) => (
                  <li key={a.fdi}>
                    <button
                      type="button"
                      onClick={() => pin(a.fdi)}
                      onMouseEnter={() => setHovered(a.fdi)}
                      onMouseLeave={() => setHovered(null)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition hover:bg-gray-50 rtl:text-right"
                    >
                      <span className="w-7 shrink-0 font-bold text-brand">{a.fdi}</span>
                      <span className="min-w-0 flex-1 truncate text-gray-700">{toothName(a.fdi, t)}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {a.completed > 0 && <span className="rounded-full bg-blue-50 px-1.5 text-[10px] font-medium tabular-nums text-blue-700">{a.completed}</span>}
                        {a.planned > 0 && <span className="rounded-full bg-amber-50 px-1.5 text-[10px] font-medium tabular-nums text-amber-700">{a.planned}</span>}
                        {a.missing > 0 && <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-medium tabular-nums text-gray-500">{a.missing}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
