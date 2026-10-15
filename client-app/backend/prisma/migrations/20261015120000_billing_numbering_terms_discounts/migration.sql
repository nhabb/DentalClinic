-- Billing the way a business bills: numbered documents, payment terms,
-- discounts and payment dates.
--
--   * every invoice and quote gets a sequential, gapless, per-clinic number
--     (INV-2026-00017, QUO-2026-00004), assigned by the database on insert, so
--     every code path (billing page, dental chart, quote conversion) numbers
--     the same way and two desks can never take the same number;
--   * an invoice carries a due_date (payment terms); outstanding balances age
--     from the due date, not from the day the row was created;
--   * an invoice is subtotal (its lines) minus a discount (with a reason) =
--     total_amount, the amount owed; the money rules (paid within total,
--     remaining = total - paid) are untouched because they use total_amount;
--   * a quote may carry a discount too (quoted_discount, gated like its other
--     prices); quoted_total = lines - discount;
--   * a payment or refund records the day the money moved (payment_date), so
--     yesterday's cash entered this morning lands on the right day in reports.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261015120000_billing_numbering_terms_discounts/migration.sql

BEGIN;

-- ── 1. Document numbers: one counter per clinic, kind and year ─────────────

CREATE TABLE IF NOT EXISTS document_sequences (
    organization_id BIGINT  NOT NULL,
    kind            TEXT    NOT NULL,
    year            INTEGER NOT NULL,
    last_value      INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT document_sequences_pkey PRIMARY KEY (organization_id, kind, year),
    CONSTRAINT document_sequences_kind_valid CHECK (kind IN ('invoice', 'quote')),
    CONSTRAINT document_sequences_organization_id_fkey FOREIGN KEY (organization_id)
        REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE NO ACTION
);

ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON document_sequences;
CREATE POLICY tenant_isolation ON document_sequences FOR ALL
    USING (app.is_system() OR organization_id = app.current_org_id())
    WITH CHECK (app.is_system() OR organization_id = app.current_org_id());
GRANT SELECT, INSERT, UPDATE ON document_sequences TO dental_app;

-- The next number for a clinic. The upsert locks the counter row until the
-- caller's transaction ends, so concurrent inserts queue up and a rolled-back
-- insert gives its number back: the sequence has no gaps.
CREATE OR REPLACE FUNCTION app.next_document_number(
    p_org BIGINT, p_kind TEXT, p_prefix TEXT, p_on DATE
) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
    y INTEGER := EXTRACT(YEAR FROM p_on)::INTEGER;
    n INTEGER;
BEGIN
    INSERT INTO document_sequences (organization_id, kind, year, last_value)
    VALUES (p_org, p_kind, y, 1)
    ON CONFLICT (organization_id, kind, year)
    DO UPDATE SET last_value = document_sequences.last_value + 1
    RETURNING last_value INTO n;
    RETURN format('%s-%s-%s', p_prefix, y, lpad(n::TEXT, 5, '0'));
END $$;

-- ── 2. Invoices: number, due date, subtotal and discount ───────────────────

ALTER TABLE treatment_invoices
    ADD COLUMN IF NOT EXISTS invoice_number  TEXT,
    ADD COLUMN IF NOT EXISTS due_date        DATE,
    ADD COLUMN IF NOT EXISTS subtotal        NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_reason TEXT;

-- Existing invoices: no discount, due on the day of the work, numbered in the
-- order they were issued within each clinic and year.
UPDATE treatment_invoices SET subtotal = total_amount WHERE subtotal IS NULL;
UPDATE treatment_invoices SET due_date = procedure_date WHERE due_date IS NULL;

WITH numbered AS (
    SELECT id,
           EXTRACT(YEAR FROM created_at)::INTEGER AS y,
           row_number() OVER (
               PARTITION BY organization_id, EXTRACT(YEAR FROM created_at)
               ORDER BY created_at, id
           ) AS n
      FROM treatment_invoices
     WHERE invoice_number IS NULL
)
UPDATE treatment_invoices t
   SET invoice_number = format('INV-%s-%s', numbered.y, lpad(numbered.n::TEXT, 5, '0'))
  FROM numbered
 WHERE t.id = numbered.id;

