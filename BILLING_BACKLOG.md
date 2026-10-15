# Billing backlog

Improvements identified in the 2026-10-15 review of the quote and invoice business
logic, after that review's fixes landed (numbering, due dates, discounts, payment
dates, quote-to-invoice, double-billing guards). Each item below is independent;
pick them in any order. Status marks: `[ ]` open, `[x]` done.

## 1. [ ] Fee schedule (per-clinic price list)

**Gap:** procedures are a hard-coded list (`PROCEDURES` in
`client-app/backend/src/doctor/billing/dto/create-invoice.dto.ts`, copied in the
billing page and the chart) with no default prices and no product lines (whitening
kits, retainers).

**Why it matters:** staff retype prices on every quote and invoice; prices differ
by clinic; products cannot be billed at all.

**Shape of the work:**
- Table `fee_schedule_items` (organization_id, optional branch_id, `code`, `name`,
  `kind` = procedure | product, `default_price`, `is_active`, sort order), RLS +
  grants like every tenant table, `pricing:read` gating for the assistant (add to
  `PRICING_COLUMNS` and an `agent` view).
- Seed the current `PROCEDURES` list into every clinic on creation
  (`RolesService.ensureDefaults` pattern).
- Quote lines, invoice lines and chart work reference a fee item (keep
  `procedure_name` as the frozen label on the document; the item id is for prefill
  and reporting).
- UI: `/admin/settings/fees` (admin), prefilled price in the quote, invoice and chart
  forms, product lines on the invoice page.
- Validation: drop the `@IsIn(PROCEDURES)` enum once every clinic has a schedule.

## 2. [ ] Patient credit ledger (deposits and credit on account)

**Gap:** money can only be taken against an invoice. Deposits work today by issuing
the invoice from the accepted quote and paying it, but true "credit on account"
(one deposit spread over several future invoices, overpayment kept as credit) has
no home.

**Rules to keep:** never a payment without a document; credit is never income
until it is applied; refunds of unapplied credit are their own rows with a reason.

**Shape of the work:**
- Table `patient_credits` (organization_id, patient_id, `kind` = deposit |
  applied | refund, amount, `invoice_id` when applied, payment_method,
  payment_date, reason, created_by), balance = deposits - applied - refunds, DB
  check that it never goes negative (trigger like `sync_invoice_totals`).
- `POST /billing/patients/:id/credits` (deposit), `POST /billing/invoices/:id/apply-credit`
  (writes an `invoice_payments` row with `payment_method = credit` and a matching
  `applied` credit row in one transaction with both rows locked).
- Reports: credit held is a liability, shown separately from income and outstanding.
- UI: patient balance card, "Apply credit" on the invoice modal.

## 3. [ ] Clinic timezone per organization

**Gap:** "today" for payment dates, validity dates and aging is one platform-wide
zone (`CLINIC_TIMEZONE`, default Asia/Beirut, in
`client-app/backend/src/shared/common/date-only.ts`); the frontend hard-codes
Asia/Beirut in `formatDateBeirut` and the billing forms. `organizations.timezone`
exists but is not used.

**Shape of the work:**
- Carry `timezone` in `TenantContext` (read with the organization in
  `TenantContextMiddleware`, cached like `UserAccessService`).
- `clinicTodayIso()` reads it from the context; keep the env default as fallback.
- Frontend: expose the zone on `/auth/me` (or `/organizations/me`) and replace the
  hard-coded zone in `lib/utils.ts` and the billing pages.
- Tests: `invoice-math.spec.ts` and the pool spec with a non-Beirut zone.

## 4. [ ] Numbering year follows the issue date (document it)

**Behaviour:** `app.next_document_number` uses `CURRENT_DATE` at insert, so a
December treatment entered in January is `INV-<next year>-00001`. Issue-date
numbering is the normal accounting convention; it is not a bug.

**To do:** state it in the accountant-facing docs and in the invoice print
("Issued on" next to "Work done"); if a clinic's accountant wants procedure-date
years instead, pass `NEW.procedure_date` to the trigger behind a clinic setting.
Backfilled rows were numbered by `created_at` in the session time zone.

## 5. [ ] Immutable line items: say so in the UI, and consider a DB check

**Behaviour:** an invoice's lines cannot be edited after issue; the correction path
is cancel (void) and reissue, which keeps the audit trail honest. The database
checks `total = subtotal - discount` but not `subtotal = SUM(line_items)`.

**To do:**
- Invoice modal: a short note next to the lines ("Lines are fixed once issued;
  cancel and reissue to change them") and a one-click "Cancel and reissue as a
  draft" action that opens the create form prefilled.
- Optional DB guard: a trigger on `invoice_line_items` that refuses INSERT/UPDATE/
  DELETE once the invoice has any payment, and an AFTER trigger keeping `subtotal`
  equal to the lines (mind nested Prisma creates: the invoice row is inserted before
  its lines, so a check constraint would fire too early; use a deferred constraint
  trigger or recompute only).

## 6. [ ] Multi-currency (USD / LBP)

**Gap:** every amount is a bare `NUMERIC(10,2)` with a `$` sign in the UI. Lebanese
clinics quote in USD and often collect in LBP at a daily rate.

**Shape of the work:**
- Clinic setting: `base_currency` (USD) and whether LBP is accepted.
- `invoice_payments`: `currency`, `amount_in_currency`, `exchange_rate`; `amount`
  stays the base-currency value the invoice is settled in (so every balance rule is
  unchanged). Same three columns on `expense_payments`.
- Rate source: typed by the desk per payment, with a clinic default rate that can be
  updated daily; never fetched from the internet silently.
- Reports: totals in base currency, with a breakdown by currency received for the
  cash drawer; receipt print shows both.
- The assistant: new amount columns need `pricing:read` gating decisions
  (`PRICING_COLUMNS`), see `CLAUDE.md`.

## 7. [ ] "Other income" category (not a direct income entry)

**Decision (2026-10-15):** no free "add money" entry. Patient money always attaches
to an invoice (deposits via quote-to-invoice today, item 2 later). Non-treatment
revenue, if the clinic has any, gets its own category, separate from patient billing.

**Shape of the work, only if needed:**
- Table `other_income` mirroring `expenses` (category: product sale | chair rental |
  insurer settlement | other, amount, date, payment_method, note, created_by),
  audit-logged, corrections by reversing entry, admin or `billing:write` only.
- Reported as a separate figure in the summary and KPIs; excluded from billed,
  outstanding and collection rate.
- Product sales to a patient stay on an invoice (item 1 makes that possible).

## Done in the 2026-10-15 review (for reference)

Sequential per-clinic invoice and quote numbers; due dates and aging by due date;
discounts with reasons; payment dates; quote discount; issue an invoice from an
accepted quote; no double billing from the chart (app checks + DB index/trigger);
creator from the session; zero-total invoices settled; `GET /billing/aging` and
`GET /billing/outstanding`; printable invoice/receipt; clinic-calendar "today";
idle-in-transaction timeout on pooled connections; `npm run smoke:billing`.
