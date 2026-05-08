"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";

const ROLE_REDIRECTS: Record<string, string> = {
  patient: "/patient-dashboard",
  doctor: "/admin",
  admin: "/admin",
  secretary: "/admin",
  superadmin: "/superadmin",
};

const ADMIN_ROLES = new Set(["doctor", "admin", "secretary", "superadmin"]);

async function provisionAndPersist(supabaseToken: string): Promise<{ redirect: string; isNew: boolean }> {
  const res = await apiFetch(`/api/auth/provision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${supabaseToken}` },
  });

  if (!res.ok) throw new Error("Provision failed");

  const { user, token, is_new_user } = await res.json();
  const role: string = user.role ?? "patient";

  sessionStorage.setItem("authToken", token);
  sessionStorage.setItem("authProvider", "oauth");
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
    isNew: !!is_new_user,
  };
}

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Save PKCE code before stripping URL params
    const code = new URLSearchParams(window.location.search).get("code");

    // Immediately strip hash (access_token) and search params from the URL so
    // they don't linger in browser history. Supabase already read the hash
    // during client initialization, so this is safe to do before getSession().
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    const handle = async () => {
      // Back-button guard: if the user already has a valid session in
      // sessionStorage (e.g. they pressed back from the dashboard), skip
      // re-provisioning and send them straight to their page.
      const existingToken = sessionStorage.getItem("authToken");
      const existingRole = sessionStorage.getItem("userRole");
      if (existingToken && existingRole) {
        router.replace(ROLE_REDIRECTS[existingRole] ?? "/patient-dashboard");
        return;
      }

      let accessToken: string | null = null;

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        accessToken = session.access_token;
      } else if (code) {
        const { data } = await supabase.auth.exchangeCodeForSession(code);
        accessToken = data.session?.access_token ?? null;
      }

      if (!accessToken) {
        router.replace("/login");
        return;
      }

      try {
        const { redirect, isNew } = await provisionAndPersist(accessToken);
        router.replace(isNew ? "/complete-profile" : redirect);
      } catch {
        router.replace("/login");
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
