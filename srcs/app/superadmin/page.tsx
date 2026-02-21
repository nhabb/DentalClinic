"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FaTooth,
  FaHospital,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaChartBar,
  FaSignOutAlt,
  FaShieldAlt,
  FaSearch,
  FaBell,
  FaEye,
  FaChevronRight,
  FaUsers,
} from "react-icons/fa";

interface ClinicRegistration {
  id: number;
  clinicName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  licenseNumber: string;
  specialty: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
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

const SEED_CLINICS: ClinicRegistration[] = [
  {
    id: 1,
    clinicName: "Smile Zone",
    ownerName: "Dr. Rania Fakih",
    email: "rania@smilezone.com",
    phone: "+961 3 111 222",
    address: "Mar Elias Street",
    city: "Beirut",
    licenseNumber: "LBN-2024-00456",
    specialty: "general",
    status: "pending",
    submittedAt: "2026-02-18T10:30:00Z",
  },
  {
    id: 2,
    clinicName: "Pearl Dental",
    ownerName: "Dr. Karim Nasser",
    email: "karim@pearldental.com",
    phone: "+961 3 333 444",
    address: "Hamra Street",
    city: "Tripoli",
    licenseNumber: "LBN-2024-00789",
    specialty: "orthodontics",
    status: "pending",
    submittedAt: "2026-02-19T14:15:00Z",
  },
  {
    id: 3,
    clinicName: "White Clinic",
    ownerName: "Dr. Maya Haddad",
    email: "maya@whiteclinic.com",
    phone: "+961 3 555 666",
    address: "Kaslik Main Road",
    city: "Jounieh",
    licenseNumber: "LBN-2023-00321",
    specialty: "cosmetic",
    status: "approved",
    submittedAt: "2026-02-10T09:00:00Z",
  },
  {
    id: 4,
    clinicName: "Kids Dental Care",
    ownerName: "Dr. Lara Abi Nader",
    email: "lara@kidsdental.com",
    phone: "+961 3 777 888",
    address: "Dora Highway",
    city: "Beirut",
    licenseNumber: "LBN-2023-00099",
    specialty: "pediatric",
    status: "rejected",
    submittedAt: "2026-02-12T11:00:00Z",
  },
];

type Section = "overview" | "pending" | "clinics";

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 border border-amber-200",
  approved: "bg-green-100 text-green-700 border border-green-200",
  rejected: "bg-red-100 text-red-700 border border-red-200",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:  <FaClock className="inline mr-1 text-xs" />,
  approved: <FaCheckCircle className="inline mr-1 text-xs" />,
  rejected: <FaTimesCircle className="inline mr-1 text-xs" />,
};

