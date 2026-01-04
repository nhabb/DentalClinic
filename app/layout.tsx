import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'DentalClinic SaaS - Modern Dental Practice Management',
  description: 'Streamline your dental practice with our comprehensive clinic management platform. Manage appointments, inventory, and multi-clinic operations seamlessly.',
  keywords: 'dental clinic management, dental software, appointment scheduling, inventory management, healthcare SaaS',
  authors: [{ name: 'DentalClinic' }],
  openGraph: {
    title: 'DentalClinic SaaS - Modern Dental Practice Management',
    description: 'Streamline your dental practice with our comprehensive clinic management platform.',
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
