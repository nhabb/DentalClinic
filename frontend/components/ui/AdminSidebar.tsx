"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import {
  FaTooth,
  FaChartLine,
  FaCalendarAlt,
  FaBoxes,
  FaUsers,
  FaMoneyBillWave,
  FaFileInvoiceDollar,
  FaBars,
  FaEllipsisH,
} from "react-icons/fa";
import { cn } from "@/lib/utils";

type ActivePage =
  | "dashboard"
  | "appointments"
  | "inventory"
  | "patients"
  | "notifications"
  | "expenses"
  | "billing";

type Props = {
  activePage: ActivePage;
  sidebarOpen: boolean;
  onToggle: () => void;
  onLogout: () => void;
  /** Caption under the wordmark, e.g. "Doctor panel". Defaults to "Admin panel". */
  subtitle?: string;
  /** Attention counts per section, e.g. `{ inventory: 3 }` for low stock. */
  badges?: Partial<Record<ActivePage, number>>;
};

const navItems = [
  { id: "dashboard",    href: "/admin",              icon: FaChartLine,         labelKey: "nav.dashboard"    },
  { id: "appointments", href: "/admin/appointments", icon: FaCalendarAlt,       labelKey: "nav.appointments" },
  { id: "inventory",    href: "/admin/inventory",    icon: FaBoxes,             labelKey: "nav.inventory"    },
  { id: "patients",     href: "/admin/patients",     icon: FaUsers,             labelKey: "nav.patients"     },
  { id: "expenses",     href: "/admin/expenses",     icon: FaMoneyBillWave,     labelKey: "nav.expenses"     },
  { id: "billing",      href: "/admin/billing",      icon: FaFileInvoiceDollar, labelKey: "nav.billing"      },
] as const;

const BAR_IDS: readonly ActivePage[] = ["dashboard", "appointments", "patients", "billing"];

/* Every admin page mounts its own <AdminSidebar>, so navigating between
 * pages remounts it too — without this, the nav items would re-stagger on
 * every click. A module-level flag survives client-side navigation (the JS
 * module stays loaded) but resets on an actual page reload, so the entrance
 * plays once per visit rather than once per route change. */
let sidebarHasAnimated = false;

