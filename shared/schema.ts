import { pgTable, text, serial, integer, timestamp, pgEnum, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum('user_role', [
  'SUPER_ADMIN', 'ADMIN', 'SUPPLIER', 'CAFE_OWNER', 'DELIVERY_COMPANY', 'DRIVER',
  'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE'
]);
export const orderStatusEnum = pgEnum('order_status', ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'IN_DELIVERY', 'DELIVERED', 'CANCELLED']);
export const userAccountStatusEnum = pgEnum('user_account_status', ['pending', 'approved', 'rejected']);
export const serviceKeyEnum = pgEnum('service_key', ['PRINTING', 'MARKETING', 'BARISTA']);
export const serviceStateEnum = pgEnum('service_state', ['VISIBLE', 'HIDDEN', 'COMING_SOON']);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default('CAFE_OWNER'),
  status: userAccountStatusEnum('status').default('approved').notNull(),
  phone: text("phone"),
  billingInfo: jsonb("billing_info"),
  governorates: text("governorates").array(),
  categories: text("categories").array(),
  printCategories: text("print_categories").array(),
  marketingCategories: text("marketing_categories").array(),
  locationAddress: text("location_address"),
  locationLat: text("location_lat"),
  locationLng: text("location_lng"),
  locationPlaceId: text("location_place_id"),
  locationDetails: jsonb("location_details"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  createdAt: timestamp("created_at").defaultNow(),
});

// Supplier product variants — per-flavor/size pricing and stock within a listing
export const supplierProductVariants = pgTable("supplier_product_variants", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  flavorId: integer("flavor_id"),
  sizeId: integer("size_id"),
  price: integer("price").notNull().default(0),
  quantity: integer("quantity").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Orders — supplierId nullable for multi-supplier orders (use sub_orders instead)
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  cafeId: integer("cafe_id").notNull(),
  supplierId: integer("supplier_id"),
  deliveryId: integer("delivery_id"),
  status: orderStatusEnum("status").notNull().default('PENDING'),
  totalAmount: integer("total_amount").notNull(),
  deliveryAddress: jsonb("delivery_address"),
  courierInstructions: text("courier_instructions"),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  subOrderId: integer("sub_order_id"),
  productId: integer("product_id"),
  packId: integer("pack_id"),
  packName: text("pack_name"),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  totalPrice: integer("total_price"),
  flavorId: integer("flavor_id"),
  sizeId: integer("size_id"),
});

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

