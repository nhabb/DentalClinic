"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FaTooth, FaUser, FaUserMd } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { toast } from 'sonner';
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";

function OAuthErrorHandler() {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("error") === "bad_oauth_state") {
      toast.error("Your sign-in session expired. Please try again.");
    }
  }, [searchParams]);
  return null;
}
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const ROLE_REDIRECTS: Record<string, string> = {
  patient: "/patient-dashboard",
  doctor: "/admin",
  admin: "/admin",
  secretary: "/admin",
  superadmin: "/superadmin",
};

const DEMO_ACCOUNTS = [
  { role: "Patient",   email: "patient@demo.com",   password: "demo123", icon: FaUser,   color: "text-blue-500" },
  { role: "Doctor",    email: "doctor@demo.com",     password: "Demo123456", icon: FaUserMd, color: "text-teal-500" },
];

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]       = useState("");

  const fillDemo = (acc: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError("");
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/auth/callback` },
      });
      if (error) {
        toast.error(error.message);
        setIsLoading(false);
      }
      // No error → Supabase navigates to Google via location.assign.
      // The 302 chain (Supabase→Google→callback) replaces those history entries,
      // so back from dashboard lands on /login.
    } catch {
      toast.error("Failed to start Google sign-in. Please try again.");
      setIsLoading(false);
    }
  };

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await apiFetch(`/api/auth/login`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      // Parse JSON safely — gateway errors may return HTML
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        // Non-JSON response (e.g. nginx 502)
      }

      if (!res.ok || data.success === false) {
        setError((data.message as string) || "Invalid email or password.");
        return;
      }

      const { user, token } = data as { user: Record<string, unknown>; token: string };

      // Persist auth (sessionStorage keeps each tab's session independent)
      sessionStorage.removeItem("authProvider"); // clear any leftover OAuth flag
      sessionStorage.setItem("authToken", token);
      sessionStorage.setItem("userRole", user.role as string);
      sessionStorage.setItem("userId", String(user.id));
      sessionStorage.setItem(
        "adminUser",
        JSON.stringify({
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
        })
      );
      // Mark admin-role users as authenticated for the admin layout guard
      const adminRoles = ["doctor", "admin", "secretary", "superadmin"];
      if (adminRoles.includes(user.role as string)) {
        sessionStorage.setItem("adminAuth", "true");
      }

      toast.success("Logged in successfully.");
      const redirect = ROLE_REDIRECTS[user.role as string] ?? "/patient-dashboard";
      router.push(redirect);
    } catch {
      setError("Unable to connect to server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 gradient-auth-bg">
      <Suspense><OAuthErrorHandler /></Suspense>
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10 space-y-7">
          {/* Logo */}
          <div className="text-center">
            <div className="flex justify-end mb-2">
              <LanguageSwitcher />
            </div>
            <Link href="/" className="inline-flex items-center space-x-2">
              <div className="w-12 h-12 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center shadow-lg">
                <FaTooth className="text-white text-2xl" />
              </div>
              <span className="text-2xl font-bold text-gray-900">BrightSmile</span>
            </Link>
            <h2 className="mt-6 text-3xl font-bold text-gray-900">{t("login.welcomeBack")}</h2>
            <p className="mt-2 text-sm text-gray-600">{t("login.signInSubtitle")}</p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          {/* Form */}
          <form className="space-y-5" onSubmit={onLogin}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                {t("login.emailAddress")}
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent transition-all"
                placeholder={t("login.emailPlaceholder")}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {t("login.password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="appearance-none block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent transition-all"
                placeholder={t("login.passwordPlaceholder")}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-6 gradient-auth-card hover:shadow-xl transition-all transform hover:scale-[1.02]"
              size="lg"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {t("login.signingIn")}
                </span>
              ) : (
                t("login.signIn")
              )}
            </Button>
          </form>

          {/* OAuth */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-3 text-gray-500">or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full py-6 flex items-center gap-3 justify-center"
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            <FcGoogle className="text-xl" />
            Continue with Google
          </Button>

          {/* Demo Credentials */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("login.demoAccounts")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => fillDemo(acc)}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-dental-blue hover:shadow-sm transition-all text-left"
                >
                  <acc.icon className={`text-sm ${acc.color} shrink-0`} />
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{acc.role}</p>
                    <p className="text-[10px] text-gray-400 truncate">{acc.email}</p>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 text-center">
              {t("login.passwordForAll")} <span className="font-mono font-semibold">Demo123456</span>
            </p>
          </div>

          {/* Sign Up */}
          <p className="text-center text-sm text-gray-600">
            {t("login.noAccount")}{" "}
            <Link href="/signup" className="font-semibold text-auth-blue hover:text-auth-blue-light">
              {t("login.signUp")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