INSERT INTO document_sequences (organization_id, kind, year, last_value)
SELECT organization_id, 'invoice', EXTRACT(YEAR FROM created_at)::INTEGER, count(*)
  FROM treatment_invoices
 GROUP BY organization_id, EXTRACT(YEAR FROM created_at)
ON CONFLICT (organization_id, kind, year)
DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

ALTER TABLE treatment_invoices
    ALTER COLUMN invoice_number SET NOT NULL,
    ALTER COLUMN due_date       SET NOT NULL,
    ALTER COLUMN subtotal       SET NOT NULL;

ALTER TABLE treatment_invoices DROP CONSTRAINT IF EXISTS treatment_invoices_number_unique;
ALTER TABLE treatment_invoices
    ADD CONSTRAINT treatment_invoices_number_unique UNIQUE (organization_id, invoice_number);

-- What is owed is the lines minus the discount; a discount always says why.
ALTER TABLE treatment_invoices DROP CONSTRAINT IF EXISTS treatment_invoices_discount_within_subtotal;
ALTER TABLE treatment_invoices
    ADD CONSTRAINT treatment_invoices_discount_within_subtotal
    CHECK (subtotal >= 0 AND discount_amount >= 0 AND discount_amount <= subtotal
           AND total_amount = subtotal - discount_amount);

ALTER TABLE treatment_invoices DROP CONSTRAINT IF EXISTS treatment_invoices_discount_has_reason;
ALTER TABLE treatment_invoices
    ADD CONSTRAINT treatment_invoices_discount_has_reason
    CHECK (discount_amount = 0 OR (discount_reason IS NOT NULL AND length(btrim(discount_reason)) > 0));

ALTER TABLE treatment_invoices DROP CONSTRAINT IF EXISTS treatment_invoices_due_on_or_after_work;
ALTER TABLE treatment_invoices
    ADD CONSTRAINT treatment_invoices_due_on_or_after_work CHECK (due_date >= procedure_date);

CREATE OR REPLACE FUNCTION app.assign_invoice_number() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
        NEW.invoice_number := app.next_document_number(NEW.organization_id, 'invoice', 'INV', CURRENT_DATE);
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS treatment_invoices_assign_number ON treatment_invoices;
CREATE TRIGGER treatment_invoices_assign_number
    BEFORE INSERT ON treatment_invoices
    FOR EACH ROW EXECUTE FUNCTION app.assign_invoice_number();

-- ── 3. Payments: the day the money moved ───────────────────────────────────

ALTER TABLE invoice_payments
    ADD COLUMN IF NOT EXISTS payment_date DATE NOT NULL DEFAULT CURRENT_DATE;
-- Rows that existed before this column: the day they were recorded (clinic time).
UPDATE invoice_payments
   SET payment_date = (created_at AT TIME ZONE 'Asia/Beirut')::DATE
 WHERE payment_date = CURRENT_DATE AND created_at < CURRENT_DATE::TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_invoice_payments_payment_date ON invoice_payments(payment_date);

-- ── 4. Quotes: number and discount ─────────────────────────────────────────

ALTER TABLE quotes
    ADD COLUMN IF NOT EXISTS quote_number    TEXT,
    ADD COLUMN IF NOT EXISTS quoted_discount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_discount_not_negative;
ALTER TABLE quotes ADD CONSTRAINT quotes_discount_not_negative CHECK (quoted_discount >= 0);

WITH numbered AS (
    SELECT id,
           EXTRACT(YEAR FROM created_at)::INTEGER AS y,
           row_number() OVER (
               PARTITION BY organization_id, EXTRACT(YEAR FROM created_at)
               ORDER BY created_at, id
           ) AS n
      FROM quotes
     WHERE quote_number IS NULL
)
UPDATE quotes q
   SET quote_number = format('QUO-%s-%s', numbered.y, lpad(numbered.n::TEXT, 5, '0'))
  FROM numbered
 WHERE q.id = numbered.id;

INSERT INTO document_sequences (organization_id, kind, year, last_value)
SELECT organization_id, 'quote', EXTRACT(YEAR FROM created_at)::INTEGER, count(*)
  FROM quotes
 GROUP BY organization_id, EXTRACT(YEAR FROM created_at)
ON CONFLICT (organization_id, kind, year)
DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

ALTER TABLE quotes ALTER COLUMN quote_number SET NOT NULL;
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_number_unique;
ALTER TABLE quotes ADD CONSTRAINT quotes_number_unique UNIQUE (organization_id, quote_number);

