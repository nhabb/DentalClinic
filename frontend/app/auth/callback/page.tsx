"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const ROLE_REDIRECTS: Record<string, string> = {
  patient: "/patient-dashboard",
  doctor: "/admin",
  admin: "/admin",
  secretary: "/admin",
  superadmin: "/superadmin",
};

const ADMIN_ROLES = new Set(["doctor", "admin", "secretary", "superadmin"]);

async function provisionAndPersist(supabaseToken: string): Promise<{ redirect: string; userId: string; isNew: boolean }> {
  const res = await fetch(`${API_URL}/api/auth/provision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${supabaseToken}` },
  });

  if (!res.ok) throw new Error("Provision failed");

  const { user, token, is_new_user } = await res.json();
  const role: string = user.role ?? "patient";

  sessionStorage.setItem("authToken", token);
  sessionStorage.setItem("userRole", role);
  sessionStorage.setItem("userId", user.id.toString());
  sessionStorage.setItem(
    "adminUser",
    JSON.stringify({ email: user.email, firstName: user.first_name, lastName: user.last_name, role })
  );
  if (ADMIN_ROLES.has(role)) {
    sessionStorage.setItem("adminAuth", "true");
  }

  return {
    redirect: ROLE_REDIRECTS[role] ?? "/patient-dashboard",
    userId: user.id.toString(),
    isNew: !!is_new_user,
  };
}


export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handle = async () => {
      let accessToken: string | null = null;

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        accessToken = session.access_token;
      } else {
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { data } = await supabase.auth.exchangeCodeForSession(code);
          accessToken = data.session?.access_token ?? null;
        }
      }

      if (!accessToken) {
        router.replace("/login");
        return;
      }

      try {
        const { redirect, isNew } = await provisionAndPersist(accessToken);

        if (isNew) {
          // New Google user — send them to complete their profile (form is pre-filled from sessionStorage)
          router.replace("/complete-profile");
        } else {
          router.replace(redirect);
        }
      } catch {
        sessionStorage.setItem("authToken", accessToken);
        sessionStorage.setItem("userRole", "patient");
        router.replace("/patient-dashboard");
      }
    };

    handle();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-4 border-dental-blue/30 border-t-dental-blue rounded-full animate-spin" />
    </div>
  );
}
