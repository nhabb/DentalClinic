# DentalClinic - Dental Practice Management SaaS

A modern, full-featured dental clinic management SaaS platform built with Next.js 16, TypeScript, and Tailwind CSS.

## Features

- **Modern Landing Page** - Professional, responsive design for the healthcare industry
- **Multi-tenant Architecture** - Support for multiple dental clinics
- **Appointment Management** - Smart scheduling with automated reminders
- **Inventory Tracking** - Real-time supply and equipment management
- **Patient Records** - HIPAA-compliant digital record keeping
- **Analytics & Reporting** - Comprehensive insights and performance metrics
- **Server-Side Rendering (SSR)** - Optimized for SEO and performance

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Deployment**: Ready for Vercel, AWS, or any Node.js hosting

## Getting Started

### Prerequisites

- Node.js 18.19.1 or higher (20.9.0+ recommended)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/nhabb/DentalClinic.git
cd DentalClinic
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
DentalClinic/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout with metadata
│   ├── page.tsx           # Landing page
│   └── globals.css        # Global styles
├── components/            # React components
│   └── landing/          # Landing page components
│       ├── Navbar.tsx
│       ├── Hero.tsx
│       ├── Features.tsx
│       ├── Benefits.tsx
│       ├── Pricing.tsx
│       ├── CTA.tsx
│       └── Footer.tsx
├── public/               # Static assets
└── tailwind.config.ts    # Tailwind CSS configuration
```

## Development Roadmap

- [x] Landing page
- [ ] User authentication
- [ ] Clinic registration and onboarding
- [ ] Dashboard
- [ ] Appointment management system
- [ ] Inventory management system
- [ ] Patient records system
- [ ] Multi-clinic support
- [ ] Analytics and reporting
- [ ] Mobile app

## License

MIT License