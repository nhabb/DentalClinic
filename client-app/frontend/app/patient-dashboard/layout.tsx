"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureSession } from "@/lib/auth/session";

export default function PatientDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // The session cookie decides (email and Google sign-ins both end in it);
    // a new tab gets its role from /auth/me.
    const check = async () => {
      const session = await ensureSession();
      if (session?.role === "patient") setChecked(true);
      else router.push("/login");
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked) return null;
  return <>{children}</>;
}
