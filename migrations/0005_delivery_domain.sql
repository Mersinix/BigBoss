-- Delivery domain: one Delivery per sub_order, separate from the customer-facing
-- orderStatusEnum. Additive only — no existing column is altered or dropped.
-- orders.delivery_id is left untouched (see shared/schema.ts comment: legacy/unused,
-- never repurposed).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "delivery_company_id" integer;

DO $$ BEGIN
  CREATE TYPE "public"."delivery_status" AS ENUM ('PENDING', 'AVAILABLE', 'ACCEPTED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "deliveries" (
  "id" serial PRIMARY KEY NOT NULL,
  "sub_order_id" integer NOT NULL,
  "order_id" integer NOT NULL,
  "supplier_id" integer NOT NULL,
  "cafe_id" integer NOT NULL,
  "delivery_company_id" integer,
  "driver_id" integer,
  "status" "public"."delivery_status" NOT NULL DEFAULT 'AVAILABLE',
  "pickup_address" jsonb NOT NULL,
  "destination_address" jsonb,
  "delivery_fee" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "accepted_at" timestamp,
  "assigned_at" timestamp,
  "picked_up_at" timestamp,
  "in_transit_at" timestamp,
  "delivered_at" timestamp,
  "cancelled_at" timestamp
);

CREATE INDEX IF NOT EXISTS "deliveries_sub_order_idx" ON "deliveries" ("sub_order_id");
CREATE INDEX IF NOT EXISTS "deliveries_order_idx" ON "deliveries" ("order_id");
CREATE INDEX IF NOT EXISTS "deliveries_delivery_company_idx" ON "deliveries" ("delivery_company_id");
CREATE INDEX IF NOT EXISTS "deliveries_driver_idx" ON "deliveries" ("driver_id");
CREATE INDEX IF NOT EXISTS "deliveries_status_idx" ON "deliveries" ("status");

-- At most one ACTIVE (non-CANCELLED) delivery per sub-order. A cancelled delivery does not
-- block a fresh one from being created later for the same sub-order.
CREATE UNIQUE INDEX IF NOT EXISTS "deliveries_sub_order_active_unique"
  ON "deliveries" ("sub_order_id")
  WHERE "status" <> 'CANCELLED';