export default function AdminSidebar({
  activePage,
  sidebarOpen,
  onToggle,
  subtitle,
  badges,
}: Props) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [playEntrance] = useState(() => !sidebarHasAnimated);

  useEffect(() => {
    sidebarHasAnimated = true;
  }, []);

  const badgeFor = (id: ActivePage) => {
    const n = badges?.[id];
    return n && n > 0 ? n : undefined;
  };

  /* The phone bar holds four destinations plus "More"; five is the most
   * that stays tappable at 360px. The rest move into the sheet. */
  const barItems = navItems.filter((i) => BAR_IDS.includes(i.id));
  const sheetItems = navItems.filter((i) => !BAR_IDS.includes(i.id));
  const moreInBar = sheetItems.some((i) => i.id === activePage);
  const moreBadgeTotal = sheetItems.reduce((sum, i) => sum + (badgeFor(i.id) ?? 0), 0);

  return (
    <>
      {/* ===================================================================
       * Desktop: a persistent rail that expands to labels.
       * Hidden below lg, where the bottom bar takes over.
       * =================================================================== */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 flex-col bg-white text-ink-700 lg:flex",
          "border-e border-ink-200 transition-[width] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)]",
          sidebarOpen ? "w-64" : "w-24",
        )}
      >
        {/* Logo + collapse toggle, side by side in both states. Collapsed,
         * the rail is only 96px, so the row drops its padding to px-2 and
         * the two controls sit at opposite ends via justify-between rather
         * than a gap — there isn't room for both a gap and two full-size
         * touch targets. */}
        <div
          className={cn(
            "relative flex items-center border-b border-ink-200",
            sidebarOpen ? "gap-2 p-4" : "justify-between px-2 py-4",
          )}
        >
          <Link
            href="/admin"
            className={cn(
              "group flex min-w-0 items-center gap-3 rounded-xl outline-none",
              sidebarOpen && "flex-1",
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-blue-400 to-accent-blue-600 shadow-lg shadow-accent-blue-700/20 transition-transform duration-200 group-hover:scale-105">
              <FaTooth className="text-lg text-white" />
            </span>
            {sidebarOpen && (
              <span className="min-w-0 animate-fade-in">
                <span className="block truncate font-display text-lg font-bold leading-tight text-ink-900">
                  BrightSmile
                </span>
                <span className="block truncate text-[11px] text-ink-400">
                  {subtitle ?? t("nav.adminPanel")}
                </span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={onToggle}
            className="press shrink-0 rounded-xl p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-900"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={sidebarOpen}
          >
            <FaBars />
          </button>
        </div>

        {/* Navigation */}
        <nav
          className={cn(
            "relative flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3",
            playEntrance && "stagger",
          )}
        >
          {navItems.map(({ id, href, icon: Icon, labelKey }) => {
            const isActive = activePage === id;
            const badge = badgeFor(id);
            return (
              <Link
                key={id}
                href={href}
                aria-current={isActive ? "page" : undefined}
                title={!sidebarOpen ? t(labelKey) : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-3 font-medium",
                  "transition-all duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-sm active:scale-[0.98] active:translate-y-0",
                  isActive
                    ? "bg-accent-blue-50 text-accent-blue-700"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                  !sidebarOpen && "justify-center",
                )}
              >
                {/* Active marker: a short bar on the inline edge. Reads as
                 * "you are here" even when the rail is collapsed. */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-accent-blue-500 transition-transform duration-200",
                    isActive ? "scale-y-100" : "scale-y-0",
                  )}
                />
                <span className="relative shrink-0">
                  <Icon className="text-lg" />
                  {/* Collapsed rail cannot show a number, so show a dot. */}
                  {badge && !sidebarOpen && (
                    <span className="absolute -end-1 -top-1 size-2 rounded-full bg-clay-400 ring-2 ring-white" />
                  )}
                </span>

                {sidebarOpen && <span className="min-w-0 flex-1 truncate">{t(labelKey)}</span>}
                {sidebarOpen && badge && (
                  <span className="rounded-full bg-clay-500/90 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                    {badge}
                  </span>
                )}

                {/* Tooltip for the collapsed rail. */}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ===================================================================
       * Mobile: a thumb-reachable bottom bar. An off-canvas drawer would
       * need a trigger in every page header; this needs none, and it keeps
       * the common destinations one tap away. The four busiest sections sit
       * in the bar; the rest — plus the account actions, which otherwise
       * have nowhere to live on a phone — move into the "More" sheet.
       *
       * `body:has(.admin-mobile-nav)` in globals.css reserves the space so
       * the bar never covers the last row of a list.
       * =================================================================== */}
      <nav
        aria-label={t("nav.adminPanel")}
        className="admin-mobile-nav fixed inset-x-0 bottom-0 z-40 lg:hidden"
      >
        <div className="flex items-stretch gap-0.5 border-t border-ink-200 bg-card/95 px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-4px_20px_-8px_rgb(39_36_32_/_0.18)] backdrop-blur-md">
          {barItems.map(({ id, href, icon: Icon, labelKey }) => {
            const isActive = activePage === id;
            const badge = badgeFor(id);
            return (
              <Link
                key={id}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "press relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 pb-1.5 pt-2",
                  isActive ? "text-accent-blue-700" : "text-ink-500",
                )}
              >
                <span className="relative">
                  <Icon className="text-[17px]" />
                  {badge && (
                    <span className="absolute -end-1.5 -top-1 min-w-[15px] rounded-full bg-clay-600 px-1 text-[9px] font-bold leading-[15px] text-white tabular-nums">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center text-[10px] font-semibold leading-tight">
                  {t(labelKey)}
                </span>
                {isActive && (
                  <span aria-hidden className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-accent-blue-500" />
                )}
              </Link>
            );
          })}

          {/* More */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={cn(
              "press relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 pb-1.5 pt-2",
              moreInBar ? "text-accent-blue-700" : "text-ink-500",
            )}
          >
            <span className="relative">
              <FaEllipsisH className="text-[17px]" />
              {moreBadgeTotal > 0 && (
                <span className="absolute -end-1.5 -top-1 min-w-[15px] rounded-full bg-clay-600 px-1 text-[9px] font-bold leading-[15px] text-white tabular-nums">
                  {moreBadgeTotal > 9 ? "9+" : moreBadgeTotal}
                </span>
              )}
            </span>
            <span className="w-full truncate text-center text-[10px] font-semibold leading-tight">
              {t("common.more")}
            </span>
            {moreInBar && (
              <span aria-hidden className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-accent-blue-500" />
            )}
          </button>
        </div>
      </nav>

      {/* "More" bottom sheet */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-ink-950/45 backdrop-blur-sm animate-fade-in lg:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMoreOpen(false);
          }}
        >
          <div
            role="menu"
            aria-label={t("common.more")}
            className="w-full rounded-t-3xl bg-card p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl animate-fade-up"
          >
            <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-300" />

            <div className="space-y-0.5">
              {sheetItems.map(({ id, href, icon: Icon, labelKey }) => {
                const isActive = activePage === id;
                const badge = badgeFor(id);
                return (
                  <Link
                    key={id}
                    href={href}
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "press flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold",
                      isActive ? "bg-accent-blue-50 text-accent-blue-700" : "text-ink-700 hover:bg-ink-50",
                    )}
                  >
                    <Icon className="shrink-0 text-base text-ink-400" />
                    <span className="min-w-0 flex-1 truncate">{t(labelKey)}</span>
                    {badge && (
                      <span className="rounded-full bg-clay-100 px-2 py-0.5 text-[11px] font-bold text-clay-700 tabular-nums">
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
