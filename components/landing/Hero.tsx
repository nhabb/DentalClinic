import Link from 'next/link'

export default function Hero() {
  return (
    <section className="pt-24 pb-16 md:pt-32 md:pb-24 gradient-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left Column - Text Content */}
          <div className="text-center md:text-left animate-fadeIn">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Modern Dental Practice
              <span className="block text-dental-blue">Management Made Simple</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl">
              Streamline your dental clinic operations with our comprehensive SaaS platform.
              Manage appointments, track inventory, and grow your practice with ease.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <Link
                href="/register"
                className="bg-dental-blue text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-700 transition-all transform hover:scale-105 shadow-lg"
              >
                Get Started
              </Link>
              <Link
                href="/login"
                className="bg-white text-dental-blue px-8 py-4 rounded-lg font-semibold text-lg border-2 border-dental-blue hover:bg-blue-50 transition-all"
              >
                Sign In
              </Link>
            </div>

            <div className="mt-8 flex items-center justify-center md:justify-start space-x-8 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Trusted by dental professionals</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>HIPAA compliant</span>
              </div>
            </div>
          </div>

          {/* Right Column - Hero Image/Illustration */}
          <div className="relative animate-fadeIn">
            <div className="gradient-hero rounded-2xl p-8 shadow-2xl">
              <div className="bg-white rounded-xl p-6 space-y-4">
                {/* Mock Dashboard Preview */}
                <div className="flex items-center justify-between pb-4 border-b">
                  <h3 className="font-semibold text-gray-900">Today's Appointments</h3>
                  <span className="text-sm text-gray-500">12 scheduled</span>
                </div>

                {/* Mock Appointment Cards */}
                {[1, 2, 3].map((item) => (
                  <div key={item} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-dental-lightblue rounded-full flex items-center justify-center text-white font-semibold">
                      {item}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Patient Name</p>
                      <p className="text-sm text-gray-500">{9 + item}:00 AM - Check-up</p>
                    </div>
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating Stats Card */}
            <div className="absolute -bottom-6 -right-6 bg-white rounded-lg shadow-xl p-4 hidden lg:block">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Revenue</p>
                  <p className="text-xl font-bold text-gray-900">+23%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
