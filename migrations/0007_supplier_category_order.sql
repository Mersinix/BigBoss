ALTER TABLE "supplier_categories"
  ADD COLUMN IF NOT EXISTS "display_order" integer NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY supplier_id ORDER BY id) - 1 AS position
  FROM supplier_categories
)
UPDATE supplier_categories sc
SET display_order = ordered.position
FROM ordered
WHERE sc.id = ordered.id;