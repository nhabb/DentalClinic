"use client";

import { Award, CheckCircle, Star } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function Diplomas() {
  const { t } = useTranslation();

  const credentials = [
    {
      institution: "American Dental Association",
      credential: t("landing.cred1"),
      year: "2010",
      type: t("landing.typeCertification"),
      typeKey: "Certification",
    },
    {
      institution: "Academy of General Dentistry",
      credential: t("landing.cred2"),
      year: "2015",
      type: t("landing.typeFellowship"),
      typeKey: "Fellowship",
    },
    {
      institution: "American Academy of Cosmetic Dentistry",
      credential: t("landing.cred3"),
      year: "2016",
      type: t("landing.typeAccreditation"),
      typeKey: "Accreditation",
    },
    {
      institution: "Invisalign",
      credential: t("landing.cred4"),
      year: "2018",
      type: t("landing.typeCertification"),
      typeKey: "Certification",
    },
    {
      institution: "International Congress of Oral Implantologists",
      credential: t("landing.cred5"),
      year: "2019",
      type: t("landing.typeCertification"),
      typeKey: "Certification",
    },
    {
      institution: "American Board of Pediatric Dentistry",
      credential: t("landing.cred6"),
      year: "2020",
      type: t("landing.typeCertification"),
      typeKey: "Certification",
    },
    {
      institution: "Dental Organization for Conscious Sedation",
      credential: t("landing.cred7"),
      year: "2021",
      type: t("landing.typeCertification"),
      typeKey: "Certification",
    },
    {
      institution: "State Dental Board",
      credential: t("landing.cred8"),
      year: "2024",
      type: t("landing.typeLicense"),
      typeKey: "License",
    },
  ];

  return (
    <section id="credentials" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {t("landing.credentialsTitle")}
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {t("landing.credentialsSubtitle")}
          </p>
        </div>

        {/* Featured Credential */}
        <div className="bg-gradient-to-r from-dental-blue to-dental-teal rounded-2xl p-8 md:p-12 text-white text-center shadow-xl">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center">
              <Award className="w-12 h-12 text-dental-blue" />
            </div>
          </div>
          <h3 className="text-2xl md:text-3xl font-bold mb-3">
            American Dental Association
          </h3>
          <p className="text-xl mb-2">{t("landing.boardCertifiedPractice")}</p>
          <p className="text-dental-lightblue">
            {t("landing.adaRecognized")}
          </p>
        </div>

        {/* Credentials Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12">
          {credentials.map((credential, index) => (
            <CredentialCard key={index} {...credential} />
          ))}

        </div>
      </div>
    </section>
  );
}

// Reusable Credential Card Component
function CredentialCard({
  institution,
  credential,
  year,
  type,
  typeKey,
}: {
  institution: string;
  credential: string;
  year: string;
  type: string;
  typeKey: string;
}) {
  const getIcon = () => {
    switch (typeKey) {
      case "Fellowship":
        return <Star className="w-8 h-8" />;
      case "License":
        return <CheckCircle className="w-8 h-8" />;
      default:
        return <Award className="w-8 h-8" />;
    }
  };

  return (
    <div className="p-6 rounded-xl border-2 border-gray-200 hover:border-dental-blue hover:shadow-lg transition-all duration-300 group bg-white">
      <div className="w-16 h-16 bg-dental-lightblue bg-opacity-20 rounded-lg flex items-center justify-center text-dental-blue mb-4 group-hover:bg-dental-blue group-hover:text-white transition-all">
        {getIcon()}
      </div>
      <h4 className="font-bold text-gray-900 mb-2 text-sm leading-tight">
        {credential}
      </h4>
      <p className="text-xs text-gray-600 mb-2">{institution}</p>
      <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
        {year}
      </span>
    </div>
  );
}
