"use client";

import { I18nProvider } from "@/lib/i18n";
import CookieBanner from "@/components/legal/CookieBanner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      {children}
      <CookieBanner />
    </I18nProvider>
  );
}
