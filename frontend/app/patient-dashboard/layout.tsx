"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { safeStorage } from "@/lib/browser-compat";

export default function PatientDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Run once on mount only — avoids spurious sign-outs on tab refocus.
    const token = safeStorage.getItem("authToken");
    const role = safeStorage.getItem("userRole");
    if (!token || role !== "patient") {
      router.push("/login");
    } else {
      setChecked(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked) return null;
  return <>{children}</>;
}
