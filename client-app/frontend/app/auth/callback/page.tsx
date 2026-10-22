"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { homeFor, rememberUser } from "@/lib/auth/session";


async function provisionAndPersist(supabaseToken: string): Promise<{ redirect: string; userId: string; isNew: boolean }> {
  // The Supabase token proves the Google sign-in; the API answers with our
  // own session cookie.
  const res = await apiFetch("/api/auth/provision", {
    method: "POST",
    headers: { Authorization: `Bearer ${supabaseToken}` },
  });

  if (!res.ok) throw new Error("Provision failed");

  const { user, is_new_user } = await res.json();
  const role = rememberUser(user);

  return {
    redirect: homeFor(role),
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
        // The API could not turn the Google sign-in into an account. Say so
        // instead of landing on a dashboard that cannot load anything.
        await supabase.auth.signOut().catch(() => {});
        router.replace("/login?reason=google");
      }
    };

    handle();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
    </div>
  );
}
