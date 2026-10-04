-- Price quoted when work was planned/recorded on the dental chart, so completing
-- the plan later bills the agreed price instead of the default price list.
ALTER TABLE "patient_records" ADD COLUMN IF NOT EXISTS "quoted_amount" DECIMAL(10,2);
