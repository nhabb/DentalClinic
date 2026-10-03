"use client";

// Landing page for the one-time "set your password" link emailed to patients
// whose account was created by clinic staff (see backend AccountSetupService).
//   GET  /api/auth/set-password/validate?token=…  → { valid, first_name, email }
//   POST /api/auth/set-password { token, password } → { message, email }

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FaTooth, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const inputClass =
  "appearance-none block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent transition-all";

function SetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const { t } = useTranslation();

  const [state, setState] = useState<"checking" | "invalid" | "ready" | "done">("checking");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    let cancelled = false;
    fetch(`${API_URL}/api/auth/set-password/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.valid) {
          setFirstName(d.first_name ?? "");
          setEmail(d.email ?? "");
          setState("ready");
        } else {
          setState("invalid");
        }
      })
      .catch(() => {
        if (!cancelled) setState("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError(t("setPassword.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("setPassword.mismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || t("setPassword.failed"));
        return;
      }
      setState("done");
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError(t("setPassword.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 gradient-auth-bg">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10 space-y-7">
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
            <h2 className="mt-6 text-3xl font-bold text-gray-900">{t("setPassword.title")}</h2>
            {state === "ready" && (
              <p className="mt-2 text-sm text-gray-600">
                {firstName ? `${t("setPassword.hello")} ${firstName}. ` : ""}
                {t("setPassword.subtitle")}
                {email ? <span className="block mt-1 font-medium text-gray-800">{email}</span> : null}
              </p>
            )}
          </div>

          {state === "checking" && (
            <p className="text-center text-sm text-gray-500">{t("setPassword.checking")}</p>
          )}

          {state === "invalid" && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <FaExclamationTriangle className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{t("setPassword.invalidTitle")}</p>
                  <p className="mt-1">{t("setPassword.invalidDesc")}</p>
                </div>
              </div>
              <Link href="/login" className="block">
                <Button variant="outline" className="w-full">{t("setPassword.goToLogin")}</Button>
              </Link>
            </div>
          )}

          {state === "done" && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <FaCheckCircle className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{t("setPassword.doneTitle")}</p>
                  <p className="mt-1">{t("setPassword.doneDesc")}</p>
                </div>
              </div>
              <Link href="/login" className="block">
                <Button className="w-full py-6 gradient-auth-card hover:shadow-xl transition-all">
                  {t("setPassword.goToLogin")}
                </Button>
              </Link>
            </div>
          )}

          {state === "ready" && (
            <form className="space-y-5" onSubmit={onSubmit}>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  {t("setPassword.newPassword")}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
                <p className="mt-1 text-xs text-gray-500">{t("setPassword.minLengthHint")}</p>
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                  {t("setPassword.confirmPassword")}
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full py-6 gradient-auth-card hover:shadow-xl transition-all transform hover:scale-[1.02]"
              >
                {submitting ? t("setPassword.saving") : t("setPassword.submit")}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  );
}
