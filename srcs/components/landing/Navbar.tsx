import Link from "next/link";
import { FaTooth } from "react-icons/fa";
import { Menu } from "lucide-react";

// Server Component - Navigation Bar
export default function Navbar() {
  const navLinks = [
    { href: "#services", label: "Services" },
    { href: "#about", label: "About" },
    { href: "#credentials", label: "Credentials" },
  ];

  return (
    <nav className="fixed w-full bg-white/95 backdrop-blur-sm z-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Logo />

          {/* Desktop Navigation */}
          <DesktopNav navLinks={navLinks} />

          {/* Mobile Menu Button */}
          <MobileMenuButton />
        </div>
      </div>
    </nav>
  );
}

// Reusable Logo Component
export function Logo() {
  return (
    <div className="flex items-center">
      <Link href="/" className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
          <FaTooth className="text-white text-lg" />
        </div>
        <span className="text-xl font-bold text-gray-900">BrightSmile</span>
      </Link>
    </div>
  );
}

// Reusable Desktop Navigation Component
function DesktopNav({
  navLinks,
}: {
  navLinks: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="hidden md:flex items-center space-x-8">
      {navLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-gray-700 hover:text-dental-blue transition-colors font-medium"
        >
          {link.label}
        </Link>
      ))}
      <Link
        href="/login"
        className="bg-dental-blue text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-all transform hover:scale-105 font-semibold shadow-md"
      >
        Patient Portal
      </Link>
    </div>
  );
}

// Reusable Mobile Menu Button Component
function MobileMenuButton() {
  return (
    <div className="md:hidden">
      <button
        className="text-gray-700 hover:text-dental-blue"
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>
    </div>
  );
}
