"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FaCheckCircle, FaEnvelope, FaExclamationTriangle, FaEye, FaEyeSlash, FaPaperPlane } from "react-icons/fa";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { Modal } from "@/components/ui/Modal";
import { cn, formatDateBeirut } from "@/lib/utils";
import { errorText } from "@/lib/api/request";
import { deleteEmailSettings, saveEmailSettings, testEmail, type EmailSettings, type EmailSettingsInput } from "@/lib/api/whatsapp";
import { EmailGoodToKnow, EmailTroubles, GmailSteps, HostingSteps, OutlookSteps, WhichOption } from "./EmailHelp";

/*
 * Email as a second channel. The clinic gives the name patients see as the
 * sender and where a reply should go; by default the platform's mail server
 * sends on its behalf. A clinic with its own mail server (Google Workspace,
 * Outlook, the hosting provider) can send from its own address instead: the
 * password is sealed on the API and never shown again. A test email proves
 * the setup before any reminder uses it.
 */

interface Props {
  email: EmailSettings;
  onChange: (e: EmailSettings) => void;
  canEdit: boolean;
  canSend: boolean;
}

export function EmailCard({ email, onChange, canEdit, canSend }: Props) {
  const [editing, setEditing] = useState(!email.configured);
  useEffect(() => {
    if (!email.configured) setEditing(true);
  }, [email.configured]);
  if (editing || !email.configured) {
    return (
      <EmailForm
        email={email}
        canEdit={canEdit}
        onSaved={(e) => {
          onChange(e);
          setEditing(false);
        }}
        onCancel={email.configured ? () => setEditing(false) : undefined}
      />
    );
  }
  return <EmailPanel email={email} onChange={onChange} canEdit={canEdit} canSend={canSend} onEdit={() => setEditing(true)} />;
}

