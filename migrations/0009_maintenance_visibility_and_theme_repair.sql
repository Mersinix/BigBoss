-- Complete the Maintenance service provisioning and repair the historical
-- boolean dark-mode column shape if this migration is applied to an older
-- Replit database. Existing values are preserved deterministically:
-- true -> DARK_ONLY, false -> LIGHT_ONLY.

INSERT INTO "platform_services" ("service", "state")
SELECT 'MAINTENANCE'::"public"."service_key", 'VISIBLE'::"public"."service_state"
WHERE NOT EXISTS (
  SELECT 1
  FROM "platform_services"
  WHERE "service" = 'MAINTENANCE'::"public"."service_key"
);

DO $$
DECLARE
  mode_type text;
BEGIN
  SELECT udt_name
  INTO mode_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'account_dark_mode_settings'
    AND column_name = 'mode';

  IF mode_type = 'bool' THEN
    ALTER TABLE "account_dark_mode_settings"
      ALTER COLUMN "mode" DROP DEFAULT;

    ALTER TABLE "account_dark_mode_settings"
      ALTER COLUMN "mode" TYPE "public"."account_theme_mode"
      USING CASE
        WHEN "mode" THEN 'DARK_ONLY'::"public"."account_theme_mode"
        ELSE 'LIGHT_ONLY'::"public"."account_theme_mode"
      END;
  END IF;

  IF mode_type IS NOT NULL THEN
    ALTER TABLE "account_dark_mode_settings"
      ALTER COLUMN "mode" SET DEFAULT 'BOTH'::"public"."account_theme_mode";
  END IF;
END $$;