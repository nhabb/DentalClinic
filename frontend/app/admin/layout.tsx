"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { safeStorage } from "@/lib/browser-compat";
import { supabase } from "@/lib/supabase/client";
import AgentChat from "@/components/ui/AgentChat";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [doctorName, setDoctorName] = useState("Doctor");
  const [doctorId, setDoctorId] = useState<number | undefined>();
  // Start as true for login page so it renders immediately without a flash
  const [authChecked, setAuthChecked] = useState(pathname.includes("/login"));

  useEffect(() => {
    // Run once on mount only — re-running on tab focus / router refresh
    // would reset authChecked and cause spurious sign-outs.
    if (pathname.includes("/login")) {
      setAuthChecked(true);
      return;
    }
    const token = safeStorage.getItem("authToken");
    const role = safeStorage.getItem("userRole");
    const adminAuth = safeStorage.getItem("adminAuth");
    const adminRoles = ["doctor", "admin", "secretary", "superadmin"];
    const isAuth =
      adminAuth === "true" || (!!token && adminRoles.includes(role ?? ""));
    if (!isAuth) {
      router.push("/login");
    } else {
      setAuthChecked(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

    const resolveByEmail = async (email: string) => {
      const res = await fetch(`${API_URL}/api/users/by-email?email=${encodeURIComponent(email)}`);
      if (!res.ok) return;
      const user = await res.json();
      if (user?.id) {
        setDoctorId(Number(user.id));
        setDoctorName(`${user.first_name} ${user.last_name}`);
      }
    };

    const loadUser = async () => {
      // 1. Try Supabase session
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          await resolveByEmail(session.user.email);
          return;
        }
      } catch {}

      // 2. Fall back to email stored at admin login
      try {
        const stored = safeStorage.getItem("adminUser");
        if (stored) {
          const u = JSON.parse(stored);
          // Use stored name directly if available, otherwise resolve by email
          if (u?.first_name) {
            setDoctorName(`${u.first_name} ${u.last_name}`.trim());
            const storedId = safeStorage.getItem("doctorDbId");
            if (storedId) setDoctorId(Number(storedId));
          } else if (u?.email) {
            await resolveByEmail(u.email);
          }
        }
      } catch {}
    };

    loadUser();
  }, []);

  // Hide chat on login page
  const showChat = !pathname.includes("/login");

  if (!authChecked) return null;

  return (
    <>
      {children}
      {showChat && <AgentChat doctorName={doctorName} doctorId={doctorId} />}
    </>
  );
}
