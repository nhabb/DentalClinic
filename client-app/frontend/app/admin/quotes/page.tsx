"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FaFileInvoiceDollar, FaUsers } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { QuotesPanel } from "@/components/billing/QuotesPanel";
import { QuoteDrawer } from "@/components/quotes/QuoteDrawer";
import type { PatientOption } from "@/components/billing/NewInvoiceModal";
import { useSignOut } from "@/lib/auth/useSignOut";

/*
 * Quotes: the second of four stages.
 *
 *   Patients (chart)  plan the work, no prices
 *   Quotes            price it, give it to the patient, record that they agreed
 *   Billing           issue a bill for what is done or in progress
 *   Payments          receive payments (onto the ticked bills, the rest prepaid), refund
 *
 * This page is the register of every patient's quote; a row opens that
 * patient's quote in a drawer, where the lines are priced. Nothing is created
 * here: the lines are chart work, and bills are made on the Billing page.
 */
export default function QuotesPage() {
  const router = useRouter();
  const handleLogout = useSignOut();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerPatient, setDrawerPatient] = useState<PatientOption | null>(null);
  /** Bumped when a quote changed, so the register redraws its totals. */
  const [changed, setChanged] = useState(0);

  /**
   * `/admin/quotes?patient=<id>` opens that patient's quote: where the chart
   * and the money file send the desk. Read in an effect, never in a lazy
   * initial state (the page is server-rendered first, with no window).
   */
  const [deepLinkDone, setDeepLinkDone] = useState(false);
  useEffect(() => {
    if (deepLinkDone) return;
    setDeepLinkDone(true);
    const params = new URLSearchParams(window.location.search);
    const wanted = Number(params.get("patient"));
    if (!wanted) return;
    window.history.replaceState(null, "", "/admin/quotes");
    void (async () => {
      try {
        const res = await apiFetch(`/api/patients/${wanted}`);
        if (!res.ok) throw new Error();
        const p = await res.json();
        const label = p?.users
          ? `${p.users.first_name} ${p.users.last_name}`.trim()
          : `Patient #${wanted}`;
        setDrawerPatient({ id: wanted, label });
      } catch {
        toast.error("That patient could not be opened.");
      }
    })();
  }, [deepLinkDone]);

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
          subtitle="Price the plan, give it to the patient, record that they agreed"
          actions={[
            { key: "patients", label: "Patients", icon: <FaUsers />, href: "/admin/patients" },
            { key: "billing", label: "Billing", icon: <FaFileInvoiceDollar />, href: "/admin/billing" },
          ]}
        />

        <main className="flex-1 overflow-auto p-8">
          <QuotesPanel
            key={changed}
            onOpenPatient={(pt) => setDrawerPatient(pt)}
          />
        </main>
      </div>

      {drawerPatient && (
        <QuoteDrawer
          patient={drawerPatient}
          isOpen={!!drawerPatient}
          onClose={() => {
            setDrawerPatient(null);
            router.replace("/admin/quotes");
          }}
          onChanged={() => setChanged((n) => n + 1)}
        />
      )}
    </div>
  );
}
