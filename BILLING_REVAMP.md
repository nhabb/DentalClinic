# Billing revamp — one plan, one quote, one money writer

Done 2026-10-17. Two pieces of work, shipped in order: **Part A** made one piece
of code responsible for writing money, and **Part B** made the treatment plan
and the quote the same thing.

Companion documents: `BILLING_BACKLOG.md` (what was planned and what is left),
`CLAUDE.md` → **Money**, **The patient ledger**, **The plan is the quote**,
**The patient statement** (how it works now).

---

## Why

Billing, quotes, payments and prepayments had drifted into parallel
implementations of the same ideas. Three symptoms, in order of how much they
hurt:

1. **A plan could not be changed once treatment started.** `revise` allowed only
   `sent | accepted | declined | expired`, but a database trigger flipped an
   accepted quote to `in_progress` the moment any item was marked started — so
   revise became unreachable. Revising a partly-billed quote copied lines
   pointing at billed records, so accepting it always threw
   `assertRecordsUnbilled`. There was **no supported way to re-price or extend a
   plan mid-treatment**, which is the normal case in dentistry.
2. **The quote↔invoice link disappeared** for any plan actually worked through.
   `POST /quotes/:id/invoice` required status exactly `accepted`; the only path
   reachable afterwards (`bill-completed`) deliberately left
   `treatment_invoices.quote_id` NULL.
3. **Two money writers** — `BillingService` and `PatientLedgerService` — locked
   different rows and disagreed about where an invoice's balance came from. Two
   desks posting at once could both pass their checks; only a database CHECK
   stopped the result, and it escaped as a 500.

Underneath all three: the same thing was stored twice. Treatment progress lived
in both `patient_records.record_type` and `quote_items.status`. A price lived on
both the chart row and the quote line. Money had one code path for "pay this
invoice" and another for "take money from this patient".

---

## Part A — One money writer

**`MoneyService` (`src/doctor/billing/money.service.ts`) is now the only code in
the clinic that creates a payment, an allocation or a refund.** `BillingService`
and `PatientLedgerService` kept their public methods but became thin: validate,
audit, choose a response shape.

Three rules it encodes:

| Rule | Why |
|---|---|
| **The locked invoice row is the truth** | `app.recalc_invoice_totals` maintains `amount_paid` / `remaining_amount` / `status` from an AFTER trigger on `payment_allocations`, so `SELECT … FOR UPDATE` on the invoice serialises every allocation touching it. The figures on the held row are authoritative for as long as the lock is held. |
| **The application never writes those totals** | `writeTotals` is deleted. The database computed them, so the database is what gets read back. This also removed a path that could overwrite `cancelled`, because `deriveInvoiceStatus` has no `cancelled` branch while the trigger preserves it. |
| **One lock order: invoices ascending by id, then payments ascending by id** | `applyCredit` went payment→unlocked-invoice while `deletePayment` went invoice→payment. That was the deadlock pair. |

Supporting pieces:

- `money-sums.ts` — the three allocation aggregates that were hand-written four
  times across two services, plus pure twins for rows already in hand.
- `money-errors.ts` — `mapMoneyConstraint` turns a database refusal into the
  HTTP answer it deserves, so a lost race reads as 409 "reload and try again"
  rather than a 500. Anything unrecognised is re-thrown untouched and stays loud.
- `invoice-shape.ts` — `invoiceInclude` / `withAppliedPayments` moved out of
  `billing.service.ts` so the money writer can return an invoice without
  importing the service that calls it. Re-exported from `billing.service` so the
  quotes module's existing imports still work.

### Two kinds of refund, told apart

Both are `invoice_payments` rows with `kind = 'refund'`, and `getSummary` summed
them identically — so a credit refund and an invoice refund were
indistinguishable in the income report.

`refund_scope` now says which: `invoice` (money off a named bill; carries an
allocation, lowers that invoice's `amount_paid`) or `credit` (unapplied credit
handed back; no allocation, touches no invoice). `createPaymentRow` takes a
discriminated union, so the **compiler** refuses a refund that does not say which
it is. `GET /billing/summary` and `/billing/kpis` report `refunds_on_invoices`
and `refunds_of_credit` beside `total_refunded`, which still means both together.

