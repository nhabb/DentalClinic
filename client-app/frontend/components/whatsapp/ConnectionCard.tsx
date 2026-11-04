"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FaCheckCircle, FaExclamationTriangle, FaEye, FaEyeSlash, FaPaperPlane, FaWhatsapp } from "react-icons/fa";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatDateBeirut } from "@/lib/utils";
import { ApiError, errorText } from "@/lib/api/request";
import {
  disconnectWhatsApp,
  saveConnection,
  testConnection,
  type MessageLanguage,
  type WhatsAppConnection,
} from "@/lib/api/whatsapp";
import { cleanPasted, CONNECTION_ERROR_TEXT, COUNTRY_CODES } from "./whatsapp-words";
import { DeliveryReceipts, GoodToKnow, NumberInApp, WhereToFind } from "./MetaHelp";

/*
 * The clinic's number. Not connected: a guided form with the values Meta
 * gives and the help to find them. Connected: the number, its state, a test
 * box, and the ways back (edit the ids, replace the token, disconnect).
 */

interface Props {
  connection: WhatsAppConnection;
  onChange: (c: WhatsAppConnection) => void;
  canEdit: boolean;
  canSend: boolean;
}

const plainError = (err: unknown, fallback: string) => {
  const code = err instanceof ApiError ? err.code : undefined;
  return (code && CONNECTION_ERROR_TEXT[code]) || errorText(err, fallback);
};

export function ConnectionCard({ connection, onChange, canEdit, canSend }: Props) {
  const [editing, setEditing] = useState(!connection.configured);
  useEffect(() => {
    if (!connection.configured) setEditing(true);
  }, [connection.configured]);

  if (editing || !connection.configured) {
    return (
      <ConnectForm
        connection={connection}
        canEdit={canEdit}
        onSaved={(c) => {
          onChange(c);
          setEditing(false);
        }}
        onCancel={connection.configured ? () => setEditing(false) : undefined}
      />
    );
  }
  return <ConnectedPanel connection={connection} onChange={onChange} canEdit={canEdit} canSend={canSend} onEdit={() => setEditing(true)} />;
}

// ── Not connected: the guided form ────────────────────────────────────────

