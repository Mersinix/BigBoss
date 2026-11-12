-- Corrects four `promotions` monetary columns that a Supplier-form unit bug
-- persisted at 10x their intended CENTS value (shared/schema.ts documents all four
-- as "cents" at the column definition, the same unit as every price elsewhere in
-- the app — variant/listing prices, discountValue for PERCENTAGE-family types, the
-- promotion engine's own cart-subtotal math). promotions-page.tsx's formToPayload/
-- promoToForm instead used *1000/divide-1000 — the Discount Codes feature's own,
-- unrelated "millimes" convention — for minimumOrderValue, maximumDiscount,
-- freeShippingMinAmount, and discountValue (only for the FIXED_AMOUNT/
-- MIN_ORDER_AMOUNT types, which store an absolute DT amount rather than a
-- percentage). A supplier entering "10.000 DT" therefore had 10000 written to the
-- database instead of the intended 1000 — exactly the "10.000 DT -> 100.000 DT"
-- discrepancy this migration, and the accompanying code fix, resolve together. See
-- PROMOTION_MINIMUM_ORDER_ELIGIBILITY_THEME_REALTIME_REPORT.md for the full root-
-- cause trace.
--
-- Only the four affected columns are touched, and only where they are actually
-- set — no unrelated promotion field, and no promotion that never used these
-- fields, is modified. discountValue is corrected only for the two types that
-- stored a DT amount there; the percentage-family types' discountValue (basis
-- points) was never affected and is left untouched.
--
-- IMPORTANT — run this exactly once, manually, against the production database
-- (the same manual-apply practice already used for this project's other numbered
-- migration files; this environment has no database connection to run it from).
-- Running it a second time would incorrectly divide already-corrected values by
-- 10 again.

UPDATE "promotions"
SET "minimum_order_value" = ROUND("minimum_order_value" / 10.0)
WHERE "minimum_order_value" IS NOT NULL;

UPDATE "promotions"
SET "maximum_discount" = ROUND("maximum_discount" / 10.0)
WHERE "maximum_discount" IS NOT NULL;

UPDATE "promotions"
SET "free_shipping_min_amount" = ROUND("free_shipping_min_amount" / 10.0)
WHERE "free_shipping_min_amount" IS NOT NULL;

UPDATE "promotions"
SET "discount_value" = ROUND("discount_value" / 10.0)
WHERE "type" IN ('FIXED_AMOUNT', 'MIN_ORDER_AMOUNT');
