ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location_details" jsonb;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_address" jsonb;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "courier_instructions" text;
