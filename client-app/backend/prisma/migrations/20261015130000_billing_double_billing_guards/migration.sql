-- Two guards the database keeps so no code path can bill the same work twice:
--
--   * one live invoice per quote: a second invoice for a quote is refused
--     unless the first one was cancelled (partial unique index);
--   * a chart record that is already on an invoice cannot be moved to another
--     one; it can only be released (invoice_id -> NULL, what a void does) and
--     then attached again. Two desks completing or issuing at the same second
--     now collide on the row instead of both succeeding.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261015130000_billing_double_billing_guards/migration.sql

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS treatment_invoices_one_live_per_quote
    ON treatment_invoices (quote_id)
    WHERE quote_id IS NOT NULL AND status <> 'cancelled';

CREATE OR REPLACE FUNCTION app.refuse_rebilling_record() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.invoice_id IS NOT NULL
       AND NEW.invoice_id IS NOT NULL
       AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
        RAISE EXCEPTION 'record % is already billed on invoice %; cancel that invoice before billing it again',
            OLD.id, OLD.invoice_id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'patient_records_billed_once';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS patient_records_billed_once ON patient_records;
CREATE TRIGGER patient_records_billed_once
    BEFORE UPDATE OF invoice_id ON patient_records
    FOR EACH ROW EXECUTE FUNCTION app.refuse_rebilling_record();

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_app;

COMMENT ON COLUMN patient_records.invoice_id IS 'The invoice this work is billed on, if any. Set once; a billed record can only be released (NULL, by a void) and then billed again, never moved to another invoice.';

COMMIT;
