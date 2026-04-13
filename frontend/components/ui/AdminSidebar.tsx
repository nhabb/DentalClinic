"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import {
  FaTooth,
  FaChartLine,
  FaCalendarAlt,
  FaBoxes,
  FaUsers,
  FaSignOutAlt,
  FaMoneyBillWave,
  FaCreditCard,
  FaFileInvoiceDollar,
} from "react-icons/fa";
import { Avatar } from "@/components/ui/Avatar";
import { getStoredPhoto } from "@/lib/profilePhoto";
import { supabase } from "@/lib/supabase/client";

type ActivePage = "dashboard" | "appointments" | "inventory" | "patients" | "notifications" | "expenses" | "payments" | "billing";

type Props = {
  activePage: ActivePage;
  sidebarOpen: boolean;
  onLogout: () => void;
};

const navItems = [
  { id: "dashboard",     href: "/admin",                icon: FaChartLine,      labelKey: "nav.dashboard"     },
  { id: "appointments",  href: "/admin/appointments",   icon: FaCalendarAlt,    labelKey: "nav.appointments"  },
  { id: "inventory",     href: "/admin/inventory",      icon: FaBoxes,          labelKey: "nav.inventory"     },
  { id: "patients",      href: "/admin/patients",       icon: FaUsers,          labelKey: "nav.patients"      },
  { id: "expenses",      href: "/admin/expenses",       icon: FaMoneyBillWave,  labelKey: "nav.expenses"      },
  { id: "payments",      href: "/admin/payments",       icon: FaCreditCard,     labelKey: "nav.payments"      },
  { id: "billing",       href: "/admin/billing",        icon: FaFileInvoiceDollar, labelKey: "nav.billing"    },
] as const;

export default function AdminSidebar({ activePage, sidebarOpen, onLogout }: Props) {
  const { t } = useTranslation();
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const load = async () => {
      let email: string | null = null;
      let name = "";

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) email = session.user.email;
      } catch {}

      const stored = localStorage.getItem("adminUser");
      if (stored) {
        try {
          const u = JSON.parse(stored);
          if (!email) email = u.email ?? null;
          name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
        } catch {}
      }

      if (name) setUserName(name);
      if (email) setPhotoUrl(getStoredPhoto(email));
    };
    load();
  }, []);

  return (
    <aside
      className={`${
        sidebarOpen ? "w-64" : "w-20"
      } bg-gradient-to-b from-gray-900 to-gray-800 text-white transition-all duration-300 flex flex-col sticky top-0 h-screen`}
    >
      {/* Logo */}
      <div className="p-6 border-b border-gray-700">
        <Link href="/admin" className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
            <FaTooth className="text-white text-xl" />
          </div>
          {sidebarOpen && (
            <div>
              <span className="text-lg font-bold">BrightSmile</span>
              <p className="text-xs text-gray-400">{t("nav.adminPanel")}</p>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map(({ id, href, icon: Icon, labelKey }) => {
          const isActive = activePage === id;
          return (
            <Link
              key={id}
              href={href}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                isActive
                  ? "bg-dental-blue/20 text-dental-lightblue"
                  : "text-gray-300 hover:bg-gray-700/50 hover:text-white"
              }`}
            >
              <Icon className="text-lg" />
              {sidebarOpen && <span className="font-medium">{t(labelKey)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User profile */}
      {(photoUrl || userName) && (
        <div className="px-4 py-3 border-t border-gray-700 flex items-center gap-3">
          <Avatar name={userName || "User"} size="sm" src={photoUrl} />
          {sidebarOpen && (
            <span className="text-sm text-gray-300 truncate">{userName}</span>
          )}
        </div>
      )}

      {/* Logout */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={onLogout}
          className="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors"
        >
          <FaSignOutAlt className="text-lg" />
          {sidebarOpen && <span className="font-medium">{t("common.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
