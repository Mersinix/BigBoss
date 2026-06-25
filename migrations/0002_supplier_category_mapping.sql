ALTER TABLE "supplier_categories" ADD COLUMN IF NOT EXISTS "mapping_status" text DEFAULT 'APPROVED' NOT NULL;
ALTER TABLE "supplier_categories" ADD COLUMN IF NOT EXISTS "is_frozen" boolean DEFAULT false NOT NULL;