function ConnectForm({
  connection,
  canEdit,
  onSaved,
  onCancel,
}: {
  connection: WhatsAppConnection;
  canEdit: boolean;
  onSaved: (c: WhatsAppConnection) => void;
  onCancel?: () => void;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState(connection.phone_number_id ?? "");
  const [wabaId, setWabaId] = useState(connection.waba_id ?? "");
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [countryCode, setCountryCode] = useState(connection.default_country_code || "961");
  const [language, setLanguage] = useState<MessageLanguage>(connection.default_language || "en");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const idLooksLikePhone = (v: string) => /^\+|^0|\s/.test(v) || (v.length > 0 && v.length < 10);
  const tokenLooksShort = token.length > 0 && token.length < 50;

  const save = async () => {
    setError("");
    const pn = cleanPasted(phoneNumberId);
    const wa = cleanPasted(wabaId);
    const tk = cleanPasted(token);
    const sc = cleanPasted(secret);
    if (!/^\d{5,30}$/.test(pn)) return setError("The Phone Number ID is a long number with no + and no spaces.");
    if (!/^\d{5,30}$/.test(wa)) return setError("The WhatsApp Business Account ID is a long number with no + and no spaces.");
    if (!connection.has_access_token && tk.length < 20) return setError("Paste the permanent access token.");
    setSaving(true);
    try {
      const saved = await saveConnection({
        phone_number_id: pn,
        waba_id: wa,
        ...(tk ? { access_token: tk } : {}),
        ...(sc ? { app_secret: sc } : {}),
        default_country_code: countryCode,
        default_language: language,
      });
      toast.success("Saved. Send yourself a test message to be sure.");
      onSaved(saved);
    } catch (err) {
      setError(plainError(err, "Could not save the connection."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<FaWhatsapp />}
        title={connection.configured ? "Edit the connection" : "Connect your WhatsApp Business number"}
        subtitle="Reminders are sent from your own number through Meta's official service. The setup takes about fifteen minutes the first time, and you do it once."
      />
      <CardBody>
        {!canEdit && <p className="mb-4 rounded-xl bg-ink-50 px-3.5 py-2.5 text-xs text-ink-600">Your role can view these settings but not change them.</p>}
        <ol className="mb-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Have a WhatsApp Business account in Meta", "At business.facebook.com, with the clinic's number added under WhatsApp accounts. A number in the WhatsApp Business app on a phone must be moved first; see below."],
            ["Copy three values from Meta", "The Phone Number ID and the WhatsApp Business Account ID from your app's API Setup page, and a permanent token from a System user."],
            ["Paste them here and send a test", "Save, then send a test message to your own phone. If it arrives, you are done."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-xl border border-ink-200 bg-ink-50/50 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink-900">
                <span className="grid size-5 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{i + 1}</span>
                {title}
              </div>
              <p className="text-xs text-ink-600">{body}</p>
            </li>
          ))}
        </ol>

        <fieldset disabled={!canEdit || saving} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Phone Number ID" required hint="A long number with no + and no spaces.">
            <input
              inputMode="numeric"
              dir="ltr"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(cleanPasted(e.target.value))}
              className={inputClass}
              placeholder="123456789012345"
            />
            {idLooksLikePhone(phoneNumberId) && <p className="mt-1 text-xs text-honey-800">This looks like a phone number. Copy the Phone number ID, not the number itself.</p>}
          </FormField>
          <FormField label="WhatsApp Business Account ID" required hint="Also a long number, shown next to the Phone Number ID.">
            <input inputMode="numeric" dir="ltr" value={wabaId} onChange={(e) => setWabaId(cleanPasted(e.target.value))} className={inputClass} placeholder="987654321098765" />
          </FormField>
          <FormField
            label={connection.has_access_token ? "Replace the permanent access token" : "Permanent access token"}
            required={!connection.has_access_token}
            hint={connection.has_access_token ? "Leave blank to keep the saved token." : "Starts with EAA…, usually 150+ characters. Paste it once; it is never shown again."}
            className="sm:col-span-2"
          >
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                autoComplete="off"
                dir="ltr"
                value={token}
                onChange={(e) => setToken(cleanPasted(e.target.value))}
                className={`${inputClass} pe-12 font-mono text-xs`}
                placeholder={connection.has_access_token ? "Saved and hidden" : "EAAB…"}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute inset-y-0 end-2 my-auto grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
                aria-label={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {tokenLooksShort && <p className="mt-1 text-xs text-honey-800">This looks too short for a permanent token. Temporary tokens stop working after 24 hours.</p>}
          </FormField>
          <FormField
            label="App secret (for delivery receipts)"
            hint={connection.has_app_secret ? "Saved and hidden. Leave blank to keep it." : "Optional now. Without it the log stops at Sent; add it when you set up receipts."}
            className="sm:col-span-2"
          >
            <input type="password" autoComplete="off" dir="ltr" value={secret} onChange={(e) => setSecret(cleanPasted(e.target.value))} className={`${inputClass} font-mono text-xs`} placeholder={connection.has_app_secret ? "Saved and hidden" : ""} />
          </FormField>
          <FormField label="Country code for numbers saved without one" hint="A patient saved as 03 123 456 is sent to +961 3 123 456.">
            <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className={inputClass}>
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
              {!COUNTRY_CODES.some((c) => c.code === countryCode) && <option value={countryCode}>+{countryCode}</option>}
            </select>
          </FormField>
          <FormField label="Language for doctors' messages" hint="Also used for patients whose file has no language.">
            <select value={language} onChange={(e) => setLanguage(e.target.value as MessageLanguage)} className={inputClass}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </FormField>
        </fieldset>

        {error && <p className="mt-4 rounded-lg border border-brick-200 bg-brick-50 px-3 py-2 text-sm text-brick-800">{error}</p>}

        {canEdit && (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {onCancel && (
              <Button variant="outline" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        )}

        <div className="mt-6 space-y-2">
          <WhereToFind />
          <NumberInApp />
          <GoodToKnow />
        </div>
      </CardBody>
    </Card>
  );
}

// ── Connected ─────────────────────────────────────────────────────────────

function ConnectedPanel({
  connection,
  onChange,
  canEdit,
  canSend,
  onEdit,
}: {
  connection: WhatsAppConnection;
  onChange: (c: WhatsAppConnection) => void;
  canEdit: boolean;
  canSend: boolean;
  onEdit: () => void;
}) {
  const [to, setTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await testConnection(to.trim() || undefined);
      const text = r.ok
        ? `${r.message}${to.trim() ? " Meta's standard hello_world message is used, so this works before your own wording is approved." : ""}`
        : (r.code && CONNECTION_ERROR_TEXT[r.code]) || r.message;
      setResult({ ok: r.ok, text });
      onChange(r.connection);
      if (r.ok) toast.success("Connected.");
    } catch (err) {
      setResult({ ok: false, text: plainError(err, "The test did not go through.") });
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const c = await disconnectWhatsApp();
      onChange(c);
      toast.success("Disconnected. Reminders are off.");
      setConfirmDisconnect(false);
    } catch (err) {
      toast.error(errorText(err, "Could not disconnect."));
    } finally {
      setDisconnecting(false);
    }
  };

  const isError = connection.status === "error";
  return (
    <>
      <Card>
        <CardHeader
          icon={<FaWhatsapp />}
          title="Your WhatsApp Business number"
          subtitle={isError ? "Meta refused the saved credentials. Fix them below." : "Reminders are sent from this number through Meta's official service."}
          action={
            isError ? (
              <Badge tone="brick" dot>
                Needs attention
              </Badge>
            ) : connection.status === "connected" ? (
              <Badge tone="leaf" dot>
                Connected
              </Badge>
            ) : (
              <Badge tone="honey" dot>
                Not tested yet
              </Badge>
            )
          }
        />
        <CardBody>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="font-display text-2xl font-bold tabular-nums text-ink-900" dir="ltr">
                {connection.display_phone ?? "Number not read yet"}
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="w-44 shrink-0 text-ink-500">Phone Number ID</dt>
                  <dd className="font-mono text-xs text-ink-800" dir="ltr">
                    {connection.phone_number_id}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-44 shrink-0 text-ink-500">Business Account ID</dt>
                  <dd className="font-mono text-xs text-ink-800" dir="ltr">
                    {connection.waba_id}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-44 shrink-0 text-ink-500">Access token</dt>
                  <dd className="text-ink-800">Saved and hidden</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-44 shrink-0 text-ink-500">App secret</dt>
                  <dd className="text-ink-800">{connection.has_app_secret ? "Saved and hidden" : "Not added (no delivery receipts)"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-44 shrink-0 text-ink-500">Last test</dt>
                  <dd className="text-ink-800">
                    {connection.last_test_at ? `${formatDateBeirut(connection.last_test_at)} · ${connection.last_test_ok ? "passed" : "failed"}` : "Never tested"}
                  </dd>
                </div>
              </dl>
              {isError && connection.last_error && (
                <p className="flex items-start gap-2 rounded-lg border border-brick-200 bg-brick-50 px-3 py-2 text-sm text-brick-800">
                  <FaExclamationTriangle className="mt-0.5 shrink-0" aria-hidden />
                  <span>{connection.last_error}</span>
                </p>
              )}
              {canEdit && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant={isError ? "default" : "outline"} size="sm" onClick={onEdit}>
                    {isError ? "Enter new credentials" : "Edit IDs or replace token"}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-brick-700" onClick={() => setConfirmDisconnect(true)}>
                    Disconnect
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-ink-200 bg-ink-50/60 p-4">
              <div className="mb-1 text-sm font-semibold text-ink-900">Send a test message</div>
              <p className="mb-3 text-xs text-ink-600">Your own number is best. Leave it empty to only check the credentials with Meta.</p>
              <FormField label="To">
                <input dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} placeholder="+961 3 123 456" disabled={!canSend} />
              </FormField>
              <Button className="mt-3" size="sm" onClick={() => void test()} disabled={!canSend || testing}>
                <FaPaperPlane className="me-2" />
                {testing ? "Checking with Meta…" : to.trim() ? "Send test message" : "Check connection"}
              </Button>
              {result && (
                <p className={`mt-3 flex items-start gap-2 text-sm ${result.ok ? "text-leaf-800" : "text-brick-800"}`}>
                  {result.ok ? <FaCheckCircle className="mt-0.5 shrink-0" /> : <FaExclamationTriangle className="mt-0.5 shrink-0" />}
                  <span>{result.text}</span>
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <DeliveryReceipts webhookUrl={connection.webhook_url} verifyToken={connection.verify_token} hasSecret={connection.has_app_secret} />
            <NumberInApp />
            <GoodToKnow />
          </div>
          <p className="mt-4 text-xs text-ink-500">Patients' replies arrive in your Meta Business Suite inbox, not here.</p>
        </CardBody>
      </Card>

      <Modal
        isOpen={confirmDisconnect}
        onClose={() => !disconnecting && setConfirmDisconnect(false)}
        title={`Disconnect ${connection.display_phone ?? "this number"}?`}
        description="Reminders stop at once. Your wording and schedule are kept, and the IDs stay filled in so you can reconnect later."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDisconnect(false)} disabled={disconnecting}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => void disconnect()} disabled={disconnecting}>
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600">You will need to paste the access token again to reconnect.</p>
      </Modal>
    </>
  );
}
