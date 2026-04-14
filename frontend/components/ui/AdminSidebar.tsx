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
  FaKey,
  FaTimes,
} from "react-icons/fa";
import { Avatar } from "@/components/ui/Avatar";
import { getStoredPhoto } from "@/lib/profilePhoto";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

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

  // Change password modal state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Password updated successfully.");
        setShowChangePassword(false);
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      toast.error("Failed to update password.");
    } finally {
      setChangingPassword(false);
    }
  };

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

      {/* Change Password */}
      <div className="px-4 pb-2 border-t border-gray-700">
        <button
          onClick={() => setShowChangePassword(true)}
          className="w-full flex items-center space-x-3 px-4 py-3 text-gray-400 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
        >
          <FaKey className="text-lg" />
          {sidebarOpen && <span className="font-medium text-sm">Change Password</span>}
        </button>
      </div>

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

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Change Password</h2>
              <button
                onClick={() => { setShowChangePassword(false); setNewPassword(""); setConfirmPassword(""); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <FaTimes className="text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue text-gray-900"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowChangePassword(false); setNewPassword(""); setConfirmPassword(""); }}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={changingPassword}
                className="flex-1 px-4 py-3 bg-dental-blue text-white rounded-xl text-sm font-medium hover:bg-dental-blue/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {changingPassword && (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                {changingPassword ? "Saving…" : "Save Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
