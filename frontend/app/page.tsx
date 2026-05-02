// Server Component - Home Page
import { redirect } from 'next/navigation'
import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import Services from '@/components/landing/Services'
import About from '@/components/landing/About'
import Diplomas from '@/components/landing/Diplomas'
import Footer from '@/components/landing/Footer'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error_code?: string }>
}) {
  // Supabase sends OAuth errors (e.g. bad_oauth_state) to the site root.
  // Redirect to /login so the user sees a clear message instead of a raw URL.
  const { error_code } = await searchParams
  if (error_code) {
    redirect(`/login?error=${error_code}`)
  }

  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Services />
      <About />
      <Diplomas />
      <Footer />
    </main>
  )
}
