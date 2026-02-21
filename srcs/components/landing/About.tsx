import { Sparkles, User } from "lucide-react";
// Server Component (default in Next.js App Router)
export default function About() {
  const stats = [
    {
      number: "15+",
      label: "Years Experience",
      description: "Serving the community since 2010",
    },
    {
      number: "10,000+",
      label: "Happy Patients",
      description: "Trusted by families",
    },
    {
      number: "98%",
      label: "Satisfaction Rate",
      description: "Highly rated care",
    },
    {
      number: "24/7",
      label: "Emergency Care",
      description: "Always here for you",
    },
  ];

  const teamMembers = [
    {
      name: "Dr. Sarah Mitchell",
      role: "Lead Dentist",
      education: "DDS, Harvard School of Dental Medicine",
      description:
        "Specializing in cosmetic and restorative dentistry with over 15 years of experience.",
    },
    {
      name: "Dr. James Chen",
      role: "Orthodontist",
      education: "DMD, University of Pennsylvania",
      description:
        "Expert in orthodontics and clear aligner therapy for children and adults.",
    },
    {
      name: "Dr. Emily Rodriguez",
      role: "Pediatric Dentist",
      education: "DDS, UCSF School of Dentistry",
      description:
        "Dedicated to making dental visits fun and comfortable for young patients.",
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
            About BrightSmile Dental
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-4">
            Since 2010, we've been dedicated to providing exceptional dental
            care to our community. Our state-of-the-art facility and experienced
            team ensure you receive the highest quality treatment in a
            comfortable, welcoming environment.
          </p>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            We believe everyone deserves a healthy, beautiful smile. That's why
            we offer comprehensive services for the whole family, from
            preventive care to advanced cosmetic procedures.
          </p>
        </div>

        {/* Stats Section */}
        <StatsSection stats={stats} />

        {/* Meet the Team */}
        <div className="mt-20">
          <h3 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-12">
            Meet Our Expert Team
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
              Our Mission
            </h4>
            <p className="text-gray-600">
              To provide personalized, gentle dental care that exceeds
              expectations. We combine advanced technology with a compassionate
              approach to create positive experiences for every patient.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-md">
            <h4 className="text-xl font-bold text-gray-900 mb-4">Our Values</h4>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start space-x-2">
                <span className="text-dental-blue font-bold">•</span>
                <span>Patient-centered care and comfort</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-dental-blue font-bold">•</span>
                <span>Continuous education and innovation</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-dental-blue font-bold">•</span>
                <span>Honesty and transparent communication</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-dental-blue font-bold">•</span>
                <span>Community involvement and giving back</span>
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
