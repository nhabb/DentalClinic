"use client";

import Link from "next/link";
import { toast } from 'sonner';
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { safeStorage } from "@/lib/browser-compat";
import { apiFetch } from "@/lib/api/client";
import { useTranslation } from "@/lib/i18n";
import {
  FaTooth,
  FaLock,
  FaUser,
  FaEye,
  FaEyeSlash,
  FaUserMd,
  FaUserTie,
  FaExclamationCircle,
  FaEnvelope,
} from "react-icons/fa";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type StaffRole = "doctor" | "secretary";

export default function AdminLogin() {
  const router = useRouter();
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<StaffRole>("doctor");
  const [credentials, setCredentials] = useState({
    email: "",
    password: "",
  });

  // Check if already logged in
  useEffect(() => {
    const isAuthenticated = safeStorage.getItem("adminAuth") === "true";
    if (isAuthenticated) {
      router.push("/admin");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Resolve DB user id at login time so availability works without re-lookup
    try {
      const res = await apiFetch(
        `/api/users/by-email?email=${encodeURIComponent(credentials.email)}`
      );
      if (res.ok) {
        const user = await res.json();
        if (user?.id) safeStorage.setItem("doctorDbId", String(user.id));
        safeStorage.setItem("adminUser", JSON.stringify({
          email: credentials.email,
          first_name: user?.first_name || "",
          last_name: user?.last_name || "",
        }));
      }
    } catch {}

    toast.success("Logged in successfully.");
    safeStorage.setItem("adminAuth", "true");
    if (!safeStorage.getItem("adminUser")) {
      safeStorage.setItem("adminUser", JSON.stringify({ email: credentials.email }));
    }
    safeStorage.setItem("userRole", role);
    setIsLoading(false);
    router.push("/admin");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center px-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-dental-blue/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-dental-teal/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo Card */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-3">
            <div className="w-14 h-14 bg-gradient-to-br from-dental-blue to-dental-teal rounded-2xl flex items-center justify-center shadow-lg shadow-dental-blue/20">
              <FaTooth className="text-white text-2xl" />
            </div>
            <div className="text-left">
              <span className="text-2xl font-bold text-white">BrightSmile</span>
              <p className="text-sm text-gray-400">{t("adminLogin.dentalClinic")}</p>
            </div>
          </Link>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-dental-blue to-dental-teal rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              {role === "doctor" ? (
                <FaUserMd className="text-white text-2xl" />
              ) : (
                <FaUserTie className="text-white text-2xl" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">{t("adminLogin.staffPortal")}</h1>
            <p className="text-gray-400">{t("adminLogin.signInSubtitle")}</p>
          </div>

          {/* Role Selection */}
          <div className="flex gap-2 p-1 bg-white/5 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setRole("doctor")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${
                role === "doctor"
                  ? "bg-gradient-to-r from-dental-blue to-dental-teal text-white shadow-lg"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <FaUserMd />
              {t("adminLogin.doctor")}
            </button>
            <button
              type="button"
              onClick={() => setRole("secretary")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${
                role === "secretary"
                  ? "bg-gradient-to-r from-dental-blue to-dental-teal text-white shadow-lg"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <FaUserTie />
              {t("adminLogin.secretary")}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
              <FaExclamationCircle className="text-red-400" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t("adminLogin.email")}
              </label>
              <div className="relative">
                <div className="absolute left-4 rtl:left-auto rtl:right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <FaEnvelope />
                </div>
                <input
                  type="email"
                  value={credentials.email}
                  onChange={(e) =>
                    setCredentials({ ...credentials, email: e.target.value })
                  }
                  placeholder={t("adminLogin.emailPlaceholder")}
                  required
                  className="w-full pl-12 rtl:pl-4 rtl:pr-12 pr-4 py-4 bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/50 focus:border-dental-blue transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t("adminLogin.password")}
              </label>
              <div className="relative">
                <div className="absolute left-4 rtl:left-auto rtl:right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <FaLock />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={credentials.password}
                  onChange={(e) =>
                    setCredentials({ ...credentials, password: e.target.value })
                  }
                  placeholder={t("adminLogin.passwordPlaceholder")}
                  required
                  className="w-full pl-12 rtl:pl-12 rtl:pr-12 pr-12 py-4 bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/50 focus:border-dental-blue transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 rtl:right-auto rtl:left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-600 bg-white/5 text-dental-blue focus:ring-dental-blue/50"
                />
                <span className="text-sm text-gray-400">{t("adminLogin.rememberMe")}</span>
              </label>
              <button
                type="button"
                className="text-sm text-dental-lightblue hover:underline"
              >
                {t("adminLogin.forgotPassword")}
              </button>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-dental-blue to-dental-teal hover:shadow-lg hover:shadow-dental-blue/25 transition-all text-lg font-semibold"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  {t("adminLogin.signingIn")}
                </div>
              ) : (
                `${t("adminLogin.signInAs")} ${role === "doctor" ? t("adminLogin.doctor") : t("adminLogin.secretary")}`
              )}
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
            <p className="text-xs text-gray-400 text-center mb-2">
              {t("adminLogin.demoCredentials")} ({role === "doctor" ? t("adminLogin.doctor") : t("adminLogin.secretary")})
            </p>
            <div className="flex justify-center gap-4 text-sm">
              <div className="text-center">
                <p className="text-gray-500">{t("adminLogin.email")}</p>
                <p className="text-white font-mono text-xs">
                  {role === "doctor"
                    ? "doctor@clinic.com"
                    : "reception@clinic.com"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-500">{t("adminLogin.password")}</p>
                <p className="text-white font-mono">demo123</p>
              </div>
            </div>
          </div>
        </div>

        {/* Back to Website */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            {t("adminLogin.backToWebsite")}
          </Link>
        </div>
      </div>
    </div>
  );
}
