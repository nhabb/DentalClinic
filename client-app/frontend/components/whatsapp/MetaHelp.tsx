"use client";

import type { ReactNode } from "react";
import { FaChevronDown } from "react-icons/fa";

/*
 * The help a non-technical owner needs, in plain words and in the order the
 * clicks happen. Each block is a <details> so the card stays short until a
 * question comes up.
 */

function Expander({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-xl border border-ink-200 bg-ink-50/50 open:bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
        {title}
        <FaChevronDown className="size-3 shrink-0 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-2 border-t border-ink-100 px-4 py-3 text-sm text-ink-700">{children}</div>
    </details>
  );
}

const Step = ({ n, children }: { n: number; children: ReactNode }) => (
  <p className="flex gap-3">
    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-800">{n}</span>
    <span>{children}</span>
  </p>
);

export function WhereToFind() {
  return (
    <Expander title="Where do I find these in Meta?">
      <Step n={1}>
        <strong>Phone Number ID</strong> and <strong>WhatsApp Business Account ID</strong>: go to developers.facebook.com → My Apps →
        your app → WhatsApp → API Setup. Both are shown in the "Send and receive messages" box. Copy the long numbers, not the phone
        number itself.
      </Step>
      <Step n={2}>
        <strong>Permanent access token</strong>: business.facebook.com → Settings → Business settings → Users → System users → Add
        (name it "Clinic reminders", role Admin) → Assign assets → your app, full control → Generate new token → choose your app,
        expiry <em>Never</em>, tick <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code> → Generate.
        Copy it right away; Meta will not show it again.
      </Step>
      <Step n={3}>
        Do <strong>not</strong> use the temporary token shown on the API Setup page: it stops after 24 hours and your reminders stop with it.
      </Step>
      <Step n={4}>
        <strong>App secret</strong> (for delivery receipts): developers.facebook.com → your app → App settings → Basic → App secret → Show.
      </Step>
      <Step n={5}>
        <strong>Payment method</strong>: in WhatsApp Manager → Payment settings, add a card. Without one, Meta allows only a few test messages.
      </Step>
    </Expander>
  );
}

export function NumberInApp() {
  return (
    <Expander title="My number is in the WhatsApp Business app on a phone">
      <p>A number can be in the app or in the API, not both. To send reminders from this system, the number must be moved to the API, once.</p>
      <Step n={1}>Back up your chats in the app if you want to keep them.</Step>
      <Step n={2}>
        In Meta: WhatsApp Manager → Phone numbers → Add phone number → enter the same number → when asked, choose to migrate it from the
        app. You will get a code by SMS or call on that number.
      </Step>
      <Step n={3}>
        After the move the number no longer works in the app on the phone. Patients' replies arrive in Meta Business Suite → Inbox (on
        the web or in the Business Suite app), not here.
      </Step>
      <p className="text-ink-500">Many clinics keep their everyday number in the app and use a second number for reminders. Either is fine.</p>
    </Expander>
  );
}

export function GoodToKnow() {
  return (
    <Expander title="Good to know: cost and limits">
      <ul className="list-disc space-y-1 ps-5">
        <li>Meta charges a small fee per conversation (a 24-hour window per patient). The first 1,000 service conversations each month are free.</li>
        <li>A new number may message 250 patients a day at first; Meta raises the limit by itself as messages are delivered without complaints.</li>
        <li>A patient who blocks or reports the number shows as Failed here.</li>
        <li>The name patients see is the one Meta approved for the number (WhatsApp Manager → Phone numbers).</li>
      </ul>
    </Expander>
  );
}

export function DeliveryReceipts({ webhookUrl, verifyToken, hasSecret }: { webhookUrl: string | null; verifyToken: string | null; hasSecret: boolean }) {
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* the field is selectable */
    }
  };
  return (
    <Expander title="Delivery receipts (recommended)">
      <p>
        So the log can say <em>Delivered</em> and <em>Read</em>, tell Meta where to send receipts: developers.facebook.com → your app →
        WhatsApp → Configuration → Webhook → Edit: paste the Callback URL and the Verify token below, press Verify and save, then subscribe
        to <code>messages</code>. Without this, every message stays at <em>Sent</em>.
      </p>
      {!hasSecret && (
        <p className="rounded-lg bg-honey-50 px-3 py-2 text-xs text-honey-800 ring-1 ring-inset ring-honey-200">
          Receipts are checked against your app secret. Add it on this page (Edit IDs → App secret) or Meta's receipts will be refused.
        </p>
      )}
      {webhookUrl ? (
        <div className="space-y-2">
          <Field label="Callback URL" value={webhookUrl} onCopy={copy} />
          <Field label="Verify token" value={verifyToken ?? ""} onCopy={copy} />
        </div>
      ) : (
        <p className="text-ink-500">The address appears once the number is saved.</p>
      )}
    </Expander>
  );
}

function Field({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-ink-600">{label}</div>
      <div className="flex items-center gap-2">
        <input readOnly value={value} dir="ltr" className="h-9 w-full rounded-lg border border-ink-200 bg-ink-50 px-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={() => onCopy(value)} className="press h-9 shrink-0 rounded-lg border border-ink-200 px-3 text-xs font-medium hover:bg-ink-50">
          Copy
        </button>
      </div>
    </div>
  );
}
