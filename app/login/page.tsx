"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FaTooth, FaUser, FaUserMd, FaUserTie, FaShieldAlt } from "react-icons/fa";
import { useState } from "react";
import { useRouter } from "next/navigation";

type UserRole = "patient" | "doctor" | "secretary" | "superadmin";

const ROLE_REDIRECTS: Record<UserRole, string> = {
  patient: "/select-clinic",
  doctor: "/admin",
  secretary: "/admin",
  superadmin: "/superadmin",
};

const DEMO_ACCOUNTS = [
  { role: "Patient",     email: "patient@demo.com",   password: "demo123", icon: FaUser,      color: "text-blue-500"  },
  { role: "Doctor",      email: "doctor@demo.com",    password: "demo123", icon: FaUserMd,    color: "text-teal-500"  },
  { role: "Secretary",   email: "secretary@demo.com", password: "demo123", icon: FaUserTie,   color: "text-purple-500" },
  { role: "Super Admin", email: "super@demo.com",     password: "demo123", icon: FaShieldAlt, color: "text-orange-500" },
];

async function mockLogin(email: string, _password: string): Promise<{ role: UserRole }> {
  await new Promise((r) => setTimeout(r, 600));
  if (email === "super@demo.com")      return { role: "superadmin" };
  if (email === "doctor@demo.com")     return { role: "doctor" };
  if (email === "secretary@demo.com")  return { role: "secretary" };
  return { role: "patient" };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]       = useState("");

  const fillDemo = (acc: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError("");
  };

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const { role } = await mockLogin(email, password);

      localStorage.setItem("userRole", role);
      localStorage.setItem("authToken", "demo-token");

      if (role === "patient") {
        localStorage.setItem("patientAuth", "true");
      } else if (role === "superadmin") {
        localStorage.setItem("superAdminAuth", "true");
      } else {
        localStorage.setItem("adminAuth", "true");
        localStorage.setItem("adminUser", JSON.stringify({ email }));
      }

      router.push(ROLE_REDIRECTS[role]);
    } catch {
      setError("Invalid email or password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 gradient-auth-bg">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10 space-y-7">
          {/* Logo */}
          <div className="text-center">
            <Link href="/" className="inline-flex items-center space-x-2">
              <div className="w-12 h-12 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center shadow-lg">
                <FaTooth className="text-white text-2xl" />
              </div>
              <span className="text-2xl font-bold text-gray-900">BrightSmile</span>
            </Link>
            <h2 className="mt-6 text-3xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-2 text-sm text-gray-600">
              Sign in to access your dashboard
            </p>
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
                Email address
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
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
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
                placeholder="Enter your password"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-auth-blue focus:ring-auth-blue border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Remember me</span>
              </label>
              <Link href="/forgot-password" className="text-sm font-medium text-auth-blue hover:text-auth-blue-light">
                Forgot password?
              </Link>
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
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            <Button type="button" variant="outline" className="w-full" size="lg">
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 mr-2" />
              Continue with Google
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Demo accounts — click to fill
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
            <p className="text-[10px] text-gray-400 text-center">Password for all: <span className="font-mono font-semibold">demo123</span></p>
          </div>

          {/* Sign Up */}
          <p className="text-center text-sm text-gray-600">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold text-auth-blue hover:text-auth-blue-light">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
