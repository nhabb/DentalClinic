"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/console/Sidebar";
import { session, type PlatformUser } from "@/lib/auth";

/**
 * Shell for every console page: requires a platform session and renders the
 * sidebar. Children render only once the session has been checked, so a
 * signed-out visitor never sees a flash of protected content.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!session.token()) {
      router.replace("/login");
      return;
    }
    setUser(session.user());
    setChecked(true);
  }, [router]);

  const logout = () => {
    session.end();
    router.replace("/login");
  };

  if (!checked) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} user={user} onLogout={logout} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