export default function SuperAdminPage() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [clinics, setClinics] = useState<ClinicRegistration[]>([]);
  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState<ClinicRegistration | null>(null);

  // Load from localStorage (merge seed data on first visit)
  useEffect(() => {
    const stored = localStorage.getItem("clinicRegistrations");
    if (stored) {
      const parsed: ClinicRegistration[] = JSON.parse(stored);
      // Merge: keep seed clinics that don't conflict with stored ones
      const storedIds = new Set(parsed.map((c) => c.id));
      const merged = [
        ...SEED_CLINICS.filter((c) => !storedIds.has(c.id)),
        ...parsed,
      ];
      setClinics(merged);
    } else {
      setClinics(SEED_CLINICS);
      localStorage.setItem("clinicRegistrations", JSON.stringify(SEED_CLINICS));
    }
  }, []);

  const persist = (updated: ClinicRegistration[]) => {
    setClinics(updated);
    localStorage.setItem("clinicRegistrations", JSON.stringify(updated));
  };

  const approve = (id: number) => {
    persist(clinics.map((c) => (c.id === id ? { ...c, status: "approved" } : c)));
    if (selected?.id === id) setSelected((s) => s ? { ...s, status: "approved" } : s);
  };

  const reject = (id: number) => {
    persist(clinics.map((c) => (c.id === id ? { ...c, status: "rejected" } : c)));
    if (selected?.id === id) setSelected((s) => s ? { ...s, status: "rejected" } : s);
  };

  const handleLogout = () => {
    localStorage.removeItem("superAdminAuth");
    localStorage.removeItem("userRole");
    localStorage.removeItem("authToken");
    router.push("/login");
  };

  const stats = {
    total:    clinics.length,
    pending:  clinics.filter((c) => c.status === "pending").length,
    approved: clinics.filter((c) => c.status === "approved").length,
    rejected: clinics.filter((c) => c.status === "rejected").length,
  };

  const filtered = clinics.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.clinicName.toLowerCase().includes(q) ||
      c.ownerName.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  const pendingList  = filtered.filter((c) => c.status === "pending");
  const allList      = section === "clinics" ? filtered : pendingList;

  const navItems: { id: Section; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "overview", label: "Overview",             icon: <FaChartBar /> },
    { id: "pending",  label: "Pending Approvals",    icon: <FaClock />,      badge: stats.pending },
    { id: "clinics",  label: "All Clinics",          icon: <FaHospital /> },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* ── SIDEBAR ── */}
      <aside className="w-64 bg-gray-900 border-r border-white/5 flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-xl flex items-center justify-center shadow-lg">
              <FaTooth className="text-white text-lg" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">BrightSmile</p>
              <p className="text-gray-400 text-xs mt-0.5">Super Admin</p>
            </div>
          </Link>
        </div>

        {/* Super Admin Badge */}
        <div className="px-4 py-3 mx-3 mt-4 bg-gradient-to-r from-dental-blue/20 to-dental-teal/20 border border-dental-blue/30 rounded-xl flex items-center gap-2">
          <FaShieldAlt className="text-dental-lightblue text-sm" />
          <div>
            <p className="text-white text-xs font-semibold">Super Administrator</p>
            <p className="text-gray-400 text-[10px]">super@demo.com</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSection(item.id); setSelected(null); setSearch(""); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                section === item.id
                  ? "bg-gradient-to-r from-dental-blue to-dental-teal text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="flex items-center gap-3">
                {item.icon}
                {item.label}
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl text-sm font-medium transition-all"
          >
            <FaSignOutAlt />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-gray-900 border-b border-white/5 px-8 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-white font-bold text-lg capitalize">
              {section === "overview" && "Dashboard Overview"}
              {section === "pending"  && "Pending Approvals"}
              {section === "clinics"  && "All Clinics"}
            </h1>
            <p className="text-gray-400 text-xs">
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-gray-400 hover:text-white transition-colors">
              <FaBell className="text-sm" />
              {stats.pending > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                  {stats.pending}
                </span>
              )}
            </button>
            <div className="w-9 h-9 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center shadow">
              <FaShieldAlt className="text-white text-sm" />
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-auto">

          {/* ── OVERVIEW ── */}
          {section === "overview" && (
            <div className="space-y-8">
              {/* Stat Cards */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Total Clinics",    value: stats.total,    icon: FaHospital,    from: "from-dental-blue",    to: "to-dental-teal",   text: "text-dental-lightblue" },
                  { label: "Pending Review",   value: stats.pending,  icon: FaClock,       from: "from-amber-500",      to: "to-orange-500",    text: "text-amber-400" },
                  { label: "Approved",         value: stats.approved, icon: FaCheckCircle, from: "from-emerald-500",    to: "to-teal-500",      text: "text-emerald-400" },
                  { label: "Rejected",         value: stats.rejected, icon: FaTimesCircle, from: "from-red-500",        to: "to-rose-500",      text: "text-red-400" },
                ].map(({ label, value, icon: Icon, from, to, text }) => (
                  <div key={label} className="bg-gray-900 border border-white/5 rounded-2xl p-5 flex items-center gap-4">
                    <div className={`w-12 h-12 bg-gradient-to-br ${from} ${to} rounded-xl flex items-center justify-center shadow-lg shrink-0`}>
                      <Icon className="text-white text-lg" />
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">{label}</p>
                      <p className={`text-3xl font-bold ${text}`}>{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Pending */}
              <div className="bg-gray-900 border border-white/5 rounded-2xl">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <h2 className="text-white font-semibold">Pending Registrations</h2>
                  {stats.pending > 0 && (
                    <button
                      onClick={() => setSection("pending")}
                      className="text-xs text-dental-lightblue hover:underline flex items-center gap-1"
                    >
                      View all <FaChevronRight className="text-[10px]" />
                    </button>
                  )}
                </div>
                {stats.pending === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <FaCheckCircle className="text-emerald-500 text-3xl mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">No pending registrations — all caught up!</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {clinics.filter((c) => c.status === "pending").slice(0, 5).map((c) => (
                      <div key={c.id} className="px-6 py-4 flex items-center justify-between hover:bg-white/2 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                            <FaHospital className="text-dental-lightblue text-sm" />
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{c.clinicName}</p>
                            <p className="text-gray-400 text-xs">{c.ownerName} · {c.city}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {new Date(c.submittedAt).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() => { setSection("pending"); setSelected(c); }}
                            className="text-xs text-dental-lightblue hover:underline flex items-center gap-1"
                          >
                            Review <FaChevronRight className="text-[10px]" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* All Clinics summary */}
              <div className="bg-gray-900 border border-white/5 rounded-2xl">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <h2 className="text-white font-semibold">Approved Clinics</h2>
                  <button
                    onClick={() => setSection("clinics")}
                    className="text-xs text-dental-lightblue hover:underline flex items-center gap-1"
                  >
                    View all <FaChevronRight className="text-[10px]" />
                  </button>
                </div>
                {stats.approved === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500 text-sm">No approved clinics yet.</div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {clinics.filter((c) => c.status === "approved").map((c) => (
                      <div key={c.id} className="px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                            <FaCheckCircle className="text-emerald-400 text-sm" />
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{c.clinicName}</p>
                            <p className="text-gray-400 text-xs">{SPECIALTY_LABELS[c.specialty] || c.specialty} · {c.city}</p>
                          </div>
                        </div>
                        <span className="text-xs text-emerald-400">{c.licenseNumber}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PENDING APPROVALS ── */}
          {section === "pending" && (
            <div className="space-y-6">
              {/* Search */}
              <div className="relative max-w-md">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by clinic, owner, city..."
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-white/10 text-white placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/50 text-sm"
                />
              </div>

              {selected ? (
                /* Detail panel */
                <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => setSelected(null)}
                      className="text-gray-400 hover:text-white text-sm flex items-center gap-2 transition-colors"
                    >
                      ← Back to list
                    </button>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_BADGE[selected.status]}`}>
                      {STATUS_ICON[selected.status]}
                      {selected.status.charAt(0).toUpperCase() + selected.status.slice(1)}
                    </span>
                  </div>
                  <div className="p-6 space-y-6">
                    <div>
                      <h2 className="text-white text-2xl font-bold">{selected.clinicName}</h2>
                      <p className="text-gray-400 text-sm mt-1">Submitted {new Date(selected.submittedAt).toLocaleString()}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: "Owner / Director", value: selected.ownerName },
                        { label: "Business Email",   value: selected.email },
                        { label: "Phone",            value: selected.phone },
                        { label: "License Number",   value: selected.licenseNumber },
                        { label: "Specialty",        value: SPECIALTY_LABELS[selected.specialty] || selected.specialty },
                        { label: "Location",         value: `${selected.address}, ${selected.city}` },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white/5 rounded-xl p-4">
                          <p className="text-gray-400 text-xs mb-1">{label}</p>
                          <p className="text-white text-sm font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                    {selected.status === "pending" && (
                      <div className="flex gap-3 pt-2">
                        <Button
                          onClick={() => approve(selected.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-5"
                          size="lg"
                        >
                          <FaCheckCircle className="mr-2" />
                          Approve Clinic
                        </Button>
                        <Button
                          onClick={() => reject(selected.id)}
                          variant="outline"
                          className="flex-1 border-red-500/40 text-red-400 hover:bg-red-500/10 py-5"
                          size="lg"
                        >
                          <FaTimesCircle className="mr-2" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : pendingList.length === 0 ? (
                <div className="bg-gray-900 border border-white/5 rounded-2xl px-6 py-16 text-center">
                  <FaCheckCircle className="text-emerald-500 text-4xl mx-auto mb-4" />
                  <p className="text-white font-semibold mb-1">All caught up!</p>
                  <p className="text-gray-400 text-sm">No pending clinic registrations.</p>
                </div>
              ) : (
                <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/5">
                          {["Clinic", "Owner", "Email", "City", "Specialty", "License", "Submitted", "Actions"].map((h) => (
                            <th key={h} className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {pendingList.map((c) => (
                          <tr key={c.id} className="hover:bg-white/2 transition-colors">
                            <td className="px-5 py-4">
                              <p className="text-white text-sm font-medium">{c.clinicName}</p>
                            </td>
                            <td className="px-5 py-4 text-gray-300 text-sm">{c.ownerName}</td>
                            <td className="px-5 py-4 text-gray-300 text-sm">{c.email}</td>
                            <td className="px-5 py-4 text-gray-300 text-sm">{c.city}</td>
                            <td className="px-5 py-4 text-gray-300 text-sm">
                              {SPECIALTY_LABELS[c.specialty] || c.specialty}
                            </td>
                            <td className="px-5 py-4 text-gray-400 text-xs font-mono">{c.licenseNumber}</td>
                            <td className="px-5 py-4 text-gray-400 text-xs">
                              {new Date(c.submittedAt).toLocaleDateString()}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setSelected(c)}
                                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                  title="View details"
                                >
                                  <FaEye className="text-sm" />
                                </button>
                                <button
                                  onClick={() => approve(c.id)}
                                  className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-all"
                                  title="Approve"
                                >
                                  <FaCheckCircle className="text-sm" />
                                </button>
                                <button
                                  onClick={() => reject(c.id)}
                                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all"
                                  title="Reject"
                                >
                                  <FaTimesCircle className="text-sm" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ALL CLINICS ── */}
          {section === "clinics" && (
            <div className="space-y-6">
              {/* Search + filters */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search clinics..."
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-white/10 text-white placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/50 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  {(["all", "pending", "approved", "rejected"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSearch(s === "all" ? "" : "")} // handled by filtered list below
                      className="px-3 py-2 text-xs font-medium text-gray-400 bg-gray-900 border border-white/10 rounded-lg hover:text-white hover:border-white/20 transition-all capitalize"
                    >
                      {s === "all" ? "All" : s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/5">
                        {["Clinic", "Owner", "Email", "City", "Specialty", "License", "Status", "Submitted"].map((h) => (
                          <th key={h} className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-5 py-12 text-center text-gray-500 text-sm">
                            No clinics found.
                          </td>
                        </tr>
                      ) : filtered.map((c) => (
                        <tr key={c.id} className="hover:bg-white/2 transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-white text-sm font-medium">{c.clinicName}</p>
                          </td>
                          <td className="px-5 py-4 text-gray-300 text-sm">{c.ownerName}</td>
                          <td className="px-5 py-4 text-gray-300 text-sm">{c.email}</td>
                          <td className="px-5 py-4 text-gray-300 text-sm">{c.city}</td>
                          <td className="px-5 py-4 text-gray-300 text-sm">
                            {SPECIALTY_LABELS[c.specialty] || c.specialty}
                          </td>
                          <td className="px-5 py-4 text-gray-400 text-xs font-mono">{c.licenseNumber}</td>
                          <td className="px-5 py-4">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[c.status]}`}>
                              {STATUS_ICON[c.status]}
                              {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-gray-400 text-xs">
                            {new Date(c.submittedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
