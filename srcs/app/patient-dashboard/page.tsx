"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  FaTooth,
  FaCalendarAlt,
  FaClipboardList,
  FaPills,
  FaCreditCard,
  FaClock,
  FaBell,
  FaHospital,
  FaSignOutAlt,
  FaChevronDown,
} from "react-icons/fa";

interface SelectedClinic {
  id: number;
  clinicName: string;
  ownerName: string;
  city: string;
  specialty: string;
}

const SPECIALTY_LABELS: Record<string, string> = {
  general:      "General Dentistry",
  orthodontics: "Orthodontics",
  pediatric:    "Pediatric Dentistry",
  cosmetic:     "Cosmetic Dentistry",
  oral_surgery: "Oral Surgery",
  periodontics: "Periodontics",
  multi:        "Multi-Specialty",
};

export default function PatientDashboard() {
  const router = useRouter();
  const [clinic, setClinic] = useState<SelectedClinic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("selectedClinic");
    if (!stored) {
      router.replace("/select-clinic");
      return;
    }
    setClinic(JSON.parse(stored));
    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("patientAuth");
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    localStorage.removeItem("selectedClinic");
    router.push("/login");
  };

  const handleChangeClinic = () => {
    localStorage.removeItem("selectedClinic");
    router.push("/select-clinic");
  };

  const quickActions = [
    {
      title: "Book Appointment",
      description: "Schedule your next dental visit",
      icon: <FaCalendarAlt className="text-4xl text-dental-blue" />,
      href: "/book-appointment",
    },
    {
      title: "View Records",
      description: "Access your medical history",
      icon: <FaClipboardList className="text-4xl text-dental-blue" />,
      href: "/medical-records",
    },
    {
      title: "Prescriptions",
      description: "View and refill prescriptions",
      icon: <FaPills className="text-4xl text-dental-blue" />,
      href: "/prescriptions",
    },
    {
      title: "Billing",
      description: "View bills and payment history",
      icon: <FaCreditCard className="text-4xl text-dental-blue" />,
      href: "/billing",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white">
        <div className="w-8 h-8 border-4 border-dental-blue/30 border-t-dental-blue rounded-full animate-spin" />
      </div>
    );
  }

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

            {/* Clinic pill + actions */}
            <div className="flex items-center gap-3">
              {/* Selected clinic chip */}
              {clinic && (
                <button
                  onClick={handleChangeClinic}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 bg-dental-blue/8 border border-dental-blue/20 rounded-xl hover:bg-dental-blue/15 transition-all text-sm"
                >
                  <FaHospital className="text-dental-blue text-xs" />
                  <span className="font-medium text-dental-blue">{clinic.clinicName}</span>
                  <FaChevronDown className="text-dental-blue text-[10px]" />
                </button>
              )}

              <Link
                href="/notifications"
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FaBell className="text-xl" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </Link>

              {/* Avatar */}
              <div className="w-10 h-10 bg-gradient-to-r from-dental-blue to-dental-teal rounded-full flex items-center justify-center text-white font-semibold text-sm">
                P
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                <FaSignOutAlt />
                <span className="hidden sm:inline">Logout</span>
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
            Welcome back!
          </h1>
          {clinic && (
            <div className="flex items-center gap-2 mt-2">
              <FaHospital className="text-dental-blue text-sm" />
              <span className="text-gray-600 text-sm">
                Your portal for{" "}
                <span className="font-semibold text-dental-blue">{clinic.clinicName}</span>
                {" "}·{" "}
                <span className="text-gray-500">{SPECIALTY_LABELS[clinic.specialty] || clinic.specialty}</span>
                {" "}·{" "}
                <span className="text-gray-500">{clinic.city}</span>
              </span>
              <button
                onClick={handleChangeClinic}
                className="text-xs text-dental-blue underline hover:no-underline ml-1"
              >
                Change clinic
              </button>
            </div>
          )}
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
                Upcoming Appointments
              </h2>
              <Link href="/book-appointment">
                <Button size="sm" className="gradient-auth-card hover:shadow-lg transition-all">
                  Book New
                </Button>
              </Link>
            </div>
            <p className="text-center text-gray-500 py-8">No upcoming appointments</p>
          </div>

          {/* Recent Visits */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Recent Visits</h2>
              <Link href="/medical-records">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-dental-blue border-dental-blue hover:bg-dental-blue/10"
                >
                  View All
                </Button>
              </Link>
            </div>
            <p className="text-center text-gray-500 py-8">No recent visits</p>
          </div>
        </div>

        {/* Health Summary Card */}
        <div className="mt-8 bg-gradient-to-r from-dental-blue to-dental-teal rounded-xl p-6 text-white shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Your Dental Health Score</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">Overall Health</p>
              <p className="text-3xl font-bold">Excellent</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">Last Checkup</p>
              <p className="text-3xl font-bold">2 months ago</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">Next Cleaning</p>
              <p className="text-3xl font-bold">3 days</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
