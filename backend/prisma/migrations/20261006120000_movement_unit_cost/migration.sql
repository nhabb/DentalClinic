-- Unit cost paid on each stock-in movement, so historical spend doesn't shift
-- when an item's cost_price changes later. Existing "in" rows are backfilled
-- with the item's current cost_price (the best figure available).
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "unit_cost" DECIMAL(12,2);

UPDATE "inventory_movements" m
SET "unit_cost" = i."cost_price"
FROM "inventory_items" i
WHERE m."item_id" = i."id" AND m."movement_type" = 'in' AND m."unit_cost" IS NULL;
