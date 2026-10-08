"use client";

import { useState } from "react";
import { FaCopy, FaCheck } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { Invite } from "@/lib/types";

/**
 * Shows a password setup link so the operator can hand it to the clinic by
 * any channel. Emails are not sent from the console; the link is the handover.
 */
export function InviteLinkCard({ invite, recipient }: { invite: Invite; recipient: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is still visible to select manually.
    }
  };

  return (
    <div className="rounded-2xl border border-honey-200 bg-honey-50 p-4">
      <p className="text-sm font-semibold text-honey-900">Password setup link for {recipient}</p>
      <p className="mt-0.5 text-xs text-honey-800">
        Send it to them; it opens the clinic app and expires on {formatDate(invite.expires_at)}.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-honey-200 bg-white px-3 py-2 text-xs text-ink-800">
          {invite.link}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <FaCheck /> : <FaCopy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
