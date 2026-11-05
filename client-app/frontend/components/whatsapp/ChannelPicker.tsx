"use client";

import { FaEnvelope, FaWhatsapp } from "react-icons/fa";
import { cn } from "@/lib/utils";
import type { Channels } from "@/lib/api/whatsapp";

/*
 * How a reminder goes out: by WhatsApp, by email, or both. Two toggles that
 * can never both be off (a reminder with no channel is just switched off).
 */

export const CHANNEL_WORDS: Record<Channels, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  both: "WhatsApp and email",
};

export function ChannelPicker({ value, onChange, disabled, size = "sm" }: { value: Channels; onChange: (next: Channels) => void; disabled?: boolean; size?: "sm" | "md" }) {
  const wa = value === "whatsapp" || value === "both";
  const em = value === "email" || value === "both";
  const set = (nextWa: boolean, nextEm: boolean) => {
    if (!nextWa && !nextEm) return;
    onChange(nextWa && nextEm ? "both" : nextWa ? "whatsapp" : "email");
  };
  const chip = (on: boolean, label: string, icon: React.ReactNode, toggle: () => void, title: string) => (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={on}
      title={title}
      className={cn(
        "press inline-flex items-center gap-1 rounded-full border font-medium transition",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        on ? "border-leaf-500 bg-leaf-50 text-leaf-800" : "border-ink-200 bg-card text-ink-500",
        disabled && "opacity-60",
      )}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-1" role="group" aria-label="Channels">
      {chip(wa, "WhatsApp", <FaWhatsapp aria-hidden />, () => set(!wa, em), wa ? "Sent by WhatsApp; click to stop" : "Click to also send by WhatsApp")}
      {chip(em, "Email", <FaEnvelope aria-hidden />, () => set(wa, !em), em ? "Sent by email; click to stop" : "Click to also send by email")}
    </span>
  );
}
