-- Superseded by 20261018130000_plan_is_the_quote_drop. Intentionally a no-op.
--
-- This migration gated the price columns of `quotes` and `quote_items` behind
-- pricing:read, by giving each a view in schema `agent`. Both views are gone:
--
--   * quote_items was dropped — the chart rows are the plan, so there is no
--     second list of procedures to price;
--   * quotes lost quoted_total and quoted_discount — a plan's total is summed
--     from its chart rows, so the header holds no price at all and the
--     assistant reads the table directly.
--
-- The statements are kept here as a record of what used to be, but they are
-- not re-runnable: they reference columns and a table that no longer exist, so
-- running them would fail. The end state they aimed at is now set by
-- 20261018130000 (for quotes) and 20261018111000 (for quote_sends, which is
-- where a plan's prices live now).
--
-- Nothing to apply.

SELECT 1;
