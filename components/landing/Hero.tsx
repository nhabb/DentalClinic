import Link from 'next/link'
import Tooth3D from '@/components/ui/Tooth3D'

export default function Hero() {
  return (
    <section className="pt-24 pb-16 md:pt-32 md:pb-24 gradient-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left Column - Text Content */}
          <div className="text-center md:text-left animate-fadeIn">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Welcome to
              <span className="block text-dental-blue">BrightSmile Dental</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl">
              Your trusted partner in comprehensive dental care. From routine checkups to advanced cosmetic procedures, we're dedicated to keeping your smile bright and healthy.
            </p>

            <div className="flex justify-center md:justify-start">
              <Link
                href="/login"
                className="bg-dental-blue text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-700 transition-all transform hover:scale-105 shadow-lg"
              >
                Patient Portal
              </Link>
            </div>

            <div className="mt-8 flex items-center justify-center md:justify-start space-x-8 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>15+ Years Experience</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Family-Friendly Care</span>
              </div>
            </div>
          </div>

          {/* Right Column - 3D Teeth Animation */}
          <div className="relative animate-fadeIn">
            <div className="teeth-scene bg-gradient-to-br from-blue-50/70 via-white/80 to-cyan-50/70 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-dental-lightblue/30">
              <div className="teeth-container">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Tooth3D key={i} index={i} />
                ))}
              </div>
            </div>

            {/* Floating Info Card */}
            <div className="absolute -bottom-6 -right-6 bg-white rounded-lg shadow-xl p-4 hidden lg:block">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-dental-lightblue rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-dental-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Happy Patients</p>
                  <p className="text-xl font-bold text-gray-900">10,000+</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
