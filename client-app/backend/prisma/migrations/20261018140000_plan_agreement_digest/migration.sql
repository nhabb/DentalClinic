-- The patient's agreement is for a plan, not for a patient.
--
-- `accepted_at` says somebody once agreed. A plan stays editable all the way
-- through treatment, so work added afterwards leaves that date describing a
-- plan that no longer exists. This stores a fingerprint of what was agreed to
-- (procedure, tooth and price of every line); when it stops matching the
-- plan, the desk is told to take the agreement again.
--
-- Deliberately not a price column: it is an opaque hex digest, so it needs no
-- `pricing:read` gate and no view in schema `agent`. `quotes` is granted at
-- table level to both dental_app and dental_agent, so a new column needs no
-- grant of its own.
--
-- Re-runnable.

BEGIN;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_digest TEXT;

COMMENT ON COLUMN quotes.accepted_digest IS
  'Fingerprint of the plan as it stood when the patient agreed (sha256 over each line''s procedure, tooth and price; progress and billing are deliberately excluded). NULL means the agreement predates this column, so staleness cannot be judged. When it differs from the plan''s current fingerprint, the agreement is out of date and must be taken again.';

COMMIT;
