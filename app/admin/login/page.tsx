"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  FaTooth,
  FaLock,
  FaUser,
  FaEye,
  FaEyeSlash,
  FaShieldAlt,
  FaExclamationCircle,
} from "react-icons/fa";

export default function AdminLogin() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });

  // Check if already logged in
  useEffect(() => {
    const isAuthenticated = localStorage.getItem("adminAuth") === "true";
    if (isAuthenticated) {
      router.push("/admin");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Simulate authentication delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simple credential check (in production, this would be a real API call)
    // Default credentials: admin / admin123
    if (
      credentials.username === "admin" &&
      credentials.password === "admin123"
    ) {
      // Store auth state in localStorage (in production, use proper auth tokens)
      localStorage.setItem("adminAuth", "true");
      localStorage.setItem(
        "adminUser",
        JSON.stringify({
          name: "Dr. Sarah Haddad",
          role: "Administrator",
          email: "sarah.haddad@brightsmile.com",
        }),
      );
      router.push("/admin");
    } else {
      setError("Invalid username or password");
    }

    setIsLoading(false);
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
              <p className="text-sm text-gray-400">Dental Clinic</p>
            </div>
          </Link>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-dental-blue to-dental-teal rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <FaShieldAlt className="text-white text-2xl" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Admin Portal</h1>
            <p className="text-gray-400">
              Sign in to access the admin dashboard
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
              <FaExclamationCircle className="text-red-400" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <FaUser />
                </div>
                <input
                  type="text"
                  value={credentials.username}
                  onChange={(e) =>
                    setCredentials({ ...credentials, username: e.target.value })
                  }
                  placeholder="Enter your username"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/50 focus:border-dental-blue transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <FaLock />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={credentials.password}
                  onChange={(e) =>
                    setCredentials({ ...credentials, password: e.target.value })
                  }
                  placeholder="Enter your password"
                  required
                  className="w-full pl-12 pr-12 py-4 bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/50 focus:border-dental-blue transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
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
                <span className="text-sm text-gray-400">Remember me</span>
              </label>
              <button
                type="button"
                className="text-sm text-dental-lightblue hover:underline"
              >
                Forgot password?
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
                  Signing in...
                </div>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
            <p className="text-xs text-gray-400 text-center mb-2">
              Demo Credentials
            </p>
            <div className="flex justify-center gap-4 text-sm">
              <div className="text-center">
                <p className="text-gray-500">Username</p>
                <p className="text-white font-mono">admin</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500">Password</p>
                <p className="text-white font-mono">admin123</p>
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
            ← Back to website
          </Link>
        </div>
      </div>
    </div>
  );
}
