-- "The plan is the quote", step 1 of 2: move everything worth keeping out of
-- quote_items and onto the chart, before step 2 drops the table.
--
-- Nothing here is destructive except the last step, which collapses each
-- patient's several quotes into one plan header. Every rescue runs BEFORE that,
-- in this order, because each one depends on the previous:
--
--   1. free-text lines (record_id IS NULL) become chart rows, or they vanish
--      with the table and no error is raised
--   2. the agreed price is written onto its chart row, which becomes the single
--      owner of a price
--   3. progress recorded on a line is written onto its chart row
--   4. a line billed while its chart row was not gets its invoice link copied
--      across — miss this and that work becomes billable a second time, which
--      looks completely normal on the screen
--   5. only then, the collapse
--
-- Audited before writing (2026-10-17): 113 quotes over 52 patients, 56
-- free-text lines all on live quotes, 0 price mismatches, 0 void debris,
-- 0 progress disagreements.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261018120000_plan_is_the_quote_data/migration.sql

BEGIN;

-- Quotes that still mean something. A declined or expired quote is history:
-- its lines are not work anybody intends to do, so they are not rescued.
CREATE TEMP TABLE live_quotes ON COMMIT DROP AS
SELECT id, patient_id, branch_id, organization_id
  FROM quotes
 WHERE status IN ('draft', 'sent', 'accepted', 'in_progress', 'completed');

DO $$
DECLARE
  before_plan   numeric;
  before_rows   bigint;
  rescued       bigint;
  repriced      bigint;
  progressed    bigint;
  relinked      bigint;
  collapsed     bigint;
  after_plan    numeric;
  after_rows    bigint;
  left_behind   bigint;
BEGIN
  SELECT COALESCE(sum(quoted_amount), 0), count(*) INTO before_plan, before_rows
    FROM patient_records WHERE record_type IN ('treatment_plan', 'treatment');

  -- 1. Free-text lines become chart rows of their own.
  --    A line that was already billed keeps its invoice, so it stays locked
  --    and cannot be billed again; a completed line lands as done, not planned.
  WITH moved AS (
    INSERT INTO patient_records
      (organization_id, branch_id, patient_id, record_type, title, description,
       tooth_number, treatment_date, quoted_amount, invoice_id, created_at, updated_at)
    SELECT qi.organization_id,
           q.branch_id,
           q.patient_id,
           CASE WHEN qi.status = 'completed' THEN 'treatment' ELSE 'treatment_plan' END,
           qi.procedure_name,
           COALESCE(NULLIF(qi.description, ''), qi.procedure_name),
           qi.tooth_number,
           qi.completed_at::date,
           qi.quoted_amount,
           CASE WHEN i.id IS NOT NULL AND i.status <> 'cancelled' THEN qi.invoice_id END,
           qi.created_at,
           CURRENT_TIMESTAMP
      FROM quote_items qi
      JOIN live_quotes q ON q.id = qi.quote_id
      LEFT JOIN treatment_invoices i ON i.id = qi.invoice_id
     WHERE qi.record_id IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO rescued FROM moved;

  -- 2. The agreed price onto its chart row. Billed rows are left alone: their
  --    price belongs to the invoice now.
  WITH priced AS (
    UPDATE patient_records r
       SET quoted_amount = qi.quoted_amount, updated_at = CURRENT_TIMESTAMP
      FROM quote_items qi
      JOIN live_quotes q ON q.id = qi.quote_id
     WHERE qi.record_id = r.id
       AND r.invoice_id IS NULL
       AND qi.quoted_amount IS NOT NULL
       AND r.quoted_amount IS DISTINCT FROM qi.quoted_amount
    RETURNING 1
  )
  SELECT count(*) INTO repriced FROM priced;

  -- 3. Progress recorded on the line but not on the chart row.
  WITH done AS (
    UPDATE patient_records r
       SET record_type = 'treatment', updated_at = CURRENT_TIMESTAMP
      FROM quote_items qi
     WHERE qi.record_id = r.id
       AND qi.status = 'completed'
       AND r.record_type = 'treatment_plan'
    RETURNING 1
  )
  SELECT count(*) INTO progressed FROM done;

  -- 4. A billed line whose chart row was never linked (what a void used to
  --    leave behind, because it released the record but not the line).
  WITH linked AS (
    UPDATE patient_records r
       SET invoice_id = qi.invoice_id, updated_at = CURRENT_TIMESTAMP
      FROM quote_items qi
      JOIN treatment_invoices i ON i.id = qi.invoice_id
     WHERE qi.record_id = r.id
       AND r.invoice_id IS NULL
       AND i.status <> 'cancelled'
    RETURNING 1
  )
  SELECT count(*) INTO relinked FROM linked;

  -- 5. One plan per patient. The oldest row is kept so the patient keeps the
  --    number they were first given; everything worth keeping is already off
  --    the rows being removed.
  WITH dropped AS (
    DELETE FROM quotes q
     WHERE EXISTS (SELECT 1 FROM quotes k
                    WHERE k.patient_id = q.patient_id
                      AND k.organization_id = q.organization_id
                      AND (k.created_at, k.id) < (q.created_at, q.id))
    RETURNING 1
  )
  SELECT count(*) INTO collapsed FROM dropped;

  SELECT COALESCE(sum(quoted_amount), 0), count(*) INTO after_plan, after_rows
    FROM patient_records WHERE record_type IN ('treatment_plan', 'treatment');

  SELECT count(*) INTO left_behind
    FROM quotes q
   WHERE EXISTS (SELECT 1 FROM quotes k
                  WHERE k.patient_id = q.patient_id
                    AND k.organization_id = q.organization_id
                    AND k.id <> q.id);

  RAISE NOTICE 'rescued free-text lines : %', rescued;
  RAISE NOTICE 'prices written to chart : %', repriced;
  RAISE NOTICE 'progress written to chart: %', progressed;
  RAISE NOTICE 'billed links repaired   : %', relinked;
  RAISE NOTICE 'duplicate quotes removed: %', collapsed;
  RAISE NOTICE 'plan rows: % -> %   plan total: % -> %',
    before_rows, after_rows, before_plan, after_plan;

  -- The plan may only grow here: every step either adds a rescued row or
  -- writes a figure onto one. A fall means something was lost.
  IF after_plan < before_plan THEN
    RAISE EXCEPTION 'plan total fell from % to %: priced work was lost', before_plan, after_plan;
  END IF;
  IF after_rows < before_rows THEN
    RAISE EXCEPTION 'plan rows fell from % to %', before_rows, after_rows;
  END IF;
  IF left_behind > 0 THEN
    RAISE EXCEPTION 'collapse left % patients with more than one plan', left_behind;
  END IF;
END $$;

COMMIT;
