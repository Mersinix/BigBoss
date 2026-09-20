import { pgTable, text, serial, integer, timestamp, pgEnum, boolean, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum('user_role', [
  'SUPER_ADMIN', 'ADMIN', 'SUPPLIER', 'CAFE_OWNER', 'DELIVERY_COMPANY', 'DRIVER',
  'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE'
]);
export const orderStatusEnum = pgEnum('order_status', ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'IN_DELIVERY', 'DELIVERED', 'CANCELLED']);
// Physical delivery lifecycle — separate from orderStatusEnum. orders.status/sub_orders.status
// remain the customer-facing aggregate; deliveryStatusEnum is the source of truth for the
// courier-side lifecycle of a single sub-order's delivery. PENDING is reserved for a future
// pre-publish step (e.g. zone-restricted dispatch) and is not used by the current flow, which
// creates deliveries directly in AVAILABLE.
export const deliveryStatusEnum = pgEnum('delivery_status', [
  'PENDING', 'AVAILABLE', 'ACCEPTED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'
]);
// Who operates the delivery. Null while PENDING (not yet dispatched by the supplier — see
// deliveries.deliveryMode below); set once the supplier dispatches it.
export const deliveryModeEnum = pgEnum('delivery_mode', ['DELIVERY_COMPANY', 'SUPPLIER']);
// Declared here (ahead of the deliveries table below, which snapshots a vehicleType) rather
// than alongside the rest of the delivery-pricing-engine block further down — see that block
// for the vehicles/deliveryPricingSettings tables this enum is shared by.
export const deliveryVehicleTypeEnum = pgEnum('delivery_vehicle_type', ['BICYCLE', 'MOTO', 'CAR', 'VAN', 'TRUCK', 'OTHER']);
export const listingVisibilityEnum = pgEnum('listing_visibility', ['VISIBLE', 'HIDDEN']);
export const userAccountStatusEnum = pgEnum('user_account_status', ['pending', 'approved', 'rejected']);
// The combined 'BARISTA' value is retired at the application level (the
// customer-facing discovery page it used to gate as one combined page has
// been split into two independent pages, /barista and /academy, each gated
// by its own key below) but the literal enum value is kept in the Postgres
// type — Postgres enum values can't be safely dropped, and any already-stored
// platformServices row with service='BARISTA' is simply orphaned/inert, not
// referenced by any app code anymore. Never re-add 'BARISTA' to ServiceKey
// (shared/schema.ts) or any of the switcher arrays that consume it.
export const serviceKeyEnum = pgEnum('service_key', ['PRINTING', 'MARKETING', 'BARISTA', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE']);
export const serviceStateEnum = pgEnum('service_state', ['VISIBLE', 'HIDDEN', 'COMING_SOON']);

// Order matches the app-wide canonical service order (main switcher, Admin
// System Management): SHOP, MAINTENANCE, PRINT, BARISTA_MARKETPLACE ("BARISTA"),
// BARISTA_ACADEMY ("ACADEMY"), MARKETING.
export const MARKETPLACE_SERVICE_IDS = ['SHOP', 'MAINTENANCE', 'PRINT', 'BARISTA_MARKETPLACE', 'BARISTA_ACADEMY', 'MARKETING'] as const;
export type MarketplaceServiceId = typeof MARKETPLACE_SERVICE_IDS[number];
export const DEFAULT_SERVICE_ORDER: MarketplaceServiceId[] = [...MARKETPLACE_SERVICE_IDS];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default('CAFE_OWNER'),
  status: userAccountStatusEnum('status').default('approved').notNull(),
  phone: text("phone"),
  isWhatsapp: boolean("is_whatsapp").default(false),
  profileImageUrl: text("profile_image_url"),
  // Cover/banner image — distinct from profileImageUrl (the logo/avatar). Lives on
  // `users` (not duplicated per profile table) so every professional account's
  // Settings → Compte section and every Details Modal read/write the exact same
  // generic PATCH /api/auth/me/profile field, same convention as profileImageUrl.
  coverImageUrl: text("cover_image_url"),
  billingInfo: jsonb("billing_info"),
  governorates: text("governorates").array(),
  categories: text("categories").array(),
  printCategories: text("print_categories").array(),
  printSubCategories: text("print_sub_categories").array(),
  marketingCategories: text("marketing_categories").array(),
  maintenanceCategories: text("maintenance_categories").array(),
  locationAddress: text("location_address"),
  locationLat: text("location_lat"),
  locationLng: text("location_lng"),
  locationPlaceId: text("location_place_id"),
  locationDetails: jsonb("location_details"),
  // A DRIVER account belongs to exactly one operator — a DELIVERY_COMPANY (deliveryCompanyId)
  // or a SUPPLIER (supplierId), never both (enforced by a DB CHECK constraint, see migration
  // 0006_delivery_v2.sql). Null for every other role.
  deliveryCompanyId: integer("delivery_company_id"),
  // Set only on DRIVER accounts owned directly by a supplier's own delivery operation
  // (as opposed to a DELIVERY_COMPANY's fleet). References another users.id with role SUPPLIER.
  supplierId: integer("supplier_id"),
  // Set only on CAFE_OWNER accounts created through a Supplier's "Add Café" action (see
  // Supplier → Cafes). Same createdBy* convention already used for taxonomy rows (e.g.
  // products.createdByUserId) — a café created this way is a completely normal CAFE_OWNER
  // account everywhere else; this only records provenance so the Supplier's Cafes page can
  // show it immediately, before any order has been placed. Never required: a café that
  // simply ordered from a supplier (no referral) is still "associated" via its orders.
  referredBySupplierId: integer("referred_by_supplier_id"),
  // Per-user notification opt-outs, keyed by a coarse NotificationPrefKey (see
  // shared/notification-preferences.ts) — e.g. { shop_orders: false }. Absence of a
  // key, or the whole column being null (every existing account today), means
  // enabled: this is a pure opt-OUT store, so a new key introduced later stays
  // enabled for everyone until they explicitly disable it. Lives on `users` (not a
  // separate table) so it free-rides the existing user_profile_updated broadcast +
  // /api/auth/me refetch for cross-tab/session sync — no new realtime plumbing.
  notificationPreferences: jsonb("notification_preferences").$type<Record<string, boolean> | null>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  driverSingleOwnerCheck: check(
    "users_driver_single_owner_check",
    sql`NOT (${table.deliveryCompanyId} IS NOT NULL AND ${table.supplierId} IS NOT NULL)`,
  ),
}));

// Password reset — one row per "forgot password" request. Only ever stores HASHES, never
// the raw 6-digit code or the raw reset token — see server/storage.ts
// createPasswordResetCode/verifyPasswordResetCode/resetPasswordWithToken, the only code
// paths allowed to touch this table. Two-phase: a short-lived numeric code is emailed and
// verified first (codeHash/codeExpiresAt/codeAttempts), then a short-lived opaque token
// (verifiedTokenHash/verifiedTokenExpiresAt) is issued to authorize the actual password
// change in a separate request, so the numeric code itself is never resubmitted alongside
// the new password. usedAt is set once the password has actually been changed via this row,
// making the whole row permanently dead (single-use).
export const passwordResetCodes = pgTable("password_reset_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  codeHash: text("code_hash").notNull(),
  codeExpiresAt: timestamp("code_expires_at").notNull(),
  codeAttempts: integer("code_attempts").notNull().default(0),
  verifiedTokenHash: text("verified_token_hash"),
  verifiedTokenExpiresAt: timestamp("verified_token_expires_at"),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("password_reset_codes_user_idx").on(table.userId),
}));

// Products — admin-created catalog items (isAdminProduct=true) or legacy supplier products
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id"),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull().default(0),
  stock: integer("stock").notNull().default(0),
  imageUrl: text("image_url"),
  imageUrls: text("image_urls").array(),
  category: text("category").notNull().default(""),
  categoryId: integer("category_id"),
  subCategoryId: integer("sub_category_id"),
  flavorId: integer("flavor_id"),
  sizeId: integer("size_id"),
  brandId: integer("brand_id"),
  flavorIds: integer("flavor_ids").array(),
  sizeIds: integer("size_ids").array(),
  isAdminProduct: boolean("is_admin_product").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").notNull().default('ACTIVE'),
  createdBySupplier: boolean("created_by_supplier").notNull().default(false),
  createdByUserId: integer("created_by_user_id"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
});

// Supplier product listings — supplier enriches an admin product with price/stock/available variants
export const supplierProductListings = pgTable("supplier_product_listings", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  productId: integer("product_id").notNull(),
  price: integer("price").notNull(),
  stock: integer("stock").notNull().default(0),
  availableFlavorIds: integer("available_flavor_ids").array(),
  availableSizeIds: integer("available_size_ids").array(),
  availableBrandIds: integer("available_brand_ids").array(),
  // When true, this listing's variants are pack-exclusive: hidden from "My Products"
  // and the individual marketplace, but still usable inside the supplier's Packs.
  onlyForPack: boolean("only_for_pack").notNull().default(false),
  // When true, this listing's variants are only shown in "My Products" / standalone
  // marketplace — excluded from Pack product selection.
  onlyForMyProducts: boolean("only_for_my_products").notNull().default(false),
  // ── Inventory management fields ──────────────────────────────────────────
  sku: text("sku"),
  barcode: text("barcode"),
  minStock: integer("min_stock").notNull().default(10),
  maxStock: integer("max_stock"),
  unit: text("unit").notNull().default('unit'),
  visibility: listingVisibilityEnum("visibility").notNull().default('VISIBLE'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Inventory adjustments — full audit history of every stock change a supplier makes
// (quick +/- buttons, the adjustment modal, restocks). Order-driven stock changes are
// also logged here so suppliers have one place to see "why did my stock change".
export const inventoryAdjustments = pgTable("inventory_adjustments", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  // variantId is best-effort (variant rows get recreated whenever a supplier resaves the
  // Variant Builder, via delete+reinsert in saveVariants). flavorId/sizeId are the durable
  // identity of "which variant slot" this history row belongs to, independent of row churn.
  variantId: integer("variant_id"),
  flavorId: integer("flavor_id"),
  sizeId: integer("size_id"),
  supplierId: integer("supplier_id").notNull(),
  userId: integer("user_id"), // null for system-driven adjustments (order placed/cancelled)
  adjustmentType: text("adjustment_type").notNull(), // 'INCREASE' | 'DECREASE' | 'SET'
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  difference: integer("difference").notNull(),
  reason: text("reason").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Supplier product variants — per-flavor/size pricing and stock within a listing.
// minStock/maxStock are per-variant thresholds; unit of measure is NOT stored here —
// it is always derived from the variant's linked size label (see buildInventoryItems).
export const supplierProductVariants = pgTable("supplier_product_variants", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  flavorId: integer("flavor_id"),
  sizeId: integer("size_id"),
  price: integer("price").notNull().default(0),
  quantity: integer("quantity").notNull().default(0),
  minStock: integer("min_stock"),
  maxStock: integer("max_stock"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Orders — supplierId nullable for multi-supplier orders (use sub_orders instead)
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  cafeId: integer("cafe_id").notNull(),
  supplierId: integer("supplier_id"),
  // @deprecated Legacy/unused. References users.id, never a delivery record (see
  // ordersRelations.delivery below). No code path writes this column — real driver/delivery
  // company assignment now lives on deliveries.driverId / deliveries.deliveryCompanyId
  // (one row per sub_order). Kept as-is (not repurposed, not dropped) to avoid a breaking
  // schema change; do not use for new delivery logic.
  deliveryId: integer("delivery_id"),
  status: orderStatusEnum("status").notNull().default('PENDING'),
  totalAmount: integer("total_amount").notNull(),
  deliveryAddress: jsonb("delivery_address"),
  deliveryMethod: text("delivery_method").notNull().default('DELIVERY_SERVICE'), // 'SELF_PICKUP' | 'DELIVERY_SERVICE'
  deliveryFee: integer("delivery_fee").notNull().default(0),
  courierInstructions: text("courier_instructions"),
  paymentMethod: text("payment_method").notNull().default('CASH_ON_DELIVERY'),
  paymentStatus: text("payment_status").notNull().default('PENDING'),
  priority: text("priority").notNull().default('NORMAL'), // 'NORMAL' | 'HIGH' | 'URGENT'
  scheduledAt: timestamp("scheduled_at"),                 // null = immediate
  isFavorite: boolean("is_favorite").notNull().default(false), // Coffee Owner's "Daily" star
  createdAt: timestamp("created_at").defaultNow(),
});

// Sub-orders — one per supplier within a multi-supplier master order
export const subOrders = pgTable("sub_orders", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  supplierId: integer("supplier_id").notNull(),
  supplierName: text("supplier_name").notNull().default(''),
  subtotal: integer("subtotal").notNull().default(0),
  status: text("status").notNull().default('PENDING'),
  // Promotion snapshot — stored at order time so history is accurate even if promo changes
  promotionId: integer("promotion_id"),
  promotionName: text("promotion_name"),
  promotionType: text("promotion_type"),
  originalSubtotal: integer("original_subtotal"),
  discountAmount: integer("discount_amount").notNull().default(0),
  freeShipping: boolean("free_shipping").notNull().default(false),
  giftInfo: jsonb("gift_info"),
  // Discount Code snapshot — kept fully separate from the promotion fields above so a
  // historical order preserves exactly which code was used even if it's later edited/
  // deactivated/deleted. Snapshotted at order time, same principle as promotionName/Type.
  discountCodeId: integer("discount_code_id"),
  discountCodeSnapshot: text("discount_code_snapshot"),
  discountCodeAmount: integer("discount_code_amount").notNull().default(0),
  // ── Transport requirements (Delivery System V2) — supplier-declared, per sub-order since
  // each supplier's own slice of a multi-supplier order can have different physical
  // requirements. All nullable/optional: existing sub-orders and suppliers who never set
  // these keep working exactly as before (compatibility checks below simply no-op when
  // requiredVehicleType is null). Never used to auto-derive a vehicle — see
  // storage.isVehicleCompatible; weight/volume/fragility are informational only for now,
  // exactly as requested ("do not hard-code thresholds").
  requiredVehicleType: deliveryVehicleTypeEnum("required_vehicle_type"),
  totalWeightKg: text("total_weight_kg"),   // decimal-as-text, same convention as deliveries.distanceKm
  totalVolumeL: text("total_volume_l"),     // decimal-as-text, litres
  numberOfPackages: integer("number_of_packages"),
  numberOfItems: integer("number_of_items"),
  isFragile: boolean("is_fragile").notNull().default(false),
  specialHandling: text("special_handling"),
  // ── Self Pickup confirmation (Delivery System V2) — only ever populated when the parent
  // order's deliveryMethod is SELF_PICKUP (see storage.createOrder). Same 6-digit
  // confirmation-code pattern as deliveries.pickupCode/dropoffCode, generated once at order
  // creation and never regenerated. Redacted server-side (see storage.getOrders) to the
  // owning Supplier and Admin only — the Coffee Owner receives it verbally/in person, never
  // through the API, and must type it back to confirm.
  selfPickupCode: text("self_pickup_code"),
  selfPickupCodeConfirmedAt: timestamp("self_pickup_code_confirmed_at"),
  selfPickupConfirmedByUserId: integer("self_pickup_confirmed_by_user_id"),
  // Snapshot of the supplier's pickup address at order-creation time — same principle as
  // deliveries.pickupAddress (a supplier changing their profile address later must never
  // rewrite where an already-placed self-pickup order sends the Coffee Owner).
  selfPickupAddress: jsonb("self_pickup_address").$type<GeoLocation>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  subOrderId: integer("sub_order_id"),
  productId: integer("product_id"),
  listingId: integer("listing_id"), // stored for reorder lookups
  packId: integer("pack_id"),
  packName: text("pack_name"),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  totalPrice: integer("total_price"),
  flavorId: integer("flavor_id"),
  sizeId: integer("size_id"),
  snapshot: jsonb("snapshot"),
  // 'ACTIVE' | 'CANCELLED' — per-item Coffee Owner cancellation (Part 1 of the
  // per-supplier cancellation flow). Only settable while the parent sub-order
  // is still PENDING; see storage.cancelSubOrderItems.
  status: text("status").notNull().default('ACTIVE'),
});

// ── Returns ───────────────────────────────────────────────────────────────────

export const returnStatusEnum = pgEnum('return_status', [
  'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'RESOLVED'
]);
export const returnItemTypeEnum = pgEnum('return_item_type', ['PRODUCT', 'PACK']);

export const orderReturns = pgTable("order_returns", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  subOrderId: integer("sub_order_id"),
  cafeId: integer("cafe_id").notNull(),
  supplierId: integer("supplier_id").notNull(),
  itemType: returnItemTypeEnum("item_type").notNull().default('PRODUCT'),
  orderItemId: integer("order_item_id"),
  itemName: text("item_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  reason: text("reason").notNull(),
  status: returnStatusEnum("status").notNull().default('PENDING_REVIEW'),
  supplierNotes: text("supplier_notes"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

// ── Deliveries ───────────────────────────────────────────────────────────────
// One Delivery per sub_order (not per order): a single Shop order can span multiple
// suppliers with different physical pickup points, so each supplier's sub-order gets its
// own, independently-tracked delivery. The Coffee Owner still experiences one Shop order;
// orders/sub_orders remain the customer-facing source of truth (see storage.ts aggregation).
export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  subOrderId: integer("sub_order_id").notNull(),
  orderId: integer("order_id").notNull(),
  // Denormalized from the sub-order/order at creation time so delivery-scoped queries
  // (by supplier, by cafe) never need to join back through sub_orders/orders.
  supplierId: integer("supplier_id").notNull(),
  cafeId: integer("cafe_id").notNull(),
  // Who is operating this delivery — DELIVERY_COMPANY (goes through the accept/assign queue)
  // or SUPPLIER (the supplier assigns straight from its own driver roster, no acceptance
  // step). Null while status = PENDING, i.e. created but not yet dispatched by the supplier.
  deliveryMode: deliveryModeEnum("delivery_mode"),
  // Null until a Delivery Company accepts it (deliveryMode = DELIVERY_COMPANY only).
  deliveryCompanyId: integer("delivery_company_id"),
  driverId: integer("driver_id"),
  // Created PENDING (awaiting the supplier's dispatch decision); the supplier then dispatches
  // to either DELIVERY_COMPANY (→ AVAILABLE, enters the existing accept/assign queue) or
  // SUPPLIER (→ ACCEPTED directly — the supplier is its own operator, no acceptance needed).
  status: deliveryStatusEnum("status").notNull().default('PENDING'),
  // Two-way confirmation codes, generated once at creation (see createDeliveryForSubOrder) and
  // never regenerated. pickupCode is read by the supplier and given verbally/in-person to the
  // driver to confirm collection (ASSIGNED -> PICKED_UP); dropoffCode is read by the cafe owner
  // and given to the driver to confirm receipt (IN_TRANSIT -> DELIVERED). Each is redacted by
  // storage.ts/routes.ts to only the one role that should ever see it — the driver never reads
  // either value, only submits an attempt. Null on deliveries created before this feature
  // (updateDeliveryStatus skips the check when null — see storage.ts).
  pickupCode: text("pickup_code"),
  dropoffCode: text("dropoff_code"),
  // Snapshots taken at creation time — deliberately NOT foreign keys to live location data.
  // A supplier changing their profile address, or a cafe's account location changing, must
  // never rewrite the pickup/destination of a delivery that is already in progress or history.
  pickupAddress: jsonb("pickup_address").$type<GeoLocation>().notNull(),
  destinationAddress: jsonb("destination_address").$type<GeoLocation>(),
  // Real, computed compensation (see storage.computeDeliveryFee) — what the driver/operator
  // actually earns for this delivery. NEVER reduced by a free-delivery promotion; only who
  // PAYS for it (cafeOwnerFeeShareCents/supplierFeeShareCents below) changes in that case.
  // Computed twice: a provisional estimate at creation (supplier→cafe distance only, no
  // driver known yet) and a final figure at driver assignment (adds driver→supplier
  // distance, locks the real vehicle type) — never recomputed again after that, so a
  // completed delivery's financial value stays historically stable even if Admin later
  // changes pricing config (see shared/schema.ts deliveryPricingSettings).
  deliveryFee: integer("delivery_fee").notNull().default(0),
  // Fee responsibility split — defaults to deliveryPricingSettings.cafeOwnerSharePercent,
  // collapsed to cafeOwnerFeeShareCents=0 / supplierFeeShareCents=deliveryFee when
  // freeDeliveryApplied (an active Supplier FREE_SHIPPING promotion covers this delivery).
  cafeOwnerFeeShareCents: integer("cafe_owner_fee_share_cents").notNull().default(0),
  supplierFeeShareCents: integer("supplier_fee_share_cents").notNull().default(0),
  freeDeliveryApplied: boolean("free_delivery_applied").notNull().default(false),
  // Snapshots of what produced deliveryFee, for transparency/audit — never used to
  // silently recompute a historical fee.
  vehicleId: integer("vehicle_id"),
  vehicleType: deliveryVehicleTypeEnum("vehicle_type"),
  distanceKm: text("distance_km"), // decimal stored as text, matches this project's lat/lng text-column convention
  surgeMultiplierPermille: integer("surge_multiplier_permille"),
  // Delivery System V2 Phase 2 — populated by storage.getRoute() (the RouteEngine provider
  // abstraction). The only implementation today is the haversine fallback, so roadDistanceKm
  // is currently ALWAYS numerically identical to distanceKm above (distanceSource='fallback')
  // — no real routing provider is configured (would need API credentials this project does
  // not have; see delivery-v2-proposal.md §3.13 and the Phase 2 final report). distanceKm
  // remains the pricing pipeline's actual input either way — see runDeliveryPricingPipeline.
  roadDistanceKm: text("road_distance_km"),
  // Null in the fallback: an ETA requires an assumed average speed per vehicle (see the
  // proposal's VehicleModel.speedFactor), which is a real business decision that does not
  // exist in this codebase yet. Never invented here — populated only once a real provider or
  // an Admin-configured speed model exists.
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  // 'fallback' (haversine, today's only path) or 'routing_provider' (once one is wired up).
  // Nullable so pre-Phase-2 rows (which never computed a route at all) stay NULL forever.
  distanceSource: text("distance_source"),
  // ── Two-Leg Delivery Distance Model ──────────────────────────────────────────────────
  // A delivery has two distinct movement legs: LEG 1 (driver's current position → supplier,
  // the pickup/collection leg) and LEG 2 (supplier → coffee owner, the customer delivery
  // leg — this is what distanceKm/roadDistanceKm/estimatedDurationMinutes/distanceSource
  // above have always represented, and continue to represent unchanged). This block adds
  // LEG 1 as its own separate, parallel snapshot — never merged into the fields above, so
  // every existing reader of distanceKm/roadDistanceKm/deliveryFee/cafeOwnerFeeShareCents/
  // supplierFeeShareCents keeps working unchanged (Leg 2 only, exactly as before this model
  // existed). All nullable: pre-this-phase deliveries never computed a separate pickup leg
  // and stay NULL forever (no backfill), and a delivery whose driver position wasn't yet
  // known at pricing time (e.g. the provisional creation-time estimate, before a driver is
  // assigned) also leaves these NULL rather than inventing a phantom minimum-fee pickup
  // cost from an unknown position — see storage.computeDeliveryFee's driverPos guard.
  pickupLegDistanceKm: text("pickup_leg_distance_km"),
  pickupLegRoadDistanceKm: text("pickup_leg_road_distance_km"),
  pickupLegEstimatedDurationMinutes: integer("pickup_leg_estimated_duration_minutes"),
  pickupLegDistanceSource: text("pickup_leg_distance_source"),
  // The Supplier's own responsibility for this leg (task: "The Supplier must also pay the
  // cost associated with this driver → supplier distance") — computed via the EXACT SAME
  // pricing pipeline/vehicle rate/multiplier settings as the Leg 2 fee above (no separate
  // rate invented), applied to this leg's own distance. Recorded as its own ledger entry
  // (LedgerEntryType 'SUPPLIER_PICKUP_LEG') — never merged into supplierFeeShareCents/
  // deliveryFee, which must keep meaning exactly what they meant before (Leg 2 only), so the
  // existing deliveryFee === cafeOwnerFeeShareCents + supplierFeeShareCents relationship
  // every current UI display already relies on remains exactly true, unchanged.
  pickupLegFeeCents: integer("pickup_leg_fee_cents"),
  // Delivery System V2 Phase 3 — DriverPayoutEngine snapshot. Frozen at the SAME moment as
  // the fee itself (feeFinalizedAt, set together at driver assignment) — no separate
  // "payoutFinalizedAt" timestamp, since payout and fee are always computed and frozen
  // together (see storage.assignDriver/reassignDriver and rule 6 of the Phase 3 spec: "do
  // not create duplicate concepts if an equivalent already exists"). Nullable: pre-Phase-3
  // deliveries never computed a payout at all and stay NULL forever, never backfilled.
  // driverPayoutCents is what the assigned driver/operator earns; companyPayoutCents is the
  // Delivery Company's own margin (always 0 in SUPPLIER mode — see computeDeliveryPayout).
  // Neither is EVER derived from customer delivery fee at display time — both are computed
  // once, frozen, and read back verbatim (see rule 2 of the Phase 3 spec).
  driverPayoutSharePercentUsed: integer("driver_payout_share_percent_used"),
  driverPayoutCents: integer("driver_payout_cents"),
  companyPayoutCents: integer("company_payout_cents"),
  // Delivery Pricing Factor Pipeline snapshot (Delivery System V2 Phase 1) — the missing
  // historical INPUTS behind deliveryFee, so a delivery is fully self-explaining without
  // reading (possibly since-changed) deliveryPricingSettings. All nullable: rows created
  // before Phase 1 shipped simply never had these columns computed and stay NULL forever
  // (no backfill, no migration) — see storage.runDeliveryPricingPipeline. Populated once, at
  // the same moment as the other fee snapshot fields above, and — exactly like them — NEVER
  // rewritten after feeFinalizedAt is set.
  pricePerKmCentsUsed: integer("price_per_km_cents_used"),
  minFeeCentsUsed: integer("min_fee_cents_used"),
  baseFeeCents: integer("base_fee_cents"), // pure distanceKm × pricePerKmCentsUsed, no surge, no floor
  adjustedFeeCents: integer("adjusted_fee_cents"), // = deliveryFee; kept as its own snapshot field for pipeline transparency
  // Future pricing factors (Phase 2+) — always stored as their explicit no-op value today
  // (permille 1000 = ×1.0, cents 0) by runDeliveryPricingPipeline, never left implicit. This
  // is what distinguishes a Phase-1-or-later delivery (factor evaluated, found neutral) from
  // a pre-Phase-1 delivery (factor didn't exist yet, column is NULL).
  weatherMultiplierPermilleUsed: integer("weather_multiplier_permille_used"),
  demandMultiplierPermilleUsed: integer("demand_multiplier_permille_used"),
  peakHourMultiplierPermilleUsed: integer("peak_hour_multiplier_permille_used"),
  zoneMultiplierPermilleUsed: integer("zone_multiplier_permille_used"),
  waitingFeeCentsUsed: integer("waiting_fee_cents_used"),
  urgencySurchargeCentsUsed: integer("urgency_surcharge_cents_used"),

  // ── Delivery System V2 Phase 4 snapshot — frozen at the SAME moment as the fields above
  // (assignment), except the four waiting* fields, which cannot be known until pickup
  // actually happens — see storage.updateDeliveryStatus's PICKED_UP branch. All nullable;
  // pre-Phase-4 deliveries stay NULL forever, never backfilled.

  // Human-readable labels for what actually produced the multiplier values above — a
  // delivery is fully self-explaining without re-reading (possibly since-changed) Admin
  // config. Never used to recompute anything — display/audit only.
  weatherConditionUsed: text("weather_condition_used"),
  zoneNameUsed: text("zone_name_used"),
  peakHourLabelUsed: text("peak_hour_label_used"),
  // DeliverySafetyEngine decision in effect at assignment time (ALLOW/ALLOW_WITH_WARNING/
  // RESTRICT/SUSPEND) — see storage.resolveWeatherPricing/assignDriver's safety gate.
  safetyStateUsed: text("safety_state_used"),
  // Weather/Peak driver incentives — additive, folded directly into the frozen
  // driverPayoutCents at assignment (see storage.computeDeliveryPayout) — kept as their own
  // snapshot fields too so the incentive portion stays individually visible/auditable,
  // never silently blended into one opaque number.
  weatherIncentiveCentsUsed: integer("weather_incentive_cents_used"),
  peakIncentiveCentsUsed: integer("peak_incentive_cents_used"),
  // SupplierSubsidyEngine / BigBoss subsidy (Contribution/Subsidy split) — explicit, never
  // hidden inside cafeOwnerFeeShareCents/supplierFeeShareCents (see rule 11/13 of the Phase 4
  // spec: "never hide it inside the delivery fee"). bigBossSubsidyCents is always 0 in Phase
  // 4 (no campaign/budget engine exists yet — see the Phase 4 report's "not implemented"
  // section) but the field exists so it is never an implicit, invisible zero.
  supplierSubsidyCents: integer("supplier_subsidy_cents"),
  bigBossSubsidyCents: integer("bigboss_subsidy_cents"),
  // DeliveryBudgetEngine — analytical only, never blocks a delivery (see rule 14 of the
  // Phase 4 spec). 'FUNDED' | 'BREAK_EVEN' | 'DEFICIT'.
  budgetResultUsed: text("budget_result_used"),
  budgetDeficitCentsUsed: integer("budget_deficit_cents_used"),
  // WaitingTimePricingEngine — arrivedAtPickupAt is set by the assigned driver (new, minimal,
  // additive capture endpoint — does NOT change deliveryStatusEnum or the ASSIGNED→PICKED_UP
  // transition itself) while the delivery is still ASSIGNED. The three waiting* fields are
  // computed ONCE, at the PICKED_UP transition, from (pickedUpAt − arrivedAtPickupAt) — a
  // separate, later write that never touches feeFinalizedAt or the already-frozen
  // deliveryFee/driverPayoutCents/companyPayoutCents above (see rule 18 of the Phase 4 spec:
  // "historical deliveries must remain immutable"). Only today's one real scenario is
  // modeled — a driver waiting at the SUPPLIER for pickup (see delivery-v2-proposal.md's own
  // Example 9) — customer/dropoff-side waiting is not implemented (see the Phase 4 report).
  arrivedAtPickupAt: timestamp("arrived_at_pickup_at"),
  waitingMinutesBilled: integer("waiting_minutes_billed"),
  waitingCustomerFeeCentsUsed: integer("waiting_customer_fee_cents_used"),
  waitingDriverCompensationCentsUsed: integer("waiting_driver_compensation_cents_used"),

  // Delivery System V2 Phase 5B (hardening) — a monotonic counter, incremented by exactly 1
  // on every successful assignDriver (→ 1) and reassignDriver (→ 2, 3, ...) call that
  // actually changes the assigned driver (a same-driver "reassignment" — see rule 3 of the
  // Phase 5B hardening task's Case C — does NOT increment this). This is the "unique event
  // identity that can distinguish assignment #1/#2/#3 even when the same driver appears more
  // than once" the task asks for — used to build each ledger entry's sourceReference
  // (`delivery:<id>:seq:<assignmentSequence>` — see storage.ts recordDeliveryFinancialEvents),
  // so an A→B→A chain produces three DISTINCT idempotency keys instead of the second "A"
  // colliding with the first "A"'s now-VOID entries. Extends the existing ledger/event
  // identity architecture (rule 3: "prefer extending... do not create a new table") — no new
  // table, one new column reused by the exact same recordDeliveryFinancialEvents function
  // every assignment already calls.
  assignmentSequence: integer("assignment_sequence").notNull().default(0),

  // Set once the fee is computed from a real driver+vehicle (at assignment) rather than the
  // creation-time estimate — the recompute-once-more guard.
  feeFinalizedAt: timestamp("fee_finalized_at"),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  assignedAt: timestamp("assigned_at"),
  pickedUpAt: timestamp("picked_up_at"),
  inTransitAt: timestamp("in_transit_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
}, (table) => ({
  subOrderIdx: index("deliveries_sub_order_idx").on(table.subOrderId),
  orderIdx: index("deliveries_order_idx").on(table.orderId),
  deliveryCompanyIdx: index("deliveries_delivery_company_idx").on(table.deliveryCompanyId),
  driverIdx: index("deliveries_driver_idx").on(table.driverId),
  statusIdx: index("deliveries_status_idx").on(table.status),
  // A sub-order may accumulate a CANCELLED delivery and later get a fresh one, but it may
  // never have two simultaneously-active (non-CANCELLED) deliveries — partial unique index.
  oneActiveDeliveryPerSubOrder: uniqueIndex("deliveries_sub_order_active_unique")
    .on(table.subOrderId)
    .where(sql`${table.status} <> 'CANCELLED'`),
}));

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  subOrder: one(subOrders, { fields: [deliveries.subOrderId], references: [subOrders.id] }),
  order: one(orders, { fields: [deliveries.orderId], references: [orders.id] }),
  supplier: one(users, { fields: [deliveries.supplierId], references: [users.id], relationName: 'supplierDeliveries' }),
  cafe: one(users, { fields: [deliveries.cafeId], references: [users.id], relationName: 'cafeDeliveries' }),
  deliveryCompany: one(users, { fields: [deliveries.deliveryCompanyId], references: [users.id], relationName: 'companyDeliveries' }),
  driver: one(users, { fields: [deliveries.driverId], references: [users.id], relationName: 'driverDeliveries' }),
}));

export type Delivery = typeof deliveries.$inferSelect;
export type DeliveryStatus = 'PENDING' | 'AVAILABLE' | 'ACCEPTED' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
export type DeliveryMode = 'DELIVERY_COMPANY' | 'SUPPLIER';

// ── Delivery pricing engine ─────────────────────────────────────────────────
// A real, centrally-configured fee replaces the "no algorithm exists yet"
// placeholder (deliveries.deliveryFee always 0 before this). See
// storage.computeDeliveryFee for the formula. Nothing here duplicates the
// Delivery model above — every field lives on the SAME deliveries row.

export type DeliveryVehicleType = 'BICYCLE' | 'MOTO' | 'CAR' | 'VAN' | 'TRUCK' | 'OTHER';

// A vehicle belongs to exactly one operator (a Delivery Company or a Supplier
// running its own drivers — same XOR-owner shape as users.deliveryCompanyId/
// supplierId above) and may be assigned to at most one of that operator's
// drivers at a time. A Driver with no operator-assigned vehicle can self-
// register their own under their own operator (ownerType/ownerId mirrors
// their own deliveryCompanyId/supplierId) — same table, no second system.
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  ownerType: deliveryModeEnum("owner_type").notNull(), // reuses DELIVERY_COMPANY | SUPPLIER — same operator-kind concept as deliveries.deliveryMode
  ownerId: integer("owner_id").notNull(),
  type: deliveryVehicleTypeEnum("type").notNull().default('MOTO'),
  brand: text("brand").notNull().default(""),
  model: text("model").notNull().default(""),
  plateNumber: text("plate_number").notNull().default(""),
  hasAirConditioning: boolean("has_air_conditioning").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  assignedDriverId: integer("assigned_driver_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  ownerIdx: index("vehicles_owner_idx").on(table.ownerType, table.ownerId),
  // A vehicle can only ever be actively assigned to one driver — enforced the same
  // "partial unique index" way as deliveries' one-active-delivery-per-sub-order rule.
  oneDriverPerVehicle: uniqueIndex("vehicles_assigned_driver_unique")
    .on(table.assignedDriverId)
    .where(sql`${table.assignedDriverId} IS NOT NULL`),
}));

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;

