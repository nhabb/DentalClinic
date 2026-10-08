"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaLock } from "react-icons/fa";
import { screenPermission } from "@/lib/adminAccess";
import { usePermissions } from "@/lib/permissions";

/**
 * Shows an admin screen only when the role holds the permission the screen's
 * API needs (lib/adminAccess.ts). The API refuses such requests anyway; this
 * spares the user a page full of errors and keeps menus honest.
 */
export function AdminScreenGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, user, can } = usePermissions();
  const needed = screenPermission(pathname);

  // Login page, open screens, or still resolving the user: render as is.
  if (!needed || loading || !user) return <>{children}</>;
  if (can(needed)) return <>{children}</>;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <FaLock />
        </div>
        <h1 className="text-lg font-semibold text-gray-900">This section is not available to your role</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your role <span className="font-medium text-gray-900">{user.role}</span> does not have the permission{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-800">{needed}</code>. A clinic
          administrator can grant it on the Roles page.
        </p>
        <Link href="/admin" className="mt-6 inline-block rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
