"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FaChartLine, FaFileInvoiceDollar } from "react-icons/fa";
import { safeStorage } from "@/lib/browser-compat";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { QuotesPanel } from "@/components/billing/QuotesPanel";

/**
 * Quotes have their own page, next to invoices rather than inside them: an
 * estimate and a bill are different documents and mixing the two lists was
 * what made billing feel tangled. Both pages only watch; the chart acts.
 */
export default function QuotesPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("userRole");
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar
        activePage="billing"
        sidebarOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminPageHeader
          title="Quotes"
          subtitle="Priced treatment plans given to patients. Never money."
          actions={[
            {
              key: "invoices",
              label: "Invoices",
              icon: <FaFileInvoiceDollar />,
              href: "/admin/billing",
            },
            {
              key: "dashboard",
              label: "Dashboard",
              icon: <FaChartLine />,
              href: "/admin",
            },
          ]}
        />

        <main className="flex-1 overflow-auto p-8">
          <QuotesPanel />
        </main>
      </div>
    </div>
  );
}
