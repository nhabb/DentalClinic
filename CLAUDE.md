# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BrightSmile Dental Clinic** — a dental practice management SaaS. Full-stack monorepo with a Next.js 16 frontend and NestJS backend, using Supabase for auth and PostgreSQL via Prisma.

## Repository layout
```
client-app/     the product clinics use (their staff and patients)
  backend/    NestJS API, port 5000, multi-tenant with RLS
  frontend/   Next.js app, port 3000
super-admin-app/   the operator console (you): onboard and monitor every clinic
  backend/    NestJS API, port 5100, platform-only login
  frontend/   Next.js app, port 3100, same design system
docker/     nginx reverse proxy config; docker-compose.yml at the root
```
Both backends share one database and one Prisma schema (`client-app/backend/prisma`).

## Development Commands

From the repo root: `npm run dev:clinic` (clinic API + app) or `npm run dev:platform` (platform API + console).


### Frontend (`client-app/frontend/` directory)
```bash
npm run dev       # Start Next.js dev server (localhost:3000)
npm run build     # Production build
npm run lint      # ESLint
```

### Backend (`client-app/backend/` directory)
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

### Prisma (run from `client-app/backend/`)
```bash
node scripts/apply-sql.js prisma/migrations/<folder>/migration.sql   # Apply a migration (see note)
npx prisma generate       # Regenerate client after schema changes (generated client is committed)
npx prisma studio         # Open Prisma Studio GUI
```
Do **not** run `prisma migrate dev`: the database has no `_prisma_migrations` history
(it was evolved with `db push`/manual SQL), so it would try to replay every old
migration. Write the SQL into a new `prisma/migrations/<timestamp>_<name>/migration.sql`,
apply it with `scripts/apply-sql.js` (whole file in one round trip, so `BEGIN`/`COMMIT`
in the file makes it atomic), update `schema.prisma`, then `npx prisma generate`.

## Environment Setup

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

**Backend** (`.env`, see `client-app/backend/.env.example`):
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
- All routes protected by `JwtAuthGuard` (`client-app/backend/src/common/guards/`) which validates Supabase JWTs
- Standardized error responses via `GlobalExceptionFilter` (`client-app/backend/src/common/filters/`)
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
Schema at `client-app/backend/prisma/schema.prisma`. Key tables: `organizations`, `branches`, `users`, `patient_profiles`, `appointments`, `appointment_slots`, `patient_records`, `patient_documents`, `inventory_items`, `inventory_movements`, `notifications`, `clinic_profile`, `audit_logs`, `treatment_invoices`, `expenses`.

### Multi-tenancy (organizations → branches) and row-level security
- `organizations` = tenant (one dental business); `branches` = its clinic locations (Beirut, Tyre…). Every tenant table has `organization_id`; location-bound tables (`appointment_slots`, `appointments`, `inventory_items`, plus optional on invoices/expenses/records/documents) have `branch_id`. Each organization has exactly one default branch.
- Tenant context: `TenantContextMiddleware` (`src/shared/tenant/`, registered with `app.use` in `main.ts`) reads the JWT (`org_id`, `branch_id` claims) or, for anonymous requests, the `X-Organization` header / host subdomain / `DEFAULT_ORGANIZATION_SLUG`, and stores it in AsyncLocalStorage.
- Database enforcement: `TenantPool` (a `pg` Pool subclass used by `PrismaService`) runs `SET ROLE dental_app` and `set_config('app.current_org', …)` on every checked-out connection. RLS policies on every table only expose rows of that organization; `app.bypass_rls = on` (superadmin, login/invite lookups via `runAsSystem()`) sees everything. With no tenant, every table reads as empty. The Supabase `postgres` login bypasses RLS, which is why the role switch exists.
- New rows get `organization_id`/`branch_id` from the SQL defaults `app.current_org_id()` / `app.default_branch_id()`, so services rarely set them. Set them explicitly only in scripts that connect as `postgres` (seed).
- `src/shared/prisma/tenant-safety.extension.ts` rewrites `findUnique` to `findFirst` outside transactions: Prisma batches same-tick `findUnique` calls across requests into one statement, which would run under one tenant's RLS settings.
- Prisma queries are lazy: always `await` them *inside* `runWithTenant` / `runAsSystem` (the helpers do this for you when you return the query from the callback). Returning the unawaited query to a caller outside the scope runs it with the caller's tenant.
- Management API: `GET/PATCH /api/organizations/me`, `GET/POST/PATCH/DELETE /api/branches`, superadmin-only `GET/POST /api/organizations`. Role checks use `@Roles()` + `RolesGuard`. A superadmin passes `X-Organization-Id` (or `X-Organization` slug) to act inside one tenant.
- Requires a session-mode DB connection (direct `:5432` or Supavisor session mode); transaction-mode poolers would drop `SET ROLE` between statements.
- Tests: `npm test` covers the tenancy layer (`src/shared/tenant/*.spec.ts`, `src/shared/prisma/*.spec.ts`, `src/shared/tenancy/*.spec.ts`). `node scripts/smoke-tenancy.js` runs an end-to-end isolation check against a running backend and the real database (creates and removes a throwaway organization).

