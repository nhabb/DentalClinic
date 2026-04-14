"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

function persistSession(accessToken: string) {
  try {
    localStorage.setItem("authToken", accessToken);
    localStorage.setItem("userRole", "patient");
  } catch {}
}

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handle = async () => {
      // Try getting an existing session first
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        persistSession(session.access_token);
        router.replace("/patient-dashboard");
        return;
      }

      // Exchange PKCE code for session
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { data } = await supabase.auth.exchangeCodeForSession(code);
        if (data.session) {
          persistSession(data.session.access_token);
        }
        router.replace("/patient-dashboard");
      } else {
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
