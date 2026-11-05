"use client";

import { useCallback, useEffect, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { ConnectionCard } from "@/components/whatsapp/ConnectionCard";
import { EmailCard } from "@/components/whatsapp/EmailCard";
import { fetchConnection, fetchEmailSettings, type EmailSettings, type WhatsAppConnection } from "@/lib/api/whatsapp";

/*
 * The clinic's messaging channels, set up once in Settings: the WhatsApp
 * Business number (Meta's Cloud API) and the email sender. The reminders
 * page only uses them; it never configures them.
 */

export function MessagingSection({ canEdit, canSend }: { canEdit: boolean; canSend: boolean }) {
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [email, setEmail] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, e] = await Promise.all([fetchConnection(), fetchEmailSettings()]);
      setConnection(c);
      setEmail(e);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section id="messaging" className="scroll-mt-24 space-y-4">
      <div>
        <h2 className="text-base font-bold tracking-tight text-ink-900">Messaging channels</h2>
        <p className="text-sm text-ink-500">Connect the clinic&apos;s WhatsApp number and its email sender once here. Which reminders go out, by which channel and when, is set on the WhatsApp reminders page.</p>
      </div>
      {loading ? (
        <LoadingSpinner label="Loading…" />
      ) : failed || !connection || !email ? (
        <EmptyState
          icon={FaWhatsapp}
          title="The messaging settings could not be loaded."
          action={
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <ConnectionCard
            connection={connection}
            onChange={(c) => {
              setConnection(c);
              void load();
            }}
            canEdit={canEdit}
            canSend={canSend}
          />
          <EmailCard email={email} onChange={setEmail} canEdit={canEdit} canSend={canSend} />
        </div>
      )}
    </section>
  );
}
