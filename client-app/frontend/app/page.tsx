// Server Component - Home Page
import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import Services from '@/components/landing/Services'
import About from '@/components/landing/About'
import Diplomas from '@/components/landing/Diplomas'
import Appointment from '@/components/landing/Appointment'
import Footer from '@/components/landing/Footer'

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Services />
      <About />
      <Diplomas />
      {/* <Appointment /> */}
      <Footer />
    </main>
  )
}
