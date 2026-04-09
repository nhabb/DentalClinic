"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslation } from "@/lib/i18n";

export default function Hero() {
  const { t } = useTranslation();

  return (
    <section className="pt-24 pb-16 md:pt-32 md:pb-24 gradient-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left Column - Text Content */}
          <div className="text-center md:text-left rtl:md:text-right animate-fadeIn">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              {t("landing.heroTitle")}
              <span className="block text-dental-blue">{t("landing.heroBrand")}</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl">
              {t("landing.heroSubtitle")}
            </p>

            <div className="flex justify-center md:justify-start">
              <Link
                href="/login"
                className="bg-dental-blue text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-700 transition-all transform hover:scale-105 shadow-lg"
              >
                {t("landing.patientPortal")}
              </Link>
            </div>
          </div>

          {/* Right Column - Hero Image */}
          <div className="relative animate-fadeIn">
            <div className="relative rounded-2xl overflow-hidden shadow-xl">
              <Image
                src="/landing.jpg"
                alt="Professional dental care"
                width={600}
                height={400}
                className="w-full h-auto object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
