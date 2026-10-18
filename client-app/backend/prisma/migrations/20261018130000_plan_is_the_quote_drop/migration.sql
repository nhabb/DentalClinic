-- "The plan is the quote", step 2 of 2: remove the duplicate.
--
-- Everything worth keeping was moved onto the chart by 20261018120000, which
-- must have been applied first. What goes here is the second copy of the plan
-- and all the machinery that existed to keep the two in step:
--
--   * quote_items — a second list of the same procedures, with its own price,
--     its own progress and its own invoice link. Progress now lives only on
--     patient_records.record_type, and the price only on quoted_amount.
--   * the quote status machine — draft/sent/accepted were a proposal's states,
--     and in_progress/completed were set by a trigger off quote_items.status.
--     A living plan has no states: it has lines, and each line has one.
--   * version / supersedes_id — a plan is edited, not superseded. What a
--     patient was handed is in quote_sends, which cannot be edited at all.
--   * treatment_invoices.quote_id and its one-live-invoice index — with one
--     plan per patient the link is derivable from patient_id, and that index
--     is the exact reason a plan billed visit by visit had to leave the link
--     empty. patient_records_billed_once is per record: strictly stronger.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261018130000_plan_is_the_quote_drop/migration.sql

BEGIN;

-- Refuse to run if step 1 did not. A free-text line (record_id IS NULL) exists
-- nowhere else, so dropping the table while one is unrescued deletes priced
-- work and raises nothing. Step 1 copies such lines onto the chart but leaves
-- the originals in place, so the question is not "are there free-text lines"
-- but "is every one of them also on the chart" — matched on what identifies
-- the work: same patient, procedure, tooth and price.
DO $$
DECLARE stranded bigint;
BEGIN
  IF to_regclass('public.quote_items') IS NULL THEN
    RAISE NOTICE 'quote_items already dropped; nothing to do';
    RETURN;
  END IF;
  SELECT count(*) INTO stranded
    FROM quote_items qi
    JOIN quotes q ON q.id = qi.quote_id
   WHERE qi.record_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM patient_records r
        WHERE r.patient_id = q.patient_id
          AND r.record_type IN ('treatment_plan', 'treatment')
          AND r.title = qi.procedure_name
          AND r.quoted_amount IS NOT DISTINCT FROM qi.quoted_amount
          AND r.tooth_number IS NOT DISTINCT FROM qi.tooth_number);
  IF stranded > 0 THEN
    RAISE EXCEPTION
      'quote_items holds % free-text lines that are not on the chart: apply 20261018120000 first', stranded;
  END IF;
  RAISE NOTICE 'every free-text line is on the chart; safe to drop';
END $$;

-- The triggers and functions that kept the two copies in step.
DROP TRIGGER IF EXISTS quote_items_sync_progress ON quote_items;
DROP TRIGGER IF EXISTS quote_items_billed_once ON quote_items;
DROP TRIGGER IF EXISTS quote_items_total ON quote_items;
DROP TRIGGER IF EXISTS quote_items_sync_total ON quote_items;
DROP TRIGGER IF EXISTS quotes_sync_progress ON quote_items;
-- Kept the quoted_total column in step with the lines and the discount; both
-- columns are going, so the trigger goes first. The numbering trigger on
-- quotes stays: quote_number is still how a patient names their plan.
DROP TRIGGER IF EXISTS quotes_sync_total_on_discount ON quotes;
DROP FUNCTION IF EXISTS app.sync_quote_progress_trigger() CASCADE;
DROP FUNCTION IF EXISTS app.sync_quote_progress(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS app.refuse_rebilling_quote_item() CASCADE;
DROP FUNCTION IF EXISTS app.sync_quote_total() CASCADE;

-- A view cannot outlive its columns, and CREATE OR REPLACE cannot drop one.
DROP VIEW IF EXISTS agent.quote_items;
DROP VIEW IF EXISTS agent.quotes;

DROP TABLE IF EXISTS public.quote_items;

-- The quote-to-invoice link and the index that made partial billing impossible.
DROP INDEX IF EXISTS treatment_invoices_one_live_per_quote;
DROP INDEX IF EXISTS idx_treatment_invoices_quote;
ALTER TABLE treatment_invoices DROP COLUMN IF EXISTS quote_id;

-- The quote header becomes just that: a header.
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_valid;
DROP INDEX IF EXISTS idx_quotes_status;
ALTER TABLE quotes
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS supersedes_id,
  DROP COLUMN IF EXISTS valid_until,
  DROP COLUMN IF EXISTS sent_at,
  DROP COLUMN IF EXISTS declined_at,
  DROP COLUMN IF EXISTS quoted_total,
  DROP COLUMN IF EXISTS quoted_discount;

-- One plan per patient, enforced rather than hoped for. Step 1 collapsed the
-- duplicates; this makes a second one impossible.
DROP INDEX IF EXISTS quotes_one_per_patient;
CREATE UNIQUE INDEX quotes_one_per_patient ON quotes(patient_id);

-- quotes has no price column left, so the assistant reads the table directly.
GRANT SELECT ON public.quotes TO dental_agent;
REVOKE SELECT ON public.quotes FROM dental_agent_views;
DROP POLICY IF EXISTS agent_views_permission ON public.quotes;

COMMENT ON TABLE quotes IS 'One per patient: the header of their living treatment plan — its number, notes and the day they agreed. The plan itself is their patient_records; totals are summed from those. What a patient was actually handed is in quote_sends.';
COMMENT ON COLUMN quotes.quote_number IS 'Sequential per clinic and year (QUO-2026-00004); assigned by a database trigger on insert.';
COMMENT ON COLUMN quotes.accepted_at IS 'The day the patient agreed to the plan. A fact, not a gate: the plan stays editable, because treatment changes.';

COMMIT;
