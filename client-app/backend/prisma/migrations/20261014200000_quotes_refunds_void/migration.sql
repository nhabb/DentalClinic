-- Quotes, refunds and voided invoices.
--
-- Money that has moved is never rewritten or deleted. This migration gives the
-- clinic the honest ways to correct billing instead:
--
--   * a REFUND is a row in invoice_payments with kind = 'refund' and a reason.
--     The amount stays positive; the invoice's amount_paid becomes
--     payments - refunds, and the existing check (0 <= paid <= total) means a
--     refund can never exceed what was actually received.
--   * a VOID marks an invoice status = 'cancelled' with who, when and why. The
--     arithmetic on the row is untouched (remaining = total - paid still holds)
--     and reports exclude cancelled invoices from outstanding. Only an invoice
--     with nothing net-paid can be voided (refund first), and a cancelled
--     invoice takes no further payments.
--   * a QUOTE is a priced treatment plan: a numbered, versioned estimate of the
--     planned records of one patient. It is not money: it never appears in
--     income or outstanding. An invoice born from an accepted quote references
--     it so quoted and billed can be compared.
--
-- Deleting an invoice or a payment stays possible for clinic admins only, and
-- the API additionally demands the admin's password on each deletion
-- (billing.controller.ts). Nothing here opens that up to the database roles.
--
-- The assistant may read quotes with billing:read (agent_permission policies
-- below); the price columns are gated on pricing:read by the views in the
-- companion migration 20261014200100_quotes_agent_pricing_views.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261014200000_quotes_refunds_void/migration.sql

BEGIN;

-- ── 1. Refunds: a kind on invoice_payments ─────────────────────────────────

ALTER TABLE invoice_payments
    ADD COLUMN IF NOT EXISTS kind   TEXT NOT NULL DEFAULT 'payment',
    ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_kind_valid;
ALTER TABLE invoice_payments
    ADD CONSTRAINT invoice_payments_kind_valid CHECK (kind IN ('payment', 'refund'));

-- A refund always says why.
ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_refund_has_reason;
ALTER TABLE invoice_payments
    ADD CONSTRAINT invoice_payments_refund_has_reason
    CHECK (kind = 'payment' OR (reason IS NOT NULL AND length(btrim(reason)) > 0));

-- ── 2. Void: a terminal status on treatment_invoices ───────────────────────

ALTER TABLE treatment_invoices
    ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS cancelled_by  BIGINT,
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
    ADD COLUMN IF NOT EXISTS quote_id      BIGINT;

ALTER TABLE treatment_invoices DROP CONSTRAINT IF EXISTS treatment_invoices_cancelled_by_fkey;
ALTER TABLE treatment_invoices
    ADD CONSTRAINT treatment_invoices_cancelled_by_fkey FOREIGN KEY (cancelled_by)
        REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE treatment_invoices DROP CONSTRAINT IF EXISTS treatment_invoices_status_valid;
ALTER TABLE treatment_invoices
    ADD CONSTRAINT treatment_invoices_status_valid
    CHECK (status IN ('open', 'partial', 'paid', 'cancelled'));

-- A void is complete or absent: the stamp and the reason go with the status.
ALTER TABLE treatment_invoices DROP CONSTRAINT IF EXISTS treatment_invoices_void_complete;
ALTER TABLE treatment_invoices
    ADD CONSTRAINT treatment_invoices_void_complete
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL));

-- ── 3. Totals follow payments minus refunds; a void is never overwritten ───

CREATE OR REPLACE FUNCTION app.sync_invoice_totals() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target BIGINT := COALESCE(NEW.invoice_id, OLD.invoice_id);
    paid   NUMERIC(10,2);
BEGIN
    SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END), 0)
      INTO paid
      FROM invoice_payments
     WHERE invoice_id = target;
    UPDATE treatment_invoices
       SET amount_paid      = paid,
           remaining_amount = total_amount - paid,
           status           = CASE WHEN status = 'cancelled' THEN 'cancelled'
                                   WHEN total_amount - paid <= 0 THEN 'paid'
                                   WHEN paid > 0 THEN 'partial'
                                   ELSE 'open' END,
           updated_at       = CURRENT_TIMESTAMP
     WHERE id = target;
    RETURN NULL;
END $$;

-- The totals trigger from 20261009010000 must also fire when a row's kind
-- changes, since kind now decides the sign.
DROP TRIGGER IF EXISTS invoice_payments_sync_totals ON invoice_payments;
CREATE TRIGGER invoice_payments_sync_totals
    AFTER INSERT OR UPDATE OF amount, kind, invoice_id OR DELETE ON invoice_payments
    FOR EACH ROW EXECUTE FUNCTION app.sync_invoice_totals();

