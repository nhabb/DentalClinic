import {
  CheckCircle,
  Sparkles,
  Shield,
  Zap,
  Smile,
  Wrench,
} from "lucide-react";
export default function Services() {
  const services = [
    {
      icon: <CheckCircle className="w-8 h-8" />,
      title: "General Dentistry",
      description:
        "Comprehensive routine checkups, professional cleanings, cavity fillings, and preventive care to keep your teeth healthy.",
    },
    {
      icon: <Sparkles className="w-8 h-8" />,
      title: "Cosmetic Dentistry",
      description:
        "Professional teeth whitening, porcelain veneers, and cosmetic bonding to give you the smile of your dreams.",
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Orthodontics",
      description:
        "Traditional braces and Invisalign clear aligners to straighten teeth and correct bite issues for all ages.",
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: "Implants & Restorations",
      description:
        "Dental implants, crowns, bridges, and dentures to restore your smile and improve oral function.",
    },
    {
      icon: <Wrench className="w-8 h-8" />,
      title: "Emergency Dental Care",
      description:
        "Same-day appointments for dental emergencies including severe pain, broken teeth, and urgent care needs.",
    },
    {
      icon: <Smile className="w-8 h-8" />,
      title: "Pediatric Dentistry",
      description:
        "Specialized care for children with a gentle, friendly approach to make dental visits comfortable and fun.",
    },
  ];

  return (
    <section
      id="services"
      className="py-20 bg-gradient-to-b from-gray-50 to-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Our Dental Services
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Comprehensive dental care for the entire family, from routine
            checkups to advanced procedures.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <div
              key={index}
              className="p-6 rounded-xl bg-white border border-gray-200 hover:border-dental-blue hover:shadow-lg transition-all duration-300 group"
            >
              <div className="w-16 h-16 gradient-hero rounded-lg flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform">
                {service.icon}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {service.title}
              </h3>
              <p className="text-gray-600">{service.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