// A Driver's own editable profile extension — bio/experience/certifications/
// availability. Nothing like this existed before (a DRIVER account previously
// had only bare `users` fields); mirrors the deliveryCompanyProfiles pattern
// exactly (same weeklyHours/isOnVacation shape). Vehicle is NEVER duplicated
// here — always the real vehicles row via getVehicleForDriver(userId).
// Reviews are NEVER duplicated either — always the existing
// supplierProductReviews (reviewType='DRIVER') via getDriverReviews(userId).
export const driverProfiles = pgTable("driver_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  bio: text("bio").notNull().default(""),
  experienceYears: integer("experience_years").notNull().default(0),
  certifications: text("certifications").array().notNull().default([]),
  weeklyHours: jsonb("weekly_hours").$type<OpeningHoursMap | null>(),
  isOnVacation: boolean("is_on_vacation").notNull().default(false),
  // Profile → Portfolio (max 4 enforced at the API layer) — same shape/convention as
  // maintenanceProfiles/marketingProfiles/deliveryCompanyProfiles.portfolioImages.
  portfolioImages: text("portfolio_images").array().notNull().default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type DriverProfile = typeof driverProfiles.$inferSelect;
export type InsertDriverProfile = typeof driverProfiles.$inferInsert;

// Admin-configured pricing — singleton row, same pattern as messagingSettings/
// landingConfig (getOrCreate on first read, one UPDATE thereafter).
export const deliveryPricingSettings = pgTable("delivery_pricing_settings", {
  id: serial("id").primaryKey(),
  // Per vehicle type: { pricePerKmCents, minFeeCents }. jsonb keyed by DeliveryVehicleType
  // rather than one column per type per field, so adding a vehicle type later needs no migration.
  // maxWeightKg/maxVolumeL/maxPackages (Delivery System V2 Phase 2) are OPTIONAL — undefined
  // for every vehicle type until Admin explicitly configures one. Deliberately not seeded with
  // a default value: a capacity limit is a real business decision (see
  // delivery-v2-proposal.md §6/§28), and this project does not invent one. Undefined = no
  // capacity constraint enforced for that vehicle/dimension (see
  // storage.checkDeliveryVehicleCompatibility) — the neutral, backward-compatible default.
  vehiclePricing: jsonb("vehicle_pricing").$type<Record<DeliveryVehicleType, {
    pricePerKmCents: number; minFeeCents: number;
    maxWeightKg?: number; maxVolumeL?: number; maxPackages?: number;
  }>>().notNull().default(sql`'{}'::jsonb`),
  // Used as the estimate vehicle type before a real driver/vehicle is assigned (see
  // storage.computeDeliveryFee's two computation points).
  defaultVehicleType: deliveryVehicleTypeEnum("default_vehicle_type").notNull().default('MOTO'),
  // Stored ×1000 (e.g. 1400 = ×1.4) to avoid floating point in Postgres integer columns.
  surgeMultiplierPermille: integer("surge_multiplier_permille").notNull().default(1000),
  surgeLabel: text("surge_label").notNull().default(""),
  // Default Coffee Owner share of the fee, 0-100; Supplier covers the rest (100 - this).
  // Free-delivery promotions override this per-delivery (cafeOwner share becomes 0) — see
  // storage.computeDeliveryFee.
  cafeOwnerSharePercent: integer("cafe_owner_share_percent").notNull().default(50),
  // Delivery System V2 Phase 3 — DriverPayoutEngine. What share of the customer delivery fee
  // (deliveries.deliveryFee) the assigned driver/operator earns; the rest is the delivery
  // company's own margin (0 in SUPPLIER mode, where there is no company). Defaults to 100 —
  // this is NOT an invented business rule: it is the exact behavior every delivery already
  // had before this phase (deliveryFee was always documented as "the full driver/operator
  // compensation" — see storage.computeDeliveryFee's doc comment). See
  // storage.computeDeliveryPayout.
  driverPayoutSharePercent: integer("driver_payout_share_percent").notNull().default(100),

  // ── Delivery System V2 Phase 4 — Controlled dynamic pricing & delivery economics ──────
  // Every field below defaults to a mathematical/behavioral no-op, so a delivery computed
  // the day Phase 4 ships is byte-identical to one computed the day before, exactly like
  // every prior phase's defaults (see runDeliveryPricingPipeline/computeDeliveryFee).

  // WeatherPricingEngine — Admin manually declares the current condition (no live weather
  // API is integrated — see delivery-v2-proposal.md §19 and the Phase 4 report's "not
  // implemented" section). 'NORMAL' is always hardcoded-neutral in code (never reads
  // weatherConditionConfigs for it) — the other four conditions' multiplier/incentive/safety
  // values are looked up from weatherConditionConfigs and default to neutral (×1.0, 0 DT,
  // ALLOW) whenever a condition is active but not yet configured, per rule 30 ("no invented
  // production values").
  activeWeatherCondition: text("active_weather_condition").notNull().default('NORMAL'),
  // Record<'RAIN'|'HEAVY_RAIN'|'STORM'|'EXTREME', { customerMultiplierPermille?: number;
  // driverIncentiveCents?: number; safetyState?: 'ALLOW'|'ALLOW_WITH_WARNING'|'RESTRICT'|
  // 'SUSPEND'; restrictedVehicleTypes?: DeliveryVehicleType[] }> — every key optional/absent
  // until Admin configures it (see storage.resolveWeatherPricing).
  weatherConditionConfigs: jsonb("weather_condition_configs").notNull().default(sql`'{}'::jsonb`),

  // PeakHourEngine — Admin-defined named time windows, no hard-coded Tunisian business
  // hours. Array of { id, label, daysOfWeek: number[] (0=Sunday..6=Saturday), startTime:
  // "HH:MM", endTime: "HH:MM", customerMultiplierPermille, driverIncentiveCents, isActive }.
  // Empty by default — the existing flat surgeMultiplierPermille remains the sole active
  // multiplier until Admin adds a window (see storage.resolvePeakHourPricing).
  peakHourWindows: jsonb("peak_hour_windows").notNull().default(sql`'[]'::jsonb`),

  // ZonePricingEngine — kept as jsonb on this same singleton settings row (not a separate
  // table) since the existing PATCH /api/admin/delivery-pricing + DeliveryPricingSection UI
  // + delivery_pricing_updated realtime broadcast already provide everything a small,
  // Admin-managed zone list needs — introducing a whole new table/CRUD surface for this
  // would duplicate infrastructure that already exists for an equivalently-shaped list
  // (compare peakHourWindows above). Array of { id, name, governorateMatch: string
  // (case-insensitively matched against a delivery's destination governorate — see
  // shared/schema.ts GeoLocation.details.governorate), multiplierPermille?: number,
  // minFeeOverrideCents?: number (can only RAISE the vehicle's own minimum fee, never lower
  // it — see storage.resolveZonePricing), isActive: boolean }. Empty by default.
  zones: jsonb("zones").notNull().default(sql`'[]'::jsonb`),

  // WaitingTimePricingEngine — a single global rate (not per-vehicle) since waiting cost is
  // primarily about a driver's TIME, not their vehicle. Defaults to fully neutral (0 DT/min
  // both sides) so waiting is always billed at 0 until Admin sets a real rate — see rule 2
  // ("Waiting = 0" by default) and storage.computeWaitingFee.
  waitingFreeMinutes: integer("waiting_free_minutes").notNull().default(0),
  waitingPricePerMinuteCents: integer("waiting_price_per_minute_cents").notNull().default(0),
  waitingDriverCompensationPerMinuteCents: integer("waiting_driver_compensation_per_minute_cents").notNull().default(0),
  waitingMaxChargeCents: integer("waiting_max_charge_cents"), // null = no cap

  // Multiplier Safety (rule 8) — the hard ceiling on weather × demand(still always ×1.0,
  // out of Phase 4 scope) × peak × zone combined, enforced inside
  // runDeliveryPricingPipeline. Defaults to 100000 permille (×100) — not a real production
  // cap (that is an explicit BUSINESS DECISION REQUIRED, see the Phase 4 report), but a
  // value so large it can never bind against any realistic Phase-4 configuration, making the
  // cap mechanism itself provably inert by default while still being fully deterministic and
  // fully configurable the moment Admin sets a real limit.
  maxCombinedMultiplierPermille: integer("max_combined_multiplier_permille").notNull().default(100000),

  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DeliveryPricingSettings = typeof deliveryPricingSettings.$inferSelect;

// ── Delivery Financial Ledger (Delivery System V2 Phase 5A) ─────────────────────────────
// See docs/bigboss-delivery-financial-ledger.md for the full design rationale. This table
// records ECONOMIC EVENTS derived from the already-existing, already-frozen Phase 1-4
// pricing/payout snapshot on `deliveries` — it never recomputes pricing, never changes
// existing delivery/payout behavior, and is strictly APPEND-ONLY: an entry's amountCents/
// direction/actorUserId/entryType are never updated or deleted once written. Only `status`
// may progress forward via a dedicated, narrowly-scoped update (see storage.ts
// updateLedgerEntriesStatus) — a status change is a lifecycle fact ("this became AUTHORIZED
// because the delivery completed"), never a correction of the underlying economic fact.
//
// CRITICAL: an entry existing here means an economic event was CALCULATED — it does NOT mean
// money was physically transferred, and does NOT mean BigBoss owes anyone anything (see
// docs/bigboss-delivery-business-rules-money-flow.md §3/§23). BigBoss's own liability is
// represented explicitly via `actorRole='BIGBOSS'` on the specific entries where it is
// actually the responsible party (today: none — see the ledger doc's "current limitations").
export const deliveryFinancialLedger = pgTable("delivery_financial_ledger", {
  id: serial("id").primaryKey(),
  // Denormalized from the delivery, matching this project's existing convention (e.g.
  // deliveries.supplierId/cafeId are denormalized from the order) — avoids a join for every
  // financial report query.
  orderId: integer("order_id").notNull(),
  subOrderId: integer("sub_order_id").notNull(),
  deliveryId: integer("delivery_id").notNull(),
  // Text, not a pg enum — this typology is expected to grow (future phases add BONUS,
  // DEMAND_SURGE, SETTLEMENT) without needing a schema migration each time, matching the
  // same text+TS-union pattern already used for deliveryPricingSettings.activeWeatherCondition
  // (Phase 4). Validated against LedgerEntryType at the application layer (server/storage.ts).
  entryType: text("entry_type").notNull(),
  // Who this entry concerns, and (where the current system already makes it unambiguous) who
  // the other side of the economic relationship is. Left null where the true counterparty
  // depends on a still-undecided business model question (see
  // docs/bigboss-delivery-business-rules-money-flow.md §5-6) — never guessed.
  actorRole: text("actor_role").notNull(),
  actorUserId: integer("actor_user_id"),
  counterpartyRole: text("counterparty_role"),
  counterpartyUserId: integer("counterparty_user_id"),
  // Always a positive integer cents amount — direction (below) carries the sign/meaning, so a
  // negative amountCents should never appear in this table.
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default('TND'),
  // CREDIT = this actor is entitled to RECEIVE amountCents. DEBIT = this actor is responsible
  // for / charged amountCents. Documented per-entry-type in server/storage.ts
  // recordDeliveryFinancialEvents.
  direction: text("direction").notNull(),
  // CALCULATED (default, set at write time) → AUTHORIZED (set when the underlying delivery
  // reaches DELIVERED) or VOID (set when the underlying delivery is CANCELLED) — see
  // storage.updateLedgerEntriesStatus. OWED/PAID/REFUNDED/DISPUTED are reserved for a future
  // settlement/refund phase and are never set by Phase 5A code.
  status: text("status").notNull().default('CALCULATED'),
  description: text("description"),
  // What triggered this entry (e.g. 'ASSIGN_DRIVER', 'PICKUP_WAITING') and a reference scoping
  // it (e.g. 'delivery:4821') — together with entryType, these form the idempotency key.
  sourceEvent: text("source_event").notNull(),
  sourceReference: text("source_reference").notNull(),
  // `${sourceEvent}:${sourceReference}:${entryType}` — unique-constrained so the SAME
  // real-world event can never produce two entries, even under retry/concurrency (see
  // storage.createFinancialLedgerEntry).
  idempotencyKey: text("idempotency_key").notNull(),
  // Self-reference reserved for a future refund/adjustment phase (an entry that reverses this
  // one would point back here) — never populated by Phase 5A code, since no refund/adjustment
  // engine exists yet. Included now so that capability doesn't require a later migration.
  reversedByEntryId: integer("reversed_by_entry_id"),
  // When the amount was actually determined (copies the source delivery's feeFinalizedAt/
  // pickedUpAt, etc.) — may differ from createdAt in a future backfill/adjustment scenario;
  // identical to createdAt for every entry Phase 5A itself writes.
  effectiveAt: timestamp("effective_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  deliveryIdx: index("ledger_delivery_idx").on(table.deliveryId),
  orderIdx: index("ledger_order_idx").on(table.orderId),
  subOrderIdx: index("ledger_sub_order_idx").on(table.subOrderId),
  actorIdx: index("ledger_actor_idx").on(table.actorRole, table.actorUserId),
  entryTypeIdx: index("ledger_entry_type_idx").on(table.entryType),
  statusIdx: index("ledger_status_idx").on(table.status),
  effectiveAtIdx: index("ledger_effective_at_idx").on(table.effectiveAt),
  idempotencyUnique: uniqueIndex("ledger_idempotency_unique").on(table.idempotencyKey),
}));
export type FinancialLedgerEntry = typeof deliveryFinancialLedger.$inferSelect;

// Application-layer types (validated in server/storage.ts, not DB-enforced — see entryType doc
// above). BONUS/DEMAND_SURGE/SETTLEMENT are reserved for future phases; no Phase 5A code path
// ever constructs an entry with one of these three.
export type LedgerEntryType =
  | 'DELIVERY_CHARGE' | 'SUPPLIER_CONTRIBUTION' | 'DRIVER_PAYOUT' | 'DELIVERY_COMPANY_PAYOUT'
  | 'BIGBOSS_SUBSIDY' | 'WEATHER_INCENTIVE' | 'PEAK_INCENTIVE' | 'WAITING_COMPENSATION'
  | 'CANCELLATION_COMPENSATION' | 'REFUND' | 'ADJUSTMENT'
  // Two-Leg Delivery Distance Model — the Supplier's own responsibility for the driver →
  // supplier pickup leg (see deliveries.pickupLegFeeCents doc). Kept as its own distinct
  // entry type, never merged into SUPPLIER_CONTRIBUTION, so each leg's obligation remains
  // independently auditable.
  | 'SUPPLIER_PICKUP_LEG'
  | 'BONUS' | 'DEMAND_SURGE' | 'SETTLEMENT';
export type LedgerActorRole = 'CAFE_OWNER' | 'SUPPLIER' | 'DRIVER' | 'DELIVERY_COMPANY' | 'BIGBOSS';
export type LedgerDirection = 'CREDIT' | 'DEBIT';
export type LedgerStatus = 'CALCULATED' | 'AUTHORIZED' | 'OWED' | 'PAID' | 'REFUNDED' | 'VOID' | 'DISPUTED';

// ── Settlement Foundation (Delivery System V2 Phase 5C.1) ───────────────────────────────
// See docs/bigboss-delivery-settlement-architecture.md (design) and
// docs/bigboss-delivery-settlement-foundation.md (as-built). A settlement GROUPS one
// delivery's already-AUTHORIZED, already-frozen ledger CREDIT entries for ONE recipient
// actor (a Driver or a Delivery Company — see settlements.actorRole doc below) into one
// approvable obligation. It NEVER recomputes pricing/payout and NEVER touches the ledger
// row it references beyond reading it — see settlementItems.ledgerEntryId. This is the
// FINANCIAL LEDGER → SETTLEMENT step only; the SETTLEMENT → PAYMENT step (payments table,
// actual money movement) is explicitly NOT part of this phase — see the architecture doc §4.
//
// Delivery System V2 Phase 5C.2 — PAID/PARTIALLY_PAID added now that a payment layer exists
// (see `payments` below) to actually set them; derived purely from confirmed payment totals
// against the frozen amountCents (storage.recomputeSettlementPaymentStatus) — never set
// directly by any route. PENDING/APPROVED/VOID are unchanged from Phase 5C.1.
export const settlementStatusEnum = pgEnum('settlement_status', ['PENDING', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'VOID']);

export const settlements = pgTable("settlements", {
  id: serial("id").primaryKey(),
  // Denormalized from the delivery (same convention as deliveryFinancialLedger.orderId/
  // subOrderId) — avoids a join for every settlement list/report query.
  deliveryId: integer("delivery_id").notNull(),
  orderId: integer("order_id").notNull(),
  subOrderId: integer("sub_order_id").notNull(),
  // WHO this settlement pays: always 'DRIVER' or 'DELIVERY_COMPANY' — the only two
  // LedgerActorRole values that ever appear on a CREDIT ledger entry (see
  // recordDeliveryFinancialEvents). CAFE_OWNER/SUPPLIER/BIGBOSS entries are always DEBIT
  // (funding sources, not settlement recipients — architecture doc §13/§14: "do not confuse
  // who funds with who receives") and therefore never produce a settlement row. Enforced in
  // code (calculateDeliverySettlement), not a DB constraint, matching this project's existing
  // text-role convention (deliveryFinancialLedger.actorRole is text too).
  actorRole: text("actor_role").notNull(),
  actorUserId: integer("actor_user_id").notNull(),
  // WHO owes it — copied verbatim from the grouped ledger entries' own counterpartyRole/
  // counterpartyUserId (always the operating Supplier or Delivery Company — never BigBoss,
  // never null, for the entry types that ever reach this table). Kept denormalized so a
  // settlement is self-explaining without joining back to the ledger.
  counterpartyRole: text("counterparty_role"),
  counterpartyUserId: integer("counterparty_user_id"),
  // Sum of every settlementItems row's amountCents for this settlement — always exactly
  // reconcilable back to the ledger (see storage.reconcileSettlement). Never independently
  // edited; the only way this changes is voiding this settlement and nothing yet exists to
  // create a corrected replacement (that is a future ADJUSTMENT-phase concern — architecture
  // doc §10).
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default('TND'),
  status: settlementStatusEnum("status").notNull().default('PENDING'),
  // Snapshot of the delivery's own DeliveryBudgetEngine result AT THE MOMENT this settlement
  // was calculated (architecture doc §21 freeze rule) — lets Admin see "this settlement was
  // calculated against a DEFICIT delivery" without a join, and without ever silently
  // resolving who absorbs the deficit (that remains an open business decision — architecture
  // doc §25). Purely informational; never affects amountCents.
  budgetResultAtCalculation: text("budget_result_at_calculation"),
  budgetDeficitCentsAtCalculation: integer("budget_deficit_cents_at_calculation"),
  // The shared sourceReference of the ledger entries this settlement groups (e.g.
  // `delivery:44:seq:3`) — traceable back to the exact assignment that earned it (see
  // deliveries.assignmentSequence doc). Since a delivery's ledger entries only ever reach
  // AUTHORIZED once (at DELIVERED, from whichever assignment was active at that moment — see
  // updateDeliveryStatus), this is always the single, final, correct assignment's reference.
  sourceReference: text("source_reference").notNull(),
  // `DELIVERY_SETTLEMENT:${sourceReference}:${actorRole}:${actorUserId}` — unique-constrained,
  // same ON CONFLICT DO NOTHING + read-back idempotency pattern as
  // deliveryFinancialLedger.idempotencyKey (see storage.calculateDeliverySettlement). Guards
  // duplicate settlement calculation (double-click, retry, concurrent DELIVERED transitions —
  // cannot actually happen twice since updateDeliveryStatus's compare-and-swap only lets ONE
  // request win the DELIVERED transition, but this is defense in depth, not the only guard).
  idempotencyKey: text("idempotency_key").notNull(),
  calculatedAt: timestamp("calculated_at").notNull(),
  approvedAt: timestamp("approved_at"),
  approvedByUserId: integer("approved_by_user_id"),
  voidedAt: timestamp("voided_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  deliveryIdx: index("settlements_delivery_idx").on(table.deliveryId),
  orderIdx: index("settlements_order_idx").on(table.orderId),
  actorIdx: index("settlements_actor_idx").on(table.actorRole, table.actorUserId),
  counterpartyIdx: index("settlements_counterparty_idx").on(table.counterpartyRole, table.counterpartyUserId),
  statusIdx: index("settlements_status_idx").on(table.status),
  idempotencyUnique: uniqueIndex("settlements_idempotency_unique").on(table.idempotencyKey),
}));
export type Settlement = typeof settlements.$inferSelect;
export type SettlementStatus = 'PENDING' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';

// The join that lets a settlement explain "WHY is this actor owed this amount" (architecture
// doc §7) WITHOUT the ledger ever being mutated to point at a settlement (architecture doc
// §4 — grouping lives here, not on the ledger row). ledgerEntryId carries a GLOBAL unique
// constraint (not just unique-per-settlement): a single ledger entry may be claimed by AT
// MOST ONE settlement, ever — the structural guarantee that the same economic fact can never
// be double-settled, enforced by the database, not just application logic.
export const settlementItems = pgTable("settlement_items", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id").notNull(),
  ledgerEntryId: integer("ledger_entry_id").notNull(),
  // Denormalized copy of the ledger entry's own amountCents/entryType at the moment it was
  // claimed — so a settlement's total is self-contained/auditable even without a live join
  // (architecture doc §23: "kept explicit rather than always re-joining").
  amountCents: integer("amount_cents").notNull(),
  entryType: text("entry_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  settlementIdx: index("settlement_items_settlement_idx").on(table.settlementId),
  ledgerEntryUnique: uniqueIndex("settlement_items_ledger_entry_unique").on(table.ledgerEntryId),
}));
export type SettlementItem = typeof settlementItems.$inferSelect;

// ── Payment Layer (Delivery System V2 Phase 5C.2) ────────────────────────────────────────
// See docs/bigboss-delivery-financial-strategy.md (as-built) and
// docs/bigboss-delivery-settlement-architecture.md §12/§13 (design). SETTLEMENT → PAYMENT
// step only. An INTERNAL payment-record layer — no external payment provider is integrated;
// every row here is a fact an Admin explicitly records (today: exclusively CASH, matching
// the system's current COD-only reality — see cod_reconciliations below), never something a
// provider webhook writes. A payment NEVER changes deliveryFinancialLedger or recalculates a
// settlement's amountCents — it only records whether/how a settlement's already-frozen
// amount was actually transferred, and its own status (see storage.confirmPayment/
// failPayment/reversePayment) is the ONLY thing that ever changes after creation.
export const paymentMethodEnum = pgEnum('payment_method', ['CASH', 'BANK_TRANSFER', 'CARD', 'WALLET', 'OTHER']);
export const paymentStatusEnum = pgEnum('payment_status', ['INITIATED', 'PENDING', 'CONFIRMED', 'FAILED', 'REVERSED']);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id").notNull(),
  // May differ from the settlement's own amountCents for a PARTIAL payment (multiple payment
  // rows can together cover one settlement) — see storage.recomputeSettlementPaymentStatus,
  // which sums only CONFIRMED payments and caps them at the settlement's amountCents
  // (overpayment is rejected at confirmPayment, never silently allowed — architecture doc §9).
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default('TND'),
  method: paymentMethodEnum("method").notNull(),
  // Nullable — CASH (today's only real method) has no external provider. Reserved for a
  // future real integration (CARD/BANK_TRANSFER/WALLET) without a schema change.
  provider: text("provider"),
  providerReference: text("provider_reference"),
  status: paymentStatusEnum("status").notNull().default('INITIATED'),
  initiatedAt: timestamp("initiated_at").notNull(),
  completedAt: timestamp("completed_at"),
  failedAt: timestamp("failed_at"),
  createdByUserId: integer("created_by_user_id").notNull(),
  // Client-supplied (or route-derived) idempotency key — guards an Admin double-click from
  // ever producing two payment rows for what was meant to be one action, same ON CONFLICT DO
  // NOTHING + read-back pattern as deliveryFinancialLedger.idempotencyKey.
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  settlementIdx: index("payments_settlement_idx").on(table.settlementId),
  statusIdx: index("payments_status_idx").on(table.status),
  idempotencyUnique: uniqueIndex("payments_idempotency_unique").on(table.idempotencyKey),
  // Partial unique index — providerReference is only meaningfully unique when present (CASH
  // payments never have one); Drizzle's pgTable builder emits this via a raw SQL predicate.
  providerReferenceUnique: uniqueIndex("payments_provider_reference_unique").on(table.providerReference).where(sql`${table.providerReference} IS NOT NULL`),
}));
export type Payment = typeof payments.$inferSelect;
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'WALLET' | 'OTHER';
export type PaymentStatus = 'INITIATED' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVERSED';