### One payment drawer

`POST /billing/patients/:patientId/payments` gained an optional `invoice_id`:
the named bill is filled first, and anything beyond it follows `auto_apply` —
on to the next oldest bill, or held as credit — rather than being refused for
being too much. When a bill is named the response carries that `invoice`
alongside the ledger, so the screen redraws the row without a second request.

`TakePaymentModal` now serves both jobs. With no bill named it is a deposit form.

> **A judgement call to review:** with a bill named, the overflow checkbox
> defaults to **off** (hold as credit). An over-amount against a named bill is
> usually a typo, and credit is visible and reversible where another patient's
> bill moving is not. Deposits still default to settling oldest-first.

### Not done, deliberately

The plan called for re-routing `POST /invoices/:id/payments` through
`takePayment` behind a `strictToInvoice` flag. Both already run entirely through
`MoneyService`, so the duplication was gone; adding the flag would have been
indirection to reproduce identical behaviour. It stays a thin strict wrapper.

---

## Part B — The plan is the quote

**The planned and completed rows of `patient_records` *are* the plan.**
`PlanService.read()` computes the quote from them whenever anyone asks. Nothing
is kept in step because nothing is duplicated.

**A plan is editable all the way through treatment** — add, reprice, drop, at any
point, including after the patient agreed and after part of it has been billed.
There is no status machine to get stuck behind.

**The only thing that freezes is a line on an invoice.** The lock is
`patient_records.invoice_id`, not any document's status: once work is billed its
price belongs to that invoice. `repriceRecord` refuses it, the billing claim
refuses to re-bill it, and `patient_records_billed_once` is the backstop. A billed
line stays **visible** in the plan at the price the invoice froze, so the plan
total covers the whole course of treatment rather than only what is left.

### Rules worth keeping in mind

- `PLAN_RECORD_TYPES` (`plan-record-types.ts`) is the single definition of what
  counts as plan work: `treatment_plan` and `treatment`. A `missing_tooth` is a
  finding, not work; clinical notes are never priced. Neither can inflate an
  estimate.
- A line with no price is reported as `totals.unpriced_count` and rendered "not
  priced" — **never summed as 0**. A never-priced row must not quietly shrink a
  plan total.
- The chart carries its own plan (`GET /patient-work/chart/:patientId` returns
  `plan`), so the teeth and the estimate are computed from the same rows and
  cannot disagree.

### What a patient was handed

`quote_sends` is append-only: `SELECT, INSERT` for `dental_app`, deliberately **no
UPDATE or DELETE**. A dispute record that can be edited afterwards is not a
record. Each "Give to patient" stores the total and the lines as they stood. The
doctor never manages versions; it only surfaces if somebody says "you told me
1,400" after the plan has moved on.

Its price columns are named `quoted_total` / `quoted_lines` on purpose — see
**Bugs found** below.

### The statement

`GET /billing/patients/:patientId/statement` composes the plan and the ledger,
with no storage of its own. It keeps four figures apart, because collapsing them
misleads somebody:

```
  Plan total      the whole course of treatment
  Billed          what was actually invoiced
  Received        money in, net of refunds
  Credit held     received but not applied

  DUE NOW             bills issued and unpaid  — what the desk chases
  Remaining on plan   work not yet billed      — what the patient still faces
```

### Billing reads one flat list

`GET /billing/patients/:patientId/billable` returns `plan_unbilled`: every plan
row with no `invoice_id`, each tagged `planned` or `done`. Both are billable —
paying for a crown before it is cut is ordinary — and the chart's price is the
price, because there is no second store to reconcile.

`treatment_invoices.quote_id` and the `one_live_per_quote` index went with it.
That index was the precise reason a plan billed visit by visit had to leave the
link empty; the per-record guard is strictly stronger and strictly simpler.

---

## Migrations

Applied in this order. Each was rehearsed first with `COMMIT` swapped for
`ROLLBACK`, and each carries a guard that fails the whole migration rather than
losing data quietly.

