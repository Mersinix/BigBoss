-- Maintenance marketplace service integration.
-- The enum additions are isolated from the service-row seed below because
-- PostgreSQL does not allow a newly-added enum value to be used until the
-- transaction that adds it has committed.

DO $$ BEGIN
  ALTER TYPE "public"."user_role" ADD VALUE 'MAINTENANCE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "public"."service_key" ADD VALUE 'MAINTENANCE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "public"."dark_mode_account" ADD VALUE 'MAINTENANCE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "maintenance_categories" text[];