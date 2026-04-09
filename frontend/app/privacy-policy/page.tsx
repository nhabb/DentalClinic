"use client";

import Link from "next/link";
import { FaTooth } from "react-icons/fa";
import { useTranslation } from "@/lib/i18n";

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();

  const sections = [
    { title: t("privacyPolicy.s1Title"), body: t("privacyPolicy.s1Body") },
    { title: t("privacyPolicy.s2Title"), body: t("privacyPolicy.s2Body") },
    { title: t("privacyPolicy.s3Title"), body: t("privacyPolicy.s3Body") },
    { title: t("privacyPolicy.s4Title"), body: t("privacyPolicy.s4Body") },
    { title: t("privacyPolicy.s5Title"), body: t("privacyPolicy.s5Body") },
    { title: t("privacyPolicy.s6Title"), body: t("privacyPolicy.s6Body") },
    { title: t("privacyPolicy.s7Title"), body: t("privacyPolicy.s7Body") },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
              <FaTooth className="text-white text-sm" />
            </div>
            <span className="text-lg font-bold text-gray-900">BrightSmile</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-dental-blue hover:text-dental-teal transition-colors font-medium"
          >
            {t("privacyPolicy.backHome")}
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {t("privacyPolicy.title")}
          </h1>
          <p className="text-sm text-gray-500">{t("privacyPolicy.lastUpdated")}</p>
          <div className="mt-4 h-1 w-16 bg-gradient-to-r from-dental-blue to-dental-teal rounded-full" />
        </div>

        {/* Intro */}
        <div className="bg-teal-50 border border-teal-100 rounded-xl p-6 mb-8">
          <p className="text-gray-700 leading-relaxed">{t("privacyPolicy.intro")}</p>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {sections.map((section, index) => (
            <div key={index} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                {section.title}
              </h2>
              <p className="text-gray-600 leading-relaxed">{section.body}</p>
            </div>
          ))}

          {/* Contact */}
          <div className="bg-gradient-to-br from-dental-blue to-dental-teal rounded-xl p-6 text-white shadow-sm">
            <h2 className="text-xl font-semibold mb-3">
              {t("privacyPolicy.contactTitle")}
            </h2>
            <p className="leading-relaxed opacity-90">{t("privacyPolicy.contactBody")}</p>
          </div>
        </div>

        {/* Footer link */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <Link href="/" className="hover:text-dental-blue transition-colors">
            {t("privacyPolicy.backHome")}
          </Link>
          <Link href="/terms-of-service" className="hover:text-dental-blue transition-colors">
            {t("landing.termsOfService")}
          </Link>
        </div>
      </main>
    </div>
  );
}
