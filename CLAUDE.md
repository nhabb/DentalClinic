# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BrightSmile Dental Clinic** — a dental practice management SaaS: Next.js 16 frontends and NestJS backends, using Supabase for auth and PostgreSQL via Prisma. **This repository holds the frontends only.**

## Repositories & deployment

The project is split across two GitHub repos that mirror the same folder layout:

| Repo | Holds | Vercel project (team `dream-team-1a73`) |
|------|-------|------------------------------------------|
| `nhabb/DentalClinic` (this repo) | `client-app/frontend`, `super-admin-app/frontend` | `dentalclinic` → root `client-app/frontend` → https://brightsmileclinic.vercel.app |
| `nhabb/BrightsmileClinicBack` | `client-app/backend`, `super-admin-app/backend` | `brightsmile-api` → root `client-app/backend` → https://brightsmile-api.vercel.app |

- **Branches:** `main` = production; `PRE` = preview. A push to any branch other than `main` builds a Vercel preview URL; a push to `main` deploys to production.
- **Clone both side by side** to run the full stack locally; the folder names are the same in both repos, so paths in docs match.
- **Backend changes** (API, Prisma schema, migrations, RLS) go in `BrightsmileClinicBack` — see its `CLAUDE.md`. If a frontend change needs a new or changed endpoint, make it there or leave a note for the backend team.
- **Super-admin apps** (`super-admin-app/*`) are not deployed to Vercel yet.
- **Env vars** live in the Vercel projects (`vercel env pull` to sync). `NEXT_PUBLIC_API_URL` points the frontend at the backend (no `/api` suffix; the client adds paths).
- **Vercel CLI deploys:** the CLI does **not** read `.gitignore`; `.vercelignore` is what keeps `.env*` files and keys out of uploads. Keep it when adding secret files. Prefer Git-triggered deploys (push a branch).

## Repository layout
```
client-app/frontend/        Next.js app clinics use (staff and patients), port 3000
super-admin-app/frontend/   operator console (onboard and monitor every clinic), port 3100, same design system
docker/, docker-compose.yml full-stack local setup (expects the backends next to the frontends; currently stale)
```

## Development Commands

From the repo root: `npm run dev` (clinic app) or `npm run dev:super-admin` (console); `npm run install:all` installs both.

### Frontend (`client-app/frontend/` or `super-admin-app/frontend/`)
```bash
npm run dev       # Start Next.js dev server (localhost:3000 / 3100)
npm run build     # Production build
npm run lint      # ESLint
```
`super-admin-app/frontend` also has `npm run typecheck`.

## Environment Setup

**Frontend** (`.env.local`, see `.env.example` in each app):
```
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
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

### Authentication Flow
1. User authenticates via Supabase (email/password or Google OAuth)
2. Frontend stores session; `lib/api/client.ts` reads the Supabase session and injects `Authorization: Bearer <jwt>` on every API request
3. Backend `JwtAuthGuard` validates the JWT against Supabase's service role key

The platform console uses its own platform token (audience `platform`); clinic tokens are refused there and vice versa.

### Permissions in the UI
The API guards every route with a permission key (`<area>:<action>`, e.g. `billing:write`); `/api/auth/me` returns the caller's `permissions`. The admin UI mirrors the API: `lib/permissions.ts` (`usePermissions().can(key)`) and `lib/adminAccess.ts` (screen → permission; read by `AdminScreenGuard` in the admin layout, the sidebar and the command palette) hide screens and write buttons the role lacks. When the backend adds a route with `@RequirePermissions`, gate its button with `can(...)` too. Clinic admins manage roles at `/admin/roles` (`client-app/frontend/app/admin/roles/`, API wrapper in `lib/api/roles.ts`). Billing from the dental chart needs `billing:write`; without it the chart records work unbilled.

Search endpoints loosen their match when nothing is found and report how loose it was in `meta.searchTier`; show that to the user rather than treating loose results as exact.

## Demo Accounts (for testing)
```
patient@demo.com    / demo123  → /patient-dashboard
doctor@demo.com     / demo123  → /admin
secretary@demo.com  / demo123  → /admin
super@demo.com      / demo123  → /superadmin
```

## Working Rules (apply to every change)
- **Review before you finish.** Re-read the diff for correctness, naming and leftovers; fix what you find.
- **Test it.** Run `npm run build` (and `npm run lint`) in the app you changed.
- **Readable, no spaghetti.** Small components and functions with one job, descriptive names, a short comment explaining *why* where the code is not obvious.

## Key Conventions
- shadcn/ui components are in `components/ui/` — add new ones with `npx shadcn@latest add <component>`
- Path alias `@/*` maps to each frontend's own root (`client-app/frontend`, `super-admin-app/frontend`)
