import Link from 'next/link'

export default function Pricing() {
  const plans = [
    {
      name: 'Starter',
      price: '$99',
      period: '/month',
      description: 'Perfect for small dental practices just getting started',
      features: [
        'Up to 500 patients',
        'Single clinic location',
        'Appointment scheduling',
        'Basic inventory tracking',
        'Patient records management',
        'Email support',
        'Mobile app access',
        '5 staff accounts',
      ],
      cta: 'Get Started',
      popular: false,
    },
    {
      name: 'Professional',
      price: '$249',
      period: '/month',
      description: 'For growing practices that need advanced features',
      features: [
        'Up to 2,000 patients',
        'Up to 3 clinic locations',
        'Advanced appointment scheduling',
        'Full inventory management',
        'Treatment planning tools',
        'Analytics & reporting',
        'Priority support',
        'Unlimited staff accounts',
        'SMS reminders',
        'Online booking portal',
      ],
      cta: 'Get Started',
      popular: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'For large dental groups with complex needs',
      features: [
        'Unlimited patients',
        'Unlimited clinic locations',
        'All Professional features',
        'Custom integrations',
        'Dedicated account manager',
        'Custom training',
        '24/7 phone support',
        'Advanced security features',
        'Custom reporting',
        'API access',
        'White-label options',
      ],
      cta: 'Contact Sales',
      popular: false,
    },
  ]

  return (
    <section id="pricing" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-6">
            Choose the plan that fits your practice. Flexible pricing for clinics of all sizes.
          </p>
          <div className="inline-flex items-center bg-blue-50 rounded-lg p-1">
            <button className="px-6 py-2 rounded-md bg-white text-dental-blue font-semibold shadow-sm">
              Monthly
            </button>
            <button className="px-6 py-2 rounded-md text-gray-600 hover:text-dental-blue">
              Annual (Save 20%)
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-2xl p-8 ${
                plan.popular
                  ? 'bg-gradient-to-b from-dental-blue to-primary-700 text-white shadow-2xl scale-105'
                  : 'bg-white border-2 border-gray-200 hover:border-dental-blue'
              } transition-all duration-300`}
            >
              {plan.popular && (
                <div className="absolute -top-5 left-0 right-0 flex justify-center">
                  <span className="bg-dental-teal text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3
                  className={`text-2xl font-bold mb-2 ${
                    plan.popular ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  {plan.name}
                </h3>
                <p
                  className={`text-sm ${
                    plan.popular ? 'text-blue-100' : 'text-gray-600'
                  }`}
                >
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span
                  className={`text-5xl font-bold ${
                    plan.popular ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  {plan.price}
                </span>
                <span
                  className={`text-lg ${
                    plan.popular ? 'text-blue-100' : 'text-gray-500'
                  }`}
                >
                  {plan.period}
                </span>
              </div>

              <Link
                href="/register"
                className={`block w-full text-center py-3 rounded-lg font-semibold mb-6 transition-all ${
                  plan.popular
                    ? 'bg-white text-dental-blue hover:bg-gray-100'
                    : 'bg-dental-blue text-white hover:bg-primary-700'
                }`}
              >
                {plan.cta}
              </Link>

              <ul className="space-y-3">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start">
                    <svg
                      className={`w-5 h-5 mr-3 flex-shrink-0 mt-0.5 ${
                        plan.popular ? 'text-blue-100' : 'text-green-500'
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span
                      className={`text-sm ${
                        plan.popular ? 'text-blue-50' : 'text-gray-600'
                      }`}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="bg-gray-50 rounded-2xl p-8 md:p-12">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Frequently Asked Questions
          </h3>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Can I change plans later?
              </h4>
              <p className="text-gray-600">
                Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Is there a setup fee?
              </h4>
              <p className="text-gray-600">
                No setup fees. We'll help you get started with free onboarding and training.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                What payment methods do you accept?
              </h4>
              <p className="text-gray-600">
                We accept all major credit cards, debit cards, and ACH transfers for annual plans.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Can I cancel anytime?
              </h4>
              <p className="text-gray-600">
                Yes, you can cancel your subscription at any time. No long-term contracts required.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
