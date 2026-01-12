import Link from 'next/link'

// Server Component - Appointment Booking Section
export default function Appointment() {
  const contactInfo = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
      label: 'Phone',
      value: '(555) 123-4567',
      href: 'tel:+15551234567',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      label: 'Email',
      value: 'contact@brightsmile.com',
      href: 'mailto:contact@brightsmile.com',
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      label: 'Address',
      value: '123 Main Street, Suite 100\nYour City, ST 12345',
      href: 'https://maps.google.com/?q=123+Main+Street+Your+City',
    },
  ]

  const officeHours = [
    { day: 'Monday - Friday', hours: '8:00 AM - 6:00 PM' },
    { day: 'Saturday', hours: '9:00 AM - 2:00 PM' },
    { day: 'Sunday', hours: 'Closed' },
    { day: 'Emergency Care', hours: 'Available 24/7' },
  ]

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
              Book your visit today and take the first step towards a healthier, brighter smile.
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
  )
}

// Reusable Contact Info Component
function ContactInfo({
  contactInfo
}: {
  contactInfo: Array<{
    icon: React.ReactNode
    label: string
    value: string
    href: string
  }>
}) {
  return (
    <div className="space-y-4 mb-10">
      {contactInfo.map((item, index) => (
        <a
          key={index}
          href={item.href}
          target={item.href.startsWith('http') ? '_blank' : undefined}
          rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
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
  )
}

// Reusable Office Hours Component
function OfficeHours({
  hours
}: {
  hours: Array<{ day: string; hours: string }>
}) {
  return (
    <div className="bg-white bg-opacity-10 rounded-xl p-6">
      <h3 className="text-xl font-bold mb-4 flex items-center space-x-2">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Office Hours</span>
      </h3>
      <div className="space-y-3">
        {hours.map((item, index) => (
          <HourRow key={index} day={item.day} hours={item.hours} isLast={index === hours.length - 1} />
        ))}
      </div>
    </div>
  )
}

// Reusable Hour Row Component
function HourRow({ day, hours, isLast }: { day: string; hours: string; isLast: boolean }) {
  return (
    <div className={`flex justify-between ${!isLast ? 'pb-3 border-b border-white border-opacity-20' : ''}`}>
      <span className="font-medium">{day}</span>
      <span className="text-dental-lightblue">{hours}</span>
    </div>
  )
}

// Reusable Booking Card Component
function BookingCard() {
  const features = [
    'New and existing patients welcome',
    'Online appointment scheduling',
    'Quick response time',
    'Flexible payment options',
  ]

  return (
    <div className="bg-white rounded-2xl p-8 shadow-2xl">
      <div className="text-center mb-6">
        <div className="inline-block p-3 bg-dental-lightblue bg-opacity-20 rounded-full mb-4">
          <svg className="w-12 h-12 text-dental-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Book Online</h3>
        <p className="text-gray-600">
          Access your patient portal to schedule appointments, view records, and manage your dental care.
        </p>
      </div>

      {/* Features List */}
      <ul className="space-y-3 mb-6">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center space-x-3 text-gray-700">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
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
        Or call us at{' '}
        <a href="tel:+15551234567" className="text-dental-blue font-semibold hover:underline">
          (555) 123-4567
        </a>
      </p>
    </div>
  )
}
