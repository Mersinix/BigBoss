CREATE TYPE "public"."user_account_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'PRINTER';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'MARKETING';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'BARISTA_ACADEMY';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'BARISTA_MARKETPLACE';--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "created_by_supplier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "created_by_supplier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "flavors" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "flavors" ADD COLUMN "created_by_supplier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "flavors" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "flavors" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "flavors" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "created_by_supplier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "sizes" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "sizes" ADD COLUMN "created_by_supplier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sizes" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "sizes" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "sizes" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "sub_categories" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_categories" ADD COLUMN "created_by_supplier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_categories" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "sub_categories" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "sub_categories" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_account_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_info" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "governorates" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "categories" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "print_categories" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_categories" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_address" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_lat" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_lng" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_place_id" text;