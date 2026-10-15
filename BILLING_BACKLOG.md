# Billing backlog

Improvements identified in the 2026-10-15 review of the quote and invoice business
logic, after that review's fixes landed (numbering, due dates, discounts, payment
dates, quote-to-invoice, double-billing guards). The document model below is the
vocabulary; item 0 is the structure the rest sit inside and should come first;
items 1 to 10 are independent of each other. Status marks: `[ ]` open, `[x]` done.

## Document model (QuickBooks mapping)

The clinic's billing follows the QuickBooks document model, which splits every
transaction into **non-posting**, a proposal that never touches the books, and
**posting**, something that changes what is owed or what was received. "A quote is
not money" is exactly QuickBooks' non-posting estimate.

| QuickBooks | Here | State |
|---|---|---|
| Customer | Patient | have |
| Products and services | Fee schedule | item 1 |
| Estimate, non-posting | Quote | have |
| Delayed charge, non-posting | Planned work on the chart | have |
| Invoice | Invoice | have |
| Sales receipt | Bill and collect at the chair | item 8 |
| Receive payment | Payment | have, but bound to one invoice |
| Unapplied credit | Credit on account | item 2 |
| Credit memo | Reduce a bill after issue | item 9 |
| Refund receipt | Refund | have |
| Void versus delete | Void versus delete | have |
| Terms | Due date | item 10 |
| Undeposited funds, deposit | Daily close | item 10 |
| Statement | Patient statement | item 0 |

## 0. [x] One door: the dental chart (done 2026-10-16)

**Principle:** the dental chart is the only place anything is created. Plan,
quote, bill and collect all happen there, in the order a visit actually goes.
The Billing page only shows: invoices, quotes, outstanding, aging, takings,
corrections. Its new-invoice button is a patient picker that opens that patient's
chart with the bill ready. Nobody creates money from a list, the way nobody
writes a cheque from a bank statement.

**Gap:** an invoice can be created from four places today (the chart's record-work
and complete-work actions, the Billing page's new-invoice button, and
`POST /quotes/:id/invoice`) and a payment from two (the billing page invoice modal
and the patients page). Same rules underneath, different screens on top, so staff
cannot tell which door to use and each flow drifts on its own.

**Shape of the work:**

- *The chart screen, three bands.* Teeth and history at the top, the plan and its
  quotes in the middle, money at the bottom: this patient's invoices, four figures
  (billed, received, owed, credit held) and Take payment. Permission decides which
  bands a user can act in, so the doctor works the top and the secretary the bottom
  without either changing screens.
- *Plan to quote in one step.* Tick planned items, press Quote, set the validity
  date and an optional discount, save, print. If the patient agrees in the chair,
  accept it right there; accepting a draft already stamps it as given.
- *Plan to invoice in one step.* Tick what was done today, confirm the prices,
  bill. Or bill a whole accepted quote up front from the same panel. One builder,
  pre-filled differently; never a separate form.
- *Charges with no tooth.* A whole-mouth row in the work list for a consultation,
  a product or a missed appointment fee. Records and invoice lines already allow a
  null tooth, so this needs no new table and it removes the last reason for a
  stand-alone invoice form.
- *One payment drawer.* Identical wherever it opens: amount, method, day received,
  who took it, reference, note, then tick which invoices it covers. Anything not
  applied stays as credit on the patient, which is item 2.
- *The invoice panel is shared, not a door.* It opens from the chart or from the
  billing list and is the same thing both times: lines, totals, payments, refund,
  void, print. Looking is allowed from anywhere, creating is not.
- *The statement.* One chronological money ledger per patient with four row kinds,
  charge, receipt, refund and credit applied. Printable. This is what the patient
  and the accountant ask for, and it does not exist today.
- *Receipt per payment,* not only per invoice: a patient paying one instalment
  wants a slip for that instalment.
- *The Billing page becomes read only.* Invoices and quotes across patients,
  outstanding and aging, today's takings by method for reconciling the till, and
  the corrections log. Its new-invoice button picks a patient and jumps to that
  patient's chart.
- *Roles.* The doctor acts in the clinical bands, the secretary in the money band,
  both on the same screen. The permission catalog already supports this split, so
  it is screen wiring, not new authorization.

**Shipped:** the three bands on the chart, quoting the plan in one dialog that ends in draft / print / accepted, issuing an invoice from an accepted quote, general charges with no tooth, the billing page read-only with a patient picker, quotes split onto their own page, and `invoice-doc.ts` / `quote-doc.ts` as the single client definition of each document.

