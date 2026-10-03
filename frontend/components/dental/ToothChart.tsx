"use client";

// Interactive dental chart (odontogram) of the permanent dentition in FDI notation.
// Upper arch reads 18 … 11 | 21 … 28, lower arch 48 … 41 | 31 … 38, with the
// patient's right on the viewer's left, as on a standard dental chart.
//
// Pure SVG, no dependencies. The parent owns selection and per-tooth status, so
// the same data can later drive a different renderer (e.g. a 3D view).

import type { KeyboardEvent } from "react";

export type ToothStatus = "healthy" | "treated" | "planned" | "missing";

export interface ToothTreatment {
  procedure: string;
  /** YYYY-MM-DD, may be empty */
  date?: string;
  status: "completed" | "planned" | "missing";
}

export interface ToothState {
  status: ToothStatus;
  /** One-line summary shown when no treatment list is given, e.g. "Filling · 2026-10-03" */
  label?: string;
  /** Every treatment on this tooth, newest first; shown in full on hover. */
  treatments?: ToothTreatment[];
}

export const FDI_UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
export const FDI_LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

type LegendKey = ToothStatus | "selected";

interface ToothChartProps {
  teeth?: Record<string, ToothState>;
  selected?: string[];
  onToggle?: (fdi: string) => void;
  readOnly?: boolean;
  labels?: Partial<Record<LegendKey | "upper" | "lower" | "right" | "left", string>>;
  className?: string;
}

const COLORS: Record<ToothStatus, { fill: string; stroke: string; text: string }> = {
  healthy: { fill: "#ffffff", stroke: "#cbd5e1", text: "#334155" },
  treated: { fill: "#dbeafe", stroke: "#3b82f6", text: "#1e40af" },
  planned: { fill: "#fef3c7", stroke: "#f59e0b", text: "#92400e" },
  missing: { fill: "#f1f5f9", stroke: "#cbd5e1", text: "#94a3b8" },
};
const SELECTED = { fill: "#2563eb", stroke: "#1e40af", text: "#ffffff" };

// Geometry: two elliptical arches that almost meet at the molars, like a mouth
// seen from the front with the jaws slightly open.
const VIEW_W = 680;
const VIEW_H = 530;
const CX = VIEW_W / 2;
const RX = 272;
const RY = 185;
const UPPER_CY = 258;
const LOWER_CY = 304;

/** Crown footprint by tooth position within the quadrant (1 = central incisor … 8 = third molar). */
function toothSize(fdi: string): { w: number; h: number } {
  const pos = Number(fdi[1]);
  if (pos === 8) return { w: 48, h: 40 };
  if (pos >= 6) return { w: 52, h: 42 };
  if (pos >= 4) return { w: 40, h: 38 };
  if (pos === 3) return { w: 36, h: 42 };
  if (pos === 2) return { w: 30, h: 38 };
  return { w: 32, h: 40 };
}

function archSlots(count: number, upper: boolean) {
  return Array.from({ length: count }, (_, i) => {
    const a = Math.PI - ((i + 0.5) * Math.PI) / count; // left → right
    const deg = (a * 180) / Math.PI;
    const x = CX + RX * Math.cos(a);
    const y = upper ? UPPER_CY - RY * Math.sin(a) : LOWER_CY + RY * Math.sin(a);
    // Rotate each crown so its long axis points at the arch centre.
    const rot = upper ? deg + 90 : 90 - deg;
    return { x, y, rot };
  });
}

const UPPER_SLOTS = archSlots(FDI_UPPER.length, true);
const LOWER_SLOTS = archSlots(FDI_LOWER.length, false);

