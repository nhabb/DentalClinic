"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Skip auth check if already on login page
    if (pathname === "/admin/login") {
      return;
    }

    // Check if user is authenticated
    const isAuthenticated = localStorage.getItem("adminAuth") === "true";

    if (!isAuthenticated) {
      // Redirect to admin login if not authenticated
      router.push("/admin/login");
    }
  }, [pathname, router]);

  // If on login page, render directly
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // For other admin pages, check auth before rendering
  const isAuthenticated =
    typeof window !== "undefined"
      ? localStorage.getItem("adminAuth") === "true"
      : false;

  if (!isAuthenticated) {
    return null; // Don't render until redirect happens
  }

  return <>{children}</>;
}
