import { MapPin, Phone, Mail, ChevronRight } from "lucide-react";
import Link from "next/link";
import { FaTooth } from "react-icons/fa";

// Server Component - Footer
export default function Footer() {
  const currentYear = new Date().getFullYear();

  const quickLinks = [
    { href: "#about", label: "About Us" },
    { href: "#services", label: "Services" },
    { href: "#credentials", label: "Credentials" },
    { href: "/book-appointment", label: "Book Appointment" },
    { href: "/login", label: "Patient Portal" },
  ];

  const officeHours = [
    { day: "Mon - Fri", hours: "8:00 AM - 6:00 PM" },
    { day: "Saturday", hours: "9:00 AM - 2:00 PM" },
    { day: "Sunday", hours: "Closed" },
  ];

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Clinic Info */}
          <ClinicInfo />

          {/* Quick Links */}
          <QuickLinksSection links={quickLinks} />

          {/* Office Hours */}
          <OfficeHoursSection hours={officeHours} />

          {/* Contact Info */}
          <ContactSection />
        </div>

        {/* Bottom Bar */}
        <BottomBar currentYear={currentYear} />
      </div>
    </footer>
  );
}

// Reusable Clinic Info Component
function ClinicInfo() {
  return (
    <div className="md:col-span-1">
      <div className="flex items-center space-x-2 mb-4">
        <div className="w-8 h-8 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
          <FaTooth className="text-white text-lg" />
        </div>
        <span className="text-xl font-bold text-white">BrightSmile</span>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Your trusted partner in comprehensive dental care. Serving the community
        with excellence since 2010.
      </p>
      <SocialMediaLinks />
    </div>
  );
}

// Reusable Social Media Links Component
function SocialMediaLinks() {
  const socialLinks = [
    {
      name: "Facebook",
      href: "#",
    },
    {
      name: "Instagram",
      href: "#",
    },
    {
      name: "Twitter",
      href: "#",
    },
  ];

  return (
    <div className="flex space-x-4">
      {socialLinks.map((social) => (
        <Link
          key={social.name}
          href={social.href}
          className="text-gray-400 hover:text-white transition-colors text-sm"
          aria-label={social.name}
        >
          {social.name}
        </Link>
      ))}
    </div>
  );
}

// Reusable Quick Links Section
function QuickLinksSection({
  links,
}: {
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h3 className="text-white font-semibold mb-4">Quick Links</h3>
      <ul className="space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Reusable Office Hours Section
function OfficeHoursSection({
  hours,
}: {
  hours: Array<{ day: string; hours: string }>;
}) {
  return (
    <div>
      <h3 className="text-white font-semibold mb-4">Office Hours</h3>
      <ul className="space-y-2 text-sm">
        {hours.map((item, index) => (
          <li key={index} className="flex justify-between">
            <span>{item.day}:</span>
            <span className="text-gray-400">{item.hours}</span>
          </li>
        ))}
        <li className="pt-2 border-t border-gray-800">
          <span className="text-dental-teal font-semibold">
            24/7 Emergency Care
          </span>
        </li>
      </ul>
    </div>
  );
}

// Reusable Contact Section
function ContactSection() {
  const contactItems = [
    {
      icon: <Phone className="w-5 h-5 flex-shrink-0 mt-0.5" />,
      text: "+961 1 234 567",
      href: "tel:+9611234567",
    },
    {
      icon: <Mail className="w-5 h-5 flex-shrink-0 mt-0.5" />,
      text: "contact@brightsmile.com",
      href: "mailto:contact@brightsmile.com",
    },
    {
      icon: <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5" />,
      text: "Hamra Street, Beirut\nLebanon",
      href: "https://maps.google.com/?q=Hamra+Street+Beirut+Lebanon",
    },
  ];

  return (
    <div>
      <h3 className="text-white font-semibold mb-4">Contact Us</h3>
      <ul className="space-y-3 text-sm">
        {contactItems.map((item, index) => (
          <li key={index}>
            <a
              href={item.href}
              target={item.href.startsWith("http") ? "_blank" : undefined}
              rel={
                item.href.startsWith("http") ? "noopener noreferrer" : undefined
              }
              className="flex items-start space-x-2 hover:text-white transition-colors"
            >
              {item.icon}
              <span className="whitespace-pre-line">{item.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Reusable Bottom Bar Component
function BottomBar({ currentYear }: { currentYear: number }) {
  const legalLinks = [
    { href: "#", label: "Privacy Policy" },
    { href: "#", label: "Terms of Service" },
    { href: "#", label: "HIPAA Compliance" },
  ];

  return (
    <div className="border-t border-gray-800 pt-8 mt-8">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <p className="text-sm text-gray-400 mb-4 md:mb-0">
          © {currentYear} BrightSmile Dental Clinic. All rights reserved.
        </p>
        <div className="flex space-x-6 text-sm">
          {legalLinks.map((link, index) => (
            <Link
              key={index}
              href={link.href}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