### Authentication Flow
1. User authenticates via Supabase (email/password or Google OAuth)
2. Frontend stores session; `lib/api/client.ts` reads the Supabase session and injects `Authorization: Bearer <jwt>` on every API request
3. Backend `JwtAuthGuard` validates the JWT against Supabase's service role key

## Demo Accounts (for testing)
```
patient@demo.com    / demo123  → /patient-dashboard
doctor@demo.com     / demo123  → /admin
secretary@demo.com  / demo123  → /admin
super@demo.com      / demo123  → /superadmin
```

## Working Rules (apply to every change)
- **Review before you finish.** Re-read the diff for correctness, naming and leftovers; fix what you find.
- **Test it.** Run `npx tsc --noEmit`, `npm test` and, for anything touching auth, tenancy or data access, `node scripts/smoke-tenancy.js` against a running backend. Add unit tests for new logic.
- **Readable, no spaghetti.** Small functions with one job, descriptive names, a short comment explaining *why* where the code is not obvious. No duplicated logic across controllers: shared rules live in one service.
- **Organized in folders.** One concern per folder: `src/shared/tenant` (who the request acts for), `src/shared/access` (ownership rules), `src/shared/common/guards|decorators|filters` (cross-cutting HTTP pieces), `src/shared/tenancy` (organizations/branches API), feature modules under `src/doctor` and `src/patient`. New features get their own `module/controller/service/dto` set.

## API security layers
Every route passes through, in order (see `AppModule`):
1. `JwtAuthGuard` (global): valid token, account active, clinic active. Opt out with `@Public()`.
2. `RolesGuard` (global): `@Roles(...STAFF_ROLES)` / `@Roles(...ORG_ADMIN_ROLES)` on controllers or handlers. No `@Roles()` = any signed-in user.
3. Ownership: controllers call `AccessControlService` (`assertSelfOrStaff`, `assertPatientProfileAccess`, `assertSelf`) so patients only reach their own user, profile, appointments, invoices, records and documents.
4. `BranchScopeGuard` (global): staff with `restrict_to_branch` may not name another `branch_id`.
5. Row-level security in PostgreSQL: tenant boundary plus branch scope (`app.branch_scope`), enforced even for raw SQL.
Authorization attributes (role, active flags, branch) are read from the database per request through `UserAccessService` (60 s cache), so revoking access does not wait for token expiry. Admin endpoint: `PATCH /api/users/:id/assignment`.

## Platform console (`super-admin-app/`)
A separate operator application on the same database: `super-admin-app/backend` (NestJS, :5100) and `super-admin-app/frontend` (Next.js, :3100, same design system and copied UI primitives). It onboards clinics (organization + default branch + clinic profile + first admin with a password setup link into the clinic app), monitors all clinics, suspends/reactivates them, and manages platform admins (`superadmin` users with `organization_id NULL`). It has its own token (`PLATFORM_JWT_SECRET`, audience `platform`); clinic tokens are refused and vice versa. The Prisma client comes from the shared `client-app/backend/prisma/schema.prisma` via its second generator (`npm run prisma:generate` in `super-admin-app/backend`; keep `prisma` pinned to the clinic backend's version). Run both with `npm run dev:platform` from the repo root. Tests: `npm test` and `npm run smoke` in `super-admin-app/backend`; `npm run typecheck && npm run build` in `super-admin-app/frontend`. See `super-admin-app/README.md`.

## Key Conventions
- Use `class-validator` DTOs for all NestJS controller inputs
- shadcn/ui components are in `components/ui/` — add new ones with `npx shadcn@latest add <component>`
- Path alias `@/*` maps to each frontend's own root (`client-app/frontend`, `super-admin-app/frontend`)
- Backend output dir is `client-app/backend/dist/`; never edit generated files in `client-app/backend/src/generated/`