// Landing page configuration — admin-managed content for hero, sections & footer
export const landingConfig = pgTable("landing_config", {
  id: serial("id").primaryKey(),
  heroSlides: jsonb("hero_slides").$type<{ imageUrl: string; title: string; description: string }[]>().default([]),
  shopImage: text("shop_image"),
  printImage: text("print_image"),
  marketingImage: text("marketing_image"),
  baristaAcademyImage: text("barista_academy_image"),
  baristaMarketplaceImage: text("barista_marketplace_image"),
  footerDescription: text("footer_description"),
  footerEmail: text("footer_email"),
  footerPhone: text("footer_phone"),
  footerFacebook: text("footer_facebook"),
  footerInstagram: text("footer_instagram"),
  footerTiktok: text("footer_tiktok"),
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
  reviewType: text("review_type").notNull().default('SUPPLIER'), // 'PRODUCT' | 'SUPPLIER'
  cafeId: integer("cafe_id").notNull(),
  productId: integer("product_id"),
  listingId: integer("listing_id"),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  cafeName: text("cafe_name").notNull().default(''),
  cafeOwnerName: text("cafe_owner_name").notNull().default(''),
  productName: text("product_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Store favorites — persisted per-user store favorites (separate from product favorites)
export const storeFavorites = pgTable("store_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  storeId: integer("store_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  quantity: integer("quantity").notNull().default(1),
});

// Pack favorites — persisted per-user, mirrors store_favorites / favorites pattern.
export const packFavorites = pgTable("pack_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  packId: integer("pack_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  supplierProducts: many(products, { relationName: 'supplierProducts' }),
  cafeOrders: many(orders, { relationName: 'cafeOrders' }),
  supplierOrders: many(orders, { relationName: 'supplierOrders' }),
  deliveryOrders: many(orders, { relationName: 'deliveryOrders' }),
  supplierCategories: many(supplierCategories),
  supplierSubCategories: many(supplierSubCategories),
  supplierProductListings: many(supplierProductListings),
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

export const ordersRelations = relations(orders, ({ one, many }) => ({
  cafe: one(users, { fields: [orders.cafeId], references: [users.id], relationName: 'cafeOrders' }),
  supplier: one(users, { fields: [orders.supplierId], references: [users.id], relationName: 'supplierOrders' }),
  delivery: one(users, { fields: [orders.deliveryId], references: [users.id], relationName: 'deliveryOrders' }),
  items: many(orderItems),
  subOrders: many(subOrders),
}));

export const subOrdersRelations = relations(subOrders, ({ one, many }) => ({
  order: one(orders, { fields: [subOrders.orderId], references: [orders.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  subOrder: one(subOrders, { fields: [orderItems.subOrderId], references: [subOrders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
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
export const insertSupplierProductListingSchema = createInsertSchema(supplierProductListings).omit({ id: true, createdAt: true });
export const insertFavoriteSchema = createInsertSchema(favorites).omit({ id: true, createdAt: true });
export const insertPlatformServiceSchema = createInsertSchema(platformServices).omit({ id: true, updatedAt: true });
export const insertSupplierStoreSchema = createInsertSchema(supplierStores).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStoreFavoriteSchema = createInsertSchema(storeFavorites).omit({ id: true, createdAt: true });
export const insertSupplierProductReviewSchema = createInsertSchema(supplierProductReviews).omit({ id: true, createdAt: true });
export const insertPackSchema = createInsertSchema(packs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPackItemSchema = createInsertSchema(packItems).omit({ id: true });
export const insertPackFavoriteSchema = createInsertSchema(packFavorites).omit({ id: true, createdAt: true });

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

export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;

export type PlatformService = typeof platformServices.$inferSelect;
export type InsertPlatformService = z.infer<typeof insertPlatformServiceSchema>;
export type ServiceKey = 'PRINTING' | 'MARKETING' | 'BARISTA';
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
export type InsertPackFavorite = z.infer<typeof insertPackFavoriteSchema>;

// ── Pack Rich Types ───────────────────────────────────────────────────────────

export type PackItemDetail = {
  id: number;
  listingId: number;
  variantId: number | null;
  quantity: number;
  productId: number;
  productName: string;
  productImageUrl: string | null;
  flavorId: number | null;
  flavorName: string | null;
  sizeId: number | null;
  sizeName: string | null;
  unitPrice: number;
  availableQuantity: number; // stock available for this listing/variant right now
};

export type PackDetail = Pack & {
  supplierName: string;
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
};

export type SupplierListingWithProduct = SupplierProductListing & {
  product: ProductWithTaxonomy;
  variants?: SupplierVariantWithLabels[];
};

export type SupplierVariantWithLabels = SupplierProductVariant & {
  flavorName?: string | null;
  sizeName?: string | null;
};

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
  variants: MarketplaceVariant[];
  totalStock: number;
  minPrice: number;
};

export type MarketplaceProduct = ProductWithTaxonomy & {
  listings: MarketplaceListing[];
  bestPrice: number;
  totalStock: number;
  supplierCount: number;
};

// ── Sub-Order Rich Type ───────────────────────────────────────────────────────

export type SubOrderWithItems = SubOrder & {
  items: (OrderItem & { product: Product; flavorName?: string | null; sizeName?: string | null })[];
};

// ── Request / Response Types ─────────────────────────────────────────────────

export type CreateProductRequest = InsertProduct;
export type UpdateProductRequest = Partial<InsertProduct>;

export type CreateOrderItem = {
  listingId: number;
  productId: number;
  supplierId: number;
  supplierName: string;
  flavorId?: number | null;
  sizeId?: number | null;
  flavorName?: string | null;
  sizeName?: string | null;
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
};

export type ResolvedPackOrderItem = {
  packId: number;
  packName: string;
  supplierId: number;
  supplierName: string;
  quantity: number;
  unitPrice: number;
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

export type CreateOrderRequest = {
  items: CreateOrderItem[];
  packItems?: CreatePackOrderItem[];
  deliveryAddress?: GeoLocation;
  courierInstructions?: string;
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
