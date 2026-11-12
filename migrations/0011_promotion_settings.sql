-- Admin → System Management → Promotion (task: "Admin Promotion Management —
-- Supplier Promotions Visibility and Type Configuration"). Two small settings
-- tables, mirroring messaging_settings / hero_action_settings exactly — never
-- touches the existing "promotions" table or any existing promotion row.
-- Reuses the existing "promotion_type" enum as-is (no new/invented type).

CREATE TABLE IF NOT EXISTS "promotion_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "global_visible" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "promotion_type_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "type" "public"."promotion_type" NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "promotion_type_settings_type_unique" UNIQUE("type")
);
