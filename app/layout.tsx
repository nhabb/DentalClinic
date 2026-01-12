import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