| Migration | What it does |
|---|---|
| `20261018090000_refund_scope` | Adds `refund_scope`, backfills it, adds a CHECK. Refuses to finish if any refund row is left unclassified. |
| `20261018110000_quote_sends` | The append-only send log, with RLS, tenant policy, app grants and the `agent_permission` policy. |
| `20261018111000_quote_sends_agent_view` | The `agent.quote_sends` view that gates its price columns behind `pricing:read`. |
| `20261018120000_plan_is_the_quote_data` | **The dangerous one.** Rescues, then collapses. |
| `20261018130000_plan_is_the_quote_drop` | Drops `quote_items`, the status machine, the quote→invoice link; adds `quotes_one_per_patient`. |

### The data migration's order is load-bearing

Each step depends on the one before, and the collapse must come last:

1. **Free-text lines** (`record_id IS NULL`) become chart rows — they exist
   nowhere else, so dropping the table without this deletes priced work and
   raises nothing. A line already billed keeps its invoice, so it stays locked;
   a completed line lands as done, not planned.
2. **The agreed price** is written onto its chart row, which becomes the single
   owner of a price. Billed rows are left alone.
3. **Progress** recorded on a line is written onto its chart row.
4. **Billed links** are repaired — a line billed while its chart row was not is
   what a void used to leave behind. *Miss this and that work becomes billable a
   second time, which looks completely normal on screen.*
5. **Only then**, collapse each patient's several quotes into one, keeping the
   oldest so the patient keeps the number they were first given.

Guards: the plan total and row count may only grow; no patient may be left with
more than one plan.

### Audit before, result after

| | before | after |
|---|---|---|
| quotes | 113 over 52 patients | 58, **0 patients with more than one** |
| free-text lines at risk | **56, all on live quotes** | all rescued |
| price mismatches | 0 | — |
| void debris | 0 | — |
| progress disagreements | 0 | — |
| plan rows / total | 213 / 40,175.11 | 269 / 41,485.11 (rehearsal predicted exactly this) |
| `quote_items` | present | dropped |

---

## Bugs found and fixed along the way

**1. The send log's column name made the assistant redact unrelated data.**
`hidePricingFields` hides price fields **by column name across every tool
result**. Naming the column `total` made the assistant blank an unrelated row
count. Caught by `tool-runner.spec.ts`. The table was empty, so it was dropped
and recreated as `quoted_total` / `quoted_lines` — which is exactly why the
codebase names price columns `quoted_*`, as `CLAUDE.md` already warned.

**2. The comments migration was no longer re-runnable.** It commented
`invoice_payments.invoice_id`, a column the ledger migration dropped, so
re-applying it would have failed. Corrected and re-applied; the assistant reads
those comments at startup.

**3. `invoiceInclude` still selected the dropped `quote` relation.** TypeScript
could not catch it — an untyped object literal — so every invoice create returned
500 until the smoke found it.

**4. The chart's Price column hid the price.** It tested `billed` *before*
status, so a billed row rendered the word "Billed" in a money column and the
agreed figure vanished. It now shows the frozen amount with a lock and a tooltip
naming the invoice.

**5. The Complete button had no `!billed` guard** while Delete did — so a
prepaid-planned row offered Complete but no Delete.

**6. The first drop-migration guard asked the wrong question.** "Are there
free-text lines left?" — but the rescue copies lines onto the chart without
deleting the originals, so 37 legitimately remained and it refused to run.
Rewritten to ask whether every free-text line is *also* on the chart, matched on
patient, procedure, tooth and price. Answer: 37 of 37.

---

## What was deleted

