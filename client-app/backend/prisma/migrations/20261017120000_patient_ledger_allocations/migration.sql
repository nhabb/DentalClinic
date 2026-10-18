-- Money belongs to the patient, not to the invoice.
--
-- A treatment plan runs for months: the patient pays a deposit when the plan is
-- accepted, pays again at visits, and the bills appear one by one as procedures
-- are completed. Until now a payment row carried `invoice_id NOT NULL`, so
-- money taken before a bill existed had nowhere to live.
--
-- After this migration:
--
--   * invoice_payments belongs to a PATIENT (patient_id NOT NULL). It is the
--     record that money moved, nothing more. `invoice_id` is gone.
--   * payment_allocations says which invoice a payment pays down. One payment
--     can be spread over several invoices; one invoice can be paid by several
--     payments. An unallocated payment is credit on the patient's account.
--   * invoice totals follow the ALLOCATIONS (signed by the payment's kind:
--     a refund allocation reduces amount_paid), not the payments.
--
-- Three guards the database keeps, so no code path can invent money:
--
--   * a payment can never be allocated beyond its own amount;
--   * an allocation can only reach an invoice of the payment's own patient;
--   * allocation amounts are positive.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261017120000_patient_ledger_allocations/migration.sql

BEGIN;

-- ── 1. A payment belongs to a patient ──────────────────────────────────────

ALTER TABLE invoice_payments
    ADD COLUMN IF NOT EXISTS patient_id BIGINT;

UPDATE invoice_payments p
   SET patient_id = i.patient_id
  FROM treatment_invoices i
 WHERE i.id = p.invoice_id
   AND p.patient_id IS NULL;

-- Any payment whose invoice vanished cannot be attributed; there should be
-- none (the FK cascades), but fail loudly rather than silently drop money.
DO $guard$
DECLARE
    orphans BIGINT;
BEGIN
    SELECT count(*) INTO orphans FROM invoice_payments WHERE patient_id IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION '% payment rows have no patient; cannot migrate', orphans;
    END IF;
END $guard$;

ALTER TABLE invoice_payments ALTER COLUMN patient_id SET NOT NULL;

ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_patient_id_fkey;
ALTER TABLE invoice_payments
    ADD CONSTRAINT invoice_payments_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES patient_profiles(id) ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_invoice_payments_patient ON invoice_payments(patient_id);

-- ── 2. Allocations: which invoice a payment pays down ──────────────────────

CREATE TABLE IF NOT EXISTS "payment_allocations" (
    "id"              BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "payment_id"      BIGINT NOT NULL,
    "invoice_id"      BIGINT NOT NULL,
    "amount"          NUMERIC(10,2) NOT NULL,
    "created_by"      BIGINT,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocations_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "payment_allocations_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id")
        REFERENCES "invoice_payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id")
        REFERENCES "treatment_invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "payment_allocations_created_by_fkey" FOREIGN KEY ("created_by")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_payment_allocations_org"     ON "payment_allocations"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_payment_allocations_payment" ON "payment_allocations"("payment_id");
