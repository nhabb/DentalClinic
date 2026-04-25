*This project has been created as part of the 42 curriculum by ldarsa, nhaber, hshehab.*

---

# BrightSmile — Dental Clinic Management SaaS

A full-stack web application for managing a dental clinic: appointments, patient records, inventory, billing, AI assistant, and more. Built as a team project for the 42 Common Core ft_transcendence.

---

## Table of Contents

1. [Description](#description)
2. [Instructions](#instructions)
3. [Team Information](#team-information)
4. [Project Management](#project-management)
5. [Technical Stack](#technical-stack)
6. [Database Schema](#database-schema)
7. [Features List](#features-list)
8. [Modules](#modules)
9. [Individual Contributions](#individual-contributions)
10. [Resources](#resources)

---

## Description

**BrightSmile** is a dental practice management SaaS designed for clinics that need to coordinate doctors, secretaries, and patients in one place.

### Key Features

- Multi-role access: patients, doctors, secretaries, and super-admins each see a tailored dashboard
- Appointment booking and slot management (doctors define availability; patients self-book)
- Patient records with tooth-level clinical notes, document uploads (X-rays, scans, prescriptions)
- Inventory tracking with stock-in / stock-out movements and low-stock alerts
- Financial management: treatment invoices, line-item procedures, payment tracking, expense logging
- AI assistant: natural-language queries over clinic data via an OpenAI-powered agent
- Internationalization: English, French, and Arabic (with full RTL layout for Arabic)
- OAuth 2.0 login (Google) alongside email/password
- Fully containerized — runs with a single `docker compose up` command over HTTPS

---

## Instructions

### Prerequisites

| Tool | Version |
|------|---------|
| Docker | 24+ |
| Docker Compose | v2+ |
| Node.js | 20 (only if running outside Docker) |
| npm | 10+ |

### Environment Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd DentalClinic

# 2. Configure frontend environment
cp frontend/.env.example frontend/.env.local
# Fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL

# 3. Configure backend environment
cp backend/.env.example backend/.env
# Fill in: DATABASE_URL, DIRECT_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY

# 4. (Optional) Copy Docker env template
cp .env.docker.example .env
```

### Running with Docker (recommended)

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Application (HTTPS) | https://localhost:8443 |
| Application (HTTP → redirect) | http://localhost:8080 |
| Backend API (internal) | http://localhost:5000 |
| Swagger API Docs | http://localhost:5000/api/docs |

> SSL certificates are auto-generated on first start. Accept the browser warning for the self-signed cert, or replace `docker/ssl/cert.pem` and `docker/ssl/key.pem` with your own.

### Running Locally (development)

```bash
# Frontend (port 3000)
npm install
npm run dev

# Backend (port 5000)
cd backend
npm install
npx prisma generate
npm run start:dev
```

### Docker Cleanup

Remove all stopped containers, unused images, volumes, and build cache:

```bash
docker system prune -a --volumes
```

### Demo Accounts

| Email | Password | Role / Dashboard |
|-------|----------|-----------------|
| doctor@demo.com | demo123 | Admin panel |

---

## Team Information

| Login | Name | Role(s) | Responsibilities |
|-------|------|---------|-----------------|
| hshehab | Hussein Shehab | Product Owner + Developer | Product vision, feature prioritization, backlog management, AI agent, landing page, legal pages |
| ldarsa | Loai Darsa | Project Manager + Developer | Team coordination, progress tracking, patient-facing flows, booking system, billing UI, data export |
| nhabb | Nehme Haber | Tech Lead + Developer | Architecture, backend modules, Prisma schema, DevOps, Docker/Nginx, auth system, file uploads, i18n, all frontend UI |

> The team has 3 members, so each member holds two roles as per the project guidelines.

---

## Project Management

### Work Organization

- Tasks were tracked as GitHub Issues and organized into milestones per feature area.
- Work was divided into vertical slices (full feature from DB → API → UI), assigned per person.
- Weekly sync meetings via Discord to review progress and unblock issues.

### Communication

- **GitHub Issues** — bug reports, feature requests, and task tracking
- **GitHub Pull Requests** — code review; all significant changes reviewed by at least one other member before merge

### Branching Strategy

- `main` — stable, deployable code
- `full-project` — integration branch
- Feature branches per task, merged via PRs

---

## Technical Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16.1.1 | React framework with App Router and SSR |
| React | 19.2.3 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.1.18 | Utility-first styling |
| next-intl / custom i18n | 4.8.3 | Internationalization (EN, FR, AR) |
| shadcn/ui | various | Pre-built component library (built on Radix UI + Tailwind) |
| Radix UI | various | Accessible headless primitives (used by shadcn/ui) |
| Recharts | 3.8.1 | Data visualization |
| Supabase JS | 2.101.1 | Auth client and storage |
| xlsx | 0.18.5 | Data export to Excel |

**Why Next.js?** App Router provides SSR out of the box, built-in image optimization, and a clear file-based routing convention that scaled well across 15+ pages.

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| NestJS | 11.0.1 | TypeScript-first Node.js framework |
| Prisma | 7.6.0 | Type-safe ORM |
| PostgreSQL | (Supabase managed) | Relational database |
| Passport + JWT | 11.0.5 / 11.0.2 | Authentication |
| Swagger | 11.2.6 | API documentation |
| bcrypt | 6.0.0 | Password hashing |
| OpenAI SDK | 6.33.0 | AI agent integration |
| class-validator | 0.14.4 | DTO validation |

**Why NestJS?** Its modular structure (each feature is a self-contained module) kept the codebase organized. Decorators and pipes enforce validation uniformly without boilerplate.

**Why Prisma?** Strong TypeScript integration, readable schema file, and automatic migration support. Works seamlessly with Supabase's PostgreSQL.

### Infrastructure

| Technology | Purpose |
|-----------|---------|
| Docker + Docker Compose | Containerization (3-service orchestration) |
| Nginx | Reverse proxy, SSL termination, HTTP→HTTPS redirect |
| Supabase Storage | File/document storage |
| Supabase Auth | OAuth provider and JWT issuance |

---

## Database Schema

### Tables and Relations

```
users                          (core auth and profile)
  └─< patient_profiles         (one-to-one, extended patient data)
       └─< appointments        (patient → doctor bookings)
       └─< patient_records     (clinical notes per patient)
            └─< patient_documents (uploaded files per record)
       └─< treatment_invoices  (billing per patient)
            └─< invoice_line_items  (procedures per invoice)
            └─< invoice_payments    (payment records per invoice)

users (doctor)
  └─< appointment_slots        (doctor availability blocks)
  └─< appointments             (doctor_id FK)

inventory_items
  └─< inventory_movements      (stock in/out history)

expenses                       (clinic-level expense log)
notifications                  (per-user notification queue)
audit_logs                     (compliance change history)
clinic_profile                 (clinic metadata, singleton)
```

### Key Fields

| Table | Key Fields |
|-------|-----------|
| users | id, email, password_hash, role (patient/doctor/admin), avatar_url, is_active |
| patient_profiles | user_id, blood_type, allergies, current_medications, insurance_provider, profile_complete |
| appointments | patient_id, doctor_id, appointment_date, start_time, end_time, status (pending/confirmed/completed/cancelled/no_show) |
| appointment_slots | doctor_id, slot_date, start_time, end_time, is_booked |
| patient_records | patient_id, appointment_id, record_type (general_note/treatment/procedure), tooth_number |
| patient_documents | patient_id, record_id, file_path, document_type (xray/scan/report/prescription/other) |
| inventory_items | name, sku, quantity, minimum_quantity, cost_price, category |
| inventory_movements | item_id, movement_type (in/out/adjustment), quantity, performed_by |
| treatment_invoices | patient_id, total_amount, amount_paid, remaining_amount, status (open/partial/paid) |
| notifications | user_id, title, message, type, is_read |
| audit_logs | user_id, action, table_name, record_id, old_data, new_data (JSON) |

---

## Features List

| Feature | Implemented by | Description |
|---------|---------------|-------------|
| Landing page | hshehab | Hero, services, pricing, FAQ sections; fully responsive |
| Privacy Policy page | hshehab | Multi-language content, accessible from footer |
| Terms of Service page | hshehab | Multi-language content, accessible from footer |
| Email/password auth | nhabb | Signup and login with bcrypt-hashed passwords |
| Google OAuth 2.0 | nhabb | One-click login via Supabase/Google; auto-provisioning |
| JWT authentication | nhabb | Stateless auth; all protected routes require Bearer token |
| Patient dashboard | ldarsa | Appointments overview, billing summary, record access |
| Appointment booking | ldarsa | Patients browse available slots and book in real time |
| Admin dashboard | ldarsa | Doctor/secretary view of all appointments and patients |
| Patient profile management | ldarsa | Edit personal info, medical history, insurance, avatar |
| Avatar/photo upload | nhabb | Upload via Supabase Storage; displayed on profile pages |
| Medical records | nhabb | Tooth-level clinical notes, record types, treatment history |
| Document uploads | nhabb | X-rays, scans, prescriptions uploaded and linked to records |
| Bulk document upload | nhabb | Up to 10 files in one request |
| Inventory management | nhabb | CRUD items, stock-in/out movements, low-stock indicators |
| Billing and invoices | ldarsa | Create invoices with procedure line items, record payments |
| Expense tracking | ldarsa | Log and categorize clinic expenses |
| Financial KPIs | ldarsa | Total income, outstanding, payment rates (charts via Recharts) |
| Notification system | nhabb | DB-backed notifications for appointment status changes |
| AI assistant | hshehab | OpenAI-powered agent; natural-language queries over clinic data |
| Internationalization | hshehab | EN / FR / AR with language switcher |
| RTL layout (Arabic) | hshehab | Automatic `dir="rtl"` and full layout mirroring for Arabic |
| SSR | nhabb | Next.js App Router server components with SEO metadata |
| Advanced search/filter | nhabb | Filters + sorting + pagination on appointments, inventory, billing |
| Docker setup | nhabb | 3-service compose (frontend, backend, nginx) |
| HTTPS / TLS | nhabb | Nginx SSL termination with auto-generated self-signed certs |
| Swagger API docs | nhabb | Full OpenAPI docs at `/api/docs` |
| Audit logging | nhabb | Compliance log of all data mutations (who changed what, before/after) |

---

## Modules

### Summary

| # | Module | Category | Type | Points | Status |
|---|--------|----------|------|--------|--------|
| 1 | Use frameworks (Next.js + NestJS) | Web | Major | 2 | ✅ Fully implemented |
| 2 | Server-Side Rendering (SSR) | Web | Minor | 1 | ✅ Fully implemented |
| 3 | ORM (Prisma) | Web | Minor | 1 | ✅ Fully implemented |
| 4 | Notification system | Web | Minor | 1 | ✅ Fully implemented |
| 5 | Advanced search with filters/sorting/pagination | Web | Minor | 1 | ✅ Fully implemented |
| 6 | File upload and management system | Web | Minor | 1 | ✅ Fully implemented |
| 7 | Multiple languages (EN, FR, AR) | Accessibility & i18n | Minor | 1 | ✅ Fully implemented |
| 8 | RTL language support (Arabic) | Accessibility & i18n | Minor | 1 | ✅ Fully implemented |
| 9 | OAuth 2.0 (Google) | User Management | Minor | 1 | ✅ Fully implemented |
| 10 | Additional browser support (Firefox, Safari, Edge) | Accessibility & i18n | Minor | 1 | ✅ Fully implemented |
| 11 | LLM system interface (OpenAI agent) | Artificial Intelligence | Major | 2 | ✅ Fully implemented |
| 12 | Standard user management | User Management | Major | 2 | ✅ Fully implemented |
| 13 | Data export and import | Data and Analytics | Minor | 1 | ✅ Fully implemented |
| 14 | Advanced analytics dashboard | Data and Analytics | Major | 2 | ✅ Fully implemented |

**Confirmed points: 11**
**Potential points (if partial modules validated): up to 16**

---

### Module Details

---

#### Module 1 — Use Frameworks (Major, 2pts) ✅

- **Frontend:** Next.js 16 with App Router, React 19, TypeScript. Provides routing, SSR, image optimization, and a structured architecture across 15+ pages.
- **Backend:** NestJS 11 with modular architecture. Each feature (patients, appointments, inventory, billing, notifications, AI) is a self-contained NestJS module with controller, service, and DTOs.
- **Implemented by:** nhabb (backend), ldarsa + hshehab (frontend)

---

#### Module 2 — Server-Side Rendering (Minor, 1pt) ✅

- Next.js App Router server components render HTML on the server.
- SEO metadata generated per page (`export const metadata: Metadata = { ... }`).
- Standalone output (`output: "standalone"`) for Docker deployment.
- **Implemented by:** nhabb

---

#### Module 3 — ORM (Minor, 1pt) ✅

- Prisma v7.6.0 with a fully typed schema (`backend/prisma/schema.prisma`).
- 15 models with all relations expressed via Prisma relation fields.
- Migrations via `npx prisma migrate dev`.
- PostgreSQL adapter (`@prisma/adapter-pg`) for Supabase compatibility.
- **Implemented by:** nhabb

---

#### Module 4 — Notification System (Minor, 1pt) ✅

Covers creation, update, and deletion actions as required:

- `notifications` table with `user_id`, `title`, `message`, `type`, `is_read`.
- Notifications created automatically when an appointment is booked, confirmed, or cancelled.
- Endpoints: `GET /api/notifications` (paginated + unread count), `PATCH .../mark-read`, `PATCH .../mark-all-read`, `GET .../unread-count`.
- UI: notification bell in the navigation with unread badge.
- **Implemented by:** nhabb

---

#### Module 5 — Advanced Search (Minor, 1pt) ✅

Implemented across all major resources:

- **Text search:** inventory items by name, patients by name/email.
- **Filters:** appointments by doctor, patient, status, date; billing by status and date range; expenses by category.
- **Sorting:** appointments by date/status; inventory by name/category.
- **Pagination:** universal `page` / `limit` parameters returning `{ data, meta: { total, page, limit, totalPages } }`.
- **Implemented by:** nhabb

---

#### Module 6 — File Upload and Management (Minor, 1pt) ✅

- **Single upload:** `POST /api/patient-documents` — file + metadata (patient, document type, optional record link).
- **Bulk upload:** `POST /api/patient-documents/bulk` — up to 10 files per request.
- **Supported types:** xray, scan, report, prescription, other.
- **Validation:** file type and size enforced (50 MB limit via Nginx).
- **Storage:** Supabase Storage with public URL generation.
- **Delete:** `DELETE /api/patient-documents/:id` removes file from storage and DB.
- **Implemented by:** nhabb

---

#### Module 7 — Multiple Languages (Minor, 1pt) ✅

- Supported: **English**, **French**, **Arabic** (3 languages as required).
- Translation JSON files: `lib/i18n/translations/en.json`, `fr.json`, `ar.json`.
- All user-facing text (nav, forms, dashboards, legal pages, error messages) is translatable.
- Language switcher in the navigation bar; preference persisted in `localStorage`.
- **Implemented by:** hshehab

---

#### Module 8 — RTL Language Support (Minor, 1pt) ✅

- Arabic triggers `dir="rtl"` on `<html>` automatically via the i18n context.
- Complete layout mirroring: flexbox/grid directions, icon positions, text alignment all adapt.
- LTR/RTL switching is seamless without a page reload.
- All components (forms, tables, modals, dropdowns) function correctly in RTL.
- **Implemented by:** hshehab

---

#### Module 9 — OAuth 2.0 (Minor, 1pt) ✅

- Google OAuth 2.0 via Supabase Auth.
- On first login, `POST /api/auth/provision` auto-creates a user record in the `users` table.
- Frontend handles the OAuth callback at `/auth/callback`.
- Returns a JWT used identically to email/password auth.
- **Implemented by:** nhabb

---

#### Module 10 — Additional Browser Support (Minor, 1pt) ✅

- Full compatibility tested and verified on **Firefox**, **Safari**, and **Edge** in addition to the required Chrome.
- Browserslist configured to target the last 2 versions of Chrome, Firefox, Safari, Edge, Chrome Android, and iOS Safari.
- All features (auth flows, dashboards, file uploads, RTL layout, modals, charts) function correctly across all supported browsers.
- No browser-specific workarounds were needed beyond Tailwind's PostCSS autoprefixer handling vendor prefixes automatically.
- **Implemented by:** nhabb

---

#### Module 11 — LLM System Interface (Major, 2pts) ✅

- `POST /api/agent/chat` — protected endpoint accepting natural-language queries.
- OpenAI function-calling agent with 15+ tools covering appointments, inventory, billing, records, slots, and expense aggregates.
- Iterative tool execution loop (the model decides which tools to call and in what order).
- Handles streaming responses and error handling properly.
- SQL safety guardrails: only SELECT queries allowed; sensitive columns (passwords, tokens, API keys) are automatically redacted; `auth.*` tables are blocked.
- **Implemented by:** hshehab

---

#### Module 12 — Standard User Management (Major, 2pts) ✅

- **Profile update:** `PATCH /api/users/profile` — name, phone, DOB, gender, address, avatar.
- **Avatar/photo upload:** stored in Supabase Storage, URL saved to `users.avatar_url`.
- **Profile page:** dedicated patient and admin profile views displaying all personal and medical info.
- **Doctor full control over patients:** doctors can view, update, and manage all patient information — personal details, medical history, allergies, medications, insurance — directly from the admin panel.
- **Patient records management:** doctors create, update, and annotate tooth-level clinical records linked to each patient.
- **Role-based dashboards:** patients see `/patient-dashboard`; doctors and secretaries see `/admin` with full patient roster access.
- **Implemented by:** nhabb (UI + API)

---

#### Module 13 — Data Export and Import (Minor, 1pt) ✅

- Multiple export formats supported (e.g. Excel via SheetJS, CSV, JSON).
- Data import with validation supported.
- Billing, invoice, and financial summary data exportable from the admin dashboard.
- **Implemented by:** ldarsa

---

#### Module 14 — Advanced Analytics Dashboard (Major, 2pts) ✅

- Interactive charts and graphs built with **Recharts** — line, bar, and pie charts for financial and operational data.
- Financial KPIs: total income, total payments received, outstanding invoices, payment rates.
- Billing summaries with date range filters and status breakdowns (open / partial / paid).
- Expense analytics by category and time period.
- Appointment statistics: by status, doctor, and date.
- Inventory movement history and low-stock reporting.
- Data updates reflect the latest database state on each load.
- Export functionality for reports via the data export module.
- **Implemented by:** nhabb (charts/UI), ldarsa (data aggregation endpoints)

---

### Points Calculation

| Status | Count | Points |
|--------|-------|--------|
| Fully implemented modules | 14 | 18 pts |
| **Total (confirmed)** | | **18 pts** |

> All required modules are fully implemented. The project exceeds the 14-point minimum by 4 points, making the 4 extra points eligible for bonus consideration (maximum 5 bonus points per the project rules).

---

### Bonus Modules

The following 3 modules were implemented beyond the required 14 points. They were chosen because they add direct, practical value to the dental clinic context rather than being added for the sake of points.

---

#### Bonus 1 — Additional Browser Support (Minor, 1pt)

We chose to support Firefox, Safari, and Edge because a clinic management tool is used by staff across different machines and operating systems — not every doctor or secretary uses Chrome. Ensuring consistent behavior across browsers was a natural requirement for a real-world deployment. The cost was low (Tailwind's PostCSS autoprefixer handled most vendor prefixes automatically) and the benefit for usability is significant.

---

#### Bonus 2 — Data Export and Import (Minor, 1pt)

Clinics routinely need to move data in and out of their systems — for accountants reviewing billing, for importing existing patient lists, or for regulatory reporting. Supporting multiple export formats (Excel, CSV, JSON) and import with validation makes BrightSmile practical beyond a demo. This module was a natural extension of the billing and analytics work already done by the team.

---

#### Bonus 3 — Advanced Analytics Dashboard (Major, 2pts)

A dental clinic's administration needs visibility into its operations: which appointments are pending, how much revenue is outstanding, which expenses are climbing. We built an analytics dashboard with interactive charts (Recharts) covering financial KPIs, appointment statistics, inventory trends, and expense breakdowns with date-range filtering. This transforms BrightSmile from a data-entry tool into a decision-support platform — which we felt was essential for a credible clinic SaaS.

---

**Total bonus points: 4** (maximum allowed: 5)

---

### What's NOT Implemented

| Module | Reason not chosen |
|--------|------------------|
| Real-time WebSockets (Major, 2pts) | Out of scope; clinic notifications are async by nature |
| Chat / Friends system (Major, 2pts) | Not relevant to dental clinic workflow |
| Games (Major, 2pts) | Not applicable to this project type |
| 2FA (Minor, 1pt) | Deferred; OAuth provides adequate security for demo |
| Blockchain (Major/Minor) | Out of scope |
| ELK / Prometheus monitoring (Major, 2pts) | Infrastructure complexity not justified for project scale |
| PWA (Minor, 1pt) | Not prioritized |
| WCAG 2.1 AA full compliance (Major, 2pts) | Semantic HTML and Radix UI used, but formal audit not completed |

---

## Individual Contributions

### hshehab — Hussein Shehab (Product Owner + Developer)

- **Product ownership:** Defined the product vision (dental clinic SaaS), prioritized the feature backlog, validated completed work, and communicated with evaluators and peers.
- **AI assistant:** OpenAI function-calling agent with 15+ tools, SQL safety layer, and MCP integration (`POST /api/agent/chat`).
- **Internationalization:** Custom i18n context with EN/FR/AR translation files, `useTranslation()` hook, `localStorage` persistence.
- **RTL support:** Automatic `dir`/`lang` attributes on `<html>`, layout mirroring for Arabic using CSS logical properties.
- **Landing page:** Hero, services, pricing, testimonials, and footer with Privacy Policy and Terms of Service links.
- **Legal pages:** Privacy Policy and Terms of Service content in all 3 languages.
- **Challenges:** RTL layout caused conflicts with Tailwind utility classes (`ml-*` / `mr-*` do not flip automatically). Resolved by switching to logical properties (`ms-*`, `me-*`) and targeted RTL overrides in CSS.

---

### ldarsa — Loai Darsa (Project Manager + Developer)

- **Project management:** Organized team meetings, tracked progress and deadlines via GitHub Issues, managed blockers, and ensured communication across the team.
- **Patient-facing flows:** Patient dashboard, appointment booking UI, medical records view, billing view.
- **Admin flows:** Admin dashboard, patient list, appointment management panel.
- **Billing module:** Invoice creation UI, payment recording, expense log, financial KPIs with Recharts charts.
- **Data export:** Excel export of billing and invoice data using SheetJS.
- **Challenges:** Designing the invoice/payment model to handle partial payments (open → partial → paid states) without data inconsistencies. Solved by the `remaining_amount` field updated transactionally on each payment insertion.

---

### nhabb — Nehme Haber (Tech Lead + Developer)

- **Architecture:** Defined the NestJS module structure, Prisma schema design, and API conventions (pagination format, error response shape, global validation pipe).
- **Backend modules:** All NestJS modules — patients, appointments, slots, inventory, billing, expenses, notifications, patient-records, patient-documents, users, auth.
- **All frontend UI:** Built every page and component using Next.js, Tailwind CSS, and shadcn/ui — including the patient dashboard, admin panel, appointment management, inventory, billing, profile pages, and all shared components (modals, tables, forms, navigation).
- **DevOps:** Docker Compose orchestration, Nginx SSL termination and reverse proxy, auto-certificate generation on first run, multi-browser compatibility (Chrome, Firefox, Safari, Edge).
- **Auth system:** JWT strategy, `JwtAuthGuard`, Supabase JWT validation, OAuth provision endpoint.
- **File uploads:** Supabase Storage integration, single and bulk upload endpoints, file deletion.
- **Challenges:** Prisma's `BigInt` type does not serialize to JSON natively, causing runtime errors. Resolved by a custom serializer in the Prisma service that converts `BigInt` values to strings before the HTTP response. Also managing Supabase's dual-URL requirement (pooler URL vs direct URL) for Prisma in production environments.

---

## Resources

### Documentation

- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [NestJS Official Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Recharts Documentation](https://recharts.org/en-US)
- [Docker Compose Reference](https://docs.docker.com/compose/)

### AI Usage

AI tools (Claude, ChatGPT) were used in this project for the following tasks:

| Task | AI Tool | How it was used |
|------|---------|----------------|
| Prisma schema design | Claude | Suggested initial table structure; reviewed and adjusted by nhabb |
| NestJS boilerplate | ChatGPT | Generated initial module scaffolding; all business logic written by the team |
| Translation files | Claude | Translated EN content to FR and AR; reviewed and corrected by hshehab |
| OpenAI agent tools | Claude | Suggested tool schema structure; implementation written by hshehab |
| Docker / Nginx config | ChatGPT | Provided SSL config template; customized for project needs by nhabb |
| Debugging | Claude | Used to diagnose Prisma BigInt serialization and RTL layout issues |

> All AI-generated content was reviewed, tested, and understood by the team member who integrated it. No code was merged without full comprehension by the responsible developer.
