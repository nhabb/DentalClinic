import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import Features from '@/components/landing/Features'
import Benefits from '@/components/landing/Benefits'
import Pricing from '@/components/landing/Pricing'
import CTA from '@/components/landing/CTA'
import Footer from '@/components/landing/Footer'

export default function Home() {
  // This is a Server Component by default in Next.js App Router
  // It will be rendered on the server (SSR)

  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Features />
      <Benefits />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  )
}
