"use client";

import type { ReactNode } from "react";
import { FaChevronDown } from "react-icons/fa";

/*
 * The help a non-technical owner needs to set email reminders up, in plain
 * words and in the order the clicks happen: which option to pick, then
 * where each value is found in Gmail, Outlook and a hosting provider, then
 * what to do when the test fails. Each block is a <details> so the card
 * stays short until a question comes up.
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

/** A value to type into the form, shown the way it must be typed. */
const V = ({ children }: { children: ReactNode }) => <code className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[12px] text-ink-900">{children}</code>;

export function WhichOption({ platformAvailable }: { platformAvailable: boolean }) {
  return (
    <Expander title="Which option should I pick?" defaultOpen>
      <p>
        <strong>Simplest: leave &quot;own mail server&quot; off.</strong> You only type the name patients should see and the address replies should go to.
        The platform sends the emails for you{platformAvailable ? "" : " (not available on this server yet: ask the platform to set its mail server up, or use your own)"}.
        Nothing to find anywhere.
      </p>
      <p>
        <strong>Your own mail server</strong> means the emails leave from your own address (for example reminders@yourclinic.com) and show your domain.
        Pick this if you want replies and bounces in your own mailbox, or if your emails land in spam through the platform.
        It takes five values from wherever your clinic email lives: Gmail / Google Workspace, Outlook / Microsoft 365, or the company that hosts your website and email.
      </p>
      <p className="text-xs text-ink-500">
        The words, in plain terms: the <em>mail server</em> is the address of the computer that sends mail for your provider; the <em>port</em> is the door it listens on (587 for almost everyone); the <em>login</em> is usually your email address itself; the <em>password</em> is a special one most providers make you create for apps, not the one you type to sign in.
      </p>
    </Expander>
  );
}

export function GmailSteps() {
  return (
    <Expander title="My clinic email is Gmail or Google Workspace">
      <Step n={1}>
        Google does not accept your normal password from an app. First switch on <strong>2-Step Verification</strong>: go to myaccount.google.com → Security → 2-Step Verification → Get started, and follow it (a phone number is enough).
      </Step>
      <Step n={2}>
        Then make an <strong>app password</strong>: myaccount.google.com → Security → search for &quot;App passwords&quot; (or open myaccount.google.com/apppasswords) → type a name such as &quot;Clinic reminders&quot; → Create. Google shows 16 letters in groups of four. Copy them now; they are shown once. Spaces do not matter.
      </Step>
      <Step n={3}>
        Fill the form: Sender address <V>your address, e.g. reminders@yourclinic.com or you@gmail.com</V> · Mail server <V>smtp.gmail.com</V> · Port <V>587</V> · TLS from the first byte <strong>off</strong> · Login <V>the same address</V> · Password <V>the 16-letter app password</V>.
      </Step>
      <Step n={4}>
        Save, then send yourself a test. If Google refuses with &quot;Username and Password not accepted&quot;, the password is the sign-in one, not the app password, or 2-Step Verification is off.
      </Step>
      <p className="text-xs text-ink-500">Google Workspace with an administrator: if app passwords are missing, the admin has to allow &quot;less secure apps&quot; or app passwords in admin.google.com → Security → Access and data control.</p>
    </Expander>
  );
}

export function OutlookSteps() {
  return (
    <Expander title="My clinic email is Outlook, Hotmail or Microsoft 365">
      <Step n={1}>
        Fill the form: Sender address <V>your address</V> · Mail server <V>smtp.office365.com</V> (for a personal outlook.com or hotmail.com address: <V>smtp-mail.outlook.com</V>) · Port <V>587</V> · TLS from the first byte <strong>off</strong> · Login <V>the same address</V>.
      </Step>
      <Step n={2}>
        <strong>Password</strong>: if your account has no two-step sign-in, it is your normal password. With two-step sign-in, make an app password at account.microsoft.com → Security → Advanced security options → App passwords → Create a new app password.
      </Step>
      <Step n={3}>
        Microsoft 365 with an administrator: sending from an app must be allowed for the mailbox. The admin opens admin.microsoft.com → Users → Active users → your user → Mail → Manage email apps → tick <strong>Authenticated SMTP</strong> → Save. Without it the test says &quot;SMTP AUTH is disabled&quot;.
      </Step>
      <Step n={4}>Save, then send yourself a test.</Step>
    </Expander>
  );
}

