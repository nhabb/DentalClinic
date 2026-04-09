"use client";

import { User } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function About() {
  const { t } = useTranslation();

  const stats = [
    {
      number: "15+",
      label: t("landing.yearsExperience"),
      description: t("landing.yearsExperienceDesc"),
    },
    {
      number: "10,000+",
      label: t("landing.happyPatients"),
      description: t("landing.happyPatientsDesc"),
    },
    {
      number: "98%",
      label: t("landing.satisfactionRate"),
      description: t("landing.satisfactionRateDesc"),
    },
    {
      number: "24/7",
      label: t("landing.emergencyCareLabel"),
      description: t("landing.emergencyCareDesc"),
    },
  ];

  const teamMembers = [
    {
      name: "Dr. Sarah Mitchell",
      role: t("landing.leadDentist"),
      education: "DDS, Harvard School of Dental Medicine",
      description: t("landing.drMitchellDesc"),
    },
    {
      name: "Dr. James Chen",
      role: t("landing.orthodontist"),
      education: "DMD, University of Pennsylvania",
      description: t("landing.drChenDesc"),
    },
    {
      name: "Dr. Emily Rodriguez",
      role: t("landing.pediatricDentist"),
      education: "DDS, UCSF School of Dentistry",
      description: t("landing.drRodriguezDesc"),
    },
  ];

  return (
    <section
      id="about"
      className="py-20 bg-gradient-to-b from-white to-gray-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Clinic Story */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            {t("landing.aboutTitle")}
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-4">
            {t("landing.aboutP1")}
          </p>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            {t("landing.aboutP2")}
          </p>
        </div>

        {/* Stats Section */}
        <StatsSection stats={stats} />

        {/* Meet the Team */}
        <div className="mt-20">
          <h3 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-12">
            {t("landing.meetOurTeam")}
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            {teamMembers.map((member, index) => (
              <TeamMemberCard key={index} {...member} />
            ))}
          </div>
        </div>

        {/* Values Section */}
        <div className="mt-20 grid md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-xl shadow-md">
            <h4 className="text-xl font-bold text-gray-900 mb-4">
              {t("landing.ourMission")}
            </h4>
            <p className="text-gray-600">
              {t("landing.missionText")}
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-md">
            <h4 className="text-xl font-bold text-gray-900 mb-4">{t("landing.ourValues")}</h4>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start space-x-2">
                <span className="text-dental-blue font-bold">•</span>
                <span>{t("landing.value1")}</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-dental-blue font-bold">•</span>
                <span>{t("landing.value2")}</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-dental-blue font-bold">•</span>
                <span>{t("landing.value3")}</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-dental-blue font-bold">•</span>
                <span>{t("landing.value4")}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// Reusable Stats Section Component
function StatsSection({
  stats,
}: {
  stats: Array<{ number: string; label: string; description: string }>;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
      {stats.map((stat, index) => (
        <StatCard key={index} {...stat} />
      ))}
    </div>
  );
}

// Reusable Stat Card Component
function StatCard({
  number,
  label,
  description,
}: {
  number: string;
  label: string;
  description: string;
}) {
  return (
    <div className="text-center p-6 bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow">
      <div className="text-4xl md:text-5xl font-bold text-dental-blue mb-2">
        {number}
      </div>
      <div className="text-lg font-semibold text-gray-900 mb-1">{label}</div>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

// Reusable Team Member Card Component
function TeamMemberCard({
  name,
  role,
  education,
  description,
}: {
  name: string;
  role: string;
  education: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow">
      {/* Placeholder for team member photo */}
      <div className="h-64 gradient-hero flex items-center justify-center">
        <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center">
          <User className="w-16 h-16 text-dental-blue" />
        </div>
      </div>
      <div className="p-6">
        <h4 className="text-xl font-bold text-gray-900 mb-1">{name}</h4>
        <p className="text-dental-blue font-semibold mb-2">{role}</p>
        <p className="text-sm text-gray-500 mb-3">{education}</p>
        <p className="text-gray-600 text-sm">{description}</p>
      </div>
    </div>
  );
}
