"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { Plus, Download, Upload, FileSpreadsheet, FileJson, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useImportExport, type Row } from "@/components/ui/useImportExport";

export type HeaderActionTone = "primary" | "teal" | "blue" | "neutral";

export interface HeaderAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  /** Navigate instead of calling onClick. */
  href?: string;
  tone?: HeaderActionTone;
}

interface HeaderSpeedDialProps {
  /** Primary "add" action, shown first and emphasised. */
  primary?: HeaderAction;
  /** Page-specific actions. */
  actions?: HeaderAction[];
  /** When all three are provided, Export / Import rows are shown. */
  data?: Row[];
  filename?: string;
  onImport?: (rows: Row[]) => void | Promise<void>;
}

const LANGUAGES = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "ar", label: "العربية", flag: "🇱🇧" },
] as const;

const TONE: Record<HeaderActionTone, string> = {
  primary: "bg-dental-blue text-white group-hover:bg-dental-blue/90 shadow-dental-blue/30",
  teal: "bg-teal-600 text-white group-hover:bg-teal-700 shadow-teal-600/30",
  blue: "bg-blue-600 text-white group-hover:bg-blue-700 shadow-blue-600/30",
  neutral: "bg-white text-gray-700 group-hover:bg-gray-100 ring-1 ring-gray-200 shadow-gray-300/40",
};

const ROUND =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-md transition-all duration-200 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-dental-blue/40 focus-visible:ring-offset-2";

type RoundIconProps = { tone?: HeaderActionTone; className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>;

function RoundIcon({ tone = "neutral", className, children, ...rest }: RoundIconProps) {
  return (
    <button type="button" className={cn("group", ROUND, TONE[tone], "hover:scale-105 active:scale-95", className)} {...rest}>
      {children}
    </button>
  );
}

function Row({ index, children, className }: { index: number; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("flex items-center justify-between gap-3 rounded-2xl px-3 py-2 animate-in fade-in slide-in-from-top-1 duration-200", className)}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: "backwards" }}
    >
      {children}
    </div>
  );
}

function ActionRow({ action, index, onDone }: { action: HeaderAction; index: number; onDone: () => void }) {
  const tone = action.tone ?? "neutral";
  const inner = (
    <>
      <span className={cn("text-sm font-medium", tone === "primary" ? "text-gray-900" : "text-gray-700")}>{action.label}</span>
      <span className={cn(ROUND, TONE[tone], "group-hover:scale-105 group-active:scale-95 [&>svg]:h-4 [&>svg]:w-4")}>{action.icon}</span>
    </>
  );
  const rowClass =
    "group flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left rtl:text-right cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50";
  return (
    <Row index={index} className="p-0">
      {action.href ? (
        <Link href={action.href} onClick={onDone} className={rowClass} role="menuitem">
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={() => { action.onClick?.(); onDone(); }} className={rowClass} role="menuitem">
          {inner}
        </button>
      )}
    </Row>
  );
}

export default function HeaderSpeedDial({ primary, actions = [], data, filename, onImport }: HeaderSpeedDialProps) {
  const { t, language, setLanguage } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const hasIo = data !== undefined && !!filename && !!onImport;
  const io = useImportExport({ data: data ?? [], filename: filename ?? "export", onImport: onImport ?? (() => {}) });

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  let i = 0;

  return (
    <div ref={rootRef} className="relative">
      {hasIo && io.inputs}

      {/* Main round toggle */}
      <button
        type="button"
        aria-label={t("common.quickActions")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-12 w-12 items-center justify-center rounded-full bg-dental-blue text-white shadow-lg shadow-dental-blue/30",
          "transition-all duration-300 hover:bg-dental-blue/90 hover:scale-105 active:scale-95",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-dental-blue/40 focus-visible:ring-offset-2",
          open && "rotate-45 ring-4 ring-dental-blue/20",
        )}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {/* Expanded panel */}
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-3 w-72 origin-top-right rtl:origin-top-left rounded-3xl bg-white/95 p-2 shadow-2xl ring-1 ring-black/5 backdrop-blur animate-in fade-in zoom-in-95 duration-200"
        >
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t("common.quickActions")}</p>

          {primary && <ActionRow action={{ ...primary, tone: primary.tone ?? "primary" }} index={i++} onDone={close} />}
          {actions.map((a) => (
            <ActionRow key={a.key} action={a} index={i++} onDone={close} />
          ))}

          {hasIo && (
            <>
              <div className="mx-3 my-1 border-t border-gray-100" />
              <Row index={i++}>
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Download className="h-4 w-4 text-gray-400" /> {t("common.export")}
                </span>
                <span className="flex items-center gap-2">
                  <RoundIcon title="Excel (.xlsx)" aria-label="Export Excel" className="h-9 w-9 text-green-600" onClick={() => { io.exportExcel(); close(); }}>
                    <FileSpreadsheet className="h-4 w-4" />
                  </RoundIcon>
                  <RoundIcon title="JSON (.json)" aria-label="Export JSON" className="h-9 w-9 text-blue-600" onClick={() => { io.exportJson(); close(); }}>
                    <FileJson className="h-4 w-4" />
                  </RoundIcon>
                </span>
              </Row>
              <Row index={i++}>
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Upload className="h-4 w-4 text-gray-400" /> {t("common.import")}
                </span>
                <span className="flex items-center gap-2">
                  <RoundIcon title="Excel (.xlsx)" aria-label="Import Excel" className="h-9 w-9 text-green-600" onClick={() => { io.importExcel(); close(); }}>
                    <FileSpreadsheet className="h-4 w-4" />
                  </RoundIcon>
                  <RoundIcon title="JSON (.json)" aria-label="Import JSON" className="h-9 w-9 text-blue-600" onClick={() => { io.importJson(); close(); }}>
                    <FileJson className="h-4 w-4" />
                  </RoundIcon>
                </span>
              </Row>
            </>
          )}

          <div className="mx-3 my-1 border-t border-gray-100" />
          <Row index={i++}>
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Languages className="h-4 w-4 text-gray-400" /> {t("common.language")}
            </span>
            <span className="flex items-center gap-2">
              {LANGUAGES.map((l) => {
                const active = l.value === language;
                return (
                  <RoundIcon
                    key={l.value}
                    title={l.label}
                    aria-label={l.label}
                    aria-pressed={active}
                    className={cn("h-9 w-9 text-lg leading-none", active && "ring-2 ring-dental-blue ring-offset-2 bg-dental-blue/10")}
                    onClick={() => setLanguage(l.value)}
                  >
                    {l.flag}
                  </RoundIcon>
                );
              })}
            </span>
          </Row>
        </div>
      )}
    </div>
  );
}
