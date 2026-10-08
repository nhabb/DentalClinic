"use client";

// Interactive 3D dentition viewer. Same props/contract as the 2D ToothChart so
// the two can be swapped freely: the parent owns selection and per-tooth status.
//
// Model: "Permanent Dentition" by University of Dundee, School of Dentistry,
// CC BY 4.0 (see public/models/permanent-dentition/ATTRIBUTION.txt).
//
// Teeth are identified by position, not by mesh name (names in the source file
// are unreliable): jaw from the parent group ("Mandible…" = lower) with a
// height fallback, side from the sign of x (patient's left = +x), and position
// within the quadrant by ranking z (front teeth have the largest z).

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF, useCursor } from "@react-three/drei";
import * as THREE from "three";
import type { ToothState, ToothStatus } from "./ToothChart";

export const DENTITION_MODEL_URL = "/models/permanent-dentition/permanent-dentition.glb";

type ViewPreset = "front" | "upper" | "lower";

interface ToothModel3DProps {
  teeth?: Record<string, ToothState>;
  selected?: string[];
  onToggle?: (fdi: string) => void;
  readOnly?: boolean;
  labels?: Partial<Record<ToothStatus | "selected" | ViewPreset | "hint" | "credit" | "loading", string>>;
  className?: string;
  /** CSS height of the viewer, default 440px */
  height?: number | string;
  /** Fired when the pointer enters (fdi) or leaves (null) a tooth. */
  onHover?: (fdi: string | null) => void;
}

interface ToothEntry {
  fdi: string;
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
}

interface Dentition {
  entries: ToothEntry[];
  center: THREE.Vector3;
  radius: number;
}

const COLORS: Record<ToothStatus, string> = {
  healthy: "#f3eee4",
  treated: "#60a5fa",
  planned: "#fbbf24",
  missing: "#cbd5e1",
};
const SELECTED_COLOR = "#2563eb";

/** Build the FDI mapping once per loaded scene. */
function analyseDentition(scene: THREE.Object3D): Dentition {
  scene.updateMatrixWorld(true);
  type Raw = { mesh: THREE.Mesh; c: THREE.Vector3; jaw: "upper" | "lower" | null };
  const raw: Raw[] = [];
  const bounds = new THREE.Box3();

  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const count = mesh.geometry?.attributes?.position?.count ?? 0;
    if (count < 10) return; // stray helper geometry in the source file
    const box = new THREE.Box3().setFromObject(mesh);
    bounds.union(box);
    let jaw: Raw["jaw"] = null;
    for (let p = mesh.parent; p; p = p.parent) {
      if (/mandib/i.test(p.name)) { jaw = "lower"; break; }
      if (/^group2$/i.test(p.name) || /maxill/i.test(p.name)) { jaw = "upper"; break; }
    }
    raw.push({ mesh, c: box.getCenter(new THREE.Vector3()), jaw });
  });

  // Fallback when the parent groups are not named: split jaws at the median height.
  const ys = raw.map((r) => r.c.y).sort((a, b) => a - b);
  const median = ys[Math.floor(ys.length / 2)] ?? 0;
  for (const r of raw) if (!r.jaw) r.jaw = r.c.y >= median ? "upper" : "lower";

  const entries: ToothEntry[] = [];
  (["upper", "lower"] as const).forEach((jaw) => {
    (["right", "left"] as const).forEach((side) => {
      const quadrant = jaw === "upper" ? (side === "right" ? 1 : 2) : side === "left" ? 3 : 4;
      raw
        .filter((r) => r.jaw === jaw && (side === "left" ? r.c.x >= 0 : r.c.x < 0))
        .sort((a, b) => b.c.z - a.c.z) // front (incisors) first
        .forEach((r, i) => {
          entries.push({
            fdi: `${quadrant}${Math.min(i + 1, 8)}`,
            geometry: r.mesh.geometry,
            matrix: r.mesh.matrixWorld.clone(),
          });
        });
    });
  });

  const center = bounds.getCenter(new THREE.Vector3());
  const radius = bounds.getSize(new THREE.Vector3()).length() / 2 || 1;
  return { entries, center, radius };
}

