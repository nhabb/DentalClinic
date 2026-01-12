// Server Component - Diplomas and Certifications Section
export default function Diplomas() {
  const credentials = [
    {
      institution: 'American Dental Association',
      credential: 'Board Certified',
      year: '2010',
      type: 'Certification',
    },
    {
      institution: 'Academy of General Dentistry',
      credential: 'Fellowship (FAGD)',
      year: '2015',
      type: 'Fellowship',
    },
    {
      institution: 'American Academy of Cosmetic Dentistry',
      credential: 'Accredited Member',
      year: '2016',
      type: 'Accreditation',
    },
    {
      institution: 'Invisalign',
      credential: 'Certified Provider',
      year: '2018',
      type: 'Certification',
    },
    {
      institution: 'International Congress of Oral Implantologists',
      credential: 'Diplomate Status',
      year: '2019',
      type: 'Certification',
    },
    {
      institution: 'American Board of Pediatric Dentistry',
      credential: 'Board Certified',
      year: '2020',
      type: 'Certification',
    },
    {
      institution: 'Dental Organization for Conscious Sedation',
      credential: 'Certified Provider',
      year: '2021',
      type: 'Certification',
    },
    {
      institution: 'State Dental Board',
      credential: 'Active License',
      year: '2024',
      type: 'License',
    },
  ]

  return (
    <section id="credentials" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <SectionHeader />

        {/* Featured Credential */}
        <FeaturedCredential />

        {/* Credentials Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12">
          {credentials.map((credential, index) => (
            <CredentialCard key={index} {...credential} />
          ))}
        </div>

        {/* Trust Badges */}
        <TrustBadges />
      </div>
    </section>
  )
}

// Reusable Section Header Component
function SectionHeader() {
  return (
    <div className="text-center mb-12">
      <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
        Credentials & Certifications
      </h2>
      <p className="text-xl text-gray-600 max-w-3xl mx-auto">
        Our team maintains the highest standards of professional excellence through continuous
        education and specialized certifications.
      </p>
    </div>
  )
}

// Reusable Featured Credential Component
function FeaturedCredential() {
  return (
    <div className="bg-gradient-to-r from-dental-blue to-dental-teal rounded-2xl p-8 md:p-12 text-white text-center shadow-xl">
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center">
          <svg className="w-12 h-12 text-dental-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
      </div>
      <h3 className="text-2xl md:text-3xl font-bold mb-3">
        American Dental Association
      </h3>
      <p className="text-xl mb-2">Board Certified Dental Practice</p>
      <p className="text-dental-lightblue">Recognized for excellence in patient care and professional standards</p>
    </div>
  )
}

// Reusable Credential Card Component
function CredentialCard({
  institution,
  credential,
  year,
  type
}: {
  institution: string
  credential: string
  year: string
  type: string
}) {
  // Icon based on credential type
  const getIcon = () => {
    switch (type) {
      case 'Fellowship':
        return (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        )
      case 'License':
        return (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        )
      default:
        return (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        )
    }
  }

  return (
    <div className="p-6 rounded-xl border-2 border-gray-200 hover:border-dental-blue hover:shadow-lg transition-all duration-300 group bg-white">
      <div className="w-16 h-16 bg-dental-lightblue bg-opacity-20 rounded-lg flex items-center justify-center text-dental-blue mb-4 group-hover:bg-dental-blue group-hover:text-white transition-all">
        {getIcon()}
      </div>
      <h4 className="font-bold text-gray-900 mb-2 text-sm leading-tight">{credential}</h4>
      <p className="text-xs text-gray-600 mb-2">{institution}</p>
      <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
        {year}
      </span>
    </div>
  )
}

// Reusable Trust Badges Component
function TrustBadges() {
  const badges = [
    { text: 'HIPAA Compliant', icon: '🔒' },
    { text: 'ADA Member', icon: '✓' },
    { text: 'Continuing Education', icon: '📚' },
    { text: 'Patient Safety First', icon: '🛡️' },
  ]

  return (
    <div className="mt-16 flex flex-wrap justify-center gap-4">
      {badges.map((badge, index) => (
        <div
          key={index}
          className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-full text-gray-700"
        >
          <span>{badge.icon}</span>
          <span className="font-medium text-sm">{badge.text}</span>
        </div>
      ))}
    </div>
  )
}
