"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { safeStorage } from "@/lib/browser-compat";

// Runs before paint on the client; falls back to useEffect during SSR.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function PatientDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useIsomorphicLayoutEffect(() => {
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