function Tooth({
  entry,
  status,
  selected,
  interactive,
  onToggle,
  onHover,
}: {
  entry: ToothEntry;
  status: ToothStatus;
  selected: boolean;
  interactive: boolean;
  onToggle?: (fdi: string) => void;
  onHover: (fdi: string | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && interactive);

  const color = selected ? SELECTED_COLOR : COLORS[status];
  const missing = status === "missing" && !selected;
  const emissive = selected ? "#1d4ed8" : hovered ? "#94a3b8" : "#000000";
  const emissiveIntensity = selected ? 0.35 : hovered ? 0.25 : 0;

  const stop = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();

  return (
    <mesh
      geometry={entry.geometry}
      matrix={entry.matrix}
      matrixAutoUpdate={false}
      onClick={interactive ? (e) => { stop(e); onToggle?.(entry.fdi); } : undefined}
      onPointerOver={(e) => { stop(e); setHovered(true); onHover(entry.fdi); }}
      onPointerOut={() => { setHovered(false); onHover(null); }}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.38}
        metalness={0.02}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        transparent={missing}
        opacity={missing ? 0.18 : 1}
        depthWrite={!missing}
      />
    </mesh>
  );
}

function CameraPreset({ view, radius }: { view: ViewPreset; radius: number }) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  useEffect(() => {
    const r = radius;
    // Upper/lower presets look at the biting surfaces from below/above; the
    // opposite jaw is hidden by DentitionScene so it does not block the view.
    const pos: Record<ViewPreset, [number, number, number]> = {
      front: [0, r * 0.15, r * 1.6],
      upper: [0, -r * 2.3, r * 0.9],
      lower: [0, r * 2.3, r * 0.9],
    };
    camera.position.set(...pos[view]);
    camera.near = r * 0.05;
    camera.far = r * 20;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [view, radius, camera, controls]);
  return null;
}

function DentitionScene({
  teeth,
  selected,
  interactive,
  onToggle,
  onHover,
  view,
  onReady,
}: {
  teeth: Record<string, ToothState>;
  selected: Set<string>;
  interactive: boolean;
  onToggle?: (fdi: string) => void;
  onHover: (fdi: string | null) => void;
  view: ViewPreset;
  onReady: (radius: number) => void;
}) {
  const gltf = useGLTF(DENTITION_MODEL_URL);
  const dentition = useMemo(() => analyseDentition(gltf.scene), [gltf.scene]);
  useEffect(() => onReady(dentition.radius), [dentition.radius, onReady]);

  const visibleEntries =
    view === "front"
      ? dentition.entries
      : dentition.entries.filter((e) => (view === "upper" ? e.fdi[0] === "1" || e.fdi[0] === "2" : e.fdi[0] === "3" || e.fdi[0] === "4"));

  return (
    <>
      <CameraPreset view={view} radius={dentition.radius} />
      <group position={[-dentition.center.x, -dentition.center.y, -dentition.center.z]}>
        {visibleEntries.map((entry) => (
          <Tooth
            key={entry.fdi}
            entry={entry}
            status={teeth[entry.fdi]?.status ?? "healthy"}
            selected={selected.has(entry.fdi)}
            interactive={interactive}
            onToggle={onToggle}
            onHover={onHover}
          />
        ))}
      </group>
    </>
  );
}

