# Platform console

The operator's own application, separate from the clinic product but on the
same database: onboard new clinics (organizations), watch all of them, manage
platform admins.

```
super-admin-app/
  backend/    NestJS API on :5100  — platform-only login, clinics, dashboard, admins
  frontend/   Next.js app on :3100 — same "Clinic Daylight" design system as the clinic app
```

## Run

```bash
# API
cd super-admin-app/backend
cp .env.example .env            # same DATABASE_URL as client-app/backend/.env, its own PLATFORM_JWT_SECRET
npm install
npm run prisma:generate         # client generated from ../../client-app/backend/prisma/schema.prisma
npm run start:dev               # http://localhost:5100/api/docs

## Accounts, roles and permissions

Each clinic page has an **Accounts** tab (staff and patients: edit name and contact, role, home branch and branch restriction, enable or disable, add staff, send a new set-password link) and a **Roles** tab (the clinic's roles with a permission matrix; custom roles can be added, built-in ones renamed, admin is locked). The sidebar's **Accounts** page searches every clinic's accounts at once. Password links are emailed when `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` are set in `super-admin-app/backend/.env`; otherwise the link is shown to copy. The clinic app applies role changes within a minute.

# Console
cd super-admin-app/frontend
npm install
npm run dev                     # http://localhost:3100
```

Sign in with a platform admin: a `users` row with `role = 'superadmin'` and
`organization_id IS NULL` (the demo account is `super@demo.com`). Clinic staff
cannot sign in here, and platform tokens are not accepted by the clinic API.

## How it fits with the clinic product

- **One schema, two clients.** `client-app/backend/prisma/schema.prisma` declares a second
  generator writing to `super-admin-app/backend/src/generated/prisma`. Migrations stay
  in `client-app/backend/prisma/migrations` and are applied once.
- **No tenant context.** The platform API connects as the operator (the login
  role bypasses row-level security) and sets `organization_id` explicitly on
  every write. It never runs clinic code.
- **Onboarding** creates the organization, its default branch, the public
  clinic profile and, optionally, the first admin. The admin receives a password
  setup link that opens the *clinic* app (`CLINIC_APP_URL/set-password?…`); the
  console shows the link so it can be sent by any channel. Nothing is emailed by
  the console.
- **Suspending** a clinic flips `organizations.is_active`; the clinic API locks
  its users out within a minute (see `UserAccessService` in the clinic backend).

## Tests

```bash
cd super-admin-app/backend
npm test                        # unit tests (services, tokens)
npm run smoke                   # end-to-end against a running platform API + real DB (creates and removes a clinic)
cd super-admin-app/frontend
npm run typecheck && npm run build
```