export function HostingSteps() {
  return (
    <Expander title="My clinic email comes with our website (Hostinger, GoDaddy, Namecheap, OVH, cPanel, Zoho…)">
      <Step n={1}>
        Sign in where you manage the website or the email, and look for <strong>Email accounts</strong> → your address → <strong>Configure email client</strong>, &quot;Connect devices&quot;, &quot;Manual settings&quot; or &quot;SMTP settings&quot;. Every provider has such a page; it lists an <em>outgoing server</em> (that is the mail server), a port and whether SSL/TLS is used.
      </Step>
      <Step n={2}>
        Copy the <strong>outgoing (SMTP) server</strong> into Mail server. Common ones: Hostinger <V>smtp.hostinger.com</V>, GoDaddy <V>smtpout.secureserver.net</V>, Namecheap Private Email <V>mail.privateemail.com</V>, Zoho <V>smtp.zoho.com</V>, OVH <V>ssl0.ovh.net</V>, Yahoo <V>smtp.mail.yahoo.com</V>, cPanel hosting usually <V>mail.yourdomain.com</V>.
      </Step>
      <Step n={3}>
        <strong>Port and TLS</strong>: if the page says port <V>587</V> (STARTTLS), leave &quot;TLS from the first byte&quot; off. If it says port <V>465</V> (SSL/TLS), switch it on. When both are listed, 587 off is the safe choice.
      </Step>
      <Step n={4}>
        <strong>Login</strong> is your full email address almost everywhere; <strong>Password</strong> is the mailbox password (Yahoo and Zoho want an app password made in their security settings, like Gmail).
      </Step>
      <Step n={5}>Save, then send yourself a test. If it fails, the error under &quot;Last test&quot; says which of the five values is wrong (see below).</Step>
    </Expander>
  );
}

export function EmailTroubles() {
  return (
    <Expander title="The test failed, or emails land in spam">
      <p>
        <strong>&quot;authentication failed&quot;, &quot;Username and Password not accepted&quot;, &quot;535&quot;</strong>: the login or the password. Gmail, Yahoo and Zoho want an app password; Microsoft 365 wants Authenticated SMTP on. Type the address in full as the login.
      </p>
      <p>
        <strong>&quot;connection timed out&quot;, &quot;ECONNREFUSED&quot;, &quot;greeting never received&quot;</strong>: the mail server name or the port. Check the spelling against your provider&apos;s page, and try the other port (587 with TLS off, or 465 with TLS on).
      </p>
      <p>
        <strong>&quot;wrong version number&quot;, &quot;certificate&quot;</strong>: the TLS switch is the other way round for this port.
      </p>
      <p>
        <strong>&quot;SMTP AUTH is disabled&quot;</strong>: Microsoft 365, see the Outlook steps (the administrator ticks Authenticated SMTP for the mailbox).
      </p>
      <p>
        <strong>The test says sent but nothing arrives</strong>: look in spam; then check the sender address exists and the provider allows sending from it. Through the platform, ask the platform to add your domain to its sender records; through your own server, ask your provider about SPF and DKIM for your domain (one-time, on their side).
      </p>
      <p>
        <strong>Nothing to fill at all</strong>: leave &quot;own mail server&quot; off. The platform sends with your name, and you only give the reply-to address.
      </p>
    </Expander>
  );
}

export function EmailGoodToKnow() {
  return (
    <Expander title="Good to know">
      <p>Each reminder chooses WhatsApp, email or both under Reminders. An email uses the same wording as WhatsApp, with the names and dates filled in, and needs no approval from anyone.</p>
      <p>The address comes from the patient file. A patient with no email, or who asked for no emails (the switch on their file), is skipped and the reason shows in Messages.</p>
      <p>Every email is logged in Messages like a WhatsApp message and can be retried. Patients reply to the &quot;Replies go to&quot; address, never to the platform.</p>
      <p>Changing the password or the server later is one Edit; the saved password is never shown again, only replaced.</p>
    </Expander>
  );
}
