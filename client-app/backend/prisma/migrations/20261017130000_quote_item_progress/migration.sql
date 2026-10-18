-- A treatment plan is worked through, not billed in one go.
--
-- An accepted quote is a plan of several procedures that may run over months.
-- Until now a quote item had no state of its own: the chart flipped a record
-- from `treatment_plan` to `treatment` and that was the whole vocabulary, so
-- "started but not finished" could not be said, and the only ways to bill were
-- the whole quote up front or treatment by treatment off the chart.
--
-- After this migration a quote item carries its own progress:
--
--   planned -> in_progress -> completed        (or cancelled, at any point)
--
-- and an accepted quote follows its items: `in_progress` once any item has
-- started, `completed` once every item that was not cancelled is completed.
-- A completed item that carries no invoice yet is what the desk bills next.
--
-- Nothing here changes how money works. `quote_items.invoice_id` only records
-- which bill picked a line up, so the same line cannot be billed twice; the
-- amounts still live on the invoice.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261017130000_quote_item_progress/migration.sql

BEGIN;

-- ── 1. Progress on each line of the plan ───────────────────────────────────

ALTER TABLE quote_items
    ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'planned',
    ADD COLUMN IF NOT EXISTS started_at   TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS invoice_id   BIGINT;

ALTER TABLE quote_items DROP CONSTRAINT IF EXISTS quote_items_status_valid;
ALTER TABLE quote_items
    ADD CONSTRAINT quote_items_status_valid
    CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled'));

-- The stamps and the status say the same thing, or the row is lying.
ALTER TABLE quote_items DROP CONSTRAINT IF EXISTS quote_items_progress_complete;
ALTER TABLE quote_items
    ADD CONSTRAINT quote_items_progress_complete
    CHECK (
        (status = 'completed') = (completed_at IS NOT NULL)
        AND (status IN ('in_progress', 'completed')) <= (started_at IS NOT NULL)
    );

-- Only completed work can be on a bill.
ALTER TABLE quote_items DROP CONSTRAINT IF EXISTS quote_items_billed_when_completed;
ALTER TABLE quote_items
    ADD CONSTRAINT quote_items_billed_when_completed
    CHECK (invoice_id IS NULL OR status = 'completed');

ALTER TABLE quote_items DROP CONSTRAINT IF EXISTS quote_items_invoice_id_fkey;
ALTER TABLE quote_items
    ADD CONSTRAINT quote_items_invoice_id_fkey FOREIGN KEY (invoice_id)
        REFERENCES treatment_invoices(id) ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_quote_items_status  ON quote_items(status);
CREATE INDEX IF NOT EXISTS idx_quote_items_invoice ON quote_items(invoice_id);

-- Existing plans: a line whose chart record is already completed work counts
-- as completed, and one already on an invoice keeps that link.
UPDATE quote_items qi
   SET status       = 'completed',
       started_at   = COALESCE(qi.started_at, r.created_at),
       completed_at = COALESCE(qi.completed_at, r.updated_at),
       invoice_id   = r.invoice_id
  FROM patient_records r
 WHERE r.id = qi.record_id
   AND r.record_type = 'treatment'
   AND qi.status = 'planned';

-- ── 2. A quote item is billed once, enforced like a chart record ───────────

CREATE OR REPLACE FUNCTION app.refuse_rebilling_quote_item() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    IF OLD.invoice_id IS NOT NULL
       AND NEW.invoice_id IS NOT NULL
       AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
        RAISE EXCEPTION 'quote item % is already billed on invoice %; cancel that invoice before billing it again',
            OLD.id, OLD.invoice_id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'quote_items_billed_once';
    END IF;
    RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS quote_items_billed_once ON quote_items;
CREATE TRIGGER quote_items_billed_once
    BEFORE UPDATE OF invoice_id ON quote_items
    FOR EACH ROW EXECUTE FUNCTION app.refuse_rebilling_quote_item();

-- ── 3. An accepted quote follows its items ─────────────────────────────────

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_valid;
ALTER TABLE quotes
    ADD CONSTRAINT quotes_status_valid
    CHECK (status IN ('draft', 'sent', 'accepted', 'in_progress', 'completed',
                      'declined', 'expired'));

-- Only a quote the patient agreed to has work under way, so draft, sent,
-- declined and expired quotes are never moved by this.
CREATE OR REPLACE FUNCTION app.sync_quote_progress(target BIGINT) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
    live      INTEGER;
    started   INTEGER;
    completed INTEGER;
    current   TEXT;
BEGIN
    IF target IS NULL THEN RETURN; END IF;
    SELECT status INTO current FROM quotes WHERE id = target;
    IF current NOT IN ('accepted', 'in_progress', 'completed') THEN RETURN; END IF;

    SELECT count(*) FILTER (WHERE status <> 'cancelled'),
           count(*) FILTER (WHERE status IN ('in_progress', 'completed')),
           count(*) FILTER (WHERE status = 'completed')
      INTO live, started, completed
      FROM quote_items WHERE quote_id = target;

    UPDATE quotes
       SET status = CASE WHEN live = 0            THEN 'accepted'
                         WHEN completed = live    THEN 'completed'
                         WHEN started > 0         THEN 'in_progress'
                         ELSE 'accepted' END,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = target;
END $fn$;

CREATE OR REPLACE FUNCTION app.sync_quote_progress_trigger() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM app.sync_quote_progress(COALESCE(NEW.quote_id, OLD.quote_id));
    IF TG_OP = 'UPDATE' AND NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
        PERFORM app.sync_quote_progress(OLD.quote_id);
    END IF;
    RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS quote_items_sync_progress ON quote_items;
CREATE TRIGGER quote_items_sync_progress
    AFTER INSERT OR UPDATE OF status, quote_id OR DELETE ON quote_items
    FOR EACH ROW EXECUTE FUNCTION app.sync_quote_progress_trigger();

-- Bring every accepted quote in line with the items backfilled above.
DO $backfill$
DECLARE
    q BIGINT;
BEGIN
    FOR q IN SELECT id FROM quotes WHERE status IN ('accepted', 'in_progress', 'completed') LOOP
        PERFORM app.sync_quote_progress(q);
    END LOOP;
END $backfill$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_agent;

-- ── 4. What the columns mean ───────────────────────────────────────────────

COMMENT ON COLUMN quote_items.status IS 'Progress of this planned procedure: planned | in_progress | completed | cancelled. A completed item with no invoice_id is what the billing page offers to bill next.';
COMMENT ON COLUMN quote_items.started_at IS 'When the procedure was started (set on in_progress, kept through completion).';
COMMENT ON COLUMN quote_items.completed_at IS 'When the procedure was finished; set together with status = completed.';
COMMENT ON COLUMN quote_items.invoice_id IS 'The invoice this line was billed on, if any. Set once: a billed line can only be released (NULL, what a void does) and then billed again, never moved to another invoice.';
COMMENT ON COLUMN quotes.status IS 'draft -> sent -> accepted -> in_progress -> completed, or declined | expired. The last three of the first chain follow the quote items (trigger app.sync_quote_progress); a quote is never moved into them from draft, sent, declined or expired.';

COMMIT;
