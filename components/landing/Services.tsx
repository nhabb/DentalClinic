"use client";

import {
  CheckCircle,
  Sparkles,
  Shield,
  Zap,
  Smile,
  Wrench,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function Services() {
  const { t } = useTranslation();

  const services = [
    {
      icon: <CheckCircle className="w-8 h-8" />,
      title: t("landing.generalDentistry"),
      description: t("landing.generalDentistryDesc"),
    },
    {
      icon: <Sparkles className="w-8 h-8" />,
      title: t("landing.cosmeticDentistry"),
      description: t("landing.cosmeticDentistryDesc"),
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: t("landing.orthodontics"),
      description: t("landing.orthodonticsDesc"),
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: t("landing.implantsRestorations"),
      description: t("landing.implantsRestorationsDesc"),
    },
    {
      icon: <Wrench className="w-8 h-8" />,
      title: t("landing.emergencyDentalCare"),
      description: t("landing.emergencyDentalCareDesc"),
    },
    {
      icon: <Smile className="w-8 h-8" />,
      title: t("landing.pediatricDentistry"),
      description: t("landing.pediatricDentistryDesc"),
    },
  ];

  return (
    <section
      id="services"
      className="py-20 bg-gradient-to-b from-gray-50 to-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {t("landing.ourServices")}
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {t("landing.servicesSubtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <div
              key={index}
              className="p-6 rounded-xl bg-white border border-gray-200 hover:border-dental-blue hover:shadow-lg transition-all duration-300 group"
            >
              <div className="w-16 h-16 gradient-hero rounded-lg flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform">
                {service.icon}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {service.title}
              </h3>
              <p className="text-gray-600">{service.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
