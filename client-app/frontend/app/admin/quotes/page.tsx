"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FaFileInvoiceDollar, FaUsers } from "react-icons/fa";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { QuotesPanel } from "@/components/billing/QuotesPanel";
import { useSignOut } from "@/lib/auth/useSignOut";

/*
 * Quotes: the register of every patient's plan and where it stands.
 *
 *   Patients (chart)  plan the work, no prices
 *   Quotes            this list: who has a plan, priced or not, agreed or not
 *   Billing           the list of bills
 *   Payments          who owes, what came in, who holds prepaid money
 *
 * A row opens the patient's money page, where the plan is priced, given to
 * the patient and agreed, and where their bills and payments live beside it.
 */
export default function QuotesPage() {
  const router = useRouter();
  const handleLogout = useSignOut();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // An old link carrying `?patient=` lands on that patient's money page.
  useEffect(() => {
    const wanted = Number(new URLSearchParams(window.location.search).get("patient"));
    if (wanted) router.replace(`/admin/billing/patient/${wanted}`);
  }, [router]);

  return (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar
        activePage="quotes"
        sidebarOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminPageHeader
          title="Quotes"
          subtitle="Every patient's plan: priced, given, agreed. Open one to work on it."
          actions={[
            { key: "patients", label: "Patients", icon: <FaUsers />, href: "/admin/patients" },
            { key: "billing", label: "Billing", icon: <FaFileInvoiceDollar />, href: "/admin/billing" },
          ]}
        />

        <main className="flex-1 overflow-auto p-8">
          <QuotesPanel onOpenPatient={(pt) => router.push(`/admin/billing/patient/${pt.id}`)} />
        </main>
      </div>
    </div>
  );
}
