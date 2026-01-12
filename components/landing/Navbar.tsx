import Link from 'next/link'

// Server Component - Navigation Bar
export default function Navbar() {
  const navLinks = [
    { href: '#about', label: 'About' },
    { href: '#services', label: 'Services' },
    { href: '#credentials', label: 'Credentials' },
    { href: '#appointment', label: 'Contact' },
  ]

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
  )
}

// Reusable Logo Component
function Logo() {
  return (
    <div className="flex items-center">
      <Link href="/" className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
          </svg>
        </div>
        <span className="text-xl font-bold text-gray-900">BrightSmile</span>
      </Link>
    </div>
  )
}

// Reusable Desktop Navigation Component
function DesktopNav({
  navLinks
}: {
  navLinks: Array<{ href: string; label: string }>
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
  )
}

// Reusable Mobile Menu Button Component
function MobileMenuButton() {
  return (
    <div className="md:hidden">
      <button className="text-gray-700 hover:text-dental-blue" aria-label="Open menu">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>
  )
}
