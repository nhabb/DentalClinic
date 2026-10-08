-- Money received (invoice_payments) and money paid out (expense_payments) are
-- the only records of cash moving. The totals on the invoice / expense row are
-- a convenience copy. This migration makes the database keep the copy honest:
--
--   * a payment is always a positive amount
--   * an invoice's amount_paid is exactly the sum of its payments, never above
--     its total, and remaining_amount is always total - paid (same for expenses)
--   * triggers recompute the totals and status whenever a payment is added,
--     changed or removed, so no code path (REST, scripts, SQL) can leave them
--     out of step or accept a payment beyond the balance
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261009010000_payment_integrity/migration.sql

BEGIN;

-- Constraints -----------------------------------------------------------------

ALTER TABLE invoice_payments
    ADD CONSTRAINT invoice_payments_amount_positive CHECK (amount > 0);
ALTER TABLE expense_payments
    ADD CONSTRAINT expense_payments_amount_positive CHECK (amount > 0);

ALTER TABLE treatment_invoices
    ADD CONSTRAINT treatment_invoices_paid_within_total
    CHECK (amount_paid >= 0 AND amount_paid <= total_amount
           AND remaining_amount = total_amount - amount_paid);
ALTER TABLE expenses
    ADD CONSTRAINT expenses_paid_within_amount
    CHECK (amount_paid >= 0 AND amount_paid <= amount);

-- Triggers: totals follow the payments ----------------------------------------

CREATE OR REPLACE FUNCTION app.sync_invoice_totals() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target BIGINT := COALESCE(NEW.invoice_id, OLD.invoice_id);
    paid   NUMERIC(10,2);
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO paid FROM invoice_payments WHERE invoice_id = target;
    UPDATE treatment_invoices
       SET amount_paid      = paid,
           remaining_amount = total_amount - paid,
           status           = CASE WHEN total_amount - paid <= 0 THEN 'paid'
                                   WHEN paid > 0 THEN 'partial'
                                   ELSE 'open' END,
           updated_at       = CURRENT_TIMESTAMP
     WHERE id = target;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS invoice_payments_sync_totals ON invoice_payments;
CREATE TRIGGER invoice_payments_sync_totals
    AFTER INSERT OR UPDATE OF amount, invoice_id OR DELETE ON invoice_payments
    FOR EACH ROW EXECUTE FUNCTION app.sync_invoice_totals();

CREATE OR REPLACE FUNCTION app.sync_expense_totals() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target BIGINT := COALESCE(NEW.expense_id, OLD.expense_id);
    paid   NUMERIC(10,2);
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO paid FROM expense_payments WHERE expense_id = target;
    UPDATE expenses
       SET amount_paid = paid,
           status      = CASE WHEN amount - paid <= 0 THEN 'paid'
                              WHEN paid > 0 THEN 'partial'
                              ELSE 'pending' END,
           updated_at  = CURRENT_TIMESTAMP
     WHERE id = target;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS expense_payments_sync_totals ON expense_payments;
CREATE TRIGGER expense_payments_sync_totals
    AFTER INSERT OR UPDATE OF amount, expense_id OR DELETE ON expense_payments
    FOR EACH ROW EXECUTE FUNCTION app.sync_expense_totals();

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_app;

COMMIT;
