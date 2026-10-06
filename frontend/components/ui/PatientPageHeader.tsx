"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FaTooth, FaArrowLeft } from "react-icons/fa";
import { Avatar } from "@/components/ui/Avatar";
import { fetchMyPhoto } from "@/lib/profilePhoto";
import { supabase } from "@/lib/supabase/client";

interface PatientPageHeaderProps {
  backHref?: string;
  backLabel?: string;
}

export function PatientPageHeader({
  backHref = "/patient-dashboard",
  backLabel = "Back to Dashboard",
}: PatientPageHeaderProps) {
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [name, setName] = useState("");

  useEffect(() => {
    const load = async () => {
      let email: string | null = null;
      let firstName = "";
      let lastName = "";

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) email = session.user.email;
      } catch {}

      const stored = sessionStorage.getItem("adminUser");
      if (stored) {
        try {
          const u = JSON.parse(stored);
          if (!email) email = u.email ?? null;
          firstName = u.firstName ?? "";
          lastName = u.lastName ?? "";
        } catch {}
      }

      if (firstName || lastName) setName(`${firstName} ${lastName}`.trim());
      fetchMyPhoto().then(setPhotoUrl);
    };
    load();
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-200/70 bg-card/85 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link href="/patient-dashboard" className="group flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm shadow-brand-700/20 transition-transform duration-200 group-hover:scale-105">
              <FaTooth className="text-lg text-white" />
            </span>
            <span className="font-display text-xl font-bold text-ink-900">BrightSmile</span>
          </Link>

          <div className="flex items-center gap-3">
            {/* The label is the useful part on a wide screen; on a phone the
             * arrow alone is unambiguous and leaves room for the avatar. */}
            <Link
              href={backHref}
              className="press inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink-600 hover:bg-brand-50 hover:text-brand-700"
            >
              <FaArrowLeft className="text-xs rtl:rotate-180" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
            {(photoUrl || name) && (
              <Avatar name={name || "User"} size="sm" src={photoUrl} />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