**Left for later:** the four-figure header still shows three, since credit held needs item 2; refund, void and delete stay on the billing page rather than in the chart band; there is no patient statement yet, and no per-payment receipt slip, both of which want item 2 first.

**Why first:** items 1 and 2 hang off this. The fee schedule removes the second
place a price can be typed, and the credit ledger needs the account header to be
visible from anywhere. Most of this is moving surfaces, not inventing rules: the
services already enforce the money invariants, and the review of 2026-10-15 closed
the holes behind them.

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

## 2. [ ] Payments belong to the patient, applied to invoices

QuickBooks "Receive payment": the money is the customer's, and applying it to
invoices is a separate act.

**Gap:** `invoice_payments.invoice_id` is NOT NULL, so money can only exist against
exactly one invoice. A deposit taken before any invoice, one payment covering three
invoices, an overpayment kept as credit, and a credit memo all have nowhere to live.

**Rules to keep:** never money without a document; unapplied money is a liability,
not income; refunds of unapplied money are their own rows with a reason.

**Shape of the work:** a payment header plus allocation lines.
- `patient_payments` (header): organization_id, patient_id, `kind` = payment |
  refund, amount, payment_method, payment_date, reference, notes, created_by,
  numbered like the other documents (RCP-2026-00001).
- `payment_allocations` (lines): payment_id, invoice_id, amount. An invoice's
  received total becomes the sum of its allocations, so `app.sync_invoice_totals`
  reads this table instead of `invoice_payments`.
- Credit held for a patient is header amount minus allocated, summed over their
  payments. Shown in the chart's money band and on the statement, never as income.
- Applying credit later is a new allocation row, not a new payment.

**Care:** this is the only item that rewrites the money table. Migrate every
existing row into a header with one allocation, move the checks and triggers from
`20261009010000_payment_integrity` onto the new shape, and extend
`npm run smoke:billing` before cutting over. The cheaper alternative, a separate
`patient_credits` table beside `invoice_payments`, leaves two tables both meaning
"money received" and every report having to union them; that is the drift this
backlog exists to remove.

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

## 8. [ ] Sales receipt: bill and collect in one act

**Gap:** a patient paying in full at the chair needs an invoice created and then a
payment recorded against it, two acts seconds apart. QuickBooks calls the single act
a sales receipt and never creates a receivable for it.

**Shape of the work:** one button in the chart's money band, "Bill and collect",
creating the invoice and its full payment in one transaction so the amount is never
outstanding, even for an instant. No new table is needed: it is an invoice paid in
full on its issue date, and the print already says Receipt once an invoice is paid.
Add a flag only if reporting has to separate point-of-sale from billed revenue.

## 9. [ ] Credit memo: reduce a bill after it is issued

**Gap:** once an invoice is issued, the only way to reduce it is to void the whole
thing. A patient disputing one line, or goodwill given after the fact, has no
instrument short of cancelling a correct invoice.

**Shape of the work:** a credit memo applies to an invoice like a payment but is not
money: it reduces what is owed, never what was received. With item 2 in place it is
an allocation row with `kind = credit`, carrying a required reason and an audit
entry, issued by `billing:write`.

**Cost:** the invariant moves. `remaining_amount = total_amount - amount_paid`
becomes `remaining = total - paid - credited`, so the check in
`20261009010000_payment_integrity` and `app.sync_invoice_totals` both change. Keep
`amount_paid` strictly money, so income and the collection rate stay honest.

## 10. [ ] Payment terms and the daily close

**Terms:** replace the raw due date with a named terms list per clinic, due on
receipt, net 15, net 30, that computes the date while leaving it editable. Fewer
decisions at the desk, and it is what an accountant expects printed on an invoice.

**Daily close:** QuickBooks holds receipts in undeposited funds and then groups them
into one deposit matching the bank or the cash count. The clinic equivalent is
closing the day: list what was taken by method, let the person count the drawer,
record any difference with a note, and lock the day. Today's takings exist as a
report; this makes them a record somebody signs off.

## Done in the 2026-10-15 review (for reference)

Sequential per-clinic invoice and quote numbers; due dates and aging by due date;
discounts with reasons; payment dates; quote discount; issue an invoice from an
accepted quote; no double billing from the chart (app checks + DB index/trigger);
creator from the session; zero-total invoices settled; `GET /billing/aging` and
`GET /billing/outstanding`; printable invoice/receipt; clinic-calendar "today";
idle-in-transaction timeout on pooled connections; `npm run smoke:billing`.