// ── COD Reconciliation (Delivery System V2 Phase 5C.2) ───────────────────────────────────
// Deliberately SEPARATE from deliveryStatusEnum (rule: "Do NOT merge COD with delivery
// status" — a delivery reaching DELIVERED is proof of drop-off, never proof cash was
// physically collected, a distinct real-world event). One row per delivery, created
// automatically (storage.createCodReconciliationIfApplicable, called from the SAME
// transaction as the DELIVERED transition, mirroring calculateDeliverySettlement's own
// trigger) ONLY when the order's paymentMethod is CASH_ON_DELIVERY — never for a
// card/mobile/bank-transfer order, and never for a delivery that doesn't exist (Self Pickup
// has no delivery row at all — structurally excluded, same as settlements).
export const codReconciliationStatusEnum = pgEnum('cod_reconciliation_status', [
  'EXPECTED', 'COLLECTED', 'REMITTED', 'RECONCILED', 'DISCREPANCY', 'CANCELLED',
]);

export const codReconciliations = pgTable("cod_reconciliations", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull(),
  orderId: integer("order_id").notNull(),
  // = subOrder.subtotal + delivery.deliveryFee at the moment of DELIVERED — the real,
  // already-existing amount the driver should collect for this delivery's own sub-order
  // (never invented; see storage.createCodReconciliationIfApplicable's doc for the exact
  // formula). Frozen at creation, exactly like every other Phase 1-5C snapshot value.
  expectedAmountCents: integer("expected_amount_cents").notNull(),
  collectedAmountCents: integer("collected_amount_cents"),
  remittedAmountCents: integer("remitted_amount_cents"),
  status: codReconciliationStatusEnum("status").notNull().default('EXPECTED'),
  collectedAt: timestamp("collected_at"),
  collectedByUserId: integer("collected_by_user_id"),
  remittedAt: timestamp("remitted_at"),
  remittedByUserId: integer("remitted_by_user_id"),
  reconciledAt: timestamp("reconciled_at"),
  reconciledByUserId: integer("reconciled_by_user_id"),
  // remittedAmountCents - expectedAmountCents at reconciliation time — the figure Finance
  // actually cares about (did the full expected amount make it all the way through). Never
  // silently absorbed: a nonzero value sets status=DISCREPANCY instead of RECONCILED, and
  // the field stays visible either way (see storage.reconcileCod).
  discrepancyCents: integer("discrepancy_cents"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  deliveryUnique: uniqueIndex("cod_reconciliations_delivery_unique").on(table.deliveryId),
  orderIdx: index("cod_reconciliations_order_idx").on(table.orderId),
  statusIdx: index("cod_reconciliations_status_idx").on(table.status),
}));
export type CodReconciliation = typeof codReconciliations.$inferSelect;
export type CodReconciliationStatus = 'EXPECTED' | 'COLLECTED' | 'REMITTED' | 'RECONCILED' | 'DISCREPANCY' | 'CANCELLED';

// ── Refunds (Delivery System V2 Phase 5C.2) ──────────────────────────────────────────────
// A refund is a NEW financial fact — it never edits the original ledger entry, settlement,
// or payment it refunds (architecture doc §9). Exactly one of paymentId/settlementId is
// normally set (a refund against a specific confirmed payment, or — before any payment
// exists — against the settlement obligation itself); both nullable so either shape is
// representable without two tables.
export const refundStatusEnum = pgEnum('refund_status', ['REQUESTED', 'CONFIRMED', 'FAILED', 'CANCELLED']);

export const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id"),
  settlementId: integer("settlement_id"),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason").notNull(),
  status: refundStatusEnum("status").notNull().default('REQUESTED'),
  initiatedByUserId: integer("initiated_by_user_id").notNull(),
  initiatedAt: timestamp("initiated_at").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  paymentIdx: index("refunds_payment_idx").on(table.paymentId),
  settlementIdx: index("refunds_settlement_idx").on(table.settlementId),
  statusIdx: index("refunds_status_idx").on(table.status),
}));
export type Refund = typeof refunds.$inferSelect;
export type RefundStatus = 'REQUESTED' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';

// ── Adjustments (Delivery System V2 Phase 5C.2) ──────────────────────────────────────────
// Additive-only correction, referencing the original fact it corrects — NEVER modifies it
// (architecture doc §10). No lifecycle/status: a created adjustment is immediately and
// permanently the fact it represents (unlike payments/refunds, there is no external process
// to confirm/fail — an Admin recording an adjustment IS the event).
export const adjustments = pgTable("adjustments", {
  id: serial("id").primaryKey(),
  ledgerEntryId: integer("ledger_entry_id"),
  settlementId: integer("settlement_id"),
  amountCents: integer("amount_cents").notNull(),
  direction: text("direction").notNull(), // 'CREDIT' | 'DEBIT' — same convention as deliveryFinancialLedger.direction
  reason: text("reason").notNull(),
  createdByUserId: integer("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ledgerEntryIdx: index("adjustments_ledger_entry_idx").on(table.ledgerEntryId),
  settlementIdx: index("adjustments_settlement_idx").on(table.settlementId),
}));
export type Adjustment = typeof adjustments.$inferSelect;

// Real-time Delivery-Company-published Driver opportunities (Part 17/18 — audited: nothing
// like this existed before). A Driver applying/accepting fills it; no duplicate assignment
// system — accepting an opportunity does not itself create a Delivery (deliveries are still
// only created from real orders), it is a labor/staffing call, kept deliberately separate.
export const deliveryOpportunityStatusEnum = pgEnum('delivery_opportunity_status', ['OPEN', 'FILLED', 'CLOSED', 'CANCELLED']);

