"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { safeStorage } from "@/lib/browser-compat";
import en from "./translations/en.json";
import fr from "./translations/fr.json";
import ar from "./translations/ar.json";

export type Language = "en" | "fr" | "ar";

type Translations = typeof en;

const TRANSLATIONS: Record<Language, Translations> = { en, fr, ar };

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
  isRTL: false,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const saved = safeStorage.getItem("language") as Language;
    if (saved && ["en", "fr", "ar"].includes(saved)) {
      setLanguageState(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    safeStorage.setItem("language", lang);
  }, []);

  const t = useCallback((key: string): string => {
    const keys = key.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = TRANSLATIONS[language];
    for (const k of keys) {
      if (value && typeof value === "object") {
        value = value[k];
      } else {
        return key;
      }
    }
    return typeof value === "string" ? value : key;
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, isRTL: language === "ar" }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
