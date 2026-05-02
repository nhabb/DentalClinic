# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BrightSmile Dental Clinic** — a dental practice management SaaS. Full-stack monorepo with a Next.js 16 frontend and NestJS backend, using Supabase for auth and PostgreSQL via Prisma.

## Development Commands

### Frontend (root directory)
```bash
npm run dev       # Start Next.js dev server (localhost:3000)
npm run build     # Production build
npm run lint      # ESLint
```

### Backend (`backend/` directory)
```bash
npm run start:dev   # Start NestJS with file watch (port 5000)
npm run start:debug # Debug mode with watch
npm run build       # Compile TypeScript to dist/
npm run lint        # ESLint with auto-fix
npm run format      # Prettier formatting
npm test            # Jest unit tests
npm run test:e2e    # E2E tests
npm run test:cov    # Coverage report
```

### Prisma (run from `backend/`)
```bash
npx prisma migrate dev    # Apply migrations
npx prisma generate       # Regenerate client after schema changes
npx prisma studio         # Open Prisma Studio GUI
```

## Environment Setup

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

**Backend** (`.env`, see `backend/.env.example`):
```
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
PORT=5000
```

Node version: **20** (see `.nvmrc`)

## Architecture

### Frontend — Next.js 16 (App Router)
- Pages under `app/` using file-based routing
- UI components: `components/ui/` (shadcn/ui new-york style) and `components/landing/`
- API calls go through `lib/api/client.ts` — a fetch wrapper that auto-injects the Supabase Bearer token
- All API endpoint contracts are defined in `lib/api/endpoints.ts`
- Internationalization via `lib/i18n/` — supports EN, AR, FR; use `useTranslation()` hook
- Supabase client at `lib/supabase/client.ts`

### Backend — NestJS 11
- Global prefix: `/api`; Swagger docs at `http://localhost:5000/api/docs`
- All routes protected by `JwtAuthGuard` (`backend/src/common/guards/`) which validates Supabase JWTs
- Standardized error responses via `GlobalExceptionFilter` (`backend/src/common/filters/`)
- Global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`

**Feature modules** (each has controller + service + DTOs):
| Module | Path |
|--------|------|
| Users | `src/users/` |
| Patients | `src/patients/` |
| Appointments | `src/appointments/` |
| Appointment Slots | `src/appointment-slots/` |
| Patient Records | `src/patient-records/` |
| Patient Documents | `src/patient-documents/` |
| Inventory | `src/inventory/` |
| Notifications | `src/notifications/` |
| Prisma (shared) | `src/prisma/` |

### Database — PostgreSQL via Prisma
Schema at `backend/prisma/schema.prisma`. Key tables: `users`, `patient_profiles`, `appointments`, `appointment_slots`, `patient_records`, `patient_documents`, `inventory_items`, `inventory_movements`, `notifications`, `clinic_profile`, `audit_logs`.

### Authentication Flow
1. User authenticates via Supabase (email/password or Google OAuth)
2. Frontend stores session; `lib/api/client.ts` reads the Supabase session and injects `Authorization: Bearer <jwt>` on every API request
3. Backend `JwtAuthGuard` validates the JWT against Supabase's service role key

## Demo Accounts (for testing)
```
patient@demo.com    / demo123  → /patient-dashboard
doctor@demo.com     / Demo123456  → /admin
secretary@demo.com  / demo123  → /admin
super@demo.com      / demo123  → /superadmin
```

## Key Conventions
- Use `class-validator` DTOs for all NestJS controller inputs
- shadcn/ui components are in `components/ui/` — add new ones with `npx shadcn@latest add <component>`
- Path alias `@/*` maps to the repo root for frontend imports
- Backend output dir is `backend/dist/`; never edit generated files in `backend/src/generated/`
