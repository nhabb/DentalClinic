"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { safeStorage } from "@/lib/browser-compat";
import { supabase } from "@/lib/supabase/client";

export default function PatientDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const check = async () => {
      const token = safeStorage.getItem("authToken");
      const role = safeStorage.getItem("userRole");

      // Accept patients who logged in via the backend auth endpoint
      if (token && role === "patient") {
        setChecked(true);
        return;
      }

      // Also accept users who authenticated via Supabase OAuth
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setChecked(true);
          return;
        }
      } catch {}

      router.push("/login");
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked) return null;
  return <>{children}</>;
}
