"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/patient-dashboard");
      } else {
        // Exchange code for session (PKCE flow)
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          supabase.auth.exchangeCodeForSession(code).then(() => {
            router.replace("/patient-dashboard");
          });
        } else {
          router.replace("/login");
        }
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-4 border-dental-blue/30 border-t-dental-blue rounded-full animate-spin" />
    </div>
  );
}
