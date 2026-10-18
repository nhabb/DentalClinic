-- Two follow-ups to the ledger and quote-progress migrations.
--
-- 1. The assistant reads quote_items through a view in schema `agent` that
--    gates the price column, and that view must list every column of the table
--    (agent-pricing-views.spec.ts fails otherwise). CREATE OR REPLACE VIEW may
--    only append columns, so the four progress columns go at the end.
--
-- 2. A refund may not be unapplied from an invoice. Refunds are stored as an
--    allocation of a `kind = 'refund'` payment, which subtracts from the
--    invoice's amount_paid. Deleting that allocation alone would put the money
--    back on the invoice -- the bill would read as paid again while the cash
--    had already left the clinic -- and it could not be re-applied, because
--    PatientLedgerService.lockPayment refuses to apply a refund row. Removing
--    a refund outright stays what it was: DELETE /billing/payments/:id, admin
--    plus password, which deletes the refund row and its allocation together.
--
--    The two cases differ only in whether the refund row survives, so the
--    guard is a DEFERRABLE constraint trigger: it runs at COMMIT, when a
--    cascade from the payment has already removed the refund (allowed) while
--    a bare unapply has not (refused). A BEFORE DELETE trigger could not tell
--    them apart and would have broken deleting a refund.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261017140000_quote_progress_view_and_refund_guard/migration.sql

BEGIN;

-- ── 1. The assistant's view of a quote line, with its progress ─────────────

CREATE OR REPLACE VIEW agent.quote_items AS
SELECT id, organization_id, quote_id, record_id, procedure_name, tooth_number, description,
       CASE WHEN app.agent_has('pricing:read') THEN quoted_amount END AS quoted_amount,
       created_at,
       status, started_at, completed_at, invoice_id
FROM public.quote_items;

ALTER VIEW agent.quote_items OWNER TO dental_agent_views;
GRANT SELECT ON agent.quote_items TO dental_agent;

-- ── 2. Money that left the clinic is never quietly put back ────────────────

CREATE OR REPLACE FUNCTION app.refuse_unapplying_refund() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    -- Deferred to COMMIT: a refund that was deleted outright is gone by now,
    -- and only an allocation removed on its own still finds its refund here.
    IF EXISTS (
        SELECT 1 FROM invoice_payments
         WHERE id = OLD.payment_id AND kind = 'refund'
    ) THEN
        RAISE EXCEPTION 'allocation % belongs to a refund; a refund cannot be unapplied from an invoice, only deleted', OLD.id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_refund_stays';
    END IF;
    RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS payment_allocations_refund_stays ON payment_allocations;
CREATE CONSTRAINT TRIGGER payment_allocations_refund_stays
    AFTER DELETE ON payment_allocations
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION app.refuse_unapplying_refund();

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_agent;

COMMENT ON TABLE payment_allocations IS 'How much of one payment pays down one invoice. Invoice amount_paid is the sum of its allocations, signed by each payment kind (a refund allocation subtracts). A payment allocation can be removed to return the money to the patient credit; a refund allocation cannot, because the money has already left the clinic.';

COMMIT;
