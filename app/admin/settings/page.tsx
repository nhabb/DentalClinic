"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  FaTooth,
  FaChartLine,
  FaCalendarAlt,
  FaBoxes,
  FaMoneyBillWave,
  FaUsers,
  FaCog,
  FaSignOutAlt,
  FaBars,
  FaUser,
  FaBell,
  FaLock,
  FaPalette,
  FaGlobe,
  FaEnvelope,
  FaShieldAlt,
  FaSave,
} from "react-icons/fa";

export default function AdminSettings() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();
  const [settings, setSettings] = useState({
    clinicName: "BrightSmile Dental Clinic",
    email: "contact@brightsmile.com",
    phone: "+961 1 234 567",
    address: "Hamra Street, Beirut, Lebanon",
    language: "en",
    timezone: "Asia/Beirut",
    currency: "LBP",
    emailNotifications: true,
    smsNotifications: false,
    appointmentReminders: true,
    twoFactorAuth: false,
  });

  const handleLogout = () => {
    localStorage.removeItem("adminAuth");
    localStorage.removeItem("adminUser");
    router.push("/admin/login");
  };

  const handleSave = () => {
    // Save settings logic here
    alert("Settings saved successfully!");
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } bg-gradient-to-b from-gray-900 to-gray-800 text-white transition-all duration-300 flex flex-col`}
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
                <p className="text-xs text-gray-400">Admin Panel</p>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <Link
            href="/admin"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaChartLine className="text-lg" />
            {sidebarOpen && <span className="font-medium">Dashboard</span>}
          </Link>
          <Link
            href="/admin/appointments"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaCalendarAlt className="text-lg" />
            {sidebarOpen && <span className="font-medium">Appointments</span>}
          </Link>
          <Link
            href="/admin/inventory"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaBoxes className="text-lg" />
            {sidebarOpen && <span className="font-medium">Inventory</span>}
          </Link>
          <Link
            href="/admin/transactions"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaMoneyBillWave className="text-lg" />
            {sidebarOpen && <span className="font-medium">Transactions</span>}
          </Link>
          <Link
            href="/admin/patients"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaUsers className="text-lg" />
            {sidebarOpen && <span className="font-medium">Patients</span>}
          </Link>
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-gray-700 space-y-2">
          <Link
            href="/admin/settings"
            className="flex items-center space-x-3 px-4 py-3 bg-dental-blue/20 text-dental-lightblue rounded-xl"
          >
            <FaCog className="text-lg" />
            {sidebarOpen && <span className="font-medium">Settings</span>}
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors"
          >
            <FaSignOutAlt className="text-lg" />
            {sidebarOpen && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FaBars className="text-xl text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
              <p className="text-gray-500 text-sm">
                Manage clinic and system settings
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-full flex items-center justify-center text-white font-semibold">
              SH
            </div>
          </div>
        </header>

        {/* Settings Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Clinic Information */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-dental-blue/10 rounded-lg flex items-center justify-center">
                  <FaTooth className="text-dental-blue text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Clinic Information
                  </h2>
                  <p className="text-sm text-gray-500">
                    Basic clinic details and contact information
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Clinic Name
                  </label>
                  <input
                    type="text"
                    value={settings.clinicName}
                    onChange={(e) =>
                      setSettings({ ...settings, clinicName: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dental-blue focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={settings.email}
                      onChange={(e) =>
                        setSettings({ ...settings, email: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dental-blue focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={settings.phone}
                      onChange={(e) =>
                        setSettings({ ...settings, phone: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dental-blue focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address
                  </label>
                  <textarea
                    value={settings.address}
                    onChange={(e) =>
                      setSettings({ ...settings, address: e.target.value })
                    }
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dental-blue focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Regional Settings */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-dental-teal/10 rounded-lg flex items-center justify-center">
                  <FaGlobe className="text-dental-teal text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Regional Settings
                  </h2>
                  <p className="text-sm text-gray-500">
                    Language, timezone, and currency preferences
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Language
                  </label>
                  <select
                    value={settings.language}
                    onChange={(e) =>
                      setSettings({ ...settings, language: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dental-blue focus:border-transparent"
                  >
                    <option value="en">English</option>
                    <option value="ar">Arabic</option>
                    <option value="fr">French</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Timezone
                  </label>
                  <select
                    value={settings.timezone}
                    onChange={(e) =>
                      setSettings({ ...settings, timezone: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dental-blue focus:border-transparent"
                  >
                    <option value="Asia/Beirut">Asia/Beirut (GMT+2)</option>
                    <option value="Europe/London">Europe/London (GMT+0)</option>
                    <option value="America/New_York">
                      America/New York (GMT-5)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Currency
                  </label>
                  <select
                    value={settings.currency}
                    onChange={(e) =>
                      setSettings({ ...settings, currency: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dental-blue focus:border-transparent"
                  >
                    <option value="LBP">LBP - Lebanese Pound</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Notification Settings */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-dental-purple/10 rounded-lg flex items-center justify-center">
                  <FaBell className="text-dental-purple text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Notifications
                  </h2>
                  <p className="text-sm text-gray-500">
                    Manage notification preferences
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">
                      Email Notifications
                    </p>
                    <p className="text-sm text-gray-500">
                      Receive updates via email
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.emailNotifications}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          emailNotifications: e.target.checked,
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-dental-blue/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-dental-blue"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">
                      SMS Notifications
                    </p>
                    <p className="text-sm text-gray-500">
                      Receive updates via SMS
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.smsNotifications}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          smsNotifications: e.target.checked,
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-dental-blue/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-dental-blue"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      Appointment Reminders
                    </p>
                    <p className="text-sm text-gray-500">
                      Send reminders to patients
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.appointmentReminders}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          appointmentReminders: e.target.checked,
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-dental-blue/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-dental-blue"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Security Settings */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                  <FaShieldAlt className="text-red-500 text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Security</h2>
                  <p className="text-sm text-gray-500">
                    Account security and authentication
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">
                      Two-Factor Authentication
                    </p>
                    <p className="text-sm text-gray-500">
                      Add an extra layer of security
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.twoFactorAuth}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          twoFactorAuth: e.target.checked,
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-dental-blue/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-dental-blue"></div>
                  </label>
                </div>

                <div className="py-3">
                  <Button
                    variant="outline"
                    className="w-full justify-center text-gray-700 hover:text-gray-900"
                  >
                    <FaLock className="mr-2" />
                    Change Password
                  </Button>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={() => router.push("/admin")}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="bg-dental-blue hover:bg-dental-blue/90"
              >
                <FaSave className="mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
