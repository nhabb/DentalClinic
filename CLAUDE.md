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
npx prisma generate       # Regenerate client after schema changes (generated client is committed; both generators are pinned to moduleFormat cjs + no import extension because tsconfig uses nodenext)
npx prisma studio         # Open Prisma Studio GUI
```
Do **not** run `prisma migrate dev`: the database has no `_prisma_migrations` history
(it was evolved with `db push`/manual SQL), so it would try to replay every old
migration. Write the SQL into a new `prisma/migrations/<timestamp>_<name>/migration.sql`,
apply it with `scripts/apply-sql.js` (whole file in one round trip, so `BEGIN`/`COMMIT`
in the file makes it atomic), update `schema.prisma`, then `npx prisma generate`.
Every table and column carries a Postgres comment describing what it means and its allowed
values (migration `20261009120000_table_and_column_comments`, re-runnable). The AI assistant
reads them at startup (`src/patient/agent/schema-summary.ts`), so when you add a table or
column, add its `COMMENT ON` to that file and re-apply it.

The AI assistant's SQL tool reads as the database role `dental_agent` (migration
`20261008210000_agent_permissions_rls`): a new table the assistant may read needs a
`GRANT SELECT`, an `agent_permission` policy and an entry in `TABLE_PERMISSIONS`
(`src/patient/agent/agent-access.ts`). Credential columns are kept out with column-level
grants (`20261013190000_agent_users_column_grants`). A price or cost column needs the
`pricing:read` permission: list it in `PRICING_COLUMNS` and give the table a view in schema
`agent` that gates the column (`20261013200000_pricing_permission_and_agent_views`). The
specs next to `agent-access.ts` fail when any of these drift.

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
| Authorization (roles & permissions) | `src/shared/authorization/` |
| Specialists & consultations | `src/doctor/specialists/` |
| Labs & lab orders | `src/doctor/lab/` |
| Case links (patient/visit/record belong together) | `src/doctor/case-links/` |

### Database — PostgreSQL via Prisma
Schema at `client-app/backend/prisma/schema.prisma`. Key tables: `organizations`, `branches`, `users`, `patient_profiles`, `appointments`, `appointment_slots`, `patient_records`, `patient_documents`, `inventory_items`, `inventory_movements`, `notifications`, `clinic_profile`, `audit_logs`, `treatment_invoices`, `expenses`, `specialists`, `specialist_consultations`, `dental_labs`, `lab_orders`.

### Multi-tenancy (organizations → branches) and row-level security
- `organizations` = tenant (one dental business); `branches` = its clinic locations (Beirut, Tyre…). Every tenant table has `organization_id`; location-bound tables (`appointment_slots`, `appointments`, `inventory_items`, plus optional on invoices/expenses/records/documents) have `branch_id`. Each organization has exactly one default branch.
- Tenant context: `TenantContextMiddleware` (`src/shared/tenant/`, registered with `app.use` in `main.ts`) reads the JWT (`org_id`, `branch_id` claims) or, for anonymous requests, the `X-Organization` header / host subdomain / `DEFAULT_ORGANIZATION_SLUG`, and stores it in AsyncLocalStorage.
- Database enforcement: `TenantPool` (a `pg` Pool subclass used by `PrismaService`) runs `SET ROLE dental_app` and `set_config('app.current_org', …)` on every checked-out connection. RLS policies on every table only expose rows of that organization; `app.bypass_rls = on` (superadmin, login/invite lookups via `runAsSystem()`) sees everything. With no tenant, every table reads as empty. The Supabase `postgres` login bypasses RLS, which is why the role switch exists.
- New rows get `organization_id`/`branch_id` from the SQL defaults `app.current_org_id()` / `app.default_branch_id()`, so services rarely set them. Set them explicitly only in scripts that connect as `postgres` (seed).
- `src/shared/prisma/tenant-safety.extension.ts` rewrites `findUnique` to `findFirst` outside transactions: Prisma batches same-tick `findUnique` calls across requests into one statement, which would run under one tenant's RLS settings.
- Prisma queries are lazy: always `await` them *inside* `runWithTenant` / `runAsSystem` (the helpers do this for you when you return the query from the callback). Returning the unawaited query to a caller outside the scope runs it with the caller's tenant.
- Management API: `GET/PATCH /api/organizations/me`, `GET/POST/PATCH/DELETE /api/branches`, superadmin-only `GET/POST /api/organizations`. Platform-only routes use `@Roles('superadmin')` + `RolesGuard`; everything else uses permissions (below). A superadmin passes `X-Organization-Id` (or `X-Organization` slug) to act inside one tenant.
- Requires a session-mode DB connection (direct `:5432` or Supavisor session mode); transaction-mode poolers would drop `SET ROLE` between statements.
- Every checked-out connection also runs `SET idle_in_transaction_session_timeout = '30s'` (`TenantPool.prime`): a client that dies mid-transaction behind Supavisor would otherwise keep its row locks (the invoice-number counter among them) and stall every later invoice of that clinic until the pooler notices; the server now ends such a session itself. If invoices ever hang anyway, look for `idle in transaction` rows in `pg_stat_activity` and terminate them.
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
- **Test it.** Run `npx tsc --noEmit`, `npm test` and, for anything touching auth, tenancy or data access, `node scripts/smoke-tenancy.js` and `npm run smoke:permissions` against a running backend. Add unit tests for new logic.
- **Readable, no spaghetti.** Small functions with one job, descriptive names, a short comment explaining *why* where the code is not obvious. No duplicated logic across controllers: shared rules live in one service.
- **Organized in folders.** One concern per folder: `src/shared/tenant` (who the request acts for), `src/shared/access` (ownership rules), `src/shared/common/guards|decorators|filters` (cross-cutting HTTP pieces), `src/shared/tenancy` (organizations/branches API), feature modules under `src/doctor` and `src/patient`. New features get their own `module/controller/service/dto` set.

## API security layers
Every route passes through, in order (see `AppModule`):
1. `JwtAuthGuard` (global): valid token, account active, clinic active. Opt out with `@Public()`.
2. `RolesGuard` (global): only for platform routes, `@Roles('superadmin')`.
3. `PermissionsGuard` (global): `@RequirePermissions('billing:create')` on a controller or handler; the caller's role must hold every listed permission. No decorator = any signed-in user (then step 4 applies).
4. Ownership: controllers call `AccessControlService` (`assertSelfOrPermission`, `assertPatientProfileAccess(actor, profileId, permission)`, `assertSelf`) so patients only reach their own user, profile, appointments, invoices, records and documents, while staff need the named permission for other people's data.
5. `BranchScopeGuard` (global): staff with `restrict_to_branch` may not name another `branch_id`.
6. Row-level security in PostgreSQL: tenant boundary plus branch scope (`app.branch_scope`), enforced even for raw SQL.
Authorization attributes (role, active flags, branch, the role's permissions) are read from the database per request through `UserAccessService` (60 s cache), so revoking access does not wait for token expiry. Admin endpoint: `PATCH /api/users/:id/assignment` (`role`, `branch_id`, `restrict_to_branch`, `is_active`).

### Money
**One door per document.** Each kind of document is created on the page that owns it, so no screen opens a door into another's work. The **dental chart** (`/admin/patients`, chart tab) is where work is planned **and priced**: each row carries the price it was planned at (`patient_records.quoted_amount`, set on `POST /patient-work` or changed later with `PATCH /patient-work/records/:id/price`). It still creates no money: it issues no invoice and takes no payment, and work already on an invoice shows a plain "Billed" marker and can be neither repriced nor deleted. **The plan is the quote**: see below. The **billing page** (`/admin/billing`) is where every invoice is created (**New bill** → pick the patient → their completed, unbilled chart work is listed to tick, plus any charge that is not chart work, such as a consultation, a product or a missed-appointment fee) and where every payment is received (**Take payment** on any owed invoice), alongside the corrections it already held: refunds, voids and password-confirmed deletion. The **quotes page** (`/admin/billing/quotes`) is the register of every clinic quote: search, filter, print, and decide one (give to the patient, accepted, declined, revise, or bill it in full up front). It does **not** create quotes — planning on the chart does. Both builders read `GET /billing/patients/:patientId/billable` (needs `billing:read` **and** `records:read`, since it returns clinical rows), which returns that patient's completed work and planned work that carry no `invoice_id` yet. An invoice line may carry `record_id`: the record is attached to the invoice inside the same transaction (`updateMany ... WHERE invoice_id IS NULL`, rolling back with a 409), so chart work can never be billed twice. The client shape of both documents lives in one place each, `components/billing/invoice-doc.ts` and `quote-doc.ts` (types, normalizers, status colours, aging, the printed invoice/receipt and estimate, and the `PROCEDURES` list the API validates against); the builders and drawers are `components/billing/NewInvoiceModal.tsx`, `NewQuoteModal.tsx` and `TakePaymentModal.tsx`. The chart deep-links to either page with `?patient=<profile id>`, and an invoice links back to the chart read-only. Who issued an invoice or recorded a payment always comes from the session, never from the request body.

Money received lives only in `invoice_payments` (via `POST /billing/invoices/:id/payments`); money paid out only in `expense_payments`. Invoices come from two places, the billing page (`POST /billing/invoices`, which may name the chart records it bills and links them so they cannot be billed twice) and an accepted quote (`POST /quotes/:id/invoice`); payments always attach to an invoice. The arithmetic every creator follows lives in one place, `src/doctor/billing/invoice-math.ts`: `subtotal` (the lines) minus `discount_amount` (needs `discount_reason`, never above the lines) = `total_amount` (what is owed); an invoice that comes to nothing is `paid` from the start; `due_date` (payment terms) defaults to `procedure_date` (due on receipt) and is never earlier; the creator is the signed-in user, never a body field. Every invoice and quote gets a sequential, gapless, per-clinic-per-year number from a database trigger (`invoice_number` INV-2026-00017, `quote_number` QUO-2026-00004; counters in `document_sequences`, function `app.next_document_number`; migration `20261015120000_billing_numbering_terms_discounts`), so the number is the same whichever screen issued it and a deleted invoice leaves an honest gap. A payment or refund carries `payment_date` (the day the money moved, default today, never in the future); the summary, KPIs and monthly analytics report by that day, not by `created_at`. Outstanding balances age from `due_date` (`GET /billing/aging`: `not_yet_due` is current, then 1-30 / 31-60 / 61-90 / 90+ days overdue; `GET /billing/outstanding` lists each balance with `days_overdue`). `BillingService.recordPayment` and the expenses equivalents run in one transaction with the row locked (`FOR UPDATE`) and re-derive the totals from the payments table, so simultaneous posts cannot overpay or desync. Migration `20261009010000_payment_integrity` makes the database enforce it too: positive payment amounts, `amount_paid` within the total with `remaining_amount = total - paid`, and triggers that recompute totals and status on every payment change. Money that has moved is never rewritten: corrections are **refunds** (`POST /billing/invoices/:id/refunds`, a row in `invoice_payments` with `kind = refund` and a required reason; the trigger makes `amount_paid` = payments - refunds, so a refund can never exceed what was received) and **voids** (`POST /billing/invoices/:id/void`, status `cancelled` with `cancelled_at`/`cancelled_by` and `cancel_reason`; only when nothing is net-paid, releases the chart records it billed, takes no further payments, excluded from outstanding and from billed totals; migration `20261014200000_quotes_refunds_void`). Deleting an invoice (`DELETE /billing/invoices/:id`, refused if it has any payment or refund row) or a single payment row (`DELETE /billing/payments/:id`) is for pure mistakes: `billing:delete` **and** `ConfirmedAdminGuard` (`src/shared/step-up/`): the caller must be a clinic admin (or a superadmin inside the clinic) and re-enter their own password in the `X-Confirm-Password` header for that request; refusals carry a `code` (`password_confirmation_required` | `password_confirmation_failed` | `password_confirmation_unavailable`). A refund and a void are corrections, so both need `billing:edit`, not `billing:create`. Refunds, voids and deletions are written to `audit_logs` by `AuditService` (`src/shared/audit/`). The billing page prints an invoice (a receipt once paid) with number, terms, discount and money received. Tests: `invoice-math.spec.ts`, `billing.service.spec.ts`, `patient-work.service.spec.ts`, `confirmed-admin.guard.spec.ts`; `npm run smoke:billing` (`scripts/smoke-billing.js`) walks quote -> invoice -> payment -> refund -> void against the running API in a throwaway clinic. A quote carries at most one live invoice, so `BillingService.create` stamps `treatment_invoices.quote_id` only when the invoice bills *every* line of one accepted quote and that quote has no live invoice yet (`wholeQuoteBilledBy`); a plan billed visit by visit leaves `quote_id` null on each part, because stamping a part would make the rest of the plan unbillable. Both creators also catch the `one_live_per_quote` violation and answer 409 rather than letting a 500 escape. Work is billed once, enforced twice: both creators attach records with `updateMany ... WHERE invoice_id IS NULL` (plus `patient_id` and `record_type`) inside their transaction and roll back with a 409 when the count falls short, and migration `20261015130000_billing_double_billing_guards` adds a partial unique index (one live, non-cancelled invoice per `quote_id`) and a trigger that refuses to move a billed `patient_records.invoice_id` to another invoice (releasing it to NULL, what a void does, stays allowed). "Today" for payment dates, validity dates and aging is the clinic's calendar day (`clinicTodayIso`, `CLINIC_TIMEZONE`, default Asia/Beirut, in `src/shared/common/date-only.ts`), not the server's UTC date; the billing page and the quotes panel use the same zone for their date defaults and limits. The chart routes record work only: they take no price onto an invoice and `created_by` is never a body field anywhere.

### The plan is the quote (`src/doctor/quotes/plan-quote.service.ts`)
Planning priced work on the dental chart builds the patient's estimate and keeps it in step with the plan, so the paper the patient is given always matches the teeth. `PlanQuoteService.sync(patientId, actorId)` runs after every change to the plan — recording work, repricing a row, completing planned work, deleting a record — and rebuilds the quote's lines from the patient's planned, unbilled records.

- The quote is created as a **draft**: it is never auto-sent and never auto-accepted, because confirming it is a person's job (**Give to patient** / **Patient accepted** on the chart's estimate band, `components/chart/PlanQuoteBand.tsx`).
- It keeps following the plan **after confirmation too**, by product decision: one quote per patient that always matches the plan, whatever its status.
- **A billed quote is frozen.** The query that finds the quote to sync skips any quote with a live invoice, so once an invoice is issued from it the figures are the invoice's and the plan no longer rewrites them; work planned afterwards starts a fresh draft. Without this an invoice could end up disagreeing with its own quote.
- An unconfirmed draft with nothing left to quote is deleted; a confirmed quote is kept even when the plan empties, because it records what was agreed.
- A sync failure is logged and swallowed: a chart edit must not fail because its estimate could not be refreshed.
- Tests: `plan-quote.service.spec.ts`; `npm run smoke:plan-quote` walks plan → auto quote → reprice → confirm → change after acceptance → bill → frozen, against the running API.

**Billing reads by quote and by treatment.** `GET /billing/patients/:patientId/billable` returns `quoted` (each quote that priced some of the patient's completed, unbilled work, with those treatments under it) and `unquoted` (work no live quote covers), and prices each treatment at what its quote agreed rather than the chart's figure. The invoice builder groups its lines the same way, so the desk can see what every charge belongs to.

### Quotes (`src/doctor/quotes/`)
A quote is a priced treatment plan, not money: it never counts as income or outstanding. Tables `quotes` (`quote_number`, version, `supersedes_id`, status `draft -> sent -> accepted | declined | expired`, `valid_until` (today or later), `quoted_discount`, `quoted_total` = lines - discount kept by trigger) and `quote_items` (`quoted_amount`, optional `record_id` to a planned chart record of the same patient). Only drafts change or can be deleted; a revision is a new row (`POST /quotes/:id/revise`, version + 1) so what the patient saw stays. Accepting (from draft, which also stamps `sent_at`, or from sent) writes each line's price onto its unbilled record's `quoted_amount` and closes earlier sent/accepted versions as expired; it is refused when any quoted record is already on an invoice (revise the quote instead). Two ways to bill an accepted quote: the billing page bills the agreed price of the completed work, visit by visit if the plan runs over several, or `POST /quotes/:id/invoice` bills the whole quote as it stands (lines, discount, `discount_reason` naming the quote; treatment paid up front or in instalments), attaching the planned records to the invoice so the chart completes them later without pricing them again (`completePlanned` refuses a price for a record that already has an `invoice_id`); one live invoice per quote, a cancelled one does not count. Permissions: `billing:read` to read, `billing:create` to prepare and invoice, `billing:edit` to change a draft or decide it, `billing:delete` to drop a draft. The price columns are deliberately named `quoted_*`: the assistant hides price fields by column name (`PRICING_COLUMNS`), so `amount` / `total_amount` would have hidden invoice fields too. UI: the quotes page (`/admin/billing/quotes`, `components/billing/QuotesPanel.tsx` with `NewQuoteModal.tsx`), the one place an estimate is created and decided. **New quote** picks the patient, lists the work planned on their chart to tick and price, and ends in the action itself, **Save as draft** / **Save and print** / **Patient accepted**, so quoting never leaves a draft lying around; the list then sends, accepts, declines, revises, bills or deletes a quote. The chart deep-links here with `?patient=<profile id>`. Tests: `quotes.service.spec.ts`.

### Patient files, lab cases and outside doctors
**Phone numbers** everywhere go through `IsPhone()` (`src/shared/common/phone.ts`): digits with optional `+ ( ) -` and spaces, 6 to 20 digits, blank treated as not given, the typed form stored as typed. It guards every number the clinic keeps (patient, work, both emergency contacts, staff, labs, outside doctors, branches, the organization). Before it, the fields were `@IsString()` only and happily stored "abcdef".

**The patient file** (`patient_profiles`) reads like a real document: besides the medical fields it carries work (`occupation`, `employer`, `work_phone`), two emergency contacts with their relationship (`emergency_contact_relationship`, `emergency_contact_2_*`) and identity (`national_id`, `marital_status`, `nationality`, `preferred_language`; the last two are CHECK-constrained lists). `PatientsService.patientSelect` lists every column the screen shows, so **a new profile column must be added there too** or it saves and never comes back. Edited at `/admin/patients` → a patient → Edit, which sends profile fields to `PATCH /patients/:id` and name/phone/birth date to `PATCH /users/:id`, checking both answers.

**Lab cases** (`lab_orders`) carry what the technician needs: `material`, `units`, `tracking_ref`, `impression_method` (digital | physical), `try_in_at`, and remake tracking (`remake_of_id` → the order it replaces, with a required `remake_reason`; a remake must belong to the same patient and may not be itself). A lab (`dental_labs`) has `contact_person`, `turnaround_days`, `payment_terms` and `tax_number`; when an order is sent with no `due_at`, the due date defaults to the send date plus that lab's turnaround.

**Outside doctors**: `specialist_consultations.direction` records which way the patient moved — `referred_out` (we sent them to the outside doctor), `referred_in` (the outside doctor sent them to us) or `visiting` (the outside doctor treated the patient here). It decides who bills: on `referred_out` the other clinic charges the patient and `fee` is what was agreed with them; on `referred_in` and `visiting` the work happens here, so it is invoiced from the billing page as usual.

Migrations `20261016160000_patient_lab_specialist_detail` (columns, CHECKs, comments) and `20261016170000_agent_views_new_columns`. **A new column on a table the assistant may read must also be added to that table's view in schema `agent`**, or `agent-pricing-views.spec.ts` fails; `CREATE OR REPLACE VIEW` may only append columns, so new ones go at the end of the existing list. Neither app has a screen for labs or outside doctors yet: both are API-only (`/api/labs`, `/api/lab-orders`, `/api/specialists`, `/api/consultations`).

### Roles & permissions (`src/shared/authorization/`)
- `permissions.ts` is the catalog: every capability of the API as `<area>:<action>`, grouped for display, plus the default roles. The actions are CRUD: `read` to view, `create` to add, `edit` to change, `delete` to remove (`appointments:read`, `patients:create`, `records:edit`, `billing:delete`, …), so a role can be allowed to add work without being allowed to delete it. An area only carries the actions it has routes for (`documents` is never edited), and a few capabilities are not CRUD (`clinic:settings`, `pricing:read`, `agent:use`). The catalog is code because endpoints are code; add a permission there when you add a capability, then guard the route with `@RequirePermissions()` naming the action that route performs (`POST /invoices/:id/void` is a `billing:edit`, not a create). Migration `20261016120000_crud_permissions` is what split the old catch-all `:write` / `:manage` keys and carried every clinic's roles over.
- Which role holds which permission is per-clinic data: tables `roles` (`organization_id`, `key`, `name`, `is_system`) and `role_permissions`, both under RLS. `users.role` stores the role key. `RolesService.ensureDefaults()` seeds admin / doctor / secretary / patient for a new clinic (on creation and lazily on first use).
- `admin` always has every permission and `patient` none (both locked); doctor and secretary are editable; clinics can add custom roles. Deleting a role in use or a built-in role is refused.
- API: `GET /api/permissions`, `GET /api/roles` (need `staff:read`); `POST/PATCH/DELETE /api/roles[/:key]` (need `roles:create` / `roles:edit` / `roles:delete`); `/api/auth/me` returns the caller's `permissions` so the UI can hide what the role cannot do.
- UI: clinic admins manage this at `/admin/roles` (`client-app/frontend/app/admin/roles/`, API wrapper in `lib/api/roles.ts`). The admin UI mirrors the API: `lib/permissions.ts` (`usePermissions().can(key)`, from `/auth/me`) and `lib/adminAccess.ts` (screen → permission; read by `AdminScreenGuard` in the admin layout, the sidebar and the command palette) hide screens and write buttons the role lacks. When you add a route with `@RequirePermissions`, gate its button with `can(...)` too. The chart never bills, so `POST /patient-work[/complete]` needs only `records:*`; `billing:create` guards the billing and quotes pages, where invoices and estimates are made.
- Tests: `permissions.guard.spec.ts`, `roles.service.spec.ts`, `access-control.service.spec.ts`; `scripts/smoke-tenancy.js` section 5 proves that editing a role changes what its holder can reach on the next request.
- **Every route is covered.** `route-inventory.ts` reads the decorators of every `*.controller.ts` and `route-coverage.spec.ts` fails when a route has neither `@Public`, `@Roles` nor `@RequirePermissions` and is not in its `SELF_SERVICE_ROUTES` list (routes that check ownership in the handler; each entry names the check). `npm run routes -- --table` prints the inventory. `npm run smoke:permissions` (`scripts/smoke-permissions.js`) then calls every route of the running API as no-token / patient / staff-with-no-permission / clinic admin / superadmin inside a throwaway clinic and checks each answer against the declared protection (`ROUTE_FILTER=users` limits it). Run it after touching any controller.

### AI assistant (`src/patient/agent/`)
The assistant is read-only (it lists, reports and queries; it never books, cancels, invoices or notifies) and acts with the caller's permissions, never its own. `agent-access.ts` labels every tool (`TOOL_PERMISSIONS`) and every table the SQL tool may read (`TABLE_PERMISSIONS`) with a key from the catalog; the model only receives the tools the user's role holds, and `tools/tool-runner.ts` re-checks before running (handlers live in `tools/<area>.tools.ts`, one file per area; `agent.service.ts` only talks to OpenAI). `query_database` is judged from its syntax tree (`sql-policy.ts`, pgsql-ast-parser): one read-only statement, `public` tables only, allowlisted functions, no CTE named after a real table; then `guarded-select.ts` runs it on the tenant connection in a READ ONLY transaction as the database role `dental_agent`, with the caller's permission keys in the transaction-local setting `app.agent_permissions`: every clinic table has a RESTRICTIVE policy for that role that raises unless the required key is present (migration `20261008210000_agent_permissions_rls`), so the database itself enforces clinic, branch and role permissions; patient rows of `users` additionally need `patients:read` (migration `20261008230000_agent_users_patient_rows`). Rows are capped and the transaction is rolled back if any `app.*` setting changed. Conversations live on the server, one row per user in `agent_conversations` (`conversation-store.ts`, migration `20261013210000_agent_conversations`): the client sends only the new message (`POST /agent/chat { message }`), reads its own history (`GET /agent/chat`) and forgets it (`DELETE /agent/chat`); the table has no grant for `dental_agent`, so no chat is reachable through SQL. Every answer also writes one `agent_usage` row (`usage-recorder.ts`, migration `20261013220000_agent_usage`: tokens in/out summed over the rounds, rounds, tool calls, duration; never the question text), which the platform console's **AI usage** page reads (`super-admin-app/backend/src/ai-usage`, `GET /ai-usage`, `/ai-usage/organizations/:id`, `/ai-usage/accounts/:userId`) to show spend per clinic, per account and per question; costs are estimates from the list prices in `ai-usage.service.ts`. Text filters are not a boundary here: add rules to the policy or the database, not to a regex. Tests: `agent-access.spec.ts`, `sql-policy.spec.ts`, `guarded-select.spec.ts`, `agent.service.spec.ts` (stubbed OpenAI); `npm run smoke:agent` replays every known bypass against the real database as the demo secretary. A new tool or table without a label fails `agent-access.spec.ts`; changing `TABLE_PERMISSIONS` without a matching migration fails `agent-permissions-migration.spec.ts`.

## Platform console (`super-admin-app/`)
A separate operator application on the same database: `super-admin-app/backend` (NestJS, :5100) and `super-admin-app/frontend` (Next.js, :3100, same design system and copied UI primitives). It onboards clinics (organization + default branch + clinic profile + first admin with a password setup link into the clinic app), monitors all clinics, suspends/reactivates them, manages platform admins (`superadmin` users with `organization_id NULL`), and manages every clinic's accounts, roles and permissions: `GET /accounts` (cross-clinic search), `GET|PATCH /organizations/:id/accounts[/:userId]`, `POST .../accounts/:userId/password-reset` (new set-password link, emailed when SMTP_* is configured), `GET /permissions`, `GET|POST|PATCH|DELETE /organizations/:id/roles[/:key]`. The rules are the clinic app's (admin locked, patient none, built-in and in-use roles undeletable, a clinic keeps one active admin); `src/catalog/permissions.ts` is a copy of the clinic catalog kept identical by `permissions.sync.spec.ts`. Every change is written to the clinic's `audit_logs` as `platform.*`. It has its own token (`PLATFORM_JWT_SECRET`, audience `platform`); clinic tokens are refused and vice versa. The Prisma client comes from the shared `client-app/backend/prisma/schema.prisma` via its second generator (`npm run prisma:generate` in `super-admin-app/backend`; keep `prisma` pinned to the clinic backend's version). Run both with `npm run dev:platform` from the repo root. Tests: `npm test` and `npm run smoke` in `super-admin-app/backend`; `npm run typecheck && npm run build` in `super-admin-app/frontend`. See `super-admin-app/README.md`.

## Key Conventions
- Use `class-validator` DTOs for all NestJS controller inputs
- Free-text `search` parameters go through `src/shared/common/text-search.ts` (`personSearchTiers` for first/last names, `textSearchTiers` for plain columns, run with `searchWithFallback`): the query loosens tier by tier (exact → all words → any word) and `meta.searchTier` tells the client and the AI assistant how loose the match was. Do not hand-roll `contains` filters for a new search.
- shadcn/ui components are in `components/ui/` — add new ones with `npx shadcn@latest add <component>`
- Path alias `@/*` maps to each frontend's own root (`client-app/frontend`, `super-admin-app/frontend`)
- Backend output dir is `client-app/backend/dist/`; never edit generated files in `client-app/backend/src/generated/`
