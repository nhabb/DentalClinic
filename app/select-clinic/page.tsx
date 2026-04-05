"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FaTooth,
  FaHospital,
  FaMapMarkerAlt,
  FaUserMd,
  FaSearch,
  FaSignOutAlt,
  FaChevronRight,
  FaStar,
} from "react-icons/fa";

interface Clinic {
  id: number;
  clinicName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  specialty: string;
  status: string;
}

const SPECIALTY_LABELS: Record<string, string> = {
  general:      "General Dentistry",
  orthodontics: "Orthodontics",
  pediatric:    "Pediatric Dentistry",
  cosmetic:     "Cosmetic Dentistry",
  oral_surgery: "Oral Surgery",
  periodontics: "Periodontics",
  multi:        "Multi-Specialty",
};

const SPECIALTY_COLORS: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  general:      { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",   icon: "bg-blue-500"    },
  orthodontics: { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200", icon: "bg-purple-500"  },
  pediatric:    { bg: "bg-pink-50",    text: "text-pink-700",    border: "border-pink-200",   icon: "bg-pink-500"    },
  cosmetic:     { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200",   icon: "bg-teal-500"    },
  oral_surgery: { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",    icon: "bg-red-500"     },
  periodontics: { bg: "bg-green-50",   text: "text-green-700",   border: "border-green-200",  icon: "bg-green-500"   },
  multi:        { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200", icon: "bg-orange-500"  },
};

// Seed approved clinics — always visible even before super admin approves anything
const SEED_APPROVED: Clinic[] = [
  {
    id: 3,
    clinicName:  "White Clinic",
    ownerName:   "Dr. Maya Haddad",
    email:       "maya@whiteclinic.com",
    phone:       "+961 3 555 666",
    address:     "Kaslik Main Road",
    city:        "Jounieh",
    specialty:   "cosmetic",
    status:      "approved",
  },
  {
    id: 10,
    clinicName:  "BrightSmile Hamra",
    ownerName:   "Dr. Tarek Saad",
    email:       "tarek@brightsmile.com",
    phone:       "+961 1 345 678",
    address:     "Hamra Main Street",
    city:        "Beirut",
    specialty:   "general",
    status:      "approved",
  },
  {
    id: 11,
    clinicName:  "OrthoPlus",
    ownerName:   "Dr. Lina Karam",
    email:       "lina@orthoplus.com",
    phone:       "+961 3 222 333",
    address:     "Verdun Street",
    city:        "Beirut",
    specialty:   "orthodontics",
    status:      "approved",
  },
  {
    id: 12,
    clinicName:  "Kids Dental Jounieh",
    ownerName:   "Dr. Nour Saleh",
    email:       "nour@kidsdental.com",
    phone:       "+961 9 111 222",
    address:     "Maameltein Road",
    city:        "Jounieh",
    specialty:   "pediatric",
    status:      "approved",
  },
  {
    id: 13,
    clinicName:  "PerioHealth Clinic",
    ownerName:   "Dr. Samir Hanna",
    email:       "samir@periohealth.com",
    phone:       "+961 4 555 777",
    address:     "Dbayeh Highway",
    city:        "Dbayeh",
    specialty:   "periodontics",
    status:      "approved",
  },
  {
    id: 14,
    clinicName:  "Tripoli Dental Center",
    ownerName:   "Dr. Ahmad Zein",
    email:       "ahmad@tripolidental.com",
    phone:       "+961 6 123 456",
    address:     "Al Mina Street",
    city:        "Tripoli",
    specialty:   "multi",
    status:      "approved",
  },
];

const ALL_SPECIALTIES = ["all", "general", "orthodontics", "pediatric", "cosmetic", "oral_surgery", "periodontics", "multi"];

export default function SelectClinicPage() {
  const router = useRouter();
  const [clinics, setClinics]   = useState<Clinic[]>([]);
  const [search, setSearch]     = useState("");
  const [specialty, setSpecialty] = useState("all");

  useEffect(() => {
    // Merge seed clinics with any super-admin-approved ones from localStorage
    const stored: Clinic[] = JSON.parse(localStorage.getItem("clinicRegistrations") || "[]");
    const approvedFromStore = stored.filter((c) => c.status === "approved");
    const seedIds = new Set(SEED_APPROVED.map((c) => c.id));
    const extra = approvedFromStore.filter((c) => !seedIds.has(c.id));
    setClinics([...SEED_APPROVED, ...extra]);
  }, []);

  const handleSelect = (clinic: Clinic) => {
    localStorage.setItem("selectedClinic", JSON.stringify(clinic));
    router.push("/patient-dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("patientAuth");
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    router.push("/login");
  };

  const filtered = clinics.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      c.clinicName.toLowerCase().includes(q) ||
      c.ownerName.toLowerCase().includes(q)  ||
      c.city.toLowerCase().includes(q);
    const matchesSpecialty = specialty === "all" || c.specialty === specialty;
    return matchesSearch && matchesSpecialty;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center shadow">
              <FaTooth className="text-white text-lg" />
            </div>
            <span className="text-xl font-bold text-gray-900">BrightSmile</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <FaSignOutAlt />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-dental-blue to-dental-teal rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <FaHospital className="text-white text-2xl" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Choose Your Clinic</h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Select the dental clinic you&apos;re registered with to access your personal portal.
          </p>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by clinic name, doctor, or city..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/40 text-gray-900 placeholder-gray-400 bg-white shadow-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {ALL_SPECIALTIES.map((s) => (
              <button
                key={s}
                onClick={() => setSpecialty(s)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all whitespace-nowrap ${
                  specialty === s
                    ? "bg-gradient-to-r from-dental-blue to-dental-teal text-white border-transparent shadow-md"
                    : "bg-white text-gray-600 border-gray-200 hover:border-dental-blue/40"
                }`}
              >
                {s === "all" ? "All Specialties" : SPECIALTY_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="text-sm text-gray-500 mb-5">
          {filtered.length} clinic{filtered.length !== 1 ? "s" : ""} available
        </p>

        {/* Clinic Cards */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <FaHospital className="text-gray-300 text-5xl mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No clinics match your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((clinic) => {
              const colors = SPECIALTY_COLORS[clinic.specialty] || SPECIALTY_COLORS["general"];
              return (
                <div
                  key={clinic.id}
                  className="bg-white rounded-2xl shadow-md hover:shadow-xl border border-gray-100 hover:border-dental-blue/30 transition-all group flex flex-col"
                >
                  {/* Card top */}
                  <div className="p-6 flex-1">
                    {/* Icon + specialty */}
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 ${colors.icon} rounded-xl flex items-center justify-center shadow-md`}>
                        <FaTooth className="text-white text-lg" />
                      </div>
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                        {SPECIALTY_LABELS[clinic.specialty] || clinic.specialty}
                      </span>
                    </div>

                    {/* Name */}
                    <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-dental-blue transition-colors">
                      {clinic.clinicName}
                    </h3>

                    {/* Meta */}
                    <div className="space-y-1.5 mt-3">
                      <p className="flex items-center gap-2 text-sm text-gray-500">
                        <FaUserMd className="text-dental-blue shrink-0" />
                        {clinic.ownerName}
                      </p>
                      <p className="flex items-center gap-2 text-sm text-gray-500">
                        <FaMapMarkerAlt className="text-dental-blue shrink-0" />
                        {clinic.address}, {clinic.city}
                      </p>
                    </div>
                  </div>

                  {/* Select button */}
                  <div className="px-6 pb-6">
                    <button
                      onClick={() => handleSelect(clinic)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-dental-blue to-dental-teal text-white font-semibold rounded-xl hover:shadow-lg hover:scale-[1.02] transition-all text-sm"
                    >
                      Select Clinic
                      <FaChevronRight className="text-xs" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
