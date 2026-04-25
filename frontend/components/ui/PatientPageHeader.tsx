"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FaTooth, FaArrowLeft } from "react-icons/fa";
import { Avatar } from "@/components/ui/Avatar";
import { getStoredPhoto } from "@/lib/profilePhoto";
import { supabase } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

interface PatientPageHeaderProps {
  backHref?: string;
  backLabel?: string;
}

export function PatientPageHeader({
  backHref = "/patient-dashboard",
  backLabel,
}: PatientPageHeaderProps) {
  const { t } = useTranslation();
  const displayLabel = backLabel ?? t("patientHeader.backToDashboard");
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
      if (email) setPhotoUrl(getStoredPhoto(email));
    };
    load();
  }, []);

  return (
    <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <Link
            href="/patient-dashboard"
            className="flex items-center space-x-2"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
              <FaTooth className="text-white text-xl" />
            </div>
            <span className="text-xl font-bold text-gray-900">BrightSmile</span>
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            {(photoUrl || name) && (
              <Avatar name={name || "User"} size="sm" src={photoUrl} />
            )}
            <Link
              href={backHref}
              className="text-gray-600 hover:text-dental-blue transition-colors flex items-center gap-2"
            >
              <FaArrowLeft className="text-sm" />
              {displayLabel}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
