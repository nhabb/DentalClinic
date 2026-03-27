"use client";

import Link from "next/link";
import { FaTooth } from "react-icons/fa";
import { Menu } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

// Client Component - Navigation Bar
export default function Navbar() {
  const { t, language, setLanguage } = useTranslation();

  const navLinks = [
    { href: "#services", label: t("landing.services") },
    { href: "#about", label: t("landing.about") },
    { href: "#credentials", label: t("landing.credentials") },
  ];

  return (
    <nav className="fixed w-full bg-white/95 backdrop-blur-sm z-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Logo />

          {/* Desktop Navigation */}
          <DesktopNav
            navLinks={navLinks}
            patientPortalLabel={t("landing.patientPortal")}
            language={language}
            setLanguage={setLanguage}
          />

          {/* Mobile Menu Button */}
          <MobileMenuButton />
        </div>
      </div>
    </nav>
  );
}

// Reusable Logo Component
export function Logo() {
  return (
    <div className="flex items-center">
      <Link href="/" className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
          <FaTooth className="text-white text-lg" />
        </div>
        <span className="text-xl font-bold text-gray-900">BrightSmile</span>
      </Link>
    </div>
  );
}

// Reusable Desktop Navigation Component
function DesktopNav({
  navLinks,
  patientPortalLabel,
  language,
  setLanguage,
}: {
  navLinks: Array<{ href: string; label: string }>;
  patientPortalLabel: string;
  language: string;
  setLanguage: (lang: "en" | "fr" | "ar") => void;
}) {
  return (
    <div className="hidden md:flex items-center space-x-6">
      {navLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-gray-700 hover:text-dental-blue transition-colors font-medium"
        >
          {link.label}
        </Link>
      ))}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        {(["en", "fr", "ar"] as const).map((lang) => (
          <button
            key={lang}
            onClick={() => setLanguage(lang)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              language === lang
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>
      <Link
        href="/login"
        className="bg-dental-blue text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-all transform hover:scale-105 font-semibold shadow-md"
      >
        {patientPortalLabel}
      </Link>
    </div>
  );
}

// Reusable Mobile Menu Button Component
function MobileMenuButton() {
  return (
    <div className="md:hidden">
      <button
        className="text-gray-700 hover:text-dental-blue"
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>
    </div>
  );
}