CREATE INDEX IF NOT EXISTS "idx_payment_allocations_invoice" ON "payment_allocations"("invoice_id");

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.payment_allocations;
CREATE POLICY tenant_isolation ON public.payment_allocations FOR ALL
    USING (app.is_system() OR "organization_id" = app.current_org_id())
    WITH CHECK (app.is_system() OR "organization_id" = app.current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON payment_allocations TO dental_app;
GRANT USAGE, SELECT ON SEQUENCE payment_allocations_id_seq TO dental_app;

-- The assistant may read allocations with the same permission as the payments.
-- Written in the same table/permission pair form as the other agent migrations:
-- agent-permissions-migration.spec.ts reads these pairs to prove the database
-- and TABLE_PERMISSIONS agree.
GRANT SELECT ON payment_allocations TO dental_agent;
DO $agent$
DECLARE
    entry TEXT[];
BEGIN
    FOREACH entry SLICE 1 IN ARRAY ARRAY[
        ['payment_allocations', 'billing:read']
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_permission ON public.%I', entry[1]);
        EXECUTE format(
            'CREATE POLICY agent_permission ON public.%I AS RESTRICTIVE FOR SELECT TO dental_agent '
            'USING (app.agent_may(%L))',
            entry[1], entry[2]);
    END LOOP;
END $agent$;

-- ── 3. Backfill: every existing payment is fully allocated to its invoice ──

INSERT INTO payment_allocations (organization_id, payment_id, invoice_id, amount, created_by, created_at)
SELECT p.organization_id, p.id, p.invoice_id, p.amount, p.created_by, p.created_at
  FROM invoice_payments p
 WHERE p.invoice_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM payment_allocations a WHERE a.payment_id = p.id);

-- ── 4. Guards on allocations ───────────────────────────────────────────────

-- A payment may never be allocated beyond what was actually received, and an
-- allocation may only reach an invoice of the payment's own patient. Both are
-- checked with the payment row locked, so two desks applying the same credit
-- at the same moment collide instead of both succeeding.
CREATE OR REPLACE FUNCTION app.check_payment_allocation() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
    pay_amount  NUMERIC(10,2);
    pay_patient BIGINT;
    inv_patient BIGINT;
    allocated   NUMERIC(10,2);
BEGIN
    SELECT amount, patient_id INTO pay_amount, pay_patient
      FROM invoice_payments WHERE id = NEW.payment_id FOR UPDATE;

    SELECT patient_id INTO inv_patient
      FROM treatment_invoices WHERE id = NEW.invoice_id;

    IF inv_patient IS DISTINCT FROM pay_patient THEN
        RAISE EXCEPTION 'payment % belongs to patient %, invoice % to patient %; money cannot move between patients',
            NEW.payment_id, pay_patient, NEW.invoice_id, inv_patient
            USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_same_patient';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO allocated
      FROM payment_allocations
     WHERE payment_id = NEW.payment_id
       AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF allocated + NEW.amount > pay_amount THEN
        RAISE EXCEPTION 'payment % is %, already applied %; cannot apply a further %',
            NEW.payment_id, pay_amount, allocated, NEW.amount
            USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_within_payment';
    END IF;

    RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS payment_allocations_check ON payment_allocations;
CREATE TRIGGER payment_allocations_check
    BEFORE INSERT OR UPDATE OF amount, payment_id, invoice_id ON payment_allocations
    FOR EACH ROW EXECUTE FUNCTION app.check_payment_allocation();

-- Shrinking a payment below what is already applied would invent money.
CREATE OR REPLACE FUNCTION app.check_payment_amount() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
    allocated NUMERIC(10,2);
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO allocated
      FROM payment_allocations WHERE payment_id = NEW.id;
    IF allocated > NEW.amount THEN
        RAISE EXCEPTION 'payment % is applied to invoices for %; it cannot be reduced to %',
            NEW.id, allocated, NEW.amount
            USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_payments_covers_allocations';
    END IF;
    RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS invoice_payments_covers_allocations ON invoice_payments;
CREATE TRIGGER invoice_payments_covers_allocations
    BEFORE UPDATE OF amount ON invoice_payments
    FOR EACH ROW EXECUTE FUNCTION app.check_payment_amount();

-- ── 5. Invoice totals follow the allocations ───────────────────────────────

-- Signed by the payment's kind: an allocation of a refund row reduces
-- amount_paid, exactly as the refund row itself used to.
CREATE OR REPLACE FUNCTION app.recalc_invoice_totals(target BIGINT) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
    paid NUMERIC(10,2);
BEGIN
    IF target IS NULL THEN RETURN; END IF;
    SELECT COALESCE(SUM(CASE WHEN p.kind = 'refund' THEN -a.amount ELSE a.amount END), 0)
      INTO paid
      FROM payment_allocations a
      JOIN invoice_payments p ON p.id = a.payment_id
     WHERE a.invoice_id = target;
    UPDATE treatment_invoices
       SET amount_paid      = paid,
           remaining_amount = total_amount - paid,
           status           = CASE WHEN status = 'cancelled' THEN 'cancelled'
                                   WHEN total_amount - paid <= 0 THEN 'paid'
                                   WHEN paid > 0 THEN 'partial'
                                   ELSE 'open' END,
           updated_at       = CURRENT_TIMESTAMP
     WHERE id = target;
END $fn$;

CREATE OR REPLACE FUNCTION app.sync_invoice_totals_from_allocation() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM app.recalc_invoice_totals(COALESCE(NEW.invoice_id, OLD.invoice_id));
    -- A moved allocation leaves the invoice it came from.
    IF TG_OP = 'UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
        PERFORM app.recalc_invoice_totals(OLD.invoice_id);
    END IF;
    RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS payment_allocations_sync_totals ON payment_allocations;
CREATE TRIGGER payment_allocations_sync_totals
    AFTER INSERT OR UPDATE OF amount, invoice_id OR DELETE ON payment_allocations
    FOR EACH ROW EXECUTE FUNCTION app.sync_invoice_totals_from_allocation();

-- Changing a payment's amount or kind re-signs every invoice it touches.
CREATE OR REPLACE FUNCTION app.sync_invoices_of_payment() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
    inv BIGINT;
BEGIN
    FOR inv IN SELECT DISTINCT invoice_id FROM payment_allocations
                WHERE payment_id = COALESCE(NEW.id, OLD.id) LOOP
        PERFORM app.recalc_invoice_totals(inv);
    END LOOP;
    RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS invoice_payments_sync_totals ON invoice_payments;
CREATE TRIGGER invoice_payments_sync_totals
    AFTER UPDATE OF amount, kind ON invoice_payments
    FOR EACH ROW EXECUTE FUNCTION app.sync_invoices_of_payment();

-- A cancelled invoice is frozen: money can no longer be applied to it or
-- taken off it. The rule moves from the payment to the allocation, because the
-- allocation is now what touches an invoice.

DROP TRIGGER IF EXISTS invoice_payments_refuse_cancelled ON invoice_payments;
DROP FUNCTION IF EXISTS app.refuse_payment_on_cancelled_invoice();

CREATE OR REPLACE FUNCTION app.refuse_allocation_on_cancelled_invoice() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
    target BIGINT := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
    IF EXISTS (SELECT 1 FROM treatment_invoices WHERE id = target AND status = 'cancelled') THEN
        RAISE EXCEPTION 'invoice % is cancelled: the money applied to it is frozen', target
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END $fn$;

DROP TRIGGER IF EXISTS payment_allocations_refuse_cancelled ON payment_allocations;
CREATE TRIGGER payment_allocations_refuse_cancelled
    BEFORE INSERT OR UPDATE OF invoice_id, amount OR DELETE ON payment_allocations
    FOR EACH ROW EXECUTE FUNCTION app.refuse_allocation_on_cancelled_invoice();

-- ── 6. The payment's own invoice_id is gone ────────────────────────────────

ALTER TABLE invoice_payments DROP COLUMN IF EXISTS invoice_id;

-- The old payment-driven recalculation is dead and would not compile against
-- the new shape; allocations drive the totals now.
DROP FUNCTION IF EXISTS app.sync_invoice_totals();

-- Recompute every invoice from its allocations, so the new truth is the stored
-- truth even where the old trigger and the backfill could have disagreed.
DO $recalc$
DECLARE
    inv BIGINT;
BEGIN
    FOR inv IN SELECT id FROM treatment_invoices LOOP
        PERFORM app.recalc_invoice_totals(inv);
    END LOOP;
END $recalc$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_agent;

-- ── 7. What the columns mean ───────────────────────────────────────────────

COMMENT ON TABLE invoice_payments IS 'Money that moved between the clinic and a patient: received (kind = payment) or returned (kind = refund). A payment belongs to a patient, not to an invoice; payment_allocations says which invoices it pays down. A payment with no allocation (or a part of one) is credit on the patient account.';
COMMENT ON COLUMN invoice_payments.patient_id IS 'The patient whose money this is. Credit and invoices never cross patients.';
COMMENT ON TABLE payment_allocations IS 'How much of one payment pays down one invoice. Invoice amount_paid is the sum of its allocations, signed by each payment kind (a refund allocation subtracts).';
COMMENT ON COLUMN payment_allocations.payment_id IS 'The money being applied.';
COMMENT ON COLUMN payment_allocations.invoice_id IS 'The invoice it is applied to; must belong to the payment''s patient.';
COMMENT ON COLUMN payment_allocations.amount IS 'Part of the payment applied here (positive, never more than the payment).';
COMMENT ON COLUMN treatment_invoices.amount_paid IS 'Sum of this invoice''s payment_allocations, refunds subtracted (maintained by trigger).';

COMMIT;