export default function ToothModel3D({
  teeth = {},
  selected = [],
  onToggle,
  readOnly = false,
  labels = {},
  className = "",
  height = 440,
  onHover,
}: ToothModel3DProps) {
  const [view, setView] = useState<ViewPreset>("front");
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => { onHover?.(hovered); }, [hovered, onHover]);
  const [radius, setRadius] = useState(40);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const interactive = !readOnly && typeof onToggle === "function";

  // Click history so a right-click can undo the last select/unselect.
  // Each entry records the tooth and whether it ended up selected after the click.
  const history = useRef<{ fdi: string; selectedAfter: boolean }[]>([]);
  const selectedRef = useRef(selectedSet);
  selectedRef.current = selectedSet;

  const handleToggle = useCallback(
    (fdi: string) => {
      history.current.push({ fdi, selectedAfter: !selectedRef.current.has(fdi) });
      if (history.current.length > 100) history.current.shift();
      onToggle?.(fdi);
    },
    [onToggle],
  );

  const undoLastClick = useCallback(() => {
    if (!interactive) return;
    // Skip entries the parent has since changed (e.g. "clear selection"), so
    // undo never re-selects a tooth the user already cleared another way.
    while (history.current.length > 0) {
      const last = history.current.pop()!;
      if (selectedRef.current.has(last.fdi) === last.selectedAfter) {
        onToggle?.(last.fdi);
        return;
      }
    }
  }, [interactive, onToggle]);

  const hoveredState = hovered ? teeth[hovered] : undefined;
  const hoveredStatus: ToothStatus = hoveredState?.status ?? "healthy";
  const hoveredTreatments = hoveredState?.treatments ?? [];

  const presets: ViewPreset[] = ["front", "upper", "lower"];

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200 ${className}`}
      style={{ height }}
      onContextMenu={(e) => {
        e.preventDefault();
        undoLastClick();
      }}
      // The canvas only reports pointer-out on pointer movement, so a fast exit
      // or a scroll under a still pointer would leave the last tooth "hovered".
      onPointerLeave={() => setHovered(null)}
      onMouseLeave={() => setHovered(null)}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 30, position: [0, 10, 120], near: 1, far: 2000 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        onPointerMissed={() => setHovered(null)}
      >
        <ambientLight intensity={0.55} />
        <hemisphereLight args={["#ffffff", "#b8c4d6", 0.8]} />
        <directionalLight position={[3, 5, 6]} intensity={2.8} />
        <directionalLight position={[-4, -2, 3]} intensity={0.9} />
        <directionalLight position={[0, 3, -5]} intensity={0.7} />
        <Suspense fallback={null}>
          <DentitionScene
            teeth={teeth}
            selected={selectedSet}
            interactive={interactive}
            onToggle={handleToggle}
            onHover={setHovered}
            view={view}
            onReady={setRadius}
          />
        </Suspense>
        <OrbitControls
          makeDefault
          enablePan={false}
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY }}
          minDistance={radius * 0.8}
          maxDistance={radius * 4}
          rotateSpeed={0.7}
          zoomSpeed={0.8}
        />
      </Canvas>

      {/* View presets */}
      <div className="absolute top-3 left-3 flex gap-1 rounded-lg bg-white/90 backdrop-blur p-1 shadow-sm">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setView(p)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              view === p ? "bg-dental-blue text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {labels[p] ?? p}
          </button>
        ))}
      </div>

      {/* Hover badge */}
      <div className="absolute top-3 right-3 min-w-[120px] max-w-[260px] rounded-lg bg-white/90 backdrop-blur px-3 py-2 shadow-sm text-xs">
        {hovered ? (
          <>
            <p className="font-bold text-gray-900 text-sm">
              {hovered}
              <span className="ml-2 font-medium text-gray-500 text-xs">{labels[hoveredStatus] ?? hoveredStatus}</span>
            </p>
            {hoveredTreatments.length > 0 ? (
              <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                {hoveredTreatments.map((tr, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-gray-700">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0 border border-black/10"
                      style={{ background: COLORS[tr.status === "completed" ? "treated" : tr.status] }}
                    />
                    <span className="truncate">{tr.procedure}</span>
                    {tr.date ? <span className="ml-auto pl-2 text-gray-400 whitespace-nowrap">{tr.date}</span> : null}
                  </li>
                ))}
              </ul>
            ) : hoveredState?.label ? (
              <p className="text-gray-400">{hoveredState.label}</p>
            ) : null}
          </>
        ) : (
          <p className="text-gray-500">{labels.hint ?? "Drag to rotate · scroll to zoom · click a tooth · right-click to undo"}</p>
        )}
      </div>

      {/* Legend + credit */}
      <div className="absolute bottom-2 left-3 right-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {(["healthy", "treated", "planned", "missing"] as ToothStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm border border-black/10" style={{ background: COLORS[s] }} />
              {labels[s] ?? s}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm border border-black/10" style={{ background: SELECTED_COLOR }} />
            {labels.selected ?? "selected"}
          </span>
        </div>
        <a
          href="https://sketchfab.com/3d-models/permanent-dentition-2f69d7b59c3e4a6a8bcae041bd8e591b"
          target="_blank"
          rel="noreferrer"
          className="text-gray-400 hover:text-gray-600 underline-offset-2 hover:underline"
        >
          {labels.credit ?? "3D model: University of Dundee, School of Dentistry (CC BY 4.0)"}
        </a>
      </div>
    </div>
  );
}

useGLTF.preload(DENTITION_MODEL_URL);
