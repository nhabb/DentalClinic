"use client";

import { useEffect, useState } from "react";
import { FaCheck, FaCopy } from "react-icons/fa";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { inputClass } from "@/components/ui/FormField";
import { useTranslation } from "@/lib/i18n";
import type { StaffInvite } from "@/lib/api/roles";

type Props = {
  isOpen: boolean;
  title: string;
  /** Who the link is for, e.g. "Nadia Haddad (nadia@clinic.com)". */
  description: string;
  invite: StaffInvite | null;
  onClose: () => void;
};

/**
 * Shows what happened to a set-password link: emailed, or (when the server
 * has no SMTP) the link itself to copy and send by hand.
 */
export function InviteLinkModal({ isOpen, title, description, invite, onClose }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) setCopied(false);
  }, [isOpen, invite]);

  const copyLink = async () => {
    if (!invite?.link) return;
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
      toast.success(t("roles.linkCopied"));
    } catch {
      toast.error(t("roles.copyFailed"));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>{t("roles.done")}</Button>
        </div>
      }
    >
      {!invite ? null : invite.emailed ? (
        <p className="text-sm text-ink-700">{t("roles.linkEmailed")}</p>
      ) : !invite.link ? (
        // An account already in use: its link only ever goes to the owner.
        <p className="text-sm text-ink-700">{t("roles.linkNotSent")}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-700">{t("roles.linkNotEmailed")}</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label={t("roles.setPasswordLink")}
              className={`${inputClass} font-mono text-xs`}
              value={invite.link}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="ghost" onClick={copyLink} aria-label={t("roles.copyLink")}>
              {copied ? <FaCheck /> : <FaCopy />}
            </Button>
          </div>
          <p className="text-xs text-ink-500">
            {t("roles.linkExpires")} {new Date(invite.expires_at).toLocaleString()}
          </p>
        </div>
      )}
    </Modal>
  );
}