export default function ToothChart({
  teeth = {},
  selected = [],
  onToggle,
  readOnly = false,
  labels = {},
  className = "",
}: ToothChartProps) {
  const selectedSet = new Set(selected);
  const interactive = !readOnly && typeof onToggle === "function";

  const renderTooth = (fdi: string, slot: { x: number; y: number; rot: number }) => {
    const state = teeth[fdi] ?? { status: "healthy" as ToothStatus };
    const isSelected = selectedSet.has(fdi);
    const palette = isSelected ? SELECTED : COLORS[state.status];
    const { w, h } = toothSize(fdi);
    const missing = state.status === "missing";
    const title =
      state.treatments && state.treatments.length > 0
        ? [fdi, ...state.treatments.map((tr) => [tr.procedure, tr.date].filter(Boolean).join(" · "))].join("\n")
        : [fdi, state.label].filter(Boolean).join(" · ");
    const isMolar = Number(fdi[1]) >= 6;

    const handleKey = (e: KeyboardEvent<SVGGElement>) => {
      if (!interactive) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle?.(fdi);
      }
    };

    return (
      <g
        key={fdi}
        transform={`translate(${slot.x} ${slot.y}) rotate(${slot.rot})`}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-pressed={interactive ? isSelected : undefined}
        aria-label={title}
        onClick={interactive ? () => onToggle?.(fdi) : undefined}
        onKeyDown={handleKey}
        style={{ cursor: interactive ? "pointer" : "default", outline: "none" }}
        className={interactive ? "tooth" : undefined}
      >
        <title>{title}</title>
        {/* Crown */}
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          rx={Math.min(w, h) * 0.42}
          fill={palette.fill}
          stroke={palette.stroke}
          strokeWidth={isSelected ? 3 : 1.75}
          strokeDasharray={missing && !isSelected ? "5 3" : undefined}
        />
        {/* Subtle occlusal groove on molars, for a more tooth-like look */}
        {isMolar && !missing && (
          <path
            d={`M${-w * 0.22} ${-h * 0.12} Q0 ${h * 0.02} ${w * 0.22} ${-h * 0.12}`}
            fill="none"
            stroke={isSelected ? "rgba(255,255,255,0.45)" : palette.stroke}
            strokeOpacity={isSelected ? 1 : 0.45}
            strokeWidth={1.25}
            strokeLinecap="round"
          />
        )}
        {missing && !isSelected && (
          <path
            d={`M${-w / 4} ${-h / 4} L${w / 4} ${h / 4} M${w / 4} ${-h / 4} L${-w / 4} ${h / 4}`}
            stroke="#94a3b8"
            strokeWidth={1.75}
            strokeLinecap="round"
          />
        )}
        <text
          transform={`rotate(${-slot.rot}) translate(0 ${isMolar && !missing ? 5 : 0})`}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={13}
          fontWeight={700}
          fill={palette.text}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {fdi}
        </text>
      </g>
    );
  };

  const legend: { key: LegendKey; fill: string; stroke: string }[] = [
    { key: "healthy", ...COLORS.healthy },
    { key: "treated", ...COLORS.treated },
    { key: "planned", ...COLORS.planned },
    { key: "missing", ...COLORS.missing },
    { key: "selected", ...SELECTED },
  ];

  const sideLabel = { fontSize: 12, fill: "#94a3b8", fontWeight: 600 } as const;

  return (
    <div className={className}>
      <style>{`.tooth:hover rect { filter: brightness(0.94); } .tooth:focus-visible rect { stroke: #1d4ed8; stroke-width: 3; }`}</style>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto select-none" role="group" aria-label="Dental chart">
        {/* Patient's right is on the viewer's left */}
        <text x={14} y={UPPER_CY - 6} {...sideLabel}>{labels.right ?? "R"}</text>
        <text x={VIEW_W - 14} y={UPPER_CY - 6} {...sideLabel} textAnchor="end">{labels.left ?? "L"}</text>

        {/* Midline and jaw labels */}
        <line x1={CX} y1={14} x2={CX} y2={VIEW_H - 14} stroke="#e2e8f0" strokeDasharray="4 4" />
        <text x={CX} y={UPPER_CY - 8} fontSize={12} fill="#94a3b8" textAnchor="middle" fontWeight={600}>
          {labels.upper ?? "Upper"}
        </text>
        <text x={CX} y={LOWER_CY + 16} fontSize={12} fill="#94a3b8" textAnchor="middle" fontWeight={600}>
          {labels.lower ?? "Lower"}
        </text>

        {FDI_UPPER.map((fdi, i) => renderTooth(fdi, UPPER_SLOTS[i]))}
        {FDI_LOWER.map((fdi, i) => renderTooth(fdi, LOWER_SLOTS[i]))}
      </svg>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
        {legend.map((l) => (
          <span key={l.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3.5 h-3.5 rounded-md"
              style={{ background: l.fill, border: `1.5px solid ${l.stroke}` }}
            />
            {labels[l.key] ?? l.key}
          </span>
        ))}
      </div>
    </div>
  );
}
