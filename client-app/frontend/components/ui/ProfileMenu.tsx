"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FaKey, FaSignOutAlt, FaChevronDown } from "react-icons/fa";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/Avatar";
import { getStoredPhoto } from "@/lib/profilePhoto";
import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { safeStorage } from "@/lib/browser-compat";
import ChangePasswordModal from "@/components/ui/ChangePasswordModal";
import { useTranslation } from "@/lib/i18n";

/**
 * Avatar trigger + account menu, mounted in AdminPageHeader so it's present
 * on every admin page — the Shopify-style "profile lives in the top bar"
 * pattern. Owns sign-out and change-password directly (previously these
 * lived at the bottom of AdminSidebar).
 */
export function ProfileMenu() {
  const router = useRouter();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<number>(0);
  const [isOAuth, setIsOAuth] = useState(false);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    setUserRole(safeStorage.getItem("userRole") ?? "");
  }, []);

  useEffect(() => {
    const load = async () => {
      let resolvedEmail: string | null = null;
      let name = "";

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) resolvedEmail = session.user.email;
      } catch {}

      const stored = sessionStorage.getItem("adminUser");
      if (stored) {
        try {
          const u = JSON.parse(stored);
          if (!resolvedEmail) resolvedEmail = u.email ?? null;
          name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
        } catch {}
      }

      if (name) setUserName(name);
      if (resolvedEmail) {
        setEmail(resolvedEmail);
        setPhotoUrl(getStoredPhoto(resolvedEmail));
      }

      try {
        const meRes = await apiFetch("/api/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          if (me?.id) setUserId(Number(me.id));
          setIsOAuth(!!me?.is_oauth);
        }
      } catch {}
    };
    load();
  }, []);

  const handlePhotoUpload = (dataUrl: string) => {
    setPhotoUrl(dataUrl);
    if (email) localStorage.setItem(`brightsmile_photo_${email}`, dataUrl);
  };

  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("userRole");
    safeStorage.removeItem("doctorId");
    safeStorage.removeItem("assignedDoctorIds");
    router.push("/login");
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="press flex shrink-0 items-center gap-1.5 rounded-full py-1 pe-1.5 ps-1 ring-1 ring-ink-200 transition-colors hover:bg-ink-100"
          >
            <Avatar name={userName || "User"} size="sm" src={photoUrl} />
            <FaChevronDown className="h-2.5 w-2.5 text-ink-400" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-64 rounded-2xl border border-ink-200/70 bg-card p-0 shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-ink-200/70 px-4 py-3">
            <Avatar
              name={userName || "User"}
              size="md"
              src={photoUrl}
              onUpload={userRole === "doctor" ? handlePhotoUpload : undefined}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{userName || "User"}</p>
              {email && <p className="truncate text-xs text-ink-500">{email}</p>}
            </div>
          </div>

          <div className="p-1.5">
            {!isOAuth && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowChangePassword(true);
                }}
                style={{ animationDelay: "0ms", animationFillMode: "backwards" }}
                className="press flex w-full animate-in fade-in slide-in-from-top-1 items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium text-ink-700 duration-200 hover:bg-ink-100"
              >
                <FaKey className="shrink-0 text-ink-400" />
                {t("common.changePassword")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                handleLogout();
              }}
              style={{ animationDelay: isOAuth ? "0ms" : "70ms", animationFillMode: "backwards" }}
              className="press flex w-full animate-in fade-in slide-in-from-top-1 items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium text-brick-700 duration-200 hover:bg-brick-50"
            >
              <FaSignOutAlt className="shrink-0" />
              {t("common.logout")}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {showChangePassword && userId > 0 && (
        <ChangePasswordModal userId={userId} onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}