export const deliveryOpportunities = pgTable("delivery_opportunities", {
  id: serial("id").primaryKey(),
  deliveryCompanyId: integer("delivery_company_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  area: text("area").notNull().default(""),
  vehicleTypeRequired: deliveryVehicleTypeEnum("vehicle_type_required"),
  startAt: timestamp("start_at"),
  durationHours: integer("duration_hours"),
  compensationCents: integer("compensation_cents"), // nullable — only shown if the company actually specifies one
  status: deliveryOpportunityStatusEnum("status").notNull().default('OPEN'),
  filledByDriverId: integer("filled_by_driver_id"),
  filledAt: timestamp("filled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyIdx: index("delivery_opportunities_company_idx").on(table.deliveryCompanyId),
  statusIdx: index("delivery_opportunities_status_idx").on(table.status),
}));

export type DeliveryOpportunity = typeof deliveryOpportunities.$inferSelect;
export type DeliveryOpportunityStatus = 'OPEN' | 'FILLED' | 'CLOSED' | 'CANCELLED';

// Full detail payload — deliberately includes everything a Supplier / Delivery Company /
// Driver / Admin needs to decide on or perform a delivery without a second fetch (order
// items, cafe + supplier contact info, live driver/supplier coordinates for the navigation
// map). Built from the existing orders/order_items/users relationships in storage.ts —
// nothing here is duplicated/stored on the deliveries row itself beyond the pickup/
// destination snapshots that already existed.
export type DeliveryWithDetails = Omit<Delivery, 'cafeOwnerFeeShareCents' | 'supplierFeeShareCents'> & {
  // Delivery System V2 Phase 5B (hardening) — widened to nullable here ONLY: the DB column
  // itself is genuinely never null (deliveries.cafeOwnerFeeShareCents/supplierFeeShareCents
  // stay .notNull() — no schema/behavior change), but storage.redactDeliveryCodes now returns
  // null for a viewer not authorized to see that specific share (e.g. a Driver never sees
  // either split; a Coffee Owner never sees the Supplier's — see that method's doc). Every
  // current consumer of these two fields already either checks `!= null` or falls back with
  // `?? 0`, so this widening does not change any existing display's runtime behavior.
  cafeOwnerFeeShareCents: number | null;
  supplierFeeShareCents: number | null;
  order: { id: number; status: string; totalAmount: number; createdAt: Date | null; itemCount: number; priority: string; scheduledAt: Date | null };
  subOrder: {
    id: number; status: string; supplierName: string; subtotal: number;
    // Transport requirements (Delivery System V2) — supplier-declared, informational +
    // vehicle-compatibility gating only (see storage.isVehicleCompatible).
    requiredVehicleType: DeliveryVehicleType | null;
    totalWeightKg: string | null;
    totalVolumeL: string | null;
    numberOfPackages: number | null;
    numberOfItems: number | null;
    isFragile: boolean;
    specialHandling: string | null;
  };
  cafe: { id: number; name: string; phone: string | null; locationAddress: string | null };
  supplier: { id: number; name: string; phone: string | null; locationAddress: string | null; locationLat: string | null; locationLng: string | null };
  deliveryCompany: { id: number; name: string } | null;
  driver: { id: number; name: string; phone: string | null; locationLat: string | null; locationLng: string | null } | null;
  // Delivery System V2 Phase 3 — derived at read time from the delivery's CURRENT status,
  // never persisted (the frozen driverPayoutCents/companyPayoutCents numbers themselves are
  // never touched by this). EARNED only once actually DELIVERED; VOID once CANCELLED (a
  // cancelled delivery's computed payout was never actually earned — see rule 24 of the
  // Phase 3 spec); PENDING for every other in-flight state, including when no payout has
  // been computed yet (still PENDING dispatch/assignment).
  payoutStatus: 'PENDING' | 'EARNED' | 'VOID';
  // Delivery System V2 Phase 4 — driverPayoutCents (frozen at assignment) plus any LATER
  // waitingDriverCompensationCentsUsed (only known at pickup — see schema comment above).
  // Derived at read time, never persisted; null whenever driverPayoutCents itself is null
  // (not yet assigned, or redacted for this viewer — see storage.redactDeliveryCodes).
  totalDriverPayoutCents: number | null;
  // Same shape as SubOrderWithItems.items — the raw, joined order items (snapshot, packId,
  // productId included) — so every delivery-detail surface can reuse the exact same
  // groupOrderItemsByProduct/PackCompositionView rendering the Coffee Owner order-details
  // modal uses, rather than a second, lossy flattened product representation.
  items: (OrderItem & { product: Product; flavorName?: string | null; sizeName?: string | null })[];
};

// ── Category System ──────────────────────────────────────────────────────────

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  status: text("status").notNull().default('ACTIVE'),
  createdBySupplier: boolean("created_by_supplier").notNull().default(false),
  createdByUserId: integer("created_by_user_id"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
});

export const subCategories = pgTable("sub_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: integer("category_id").notNull(),
  description: text("description"),
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  status: text("status").notNull().default('ACTIVE'),
  createdBySupplier: boolean("created_by_supplier").notNull().default(false),
  createdByUserId: integer("created_by_user_id"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
});

export const flavors = pgTable("flavors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  subCategoryIds: integer("sub_category_ids").array(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  status: text("status").notNull().default('ACTIVE'),
  createdBySupplier: boolean("created_by_supplier").notNull().default(false),
  createdByUserId: integer("created_by_user_id"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
});

export const sizes = pgTable("sizes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  value: text("value"),
  icon: text("icon"),
  subCategoryIds: integer("sub_category_ids").array(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  status: text("status").notNull().default('ACTIVE'),
  createdBySupplier: boolean("created_by_supplier").notNull().default(false),
  createdByUserId: integer("created_by_user_id"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
});

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  description: text("description"),
  icon: text("icon"),
  subCategoryIds: integer("sub_category_ids").array(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  status: text("status").notNull().default('ACTIVE'),
  createdBySupplier: boolean("created_by_supplier").notNull().default(false),
  createdByUserId: integer("created_by_user_id"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
});

export const supplierCategories = pgTable("supplier_categories", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  categoryId: integer("category_id").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  mappingStatus: text("mapping_status").notNull().default('APPROVED'),
  isFrozen: boolean("is_frozen").notNull().default(false),
});

export const supplierSubCategories = pgTable("supplier_sub_categories", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  subCategoryId: integer("sub_category_id").notNull(),
});

