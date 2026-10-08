"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FaTooth, FaLock, FaEnvelope, FaEye, FaEyeSlash } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { ApiError, post } from "@/lib/api";
import { session, type PlatformUser } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session.token()) router.replace("/");
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await post<{ token: string; user: PlatformUser }>("/auth/login", { email, password });
      session.start(result.token, result.user);
      toast.success(`Welcome back, ${result.user.first_name}`);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the platform API");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4">
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-brand-400/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-400 shadow-lg shadow-brand/20">
            <FaTooth className="text-2xl text-white" />
          </span>
          <span className="text-left">
            <span className="block font-display text-2xl font-bold text-white">Dental Platform</span>
            <span className="block text-sm text-gray-400">Operator console</span>
          </span>
        </div>

        <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
          <h1 className="mb-1 text-center text-2xl font-bold text-white">Sign in</h1>
          <p className="mb-6 text-center text-sm text-gray-400">Platform administrators only</p>

          {error && (
            <p role="alert" className="mb-4 rounded-xl border border-brick-400/40 bg-brick-500/15 px-4 py-3 text-sm text-brick-100">
              {error}
            </p>
          )}

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-gray-300">Email</span>
            <span className="relative block">
              <FaEnvelope className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-4 text-white placeholder:text-gray-500 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/20"
                placeholder="you@platform.com"
              />
            </span>
          </label>

          <label className="mb-6 block">
            <span className="mb-1.5 block text-sm font-medium text-gray-300">Password</span>
            <span className="relative block">
              <FaLock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-12 text-white placeholder:text-gray-500 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/20"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-400 hover:text-white"
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </span>
          </label>

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