-- No money moves on a cancelled invoice, from any code path: nothing is
-- added, re-pointed or removed, so "cancelled" always means "nothing held".
CREATE OR REPLACE FUNCTION app.refuse_payment_on_cancelled_invoice() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target BIGINT := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
    IF EXISTS (SELECT 1 FROM treatment_invoices WHERE id = target AND status = 'cancelled') THEN
        RAISE EXCEPTION 'invoice % is cancelled: its payments and refunds are frozen', target
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS invoice_payments_refuse_cancelled ON invoice_payments;
CREATE TRIGGER invoice_payments_refuse_cancelled
    BEFORE INSERT OR UPDATE OF invoice_id, kind, amount OR DELETE ON invoice_payments
    FOR EACH ROW EXECUTE FUNCTION app.refuse_payment_on_cancelled_invoice();

-- ── 4. Quotes ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "quotes" (
    "id"              BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "branch_id"       BIGINT DEFAULT app.default_branch_id(),
    "patient_id"      BIGINT NOT NULL,
    "version"         INTEGER NOT NULL DEFAULT 1,
    "supersedes_id"   BIGINT,
    "status"          TEXT NOT NULL DEFAULT 'draft',
    "valid_until"     DATE,
    "quoted_total"    NUMERIC(10,2) NOT NULL DEFAULT 0,
    "notes"           TEXT,
    "created_by"      BIGINT,
    "sent_at"         TIMESTAMPTZ(6),
    "accepted_at"     TIMESTAMPTZ(6),
    "declined_at"     TIMESTAMPTZ(6),
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quotes_status_valid" CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
    CONSTRAINT "quotes_version_positive" CHECK (version >= 1),
    CONSTRAINT "quotes_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "quotes_branch_id_fkey" FOREIGN KEY ("branch_id")
        REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "quotes_patient_id_fkey" FOREIGN KEY ("patient_id")
        REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "quotes_supersedes_id_fkey" FOREIGN KEY ("supersedes_id")
        REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "quotes_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_quotes_org"        ON "quotes"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_quotes_org_branch" ON "quotes"("organization_id", "branch_id");
CREATE INDEX IF NOT EXISTS "idx_quotes_patient"    ON "quotes"("patient_id");
CREATE INDEX IF NOT EXISTS "idx_quotes_status"     ON "quotes"("status");

CREATE TABLE IF NOT EXISTS "quote_items" (
    "id"              BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "quote_id"        BIGINT NOT NULL,
    "record_id"       BIGINT,
    "procedure_name"  VARCHAR NOT NULL,
    "tooth_number"    TEXT,
    "description"     TEXT,
    "quoted_amount"   NUMERIC(10,2) NOT NULL,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_items_quoted_amount_not_negative" CHECK (quoted_amount >= 0),
    CONSTRAINT "quote_items_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id")
        REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "quote_items_record_id_fkey" FOREIGN KEY ("record_id")
        REFERENCES "patient_records"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_quote_items_org"    ON "quote_items"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_quote_items_quote"  ON "quote_items"("quote_id");
CREATE INDEX IF NOT EXISTS "idx_quote_items_record" ON "quote_items"("record_id");

ALTER TABLE treatment_invoices DROP CONSTRAINT IF EXISTS treatment_invoices_quote_id_fkey;
ALTER TABLE treatment_invoices
    ADD CONSTRAINT treatment_invoices_quote_id_fkey FOREIGN KEY (quote_id)
        REFERENCES quotes(id) ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX IF NOT EXISTS "idx_treatment_invoices_quote" ON "treatment_invoices"("quote_id");

-- The quote total is the sum of its items, kept by the database.
CREATE OR REPLACE FUNCTION app.sync_quote_total() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target BIGINT := COALESCE(NEW.quote_id, OLD.quote_id);
BEGIN
    UPDATE quotes
       SET quoted_total = (SELECT COALESCE(SUM(quoted_amount), 0) FROM quote_items WHERE quote_id = target),
           updated_at   = CURRENT_TIMESTAMP
     WHERE id = target;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS quote_items_sync_total ON quote_items;
CREATE TRIGGER quote_items_sync_total
    AFTER INSERT OR UPDATE OF quoted_amount, quote_id OR DELETE ON quote_items
    FOR EACH ROW EXECUTE FUNCTION app.sync_quote_total();

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_app;

-- ── 5. Tenant isolation (quotes follow the branch like invoices do) ────────

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.quotes;
CREATE POLICY tenant_isolation ON public.quotes FOR ALL
    USING (app.is_system() OR ("organization_id" = app.current_org_id()
        AND (app.branch_scope_id() IS NULL OR "branch_id" IS NULL OR "branch_id" = app.branch_scope_id())))
    WITH CHECK (app.is_system() OR ("organization_id" = app.current_org_id()
        AND (app.branch_scope_id() IS NULL OR "branch_id" IS NULL OR "branch_id" = app.branch_scope_id())));

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.quote_items;
CREATE POLICY tenant_isolation ON public.quote_items FOR ALL
    USING (app.is_system() OR "organization_id" = app.current_org_id())
    WITH CHECK (app.is_system() OR "organization_id" = app.current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON quotes, quote_items TO dental_app;
GRANT USAGE, SELECT ON SEQUENCE quotes_id_seq, quote_items_id_seq TO dental_app;

-- ── 6. The assistant reads quotes with billing:read ────────────────────────

GRANT SELECT ON quotes, quote_items TO dental_agent;
DO $$
DECLARE
    entry TEXT[];
BEGIN
    FOREACH entry SLICE 1 IN ARRAY ARRAY[
        ['quotes',      'billing:read'],
        ['quote_items', 'billing:read']
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_permission ON public.%I', entry[1]);
        EXECUTE format(
            'CREATE POLICY agent_permission ON public.%I AS RESTRICTIVE FOR SELECT TO dental_agent '
            'USING (app.agent_may(%L))',
            entry[1], entry[2]);
    END LOOP;
END $$;

-- ── 7. What it all means, for people and for the assistant ─────────────────

COMMENT ON COLUMN invoice_payments.kind IS 'payment (money received) | refund (money returned to the patient). A refund is a positive amount that reduces amount_paid.';
COMMENT ON COLUMN invoice_payments.reason IS 'Why money was returned; required for refunds, optional otherwise.';

COMMENT ON COLUMN treatment_invoices.status IS 'open (nothing paid yet) | partial (some paid) | paid (fully settled) | cancelled (voided: not owed, excluded from outstanding). open/partial/paid are maintained by trigger from payments minus refunds.';
COMMENT ON COLUMN treatment_invoices.amount_paid IS 'Sum of payments minus refunds for this invoice (maintained by trigger).';
COMMENT ON COLUMN treatment_invoices.cancelled_at IS 'When the invoice was voided; NULL unless status is cancelled.';
COMMENT ON COLUMN treatment_invoices.cancelled_by IS 'Staff member who voided it (users.id).';
COMMENT ON COLUMN treatment_invoices.cancel_reason IS 'Why it was voided; required when cancelled.';
COMMENT ON COLUMN treatment_invoices.quote_id IS 'The accepted quote this invoice was born from, if any (quotes.id); compare total_amount with the quote''s quoted_total to see drift.';

COMMENT ON TABLE quotes IS 'A priced treatment plan given to a patient: a numbered, versioned estimate of planned work. Not money: never counted as income or outstanding. Flow: draft -> sent -> accepted | declined; expired when valid_until passes. A new version supersedes the previous one.';
COMMENT ON COLUMN quotes.patient_id IS 'The patient (patient_profiles.id).';
COMMENT ON COLUMN quotes.version IS 'Version number within this patient''s sequence of quotes; a revised quote is a new row with version + 1.';
COMMENT ON COLUMN quotes.supersedes_id IS 'The previous version this quote replaces (quotes.id), if any.';
COMMENT ON COLUMN quotes.status IS 'draft (editable) | sent (given to the patient) | accepted | declined | expired. Only drafts can be changed.';
COMMENT ON COLUMN quotes.valid_until IS 'Last day the quoted prices hold.';
COMMENT ON COLUMN quotes.quoted_total IS 'Sum of quote_items.quoted_amount (maintained by trigger). Named apart from invoice totals: it is an estimate, not a charge.';
COMMENT ON COLUMN quotes.notes IS 'Free notes shown on the quote.';
COMMENT ON COLUMN quotes.created_by IS 'Staff member who prepared the quote (users.id).';
COMMENT ON COLUMN quotes.sent_at IS 'When it was given to the patient.';
COMMENT ON COLUMN quotes.accepted_at IS 'When the patient accepted it.';
COMMENT ON COLUMN quotes.declined_at IS 'When the patient declined it.';

COMMENT ON TABLE quote_items IS 'One priced line of a quote, usually one planned procedure on one tooth.';
COMMENT ON COLUMN quote_items.quote_id IS 'The quote this line belongs to.';
COMMENT ON COLUMN quote_items.record_id IS 'The planned chart record this line prices (patient_records.id), if it came from the chart.';
COMMENT ON COLUMN quote_items.procedure_name IS 'Procedure quoted (same list as invoice_line_items.procedure_name).';
COMMENT ON COLUMN quote_items.tooth_number IS 'FDI tooth number, if the line concerns one tooth.';
COMMENT ON COLUMN quote_items.description IS 'Free text shown on the quote line.';
COMMENT ON COLUMN quote_items.quoted_amount IS 'Quoted price of this line (an estimate, not a charge).';

COMMIT;
