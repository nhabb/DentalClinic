"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaTooth, FaChartLine, FaHospital, FaUsers, FaUserShield, FaBars, FaSignOutAlt, FaPlus } from "react-icons/fa";
import { cn } from "@/lib/utils";
import type { PlatformUser } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Dashboard", icon: FaChartLine, exact: true },
  { href: "/organizations", label: "Clinics", icon: FaHospital, exact: false },
  { href: "/accounts", label: "Accounts", icon: FaUsers, exact: false },
  { href: "/admins", label: "Platform admins", icon: FaUserShield, exact: false },
] as const;

interface Props {
  open: boolean;
  onToggle: () => void;
  user: PlatformUser | null;
  onLogout: () => void;
}

/**
 * The console's rail: same geometry and colours as the clinic admin sidebar
 * (collapsible on desktop, bottom bar on phones) with the platform's three
 * destinations and a persistent "Onboard clinic" action.
 */
export function Sidebar({ open, onToggle, user, onLogout }: Props) {
  const pathname = usePathname();
  const isActive = (href: string, exact: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-e border-ink-200 bg-white text-ink-700 lg:flex",
          "transition-[width] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)]",
          open ? "w-64" : "w-24",
        )}
      >
        <div className={cn("flex items-center border-b border-ink-200", open ? "gap-2 p-4" : "justify-between px-2 py-4")}>
          <Link href="/" className={cn("group flex min-w-0 items-center gap-3 rounded-xl outline-none", open && "flex-1")}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-700/20 transition-transform duration-200 group-hover:scale-105">
              <FaTooth className="text-lg text-white" />
            </span>
            {open && (
              <span className="min-w-0 animate-fade-in">
                <span className="block truncate font-display text-lg font-bold leading-tight text-ink-900">Dental Platform</span>
                <span className="block truncate text-[11px] text-ink-400">Operator console</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={onToggle}
            className="press shrink-0 rounded-xl p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-900"
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={open}
          >
            <FaBars />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                title={!open ? label : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-3 font-medium transition-all duration-150 ease-out",
                  "hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0",
                  active ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                  !open && "justify-center",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-brand-500 transition-transform duration-200",
                    active ? "scale-y-100" : "scale-y-0",
                  )}
                />
                <Icon className="shrink-0 text-lg" />
                {open && <span className="min-w-0 flex-1 truncate">{label}</span>}
              </Link>
            );
          })}

          <Link
            href="/organizations/new"
            title={!open ? "Onboard clinic" : undefined}
            className={cn(
              "mt-3 flex items-center gap-3 rounded-xl border border-dashed border-brand-300 px-3 py-3 font-semibold text-brand-700",
              "hover:bg-brand-50",
              !open && "justify-center",
            )}
          >
            <FaPlus className="shrink-0" />
            {open && <span className="truncate">Onboard clinic</span>}
          </Link>
        </nav>

        <div className={cn("border-t border-ink-200 p-3", !open && "px-2")}>
          <div className={cn("flex items-center gap-3 rounded-xl px-2 py-2", !open && "justify-center")}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
              {initials(user)}
            </span>
            {open && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">
                  {user ? `${user.first_name} ${user.last_name}` : "—"}
                </span>
                <span className="block truncate text-[11px] text-ink-400">{user?.email ?? ""}</span>
              </span>
            )}
            <button
              type="button"
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
              className="press rounded-xl p-2 text-ink-400 hover:bg-ink-100 hover:text-brick-600"
            >
              <FaSignOutAlt />
            </button>
          </div>
        </div>
      </aside>

      {/* Phone: bottom bar with the three destinations. */}
      <nav aria-label="Console" className="admin-mobile-nav fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <div className="flex items-stretch gap-0.5 border-t border-ink-200 bg-card/95 px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-4px_20px_-8px_rgb(39_36_32_/_0.18)] backdrop-blur-md">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 pb-1.5 pt-2",
                  active ? "text-brand-700" : "text-ink-500",
                )}
              >
                <Icon className="text-[17px]" />
                <span className="w-full truncate text-center text-[10px] font-semibold leading-tight">{label}</span>
                {active && <span aria-hidden className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-brand-500" />}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={onLogout}
            className="press flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 pb-1.5 pt-2 text-ink-500"
          >
            <FaSignOutAlt className="text-[17px]" />
            <span className="text-[10px] font-semibold">Sign out</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function initials(user: PlatformUser | null): string {
  if (!user) return "?";
  return `${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`.toUpperCase() || "?";
}
