"use client";

import { useTranslation } from "@/lib/i18n";

type Props = {
  variant?: "light" | "dark";
};

export default function LanguageSwitcher({ variant = "light" }: Props) {
  const { language, setLanguage } = useTranslation();

  const containerClass =
    variant === "dark"
      ? "flex items-center gap-1 bg-white/20 rounded-lg p-1"
      : "flex items-center gap-1 bg-gray-100 rounded-lg p-1";

  const activeClass =
    "bg-white text-gray-900 shadow-sm";

  const inactiveClass =
    variant === "dark"
      ? "text-white/80 hover:text-white"
      : "text-gray-500 hover:text-gray-700";

  return (
    <div className={containerClass}>
      {(["en", "fr", "ar"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            language === lang ? activeClass : inactiveClass
          }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
