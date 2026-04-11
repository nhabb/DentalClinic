"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { safeStorage } from "@/lib/browser-compat";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { apiFetch } from '@/lib/api/client';
import { supabase } from "@/lib/supabase/client";
import {
  FaTooth,
  FaCalendarAlt,
  FaClipboardList,
  FaPills,
  FaBell,
  FaSignOutAlt,
} from "react-icons/fa";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function PatientDashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [recentVisits, setRecentVisits] = useState<any[]>([]);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const [appointmentsRes, usersRes] = await Promise.all([
          apiFetch(`/api/appointments`),
          apiFetch(`/api/users`),
        ]);
        const appointmentsData = await appointmentsRes.json();
        const users: any[] = await usersRes.json();

        const dbUser = users.find((u) => u.email === user?.email);
        const patientsRes = await apiFetch(`/api/patients`);
        const patientsData = await patientsRes.json();
        const patient = (patientsData.data || []).find((p: any) => p.user_id === dbUser?.id || p.user_id === String(dbUser?.id));

        const today = new Date().toISOString().split("T")[0];
        const all = (appointmentsData.data || []).filter((a: any) =>
          patient && (a.patient_id === patient.id || a.patient_id === String(patient.id))
        );

        const upcoming = all
          .filter((a: any) => a.appointment_date >= today && a.status !== "cancelled" && a.status !== "completed")
          .map((a: any) => {
            const doctor = users.find((u) => u.id === a.created_by || u.id === String(a.created_by));
            return {
              id: a.id,
              date: new Date(a.appointment_date).toLocaleDateString(),
              time: a.start_time ? new Date(a.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
              doctor: doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : "Doctor",
              type: a.reason || "Checkup",
              status: a.status,
            };
          });

        const recent = all
          .filter((a: any) => a.status === "completed")
          .slice(0, 3)
          .map((a: any) => {
            const doctor = users.find((u) => u.id === a.created_by || u.id === String(a.created_by));
            return {
              id: a.id,
              date: new Date(a.appointment_date).toLocaleDateString(),
              doctor: doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : "Doctor",
              type: a.reason || "Checkup",
            };
          });

        setUpcomingAppointments(upcoming);
        setRecentVisits(recent);
      } catch (e) {
        console.error("Failed to fetch appointments", e);
      }
    };
    fetchAppointments();
  }, []);

  const handleLogout = () => {
    safeStorage.removeItem("patientAuth");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("userRole");
    router.push("/login");
  };

  const quickActions = [
    {
      title: t("patientDashboard.bookAppointment"),
      description: t("patientDashboard.bookAppointmentDesc"),
      icon: <FaCalendarAlt className="text-4xl text-dental-blue" />,
      href: "/book-appointment",
    },
    {
      title: t("patientDashboard.viewRecords"),
      description: t("patientDashboard.viewRecordsDesc"),
      icon: <FaClipboardList className="text-4xl text-dental-blue" />,
      href: "/medical-records",
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
                <FaTooth className="text-white text-xl" />
              </div>
              <span className="text-xl font-bold text-gray-900">BrightSmile</span>
            </Link>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              {/* Avatar */}
              <div className="w-10 h-10 bg-gradient-to-r from-dental-blue to-dental-teal rounded-full flex items-center justify-center text-white font-semibold text-sm">
                P
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                <FaSignOutAlt />
                <span className="hidden sm:inline">{t("common.logout")}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            {t("patientDashboard.welcomeBack")}
          </h1>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href} className="block group">
              <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] border-2 border-transparent hover:border-dental-blue/20">
                <div className="mb-3">{action.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-dental-blue transition-colors">
                  {action.title}
                </h3>
                <p className="text-sm text-gray-600">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upcoming Appointments */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {t("patientDashboard.upcomingAppointments")}
              </h2>
              <Link href="/book-appointment">
                <Button size="sm" className="gradient-auth-card hover:shadow-lg transition-all">
                  {t("patientDashboard.bookNew")}
                </Button>
              </Link>
            </div>
            {upcomingAppointments.length === 0 ? (
              <p className="text-center text-gray-500 py-8">{t("patientDashboard.noUpcomingAppointments")}</p>
            ) : (
              <ul className="space-y-3">
                {upcomingAppointments.map((appt) => (
                  <li key={appt.id} className="flex justify-between items-center border rounded-lg px-4 py-3">
                    <div>
                      <p className="font-semibold text-gray-800">{appt.type}</p>
                      <p className="text-sm text-gray-500">{appt.doctor} · {appt.date} {appt.time}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full capitalize">{appt.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Visits */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">{t("patientDashboard.recentVisits")}</h2>
              <Link href="/medical-records">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-dental-blue border-dental-blue hover:bg-dental-blue/10"
                >
                  {t("common.viewAll")}
                </Button>
              </Link>
            </div>
            {recentVisits.length === 0 ? (
              <p className="text-center text-gray-500 py-8">{t("patientDashboard.noRecentVisits")}</p>
            ) : (
              <ul className="space-y-3">
                {recentVisits.map((visit) => (
                  <li key={visit.id} className="flex justify-between items-center border rounded-lg px-4 py-3">
                    <div>
                      <p className="font-semibold text-gray-800">{visit.type}</p>
                      <p className="text-sm text-gray-500">{visit.doctor} · {visit.date}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">Completed</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Health Summary Card */}
        <div className="mt-8 bg-gradient-to-r from-dental-blue to-dental-teal rounded-xl p-6 text-white shadow-lg">
          <h2 className="text-2xl font-bold mb-4">{t("patientDashboard.dentalHealthScore")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">{t("patientDashboard.overallHealth")}</p>
              <p className="text-3xl font-bold">{t("patientDashboard.excellent")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">{t("patientDashboard.lastCheckup")}</p>
              <p className="text-3xl font-bold">{t("patientDashboard.twoMonthsAgo")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">{t("patientDashboard.nextCleaning")}</p>
              <p className="text-3xl font-bold">{t("patientDashboard.threeDays")}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
