-- Delivery V2: Supplier-owned delivery operators alongside Delivery Companies.
-- Additive only.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "supplier_id" integer;

-- A DRIVER account belongs to exactly one operator (a Delivery Company or a Supplier),
-- never both.
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_driver_single_owner_check"
    CHECK (NOT ("delivery_company_id" IS NOT NULL AND "supplier_id" IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."delivery_mode" AS ENUM ('DELIVERY_COMPANY', 'SUPPLIER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "delivery_mode" "public"."delivery_mode";

-- Deliveries now start life PENDING (awaiting the supplier's dispatch decision) instead of
-- AVAILABLE. Change the column default going forward.
ALTER TABLE "deliveries" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- Backfill: every delivery that existed before this migration went through the old
-- "auto-published to the Delivery Company queue" flow — the only mode that existed. None of
-- them are PENDING (all are already AVAILABLE or further along), so this is unambiguous.
UPDATE "deliveries" SET "delivery_mode" = 'DELIVERY_COMPANY' WHERE "delivery_mode" IS NULL AND "status" <> 'PENDING';