| | |
|---|---|
| Tables | `quote_items` |
| Columns | `quotes.status`, `.version`, `.supersedes_id`, `.valid_until`, `.sent_at`, `.declined_at`, `.quoted_total`, `.quoted_discount`; `treatment_invoices.quote_id` |
| Functions | `app.sync_quote_progress`, `…_trigger`, `app.refuse_rebilling_quote_item`, `app.sync_quote_total` |
| Triggers | `quote_items_sync_progress`, `quote_items_billed_once`, `quote_items_sync_total`, `quotes_sync_total_on_discount`, `quotes_sync_progress` |
| Indexes | `treatment_invoices_one_live_per_quote`, `idx_treatment_invoices_quote`, `idx_quotes_status` |
| Views | `agent.quote_items`, `agent.quotes` |
| Services | `plan-quote.service.ts`, `quote-progress.service.ts`, `quotes.service.ts` (+ specs) |
| Methods | `writeTotals`, `netPaid`, two `lockInvoice`s, `settleOpenInvoices`, `lockPayment`, `unapplied`, `creditBalance`, `wholeQuoteBilledBy` |
| Components | `TreatmentPlanPanel.tsx` |
| Routes | 9, including `POST /quotes`, `PATCH /quotes/:id`, `/decline`, `/revise`, `/invoice`, `/bill-completed`, `PATCH /quotes/items/:itemId/status` |

Three invoice creation paths became one. Two money writers became one.

Two historical migrations (`20261014200000`, `20261014200100`) were amended:
they named `quote_items` / `quotes` as price-gated, and the agent specs read that
text as the current contract. Neither was re-runnable any more, so they now say
so.

---

## Verification

Both apps: `npx tsc --noEmit` clean · 406 unit tests across 41 suites · frontend
production build passes.

Against the live database:

| | |
|---|---|
| `npm run smoke:plan-quote` | **23/23** |
| `npm run smoke:billing` | **64/64** |
| `npm run smoke:permissions` | **160/160** |
| `npm run smoke:concurrency` | **5/5** at `ROUNDS=2` |

The decisive one was running `smoke:billing` *after* deleting `writeTotals` —
that is what proves the trigger genuinely maintains the totals and nothing was
silently frozen.

> **`smoke:concurrency` at its default `ROUNDS=40` wedges the backend, and it is
> not a regression.** It builds one caller per organization, and the dev database
> has 40 active ones (leftover throwaway clinics), so the burst is
> 41 × 2 × 40 = **3,280 simultaneous fetches**; the baseline phase alone is 82
> sequential requests. At `ROUNDS=2` every check passes, including "every request
> saw its own organization", so tenant isolation is intact. Either run it with
> `ROUNDS=2..5`, or prune the leftover organizations.

### The smoke that encodes the point

`smoke:plan-quote` asserts the behaviour that was impossible before. Its previous
version asserted the *opposite* ("planning more work leaves the accepted plan
exactly as agreed", "the new work starts a fresh draft of its own"):

```
work can be added after the patient agreed                  PASS
the SAME plan grew; no second plan appeared                 PASS  3 lines, total 620
the billed line stays in the plan, locked, with its price   PASS  state billed, $250
a billed line cannot be repriced                            PASS  400
an unbilled line can still be repriced mid-treatment        PASS  200
and the plan total moves with it                            PASS  total 670
two sendings, two different totals kept                     PASS  690 / 500
a missing tooth is a finding, not plan work                 PASS
a line nobody priced is counted, not treated as zero        PASS
the statement separates Due now from Remaining on plan      PASS  due 250, remaining 440
```

---

## Still open

From `BILLING_BACKLOG.md`, in rough order of value:

- **Fee schedule** (item 1) — the last place a price is retyped. `PROCEDURES` is
  still hard-coded in three files with no default prices, so staff key the same
  crown price every time.
- **Per-payment receipt slip** — a patient paying one instalment wants a slip for
  that instalment. Only per-invoice receipts exist.
- **Refund / void / delete still live on the billing page**, not in the chart's
  money band.
- **Credit memo** (item 9) — reduce a bill after issue without voiding a correct
  invoice.
- **Clinic timezone per organization** (item 3), **multi-currency** (item 6),
  **payment terms and the daily close** (item 10).

### Operational notes

- The money changes still want an **independent adversarial security review**
  before they are considered finished, per the project's standing rule.
- The clinic backend may be running from `dist` directly (`node dist/src/main`)
  rather than under `nest start --watch`; kill whatever holds :5000 before
  restarting `npm run dev`.
