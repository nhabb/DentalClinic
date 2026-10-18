-- Tell the two kinds of refund apart.
--
-- Both land in invoice_payments with kind = 'refund', but they mean different
-- things: an INVOICE refund takes money back off a named bill and carries an
-- allocation, so it lowers that invoice's amount_paid; a CREDIT refund hands
-- back money that never sat on a bill, so it lowers only the patient's credit
-- and touches no invoice. getSummary summed them identically, which made a
-- credit refund indistinguishable from an invoice refund in the income report.
--
-- Backfill rule: an invoice refund is the one that carries an allocation.
-- Verified against audit_logs before applying (billing.credit.refund records
-- the refund row's own id): all 8 allocation-less refunds were confirmed
-- credit refunds, and none of the 55 allocated ones was contradicted.

BEGIN;

ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS refund_scope TEXT;

UPDATE invoice_payments p SET refund_scope =
  CASE WHEN EXISTS (SELECT 1 FROM payment_allocations a WHERE a.payment_id = p.id)
       THEN 'invoice' ELSE 'credit' END
 WHERE p.kind = 'refund' AND p.refund_scope IS NULL;

-- Loud, not silent: a half-classified table would quietly skew every refund
-- figure from here on, so refuse the whole migration instead.
DO $$
DECLARE
  missing    bigint;
  as_invoice bigint;
  as_credit  bigint;
BEGIN
  SELECT count(*) INTO missing
    FROM invoice_payments WHERE kind = 'refund' AND refund_scope IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'refund_scope backfill incomplete: % refund rows unclassified', missing;
  END IF;

  SELECT
    count(*) FILTER (WHERE refund_scope = 'invoice'),
    count(*) FILTER (WHERE refund_scope = 'credit')
    INTO as_invoice, as_credit
  FROM invoice_payments WHERE kind = 'refund';
  RAISE NOTICE 'refund_scope backfilled: % invoice refunds, % credit refunds', as_invoice, as_credit;
END $$;

ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_refund_scope_valid;
ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_refund_scope_valid CHECK (
  (kind = 'payment' AND refund_scope IS NULL) OR
  (kind = 'refund'  AND refund_scope IN ('invoice', 'credit')));

COMMENT ON COLUMN invoice_payments.refund_scope IS
  'For kind = refund only: invoice (money taken back off a named bill; carries an allocation) | credit (unapplied credit handed back; touches no invoice). NULL for payments.';

COMMIT;
