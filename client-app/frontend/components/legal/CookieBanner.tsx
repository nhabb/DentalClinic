"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { FaCookieBite } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import {
  OPEN_COOKIE_SETTINGS_EVENT,
  readConsent,
  saveConsent,
} from "@/lib/consent";

/**
 * Shown until the visitor chooses, and again from any "Cookie settings" link.
 * "Accept all" and "Essential only" are equally prominent on purpose: refusing
 * must be as easy as accepting. It does not block the page; essential cookies
 * work either way, and nothing optional loads before a "yes".
 */
export default function CookieBanner() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    // Read in an effect: the cookie only exists in the browser.
    if (!readConsent()) setOpen(true);
    const reopen = () => {
      setAnalytics(readConsent()?.analytics ?? false);
      setCustomising(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  const choose = (choice: { analytics: boolean }) => {
    saveConsent(choice);
    setOpen(false);
    setCustomising(false);
  };

  if (!open) return null;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-body"
      className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-ink-200 bg-card p-4 shadow-xl sm:p-5">
        <div className="flex items-start gap-3">
          <FaCookieBite className="mt-0.5 shrink-0 text-xl text-brand-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="cookie-banner-title" className="text-sm font-semibold text-ink-900">
              {t("cookies.bannerTitle")}
            </h2>
            <p id="cookie-banner-body" className="mt-1 text-sm leading-relaxed text-ink-600">
              {t("cookies.bannerBody")}{" "}
              <Link href="/cookie-policy" className="font-medium text-brand-700 underline underline-offset-2">
                {t("cookies.policyLink")}
              </Link>
            </p>

            {customising && (
              <fieldset className="mt-4 space-y-3">
                <legend className="sr-only">{t("cookies.settingsTitle")}</legend>
                <CategoryRow
                  title={t("cookies.essentialTitle")}
                  body={t("cookies.essentialBody")}
                  checked
                  disabled
                  stateLabel={t("cookies.alwaysOn")}
                />
                <CategoryRow
                  title={t("cookies.analyticsTitle")}
                  body={t("cookies.analyticsBody")}
                  checked={analytics}
                  onChange={setAnalytics}
                />
              </fieldset>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {customising ? (
                <Button size="sm" onClick={() => choose({ analytics })}>
                  {t("cookies.saveChoices")}
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={() => choose({ analytics: true })}>
                    {t("cookies.acceptAll")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => choose({ analytics: false })}>
                    {t("cookies.essentialOnly")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCustomising(true)}>
                    {t("cookies.customise")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoryRow(props: {
  title: string;
  body: string;
  checked: boolean;
  disabled?: boolean;
  stateLabel?: string;
  onChange?: (value: boolean) => void;
}) {
  // useId, not the title: \W strips every Arabic letter, so both rows got
  // the same id and the Analytics label toggled the Essential checkbox.
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-ink-200 p-3">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{props.title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-600">{props.body}</span>
      </label>
      <div className="flex shrink-0 items-center gap-2">
        {props.stateLabel && <span className="text-xs text-ink-500">{props.stateLabel}</span>}
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={props.checked}
          checked={props.checked}
          disabled={props.disabled}
          onChange={(e) => props.onChange?.(e.target.checked)}
          className="h-5 w-5 accent-brand-600 disabled:opacity-60"
        />
      </div>
    </div>
  );
}
