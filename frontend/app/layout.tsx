import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Fraunces } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from 'sonner'

/* Plus Jakarta Sans for the interface — open counters and a tall x-height
 * keep dense tables legible. Fraunces carries the headings: a warm,
 * slightly soft serif that gives the clinic a voice instead of the
 * default SaaS neutrality. */
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans-stack',
})

const display = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display-stack',
  axes: ['SOFT', 'WONK'],
})

export const metadata: Metadata = {
  title: 'BrightSmile Dental Clinic - Comprehensive Family Dental Care',
  description: 'Quality dental care for the whole family. Offering general dentistry, cosmetic procedures, orthodontics, and emergency care. Your trusted dental partner.',
  keywords: 'dentist, dental clinic, teeth cleaning, cosmetic dentistry, family dentist, orthodontics, dental implants, teeth whitening',
  authors: [{ name: 'BrightSmile Dental Clinic' }],
  openGraph: {
    title: 'BrightSmile Dental Clinic - Your Trusted Dental Partner',
    description: 'Comprehensive dental care for the whole family. General dentistry, cosmetic procedures, orthodontics, and more.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#266b49',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
        <Toaster
          richColors
          position="top-right"
          closeButton
          toastOptions={{
            style: {
              borderRadius: '0.875rem',
              fontFamily: 'var(--font-sans)',
            },
          }}
        />
      </body>
    </html>
  )
}