CREATE OR REPLACE FUNCTION app.assign_quote_number() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
        NEW.quote_number := app.next_document_number(NEW.organization_id, 'quote', 'QUO', CURRENT_DATE);
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS quotes_assign_number ON quotes;
CREATE TRIGGER quotes_assign_number
    BEFORE INSERT ON quotes
    FOR EACH ROW EXECUTE FUNCTION app.assign_quote_number();

-- The quote total is its lines minus its discount, kept by the database.
CREATE OR REPLACE FUNCTION app.sync_quote_total() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target BIGINT := COALESCE(NEW.quote_id, OLD.quote_id);
BEGIN
    UPDATE quotes
       SET quoted_total = (SELECT COALESCE(SUM(quoted_amount), 0) FROM quote_items WHERE quote_id = target)
                          - quoted_discount,
           updated_at   = CURRENT_TIMESTAMP
     WHERE id = target;
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION app.sync_quote_total_on_discount() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.quoted_total := (SELECT COALESCE(SUM(quoted_amount), 0) FROM quote_items WHERE quote_id = NEW.id)
                        - NEW.quoted_discount;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS quotes_sync_total_on_discount ON quotes;
CREATE TRIGGER quotes_sync_total_on_discount
    BEFORE UPDATE OF quoted_discount ON quotes
    FOR EACH ROW WHEN (OLD.quoted_discount IS DISTINCT FROM NEW.quoted_discount)
    EXECUTE FUNCTION app.sync_quote_total_on_discount();

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_app;

-- ── 5. The assistant: quote discount is a price, the number is not ─────────
-- CREATE OR REPLACE VIEW cannot reorder columns, so the view is rebuilt.

DROP VIEW IF EXISTS agent.quotes;
CREATE OR REPLACE VIEW agent.quotes AS
SELECT id, organization_id, branch_id, patient_id, version, supersedes_id, status, valid_until,
       CASE WHEN app.agent_has('pricing:read') THEN quoted_total END AS quoted_total,
       notes, created_by, sent_at, accepted_at, declined_at, created_at, updated_at,
       quote_number,
       CASE WHEN app.agent_has('pricing:read') THEN quoted_discount END AS quoted_discount
FROM public.quotes;
ALTER VIEW agent.quotes OWNER TO dental_agent_views;
GRANT SELECT ON agent.quotes TO dental_agent;

-- ── 6. What it all means ───────────────────────────────────────────────────

COMMENT ON TABLE document_sequences IS 'Per-clinic counters behind invoice and quote numbers: one row per organization, kind (invoice | quote) and year. Internal; never read by the app.';

COMMENT ON COLUMN treatment_invoices.invoice_number IS 'Sequential invoice number within the clinic and year (INV-2026-00017), assigned by the database on insert; the number shown to the patient.';
COMMENT ON COLUMN treatment_invoices.due_date IS 'Payment due date (payment terms); defaults to procedure_date (due on receipt). Outstanding balances age from this day.';
COMMENT ON COLUMN treatment_invoices.subtotal IS 'Sum of the line items before any discount.';
COMMENT ON COLUMN treatment_invoices.discount_amount IS 'Discount taken off the subtotal (0 when none); total_amount = subtotal - discount_amount.';
COMMENT ON COLUMN treatment_invoices.discount_reason IS 'Why the discount was given; required when discount_amount > 0.';
COMMENT ON COLUMN treatment_invoices.total_amount IS 'Amount owed: subtotal minus discount_amount.';

COMMENT ON COLUMN invoice_payments.payment_date IS 'The day the money moved (received for a payment, returned for a refund); may be earlier than created_at when entered later. Reports use this day.';

COMMENT ON COLUMN quotes.quote_number IS 'Sequential quote number within the clinic and year (QUO-2026-00004), assigned by the database on insert; the number shown to the patient.';
COMMENT ON COLUMN quotes.quoted_discount IS 'Discount taken off the quoted lines (0 when none); quoted_total = sum of lines - quoted_discount.';
COMMENT ON COLUMN quotes.quoted_total IS 'Sum of quote_items.quoted_amount minus quoted_discount (maintained by trigger). Named apart from invoice totals: it is an estimate, not a charge.';

COMMIT;
