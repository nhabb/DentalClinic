import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  CheckCircle,
  Award,
  Mail,
} from "lucide-react";
import Link from "next/link";

// Server Component - Appointment Booking Section
export default function Appointment() {
  const contactInfo = [
    {
      icon: <Phone className="w-6 h-6" />,
      label: "Phone",
      value: "+961 1 234 567",
      href: "tel:+9611234567",
    },
    {
      icon: <Mail className="w-6 h-6" />,
      label: "Email",
      value: "contact@brightsmile.com",
      href: "mailto:contact@brightsmile.com",
    },
    {
      icon: <MapPin className="w-6 h-6" />,
      label: "Address",
      value: "Hamra Street, Beirut\nLebanon",
      href: "https://maps.google.com/?q=Hamra+Street+Beirut+Lebanon",
    },
  ];

  const officeHours = [
    { day: "Monday - Friday", hours: "8:00 AM - 6:00 PM" },
    { day: "Saturday", hours: "9:00 AM - 2:00 PM" },
    { day: "Sunday", hours: "Closed" },
    { day: "Emergency Care", hours: "Available 24/7" },
  ];

  return (
    <section id="appointment" className="py-20 gradient-primary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          {/* Left Column - Contact Info & Hours */}
          <div className="text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Schedule Your Appointment
            </h2>
            <p className="text-xl text-dental-lightblue mb-8">
              Book your visit today and take the first step towards a healthier,
              brighter smile.
            </p>

            {/* Contact Information */}
            <ContactInfo contactInfo={contactInfo} />

            {/* Office Hours */}
            <OfficeHours hours={officeHours} />
          </div>

          {/* Right Column - Booking CTA Card */}
          <BookingCard />
        </div>
      </div>
    </section>
  );
}

// Reusable Contact Info Component
function ContactInfo({
  contactInfo,
}: {
  contactInfo: Array<{
    icon: React.ReactNode;
    label: string;
    value: string;
    href: string;
  }>;
}) {
  return (
    <div className="space-y-4 mb-10">
      {contactInfo.map((item, index) => (
        <a
          key={index}
          href={item.href}
          target={item.href.startsWith("http") ? "_blank" : undefined}
          rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="flex items-start space-x-4 p-4 bg-white bg-opacity-10 rounded-lg hover:bg-opacity-20 transition-all group"
        >
          <div className="flex-shrink-0 w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center text-white group-hover:bg-opacity-30 transition-all">
            {item.icon}
          </div>
          <div>
            <p className="text-sm text-dental-lightblue mb-1">{item.label}</p>
            <p className="font-medium whitespace-pre-line">{item.value}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

// Reusable Office Hours Component
function OfficeHours({
  hours,
}: {
  hours: Array<{ day: string; hours: string }>;
}) {
  return (
    <div className="bg-white bg-opacity-10 rounded-xl p-6">
      <h3 className="text-xl font-bold mb-4 flex items-center space-x-2">
        <Clock className="w-6 h-6" />
        <span>Office Hours</span>
      </h3>
      <div className="space-y-3">
        {hours.map((item, index) => (
          <HourRow
            key={index}
            day={item.day}
            hours={item.hours}
            isLast={index === hours.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// Reusable Hour Row Component
function HourRow({
  day,
  hours,
  isLast,
}: {
  day: string;
  hours: string;
  isLast: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${!isLast ? "pb-3 border-b border-white border-opacity-20" : ""}`}
    >
      <span className="font-medium">{day}</span>
      <span className="text-dental-lightblue">{hours}</span>
    </div>
  );
}

// Reusable Booking Card Component
function BookingCard() {
  const features = [
    "New and existing patients welcome",
    "Online appointment scheduling",
    "Quick response time",
    "Flexible payment options",
  ];

  return (
    <div className="bg-white rounded-2xl p-8 shadow-2xl">
      <div className="text-center mb-6">
        <div className="inline-block p-3 bg-dental-lightblue bg-opacity-20 rounded-full mb-4">
          <Calendar className="w-12 h-12 text-dental-blue" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Book Online</h3>
        <p className="text-gray-600">
          Access your patient portal to schedule appointments, view records, and
          manage your dental care.
        </p>
      </div>

      {/* Features List */}
      <ul className="space-y-3 mb-6">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center space-x-3 text-gray-700">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 fill-current" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <Link
        href="/login"
        className="block w-full bg-dental-blue text-white text-center px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-700 transition-all transform hover:scale-105 shadow-lg mb-4"
      >
        Access Patient Portal
      </Link>

      {/* Alternative Contact */}
      <p className="text-center text-sm text-gray-500">
        Or call us at{" "}
        <a
          href="tel:+9611234567"
          className="text-dental-blue font-semibold hover:underline"
        >
          +961 1 234 567
        </a>
      </p>
    </div>
  );
}
