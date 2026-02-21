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
    // Auth disabled - allow access to all pages
  }, [pathname, router]);

  // Render all pages without authentication
  return <>{children}</>;
}
