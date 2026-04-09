"use client";

import Link from "next/link";
import { FaTooth } from "react-icons/fa";
import { useTranslation } from "@/lib/i18n";

export default function TermsOfServicePage() {
  const { t } = useTranslation();

  const sections = [
    { title: t("termsOfService.s1Title"), body: t("termsOfService.s1Body") },
    { title: t("termsOfService.s2Title"), body: t("termsOfService.s2Body") },
    { title: t("termsOfService.s3Title"), body: t("termsOfService.s3Body") },
    { title: t("termsOfService.s4Title"), body: t("termsOfService.s4Body") },
    { title: t("termsOfService.s5Title"), body: t("termsOfService.s5Body") },
    { title: t("termsOfService.s6Title"), body: t("termsOfService.s6Body") },
    { title: t("termsOfService.s7Title"), body: t("termsOfService.s7Body") },
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
            {t("termsOfService.backHome")}
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {t("termsOfService.title")}
          </h1>
          <p className="text-sm text-gray-500">{t("termsOfService.lastUpdated")}</p>
          <div className="mt-4 h-1 w-16 bg-gradient-to-r from-dental-blue to-dental-teal rounded-full" />
        </div>

        {/* Intro */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-8">
          <p className="text-gray-700 leading-relaxed">{t("termsOfService.intro")}</p>
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
              {t("termsOfService.contactTitle")}
            </h2>
            <p className="leading-relaxed opacity-90">{t("termsOfService.contactBody")}</p>
          </div>
        </div>

        {/* Footer link */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <Link href="/" className="hover:text-dental-blue transition-colors">
            {t("termsOfService.backHome")}
          </Link>
          <Link href="/privacy-policy" className="hover:text-dental-blue transition-colors">
            {t("landing.privacyPolicy")}
          </Link>
        </div>
      </main>
    </div>
  );
}
