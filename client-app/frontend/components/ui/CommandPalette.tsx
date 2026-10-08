"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  FaChartLine,
  FaCalendarAlt,
  FaBoxes,
  FaUsers,
  FaMoneyBillWave,
  FaFileInvoiceDollar,
  FaPlus,
  FaSearch,
} from "react-icons/fa";

interface NavCommand {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  keywords?: string[];
}

const NAV_COMMANDS: NavCommand[] = [
  { key: "dashboard", label: "Dashboard", icon: FaChartLine, href: "/admin" },
  { key: "appointments", label: "Appointments", icon: FaCalendarAlt, href: "/admin/appointments" },
  { key: "patients", label: "Patients", icon: FaUsers, href: "/admin/patients" },
  { key: "inventory", label: "Inventory", icon: FaBoxes, href: "/admin/inventory" },
  { key: "billing", label: "Billing", icon: FaFileInvoiceDollar, href: "/admin/billing" },
  { key: "expenses", label: "Expenses", icon: FaMoneyBillWave, href: "/admin/expenses" },
];

const ACTION_COMMANDS: NavCommand[] = [
  { key: "new-appointment", label: "New appointment", icon: FaPlus, href: "/admin/appointments?new=1" },
  { key: "new-patient", label: "New patient", icon: FaPlus, href: "/admin/patients?new=1" },
];

/**
 * Global Cmd/Ctrl+K app launcher, the Shopify "quick app discovery" pattern
 * translated to clinic navigation. Mounted once in app/admin/layout.tsx so
 * it's reachable from any admin page.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      shouldFilter
      loop
      overlayClassName="fixed inset-0 z-[60] bg-ink-950/45 backdrop-blur-sm animate-fade-in"
      contentClassName="fixed left-1/2 top-[14vh] z-[60] w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-ink-200/70 bg-card shadow-2xl outline-none animate-scale-in"
    >
      <div className="flex items-center gap-3 border-b border-ink-200/70 px-4 py-3">
        <FaSearch className="shrink-0 text-ink-400" />
        <Command.Input
          autoFocus
          placeholder="Search pages, patients, actions…"
          className="h-6 w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
        />
        <kbd className="hidden shrink-0 rounded-md border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[10px] font-semibold text-ink-400 sm:inline-block">
          Esc
        </kbd>
      </div>

      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="px-4 py-8 text-center text-sm text-ink-400">
          No results found.
        </Command.Empty>

        <Command.Group
          heading="Navigate"
          className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400 [&_[cmdk-group-items]]:mt-1"
        >
          {NAV_COMMANDS.map(({ key, label, icon: Icon, href }) => (
            <Command.Item
              key={key}
              value={label}
              onSelect={() => go(href)}
              className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700 data-[selected=true]:bg-accent-blue-50 data-[selected=true]:text-accent-blue-700"
            >
              <Icon className="h-4 w-4 shrink-0 text-ink-400 group-data-[selected=true]:text-accent-blue-600" />
              {label}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Separator className="my-2 h-px bg-ink-100" />

        <Command.Group
          heading="Quick actions"
          className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400 [&_[cmdk-group-items]]:mt-1"
        >
          {ACTION_COMMANDS.map(({ key, label, icon: Icon, href }) => (
            <Command.Item
              key={key}
              value={label}
              onSelect={() => go(href)}
              className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700 data-[selected=true]:bg-accent-blue-50 data-[selected=true]:text-accent-blue-700"
            >
              <Icon className="h-4 w-4 shrink-0 text-ink-400 group-data-[selected=true]:text-accent-blue-600" />
              {label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