// Platform services — admin-controlled global visibility (System Management)
export const platformServices = pgTable("platform_services", {
  id: serial("id").primaryKey(),
  service: serviceKeyEnum("service").notNull().unique(),
  state: serviceStateEnum("state").notNull().default('VISIBLE'),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin-controlled visibility of the Coffee Owner hero "Fast Search"/"Report"
// icons, per service. Deliberately a separate table/key set from
// platformServices/serviceKeyEnum above: that mechanism controls whether a
// whole service is VISIBLE/HIDDEN/COMING_SOON on the marketplace, a different
// concern from "does this service's hero show these two icons" — and it uses
// a different, narrower key set (no SHOP) than the six Coffee-Owner-facing
// services this needs (SHOP/BARISTA/ACADEMY/MAINTENANCE/PRINT/MARKETING —
// the same short names already used by NotificationService). Defaults to
// enabled for every service so introducing this control never silently hides
// the Fast Search/Report icons that already work today (Barista/Academy/
// Maintenance/Marketing) — see server/storage.ts's seeding.
export const heroServiceEnum = pgEnum('hero_service', ['SHOP', 'BARISTA', 'ACADEMY', 'MAINTENANCE', 'PRINT', 'MARKETING']);

export const heroActionSettings = pgTable("hero_action_settings", {
  id: serial("id").primaryKey(),
  service: heroServiceEnum("service").notNull().unique(),
  fastSearchEnabled: boolean("fast_search_enabled").notNull().default(true),
  reportEnabled: boolean("report_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type HeroService = 'SHOP' | 'BARISTA' | 'ACADEMY' | 'MAINTENANCE' | 'PRINT' | 'MARKETING';
export type HeroActionSetting = typeof heroActionSettings.$inferSelect;
export type HeroActionSettingsMap = Record<HeroService, { fastSearchEnabled: boolean; reportEnabled: boolean }>;

// Admin-controlled theme POLICY for each of the 7 non-Coffee-Owner service
// accounts' own navbar. Separate table/key set again (same reasoning as
// heroActionSettings above): this is a per-PROVIDER-ACCOUNT UI control,
// unrelated to marketplace visibility (platformServices) or the Coffee Owner
// hero icons (heroActionSettings). Uses the same role literals as
// userRoleEnum for these 7 accounts so the mapping is unambiguous.
// Three states, not a boolean: BOTH (toggle visible, account owner picks —
// defaults to dark until they choose light), DARK_ONLY (always dark, no
// toggle), LIGHT_ONLY (always light, no toggle). Defaults to BOTH: dark mode
// is being introduced as a new capability for all 7 accounts, admin can
// restrict it per account afterwards if desired.
// SUPPLIER and ADMIN were added afterwards, once Dark Mode support existed
// for those two areas too — same three-state policy, same table, reusing
// this exact mechanism rather than a second one (see dashboard-layout.tsx,
// which is the shared header/navbar for both).
export const darkModeAccountEnum = pgEnum('dark_mode_account', [
  'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'DELIVERY_COMPANY', 'DRIVER', 'PRINTER', 'MAINTENANCE', 'MARKETING', 'SUPPLIER', 'ADMIN',
]);

export const accountThemeModeEnum = pgEnum('account_theme_mode', ['BOTH', 'DARK_ONLY', 'LIGHT_ONLY']);

export const accountDarkModeSettings = pgTable("account_dark_mode_settings", {
  id: serial("id").primaryKey(),
  account: darkModeAccountEnum("account").notNull().unique(),
  mode: accountThemeModeEnum("mode").notNull().default('BOTH'),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DarkModeAccount = 'BARISTA_ACADEMY' | 'BARISTA_MARKETPLACE' | 'DELIVERY_COMPANY' | 'DRIVER' | 'PRINTER' | 'MAINTENANCE' | 'MARKETING' | 'SUPPLIER' | 'ADMIN';
export type AccountThemeMode = 'BOTH' | 'DARK_ONLY' | 'LIGHT_ONLY';
export type AccountDarkModeSetting = typeof accountDarkModeSettings.$inferSelect;
export type AccountDarkModeSettingsMap = Record<DarkModeAccount, AccountThemeMode>;

// Admin-controlled messaging behavior. This is intentionally separate from
// marketplace service visibility: hiding Messages must never delete data and
// must not remove an admin's ability to manage it.
export const messagingSettings = pgTable("messaging_settings", {
  id: serial("id").primaryKey(),
  globalVisible: boolean("global_visible").notNull().default(true),
  supplierMessagingEnabled: boolean("supplier_messaging_enabled").notNull().default(true),
  maintenanceMessagingEnabled: boolean("maintenance_messaging_enabled").notNull().default(true),
  baristaMessagingEnabled: boolean("barista_messaging_enabled").notNull().default(true),
  academyMessagingEnabled: boolean("academy_messaging_enabled").notNull().default(true),
  broadcastsEnabled: boolean("broadcasts_enabled").notNull().default(true),
  gracePeriodMinutes: integer("grace_period_minutes").notNull().default(30),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Landing page configuration — admin-managed content for hero, sections & footer
export const landingConfig = pgTable("landing_config", {
  id: serial("id").primaryKey(),
  heroSlides: jsonb("hero_slides").$type<{ imageUrl: string; title: string; description: string }[]>().default([]),
  shopImage: text("shop_image"),
  printImage: text("print_image"),
  marketingImage: text("marketing_image"),
  baristaAcademyImage: text("barista_academy_image"),
  baristaMarketplaceImage: text("barista_marketplace_image"),
  maintenanceImage: text("maintenance_image"),
  serviceOrder: jsonb("service_order").$type<MarketplaceServiceId[]>().default(DEFAULT_SERVICE_ORDER),
  footerDescription: text("footer_description"),
  footerEmail: text("footer_email"),
  footerPhone: text("footer_phone"),
  footerFacebook: text("footer_facebook"),
  footerInstagram: text("footer_instagram"),
  footerTiktok: text("footer_tiktok"),
  currency: text("currency").default("DT"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type LandingConfig = typeof landingConfig.$inferSelect;
export type HeroSlide = { imageUrl: string; title: string; description: string };

// Favorites — persisted per-user shop (product) favorites
export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  productId: integer("product_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Supplier Stores ─────────────────────────────────────────────────────────

export const storeApprovalStatusEnum = pgEnum('store_approval_status', ['PENDING', 'APPROVED', 'REJECTED', 'ON_HOLD']);
export const storeVisibilityEnum = pgEnum('store_visibility', ['VISIBLE', 'HIDDEN']);

export const supplierStores = pgTable("supplier_stores", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().unique(),
  coverUrl: text("cover_url"),
  logoUrl: text("logo_url"),
  name: text("name").notNull().default(''),
  description: text("description"),
  isOpen: boolean("is_open").notNull().default(true),
  visibility: storeVisibilityEnum("visibility").notNull().default('VISIBLE'),
  approvalStatus: storeApprovalStatusEnum("approval_status").notNull().default('PENDING'),
  displayOrder: integer("display_order").notNull().default(0),
  autoApprove: boolean("auto_approve").notNull().default(false),
  mediaType: text("media_type").notNull().default('IMAGE'), // 'IMAGE' | 'VIDEO'
  coverUrls: text("cover_urls").array().default([]),        // up to 5 image URLs for slideshow
  videoUrl: text("video_url"),
  musicUrl: text("music_url"),                             // YouTube URL for background music
  openingHours: jsonb("opening_hours"),                    // { monday: {open, close, closed}, ... }
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Supplier product reviews — submitted by cafe owners, shown on supplier reviews tab
export const supplierProductReviews = pgTable("supplier_product_reviews", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id"), // nullable for product-level reviews
  reviewType: text("review_type").notNull().default('SUPPLIER'), // 'PRODUCT' | 'SUPPLIER' | 'PACK' | 'MAINTENANCE' | 'BARISTA_MARKETPLACE' | 'PRINT' | 'ACADEMY' | 'DRIVER' | 'MARKETING' | 'DELIVERY_COMPANY'
  cafeId: integer("cafe_id").notNull(),
  productId: integer("product_id"),
  listingId: integer("listing_id"),
  packId: integer("pack_id"), // for PACK reviews
  maintenanceUserId: integer("maintenance_user_id"), // for MAINTENANCE reviews
  reservationId: integer("reservation_id"), // optional completed intervention link
  baristaMarketplaceUserId: integer("barista_marketplace_user_id"), // for BARISTA_MARKETPLACE reviews
  baristaMissionId: integer("barista_mission_id"), // completed mission this review is for
  printerId: integer("printer_id"), // for PRINT reviews
  printOrderId: integer("print_order_id"), // completed print order this review is for
  academyUserId: integer("academy_user_id"), // for ACADEMY reviews
  academyRegistrationId: integer("academy_registration_id"), // completed registration this review is for
  driverId: integer("driver_id"), // for DRIVER reviews
  deliveryId: integer("delivery_id"), // completed delivery this review is for (DRIVER and DELIVERY_COMPANY reviews)
  // For DELIVERY_COMPANY reviews: the reviewer is a Supplier (not a Cafe Owner —
  // Suppliers are the ones who actually deal with Delivery Companies via the
  // Order Delivery dispatch flow). cafeId/cafeName/cafeOwnerName below already
  // mean "the reviewer" for every other type here, so DELIVERY_COMPANY reuses
  // them the same way (cafeId holds the reviewing Supplier's user id) rather
  // than adding a parallel reviewer-identity column.
  deliveryCompanyUserId: integer("delivery_company_user_id"), // for DELIVERY_COMPANY reviews
  marketingUserId: integer("marketing_user_id"), // for MARKETING reviews
  marketingProjectId: integer("marketing_project_id"), // completed project this review is for
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  cafeName: text("cafe_name").notNull().default(''),
  cafeOwnerName: text("cafe_owner_name").notNull().default(''),
  productName: text("product_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Reporting
  reportedAt: timestamp("reported_at"),
  reportReason: text("report_reason"),
  resolvedAt: timestamp("resolved_at"),
});

// Store favorites — persisted per-user store favorites (separate from product favorites)
export const storeFavorites = pgTable("store_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  storeId: integer("store_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Barista Marketplace ─────────────────────────────────────────────────────
// Mirrors the Maintenance marketplace pattern (maintenanceProfiles/
// maintenanceReservations above) field-for-field, adapted to Barista semantics:
// a public marketplace profile, an admin-managed skills taxonomy (replacing the
// two independently-hardcoded BARISTA_SPECIALTIES lists), a recruitment request
// lifecycle, and a mission created only from an accepted request. Reviews reuse
// supplierProductReviews (reviewType='BARISTA_MARKETPLACE') exactly like
// Maintenance did, rather than a new review table.

export const baristaLevelEnum = pgEnum('barista_level', ['BEGINNER', 'ADVANCED', 'EXPERT']);
export const baristaRequestStatusEnum = pgEnum('barista_request_status', [
  'PENDING', 'DISCUSSION', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED',
]);
export const baristaMissionStatusEnum = pgEnum('barista_mission_status', [
  'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED',
]);

// Admin-managed skills taxonomy — single source of truth for Barista Marketplace
// skills, replacing the hardcoded BARISTA_SPECIALTIES copies in landing-page.tsx and
// admin/users-page.tsx. Mirrors maintenanceCompetencies exactly.
export const baristaSkills = pgTable("barista_skills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Public marketplace profile — one per BARISTA_MARKETPLACE user. users.name/phone/
// locationAddress remain the canonical source for identity/contact/location; this
// table only stores fields the generic users table has no place for.
export const baristaMarketplaceProfiles = pgTable("barista_marketplace_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  level: baristaLevelEnum("level").notNull().default('BEGINNER'),
  bio: text("bio").notNull().default(""),
  skills: text("skills").array().notNull().default([]),
  dailyRateInCents: integer("daily_rate_in_cents").notNull().default(0),
  // Explicit short display city (e.g. "Tunis"), independent of the full geocoded
  // users.locationAddress — mirrors maintenanceProfiles.coverageArea.
  city: text("city").notNull().default(""),
  // Weekly recurring availability, e.g. ['Lun','Mar','Mer'] — matches the labels
  // already used across the app's date displays.
  availableDays: text("available_days").array().notNull().default([]),
  // Per-day schedule (Barista availability update) — same { monday: {open,
  // close, closed}, ... } shape as supplierStores.openingHours and
  // maintenanceProfiles.weeklyHours (see OpeningHoursMap), reused rather than
  // inventing a parallel type. Nullable: falls back to availableDays until the
  // Barista saves a per-day schedule for the first time.
  weeklyHours: jsonb("weekly_hours").$type<OpeningHoursMap | null>(),
  isAvailable: boolean("is_available").notNull().default(true),
  isOnVacation: boolean("is_on_vacation").notNull().default(false),
  marketplaceVisible: boolean("marketplace_visible").notNull().default(true),
  // Certifications & expérience section (Barista Marketplace → Profil public) — real,
  // Barista-entered values only, never hardcoded examples.
  certifications: text("certifications").array().notNull().default([]),
  experienceYears: integer("experience_years"), // nullable — no fabricated default
  portfolioUrls: text("portfolio_urls").array().notNull().default([]),
  // isFrozen convention already used on maintenanceProfiles/marketingProfiles above —
  // admin-only account freeze, distinct from the Barista's own isOnVacation toggle.
  isFrozen: boolean("is_frozen").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Previous café / work-experience entries — one row per employer, own table (not a jsonb
// blob) so entries can be added/removed individually like every other list-of-records
// pattern in this schema (e.g. baristaSkills, vehicles).
export const baristaWorkHistory = pgTable("barista_work_history", {
  id: serial("id").primaryKey(),
  baristaUserId: integer("barista_user_id").notNull(),
  cafeName: text("cafe_name").notNull(),
  role: text("role").notNull().default(""),
  startPeriod: text("start_period").notNull().default(""), // free text (e.g. "2022" or "Jan 2022"), matches this schema's existing free-text date convention
  endPeriod: text("end_period"), // nullable — null means "current"
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  baristaUserIdx: index("barista_work_history_user_idx").on(table.baristaUserId),
}));

export type BaristaWorkHistory = typeof baristaWorkHistory.$inferSelect;
export type InsertBaristaWorkHistory = typeof baristaWorkHistory.$inferInsert;

// Barista favorites — mirrors maintenanceFavorites exactly (same shape, same
// dedicated-table pattern) so Coffee Owner favorites persist and stay in sync
// with the public /barista marketplace.
export const baristaMarketplaceFavorites = pgTable("barista_marketplace_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  baristaUserId: integer("barista_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Recruitment request — Café Owner → Barista. One row per request; a mission is
// created only once a request reaches ACCEPTED (see baristaMarketplaceMissions).
export const baristaMarketplaceRequests = pgTable("barista_marketplace_requests", {
  id: serial("id").primaryKey(),
  cafeOwnerId: integer("cafe_owner_id").notNull(),
  baristaUserId: integer("barista_user_id").notNull(),
  missionType: text("mission_type").notNull().default(""), // e.g. "Barista temps plein", free text like maintenance's `service` field
  message: text("message").notNull().default(""),
  proposedRateInCents: integer("proposed_rate_in_cents"), // nullable — falls back to the barista's current daily rate if unset
  startDate: text("start_date").notNull(), // matches maintenanceReservations' text-based date convention
  endDate: text("end_date"), // nullable — single-day requests need only startDate
  status: baristaRequestStatusEnum("status").notNull().default('PENDING'),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  cafeOwnerIdx: index("barista_requests_cafe_owner_idx").on(table.cafeOwnerId),
  baristaUserIdx: index("barista_requests_barista_user_idx").on(table.baristaUserId),
  statusIdx: index("barista_requests_status_idx").on(table.status),
}));

// Mission — created exactly once, when a request is accepted (storage enforces this
// server-side; see storage.acceptBaristaRequest). requestId is unique so a request
// can never produce two missions.
export const baristaMarketplaceMissions = pgTable("barista_marketplace_missions", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().unique(),
  cafeOwnerId: integer("cafe_owner_id").notNull(),
  baristaUserId: integer("barista_user_id").notNull(),
  missionType: text("mission_type").notNull().default(""),
  rateInCents: integer("rate_in_cents").notNull().default(0),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: baristaMissionStatusEnum("status").notNull().default('UPCOMING'),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
}, (table) => ({
  cafeOwnerIdx: index("barista_missions_cafe_owner_idx").on(table.cafeOwnerId),
  baristaUserIdx: index("barista_missions_barista_user_idx").on(table.baristaUserId),
  statusIdx: index("barista_missions_status_idx").on(table.status),
}));

// Entity-level report — a Coffee Owner flagging a Barista account itself (fraud,
// no-show, abusive behavior, etc.), distinct from review-reporting (reportedAt/
// reportReason on supplierProductReviews, which is a reviewed party disputing a
// specific review about them). Resolved centrally by Admin, mirroring the same
// reportedAt/resolvedAt shape used for reviews so the moderation shape is familiar,
// but kept in its own table since it targets an account, not a review row.
export const baristaReportStatusEnum = pgEnum('barista_report_status', ['PENDING', 'RESOLVED', 'DISMISSED']);

export const baristaReports = pgTable("barista_reports", {
  id: serial("id").primaryKey(),
  cafeOwnerId: integer("cafe_owner_id").notNull(),
  baristaUserId: integer("barista_user_id").notNull(),
  reason: text("reason").notNull(),
  status: baristaReportStatusEnum("status").notNull().default('PENDING'),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
}, (table) => ({
  baristaUserIdx: index("barista_reports_barista_user_idx").on(table.baristaUserId),
  statusIdx: index("barista_reports_status_idx").on(table.status),
}));
export type BaristaReport = typeof baristaReports.$inferSelect;
export type InsertBaristaReport = typeof baristaReports.$inferInsert;
export const insertBaristaReportSchema = createInsertSchema(baristaReports).omit({ id: true, createdAt: true, resolvedAt: true });

export type BaristaLevel = 'BEGINNER' | 'ADVANCED' | 'EXPERT';
export type BaristaRequestStatus = 'PENDING' | 'DISCUSSION' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
export type BaristaMissionStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type BaristaSkill = typeof baristaSkills.$inferSelect;
export type BaristaMarketplaceProfile = typeof baristaMarketplaceProfiles.$inferSelect;
export type InsertBaristaMarketplaceProfile = typeof baristaMarketplaceProfiles.$inferInsert;
export type BaristaMarketplaceRequest = typeof baristaMarketplaceRequests.$inferSelect;
export type InsertBaristaMarketplaceRequest = typeof baristaMarketplaceRequests.$inferInsert;
export type BaristaMarketplaceMission = typeof baristaMarketplaceMissions.$inferSelect;

// Public marketplace card — what /barista actually renders. Rating/reviewCount are
// always computed live from supplierProductReviews (mirrors getMaintenanceProfiles'
// approach exactly) rather than stored, so there is never a stale aggregate to
// forget to update.
export type BaristaMarketplaceCard = BaristaMarketplaceProfile & {
  userId: number;
  name: string;
  phone: string | null;
  profileImageUrl: string | null;
  coverImageUrl?: string | null;
  initials: string;
  location: string;
  available: boolean;
  rating: number; // 0-50, i.e. x10 (mirrors maintenanceProfiles.rating convention)
  reviewCount: number;
  workHistory: BaristaWorkHistory[];
  // Haversine distance (km) between the viewing Coffee Owner's stored location and this
  // Barista's — null when either party has no valid coordinates (never fabricated).
  distanceKm?: number | null;
};

export type BaristaRequestWithParties = BaristaMarketplaceRequest & {
  cafeOwnerName: string;
  cafeOwnerPhone: string | null;
  baristaName: string;
  baristaPhone: string | null;
};

export type BaristaMissionWithParties = BaristaMarketplaceMission & {
  cafeOwnerName: string;
  baristaName: string;
};

// ── Barista Academy ──────────────────────────────────────────────────────────
// Mirrors the Barista Marketplace pattern above field-for-field, adapted to
// Academy semantics: a public academy profile, a course ("formation") catalog
// each academy manages itself, sessions (dates) per course for the calendar,
// and a registration ("inscription") lifecycle instead of a request/mission
// pair — an Academy course can run multiple times, so "book a spot" maps
// naturally to one registration record rather than Barista's request→mission
// two-step. Reviews reuse supplierProductReviews (reviewType='ACADEMY') exactly
// like BARISTA_MARKETPLACE and PRINT did — see the new academyUserId/
// academyRegistrationId columns added to that table below.

export const academyCourseLevelEnum = pgEnum('academy_course_level', ['BEGINNER', 'ADVANCED', 'EXPERT']);
export const academyRegistrationStatusEnum = pgEnum('academy_registration_status', ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']);
export const academySessionStatusEnum = pgEnum('academy_session_status', ['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED']);

// Public academy profile — one per BARISTA_ACADEMY user. users.name/phone/
// profileImageUrl/locationAddress remain canonical for identity/contact/
// location (mirrors baristaMarketplaceProfiles' own note); this table only
// stores fields the generic users table has no place for.
export const academyProfiles = pgTable("academy_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  description: text("description").notNull().default(""),
  marketplaceVisible: boolean("marketplace_visible").notNull().default(true),
  // Institution-level weekly opening hours — same { monday: {open, close, closed}, ... }
  // shape as maintenanceProfiles.weeklyHours/marketingProfiles.weeklyHours (see
  // OpeningHoursMap below), reused rather than inventing a parallel type. Distinct from
  // academyCourseSessions (which schedule real course RUNS) — this is the academy's own
  // general "open for business" hours, same concept every other synchronized service
  // account already exposes in Settings → Disponibilité. Nullable: no schedule set yet.
  weeklyHours: jsonb("weekly_hours").$type<OpeningHoursMap | null>(),
  isOnVacation: boolean("is_on_vacation").notNull().default(false),
  // Profile → Portfolio (max 4 enforced at the API layer) — same shape/convention as
  // maintenanceProfiles/marketingProfiles/deliveryCompanyProfiles.portfolioImages.
  portfolioImages: text("portfolio_images").array().notNull().default([]),
  // isFrozen convention already used on maintenanceProfiles/marketingProfiles above —
  // admin-only account freeze, distinct from the Academy's own isOnVacation toggle.
  isFrozen: boolean("is_frozen").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// A "formation" — one course an academy offers. Publication (isPublished) is
// the academy's own publish/unpublish control; the public /academy marketplace
// only ever lists published courses from approved academies (mirrors
// baristaMarketplaceProfiles.marketplaceVisible + users.status='approved').
export const academyCourses = pgTable("academy_courses", {
  id: serial("id").primaryKey(),
  academyUserId: integer("academy_user_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  level: academyCourseLevelEnum("level").notNull().default('BEGINNER'),
  priceInCents: integer("price_in_cents").notNull().default(0),
  duration: text("duration").notNull().default(""), // free text, e.g. "3 jours" — matches baristaMarketplaceRequests.missionType's free-text convention
  hasCertification: boolean("has_certification").notNull().default(false),
  category: text("category").notNull().default(""), // free text course type, e.g. "Espresso", "Management"
  location: text("location").notNull().default(""),
  trainingMode: text("training_mode").notNull().default("Présentiel"), // free text: Présentiel / En ligne / Hybride
  capacity: integer("capacity"), // nullable = unlimited
  imageUrl: text("image_url"),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  academyUserIdx: index("academy_courses_academy_user_idx").on(table.academyUserId),
}));

// A scheduled date/run of a course — what the Calendrier tab and registration
// session picker are built on. capacity is nullable and falls back to the
// parent course's capacity when unset.
export const academyCourseSessions = pgTable("academy_course_sessions", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  academyUserId: integer("academy_user_id").notNull(), // denormalized for admin/query convenience, mirrors baristaMarketplaceMissions' own denorm of cafeOwnerId/baristaUserId
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  capacity: integer("capacity"),
  status: academySessionStatusEnum("status").notNull().default('UPCOMING'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  courseIdx: index("academy_sessions_course_idx").on(table.courseId),
  academyUserIdx: index("academy_sessions_academy_user_idx").on(table.academyUserId),
}));

// A Coffee Owner's registration ("inscription") for a course, optionally tied
// to a specific session. One row is the single synchronized source of truth
// read by the Academy account, the Coffee Owner and Admin alike — no separate
// copies (mirrors baristaMarketplaceRequests' own "one row, three readers" note).
// participantType distinguishes who registered — a Coffee Owner (registering
// their business, possibly for multiple employees) or a Barista Marketplace
// professional (registering themselves, for their own professional
// development via Espace Barista Marketplace → Academy). cafeOwnerId is kept
// as the literal column name for backward compatibility with every existing
// query/route/UI built against it, but semantically now holds "the
// registrant's user id" regardless of participantType — never rename it
// without updating every reference across storage.ts/routes.ts and both
// account UIs. This is the SAME registration model both participant types
// share (one row, one source of truth for Academy/Admin/the registrant) —
// deliberately not a second table, per the "reuse the existing model" rule.
export const academyRegistrationParticipantTypeEnum = pgEnum('academy_registration_participant_type', ['CAFE_OWNER', 'BARISTA_MARKETPLACE']);

export const academyRegistrations = pgTable("academy_registrations", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  sessionId: integer("session_id"), // nullable — a course may not require picking a specific session
  academyUserId: integer("academy_user_id").notNull(), // denormalized, mirrors academyCourseSessions.academyUserId
  cafeOwnerId: integer("cafe_owner_id").notNull(), // the registrant's user id — see participantType note above
  participantType: academyRegistrationParticipantTypeEnum("participant_type").notNull().default('CAFE_OWNER'),
  participantCount: integer("participant_count").notNull().default(1),
  participants: text("participants").array().notNull().default([]), // optional participant names, entered by the registrant
  priceInCents: integer("price_in_cents").notNull().default(0), // snapshot: course.priceInCents × participantCount at registration time
  status: academyRegistrationStatusEnum("status").notNull().default('PENDING'),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
  cancelledAt: timestamp("cancelled_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  courseIdx: index("academy_registrations_course_idx").on(table.courseId),
  academyUserIdx: index("academy_registrations_academy_user_idx").on(table.academyUserId),
  cafeOwnerIdx: index("academy_registrations_cafe_owner_idx").on(table.cafeOwnerId),
  statusIdx: index("academy_registrations_status_idx").on(table.status),
}));

export type AcademyCourseLevel = 'BEGINNER' | 'ADVANCED' | 'EXPERT';
export type AcademyRegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
export type AcademySessionStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

// Coffee Owner favorites over Academy formations (courses) — mirrors
// maintenanceFavorites/marketingFavorites exactly (same shape, same
// persistence pattern), but keyed by courseId rather than a provider id since
// a Coffee Owner browses/saves individual formations, not the Academy itself.
export const academyFavorites = pgTable("academy_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  courseId: integer("course_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Entity-level report ("Blacklist") — a Coffee Owner flagging an Academy
// account itself, mirrors marketingReports/maintenanceReports/baristaReports
// exactly (own table, own service scope, never shared with another service's
// blacklist).
export const academyReportStatusEnum = pgEnum('academy_report_status', ['PENDING', 'RESOLVED', 'DISMISSED']);

export const academyReports = pgTable("academy_reports", {
  id: serial("id").primaryKey(),
  cafeOwnerId: integer("cafe_owner_id").notNull(),
  academyUserId: integer("academy_user_id").notNull(),
  reason: text("reason").notNull(),
  status: academyReportStatusEnum("status").notNull().default('PENDING'),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
}, (table) => ({
  academyUserIdx: index("academy_reports_academy_user_idx").on(table.academyUserId),
  statusIdx: index("academy_reports_status_idx").on(table.status),
}));

export const insertAcademyFavoriteSchema = createInsertSchema(academyFavorites).omit({ id: true, createdAt: true });
export const insertAcademyReportSchema = createInsertSchema(academyReports).omit({ id: true, createdAt: true, resolvedAt: true });

export type AcademyProfile = typeof academyProfiles.$inferSelect;
export type InsertAcademyProfile = typeof academyProfiles.$inferInsert;
export type AcademyCourse = typeof academyCourses.$inferSelect;
export type InsertAcademyCourse = typeof academyCourses.$inferInsert;
export type AcademyCourseSession = typeof academyCourseSessions.$inferSelect;
export type InsertAcademyCourseSession = typeof academyCourseSessions.$inferInsert;
export type AcademyRegistration = typeof academyRegistrations.$inferSelect;
export type InsertAcademyRegistration = typeof academyRegistrations.$inferInsert;
export type AcademyFavorite = typeof academyFavorites.$inferSelect;
export type AcademyReport = typeof academyReports.$inferSelect;
export type InsertAcademyReport = typeof academyReports.$inferInsert;

// Public marketplace card — what /academy actually renders. Rating/reviewCount
// are always computed live from supplierProductReviews (mirrors
// BaristaMarketplaceCard's own approach) rather than stored. academyXxx fields
// beyond name/location surface the Academy's own public profile (Espace
// Barista Academy → Profil Public) so the card/modal never need a second
// fetch — same reasoning as MarketingMarketplaceCard's card shape.
export type AcademyCourseCard = AcademyCourse & {
  academyName: string;
  academyLocation: string;
  academyProfileImageUrl: string | null;
  academyDescription: string;
  academyPhone: string | null;
  rating: number; // 0-50, i.e. x10
  reviewCount: number;
  distanceKm?: number | null;
};

export type AcademyRegistrationWithParties = AcademyRegistration & {
  cafeOwnerName: string;
  academyName: string;
  courseTitle: string;
  sessionStartDate: string | null;
  sessionEndDate: string | null;
};

export type AcademyCourseSessionWithCourse = AcademyCourseSession & {
  courseTitle: string;
  registeredCount: number;
};

// ── Packs ────────────────────────────────────────────────────────────────────
// A Pack bundles one or more of a supplier's own product listings into a single
// sellable offer. Taxonomy (category/subcategory/brand) is always derived from
// the included products — never stored/selected manually.

export const packVisibilityEnum = pgEnum('pack_visibility', ['VISIBLE', 'HIDDEN']);

export const packs = pgTable("packs", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  // Up to four normal Pack images. imageUrl remains the legacy primary image.
  imageUrls: text("image_urls").array(),
  // Separate image used only by Flash mode.
  flashImageUrl: text("flash_image_url"),
  price: integer("price").notNull().default(0),
  quantityAvailable: integer("quantity_available").notNull().default(0),
  expirationDate: timestamp("expiration_date"),
  visibility: packVisibilityEnum("visibility").notNull().default('VISIBLE'),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Pack items — which listing (and optional specific variant) makes up a Pack, and how many units.
export const packItems = pgTable("pack_items", {
  id: serial("id").primaryKey(),
  packId: integer("pack_id").notNull(),
  listingId: integer("listing_id").notNull(),
  variantId: integer("variant_id"),
  // Selected flavor ids within the representative variant's size group.
  // NULL keeps legacy Packs compatible by meaning "all flavors in the group".
  flavorIds: integer("flavor_ids").array(),
  quantity: integer("quantity").notNull().default(1),
  packVariantPrice: integer("pack_variant_price").notNull().default(0),
});

// Pack favorites — persisted per-user, mirrors store_favorites / favorites pattern.
export const packFavorites = pgTable("pack_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  packId: integer("pack_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Maintenance marketplace profiles — the single public source of truth for
// Maintenance accounts shown to Coffee Owners.
export const maintenanceProfiles = pgTable("maintenance_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  jobTitle: text("job_title").notNull().default("Technicien de maintenance"),
  profileType: text("profile_type").notNull().default("Freelance"),
  categories: text("categories").array().notNull().default([]),
  skills: text("skills").array().notNull().default([]),
  certifications: text("certifications").array().notNull().default([]),
  yearsExperience: integer("years_experience").notNull().default(0),
  responseTime: text("response_time").notNull().default("< 24h"),
  dailyRateInCents: integer("daily_rate_in_cents").notNull().default(0),
  description: text("description").notNull().default(""),
  portfolioImages: text("portfolio_images").array().notNull().default([]),
  coverageArea: text("coverage_area").notNull().default(""),
  workingDays: text("working_days").array().notNull().default([]),
  startTime: text("start_time").notNull().default("08:00"),
  endTime: text("end_time").notNull().default("18:00"),
  // Per-day schedule (Part 2) — same { monday: {open, close, closed}, ... }
  // shape as supplierStores.openingHours (see OpeningHoursMap below), reused
  // rather than inventing a parallel type. Nullable: falls back to the legacy
  // workingDays/startTime/endTime fields above (kept, not removed) until the
  // Maintenance professional saves a per-day schedule for the first time.
  weeklyHours: jsonb("weekly_hours").$type<OpeningHoursMap | null>(),
  isAvailable: boolean("is_available").notNull().default(true),
  isOnVacation: boolean("is_on_vacation").notNull().default(false),
  marketplaceVisible: boolean("marketplace_visible").notNull().default(true),
  // Admin-only override — distinct from marketplaceVisible (the Maintenance
  // user's own self-service toggle, see PATCH /api/maintenance/profile) so a
  // freeze can't be silently undone by the account itself, mirroring the
  // isFrozen convention already used on maintenanceCompetencies/-Zones above.
  isFrozen: boolean("is_frozen").notNull().default(false),
  rating: integer("rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const maintenanceFavorites = pgTable("maintenance_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  maintenanceUserId: integer("maintenance_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const maintenanceReservations = pgTable("maintenance_reservations", {
  id: serial("id").primaryKey(),
  maintenanceUserId: integer("maintenance_user_id").notNull(),
  cafeOwnerId: integer("cafe_owner_id").notNull(),
  service: text("service").notNull(),
  date: text("date").notNull(),
  time: text("time"),
  location: text("location").notNull().default(""),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default(""),
  urgency: text("urgency").notNull().default("NORMAL"),
  contactPhone: text("contact_phone").notNull().default(""),
  status: text("status").notNull().default("PENDING"),
  proposedDate: text("proposed_date"),
  proposedTime: text("proposed_time"),
  // Admin-only administrative flag (Part 9's reservation "FREEZE" action) — does
  // NOT participate in the PENDING/CONFIRMED/COMPLETED/CANCELLED/RESCHEDULE_*
  // state machine, so it can never cause an invalid status transition; it just
  // marks a reservation as held for review.
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin-managed Maintenance taxonomy. Profile/reservation history keeps its
// original text values, so freezing or removing a taxonomy item never
// invalidates historical records.
export const maintenanceCompetencies = pgTable("maintenance_competencies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  // Free-text emoji icon — same convention as categories/subCategories/flavors/
  // sizes/brands (shared/schema.ts, all `icon: text("icon")`), rendered directly
  // as a <span>, not a lucide icon-name lookup. Nullable: existing skills without
  // one keep working and fall back to a generic icon client-side.
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const maintenanceZones = pgTable("maintenance_zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Entity-level report — a Coffee Owner flagging a Maintenance account itself,
// mirroring baristaReports exactly (own table, own service scope — Part 23's
// "service data separation": a Barista report must never appear in the
// Maintenance blacklist and vice versa). Distinct from review-reporting
// (POST /api/maintenance/reviews/:id/report, the reviewed party disputing a
// specific review — already exists and is untouched by this).
export const maintenanceReportStatusEnum = pgEnum('maintenance_report_status', ['PENDING', 'RESOLVED', 'DISMISSED']);

export const maintenanceReports = pgTable("maintenance_reports", {
  id: serial("id").primaryKey(),
  cafeOwnerId: integer("cafe_owner_id").notNull(),
  maintenanceUserId: integer("maintenance_user_id").notNull(),
  reason: text("reason").notNull(),
  status: maintenanceReportStatusEnum("status").notNull().default('PENDING'),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
}, (table) => ({
  maintenanceUserIdx: index("maintenance_reports_maintenance_user_idx").on(table.maintenanceUserId),
  statusIdx: index("maintenance_reports_status_idx").on(table.status),
}));
export type MaintenanceReport = typeof maintenanceReports.$inferSelect;
export type InsertMaintenanceReport = typeof maintenanceReports.$inferInsert;
export const insertMaintenanceReportSchema = createInsertSchema(maintenanceReports).omit({ id: true, createdAt: true, resolvedAt: true });

// ── MARKETING ────────────────────────────────────────────────────────────────
// Mirrors Maintenance's shape (one profile per provider, a flat starting price)
// rather than Print's catalog-of-items shape, since a Marketing provider's real
// offering is closer to Maintenance's "book my time for a service" model.
// marketingProjects covers the whole request → quote → active project →
// completion lifecycle in one table (same reasoning as maintenanceReservations
// and academyRegistrations: one lifecycle table, not separate "requests" /
// "projects" / "invoices" tables) — Devis & Factures and Clients are views over
// this same table (grouped/filtered client-side), not parallel financial or
// relationship systems, matching Print's own "Factures" page (a filtered view
// over printOrders, not a separate invoice table).

export const marketingProfiles = pgTable("marketing_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  profileType: text("profile_type").notNull().default("Agency"), // 'Agency' | 'Freelancer' | 'Studio'
  categories: text("categories").array().notNull().default([]), // offered services, from marketingCategoryTaxonomy names
  responseTime: text("response_time").notNull().default("< 24h"),
  startingPriceInCents: integer("starting_price_in_cents").notNull().default(0),
  description: text("description").notNull().default(""),
  portfolioImages: text("portfolio_images").array().notNull().default([]), // max 10, enforced at the API layer
  websiteUrl: text("website_url"),
  // Same { monday: {open, close, closed}, ... } shape as maintenanceProfiles.weeklyHours /
  // supplierStores.openingHours (see OpeningHoursMap below), reused rather than inventing
  // a parallel type. Nullable: no availability set yet.
  weeklyHours: jsonb("weekly_hours").$type<OpeningHoursMap | null>(),
  isAvailable: boolean("is_available").notNull().default(true),
  isOnVacation: boolean("is_on_vacation").notNull().default(false),
  marketplaceVisible: boolean("marketplace_visible").notNull().default(true),
  // Admin-only override — distinct from marketplaceVisible, same convention as
  // maintenanceProfiles.isFrozen (a freeze can't be silently undone by the account itself).
  isFrozen: boolean("is_frozen").notNull().default(false),
  rating: integer("rating").notNull().default(0), // x10 convention, e.g. 47 = 4.7
  reviewCount: integer("review_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const marketingProjects = pgTable("marketing_projects", {
  id: serial("id").primaryKey(),
  marketingUserId: integer("marketing_user_id").notNull(),
  cafeOwnerId: integer("cafe_owner_id").notNull(),
  service: text("service").notNull(), // category name at request time
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  // Lifecycle: PENDING (new request) → QUOTED (provider sent a devis) →
  // ACCEPTED (owner accepted the quote, active project) → IN_PROGRESS →
  // COMPLETED | CANCELLED | REJECTED (owner rejected the quote).
  status: text("status").notNull().default("PENDING"),
  quoteAmountInCents: integer("quote_amount_in_cents"), // set when status becomes QUOTED
  finalAmountInCents: integer("final_amount_in_cents"), // set on COMPLETED — the "facture" amount
  progress: integer("progress").notNull().default(0), // 0-100, provider-updatable while IN_PROGRESS
  startDate: text("start_date"),
  deadline: text("deadline"),
  isFrozen: boolean("is_frozen").notNull().default(false), // admin-only, mirrors maintenanceReservations.isFrozen
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  providerIdx: index("marketing_projects_provider_idx").on(table.marketingUserId),
  ownerIdx: index("marketing_projects_owner_idx").on(table.cafeOwnerId),
  statusIdx: index("marketing_projects_status_idx").on(table.status),
}));

// Admin-managed Marketing taxonomy (Website/SEO/Ads/Social/Vidéo/Photo/Branding)
// — flat list, same shape as maintenanceCompetencies (Marketing services don't
// have a category→subcategory split the way Print does).
export const marketingCategoryTaxonomy = pgTable("marketing_category_taxonomy", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  icon: text("icon"), // free-text emoji, same convention as maintenanceCompetencies.icon
  isActive: boolean("is_active").notNull().default(true),
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Entity-level report — mirrors maintenanceReports exactly (own table, own
// service scope — never shared with another service's blacklist).
export const marketingReportStatusEnum = pgEnum('marketing_report_status', ['PENDING', 'RESOLVED', 'DISMISSED']);

export const marketingReports = pgTable("marketing_reports", {
  id: serial("id").primaryKey(),
  cafeOwnerId: integer("cafe_owner_id").notNull(),
  marketingUserId: integer("marketing_user_id").notNull(),
  reason: text("reason").notNull(),
  status: marketingReportStatusEnum("status").notNull().default('PENDING'),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
}, (table) => ({
  marketingUserIdx: index("marketing_reports_marketing_user_idx").on(table.marketingUserId),
  statusIdx: index("marketing_reports_status_idx").on(table.status),
}));

// Marketing favorites — mirrors maintenanceFavorites exactly (same shape,
// same persistence pattern). Task A left this out of scope; the Coffee Owner
// side only ever had a client-only Zustand entry with no DB-backed hydrate,
// so favorites silently didn't survive a reload. Added here to match every
// other service's favorites behavior.
// serviceId (Agency → Multiple Services task): now that /marketing lists
// individual services rather than agencies, a favorite should reference the
// specific service where possible — nullable so pre-existing agency-level
// favorites keep working unchanged (never destroyed), lazily resolved to a
// real service by storage.getMarketingFavoritesByUser (see the migration
// note on marketingServices below). marketingUserId is kept alongside for
// the agency relationship, never removed.
export const marketingFavorites = pgTable("marketing_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  marketingUserId: integer("marketing_user_id").notNull(),
  serviceId: integer("service_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// A single service offered by a Marketing agency (Agency → Multiple Services,
// mirrors academyCourses field-for-field, same "one profile + many offerings"
// split already proven for Academy Profile + Formations). Before this, an
// agency's category/price/responseTime/description lived as ONE flat set of
// fields directly on marketingProfiles — genuinely agency-level fields
// (description/website/portfolio/availability/visibility) stay there
// untouched; category/price/responseTime/description/image move here, one row
// per service, so an agency can offer Ads, Branding and Photo as three
// separate real, independently priced/described/imaged services instead of
// one combined blob. isPublished mirrors academyCourses.isPublished exactly
// (the agency's own publish/unpublish control — the public /marketing
// marketplace only ever lists published services from approved, visible
// agencies, same rule academyCourses/getPublishedAcademyCourses already uses).
export const marketingServices = pgTable("marketing_services", {
  id: serial("id").primaryKey(),
  marketingUserId: integer("marketing_user_id").notNull(),
  category: text("category").notNull(), // from marketingCategoryTaxonomy, same taxonomy — never a second one
  startingPriceInCents: integer("starting_price_in_cents").notNull().default(0),
  responseTime: text("response_time").notNull().default("< 24h"),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  providerIdx: index("marketing_services_provider_idx").on(table.marketingUserId),
}));
export type MarketingService = typeof marketingServices.$inferSelect;
export type InsertMarketingService = typeof marketingServices.$inferInsert;
export const insertMarketingServiceSchema = createInsertSchema(marketingServices).omit({ id: true, createdAt: true, updatedAt: true });

export const insertMarketingProfileSchema = createInsertSchema(marketingProfiles).omit({ id: true, updatedAt: true });
export const insertMarketingProjectSchema = createInsertSchema(marketingProjects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMarketingReportSchema = createInsertSchema(marketingReports).omit({ id: true, createdAt: true, resolvedAt: true });
export const insertMarketingFavoriteSchema = createInsertSchema(marketingFavorites).omit({ id: true, createdAt: true });

export type MarketingProfile = typeof marketingProfiles.$inferSelect;
export type InsertMarketingProfile = z.infer<typeof insertMarketingProfileSchema>;
export type MarketingProject = typeof marketingProjects.$inferSelect;
export type InsertMarketingProject = z.infer<typeof insertMarketingProjectSchema>;
export type MarketingReport = typeof marketingReports.$inferSelect;
export type InsertMarketingReport = typeof marketingReports.$inferInsert;
export type MarketingFavorite = typeof marketingFavorites.$inferSelect;
export type MarketingCategory = typeof marketingCategoryTaxonomy.$inferSelect;

/** Agency-level card — the agency's own identity/description/website/portfolio/
 *  availability/visibility, used by the Agency Details Modal (Eye preview, the
 *  "Agence" section inside a Service modal, Admin's agency card). Pricing/
 *  category/response-time/service-description/service-image are NOT here
 *  anymore — see MarketingServiceCard below — mirrors MaintenanceMarketplaceCard's
 *  shape structurally, adapted to the Agency/Services split. */
export type MarketingMarketplaceCard = MarketingProfile & {
  userId: number;
  name: string;
  phone: string | null;
  profileImageUrl: string | null;
  coverImageUrl?: string | null;
  location: string;
  initials: string;
  distanceKm?: number | null;
};

/** Public marketplace card shown on Coffee Owner /marketing — one per published
 *  SERVICE (mirrors AcademyCourseCard exactly: a course/formation card carrying
 *  its academy's identity fields alongside it, so the card/modal never need a
 *  second fetch). Real agency identity/rating/reviews are joined in from the
 *  same marketingProfiles/users/supplierProductReviews rows the Agency Details
 *  Modal reads — never a second, disconnected agency representation. */
export type MarketingServiceCard = MarketingService & {
  agencyName: string;
  agencyLocation: string;
  agencyProfileImageUrl: string | null;
  agencyDescription: string;
  agencyWebsiteUrl: string | null;
  agencyProfileType: string;
  agencyIsAvailable: boolean;
  rating: number; // x10, agency-level aggregate — reviews are tied to the agency, not per-service
  reviewCount: number;
  distanceKm?: number | null;
};

// ── PRINT ────────────────────────────────────────────────────────────────────
// Unlike Maintenance/Barista (one profile per provider, a flat day-rate), a
// Printer's real offering is a priced catalog of many distinct items — closer
// in shape to a Supplier's product listings. printCatalogItems is that catalog,
// scoped to the owning Printer (users.id, role='PRINTER') via printerId.
// printOrders mirrors maintenanceReservations for the request/fulfillment
// lifecycle, but — learning from Maintenance's gap (no price field at all,
// see server/storage.ts getMaintenanceAdminOverview comments) — snapshots the
// item name + unit price onto the order at creation time (the same pattern
// Barista uses for baristaMarketplaceMissions.rateInCents), so a later catalog
// price edit never rewrites the price of an already-placed order, and the
// catalog item can be safely deleted later without corrupting order history.
// status reuses orderStatusEnum's values (as plain text, matching subOrders'
// convention of validating a shared status vocabulary via zod rather than a
// hard DB enum) instead of inventing a parallel status system: PENDING →
// CONFIRMED → PREPARING (production) → READY → IN_DELIVERY → DELIVERED, or
// CANCELLED at any point before DELIVERED.
export const printCatalogItems = pgTable("print_catalog_items", {
  id: serial("id").primaryKey(),
  printerId: integer("printer_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  category: text("category").notNull().default(""),
  subCategory: text("sub_category").notNull().default(""),
  priceInCents: integer("price_in_cents").notNull().default(0),
  unit: text("unit").notNull().default("unité"),
  minQuantity: integer("min_quantity").notNull().default(1),
  productionTimeDays: integer("production_time_days").notNull().default(3),
  materials: text("materials").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  printerIdx: index("print_catalog_items_printer_idx").on(table.printerId),
}));

// Print favorites — mirrors maintenanceFavorites exactly (same shape, same
// persistence pattern). References the catalog item (service/product), not
// the printer account, since /print favorites one product at a time (see
// use-favorites.ts's togglePrint, keyed by the catalog item id).
export const printFavorites = pgTable("print_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  printItemId: integer("print_item_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Public printer (company-level) profile — one per PRINTER user, mirrors
// academyProfiles exactly (same minimal shape: users.name/phone/
// profileImageUrl/locationAddress remain canonical for identity/contact/
// location, this table only stores fields the generic users table has no
// place for). Distinct from printCatalogItems (the printer's SERVICES) —
// editing one must never touch the other (see storage.upsertPrinterProfile /
// createPrintCatalogItem, which write to separate tables).
export const printerProfiles = pgTable("printer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  description: text("description").notNull().default(""),
  websiteUrl: text("website_url"),
  marketplaceVisible: boolean("marketplace_visible").notNull().default(true),
  // Company-level weekly opening hours — same { monday: {open, close, closed}, ... }
  // shape as maintenanceProfiles.weeklyHours/marketingProfiles.weeklyHours (see
  // OpeningHoursMap below), reused rather than inventing a parallel type. Nullable: no
  // schedule set yet.
  weeklyHours: jsonb("weekly_hours").$type<OpeningHoursMap | null>(),
  isOnVacation: boolean("is_on_vacation").notNull().default(false),
  // Profile → Portfolio (max 4 enforced at the API layer) — same shape/convention as
  // maintenanceProfiles/marketingProfiles/deliveryCompanyProfiles.portfolioImages.
  portfolioImages: text("portfolio_images").array().notNull().default([]),
  // isFrozen convention already used on maintenanceProfiles/marketingProfiles above —
  // admin-only account freeze, distinct from the Printer's own isOnVacation toggle.
  isFrozen: boolean("is_frozen").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPrinterProfileSchema = createInsertSchema(printerProfiles).omit({ id: true, updatedAt: true });
export type PrinterProfile = typeof printerProfiles.$inferSelect;
export type InsertPrinterProfile = typeof printerProfiles.$inferInsert;

// Admin-managed PRINT category taxonomy — mirrors maintenanceCompetencies
// exactly (id/name/isActive/isFrozen, hard-delete, no referential guard:
// printCatalogItems.category stays plain text so a deleted/renamed taxonomy
// entry never corrupts historical catalog/order data). Named distinctly from
// users.printCategories (an unrelated per-account admin-approval-scope array)
// to avoid confusion between the two concepts.
export const printCategoryTaxonomy = pgTable("print_category_taxonomy", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  // Free-text emoji icon — same convention as maintenanceCompetencies.icon /
  // marketingCategoryTaxonomy.icon (all `icon: text("icon")`), rendered directly
  // as a <span>, not a lucide icon-name lookup. Nullable: existing categories
  // without one fall back to a client-side default map, then a generic icon.
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin-managed PRINT subcategory taxonomy — one level below printCategoryTaxonomy
// (e.g. category "Flyers" → subcategories "A5"/"A4"/"A3"). categoryId is a soft
// reference (no hard FK), matching this codebase's established convention for
// taxonomy tables (see maintenanceCompetencies/maintenanceZones) — printCatalogItems
// keeps plain-text category/subCategory values, so a taxonomy edit/delete never
// corrupts historical catalog/order data.
export const printSubCategoryTaxonomy = pgTable("print_subcategory_taxonomy", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull(),
  name: text("name").notNull(),
  // Same free-text emoji convention as printCategoryTaxonomy.icon above.
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("print_subcategory_taxonomy_category_idx").on(table.categoryId),
  uniqueNamePerCategory: uniqueIndex("print_subcategory_taxonomy_unique").on(table.categoryId, table.name),
}));

// Entity-level report ("Blacklist") — a Coffee Owner flagging a Printer
// account itself, mirrors marketingReports/maintenanceReports/academyReports/
// baristaReports exactly (own table, own service scope).
export const printReportStatusEnum = pgEnum('print_report_status', ['PENDING', 'RESOLVED', 'DISMISSED']);

export const printReports = pgTable("print_reports", {
  id: serial("id").primaryKey(),
  cafeOwnerId: integer("cafe_owner_id").notNull(),
  printerId: integer("printer_id").notNull(),
  reason: text("reason").notNull(),
  status: printReportStatusEnum("status").notNull().default('PENDING'),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
}, (table) => ({
  printerIdx: index("print_reports_printer_idx").on(table.printerId),
  statusIdx: index("print_reports_status_idx").on(table.status),
}));

export const insertPrintReportSchema = createInsertSchema(printReports).omit({ id: true, createdAt: true, resolvedAt: true });

export const printOrders = pgTable("print_orders", {
  id: serial("id").primaryKey(),
  printerId: integer("printer_id").notNull(),
  cafeOwnerId: integer("cafe_owner_id").notNull(),
  catalogItemId: integer("catalog_item_id"), // nullable — survives catalog item deletion
  itemName: text("item_name").notNull(),            // snapshot at order time
  unitPriceInCents: integer("unit_price_in_cents").notNull(), // snapshot at order time
  quantity: integer("quantity").notNull().default(1),
  totalInCents: integer("total_in_cents").notNull(),
  status: text("status").notNull().default("PENDING"),
  notes: text("notes").notNull().default(""),
  deliveryAddress: text("delivery_address"),
  contactPhone: text("contact_phone").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  printerIdx: index("print_orders_printer_idx").on(table.printerId),
  ownerIdx: index("print_orders_owner_idx").on(table.cafeOwnerId),
}));

// ── Promotions ───────────────────────────────────────────────────────────────

export const promotionTypeEnum = pgEnum('promotion_type', [
  'PERCENTAGE',        // % off total or specific products/categories
  'FIXED_AMOUNT',      // fixed DT off
  'BUY_X_GET_Y',       // buy X get Y free
  'QUANTITY_TIER',     // tier pricing (price per unit drops at volume)
  'CATEGORY_DISCOUNT', // % or fixed off specific categories
  'FREE_SHIPPING',     // free shipping above optional min amount
  'GIFT',              // free gift item after min order
  'MIN_ORDER_AMOUNT',  // spend X get Y off
  'MIN_QUANTITY',      // buy X+ items get discount
  'FIRST_ORDER',       // discount on first order from this supplier
]);

export const promotionStatusEnum = pgEnum('promotion_status', [
  'ACTIVE', 'PAUSED', 'SCHEDULED', 'EXPIRED',
]);

export const promotionTargetTypeEnum = pgEnum('promotion_target_type', [
  'ALL',        // all supplier products
  'PRODUCTS',   // specific supplier_product_listings
  'CATEGORIES', // specific product categories
]);

export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  internalNotes: text("internal_notes"),
  type: promotionTypeEnum("type").notNull(),
  status: promotionStatusEnum("status").notNull().default('ACTIVE'),
  priority: integer("priority").notNull().default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  maxUses: integer("max_uses"),
  maxUsesPerCustomer: integer("max_uses_per_customer"),
  usageCount: integer("usage_count").notNull().default(0),
  minimumOrderValue: integer("minimum_order_value"),   // cents
  minimumQuantity: integer("minimum_quantity"),
  maximumDiscount: integer("maximum_discount"),        // cents cap for % discounts
  stackable: boolean("stackable").notNull().default(false),
  // Discount parameters (semantics depend on type)
  discountValue: integer("discount_value").notNull().default(0), // basis points (for %) or cents (for fixed)
  buyQuantity: integer("buy_quantity"),    // BUY_X_GET_Y: X
  getQuantity: integer("get_quantity"),    // BUY_X_GET_Y: Y
  tiers: jsonb("tiers"),                  // QUANTITY_TIER: [{minQty, maxQty?, pricePerUnit}]
  giftInfo: jsonb("gift_info"),           // GIFT: {description, quantity}
  freeShippingMinAmount: integer("free_shipping_min_amount"), // cents, 0 = always free
  // Delivery System V2 Phase 4 — SupplierSubsidyEngine. Only meaningful on a FREE_SHIPPING
  // promotion; null preserves the EXACT pre-Phase-4 behavior (100% supplier-funded delivery)
  // — see storage.resolveSupplierSubsidy. A real percentage (1-99) generalizes today's
  // binary free-shipping into a graduated subsidy without changing any existing promotion's
  // effective behavior (every existing FREE_SHIPPING row has this column null).
  deliverySubsidyPercent: integer("delivery_subsidy_percent"),
  // Targeting
  targetType: promotionTargetTypeEnum("target_type").notNull().default('ALL'),
  targetListingIds: integer("target_listing_ids").array(),
  targetCategoryIds: integer("target_category_ids").array(),
  // Eligibility
  eligibleCafeIds: integer("eligible_cafe_ids").array(), // null = all approved cafes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Per-order usage tracking for promotions (enforces maxUses / maxUsesPerCustomer)
export const promotionUsage = pgTable("promotion_usage", {
  id: serial("id").primaryKey(),
  promotionId: integer("promotion_id").notNull(),
  cafeId: integer("cafe_id").notNull(),
  orderId: integer("order_id").notNull(),
  discountAmount: integer("discount_amount").notNull().default(0), // cents
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Discount Codes ─────────────────────────────────────────────────────────────
// A completely separate mechanism from Promotions above: Promotions apply
// automatically based on eligibility rules, Discount Codes are entered by the
// Coffee Owner at checkout. Never merge/mix the two — see promotions-engine.ts
// and discount-codes-engine.ts, each the single source of truth for its own
// system, both feeding independent columns on subOrders so a historical order
// always preserves exactly which promotion AND/OR which code applied to it.

export const discountCodeTypeEnum = pgEnum('discount_code_type', ['PERCENTAGE', 'FIXED_AMOUNT']);

export const discountCodes = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  // Unique platform-wide (not just per-supplier) — a Coffee Owner enters one code with no
  // other context, so two suppliers issuing the same string would be unresolvable ambiguity.
  code: text("code").notNull().unique(),
  discountType: discountCodeTypeEnum("discount_type").notNull(),
  // Same unit convention as promotions.discountValue: basis points*100 for PERCENTAGE
  // (2000 = 20%), millimes (currency's smallest unit) for FIXED_AMOUNT.
  discountValue: integer("discount_value").notNull().default(0),
  maxUses: integer("max_uses"),               // null = unlimited
  usageCount: integer("usage_count").notNull().default(0),
  minimumOrderAmount: integer("minimum_order_amount"), // millimes; null = no minimum
  expiresAt: timestamp("expires_at"),         // null = never expires
  isActive: boolean("is_active").notNull().default(true), // supplier's own on/off switch
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Per-order usage tracking for discount codes (enforces maxUses, and preserves history)
export const discountCodeUsage = pgTable("discount_code_usage", {
  id: serial("id").primaryKey(),
  discountCodeId: integer("discount_code_id").notNull(),
  cafeId: integer("cafe_id").notNull(),
  orderId: integer("order_id").notNull(),
  subOrderId: integer("sub_order_id").notNull(),
  discountAmount: integer("discount_amount").notNull().default(0), // millimes
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Relations ────────────────────────────────────────────────────────────────

// ── Messaging ────────────────────────────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title"), // null for direct conversations; set for broadcasts
  type: text("type").notNull().default('DIRECT'), // 'DIRECT' | 'BROADCAST'
  service: text("service").notNull().default('SHOP'), // 'SHOP' only for now
  createdByUserId: integer("created_by_user_id").notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  relationshipClosedAt: timestamp("relationship_closed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversationParticipants = pgTable("conversation_participants", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  userId: integer("user_id").notNull(),
  lastReadAt: timestamp("last_read_at"), // null = never read
  hiddenAt: timestamp("hidden_at"), // null = visible; non-null = admin-hidden
  hiddenByUserId: integer("hidden_by_user_id"), // which admin hid this
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  senderId: integer("sender_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Notifications ────────────────────────────────────────────────────────────
// Single coherent notification source for every service — not a per-module table.
// Service classification drives the Coffee Owner modal's tab switcher; dedupeKey
// gives every notification-creation call site a `.onConflictDoNothing()` path
// (same idempotency pattern already used by createDeliveryForSubOrder etc.),
// so retries/reconnects/duplicate WS listeners can never double-insert.

export const notificationServiceEnum = pgEnum('notification_service', ['ADMIN', 'SHOP', 'PRINT', 'MAINTENANCE', 'BARISTA', 'ACADEMY', 'MARKETING']);
export const notificationPriorityEnum = pgEnum('notification_priority', ['INFO', 'SUCCESS', 'WARNING', 'URGENT']);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  service: notificationServiceEnum("service").notNull(),
  type: text("type").notNull(),
  priority: notificationPriorityEnum("priority").notNull().default('INFO'),
  title: text("title").notNull(),
  message: text("message").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  dedupeKey: text("dedupe_key"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("notifications_user_id_idx").on(table.userId),
  userReadIdx: index("notifications_user_read_idx").on(table.userId, table.isRead),
  userServiceIdx: index("notifications_user_service_idx").on(table.userId, table.service),
  dedupeKeyUnique: uniqueIndex("notifications_dedupe_key_unique").on(table.dedupeKey),
}));

export const usersRelations = relations(users, ({ many, one }) => ({
  supplierProducts: many(products, { relationName: 'supplierProducts' }),
  cafeOrders: many(orders, { relationName: 'cafeOrders' }),
  supplierOrders: many(orders, { relationName: 'supplierOrders' }),
  deliveryOrders: many(orders, { relationName: 'deliveryOrders' }),
  supplierCategories: many(supplierCategories),
  supplierSubCategories: many(supplierSubCategories),
  supplierProductListings: many(supplierProductListings),
  // Delivery domain
  drivers: many(users, { relationName: 'companyDrivers' }),
  deliveryCompany: one(users, { fields: [users.deliveryCompanyId], references: [users.id], relationName: 'companyDrivers' }),
  ownSupplierDrivers: many(users, { relationName: 'supplierOwnDrivers' }),
  ownerSupplier: one(users, { fields: [users.supplierId], references: [users.id], relationName: 'supplierOwnDrivers' }),
  supplierDeliveries: many(deliveries, { relationName: 'supplierDeliveries' }),
  cafeDeliveries: many(deliveries, { relationName: 'cafeDeliveries' }),
  companyDeliveries: many(deliveries, { relationName: 'companyDeliveries' }),
  driverDeliveries: many(deliveries, { relationName: 'driverDeliveries' }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  supplier: one(users, { fields: [products.supplierId], references: [users.id], relationName: 'supplierProducts' }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  subCategory: one(subCategories, { fields: [products.subCategoryId], references: [subCategories.id] }),
  flavor: one(flavors, { fields: [products.flavorId], references: [flavors.id] }),
  size: one(sizes, { fields: [products.sizeId], references: [sizes.id] }),
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  listings: many(supplierProductListings),
}));

export const supplierProductListingsRelations = relations(supplierProductListings, ({ one, many }) => ({
  supplier: one(users, { fields: [supplierProductListings.supplierId], references: [users.id] }),
  product: one(products, { fields: [supplierProductListings.productId], references: [products.id] }),
  variants: many(supplierProductVariants),
}));

export const supplierProductVariantsRelations = relations(supplierProductVariants, ({ one }) => ({
  listing: one(supplierProductListings, { fields: [supplierProductVariants.listingId], references: [supplierProductListings.id] }),
}));

export const inventoryAdjustmentsRelations = relations(inventoryAdjustments, ({ one }) => ({
  listing: one(supplierProductListings, { fields: [inventoryAdjustments.listingId], references: [supplierProductListings.id] }),
  user: one(users, { fields: [inventoryAdjustments.userId], references: [users.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  cafe: one(users, { fields: [orders.cafeId], references: [users.id], relationName: 'cafeOrders' }),
  supplier: one(users, { fields: [orders.supplierId], references: [users.id], relationName: 'supplierOrders' }),
  delivery: one(users, { fields: [orders.deliveryId], references: [users.id], relationName: 'deliveryOrders' }),
  items: many(orderItems),
  subOrders: many(subOrders),
  deliveries: many(deliveries),
}));

export const subOrdersRelations = relations(subOrders, ({ one, many }) => ({
  order: one(orders, { fields: [subOrders.orderId], references: [orders.id] }),
  items: many(orderItems),
  deliveries: many(deliveries),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  subOrder: one(subOrders, { fields: [orderItems.subOrderId], references: [subOrders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const orderReturnsRelations = relations(orderReturns, ({ one }) => ({
  order: one(orders, { fields: [orderReturns.orderId], references: [orders.id] }),
  cafe: one(users, { fields: [orderReturns.cafeId], references: [users.id], relationName: 'cafeReturns' }),
  supplier: one(users, { fields: [orderReturns.supplierId], references: [users.id], relationName: 'supplierReturns' }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  subCategories: many(subCategories),
  supplierCategories: many(supplierCategories),
  products: many(products),
}));

export const subCategoriesRelations = relations(subCategories, ({ one, many }) => ({
  category: one(categories, { fields: [subCategories.categoryId], references: [categories.id] }),
  supplierSubCategories: many(supplierSubCategories),
  products: many(products),
}));

export const supplierCategoriesRelations = relations(supplierCategories, ({ one }) => ({
  supplier: one(users, { fields: [supplierCategories.supplierId], references: [users.id] }),
  category: one(categories, { fields: [supplierCategories.categoryId], references: [categories.id] }),
}));

export const supplierSubCategoriesRelations = relations(supplierSubCategories, ({ one }) => ({
  supplier: one(users, { fields: [supplierSubCategories.supplierId], references: [users.id] }),
  subCategory: one(subCategories, { fields: [supplierSubCategories.subCategoryId], references: [subCategories.id] }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  product: one(products, { fields: [favorites.productId], references: [products.id] }),
}));

export const supplierStoresRelations = relations(supplierStores, ({ one }) => ({
  supplier: one(users, { fields: [supplierStores.supplierId], references: [users.id] }),
}));

export const storeFavoritesRelations = relations(storeFavorites, ({ one }) => ({
  user: one(users, { fields: [storeFavorites.userId], references: [users.id] }),
  store: one(supplierStores, { fields: [storeFavorites.storeId], references: [supplierStores.id] }),
}));

export const packsRelations = relations(packs, ({ one, many }) => ({
  supplier: one(users, { fields: [packs.supplierId], references: [users.id] }),
  items: many(packItems),
}));

export const packItemsRelations = relations(packItems, ({ one }) => ({
  pack: one(packs, { fields: [packItems.packId], references: [packs.id] }),
  listing: one(supplierProductListings, { fields: [packItems.listingId], references: [supplierProductListings.id] }),
}));

export const packFavoritesRelations = relations(packFavorites, ({ one }) => ({
  user: one(users, { fields: [packFavorites.userId], references: [users.id] }),
  pack: one(packs, { fields: [packFavorites.packId], references: [packs.id] }),
}));

export const supplierProductReviewsRelations = relations(supplierProductReviews, ({ one }) => ({
  supplier: one(users, { fields: [supplierProductReviews.supplierId], references: [users.id] }),
  cafe: one(users, { fields: [supplierProductReviews.cafeId], references: [users.id] }),
}));

export const promotionsRelations = relations(promotions, ({ one, many }) => ({
  supplier: one(users, { fields: [promotions.supplierId], references: [users.id] }),
  usage: many(promotionUsage),
}));

export const promotionUsageRelations = relations(promotionUsage, ({ one }) => ({
  promotion: one(promotions, { fields: [promotionUsage.promotionId], references: [promotions.id] }),
  cafe: one(users, { fields: [promotionUsage.cafeId], references: [users.id] }),
}));

export const discountCodesRelations = relations(discountCodes, ({ one, many }) => ({
  supplier: one(users, { fields: [discountCodes.supplierId], references: [users.id] }),
  usage: many(discountCodeUsage),
}));

export const discountCodeUsageRelations = relations(discountCodeUsage, ({ one }) => ({
  discountCode: one(discountCodes, { fields: [discountCodeUsage.discountCodeId], references: [discountCodes.id] }),
  cafe: one(users, { fields: [discountCodeUsage.cafeId], references: [users.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  createdBy: one(users, { fields: [conversations.createdByUserId], references: [users.id] }),
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, { fields: [conversationParticipants.conversationId], references: [conversations.id] }),
  user: one(users, { fields: [conversationParticipants.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

// ── Insert Schemas ───────────────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertSubOrderSchema = createInsertSchema(subOrders).omit({ id: true, createdAt: true });
export const insertSupplierProductVariantSchema = createInsertSchema(supplierProductVariants).omit({ id: true, createdAt: true });

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubCategorySchema = createInsertSchema(subCategories).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFlavorSchema = createInsertSchema(flavors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSizeSchema = createInsertSchema(sizes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBrandSchema = createInsertSchema(brands).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupplierProductListingSchema = createInsertSchema(supplierProductListings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInventoryAdjustmentSchema = createInsertSchema(inventoryAdjustments).omit({ id: true, createdAt: true });
export const insertFavoriteSchema = createInsertSchema(favorites).omit({ id: true, createdAt: true });
export const insertPlatformServiceSchema = createInsertSchema(platformServices).omit({ id: true, updatedAt: true });
export const insertSupplierStoreSchema = createInsertSchema(supplierStores).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStoreFavoriteSchema = createInsertSchema(storeFavorites).omit({ id: true, createdAt: true });
export const insertSupplierProductReviewSchema = createInsertSchema(supplierProductReviews).omit({ id: true, createdAt: true });
export const insertPackSchema = createInsertSchema(packs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPackItemSchema = createInsertSchema(packItems).omit({ id: true });
export const insertPackFavoriteSchema = createInsertSchema(packFavorites).omit({ id: true, createdAt: true });
export const insertMaintenanceProfileSchema = createInsertSchema(maintenanceProfiles).omit({ id: true, updatedAt: true });
export const insertMaintenanceFavoriteSchema = createInsertSchema(maintenanceFavorites).omit({ id: true, createdAt: true });
export const insertMaintenanceReservationSchema = createInsertSchema(maintenanceReservations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMaintenanceCompetencySchema = createInsertSchema(maintenanceCompetencies).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMaintenanceZoneSchema = createInsertSchema(maintenanceZones).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPrintCatalogItemSchema = createInsertSchema(printCatalogItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPrintFavoriteSchema = createInsertSchema(printFavorites).omit({ id: true, createdAt: true });
export const insertPrintOrderSchema = createInsertSchema(printOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPrintCategoryTaxonomySchema = createInsertSchema(printCategoryTaxonomy).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPrintSubCategoryTaxonomySchema = createInsertSchema(printSubCategoryTaxonomy).omit({ id: true, createdAt: true, updatedAt: true });

export const insertBaristaSkillSchema = createInsertSchema(baristaSkills).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBaristaMarketplaceProfileSchema = createInsertSchema(baristaMarketplaceProfiles).omit({ id: true, updatedAt: true });
export const insertBaristaMarketplaceRequestSchema = createInsertSchema(baristaMarketplaceRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBaristaMarketplaceFavoriteSchema = createInsertSchema(baristaMarketplaceFavorites).omit({ id: true, createdAt: true });
export const insertBaristaWorkHistorySchema = createInsertSchema(baristaWorkHistory).omit({ id: true, createdAt: true, updatedAt: true });

export const insertAcademyProfileSchema = createInsertSchema(academyProfiles).omit({ id: true, updatedAt: true });
export const insertAcademyCourseSchema = createInsertSchema(academyCourses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAcademyCourseSessionSchema = createInsertSchema(academyCourseSessions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAcademyRegistrationSchema = createInsertSchema(academyRegistrations).omit({ id: true, createdAt: true, updatedAt: true });

export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDeliveryOpportunitySchema = createInsertSchema(deliveryOpportunities).omit({ id: true, createdAt: true, updatedAt: true });

export const insertPromotionSchema = createInsertSchema(promotions).omit({ id: true, createdAt: true, updatedAt: true, usageCount: true });
export const insertPromotionUsageSchema = createInsertSchema(promotionUsage).omit({ id: true, createdAt: true });

export const insertDiscountCodeSchema = createInsertSchema(discountCodes).omit({ id: true, createdAt: true, updatedAt: true, usageCount: true });
export const insertDiscountCodeUsageSchema = createInsertSchema(discountCodeUsage).omit({ id: true, createdAt: true });

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true, lastMessageAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, isRead: true, readAt: true });

// ── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

export type SubOrder = typeof subOrders.$inferSelect;
export type InsertSubOrder = z.infer<typeof insertSubOrderSchema>;

export type SupplierProductVariant = typeof supplierProductVariants.$inferSelect;
export type InsertSupplierProductVariant = z.infer<typeof insertSupplierProductVariantSchema>;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

export type SubCategory = typeof subCategories.$inferSelect;
export type InsertSubCategory = z.infer<typeof insertSubCategorySchema>;

export type Flavor = typeof flavors.$inferSelect;
export type InsertFlavor = z.infer<typeof insertFlavorSchema>;

export type Size = typeof sizes.$inferSelect;
export type InsertSize = z.infer<typeof insertSizeSchema>;

export type Brand = typeof brands.$inferSelect;
export type InsertBrand = z.infer<typeof insertBrandSchema>;

export type SupplierCategory = typeof supplierCategories.$inferSelect;
export type SupplierSubCategory = typeof supplierSubCategories.$inferSelect;

export type SupplierProductListing = typeof supplierProductListings.$inferSelect;
export type InsertSupplierProductListing = z.infer<typeof insertSupplierProductListingSchema>;

export type InventoryAdjustment = typeof inventoryAdjustments.$inferSelect;
export type InsertInventoryAdjustment = z.infer<typeof insertInventoryAdjustmentSchema>;
export type InventoryAdjustmentWithVariant = InventoryAdjustment & { variantName: string | null };

export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;

export type PlatformService = typeof platformServices.$inferSelect;
export type InsertPlatformService = z.infer<typeof insertPlatformServiceSchema>;
export type ServiceKey = 'PRINTING' | 'MARKETING' | 'BARISTA_ACADEMY' | 'BARISTA_MARKETPLACE' | 'MAINTENANCE';
export type ServiceState = 'VISIBLE' | 'HIDDEN' | 'COMING_SOON';
export type ServiceStatesMap = Record<ServiceKey, ServiceState>;

export type SupplierStore = typeof supplierStores.$inferSelect;
export type InsertSupplierStore = z.infer<typeof insertSupplierStoreSchema>;

export type StoreFavorite = typeof storeFavorites.$inferSelect;
export type InsertStoreFavorite = z.infer<typeof insertStoreFavoriteSchema>;

export type SupplierProductReview = typeof supplierProductReviews.$inferSelect;
export type InsertSupplierProductReview = z.infer<typeof insertSupplierProductReviewSchema>;

export type Pack = typeof packs.$inferSelect;
export type InsertPack = z.infer<typeof insertPackSchema>;

export type PackItem = typeof packItems.$inferSelect;
export type InsertPackItem = z.infer<typeof insertPackItemSchema>;

export type PackFavorite = typeof packFavorites.$inferSelect;
export type PrintFavorite = typeof printFavorites.$inferSelect;
export type InsertPrintFavorite = z.infer<typeof insertPrintFavoriteSchema>;
export type MaintenanceProfile = typeof maintenanceProfiles.$inferSelect;
export type InsertMaintenanceProfile = z.infer<typeof insertMaintenanceProfileSchema>;
export type MaintenanceFavorite = typeof maintenanceFavorites.$inferSelect;
export type MaintenanceReservation = typeof maintenanceReservations.$inferSelect;
export type MaintenanceCompetency = typeof maintenanceCompetencies.$inferSelect;
export type MaintenanceZone = typeof maintenanceZones.$inferSelect;
export type MaintenanceMarketplaceCard = MaintenanceProfile & {
  userId: number;
  name: string;
  phone: string | null;
  profileImageUrl: string | null;
  coverImageUrl?: string | null;
  location: string;
  initials: string;
  available: boolean;
  type: string;
  specialty: string;
  workingHours: string;
  // Haversine distance (km) between the viewing Coffee Owner's stored location
  // and this Maintenance professional's — null when either has no coordinates
  // (never fabricated), same convention as BaristaMarketplaceCard.distanceKm.
  distanceKm?: number | null;
};

// ── DELIVERY COMPANY ─────────────────────────────────────────────────────────
// Mirrors the Maintenance marketplace pattern (maintenanceProfiles/
// getMaintenanceCard/getMaintenanceProfiles) field-for-field, adapted to
// Delivery Company semantics — the single public source of truth for a
// Delivery Company's own Business → Profil page, its Eye preview, and the
// Supplier-facing mapped card / details modal (Part 26 "one source of
// truth"). No profile of this kind existed before this task: Delivery
// Companies previously only had bare `users` fields (name/photo/phone/
// address) and no marketplace representation at all. Reviews reuse
// supplierProductReviews (reviewType='DELIVERY_COMPANY') exactly like every
// other service — see deliveryCompanyUserId below — and drivers/vehicles are
// NEVER duplicated here: the card/modal always call the existing
// getDriversForOwner('DELIVERY_COMPANY', ...) / getVehiclesForOwner(...)
// storage methods already used by Espace Livraison's own Chauffeurs/Véhicules
// pages, sanitized down to safe public fields.
export const deliveryCompanyProfiles = pgTable("delivery_company_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  companyType: text("company_type").notNull().default("Entreprise"),
  description: text("description").notNull().default(""),
  deliveryZones: text("delivery_zones").notNull().default(""), // comma-separated, same convention as maintenanceProfiles.coverageArea
  dailyRateInCents: integer("daily_rate_in_cents").notNull().default(0),
  responseTime: text("response_time").notNull().default("< 24h"),
  experienceYears: integer("experience_years").notNull().default(0),
  certifications: text("certifications").array().notNull().default([]),
  portfolioImages: text("portfolio_images").array().notNull().default([]),
  // Same { monday: {open, close, closed}, ... } shape as maintenanceProfiles.weeklyHours — reused, not reinvented.
  weeklyHours: jsonb("weekly_hours").$type<OpeningHoursMap | null>(),
  isOnVacation: boolean("is_on_vacation").notNull().default(false),
  marketplaceVisible: boolean("marketplace_visible").notNull().default(true),
  rating: integer("rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type DeliveryCompanyProfile = typeof deliveryCompanyProfiles.$inferSelect;
export type InsertDeliveryCompanyProfile = typeof deliveryCompanyProfiles.$inferInsert;

export type DeliveryCompanyMarketplaceCard = DeliveryCompanyProfile & {
  userId: number;
  name: string;
  phone: string | null;
  profileImageUrl: string | null;
  coverImageUrl?: string | null;
  location: string;
  initials: string;
  available: boolean;
  driverCount: number;
  vehicleCount: number;
  distanceKm?: number | null;
};

// Entity-level report — a Supplier flagging a Delivery Company itself (the
// Supplier is the one who actually interacts with Delivery Companies via the
// Order Delivery dispatch flow — Coffee Owners never see delivery-company
// identity), mirroring maintenanceReports/baristaReports exactly (own table,
// own service scope) but with supplierId as the reporter instead of
// cafeOwnerId.
export const deliveryCompanyReportStatusEnum = pgEnum('delivery_company_report_status', ['PENDING', 'RESOLVED', 'DISMISSED']);

export const deliveryCompanyReports = pgTable("delivery_company_reports", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  deliveryCompanyUserId: integer("delivery_company_user_id").notNull(),
  reason: text("reason").notNull(),
  status: deliveryCompanyReportStatusEnum("status").notNull().default('PENDING'),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
}, (table) => ({
  companyIdx: index("delivery_company_reports_company_idx").on(table.deliveryCompanyUserId),
  statusIdx: index("delivery_company_reports_status_idx").on(table.status),
}));
export type DeliveryCompanyReport = typeof deliveryCompanyReports.$inferSelect;
export type InsertDeliveryCompanyReport = typeof deliveryCompanyReports.$inferInsert;
export const insertDeliveryCompanyReportSchema = createInsertSchema(deliveryCompanyReports).omit({ id: true, createdAt: true, resolvedAt: true });
export type InsertMaintenanceReservation = z.infer<typeof insertMaintenanceReservationSchema>;
export type InsertPackFavorite = z.infer<typeof insertPackFavoriteSchema>;

export type PrintCatalogItem = typeof printCatalogItems.$inferSelect;
export type InsertPrintCatalogItem = z.infer<typeof insertPrintCatalogItemSchema>;
export type PrintOrder = typeof printOrders.$inferSelect;
export type InsertPrintOrder = z.infer<typeof insertPrintOrderSchema>;
export type PrintOrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'IN_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type PrintReport = typeof printReports.$inferSelect;
export type InsertPrintReport = typeof printReports.$inferInsert;
/** A catalog item joined with its printer's identity/location — the card shown on /print. */
export type PrintCatalogCard = PrintCatalogItem & {
  printerName: string;
  printerPhone: string | null;
  printerImageUrl: string | null;
  printerLocation: string;
  rating: number; // 0-50 (x10), mirrors maintenanceProfiles/baristaMarketplaceProfiles convention
  reviewCount: number;
  distanceKm?: number | null;
};
/** A print order joined with the other party's identity, for both Printer and Coffee Owner views. */
export type PrintOrderWithParties = PrintOrder & {
  printerName: string;
  cafeOwnerName: string;
};
export type PrintCategoryTaxonomy = typeof printCategoryTaxonomy.$inferSelect;
export type InsertPrintCategoryTaxonomy = z.infer<typeof insertPrintCategoryTaxonomySchema>;
export type PrintSubCategoryTaxonomy = typeof printSubCategoryTaxonomy.$inferSelect;
export type InsertPrintSubCategoryTaxonomy = z.infer<typeof insertPrintSubCategoryTaxonomySchema>;

/** Company-level card for the printing company itself (Espace Imprimerie's
 *  Business → Profil → Aperçu, and everywhere a "printing company" is shown —
 *  Coffee Owner's Service modal "Imprimerie" section, Admin PRINT). `services`
 *  reuses the exact PrintCatalogCard shape the marketplace already returns
 *  (published/active items only) — one synchronized representation, never a
 *  second copy of service data. */
export type PrintCompanyCard = {
  userId: number;
  name: string;
  profileImageUrl: string | null;
  coverImageUrl?: string | null;
  location: string;
  phone: string | null;
  description: string;
  websiteUrl: string | null;
  marketplaceVisible: boolean;
  weeklyHours: OpeningHoursMap | null;
  isOnVacation: boolean;
  rating: number;
  reviewCount: number;
  portfolioImages: string[];
  categories: string[];
  services: PrintCatalogCard[];
};

export type Promotion = typeof promotions.$inferSelect;
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;
export type PromotionUsage = typeof promotionUsage.$inferSelect;
export type InsertPromotionUsage = z.infer<typeof insertPromotionUsageSchema>;

export type PromotionType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_GET_Y' | 'QUANTITY_TIER' | 'CATEGORY_DISCOUNT' | 'FREE_SHIPPING' | 'GIFT' | 'MIN_ORDER_AMOUNT' | 'MIN_QUANTITY' | 'FIRST_ORDER';
export type PromotionStatus = 'ACTIVE' | 'PAUSED' | 'SCHEDULED' | 'EXPIRED';
export type PromotionTargetType = 'ALL' | 'PRODUCTS' | 'CATEGORIES';

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = z.infer<typeof insertDiscountCodeSchema>;
export type DiscountCodeUsage = typeof discountCodeUsage.$inferSelect;
export type InsertDiscountCodeUsage = z.infer<typeof insertDiscountCodeUsageSchema>;
export type DiscountCodeType = 'PERCENTAGE' | 'FIXED_AMOUNT';

// Effective status is always computed (never stored) — same principle as Promotions'
// getEffectiveStatus: a code can be ACTIVE, manually deactivated (INACTIVE), EXPIRED
// (past expiresAt), or USAGE_LIMIT_REACHED (usageCount >= maxUses).
export type DiscountCodeEffectiveStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'USAGE_LIMIT_REACHED';

// Result of server-side discount code validation, returned by both the cart-preview
// endpoint and used internally at order-creation time.
export type DiscountCodeValidationResult = {
  valid: boolean;
  message?: string;
  discountCodeId?: number;
  code?: string;
  supplierId?: number;
  discountAmount?: number; // millimes
};

export type QuantityTier = { minQty: number; maxQty?: number; pricePerUnit: number };
export type GiftInfo = { description: string; quantity: number };

export type PromotionWithStats = Promotion & {
  totalRevenue: number;     // cents — revenue from orders using this promo
  ordersCount: number;
  avgDiscount: number;      // cents
};

// Result of server-side promotion evaluation for one supplier's cart group
export type SupplierPromotionResult = {
  supplierId: number;
  promotionId: number | null;
  promotionName: string | null;
  promotionType: string | null;
  originalSubtotal: number;   // cents
  discountAmount: number;     // cents
  finalSubtotal: number;      // cents
  freeShipping: boolean;
  giftInfo: GiftInfo | null;
  appliedTierPrice: number | null; // per-unit price after tier, if applicable
};

// Full cart evaluation result returned to the client
export type CartPromotionEvaluation = {
  bySupplier: SupplierPromotionResult[];
  totalOriginal: number;
  totalDiscount: number;
  totalFinal: number;
};

// Lightweight badge info for product cards in the marketplace
export type ListingPromotion = {
  listingId: number;
  promotionId: number;
  type: PromotionType;
  label: string;         // e.g. "20% OFF"
  endDate: Date | null;
  discountValue: number; // basis points or cents depending on type
};

// ── Pack Rich Types ───────────────────────────────────────────────────────────

export type PackVariantOption = {
  variantId: number;
  flavorId: number | null;
  flavorName: string | null;
  sizeId: number | null;
  sizeName: string | null;
  price: number;
  availableQuantity: number;
};

export type PackItemDetail = {
  id: number;
  listingId: number;
  variantId: number | null;
  flavorIds: number[] | null;
  quantity: number;
  packVariantPrice: number; // per-variant pack price set by supplier (cents; 0 if not set)
  productId: number;
  productName: string;
  productImageUrl: string | null;
  categoryId: number | null;   // product's category — used for correct category→brand mapping on cards
  subCategoryId?: number | null;
  brandId: number | null;       // product's brand — used for correct category→brand mapping on cards
  categoryName?: string | null;
  subCategoryName?: string | null;
  brandName?: string | null;
  flavorId: number | null;
  flavorName: string | null;
  sizeId: number | null;
  sizeName: string | null;
  unitPrice: number;
  availableQuantity: number; // stock available for this listing/variant right now
  // All variants available for this listing (for flavor-distribution selection by Coffee Owner)
  listingVariants: PackVariantOption[];
};

export type PackDetail = Pack & {
  supplierName: string;
  supplierLat: string | null;
  supplierLng: string | null;
  supplierAvgRating: number;   // supplier-level rating (same source as StoreDetail.avgRating)
  supplierReviewCount: number;
  items: PackItemDetail[];
  categoryIds: number[];
  subCategoryIds: number[];
  brandIds: number[];
  categoryLabels: TaxonomyLabel[];
  subCategoryLabels: TaxonomyLabel[];
  brandLabels: TaxonomyLabel[];
  maxBuildable: number; // how many packs could be assembled given current stock
  isAvailable: boolean; // maxBuildable > 0, not expired, visible, not archived
  isExpired: boolean;
  packReviewCount: number;
  packAvgRating: number;
};

// ── Store Types ───────────────────────────────────────────────────────────────

export type OpeningDayHours = { open: string; close: string; closed: boolean };
export type OpeningHoursMap = {
  monday: OpeningDayHours;
  tuesday: OpeningDayHours;
  wednesday: OpeningDayHours;
  thursday: OpeningDayHours;
  friday: OpeningDayHours;
  saturday: OpeningDayHours;
  sunday: OpeningDayHours;
};

export type StoreCard = {
  id: number;
  supplierId: number;
  name: string;
  description: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  isOpen: boolean;
  visibility: 'VISIBLE' | 'HIDDEN';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ON_HOLD';
  supplierLat: string | null;
  supplierLng: string | null;
  categoryIds: number[];
  subCategoryIds: number[];
  brandIds: number[];
  productCount: number;
  displayOrder: number;
  mediaType: 'IMAGE' | 'VIDEO';
  coverUrls: string[];
  videoUrl: string | null;
  musicUrl: string | null;
  openingHours: OpeningHoursMap | null;
};

export type StoreAdminRow = StoreCard & {
  supplierName: string;
  supplierEmail: string;
  autoApprove: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type StoreDetail = StoreCard & {
  products: ProductWithTaxonomy[];
  avgRating: number;
  reviewCount: number;
};

export type ShopFavoriteItem = {
  id: number;
  name: string;
  supplier: string;
  price: number;
  image: string;
};

// ── Marketplace Types ─────────────────────────────────────────────────────────

export type SupplierListingDetail = SupplierProductListing & {
  supplier: { id: number; name: string; email: string };
};

// ── Rich Types ───────────────────────────────────────────────────────────────

export type TaxonomyLabel = { id: number; name: string };

export type ProductWithTaxonomy = Product & {
  supplier?: { id: number; name: string } | null;
  categoryLabel?: TaxonomyLabel | null;
  subCategoryLabel?: TaxonomyLabel | null;
  flavorLabel?: TaxonomyLabel | null;
  sizeLabel?: TaxonomyLabel | null;
  brandLabel?: TaxonomyLabel | null;
  flavorLabels?: TaxonomyLabel[];
  sizeLabels?: TaxonomyLabel[];
  // Active promotions for the supplier listing in a single-store context.
  listingPromotions?: ListingPromotion[];
};

export type SupplierListingWithProduct = SupplierProductListing & {
  product: ProductWithTaxonomy;
  variants?: SupplierVariantWithLabels[];
};

export type SupplierVariantWithLabels = SupplierProductVariant & {
  flavorName?: string | null;
  sizeName?: string | null;
};

// ── Inventory Types ──────────────────────────────────────────────────────────

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export type InventoryVariantItem = {
  variantId: number;
  listingId: number;
  flavorId: number | null;
  sizeId: number | null;
  variantName: string; // e.g. "Vanilla · 250g Bag", or just the size/flavor when only one is set
  unit: string; // derived from the variant's size label; falls back to the listing's unit
  stock: number;
  minStock: number | null;
  maxStock: number | null;
  price: number;
  stockStatus: StockStatus;
};

export type InventoryItem = {
  listingId: number;
  productId: number;
  supplierId: number;
  productName: string;
  imageUrl: string | null;
  sku: string | null;
  barcode: string | null;
  categoryId: number | null;
  categoryName: string | null;
  brandId: number | null;
  brandName: string | null;
  stock: number;
  minStock: number;
  maxStock: number | null;
  unit: string;
  price: number; // selling price (TND, major unit)
  inventoryValue: number; // stock * price
  stockStatus: StockStatus; // for variant products: worst-of-all-variants status (OUT_OF_STOCK > LOW_STOCK > IN_STOCK)
  productStatus: string; // 'ACTIVE' | 'PENDING' | ...
  visibility: 'VISIBLE' | 'HIDDEN';
  hasVariants: boolean;
  hasPacks: boolean;
  onlyForPack: boolean;
  onlyForMyProducts: boolean;
  variants: InventoryVariantItem[]; // populated when hasVariants is true
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type InventoryListResult = {
  items: InventoryItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type InventoryStats = {
  totalProducts: number;
  activeProducts: number;
  hiddenProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalUnits: number;
  inventoryValue: number;
};

export type InventoryFilters = {
  search?: string;
  categoryId?: number;
  brandId?: number;
  status?: 'ACTIVE' | 'HIDDEN' | 'DRAFT';
  stockStatus?: StockStatus;
  minPrice?: number;
  maxPrice?: number;
  hasPacks?: boolean;
  lowStockOnly?: boolean;
};

export type InventorySort =
  | 'name_asc' | 'name_desc'
  | 'stock_asc' | 'stock_desc'
  | 'price_asc' | 'price_desc'
  | 'updated_desc' | 'created_desc';

export type CategoryWithCount = Category & {
  subCategoryCount: number;
  productCount: number;
};

export type SubCategoryWithDetails = SubCategory & {
  categoryName: string;
  productCount: number;
};

export type FlavorWithCount = Flavor & {
  productCount: number;
  subCategoryNames: string[];
};

export type SizeWithCount = Size & {
  productCount: number;
  subCategoryNames: string[];
};

export type BrandWithCount = Brand & {
  productCount: number;
  subCategoryNames: string[];
};

export type CatalogSuggestionType = 'category' | 'subcategory' | 'brand' | 'flavor' | 'size';

export type CatalogSuggestion = {
  id: number;
  type: CatalogSuggestionType;
  name: string;
  description?: string | null;
  icon?: string | null;
  status: string;
  createdBySupplier: boolean;
  createdByUserId?: number | null;
  approvedBy?: number | null;
  approvedAt?: Date | null;
  createdAt?: Date | null;
  supplierName?: string;
  // type-specific
  categoryId?: number | null;
  value?: string | null;
  logoUrl?: string | null;
  subCategoryIds?: number[] | null;
};

export type SupplierCategoryMapping = {
  category: Category;
  subCategories: SubCategory[];
  selectedSubCategoryIds: number[];
  mappingStatus: 'APPROVED' | 'PENDING';
  isFrozen: boolean;
};

export type AdminSupplierCategoryOverview = {
  supplierId: number;
  approved: SupplierCategoryMapping[];
  pending: SupplierCategoryMapping[];
  notAdded: Category[];
};

// ── Marketplace Types (for cafe browsing) ────────────────────────────────────

export type MarketplaceVariant = {
  id: number;
  listingId: number;
  flavorId: number | null;
  sizeId: number | null;
  flavorName: string | null;
  sizeName: string | null;
  price: number;
  quantity: number;
};

export type MarketplaceListing = {
  id: number;
  supplierId: number;
  supplierName: string;
  supplierLat: string | null;
  supplierLng: string | null;
  storeLogoUrl: string | null;
  variants: MarketplaceVariant[];
  totalStock: number;
  minPrice: number;
};

export type MarketplaceProduct = ProductWithTaxonomy & {
  listings: MarketplaceListing[];
  bestPrice: number;
  totalStock: number;
  supplierCount: number;
  avgRating: number;
  reviewCount: number;
};

// ── Sub-Order Rich Type ───────────────────────────────────────────────────────

// Lightweight delivery summary embedded on a sub-order for Coffee Owner / Supplier order
// views. Distinct from the legacy, unused `OrderWithDetails.delivery` field below (which
// resolves orders.deliveryId — a user, not a delivery record; see shared/schema.ts orders
// table comment). This is the real, per-sub-order delivery.
export type SubOrderDeliverySummary = {
  id: number;
  status: DeliveryStatus;
  deliveryMode: DeliveryMode | null;
  deliveryCompany: { id: number; name: string } | null;
  driver: { id: number; name: string; phone: string | null } | null;
  pickedUpAt: Date | null;
  inTransitAt: Date | null;
  deliveredAt: Date | null;
  // Redacted server-side to the one role that should see each (see storage.getOrders) —
  // always null for every other viewer, including the driver.
  pickupCode: string | null;
  dropoffCode: string | null;
  // Real computed fee (see storage.computeDeliveryFee) — cafeOwnerFeeShareCents is what
  // THIS Coffee Owner actually owes; deliveryFee is the full driver/operator compensation
  // and is not shown here (internal payout breakdown, task Part 30).
  deliveryFee: number;
  cafeOwnerFeeShareCents: number;
  // What the Supplier absorbs for this delivery — redacted server-side (see storage.getOrders)
  // to only Admin and the owning Supplier, exactly like pickupCode/dropoffCode above. Always
  // null for the Coffee Owner and every other viewer: internal supplier information they
  // must never see (Order Details synchronization task).
  supplierFeeShareCents: number | null;
  freeDeliveryApplied: boolean;
  // Transport/routing snapshot for Driver/Delivery-Company/Admin views (Delivery System V2).
  // roadDistanceKm/estimatedDurationMinutes are prep-only — always null until a real routing
  // provider is wired up; distanceKm is the existing haversine value already used for pricing.
  vehicleType: DeliveryVehicleType | null;
  distanceKm: string | null;
  roadDistanceKm: string | null;
  estimatedDurationMinutes: number | null;
};

export type SubOrderWithItems = SubOrder & {
  items: (OrderItem & { product: Product; flavorName?: string | null; sizeName?: string | null })[];
  delivery?: SubOrderDeliverySummary | null;
};

// ── Request / Response Types ─────────────────────────────────────────────────

export type CreateProductRequest = InsertProduct;
export type UpdateProductRequest = Partial<InsertProduct>;

export type CreateOrderItem = {
  listingId: number;
  productId: number;
  supplierId: number;
  supplierName: string;
  productName?: string;
  productImageUrl?: string | null;
  productCategory?: string;
  flavorId?: number | null;
  sizeId?: number | null;
  flavorName?: string | null;
  sizeName?: string | null;
  brandName?: string | null;
  categoryName?: string | null;
  subCategoryName?: string | null;
  quantity: number;
  unitPrice: number;
};

export type CreateOrderItemInput = Omit<CreateOrderItem, 'unitPrice' | 'supplierName'> & {
  supplierName?: string;
  unitPrice?: number;
};

export type CreatePackOrderItem = {
  packId: number;
  supplierId: number;
  quantity: number;
  includedProducts?: Array<{
    productId: number;
    productName: string;
    productImageUrl: string | null;
    brandName: string | null;
    categoryName: string | null;
    subCategoryName: string | null;
    flavorName: string | null;
    sizeName: string | null;
    quantity: number;
  }>;
};

export type ResolvedPackOrderItem = {
  packId: number;
  packName: string;
  supplierId: number;
  supplierName: string;
  quantity: number;
  unitPrice: number;
  packImageUrl: string | null;
  includedProducts: Array<{
    productId: number;
    productName: string;
    productImageUrl: string | null;
    brandName: string | null;
    categoryName: string | null;
    subCategoryName: string | null;
    flavorName: string | null;
    sizeName: string | null;
    quantity: number;
  }>;
};

export type AddressDetails = {
  street?: string;
  buildingNumber?: string;
  postalCode?: string;
  governorate?: string;
  municipality?: string;
  buildingType?: string;
  apartment?: string;
  floor?: string;
  door?: string;
  additionalNotes?: string;
};

/** Map pin + optional manual details (account or order delivery). */
export type GeoLocation = {
  address: string;
  lat: string;
  lng: string;
  placeId: string;
  details?: AddressDetails;
};

export type OrderPriority = 'NORMAL' | 'HIGH' | 'URGENT';

export type CreateOrderRequest = {
  items: CreateOrderItem[];
  packItems?: CreatePackOrderItem[];
  deliveryAddress?: GeoLocation;
  deliveryMethod?: 'SELF_PICKUP' | 'DELIVERY_SERVICE';
  paymentMethod?: 'CASH_ON_DELIVERY' | 'CREDIT_CARD' | 'MOBILE_PAYMENT' | 'BANK_TRANSFER';
  courierInstructions?: string;
  priority?: OrderPriority;
  scheduledAt?: string; // ISO datetime string; undefined / null = immediate
  // A single Discount Code entered by the Coffee Owner at checkout — belongs to exactly
  // one Supplier, so it is only ever applied to that supplier's own sub-order.
  discountCode?: string;
};

export type UpdateOrderStatusRequest = { status: typeof orders.$inferSelect.status; deliveryId?: number };

export type AuthResponse = User | null;

export type ProductWithSupplier = Product & {
  supplier?: { id: number; name: string };
};

export type OrderWithDetails = Order & {
  cafe: { id: number; name: string };
  supplier?: { id: number; name: string } | null;
  delivery?: { id: number; name: string };
  items: (OrderItem & { product: Product })[];
  subOrders?: SubOrderWithItems[];
};

// ── Billing Info Type ─────────────────────────────────────────────────────────

export type BillingInfo = {
  country?: string;
  companyName?: string;
  taxId?: string;
  street?: string;
  floorDoor?: string;
  province?: string;
  postalCode?: string;
  city?: string;
};

// ── Prospecting Module ────────────────────────────────────────────────────────

export const PROSPECT_STATUSES = [
  'NEW', 'NOT_CONTACTED', 'CALLED', 'INTERESTED', 'MEETING_SCHEDULED',
  'WAITING_REPLY', 'NEGOTIATION', 'CONVERTED', 'REJECTED', 'NOT_INTERESTED',
  'DUPLICATE', 'INVALID', 'ARCHIVED',
] as const;

export const PROSPECT_TYPES = [
  'COFFEE_SHOP', 'COFFEE_ROASTERY', 'COFFEE_SUPPLIER', 'WATER_SUPPLIER',
  'JUICE_SUPPLIER', 'MILK_SUPPLIER', 'PASTRY_SUPPLIER', 'BAKERY',
  'PACKAGING_SUPPLIER', 'PRINTER', 'MARKETING_AGENCY', 'DELIVERY_COMPANY',
  'BARISTA_TRAINER', 'COFFEE_EQUIPMENT', 'MAINTENANCE_COMPANY',
  'CLEANING_COMPANY', 'OTHER',
] as const;

export const prospects = pgTable("prospects", {
  id: serial("id").primaryKey(),
  googlePlaceId: text("google_place_id"),
  businessName: text("business_name").notNull(),
  businessType: text("business_type"),
  prospectType: text("prospect_type"),
  address: text("address"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  phone: text("phone"),
  website: text("website"),
  rating: text("rating"),
  reviewCount: integer("review_count").default(0),
  openingHours: jsonb("opening_hours"),
  status: text("status").notNull().default('NEW'),
  email: text("email"),
  facebook: text("facebook"),
  instagram: text("instagram"),
  linkedin: text("linkedin"),
  distanceKm: text("distance_km"),
  searchCenter: text("search_center"),
  searchRadius: text("search_radius"),
  keyword: text("keyword"),
  city: text("city"),
  country: text("country").default('Tunisia'),
  postalCode: text("postal_code"),
  notes: jsonb("notes").default([]),
  timeline: jsonb("timeline").default([]),
  contacts: jsonb("contacts").default([]),
  followUp: jsonb("follow_up"),
  assignedTo: integer("assigned_to"),
  prospectScore: integer("prospect_score").default(0),
  aiSuggestions: jsonb("ai_suggestions"),
  lastContactDate: timestamp("last_contact_date"),
  nextFollowUpDate: timestamp("next_follow_up_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export type Prospect = typeof prospects.$inferSelect;
export type InsertProspect = typeof prospects.$inferInsert;

export type ProspectNote = {
  id: string;
  text: string;
  createdAt: string;
  createdByName?: string;
};

export type ProspectTimelineEvent = {
  id: string;
  event: string;
  detail?: string;
  createdAt: string;
  userName?: string;
};

export type ProspectContact = {
  id: string;
  type: 'CALL' | 'EMAIL' | 'WHATSAPP' | 'MEETING';
  result?: string;
  duration?: number;
  notes?: string;
  createdAt: string;
};

export type ProspectFollowUp = {
  date: string;
  time?: string;
  notes?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
};

export type ProspectStats = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  withPhone: number;
  withWebsite: number;
  withEmail: number;
  avgRating: number;
  followUpsToday: number;
  overdueFollowUps: number;
  convertedCount: number;
  calledToday: number;
  interestedCount: number;
};

// ── Messaging types ──────────────────────────────────────────────────────────

export type Conversation = typeof conversations.$inferSelect;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type ChatMessage = typeof messages.$inferSelect;

export type ConversationSummary = {
  id: number;
  type: string; // 'DIRECT' | 'BROADCAST'
  title: string | null;
  service: string;
  lastMessageAt: string;
  createdAt?: string;
  messageCount?: number;
  lastMessage: { content: string; senderId: number; senderName: string; createdAt: string } | null;
  unreadCount: number;
  /** Everyone in the conversation except the requesting user */
  otherParticipants: { id: number; name: string; role: string; profileImageUrl?: string | null; hiddenAt?: string | null }[];
};

export type ConversationDetail = ConversationSummary & {
  allParticipants: { id: number; name: string; role: string; profileImageUrl?: string | null }[];
};

export type ConversationMessageRow = {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderRole: string;
  content: string;
  createdAt: string;
};

export type EligibleContact = { id: number; name: string; role: string; profileImageUrl?: string | null };

// ── Notification types ───────────────────────────────────────────────────────

export type NotificationService = 'ADMIN' | 'SHOP' | 'PRINT' | 'MAINTENANCE' | 'BARISTA' | 'ACADEMY' | 'MARKETING';
export type NotificationPriority = 'INFO' | 'SUCCESS' | 'WARNING' | 'URGENT';
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// ── Returns types ─────────────────────────────────────────────────────────────
export const insertOrderReturnSchema = createInsertSchema(orderReturns);
export type InsertOrderReturn = z.infer<typeof insertOrderReturnSchema>;
export type OrderReturn = typeof orderReturns.$inferSelect;
export type ReturnStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'RESOLVED';

