"use client";

import Link from "next/link";
import { FaTooth } from "react-icons/fa";
import { useTranslation } from "@/lib/i18n";
import { openCookieSettings } from "@/lib/consent";

/**
 * Everything this site stores in the browser. Keep the table in step with the
 * code: a new cookie or storage key needs a row here (and, if it is not
 * essential, a consent check through lib/consent.ts before it is set).
 */
const ITEMS: { name: string; key: string; kind: "cookie" | "local" | "session" }[] = [
  { name: "bs_session", key: "session", kind: "cookie" },
  { name: "bs_csrf", key: "csrf", kind: "cookie" },
  { name: "bs_cookie_consent", key: "consent", kind: "cookie" },
  { name: "sb-…-auth-token", key: "supabase", kind: "local" },
  { name: "language", key: "language", kind: "local" },
  { name: "patientsView", key: "view", kind: "local" },
  { name: "userRole, userId, adminUser…", key: "hints", kind: "session" },
];

export default function CookiePolicyPage() {
  const { t } = useTranslation();

  const sections = [1, 2, 3, 4, 5].map((n) => ({
    title: t(`cookiePolicy.s${n}Title`),
    body: t(`cookiePolicy.s${n}Body`),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-brand to-brand-400 rounded-lg flex items-center justify-center">
              <FaTooth className="text-white text-sm" />
            </div>
            <span className="text-lg font-bold text-gray-900">BrightSmile</span>
          </Link>
          <Link href="/" className="text-sm text-brand hover:text-brand-400 transition-colors font-medium">
            {t("privacyPolicy.backHome")}
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{t("cookiePolicy.title")}</h1>
          <p className="text-sm text-gray-500">{t("cookiePolicy.lastUpdated")}</p>
          <div className="mt-4 h-1 w-16 bg-gradient-to-r from-brand to-brand-400 rounded-full" />
        </div>

        <div className="bg-teal-50 border border-teal-100 rounded-xl p-6 mb-8">
          <p className="text-gray-700 leading-relaxed">{t("cookiePolicy.intro")}</p>
        </div>

        <div className="space-y-8">
          {sections.slice(0, 2).map((section) => (
            <Section key={section.title} {...section} />
          ))}

          {/* What is stored, one row per item */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t("cookiePolicy.tableTitle")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-start">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th scope="col" className="py-2 pe-4 text-start font-medium">{t("cookiePolicy.colName")}</th>
                    <th scope="col" className="py-2 pe-4 text-start font-medium">{t("cookiePolicy.colPurpose")}</th>
                    <th scope="col" className="py-2 pe-4 text-start font-medium">{t("cookiePolicy.colType")}</th>
                    <th scope="col" className="py-2 text-start font-medium">{t("cookiePolicy.colDuration")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ITEMS.map((item) => (
                    <tr key={item.key} className="border-b border-gray-100 align-top">
                      <td className="py-3 pe-4 font-mono text-xs text-gray-900 whitespace-nowrap">{item.name}</td>
                      <td className="py-3 pe-4 text-gray-600">{t(`cookiePolicy.items.${item.key}.purpose`)}</td>
                      <td className="py-3 pe-4 text-gray-600 whitespace-nowrap">{t(`cookiePolicy.kind.${item.kind}`)}</td>
                      <td className="py-3 text-gray-600">{t(`cookiePolicy.items.${item.key}.duration`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {sections.slice(2).map((section) => (
            <Section key={section.title} {...section} />
          ))}

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-gray-600">{t("cookiePolicy.changeChoice")}</p>
            <button
              type="button"
              onClick={openCookieSettings}
              className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              {t("cookies.settingsLink")}
            </button>
          </div>

          <div className="bg-gradient-to-br from-brand to-brand-400 rounded-xl p-6 text-white shadow-sm">
            <h2 className="text-xl font-semibold mb-3">{t("privacyPolicy.contactTitle")}</h2>
            <p className="leading-relaxed opacity-90">{t("cookiePolicy.contactBody")}</p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <Link href="/privacy-policy" className="hover:text-brand transition-colors">
            {t("landing.privacyPolicy")}
          </Link>
          <Link href="/terms-of-service" className="hover:text-brand transition-colors">
            {t("landing.termsOfService")}
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>
      <p className="text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}
