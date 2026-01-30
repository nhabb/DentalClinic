"use client";

import Link from "next/link";
import { useState } from "react";
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
} from "react-icons/fa";

export default function PatientDashboard() {
  const router = useRouter();
  // TODO: Fetch from API
  const [user] = useState({
    name: "",
    email: "",
  });

  const handleLogout = () => {
    localStorage.removeItem("patientAuth");
    localStorage.removeItem("patientUser");
    router.push("/login");
  };

  // TODO: Fetch from API
  const upcomingAppointments: {
    id: number;
    date: string;
    time: string;
    type: string;
    doctor: string;
  }[] = [];

  // TODO: Fetch from API
  const recentVisits: {
    id: number;
    date: string;
    type: string;
    doctor: string;
    notes: string;
  }[] = [];

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
              <span className="text-xl font-bold text-gray-900">
                BrightSmile
              </span>
            </Link>

            {/* User Info */}
            <div className="flex items-center space-x-4">
              <Link
                href="/notifications"
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FaBell className="text-xl" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </Link>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-r from-dental-blue to-dental-teal rounded-full flex items-center justify-center text-white font-semibold">
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="text-gray-600 hover:text-gray-900"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {user.name.split(" ")[0]}!
          </h1>
          <p className="text-gray-600">
            Here's an overview of your dental health journey
          </p>
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
                <Button
                  size="sm"
                  className="gradient-auth-card hover:shadow-lg transition-all"
                >
                  Book New
                </Button>
              </Link>
            </div>
            <div className="space-y-4">
              {upcomingAppointments.length > 0 ? (
                upcomingAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="border-2 border-dental-blue/20 rounded-lg p-4 hover:border-dental-blue/40 transition-all"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {appointment.type}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {appointment.doctor}
                        </p>
                      </div>
                      <span className="bg-dental-blue/10 text-dental-blue text-xs font-medium px-3 py-1 rounded-full">
                        Confirmed
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-700">
                      <span className="flex items-center gap-1">
                        <FaCalendarAlt className="text-dental-blue" />
                        {new Date(appointment.date).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <FaClock className="text-dental-blue" />
                        {appointment.time}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">
                  No upcoming appointments
                </p>
              )}
            </div>
          </div>

          {/* Recent Visits */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Recent Visits
              </h2>
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
            <div className="space-y-4">
              {recentVisits.length > 0 ? (
                recentVisits.map((visit) => (
                  <div
                    key={visit.id}
                    className="border-2 border-gray-200 rounded-lg p-4 hover:border-dental-blue/40 transition-all"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {visit.type}
                        </h3>
                        <p className="text-sm text-gray-600">{visit.doctor}</p>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(visit.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">{visit.notes}</p>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">
                  No recent visits
                </p>
              )}
            </div>
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