function EmailForm({ email, canEdit, onSaved, onCancel }: { email: EmailSettings; canEdit: boolean; onSaved: (e: EmailSettings) => void; onCancel?: () => void }) {
  const [fromName, setFromName] = useState(email.from_name ?? "");
  const [replyTo, setReplyTo] = useState(email.reply_to ?? "");
  const [own, setOwn] = useState(!!email.smtp_host);
  const [fromEmail, setFromEmail] = useState(email.from_email ?? "");
  const [host, setHost] = useState(email.smtp_host ?? "");
  const [port, setPort] = useState(email.smtp_port ? String(email.smtp_port) : "587");
  const [secure, setSecure] = useState(email.smtp_secure);
  const [user, setUser] = useState(email.smtp_user ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    if (!fromName.trim()) return setError("Give the name patients will see as the sender.");
    if (own && !host.trim()) return setError("Give the address of your mail server, or switch own server off.");
    if (own && !fromEmail.trim()) return setError("With your own mail server, give the address the emails come from.");
    const input: EmailSettingsInput = {
      from_name: fromName.trim(),
      ...(replyTo.trim() ? { reply_to: replyTo.trim() } : {}),
      ...(own
        ? {
            smtp_host: host.trim(),
            smtp_port: Number(port) || 587,
            smtp_secure: secure,
            from_email: fromEmail.trim(),
            ...(user.trim() ? { smtp_user: user.trim() } : {}),
            ...(password ? { smtp_password: password } : {}),
          }
        : {}),
    };
    setSaving(true);
    try {
      const saved = await saveEmailSettings(input);
      toast.success("Email sender saved. Send yourself a test to be sure.");
      onSaved(saved);
    } catch (err) {
      setError(errorText(err, "Could not save the email sender."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Email" subtitle="Reminders can also go by email, to the address on the patient file." />
      <CardBody className="space-y-4">
        {!email.uses_platform_mail && !email.configured && (
          <p className="rounded-lg bg-honey-50 px-3 py-2 text-xs text-honey-800 ring-1 ring-inset ring-honey-200">
            This server has no mail server of its own, so emails can only go through your own (below).
          </p>
        )}
        <fieldset disabled={!canEdit || saving} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Sender name" required hint="What patients see in their inbox as the sender, for example your clinic name. No address needed here.">
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} className={inputClass} maxLength={80} />
          </FormField>
          <FormField label="Replies go to" hint="Optional. When a patient hits Reply, the answer lands in this mailbox. Use the address your desk reads.">
            <input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} className={inputClass} dir="ltr" placeholder="desk@yourclinic.com" />
          </FormField>
          <div className="sm:col-span-2">
            <Switch checked={own} onChange={setOwn} label="Send from our own mail server" description="Off: emails go through the platform's mail server with your name as the sender. On: through your Google Workspace, Outlook or hosting mail server, from your own address." />
          </div>
          {own && (
            <>
              <FormField label="Sender address" required hint="The address the emails are sent from, on your provider. Patients see it next to the sender name.">
                <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} className={inputClass} dir="ltr" placeholder="reminders@yourclinic.com" />
              </FormField>
              <FormField label="Mail server (SMTP host)" required hint="Your provider calls it the outgoing server or SMTP server. Gmail: smtp.gmail.com · Microsoft 365: smtp.office365.com · others: see the help below.">
                <input value={host} onChange={(e) => setHost(e.target.value)} className={inputClass} dir="ltr" />
              </FormField>
              <FormField label="Port" hint="The door on the server. 587 works almost everywhere; use 465 only if your provider's page says so (then switch TLS on).">
                <input type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} className={cn(inputClass, "w-32")} />
              </FormField>
              <div className="flex items-end pb-1">
                <Switch checked={secure} onChange={setSecure} label="TLS from the first byte (port 465)" size="sm" />
              </div>
              <FormField label="Login" hint="Almost always your full email address.">
                <input value={user} onChange={(e) => setUser(e.target.value)} className={inputClass} dir="ltr" autoComplete="off" />
              </FormField>
              <FormField label="Password" hint={email.has_smtp_password ? "Saved and hidden. Leave empty to keep it." : "Gmail, Yahoo and Zoho want an app password made in your account's security page, not your sign-in password. Outlook and most hosting providers take the mailbox password."}>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={cn(inputClass, "pe-10")} dir="ltr" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 end-2 text-ink-400 hover:text-ink-700" aria-label={showPassword ? "Hide" : "Show"}>
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </FormField>
            </>
          )}
        </fieldset>
        {error && <p className="rounded-lg border border-brick-200 bg-brick-50 px-3 py-2 text-sm text-brick-800">{error}</p>}
        <div className="space-y-2">
          <WhichOption platformAvailable={email.uses_platform_mail} />
          <GmailSteps />
          <OutlookSteps />
          <HostingSteps />
          <EmailTroubles />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button onClick={() => void save()} disabled={!canEdit || saving}>
            {saving ? "Saving…" : "Save email sender"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function EmailPanel({ email, onChange, canEdit, canSend, onEdit }: { email: EmailSettings; onChange: (e: EmailSettings) => void; canEdit: boolean; canSend: boolean; onEdit: () => void }) {
  const [to, setTo] = useState(email.reply_to ?? "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await testEmail(to.trim() || undefined);
      setResult({ ok: r.ok, text: r.message });
      onChange(r.email);
    } catch (err) {
      setResult({ ok: false, text: errorText(err, "The test could not be sent.") });
    } finally {
      setTesting(false);
    }
  };
  const toggle = async (enabled: boolean) => {
    try {
      onChange(await saveEmailSettings({ from_name: email.from_name ?? "", ...(email.reply_to ? { reply_to: email.reply_to } : {}), enabled }));
      toast.success(enabled ? "Email reminders on." : "Email reminders paused.");
    } catch (err) {
      toast.error(errorText(err, "Could not change it."));
    }
  };
  const remove = async () => {
    setRemoving(true);
    try {
      onChange(await deleteEmailSettings());
      toast.success("Email sender removed.");
      setConfirmRemove(false);
    } catch (err) {
      toast.error(errorText(err, "Could not remove it."));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <FaEnvelope className="text-brand-700" aria-hidden /> Email
          </span>
        }
        subtitle={email.uses_platform_mail ? "Through the platform's mail server, with your name as the sender." : `From ${email.from_email} through ${email.smtp_host}.`}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={email.enabled ? "leaf" : "neutral"} dot>
            {email.enabled ? "Email reminders on" : "Paused"}
          </Badge>
          {email.dry_run && <Badge tone="honey">Test mode: nothing really leaves this server</Badge>}
          <Switch checked={email.enabled} onChange={(v) => void toggle(v)} disabled={!canEdit} label="On" size="sm" />
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <dt className="text-ink-500">Sender name</dt>
          <dd className="text-ink-900">{email.from_name}</dd>
          <dt className="text-ink-500">Replies go to</dt>
          <dd className="text-ink-900" dir="ltr">
            {email.reply_to ?? "the platform default"}
          </dd>
          <dt className="text-ink-500">Last test</dt>
          <dd className="text-ink-900">
            {email.last_test_at ? (
              <span className="inline-flex items-center gap-1">
                {email.last_test_ok ? <FaCheckCircle className="text-leaf-600" aria-hidden /> : <FaExclamationTriangle className="text-brick-600" aria-hidden />}
                {formatDateBeirut(email.last_test_at)}
                {!email.last_test_ok && email.last_error ? ` · ${email.last_error}` : ""}
              </span>
            ) : (
              "never"
            )}
          </dd>
        </dl>
        <div className="rounded-xl border border-ink-200 bg-ink-50/40 p-3">
          <p className="mb-2 text-sm font-medium text-ink-900">Send a test email</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className={cn(inputClass, "max-w-xs")} dir="ltr" placeholder="you@yourclinic.com" disabled={!canSend || testing} />
            <Button size="sm" onClick={() => void runTest()} disabled={!canSend || testing || !to.trim()}>
              <FaPaperPlane className="me-2" />
              {testing ? "Sending…" : "Send test"}
            </Button>
          </div>
          {result && <p className={cn("mt-2 text-sm", result.ok ? "text-leaf-800" : "text-brick-800")}>{result.text}</p>}
        </div>
        <div className="space-y-2">
          <EmailGoodToKnow />
          <EmailTroubles />
          {!email.uses_platform_mail && (
            <>
              <GmailSteps />
              <OutlookSteps />
              <HostingSteps />
            </>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmRemove(true)}>
              Remove
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
          </div>
        )}
      </CardBody>
      {confirmRemove && (
        <Modal isOpen onClose={() => !removing && setConfirmRemove(false)} title="Remove the email sender?" description="No more reminder emails go out. The reminders keep their channel choice and send by email again once a sender is saved." maxWidth="max-w-md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmRemove(false)} disabled={removing}>
                Keep it
              </Button>
              <Button variant="destructive" onClick={() => void remove()} disabled={removing}>
                {removing ? "Removing…" : "Remove"}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-ink-700">The saved mail password is deleted with it.</p>
        </Modal>
      )}
    </Card>
  );
}
