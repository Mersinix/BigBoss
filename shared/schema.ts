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
export const listingVisibilityEnum = pgEnum('listing_visibility', ['VISIBLE', 'HIDDEN']);
export const userAccountStatusEnum = pgEnum('user_account_status', ['pending', 'approved', 'rejected']);
export const serviceKeyEnum = pgEnum('service_key', ['PRINTING', 'MARKETING', 'BARISTA', 'MAINTENANCE']);
export const serviceStateEnum = pgEnum('service_state', ['VISIBLE', 'HIDDEN', 'COMING_SOON']);

export const MARKETPLACE_SERVICE_IDS = ['SHOP', 'PRINT', 'BARISTA', 'MARKETING', 'MAINTENANCE'] as const;
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
  billingInfo: jsonb("billing_info"),
  governorates: text("governorates").array(),
  categories: text("categories").array(),
  printCategories: text("print_categories").array(),
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
  // Snapshot of orders.deliveryFee at creation time. No fee-calculation algorithm exists yet
  // (see orders.deliveryFee — always 0 today); this column exists so a real algorithm can be
  // introduced later without another schema change.
  deliveryFee: integer("delivery_fee").notNull().default(0),
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

// Full detail payload — deliberately includes everything a Supplier / Delivery Company /
// Driver / Admin needs to decide on or perform a delivery without a second fetch (order
// items, cafe + supplier contact info, live driver/supplier coordinates for the navigation
// map). Built from the existing orders/order_items/users relationships in storage.ts —
// nothing here is duplicated/stored on the deliveries row itself beyond the pickup/
// destination snapshots that already existed.
export type DeliveryWithDetails = Delivery & {
  order: { id: number; status: string; totalAmount: number; createdAt: Date | null; itemCount: number; priority: string; scheduledAt: Date | null };
  subOrder: { id: number; status: string; supplierName: string; subtotal: number };
  cafe: { id: number; name: string; phone: string | null; locationAddress: string | null };
  supplier: { id: number; name: string; phone: string | null; locationAddress: string | null; locationLat: string | null; locationLng: string | null };
  deliveryCompany: { id: number; name: string } | null;
  driver: { id: number; name: string; phone: string | null; locationLat: string | null; locationLng: string | null } | null;
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

// Admin-controlled messaging behavior. This is intentionally separate from
// marketplace service visibility: hiding Messages must never delete data and
// must not remove an admin's ability to manage it.
export const messagingSettings = pgTable("messaging_settings", {
  id: serial("id").primaryKey(),
  globalVisible: boolean("global_visible").notNull().default(true),
  supplierMessagingEnabled: boolean("supplier_messaging_enabled").notNull().default(true),
  maintenanceMessagingEnabled: boolean("maintenance_messaging_enabled").notNull().default(true),
  baristaMessagingEnabled: boolean("barista_messaging_enabled").notNull().default(true),
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
  reviewType: text("review_type").notNull().default('SUPPLIER'), // 'PRODUCT' | 'SUPPLIER' | 'PACK' | 'MAINTENANCE' | 'BARISTA_MARKETPLACE' | 'PRINT'
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
  isAvailable: boolean("is_available").notNull().default(true),
  isOnVacation: boolean("is_on_vacation").notNull().default(false),
  marketplaceVisible: boolean("marketplace_visible").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
  initials: string;
  location: string;
  available: boolean;
  rating: number; // 0-50, i.e. x10 (mirrors maintenanceProfiles.rating convention)
  reviewCount: number;
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
  isAvailable: boolean("is_available").notNull().default(true),
  isOnVacation: boolean("is_on_vacation").notNull().default(false),
  marketplaceVisible: boolean("marketplace_visible").notNull().default(true),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin-managed Maintenance taxonomy. Profile/reservation history keeps its
// original text values, so freezing or removing a taxonomy item never
// invalidates historical records.
export const maintenanceCompetencies = pgTable("maintenance_competencies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
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
export const insertPrintOrderSchema = createInsertSchema(printOrders).omit({ id: true, createdAt: true, updatedAt: true });

export const insertBaristaSkillSchema = createInsertSchema(baristaSkills).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBaristaMarketplaceProfileSchema = createInsertSchema(baristaMarketplaceProfiles).omit({ id: true, updatedAt: true });
export const insertBaristaMarketplaceRequestSchema = createInsertSchema(baristaMarketplaceRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBaristaMarketplaceFavoriteSchema = createInsertSchema(baristaMarketplaceFavorites).omit({ id: true, createdAt: true });

export const insertPromotionSchema = createInsertSchema(promotions).omit({ id: true, createdAt: true, updatedAt: true, usageCount: true });
export const insertPromotionUsageSchema = createInsertSchema(promotionUsage).omit({ id: true, createdAt: true });

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true, lastMessageAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

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
export type ServiceKey = 'PRINTING' | 'MARKETING' | 'BARISTA' | 'MAINTENANCE';
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
  location: string;
  initials: string;
  available: boolean;
  type: string;
  specialty: string;
  workingHours: string;
};
export type InsertMaintenanceReservation = z.infer<typeof insertMaintenanceReservationSchema>;
export type InsertPackFavorite = z.infer<typeof insertPackFavoriteSchema>;

export type PrintCatalogItem = typeof printCatalogItems.$inferSelect;
export type InsertPrintCatalogItem = z.infer<typeof insertPrintCatalogItemSchema>;
export type PrintOrder = typeof printOrders.$inferSelect;
export type InsertPrintOrder = z.infer<typeof insertPrintOrderSchema>;
export type PrintOrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'IN_DELIVERY' | 'DELIVERED' | 'CANCELLED';
/** A catalog item joined with its printer's identity/location — the card shown on /print. */
export type PrintCatalogCard = PrintCatalogItem & {
  printerName: string;
  printerPhone: string | null;
  printerImageUrl: string | null;
  printerLocation: string;
  rating: number; // 0-50 (x10), mirrors maintenanceProfiles/baristaMarketplaceProfiles convention
  reviewCount: number;
};
/** A print order joined with the other party's identity, for both Printer and Coffee Owner views. */
export type PrintOrderWithParties = PrintOrder & {
  printerName: string;
  cafeOwnerName: string;
};

export type Promotion = typeof promotions.$inferSelect;
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;
export type PromotionUsage = typeof promotionUsage.$inferSelect;
export type InsertPromotionUsage = z.infer<typeof insertPromotionUsageSchema>;

export type PromotionType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_GET_Y' | 'QUANTITY_TIER' | 'CATEGORY_DISCOUNT' | 'FREE_SHIPPING' | 'GIFT' | 'MIN_ORDER_AMOUNT' | 'MIN_QUANTITY' | 'FIRST_ORDER';
export type PromotionStatus = 'ACTIVE' | 'PAUSED' | 'SCHEDULED' | 'EXPIRED';
export type PromotionTargetType = 'ALL' | 'PRODUCTS' | 'CATEGORIES';

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
  deliveryCompany: { id: number; name: string } | null;
  driver: { id: number; name: string; phone: string | null } | null;
  pickedUpAt: Date | null;
  inTransitAt: Date | null;
  deliveredAt: Date | null;
  // Redacted server-side to the one role that should see each (see storage.getOrders) —
  // always null for every other viewer, including the driver.
  pickupCode: string | null;
  dropoffCode: string | null;
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

// ── Returns types ─────────────────────────────────────────────────────────────
export const insertOrderReturnSchema = createInsertSchema(orderReturns);
export type InsertOrderReturn = z.infer<typeof insertOrderReturnSchema>;
export type OrderReturn = typeof orderReturns.$inferSelect;
export type ReturnStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'RESOLVED';

