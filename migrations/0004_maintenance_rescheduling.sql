ALTER TABLE "maintenance_reservations"
  ADD COLUMN IF NOT EXISTS "proposed_date" text,
  ADD COLUMN IF NOT EXISTS "proposed_time" text;