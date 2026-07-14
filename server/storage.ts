import { db } from "./db";
import {
  users, products, orders, orderItems, subOrders, supplierProductVariants,
  categories, subCategories, flavors, sizes, brands,
  supplierCategories, supplierSubCategories, supplierProductListings, favorites,
  platformServices, supplierStores, storeFavorites, supplierProductReviews,
  landingConfig, packs, packItems, packFavorites, inventoryAdjustments,
  type LandingConfig,
  type InsertUser, type User,
  type InsertProduct, type Product, type ProductWithSupplier, type ProductWithTaxonomy,
  type InsertOrder, type Order, type OrderWithDetails,
  type InsertOrderItem, type OrderItem,
  type InsertSubOrder, type SubOrder, type SubOrderWithItems,
  type InsertSupplierProductVariant, type SupplierProductVariant, type SupplierVariantWithLabels,
  type InsertCategory, type Category, type CategoryWithCount,
  type InsertSubCategory, type SubCategory, type SubCategoryWithDetails,
  type InsertFlavor, type Flavor, type FlavorWithCount,
  type InsertSize, type Size, type SizeWithCount,
  type InsertBrand, type Brand, type BrandWithCount,
  type SupplierCategoryMapping,
  type AdminSupplierCategoryOverview,
  type InsertSupplierProductListing, type SupplierProductListing, type SupplierListingWithProduct,
  type MarketplaceProduct, type MarketplaceListing, type MarketplaceVariant,
  type CreateOrderItem, type BillingInfo, type CreateOrderItemInput,
  type ShopFavoriteItem,
  type ServiceKey, type ServiceState, type ServiceStatesMap,
  type SupplierStore, type InsertSupplierStore, type StoreCard, type StoreAdminRow, type StoreDetail,
  type SupplierProductReview,
  type Pack, type PackItem, type PackFavorite, type PackDetail, type PackItemDetail, type TaxonomyLabel,
  type CreatePackOrderItem, type ResolvedPackOrderItem,
  type InventoryItem, type InventoryVariantItem, type InventoryListResult, type InventoryStats, type InventoryFilters, type InventorySort, type InventoryAdjustmentWithVariant,
  type InventoryAdjustment, type StockStatus,
} from "@shared/schema";
import { eq, and, inArray, ne, sql, notInArray, asc, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStatus(id: number, status: 'pending' | 'approved' | 'rejected'): Promise<User>;
  updateUser(id: number, data: Partial<any>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  updateUserLocation(id: number, loc: { address: string; lat: string; lng: string; placeId: string; details?: import("@shared/schema").AddressDetails }): Promise<User>;
  updateUserProfile(id: number, updates: { name?: string; phone?: string; email?: string }): Promise<User>;
  updateUserBilling(id: number, billing: BillingInfo): Promise<User>;

  // Admin product catalog
  getAdminProducts(filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number; search?: string }): Promise<ProductWithTaxonomy[]>;
  getProduct(id: number): Promise<ProductWithTaxonomy | undefined>;
  createProduct(product: Partial<InsertProduct>): Promise<Product>;
  updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;

  // Legacy cafe browsing (stock > 0 only)
  getProducts(filters?: { category?: string; supplierId?: number; search?: string }): Promise<ProductWithSupplier[]>;

  // Orders
  getOrders(filters?: { cafeId?: number; supplierId?: number; deliveryId?: number }): Promise<OrderWithDetails[]>;
  getOrder(id: number): Promise<OrderWithDetails | undefined>;
  resolveOrderItems(items: CreateOrderItemInput[]): Promise<CreateOrderItem[]>;
  resolvePackOrderItems(items: CreatePackOrderItem[]): Promise<ResolvedPackOrderItem[]>;
  createOrder(cafeId: number, cartItems: CreateOrderItem[], opts?: { deliveryAddress?: import("@shared/schema").GeoLocation; courierInstructions?: string; packItems?: ResolvedPackOrderItem[] }): Promise<Order>;
  canUserAccessOrder(userId: number, userRole: string, orderId: number): Promise<boolean>;
  updateOrderStatus(id: number, status: typeof orders.$inferSelect.status, deliveryId?: number): Promise<Order>;

  // Marketplace (cafe browsing)
  getMarketplaceProducts(filters?: { categoryId?: number; subCategoryId?: number; search?: string }): Promise<MarketplaceProduct[]>;
  getMarketplaceProduct(productId: number): Promise<MarketplaceProduct | undefined>;

  // Supplier product variants
  getVariantsByListingId(listingId: number): Promise<SupplierVariantWithLabels[]>;
  saveVariants(listingId: number, variants: { flavorId?: number | null; sizeId?: number | null; price: number; quantity: number }[]): Promise<SupplierVariantWithLabels[]>;

  // Categories
  getCategories(opts?: { includeAll?: boolean }): Promise<CategoryWithCount[]>;
  getCategory(id: number): Promise<Category | undefined>;
  createCategory(cat: Partial<InsertCategory>): Promise<Category>;
  updateCategory(id: number, updates: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: number): Promise<void>;

  // SubCategories
  getSubCategories(categoryId?: number, opts?: { includeAll?: boolean }): Promise<SubCategoryWithDetails[]>;
  createSubCategory(sub: Partial<InsertSubCategory>): Promise<SubCategory>;
  updateSubCategory(id: number, updates: Partial<InsertSubCategory>): Promise<SubCategory>;
  deleteSubCategory(id: number): Promise<void>;

  // Flavors
  getFlavors(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<FlavorWithCount[]>;
  createFlavor(f: Partial<InsertFlavor>): Promise<Flavor>;
  updateFlavor(id: number, updates: Partial<InsertFlavor>): Promise<Flavor>;
  deleteFlavor(id: number): Promise<void>;

  // Sizes
  getSizes(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<SizeWithCount[]>;
  createSize(s: Partial<InsertSize>): Promise<Size>;
  updateSize(id: number, updates: Partial<InsertSize>): Promise<Size>;
  deleteSize(id: number): Promise<void>;

  // Brands
  getBrands(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<BrandWithCount[]>;
  createBrand(b: Partial<InsertBrand>): Promise<Brand>;
  updateBrand(id: number, updates: Partial<InsertBrand>): Promise<Brand>;
  deleteBrand(id: number): Promise<void>;

  // Favorites (shop/product favorites, persisted per-user)
  getFavoritesByUser(userId: number): Promise<ShopFavoriteItem[]>;
  addFavorite(userId: number, productId: number): Promise<void>;
  removeFavorite(userId: number, productId: number): Promise<void>;

  // Packs
  getSupplierPacks(supplierId: number): Promise<PackDetail[]>;
  getPackDetail(id: number): Promise<PackDetail | undefined>;
  computeAutoPackQuantity(items: { listingId: number; variantId?: number | null; quantity: number }[]): Promise<number>;
  computePackItemsTotal(items: { listingId: number; variantId?: number | null; quantity: number }[]): Promise<number>;
  createPack(supplierId: number, data: { name: string; description?: string | null; imageUrl?: string | null; price: number; quantityAvailable: number; expirationDate?: Date | null; visibility?: 'VISIBLE' | 'HIDDEN' }, items: { listingId: number; variantId?: number | null; quantity: number }[]): Promise<PackDetail>;
  updatePack(id: number, supplierId: number, data: Partial<{ name: string; description: string | null; imageUrl: string | null; price: number; quantityAvailable: number; expirationDate: Date | null; visibility: 'VISIBLE' | 'HIDDEN'; isArchived: boolean }>, items?: { listingId: number; variantId?: number | null; quantity: number }[]): Promise<PackDetail | undefined>;
  duplicatePack(id: number, supplierId: number): Promise<PackDetail | undefined>;
  deletePack(id: number): Promise<void>;
  getMarketplacePacks(filters?: { categoryId?: number; subCategoryId?: number; brandId?: number; flavorId?: number; sizeId?: number; supplierId?: number }): Promise<PackDetail[]>;
  getAdminPacks(): Promise<PackDetail[]>;
  getPackFavoritesByUser(userId: number): Promise<number[]>;
  addPackFavorite(userId: number, packId: number): Promise<void>;
  removePackFavorite(userId: number, packId: number): Promise<void>;

  // Supplier stores
  getSupplierStore(supplierId: number): Promise<SupplierStore | undefined>;
  upsertSupplierStore(supplierId: number, data: Partial<InsertSupplierStore>): Promise<SupplierStore>;
  getAllStoresAdmin(): Promise<StoreAdminRow[]>;
  setStoreApprovalStatus(id: number, status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ON_HOLD'): Promise<SupplierStore | undefined>;
  updateStoreDisplayOrder(id: number, displayOrder: number): Promise<SupplierStore | undefined>;
  deleteStore(id: number): Promise<void>;
  getVisibleStores(): Promise<StoreCard[]>;
  getStoreDetail(id: number, opts?: { requireVisible?: boolean }): Promise<StoreDetail | undefined>;

  // Store favorites
  getStoreFavoritesByUser(userId: number): Promise<number[]>;
  addStoreFavorite(userId: number, storeId: number): Promise<void>;
  removeStoreFavorite(userId: number, storeId: number): Promise<void>;

  // Supplier mappings
  getSupplierCategoryMappings(supplierId: number, options?: { approvedOnly?: boolean }): Promise<SupplierCategoryMapping[]>;
  getAdminSupplierCategoryOverview(supplierId: number): Promise<AdminSupplierCategoryOverview>;
  setSupplierCategories(supplierId: number, categoryIds: number[]): Promise<void>;
  addSupplierCategories(supplierId: number, categoryIds: number[], status?: 'APPROVED' | 'PENDING'): Promise<void>;
  removeSupplierCategory(supplierId: number, categoryId: number): Promise<void>;
  setSupplierCategoryFrozen(supplierId: number, categoryId: number, isFrozen: boolean): Promise<void>;
  approveSupplierCategoryMapping(supplierId: number, categoryId: number): Promise<void>;
  setSupplierSubCategories(supplierId: number, subCategoryIds: number[]): Promise<void>;
  isProductAllowedForSupplier(supplierId: number, productId: number): Promise<boolean>;

  // Supplier product listings
  getSupplierListings(supplierId: number, filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number }): Promise<SupplierListingWithProduct[]>;
  createSupplierListing(data: Partial<InsertSupplierProductListing>): Promise<SupplierProductListing>;
  updateSupplierListing(id: number, updates: { price?: number; stock?: number; availableFlavorIds?: number[]; availableSizeIds?: number[]; availableBrandIds?: number[] }): Promise<SupplierProductListing>;
  deleteSupplierListing(id: number): Promise<void>;
  getSupplierListingByProductId(supplierId: number, productId: number): Promise<SupplierProductListing | undefined>;

  // Supplier product workflow
  getSupplierCreatedProducts(supplierId: number): Promise<ProductWithTaxonomy[]>;
  createSupplierProduct(data: Partial<InsertProduct>): Promise<Product>;
  updateSupplierProduct(id: number, supplierId: number, updates: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteSupplierProduct(id: number, supplierId: number): Promise<boolean>;
  getAdminSupplierProducts(): Promise<(ProductWithTaxonomy & { creatorName: string })[]>;
  approveSupplierProduct(id: number, adminId: number): Promise<Product>;

  // Platform services (System Management)
  getServiceStates(): Promise<ServiceStatesMap>;
  getLandingConfig(): Promise<LandingConfig>;
  updateLandingConfig(data: Partial<Omit<LandingConfig, "id" | "updatedAt">>): Promise<LandingConfig>;
  setServiceState(service: ServiceKey, state: ServiceState): Promise<ServiceStatesMap>;

  // Inventory
  getSupplierInventory(supplierId: number, filters?: InventoryFilters, sort?: InventorySort, page?: number, pageSize?: number): Promise<InventoryListResult>;
  getSupplierInventoryStats(supplierId: number, filters?: InventoryFilters): Promise<InventoryStats>;
  getListingForSupplier(listingId: number, supplierId: number): Promise<SupplierProductListing | undefined>;
  adjustListingStock(listingId: number, supplierId: number, userId: number | null, input: { type: 'INCREASE' | 'DECREASE' | 'SET'; quantity: number; reason: string; notes?: string }): Promise<{ listing: SupplierProductListing; history: InventoryAdjustment }>;
  getListingStockHistory(listingId: number, supplierId: number): Promise<InventoryAdjustmentWithVariant[]>;
  updateListingInventoryFields(listingId: number, supplierId: number, updates: { sku?: string | null; barcode?: string | null; minStock?: number; maxStock?: number | null; unit?: string; visibility?: 'VISIBLE' | 'HIDDEN' }): Promise<SupplierProductListing>;
  adjustVariantStock(variantId: number, supplierId: number, userId: number | null, input: { type: 'INCREASE' | 'DECREASE' | 'SET'; quantity: number; reason: string; notes?: string }): Promise<{ variant: SupplierProductVariant; listing: SupplierProductListing; history: InventoryAdjustment; lowStockTriggered: boolean }>;
  updateVariantInventoryFields(variantId: number, supplierId: number, updates: { minStock?: number | null; maxStock?: number | null }): Promise<SupplierProductVariant>;
  bulkInventoryAction(supplierId: number, listingIds: number[], action: 'hide' | 'show' | 'delete' | 'setMinStock' | 'stock', payload?: { minStock?: number; type?: 'INCREASE' | 'DECREASE' | 'SET'; quantity?: number; reason?: string; userId?: number | null }): Promise<{ updated: number }>;
}

// ── Taxonomy cache helper ─────────────────────────────────────────────────────

async function buildTaxonomyCache() {
  const [cats, subs, flvs, szs, brds] = await Promise.all([
    db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true))),
    db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true))),
    db.select().from(flavors).where(and(eq(flavors.status, 'ACTIVE'), eq(flavors.isActive, true))),
    db.select().from(sizes).where(and(eq(sizes.status, 'ACTIVE'), eq(sizes.isActive, true))),
    db.select().from(brands).where(and(eq(brands.status, 'ACTIVE'), eq(brands.isActive, true))),
  ]);
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const subMap = new Map(subs.map((s) => [s.id, s]));
  const flvMap = new Map(flvs.map((f) => [f.id, f]));
  const szMap = new Map(szs.map((s) => [s.id, s]));
  const brdMap = new Map(brds.map((b) => [b.id, b]));
  return { catMap, subMap, flvMap, szMap, brdMap };
}

function enrichProduct(
  p: Product,
  { catMap, subMap, flvMap, szMap, brdMap }: Awaited<ReturnType<typeof buildTaxonomyCache>>,
  supplierName?: string
): ProductWithTaxonomy {
  return {
    ...p,
    supplier: supplierName !== undefined ? (p.supplierId ? { id: p.supplierId, name: supplierName } : null) : undefined,
    categoryLabel: p.categoryId ? (catMap.get(p.categoryId) ? { id: p.categoryId, name: catMap.get(p.categoryId)!.name } : null) : null,
    subCategoryLabel: p.subCategoryId ? (subMap.get(p.subCategoryId) ? { id: p.subCategoryId, name: subMap.get(p.subCategoryId)!.name } : null) : null,
    flavorLabel: p.flavorId ? (flvMap.get(p.flavorId) ? { id: p.flavorId, name: flvMap.get(p.flavorId)!.name } : null) : null,
    sizeLabel: p.sizeId ? (szMap.get(p.sizeId) ? { id: p.sizeId, name: szMap.get(p.sizeId)!.name } : null) : null,
    brandLabel: p.brandId ? (brdMap.get(p.brandId) ? { id: p.brandId, name: brdMap.get(p.brandId)!.name } : null) : null,
    flavorLabels: (p.flavorIds ?? []).map((id) => flvMap.get(id)).filter(Boolean).map((f) => ({ id: f!.id, name: f!.name })),
    sizeLabels: (p.sizeIds ?? []).map((id) => szMap.get(id)).filter(Boolean).map((s) => ({ id: s!.id, name: s!.name })),
  };
}

// ── DatabaseStorage ───────────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {
  async getUser(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string) {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async createUser(user: InsertUser) {
    const [created] = await db.insert(users).values(user as any).returning();
    return created;
  }

  async updateUserStatus(id: number, status: 'pending' | 'approved' | 'rejected') {
    const [updated] = await db.update(users).set({ status }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUser(id: number, data: Partial<any>) {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: number) {
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUserLocation(id: number, loc: { address: string; lat: string; lng: string; placeId: string; details?: import("@shared/schema").AddressDetails }) {
    const [updated] = await db.update(users).set({
      locationAddress: loc.address,
      locationLat: loc.lat,
      locationLng: loc.lng,
      locationPlaceId: loc.placeId,
      locationDetails: loc.details ?? null,
    }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUserProfile(id: number, updates: { name?: string; phone?: string; email?: string; password?: string }) {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUserBilling(id: number, billing: BillingInfo) {
    const [updated] = await db.update(users).set({ billingInfo: billing }).where(eq(users.id, id)).returning();
    return updated;
  }

  // ── Admin products ──────────────────────────────────────────────────────────

  async getAdminProducts(filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number; search?: string }) {
    const all = await db.select().from(products).where(eq(products.isAdminProduct, true));
    const tx = await buildTaxonomyCache();
    const supplierIds = Array.from(new Set(all.map((p) => p.supplierId).filter(Boolean))) as number[];
    const supplierRows = supplierIds.length ? await db.select().from(users).where(inArray(users.id, supplierIds)) : [];
    const supplierMap = new Map(supplierRows.map((u) => [u.id, u.name]));
    let enriched = all.map((p) => enrichProduct(p, tx, supplierMap.get(p.supplierId!) ?? ""));
    if (filters?.categoryId) enriched = enriched.filter((p) => p.categoryId === filters.categoryId);
    if (filters?.subCategoryId) enriched = enriched.filter((p) => p.subCategoryId === filters.subCategoryId);
    if (filters?.flavorId) enriched = enriched.filter((p) => p.flavorIds?.includes(filters.flavorId!) || p.flavorId === filters.flavorId);
    if (filters?.sizeId) enriched = enriched.filter((p) => p.sizeIds?.includes(filters.sizeId!) || p.sizeId === filters.sizeId);
    if (filters?.brandId) enriched = enriched.filter((p) => p.brandId === filters.brandId);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      enriched = enriched.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q));
    }
    return enriched;
  }

  async getProduct(id: number): Promise<ProductWithTaxonomy | undefined> {
    const [p] = await db.select().from(products).where(eq(products.id, id));
    if (!p) return undefined;
    const tx = await buildTaxonomyCache();
    return enrichProduct(p, tx);
  }

  async createProduct(product: Partial<InsertProduct>) {
    const [created] = await db.insert(products).values(product as any).returning();
    return created;
  }

  async updateProduct(id: number, updates: Partial<InsertProduct>) {
    const [updated] = await db.update(products).set(updates as any).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: number) {
    const listings = await db.select({ id: supplierProductListings.id }).from(supplierProductListings).where(eq(supplierProductListings.productId, id));
    if (listings.length) {
      const listingIds = listings.map((l) => l.id);
      await db.delete(supplierProductVariants).where(inArray(supplierProductVariants.listingId, listingIds));
      await db.delete(supplierProductListings).where(inArray(supplierProductListings.id, listingIds));
    }
    await db.delete(products).where(eq(products.id, id));
  }

  // ── Legacy product browsing ─────────────────────────────────────────────────

  async getProducts(filters?: { category?: string; supplierId?: number; search?: string }): Promise<ProductWithSupplier[]> {
    const allProducts = await db.select().from(products);
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    let result = allProducts.map((p) => ({
      ...p,
      supplier: p.supplierId ? { id: p.supplierId, name: userMap.get(p.supplierId)?.name ?? "" } : undefined,
    }));
    if (filters?.supplierId) result = result.filter((p) => p.supplierId === filters.supplierId);
    if (filters?.category) result = result.filter((p) => p.category === filters.category);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result.filter((p) => p.stock > 0);
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  async getOrders(filters?: { cafeId?: number; supplierId?: number; deliveryId?: number }): Promise<OrderWithDetails[]> {
    const allOrders = await db.select().from(orders);
    const allItems = await db.select().from(orderItems);
    const allProducts = await db.select().from(products);
    const allUsers = await db.select().from(users);
    const allSubOrders = await db.select().from(subOrders);

    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    let filtered = allOrders;
    if (filters?.cafeId) filtered = filtered.filter((o) => o.cafeId === filters.cafeId);
    if (filters?.supplierId) {
      const supplierSubOrderIds = allSubOrders.filter((so) => so.supplierId === filters.supplierId).map((so) => so.orderId);
      filtered = filtered.filter((o) => supplierSubOrderIds.includes(o.id) || o.supplierId === filters.supplierId);
    }
    if (filters?.deliveryId) filtered = filtered.filter((o) => o.deliveryId === filters.deliveryId);

    return filtered.map((order) => {
      const cafe = userMap.get(order.cafeId);
      const supplier = order.supplierId ? userMap.get(order.supplierId) : null;
      const delivery = order.deliveryId ? userMap.get(order.deliveryId) : null;
      const items = allItems
        .filter((i) => i.orderId === order.id)
        .map((i) => ({ ...i, product: (i.productId != null ? productMap.get(i.productId) : undefined) ?? {} as Product }));
      const orderSubOrders = allSubOrders.filter((so) => so.orderId === order.id).map((so) => ({
        ...so,
        items: allItems.filter((i) => i.subOrderId === so.id).map((i) => ({ ...i, product: (i.productId != null ? productMap.get(i.productId) : undefined) ?? {} as Product })),
      }));
      return {
        ...order,
        cafe: { id: order.cafeId, name: cafe?.name ?? "Unknown" },
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        delivery: delivery ? { id: delivery.id, name: delivery.name } : undefined,
        items,
        subOrders: orderSubOrders,
      };
    });
  }

  async getOrder(id: number): Promise<OrderWithDetails | undefined> {
    const all = await this.getOrders();
    return all.find((o) => o.id === id);
  }

  async canUserAccessOrder(userId: number, userRole: string, orderId: number): Promise<boolean> {
    const order = await this.getOrder(orderId);
    if (!order) return false;
    if (['SUPER_ADMIN', 'ADMIN'].includes(userRole)) return true;
    if (userRole === 'CAFE_OWNER') return order.cafeId === userId;
    if (userRole === 'SUPPLIER') {
      return order.supplierId === userId || (order.subOrders ?? []).some((so) => so.supplierId === userId);
    }
    if (userRole === 'DRIVER' || userRole === 'DELIVERY_COMPANY') {
      return order.deliveryId === userId || ['READY', 'IN_DELIVERY', 'DELIVERED'].includes(order.status);
    }
    return false;
  }

  async resolveOrderItems(items: CreateOrderItemInput[]): Promise<CreateOrderItem[]> {
    const resolved: CreateOrderItem[] = [];

    for (const item of items) {
      const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, item.listingId));
      if (!listing) throw new Error(`Listing ${item.listingId} not found`);
      if (listing.supplierId !== item.supplierId) throw new Error('Supplier mismatch for listing');
      if (listing.productId !== item.productId) throw new Error('Product mismatch for listing');

      const [product] = await db.select().from(products).where(eq(products.id, item.productId));
      if (!product?.isAdminProduct) throw new Error('Product is not available in marketplace');

      const variants = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, item.listingId));
      let unitPrice: number;

      if (variants.length > 0) {
        const variant = variants.find(
          (v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null),
        );
        if (!variant) throw new Error('Selected variant not found');
        if (variant.quantity < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
        unitPrice = variant.price;
      } else {
        if (listing.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
        unitPrice = listing.price;
      }

      const [supplier] = await db.select().from(users).where(eq(users.id, listing.supplierId));
      resolved.push({
        listingId: item.listingId,
        productId: item.productId,
        supplierId: item.supplierId,
        supplierName: supplier?.name ?? item.supplierName ?? 'Unknown',
        flavorId: item.flavorId ?? null,
        sizeId: item.sizeId ?? null,
        flavorName: item.flavorName ?? null,
        sizeName: item.sizeName ?? null,
        quantity: item.quantity,
        unitPrice,
      });
    }

    return resolved;
  }

  async resolvePackOrderItems(items: CreatePackOrderItem[]): Promise<ResolvedPackOrderItem[]> {
    const resolved: ResolvedPackOrderItem[] = [];
    for (const item of items) {
      const [pack] = await db.select().from(packs).where(eq(packs.id, item.packId));
      if (!pack) throw new Error(`Pack ${item.packId} not found`);
      if (pack.supplierId !== item.supplierId) throw new Error('Supplier mismatch for pack');
      const [detail] = await this.buildPackDetails([pack]);
      if (!detail || !detail.isAvailable) throw new Error(`Pack ${pack.name} is not available`);
      if (item.quantity > Math.min(pack.quantityAvailable, detail.maxBuildable)) {
        throw new Error(`Insufficient stock for pack ${pack.name}`);
      }
      const [supplier] = await db.select().from(users).where(eq(users.id, pack.supplierId));
      resolved.push({
        packId: pack.id,
        packName: pack.name,
        supplierId: pack.supplierId,
        supplierName: supplier?.name ?? 'Unknown',
        quantity: item.quantity,
        unitPrice: pack.price,
      });
    }
    return resolved;
  }

  async createOrder(
    cafeId: number,
    cartItems: CreateOrderItem[],
    opts?: { deliveryAddress?: import("@shared/schema").GeoLocation; courierInstructions?: string; packItems?: ResolvedPackOrderItem[] },
  ): Promise<Order> {
    const packOrderItems = opts?.packItems ?? [];
    const totalAmount = cartItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
      + packOrderItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const supplierIds = Array.from(new Set([...cartItems.map((i) => i.supplierId), ...packOrderItems.map((i) => i.supplierId)]));
    const primarySupplierId = supplierIds.length === 1 ? supplierIds[0] : null;

    const [order] = await db.insert(orders).values({
      cafeId,
      supplierId: primarySupplierId,
      status: 'PENDING',
      totalAmount,
      deliveryAddress: opts?.deliveryAddress ?? null,
      courierInstructions: opts?.courierInstructions?.trim() || null,
    }).returning();

    for (const item of cartItems) {
      const variants = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, item.listingId));
      if (variants.length > 0) {
        const variant = variants.find(
          (v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null),
        );
        if (variant) {
          await db.update(supplierProductVariants)
            .set({ quantity: sql`${supplierProductVariants.quantity} - ${item.quantity}` })
            .where(eq(supplierProductVariants.id, variant.id));
        }
      } else {
        await db.update(supplierProductListings)
          .set({ stock: sql`${supplierProductListings.stock} - ${item.quantity}` })
          .where(eq(supplierProductListings.id, item.listingId));
      }

      const listingVariants = await this.getVariantsByListingId(item.listingId);
      const aggStock = listingVariants.reduce((s, v) => s + v.quantity, 0);
      const aggPrice = listingVariants.length ? Math.min(...listingVariants.map((v) => v.price)) : 0;
      await db.update(supplierProductListings)
        .set({ stock: aggStock, price: aggPrice })
        .where(eq(supplierProductListings.id, item.listingId));
    }

    for (const item of packOrderItems) {
      await db.update(packs)
        .set({ quantityAvailable: sql`${packs.quantityAvailable} - ${item.quantity}` })
        .where(eq(packs.id, item.packId));
    }

    if (supplierIds.length > 1) {
      for (const sid of supplierIds) {
        const supplierItems = cartItems.filter((i) => i.supplierId === sid);
        const supplierPackItems = packOrderItems.filter((i) => i.supplierId === sid);
        const subtotal = supplierItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
          + supplierPackItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        const supplierName = supplierItems[0]?.supplierName ?? supplierPackItems[0]?.supplierName ?? 'Unknown';
        const [so] = await db.insert(subOrders).values({ orderId: order.id, supplierId: sid, supplierName, subtotal }).returning();
        for (const item of supplierItems) {
          await db.insert(orderItems).values({ orderId: order.id, subOrderId: so.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.unitPrice * item.quantity, flavorId: item.flavorId ?? null, sizeId: item.sizeId ?? null });
        }
        for (const item of supplierPackItems) {
          await db.insert(orderItems).values({ orderId: order.id, subOrderId: so.id, packId: item.packId, packName: item.packName, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.unitPrice * item.quantity });
        }
      }
    } else {
      for (const item of cartItems) {
        await db.insert(orderItems).values({ orderId: order.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.unitPrice * item.quantity, flavorId: item.flavorId ?? null, sizeId: item.sizeId ?? null });
      }
      for (const item of packOrderItems) {
        await db.insert(orderItems).values({ orderId: order.id, packId: item.packId, packName: item.packName, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.unitPrice * item.quantity });
      }
    }
    return order;
  }

  async updateOrderStatus(id: number, status: typeof orders.$inferSelect.status, deliveryId?: number) {
    const [existing] = await db.select().from(orders).where(eq(orders.id, id));
    const updates: any = { status };
    if (deliveryId) updates.deliveryId = deliveryId;
    const [updated] = await db.update(orders).set(updates).where(eq(orders.id, id)).returning();

    // Restock inventory when an order is cancelled (covers cancellation and refund flows,
    // since this schema has no separate REFUNDED status — refunds are modeled as cancellations).
    if (existing && existing.status !== 'CANCELLED' && status === 'CANCELLED') {
      await this.restockOrderInventory(id);
    }
    return updated;
  }

  /** Restores stock for every item in an order back to the suppliers' listings/variants. Used on order cancellation. */
  private async restockOrderInventory(orderId: number) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      if (item.packId) {
        await db.update(packs).set({ quantityAvailable: sql`${packs.quantityAvailable} + ${item.quantity}` }).where(eq(packs.id, item.packId));
        continue;
      }
      if (!item.productId) continue;
      // Find the listing this order item came from (best-effort: match by product; the order item
      // doesn't store listingId directly, so we search the ordering supplier's listing for this product).
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      const supplierIdForItem = order?.supplierId ?? (await db.select().from(subOrders).where(eq(subOrders.orderId, orderId)))
        .find(() => true)?.supplierId;
      const candidateListings = supplierIdForItem
        ? await db.select().from(supplierProductListings).where(and(eq(supplierProductListings.productId, item.productId), eq(supplierProductListings.supplierId, supplierIdForItem)))
        : await db.select().from(supplierProductListings).where(eq(supplierProductListings.productId, item.productId));
      const listing = candidateListings[0];
      if (!listing) continue;

      if (item.flavorId != null || item.sizeId != null) {
        const variants = await this.getVariantsByListingId(listing.id);
        const variant = variants.find((v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (variant) {
          await this.restockVariantFromOrderCancellation(variant.id, item.quantity, `Order #${orderId} cancelled`);
          continue;
        }
      }
      await this.restockFromOrderCancellation(listing.id, item.quantity, `Order #${orderId} cancelled`);
    }
  }

  // ── Marketplace ─────────────────────────────────────────────────────────────

  async getMarketplaceProducts(filters?: { categoryId?: number; subCategoryId?: number; search?: string }): Promise<MarketplaceProduct[]> {
    const allProducts = await db.select().from(products).where(eq(products.isAdminProduct, true));
    const allListings = await db.select().from(supplierProductListings);
    const allVariants = await db.select().from(supplierProductVariants);
    const allUsers = await db.select().from(users);
    const frozenMappings = await db.select().from(supplierCategories).where(eq(supplierCategories.isFrozen, true));
    const frozenSet = new Set(frozenMappings.map((f) => `${f.supplierId}:${f.categoryId}`));
    const tx = await buildTaxonomyCache();

    const supplierMap = new Map(allUsers.map((u) => [u.id, { name: u.name, lat: u.locationLat, lng: u.locationLng }]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const v of allVariants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }

    let prods = allProducts;
    if (filters?.categoryId) prods = prods.filter((p) => p.categoryId === filters.categoryId);
    if (filters?.subCategoryId) prods = prods.filter((p) => p.subCategoryId === filters.subCategoryId);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      prods = prods.filter((p) => p.name.toLowerCase().includes(q));
    }

    const result: MarketplaceProduct[] = [];
    for (const prod of prods) {
      const listings = allListings.filter((l) => l.productId === prod.id);
      if (!listings.length) continue;
      const marketListings: MarketplaceListing[] = listings
        .filter((l) => {
          if (l.onlyForPack) return false;
          if (prod.categoryId && frozenSet.has(`${l.supplierId}:${prod.categoryId}`)) return false;
          return true;
        })
        .map((l) => {
          const rawVariants = variantsByListing.get(l.id) ?? [];
          const variants = rawVariants
            .filter((v) => v.price > 0 && v.quantity > 0)
            .map((v) => ({
              id: v.id,
              listingId: v.listingId,
              flavorId: v.flavorId,
              sizeId: v.sizeId,
              flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
              sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
              price: v.price,
              quantity: v.quantity,
            }));
          const totalStock = variants.length ? variants.reduce((s, v) => s + v.quantity, 0) : (l.stock > 0 && l.price > 0 ? l.stock : 0);
          const minPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : (l.price > 0 ? l.price : 0);
          const sup = supplierMap.get(l.supplierId);
          return { id: l.id, supplierId: l.supplierId, supplierName: sup?.name ?? "", supplierLat: sup?.lat ?? null, supplierLng: sup?.lng ?? null, variants, totalStock, minPrice };
        })
        .filter((l) => l.totalStock > 0 && l.minPrice > 0);
      if (!marketListings.length) continue;
      const bestPrice = Math.min(...marketListings.map((l) => l.minPrice));
      const totalStock = marketListings.reduce((s, l) => s + l.totalStock, 0);
      result.push({ ...enrichProduct(prod, tx), listings: marketListings, bestPrice, totalStock, supplierCount: marketListings.length });
    }
    return result;
  }

  async getMarketplaceProduct(productId: number): Promise<MarketplaceProduct | undefined> {
    const all = await this.getMarketplaceProducts();
    return all.find((p) => p.id === productId);
  }

  // ── Favorites ───────────────────────────────────────────────────────────────

  async getFavoritesByUser(userId: number): Promise<ShopFavoriteItem[]> {
    const rows = await db.select().from(favorites).where(eq(favorites.userId, userId));
    if (!rows.length) return [];
    const productIds = rows.map((r) => r.productId);
    const prods = await db.select().from(products).where(inArray(products.id, productIds));
    const prodMap = new Map(prods.map((p) => [p.id, p]));
    return rows
      .map((r) => prodMap.get(r.productId))
      .filter((p): p is typeof products.$inferSelect => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        supplier: p.category ?? "",
        price: p.price ?? 0,
        image: p.imageUrl ?? "",
      }));
  }

  async addFavorite(userId: number, productId: number): Promise<void> {
    const existing = await db.select().from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
    if (existing.length) return;
    await db.insert(favorites).values({ userId, productId });
  }

  async removeFavorite(userId: number, productId: number): Promise<void> {
    await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
  }

  // ── Supplier variants ───────────────────────────────────────────────────────

  async getVariantsByListingId(listingId: number): Promise<SupplierVariantWithLabels[]> {
    const variants = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, listingId));
    const tx = await buildTaxonomyCache();
    return variants.map((v) => ({
      ...v,
      flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
      sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
    }));
  }

  async saveVariants(listingId: number, variants: { flavorId?: number | null; sizeId?: number | null; price: number; quantity: number }[]): Promise<SupplierVariantWithLabels[]> {
    await db.delete(supplierProductVariants).where(eq(supplierProductVariants.listingId, listingId));
    if (!variants.length) {
      await db.update(supplierProductListings).set({ price: 0, stock: 0 }).where(eq(supplierProductListings.id, listingId));
      return [];
    }
    const inserted = await db.insert(supplierProductVariants).values(variants.map((v) => ({ listingId, flavorId: v.flavorId ?? null, sizeId: v.sizeId ?? null, price: v.price, quantity: v.quantity }))).returning();
    const aggPrice = Math.min(...inserted.map((v) => v.price));
    const aggStock = inserted.reduce((s, v) => s + v.quantity, 0);
    await db.update(supplierProductListings).set({ price: aggPrice, stock: aggStock }).where(eq(supplierProductListings.id, listingId));
    const tx = await buildTaxonomyCache();
    return inserted.map((v) => ({
      ...v,
      flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
      sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
    }));
  }

  // ── Categories ──────────────────────────────────────────────────────────────

  async getCategories(opts?: { includeAll?: boolean }): Promise<CategoryWithCount[]> {
    const cats = opts?.includeAll
      ? await db.select().from(categories).orderBy(asc(categories.displayOrder), asc(categories.id))
      : await db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true))).orderBy(asc(categories.displayOrder), asc(categories.id));
    const subs = await db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)));
    const prods = await db.select().from(products);
    return cats.map((c) => ({
      ...c,
      subCategoryCount: subs.filter((s) => s.categoryId === c.id).length,
      productCount: prods.filter((p) => p.categoryId === c.id).length,
    }));
  }

  async getCategory(id: number) {
    const [cat] = await db.select().from(categories).where(eq(categories.id, id));
    return cat;
  }

  async createCategory(cat: Partial<InsertCategory>) {
    const [created] = await db.insert(categories).values(cat as any).returning();
    return created;
  }

  async updateCategory(id: number, updates: Partial<InsertCategory>) {
    const normalized = { ...updates } as Partial<InsertCategory>;
    if (normalized.isActive === false) normalized.status = 'REJECTED';
    if (normalized.isActive === true) normalized.status = 'ACTIVE';
    if (normalized.status === 'ACTIVE') normalized.isActive = true;
    if (normalized.status === 'REJECTED' || normalized.status === 'PENDING') normalized.isActive = false;
    const [updated] = await db.update(categories).set(normalized as any).where(eq(categories.id, id)).returning();
    return updated;
  }

  async deleteCategory(id: number) {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // ── SubCategories ───────────────────────────────────────────────────────────

  async getSubCategories(categoryId?: number, opts?: { includeAll?: boolean }): Promise<SubCategoryWithDetails[]> {
    let subs;
    if (opts?.includeAll) {
      subs = categoryId
        ? await db.select().from(subCategories).where(eq(subCategories.categoryId, categoryId))
        : await db.select().from(subCategories);
    } else {
      subs = categoryId
        ? await db.select().from(subCategories).where(and(eq(subCategories.categoryId, categoryId), eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)))
        : await db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)));
    }
    const cats = await db.select().from(categories);
    const prods = await db.select().from(products);
    const catMap = new Map(cats.map((c) => [c.id, c.name]));
    return subs.map((s) => ({
      ...s,
      categoryName: catMap.get(s.categoryId) ?? "",
      productCount: prods.filter((p) => p.subCategoryId === s.id).length,
    }));
  }

  async createSubCategory(sub: Partial<InsertSubCategory>) {
    const [created] = await db.insert(subCategories).values(sub as any).returning();
    return created;
  }

  async updateSubCategory(id: number, updates: Partial<InsertSubCategory>) {
    const normalized = { ...updates } as Partial<InsertSubCategory>;
    if (normalized.isActive === false) normalized.status = 'REJECTED';
    if (normalized.isActive === true) normalized.status = 'ACTIVE';
    if (normalized.status === 'ACTIVE') normalized.isActive = true;
    if (normalized.status === 'REJECTED' || normalized.status === 'PENDING') normalized.isActive = false;
    const [updated] = await db.update(subCategories).set(normalized as any).where(eq(subCategories.id, id)).returning();
    return updated;
  }

  async deleteSubCategory(id: number) {
    await db.delete(subCategories).where(eq(subCategories.id, id));
  }

  // ── Flavors ─────────────────────────────────────────────────────────────────

  async getFlavors(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<FlavorWithCount[]> {
    const all = filters?.includeAll
      ? await db.select().from(flavors)
      : await db.select().from(flavors).where(eq(flavors.status, 'ACTIVE'));
    const prods = await db.select().from(products);
    const subs = await db.select().from(subCategories);
    const subMap = new Map(subs.map((s) => [s.id, s.name]));
    let filtered = all;
    if (filters?.subCategoryId) filtered = filtered.filter((f) => f.subCategoryIds?.includes(filters.subCategoryId!));
    return filtered.map((f) => ({
      ...f,
      productCount: prods.filter((p) => p.flavorId === f.id || p.flavorIds?.includes(f.id)).length,
      subCategoryNames: (f.subCategoryIds ?? []).map((id) => subMap.get(id) ?? "").filter(Boolean),
    }));
  }

  async createFlavor(f: Partial<InsertFlavor>) {
    const [created] = await db.insert(flavors).values(f as any).returning();
    return created;
  }

  async updateFlavor(id: number, updates: Partial<InsertFlavor>) {
    const [updated] = await db.update(flavors).set(updates as any).where(eq(flavors.id, id)).returning();
    return updated;
  }

  async deleteFlavor(id: number) {
    await db.delete(flavors).where(eq(flavors.id, id));
  }

  // ── Sizes ───────────────────────────────────────────────────────────────────

  async getSizes(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<SizeWithCount[]> {
    const all = filters?.includeAll
      ? await db.select().from(sizes)
      : await db.select().from(sizes).where(eq(sizes.status, 'ACTIVE'));
    const prods = await db.select().from(products);
    const subs = await db.select().from(subCategories);
    const subMap = new Map(subs.map((s) => [s.id, s.name]));
    let filtered = all;
    if (filters?.subCategoryId) filtered = filtered.filter((s) => s.subCategoryIds?.includes(filters.subCategoryId!));
    return filtered.map((s) => ({
      ...s,
      productCount: prods.filter((p) => p.sizeId === s.id || p.sizeIds?.includes(s.id)).length,
      subCategoryNames: (s.subCategoryIds ?? []).map((id) => subMap.get(id) ?? "").filter(Boolean),
    }));
  }

  async createSize(s: Partial<InsertSize>) {
    const [created] = await db.insert(sizes).values(s as any).returning();
    return created;
  }

  async updateSize(id: number, updates: Partial<InsertSize>) {
    const [updated] = await db.update(sizes).set(updates as any).where(eq(sizes.id, id)).returning();
    return updated;
  }

  async deleteSize(id: number) {
    await db.delete(sizes).where(eq(sizes.id, id));
  }

  // ── Brands ──────────────────────────────────────────────────────────────────

  async getBrands(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<BrandWithCount[]> {
    const all = filters?.includeAll
      ? await db.select().from(brands)
      : await db.select().from(brands).where(eq(brands.status, 'ACTIVE'));
    const prods = await db.select().from(products);
    const subs = await db.select().from(subCategories);
    const subMap = new Map(subs.map((s) => [s.id, s.name]));
    let filtered = all;
    if (filters?.subCategoryId) filtered = filtered.filter((b) => b.subCategoryIds?.includes(filters.subCategoryId!));
    return filtered.map((b) => ({
      ...b,
      productCount: prods.filter((p) => p.brandId === b.id).length,
      subCategoryNames: (b.subCategoryIds ?? []).map((id) => subMap.get(id) ?? "").filter(Boolean),
    }));
  }

  async createBrand(b: Partial<InsertBrand>) {
    const [created] = await db.insert(brands).values(b as any).returning();
    return created;
  }

  async updateBrand(id: number, updates: Partial<InsertBrand>) {
    const [updated] = await db.update(brands).set(updates as any).where(eq(brands.id, id)).returning();
    return updated;
  }

  async deleteBrand(id: number) {
    await db.delete(brands).where(eq(brands.id, id));
  }

  // ── Supplier mappings ───────────────────────────────────────────────────────

  async getSupplierCategoryMappings(supplierId: number, options?: { approvedOnly?: boolean }): Promise<SupplierCategoryMapping[]> {
    const allCats = await db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true)));
    const allSubs = await db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)));
    const supplierCats = await db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
    const supplierSubs = await db.select().from(supplierSubCategories).where(eq(supplierSubCategories.supplierId, supplierId));
    const catMeta = new Map(supplierCats.map((sc) => [sc.categoryId, sc]));

    return allCats
      .filter((cat) => catMeta.has(cat.id))
      .filter((cat) => {
        const meta = catMeta.get(cat.id)!;
        if (options?.approvedOnly) {
          return meta.mappingStatus === 'APPROVED' && !meta.isFrozen;
        }
        return true;
      })
      .map((cat) => {
        const meta = catMeta.get(cat.id)!;
        return {
          category: cat,
          subCategories: allSubs.filter((s) => s.categoryId === cat.id),
          selectedSubCategoryIds: supplierSubs
            .filter((ss) => allSubs.some((s) => s.id === ss.subCategoryId && s.categoryId === cat.id))
            .map((ss) => ss.subCategoryId),
          mappingStatus: (meta.mappingStatus === 'PENDING' ? 'PENDING' : 'APPROVED') as 'APPROVED' | 'PENDING',
          isFrozen: meta.isFrozen ?? false,
        };
      });
  }

  async getAdminSupplierCategoryOverview(supplierId: number): Promise<AdminSupplierCategoryOverview> {
    const allMappings = await this.getSupplierCategoryMappings(supplierId);
    const allCats = await db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true)));
    const mappedIds = new Set(allMappings.map((m) => m.category.id));

    return {
      supplierId,
      approved: allMappings.filter((m) => m.mappingStatus === 'APPROVED'),
      pending: allMappings.filter((m) => m.mappingStatus === 'PENDING'),
      notAdded: allCats.filter((c) => !mappedIds.has(c.id)),
    };
  }

  async addSupplierCategories(supplierId: number, categoryIds: number[], status: 'APPROVED' | 'PENDING' = 'PENDING') {
    const existing = await db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
    const existingIds = new Set(existing.map((e) => e.categoryId));
    const newIds = categoryIds.filter((id) => !existingIds.has(id));
    if (newIds.length) {
      await db.insert(supplierCategories).values(
        newIds.map((categoryId) => ({ supplierId, categoryId, mappingStatus: status, isFrozen: false })),
      );
    }
  }

  async removeSupplierCategory(supplierId: number, categoryId: number) {
    const allSubs = await db.select().from(subCategories).where(eq(subCategories.categoryId, categoryId));
    const subIds = allSubs.map((s) => s.id);
    await db.delete(supplierCategories).where(
      and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)),
    );
    if (subIds.length) {
      await db.delete(supplierSubCategories).where(
        and(eq(supplierSubCategories.supplierId, supplierId), inArray(supplierSubCategories.subCategoryId, subIds)),
      );
    }
  }

  async setSupplierCategoryFrozen(supplierId: number, categoryId: number, isFrozen: boolean) {
    await db.update(supplierCategories)
      .set({ isFrozen })
      .where(and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)));
  }

  async approveSupplierCategoryMapping(supplierId: number, categoryId: number) {
    await db.update(supplierCategories)
      .set({ mappingStatus: 'APPROVED' })
      .where(and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)));
  }

  async setSupplierCategories(supplierId: number, categoryIds: number[]) {
    const existing = await db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));

    // Never drop supplier-initiated PENDING mappings omitted from bulk admin selection
    const pendingPreservedIds = existing
      .filter((e) => e.mappingStatus === 'PENDING' && !categoryIds.includes(e.categoryId))
      .map((e) => e.categoryId);
    const finalCategoryIds = Array.from(new Set([...categoryIds, ...pendingPreservedIds]));

    const allSubs = await db.select().from(subCategories);
    const validSubIds = new Set(allSubs.filter((s) => finalCategoryIds.includes(s.categoryId)).map((s) => s.id));
    const supplierSubs = await db.select().from(supplierSubCategories).where(eq(supplierSubCategories.supplierId, supplierId));
    const orphanSubIds = supplierSubs.filter((ss) => !validSubIds.has(ss.subCategoryId)).map((ss) => ss.subCategoryId);

    if (finalCategoryIds.length === 0) {
      await db.delete(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
    } else {
      await db.delete(supplierCategories).where(
        and(
          eq(supplierCategories.supplierId, supplierId),
          notInArray(supplierCategories.categoryId, finalCategoryIds),
        ),
      );
    }

    const existingIds = new Set(existing.map((e) => e.categoryId));
    const toInsert = finalCategoryIds.filter((cid) => !existingIds.has(cid));
    if (toInsert.length) {
      await db.insert(supplierCategories).values(
        toInsert.map((cid) => ({
          supplierId,
          categoryId: cid,
          mappingStatus: 'APPROVED' as const,
          isFrozen: false,
        })),
      );
    }
    if (orphanSubIds.length) {
      await db.delete(supplierSubCategories).where(
        and(eq(supplierSubCategories.supplierId, supplierId), inArray(supplierSubCategories.subCategoryId, orphanSubIds)),
      );
    }
  }

  async setSupplierSubCategories(supplierId: number, subCategoryIds: number[]) {
    const supplierCats = await db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
    const selectedCatIds = new Set(supplierCats.map((sc) => sc.categoryId));
    const allSubs = await db.select().from(subCategories);
    const validSubIds = subCategoryIds.filter((sid) => {
      const sub = allSubs.find((s) => s.id === sid);
      return sub && selectedCatIds.has(sub.categoryId);
    });

    await db.delete(supplierSubCategories).where(eq(supplierSubCategories.supplierId, supplierId));
    if (validSubIds.length) {
      await db.insert(supplierSubCategories).values(validSubIds.map((sid) => ({ supplierId, subCategoryId: sid })));
    }
  }

  async isProductAllowedForSupplier(supplierId: number, productId: number): Promise<boolean> {
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product?.isAdminProduct) return false;
    if (!product.categoryId) return false;

    const mappings = await this.getSupplierCategoryMappings(supplierId, { approvedOnly: true });
    if (!mappings.length) return false;

    const mappedCatIds = new Set(mappings.map((m) => m.category.id));
    if (!mappedCatIds.has(product.categoryId)) return false;

    const catMapping = mappings.find((m) => m.category.id === product.categoryId);
    if (catMapping && catMapping.selectedSubCategoryIds.length > 0) {
      if (!product.subCategoryId) return false;
      return catMapping.selectedSubCategoryIds.includes(product.subCategoryId);
    }
    return true;
  }

  // ── Supplier product listings ───────────────────────────────────────────────

  async getSupplierListings(supplierId: number, filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number }): Promise<SupplierListingWithProduct[]> {
    const listings = await db.select().from(supplierProductListings).where(eq(supplierProductListings.supplierId, supplierId));
    const allProducts = await db.select().from(products);
    const allVariants = await db.select().from(supplierProductVariants);
    const tx = await buildTaxonomyCache();
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const v of allVariants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }

    let result = listings.map((l) => {
      const prod = productMap.get(l.productId);
      if (!prod) return null;
      const variants = (variantsByListing.get(l.id) ?? []).map((v) => ({
        ...v,
        flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
        sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
      }));
      return { ...l, product: enrichProduct(prod, tx), variants };
    }).filter(Boolean) as SupplierListingWithProduct[];

    if (filters?.categoryId) result = result.filter((l) => l.product.categoryId === filters.categoryId);
    if (filters?.subCategoryId) result = result.filter((l) => l.product.subCategoryId === filters.subCategoryId);
    if (filters?.flavorId) result = result.filter((l) => l.product.flavorId === filters.flavorId || l.product.flavorIds?.includes(filters.flavorId!));
    if (filters?.sizeId) result = result.filter((l) => l.product.sizeId === filters.sizeId || l.product.sizeIds?.includes(filters.sizeId!));
    if (filters?.brandId) result = result.filter((l) => l.product.brandId === filters.brandId);
    return result;
  }

  async createSupplierListing(data: Partial<InsertSupplierProductListing>) {
    const [created] = await db.insert(supplierProductListings).values(data as any).returning();
    return created;
  }

  async updateSupplierListing(id: number, updates: { price?: number; stock?: number; availableFlavorIds?: number[]; availableSizeIds?: number[]; availableBrandIds?: number[] }) {
    const [updated] = await db.update(supplierProductListings).set(updates as any).where(eq(supplierProductListings.id, id)).returning();
    return updated;
  }

  async deleteSupplierListing(id: number) {
    await db.delete(supplierProductVariants).where(eq(supplierProductVariants.listingId, id));
    await db.delete(inventoryAdjustments).where(eq(inventoryAdjustments.listingId, id));
    await db.delete(supplierProductListings).where(eq(supplierProductListings.id, id));
  }

  // ── Inventory ────────────────────────────────────────────────────────────────

  private computeStockStatus(stock: number, minStock: number): StockStatus {
    if (stock <= 0) return 'OUT_OF_STOCK';
    if (stock < minStock) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  /** Per-variant status: only counts as LOW_STOCK when a minStock has actually been configured for it. */
  private computeVariantStockStatus(stock: number, minStock: number | null): StockStatus {
    if (stock <= 0) return 'OUT_OF_STOCK';
    if (minStock != null && stock <= minStock) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  /** Rolls up a set of per-variant statuses into one product-level status: Out of Stock > Low Stock > In Stock. */
  private aggregateStockStatus(statuses: StockStatus[]): StockStatus {
    if (statuses.some((s) => s === 'OUT_OF_STOCK')) return 'OUT_OF_STOCK';
    if (statuses.some((s) => s === 'LOW_STOCK')) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  /** Builds the full enriched inventory row set for a supplier (pre-filter/sort/paginate). */
  private async buildInventoryItems(supplierId: number): Promise<InventoryItem[]> {
    const listings = await db.select().from(supplierProductListings).where(eq(supplierProductListings.supplierId, supplierId));
    if (!listings.length) return [];
    const productIds = Array.from(new Set(listings.map((l) => l.productId)));
    const prods = await db.select().from(products).where(inArray(products.id, productIds));
    const productMap = new Map(prods.map((p) => [p.id, p]));
    const allVariants = await db.select().from(supplierProductVariants).where(inArray(supplierProductVariants.listingId, listings.map((l) => l.id)));
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const v of allVariants) {
      const arr = variantsByListing.get(v.listingId) ?? [];
      arr.push(v);
      variantsByListing.set(v.listingId, arr);
    }
    const packItemRows = await db.select().from(packItems).where(inArray(packItems.listingId, listings.map((l) => l.id)));
    const listingsWithPacks = new Set(packItemRows.map((pi) => pi.listingId));
    const tx = await buildTaxonomyCache();

    const items: InventoryItem[] = [];
    for (const l of listings) {
      const prod = productMap.get(l.productId);
      if (!prod) continue;
      const listingVariants = variantsByListing.get(l.id) ?? [];
      const hasVariants = listingVariants.length > 0;
      const category = prod.categoryId ? tx.catMap.get(prod.categoryId) : undefined;
      const brand = prod.brandId ? tx.brdMap.get(prod.brandId) : undefined;

      const variantItems: InventoryVariantItem[] = listingVariants.map((v) => {
        const flavorName = v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null;
        const sizeName = v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null;
        const variantName = [flavorName, sizeName].filter(Boolean).join(' · ') || `Variant #${v.id}`;
        return {
          variantId: v.id,
          listingId: l.id,
          flavorId: v.flavorId ?? null,
          sizeId: v.sizeId ?? null,
          variantName,
          unit: sizeName ?? l.unit,
          stock: v.quantity,
          minStock: v.minStock ?? null,
          maxStock: v.maxStock ?? null,
          price: v.price,
          stockStatus: this.computeVariantStockStatus(v.quantity, v.minStock ?? null),
        };
      });

      const stockStatus = hasVariants
        ? this.aggregateStockStatus(variantItems.map((v) => v.stockStatus))
        : this.computeStockStatus(l.stock, l.minStock);

      items.push({
        listingId: l.id,
        productId: prod.id,
        supplierId: l.supplierId,
        productName: prod.name,
        imageUrl: prod.imageUrl ?? null,
        sku: l.sku ?? null,
        barcode: l.barcode ?? null,
        categoryId: prod.categoryId ?? null,
        categoryName: category?.name ?? null,
        brandId: prod.brandId ?? null,
        brandName: brand?.name ?? null,
        stock: l.stock,
        minStock: l.minStock,
        maxStock: l.maxStock ?? null,
        unit: l.unit,
        price: l.price,
        inventoryValue: l.stock * l.price,
        stockStatus,
        productStatus: prod.status,
        visibility: l.visibility,
        hasVariants,
        hasPacks: listingsWithPacks.has(l.id),
        onlyForPack: l.onlyForPack,
        onlyForMyProducts: l.onlyForMyProducts,
        variants: variantItems,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      });
    }
    return items;
  }

  private applyInventoryFilters(items: InventoryItem[], filters?: InventoryFilters): InventoryItem[] {
    let result = items;
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((i) =>
        i.productName.toLowerCase().includes(q) ||
        (i.sku ?? '').toLowerCase().includes(q) ||
        (i.barcode ?? '').toLowerCase().includes(q)
      );
    }
    if (filters?.categoryId) result = result.filter((i) => i.categoryId === filters.categoryId);
    if (filters?.brandId) result = result.filter((i) => i.brandId === filters.brandId);
    if (filters?.status === 'ACTIVE') result = result.filter((i) => i.visibility === 'VISIBLE' && i.productStatus !== 'PENDING');
    if (filters?.status === 'HIDDEN') result = result.filter((i) => i.visibility === 'HIDDEN');
    if (filters?.status === 'DRAFT') result = result.filter((i) => i.productStatus === 'PENDING');
    if (filters?.stockStatus) result = result.filter((i) => i.stockStatus === filters.stockStatus);
    if (filters?.lowStockOnly) result = result.filter((i) => i.stockStatus === 'LOW_STOCK');
    if (filters?.minPrice !== undefined) result = result.filter((i) => i.price >= filters.minPrice!);
    if (filters?.maxPrice !== undefined) result = result.filter((i) => i.price <= filters.maxPrice!);
    if (filters?.hasPacks !== undefined) result = result.filter((i) => i.hasPacks === filters.hasPacks);
    return result;
  }

  private sortInventoryItems(items: InventoryItem[], sort?: InventorySort): InventoryItem[] {
    const arr = [...items];
    switch (sort) {
      case 'name_desc': return arr.sort((a, b) => b.productName.localeCompare(a.productName));
      case 'stock_asc': return arr.sort((a, b) => a.stock - b.stock);
      case 'stock_desc': return arr.sort((a, b) => b.stock - a.stock);
      case 'price_asc': return arr.sort((a, b) => a.price - b.price);
      case 'price_desc': return arr.sort((a, b) => b.price - a.price);
      case 'updated_desc': return arr.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
      case 'created_desc': return arr.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      case 'name_asc':
      default: return arr.sort((a, b) => a.productName.localeCompare(b.productName));
    }
  }

  async getSupplierInventory(supplierId: number, filters?: InventoryFilters, sort?: InventorySort, page = 1, pageSize = 50): Promise<InventoryListResult> {
    const all = await this.buildInventoryItems(supplierId);
    const filtered = this.applyInventoryFilters(all, filters);
    const sorted = this.sortInventoryItems(filtered, sort);
    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const items = sorted.slice(start, start + pageSize);
    return { items, total, page, pageSize };
  }

  async getSupplierInventoryStats(supplierId: number, filters?: InventoryFilters): Promise<InventoryStats> {
    const all = await this.buildInventoryItems(supplierId);
    const items = filters ? this.applyInventoryFilters(all, filters) : all;
    return {
      totalProducts: items.length,
      activeProducts: items.filter((i) => i.visibility === 'VISIBLE' && i.productStatus !== 'PENDING').length,
      hiddenProducts: items.filter((i) => i.visibility === 'HIDDEN').length,
      inStock: items.filter((i) => i.stockStatus === 'IN_STOCK').length,
      lowStock: items.filter((i) => i.stockStatus === 'LOW_STOCK').length,
      outOfStock: items.filter((i) => i.stockStatus === 'OUT_OF_STOCK').length,
      totalUnits: items.reduce((s, i) => s + i.stock, 0),
      inventoryValue: items.reduce((s, i) => s + i.inventoryValue, 0),
    };
  }

  async getListingForSupplier(listingId: number, supplierId: number) {
    const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
    if (!listing || listing.supplierId !== supplierId) return undefined;
    return listing;
  }

  /** Adjusts a listing's aggregate stock, records history, and returns the updated listing. Only valid for listings without per-variant stock. */
  async adjustListingStock(listingId: number, supplierId: number, userId: number | null, input: { type: 'INCREASE' | 'DECREASE' | 'SET'; quantity: number; reason: string; notes?: string }) {
    const listing = await this.getListingForSupplier(listingId, supplierId);
    if (!listing) throw new Error('Listing not found');
    const variants = await this.getVariantsByListingId(listingId);
    if (variants.length > 0) throw new Error('This product has variants — adjust stock per variant instead');

    const previousStock = listing.stock;
    let newStock: number;
    if (input.type === 'INCREASE') newStock = previousStock + input.quantity;
    else if (input.type === 'DECREASE') newStock = previousStock - input.quantity;
    else newStock = input.quantity;
    if (newStock < 0) throw new Error('Stock cannot go below zero');

    const [updated] = await db.update(supplierProductListings)
      .set({ stock: newStock, updatedAt: new Date() })
      .where(eq(supplierProductListings.id, listingId))
      .returning();

    const [history] = await db.insert(inventoryAdjustments).values({
      listingId, supplierId, userId,
      adjustmentType: input.type,
      previousStock, newStock,
      difference: newStock - previousStock,
      reason: input.reason,
      notes: input.notes ?? null,
    }).returning();

    return { listing: updated, history };
  }

  async getListingStockHistory(listingId: number, supplierId: number): Promise<InventoryAdjustmentWithVariant[]> {
    const listing = await this.getListingForSupplier(listingId, supplierId);
    if (!listing) throw new Error('Listing not found');
    const rows = await db.select().from(inventoryAdjustments).where(eq(inventoryAdjustments.listingId, listingId)).orderBy(desc(inventoryAdjustments.createdAt));
    if (!rows.length) return [];
    const tx = await buildTaxonomyCache();
    return rows.map((r) => {
      if (r.flavorId == null && r.sizeId == null) return { ...r, variantName: null };
      const flavorName = r.flavorId ? (tx.flvMap.get(r.flavorId)?.name ?? null) : null;
      const sizeName = r.sizeId ? (tx.szMap.get(r.sizeId)?.name ?? null) : null;
      return { ...r, variantName: [flavorName, sizeName].filter(Boolean).join(' · ') || null };
    });
  }

  /** Finds a variant + its listing, verifying the listing belongs to this supplier. */
  private async getVariantForSupplier(variantId: number, supplierId: number) {
    const [variant] = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, variantId));
    if (!variant) return undefined;
    const listing = await this.getListingForSupplier(variant.listingId, supplierId);
    if (!listing) return undefined;
    return { variant, listing };
  }

  /** Recomputes and persists a listing's aggregate stock from the sum of its variants. */
  private async recalcListingAggregateStock(listingId: number) {
    const variants = await this.getVariantsByListingId(listingId);
    const aggStock = variants.reduce((s, v) => s + v.quantity, 0);
    await db.update(supplierProductListings).set({ stock: aggStock, updatedAt: new Date() }).where(eq(supplierProductListings.id, listingId));
  }

  /** Adjusts a single variant's stock (increase/decrease/set), enforcing that variant's own maxStock, and records history tagged to that variant. */
  async adjustVariantStock(variantId: number, supplierId: number, userId: number | null, input: { type: 'INCREASE' | 'DECREASE' | 'SET'; quantity: number; reason: string; notes?: string }) {
    const found = await this.getVariantForSupplier(variantId, supplierId);
    if (!found) throw new Error('Variant not found');
    const { variant } = found;

    const previousStock = variant.quantity;
    let newStock: number;
    if (input.type === 'INCREASE') newStock = previousStock + input.quantity;
    else if (input.type === 'DECREASE') newStock = previousStock - input.quantity;
    else newStock = input.quantity;
    if (newStock < 0) throw new Error('Stock cannot go below zero');
    if (variant.maxStock != null && newStock > variant.maxStock) {
      throw new Error(`Stock cannot exceed the maximum stock (${variant.maxStock}) configured for this variant`);
    }

    const [updatedVariant] = await db.update(supplierProductVariants)
      .set({ quantity: newStock })
      .where(eq(supplierProductVariants.id, variantId))
      .returning();

    await this.recalcListingAggregateStock(variant.listingId);

    const [history] = await db.insert(inventoryAdjustments).values({
      listingId: variant.listingId, variantId, flavorId: variant.flavorId ?? null, sizeId: variant.sizeId ?? null,
      supplierId, userId,
      adjustmentType: input.type,
      previousStock, newStock,
      difference: newStock - previousStock,
      reason: input.reason,
      notes: input.notes ?? null,
    }).returning();

    const [updatedListing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, variant.listingId));
    const lowStockTriggered = variant.minStock != null && newStock <= variant.minStock;
    return { variant: updatedVariant, listing: updatedListing, history, lowStockTriggered };
  }

  /** Updates a variant's min/max stock thresholds. Unit of measure is derived from size, not stored/editable here. */
  async updateVariantInventoryFields(variantId: number, supplierId: number, updates: { minStock?: number | null; maxStock?: number | null }) {
    const found = await this.getVariantForSupplier(variantId, supplierId);
    if (!found) throw new Error('Variant not found');
    const [updated] = await db.update(supplierProductVariants)
      .set(updates)
      .where(eq(supplierProductVariants.id, variantId))
      .returning();
    return updated;
  }

  async updateListingInventoryFields(listingId: number, supplierId: number, updates: { sku?: string | null; barcode?: string | null; minStock?: number; maxStock?: number | null; unit?: string; visibility?: 'VISIBLE' | 'HIDDEN' }) {
    const listing = await this.getListingForSupplier(listingId, supplierId);
    if (!listing) throw new Error('Listing not found');
    const [updated] = await db.update(supplierProductListings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(supplierProductListings.id, listingId))
      .returning();
    return updated;
  }

  /** System-driven stock restoration (order cancelled/refunded). No userId — shows as a system entry in history. */
  async restockFromOrderCancellation(listingId: number, quantity: number, reason: string) {
    const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
    if (!listing) return;
    const variants = await this.getVariantsByListingId(listingId);
    const previousStock = listing.stock;
    const newStock = previousStock + quantity;
    await db.update(supplierProductListings).set({ stock: newStock, updatedAt: new Date() }).where(eq(supplierProductListings.id, listingId));
    await db.insert(inventoryAdjustments).values({
      listingId, supplierId: listing.supplierId, userId: null,
      adjustmentType: 'INCREASE', previousStock, newStock, difference: newStock - previousStock,
      reason, notes: null,
    });
  }

  async restockVariantFromOrderCancellation(variantId: number, quantity: number, reason: string) {
    const [variant] = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, variantId));
    if (!variant) return;
    const previousVariantStock = variant.quantity;
    await db.update(supplierProductVariants).set({ quantity: sql`${supplierProductVariants.quantity} + ${quantity}` }).where(eq(supplierProductVariants.id, variantId));
    const listingVariants = await this.getVariantsByListingId(variant.listingId);
    const aggStock = listingVariants.reduce((s, v) => s + v.quantity, 0);
    const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, variant.listingId));
    if (!listing) return;
    const previousStock = listing.stock;
    await db.update(supplierProductListings).set({ stock: aggStock, updatedAt: new Date() }).where(eq(supplierProductListings.id, variant.listingId));
    await db.insert(inventoryAdjustments).values({
      listingId: variant.listingId, variantId, flavorId: variant.flavorId ?? null, sizeId: variant.sizeId ?? null,
      supplierId: listing.supplierId, userId: null,
      adjustmentType: 'INCREASE', previousStock: previousVariantStock, newStock: previousVariantStock + quantity, difference: quantity,
      reason, notes: null,
    });
  }

  async bulkInventoryAction(supplierId: number, listingIds: number[], action: 'hide' | 'show' | 'delete' | 'setMinStock' | 'stock', payload?: { minStock?: number; type?: 'INCREASE' | 'DECREASE' | 'SET'; quantity?: number; reason?: string; userId?: number | null }) {
    const owned = await db.select().from(supplierProductListings).where(and(inArray(supplierProductListings.id, listingIds), eq(supplierProductListings.supplierId, supplierId)));
    const ids = owned.map((l) => l.id);
    if (!ids.length) return { updated: 0 };

    if (action === 'hide') {
      await db.update(supplierProductListings).set({ visibility: 'HIDDEN', updatedAt: new Date() }).where(inArray(supplierProductListings.id, ids));
    } else if (action === 'show') {
      await db.update(supplierProductListings).set({ visibility: 'VISIBLE', updatedAt: new Date() }).where(inArray(supplierProductListings.id, ids));
    } else if (action === 'delete') {
      await db.delete(supplierProductVariants).where(inArray(supplierProductVariants.listingId, ids));
      await db.delete(inventoryAdjustments).where(inArray(inventoryAdjustments.listingId, ids));
      await db.delete(supplierProductListings).where(inArray(supplierProductListings.id, ids));
    } else if (action === 'setMinStock' && payload?.minStock !== undefined) {
      await db.update(supplierProductListings).set({ minStock: payload.minStock, updatedAt: new Date() }).where(inArray(supplierProductListings.id, ids));
    } else if (action === 'stock' && payload?.type && payload?.quantity !== undefined) {
      for (const listing of owned) {
        const variants = await this.getVariantsByListingId(listing.id);
        if (variants.length > 0) continue; // skip variant-tracked listings in bulk stock updates
        const previousStock = listing.stock;
        let newStock: number;
        if (payload.type === 'INCREASE') newStock = previousStock + payload.quantity;
        else if (payload.type === 'DECREASE') newStock = Math.max(0, previousStock - payload.quantity);
        else newStock = payload.quantity;
        await db.update(supplierProductListings).set({ stock: newStock, updatedAt: new Date() }).where(eq(supplierProductListings.id, listing.id));
        await db.insert(inventoryAdjustments).values({
          listingId: listing.id, supplierId, userId: payload.userId ?? null,
          adjustmentType: payload.type, previousStock, newStock, difference: newStock - previousStock,
          reason: payload.reason ?? 'Bulk update', notes: null,
        });
      }
    }
    return { updated: ids.length };
  }

  // ── Packs ────────────────────────────────────────────────────────────────────

  private async buildPackDetails(rows: Pack[]): Promise<PackDetail[]> {
    if (!rows.length) return [];
    const packIds = rows.map((p) => p.id);
    const allItems = await db.select().from(packItems).where(inArray(packItems.packId, packIds));
    const listingIds = Array.from(new Set(allItems.map((i) => i.listingId)));
    const listings = listingIds.length ? await db.select().from(supplierProductListings).where(inArray(supplierProductListings.id, listingIds)) : [];
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    const variants = listingIds.length ? await db.select().from(supplierProductVariants).where(inArray(supplierProductVariants.listingId, listingIds)) : [];
    const variantMap = new Map(variants.map((v) => [v.id, v]));
    // Group variants by listing for flavor-distribution selection
    const variantsByListing = new Map<number, typeof variants>();
    for (const v of variants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }
    const productIds = Array.from(new Set(listings.map((l) => l.productId)));
    const prods = productIds.length ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
    const productMap = new Map(prods.map((p) => [p.id, p]));
    const supplierIds = Array.from(new Set(rows.map((p) => p.supplierId)));
    const suppliers = supplierIds.length ? await db.select().from(users).where(inArray(users.id, supplierIds)) : [];
    const supplierMap = new Map(suppliers.map((u) => [u.id, u.name]));
    const tx = await buildTaxonomyCache();
    const itemsByPack = new Map<number, typeof allItems>();
    for (const it of allItems) {
      if (!itemsByPack.has(it.packId)) itemsByPack.set(it.packId, []);
      itemsByPack.get(it.packId)!.push(it);
    }
    // Batch-fetch pack review stats
    const packReviews = packIds.length
      ? await db.select().from(supplierProductReviews)
          .where(and(inArray(supplierProductReviews.packId as any, packIds), eq(supplierProductReviews.reviewType, 'PACK')))
      : [];
    const reviewsByPack = new Map<number, typeof packReviews>();
    for (const r of packReviews) {
      const pid = (r as any).packId as number;
      if (!reviewsByPack.has(pid)) reviewsByPack.set(pid, []);
      reviewsByPack.get(pid)!.push(r);
    }

    const now = new Date();
    const result: PackDetail[] = [];
    for (const pack of rows) {
      const items = itemsByPack.get(pack.id) ?? [];
      const itemDetails: PackItemDetail[] = [];
      const categoryIds = new Set<number>();
      const subCategoryIds = new Set<number>();
      const brandIds = new Set<number>();
      let maxBuildable = items.length ? Infinity : 0;
      for (const it of items) {
        const listing = listingMap.get(it.listingId);
        const product = listing ? productMap.get(listing.productId) : undefined;
        const variant = it.variantId ? variantMap.get(it.variantId) : undefined;
        const unitPrice = variant ? variant.price : (listing?.price ?? 0);
        const availableQuantity = variant ? variant.quantity : (listing?.stock ?? 0);
        if (product?.categoryId) categoryIds.add(product.categoryId);
        if (product?.subCategoryId) subCategoryIds.add(product.subCategoryId);
        if (product?.brandId) brandIds.add(product.brandId);
        const buildable = it.quantity > 0 ? Math.floor(availableQuantity / it.quantity) : 0;
        maxBuildable = Math.min(maxBuildable, buildable);
        // Variants of this listing that share the same size as the selected variant
        // (flavor distribution must stay within the supplier-created size group — never
        // mix flavors across sizes).
        const sameGroupVariants = (variantsByListing.get(it.listingId) ?? []).filter((v) => {
          if (!variant) return true;
          return (v.sizeId ?? null) === (variant.sizeId ?? null);
        });
        const listingVariants: import('@shared/schema').PackVariantOption[] = sameGroupVariants.map((v) => ({
          variantId: v.id,
          flavorId: v.flavorId ?? null,
          flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
          sizeId: v.sizeId ?? null,
          sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
          price: v.price,
          availableQuantity: v.quantity,
        }));
        itemDetails.push({
          id: it.id,
          listingId: it.listingId,
          variantId: it.variantId,
          quantity: it.quantity,
          productId: product?.id ?? 0,
          productName: product?.name ?? "Unknown product",
          productImageUrl: product?.imageUrl ?? null,
          flavorId: variant?.flavorId ?? null,
          flavorName: variant?.flavorId ? (tx.flvMap.get(variant.flavorId)?.name ?? null) : null,
          sizeId: variant?.sizeId ?? null,
          sizeName: variant?.sizeId ? (tx.szMap.get(variant.sizeId)?.name ?? null) : null,
          unitPrice,
          availableQuantity,
          listingVariants,
        });
      }
      if (!isFinite(maxBuildable)) maxBuildable = 0;
      const isExpired = !!(pack.expirationDate && new Date(pack.expirationDate) < now);
      const isAvailable = !pack.isArchived && pack.visibility === 'VISIBLE' && !isExpired && maxBuildable > 0;
      const packRevs = reviewsByPack.get(pack.id) ?? [];
      const packReviewCount = packRevs.length;
      const packAvgRating = packReviewCount ? packRevs.reduce((s, r) => s + r.rating, 0) / packReviewCount : 0;
      result.push({
        ...pack,
        supplierName: supplierMap.get(pack.supplierId) ?? "",
        items: itemDetails,
        categoryIds: Array.from(categoryIds),
        subCategoryIds: Array.from(subCategoryIds),
        brandIds: Array.from(brandIds),
        categoryLabels: Array.from(categoryIds).map((id) => tx.catMap.get(id)).filter((l): l is NonNullable<typeof l> => !!l).map((l) => ({ id: l.id, name: l.name })),
        subCategoryLabels: Array.from(subCategoryIds).map((id) => tx.subMap.get(id)).filter((l): l is NonNullable<typeof l> => !!l).map((l) => ({ id: l.id, name: l.name })),
        brandLabels: Array.from(brandIds).map((id) => tx.brdMap.get(id)).filter((l): l is NonNullable<typeof l> => !!l).map((l) => ({ id: l.id, name: l.name })),
        maxBuildable,
        isAvailable,
        isExpired,
        packReviewCount,
        packAvgRating,
      });
    }
    return result;
  }

  async getSupplierPacks(supplierId: number): Promise<PackDetail[]> {
    const rows = await db.select().from(packs).where(and(eq(packs.supplierId, supplierId), eq(packs.isArchived, false))).orderBy(desc(packs.createdAt));
    const archived = await db.select().from(packs).where(and(eq(packs.supplierId, supplierId), eq(packs.isArchived, true))).orderBy(desc(packs.createdAt));
    return this.buildPackDetails([...rows, ...archived]);
  }

  async getPackDetail(id: number): Promise<PackDetail | undefined> {
    const [row] = await db.select().from(packs).where(eq(packs.id, id));
    if (!row) return undefined;
    const [detail] = await this.buildPackDetails([row]);
    return detail;
  }

  async createPack(supplierId: number, data: { name: string; description?: string | null; imageUrl?: string | null; price: number; quantityAvailable: number; expirationDate?: Date | null; visibility?: 'VISIBLE' | 'HIDDEN' }, items: { listingId: number; variantId?: number | null; quantity: number }[]): Promise<PackDetail> {
    const [pack] = await db.insert(packs).values({
      supplierId,
      name: data.name,
      description: data.description ?? null,
      imageUrl: data.imageUrl ?? null,
      price: data.price,
      quantityAvailable: data.quantityAvailable,
      expirationDate: data.expirationDate ?? null,
      visibility: data.visibility ?? 'VISIBLE',
    }).returning();
    if (items.length) {
      await db.insert(packItems).values(items.map((i) => ({ packId: pack.id, listingId: i.listingId, variantId: i.variantId ?? null, quantity: i.quantity })));
    }
    const [detail] = await this.buildPackDetails([pack]);
    return detail;
  }

  async updatePack(id: number, supplierId: number, data: Partial<{ name: string; description: string | null; imageUrl: string | null; price: number; quantityAvailable: number; expirationDate: Date | null; visibility: 'VISIBLE' | 'HIDDEN'; isArchived: boolean }>, items?: { listingId: number; variantId?: number | null; quantity: number }[]): Promise<PackDetail | undefined> {
    const [existing] = await db.select().from(packs).where(and(eq(packs.id, id), eq(packs.supplierId, supplierId)));
    if (!existing) return undefined;
    const [updated] = await db.update(packs).set({ ...data, updatedAt: new Date() } as any).where(eq(packs.id, id)).returning();
    if (items !== undefined) {
      await db.delete(packItems).where(eq(packItems.packId, id));
      if (items.length) {
        await db.insert(packItems).values(items.map((i) => ({ packId: id, listingId: i.listingId, variantId: i.variantId ?? null, quantity: i.quantity })));
      }
    }
    const [detail] = await this.buildPackDetails([updated]);
    return detail;
  }

  async duplicatePack(id: number, supplierId: number): Promise<PackDetail | undefined> {
    const [existing] = await db.select().from(packs).where(and(eq(packs.id, id), eq(packs.supplierId, supplierId)));
    if (!existing) return undefined;
    const existingItems = await db.select().from(packItems).where(eq(packItems.packId, id));
    return this.createPack(supplierId, {
      name: `${existing.name} (copy)`,
      description: existing.description,
      imageUrl: existing.imageUrl,
      price: existing.price,
      quantityAvailable: existing.quantityAvailable,
      expirationDate: existing.expirationDate,
      visibility: existing.visibility === 'VISIBLE' ? 'HIDDEN' : existing.visibility,
    }, existingItems.map((i) => ({ listingId: i.listingId, variantId: i.variantId, quantity: i.quantity })));
  }

  async deletePack(id: number): Promise<void> {
    await db.delete(packFavorites).where(eq(packFavorites.packId, id));
    await db.delete(packItems).where(eq(packItems.packId, id));
    await db.delete(packs).where(eq(packs.id, id));
  }

  async getMarketplacePacks(filters?: { categoryId?: number; subCategoryId?: number; brandId?: number; flavorId?: number; sizeId?: number; supplierId?: number }): Promise<PackDetail[]> {
    let rows = await db.select().from(packs).where(and(eq(packs.visibility, 'VISIBLE'), eq(packs.isArchived, false)));
    if (filters?.supplierId) rows = rows.filter((p) => p.supplierId === filters.supplierId);
    let details = await this.buildPackDetails(rows);
    details = details.filter((p) => p.isAvailable);
    if (filters?.categoryId) details = details.filter((p) => p.categoryIds.includes(filters.categoryId!));
    if (filters?.subCategoryId) details = details.filter((p) => p.subCategoryIds.includes(filters.subCategoryId!));
    if (filters?.brandId) details = details.filter((p) => p.brandIds.includes(filters.brandId!));
    if (filters?.flavorId) details = details.filter((p) => p.items.some((i) => i.flavorId === filters.flavorId));
    if (filters?.sizeId) details = details.filter((p) => p.items.some((i) => i.sizeId === filters.sizeId));
    return details;
  }

  async getAdminPacks(): Promise<PackDetail[]> {
    const rows = await db.select().from(packs).orderBy(desc(packs.createdAt));
    return this.buildPackDetails(rows);
  }

  async computeAutoPackQuantity(items: { listingId: number; variantId?: number | null; quantity: number }[]): Promise<number> {
    if (!items.length) return 0;
    let max = Infinity;
    for (const it of items) {
      let availableQty = 0;
      if (it.variantId) {
        const [variant] = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, it.variantId));
        availableQty = variant?.quantity ?? 0;
      } else {
        const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, it.listingId));
        availableQty = listing?.stock ?? 0;
      }
      const buildable = it.quantity > 0 ? Math.floor(availableQty / it.quantity) : 0;
      max = Math.min(max, buildable);
    }
    return isFinite(max) ? max : 0;
  }

  async computePackItemsTotal(items: { listingId: number; variantId?: number | null; quantity: number }[]): Promise<number> {
    let total = 0;
    for (const it of items) {
      let unitPrice = 0;
      if (it.variantId) {
        const [variant] = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, it.variantId));
        unitPrice = variant?.price ?? 0;
      } else {
        const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, it.listingId));
        unitPrice = listing?.price ?? 0;
      }
      total += unitPrice * it.quantity;
    }
    return total;
  }

  async getPackFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select().from(packFavorites).where(eq(packFavorites.userId, userId));
    return rows.map((r) => r.packId);
  }

  async addPackFavorite(userId: number, packId: number): Promise<void> {
    const existing = await db.select().from(packFavorites).where(and(eq(packFavorites.userId, userId), eq(packFavorites.packId, packId)));
    if (existing.length) return;
    await db.insert(packFavorites).values({ userId, packId });
  }

  async removePackFavorite(userId: number, packId: number): Promise<void> {
    await db.delete(packFavorites).where(and(eq(packFavorites.userId, userId), eq(packFavorites.packId, packId)));
  }

  async getSupplierListingByProductId(supplierId: number, productId: number) {
    const [listing] = await db.select().from(supplierProductListings).where(
      and(eq(supplierProductListings.supplierId, supplierId), eq(supplierProductListings.productId, productId))
    );
    return listing;
  }

  // ── Supplier product workflow ───────────────────────────────────────────────

  async getSupplierCreatedProducts(supplierId: number) {
    const all = await db.select().from(products).where(
      and(eq(products.createdBySupplier, true), eq(products.createdByUserId, supplierId))
    );
    const tx = await buildTaxonomyCache();
    return all.map((p) => enrichProduct(p, tx));
  }

  async createSupplierProduct(data: Partial<InsertProduct>) {
    const [created] = await db.insert(products).values({
      ...data,
      name: (data.name ?? '') as string,
      isAdminProduct: false,
      status: 'PENDING',
      createdBySupplier: true,
      price: 0,
      stock: 0,
    } as any).returning();
    return created;
  }

  async updateSupplierProduct(id: number, supplierId: number, updates: Partial<InsertProduct>) {
    const [p] = await db.select().from(products).where(eq(products.id, id));
    if (!p || p.createdByUserId !== supplierId || p.status !== 'PENDING') return undefined;
    const [updated] = await db.update(products).set(updates as any).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteSupplierProduct(id: number, supplierId: number) {
    const [p] = await db.select().from(products).where(eq(products.id, id));
    if (!p || p.createdByUserId !== supplierId || p.status !== 'PENDING') return false;
    const listings = await db.select({ id: supplierProductListings.id }).from(supplierProductListings).where(eq(supplierProductListings.productId, id));
    if (listings.length) {
      await db.delete(supplierProductVariants).where(inArray(supplierProductVariants.listingId, listings.map(l => l.id)));
      await db.delete(supplierProductListings).where(inArray(supplierProductListings.id, listings.map(l => l.id)));
    }
    await db.delete(products).where(eq(products.id, id));
    return true;
  }

  async getAdminSupplierProducts(): Promise<(ProductWithTaxonomy & { creatorName: string })[]> {
    const all = await db.select().from(products).where(
      and(eq(products.createdBySupplier, true), ne(products.status, 'ACTIVE'))
    );
    const tx = await buildTaxonomyCache();
    const supplierIds = Array.from(new Set(all.map((p) => p.createdByUserId).filter(Boolean))) as number[];
    const supplierRows = supplierIds.length ? await db.select().from(users).where(inArray(users.id, supplierIds)) : [];
    const supplierMap = new Map(supplierRows.map((u) => [u.id, u.name]));
    return all.map((p) => ({
      ...enrichProduct(p, tx),
      creatorName: p.createdByUserId ? (supplierMap.get(p.createdByUserId) ?? 'Unknown') : 'Unknown',
    }));
  }

  async approveSupplierProduct(id: number, adminId: number) {
    const [updated] = await db.update(products).set({
      status: 'ACTIVE',
      isAdminProduct: true,
      approvedBy: adminId,
      approvedAt: new Date(),
    } as any).where(eq(products.id, id)).returning();
    return updated;
  }

  async getServiceStates(): Promise<ServiceStatesMap> {
    const ALL_SERVICES: ServiceKey[] = ['PRINTING', 'MARKETING', 'BARISTA'];
    const rows = await db.select().from(platformServices);
    const map: ServiceStatesMap = { PRINTING: 'VISIBLE', MARKETING: 'VISIBLE', BARISTA: 'VISIBLE' };
    for (const row of rows) {
      map[row.service as ServiceKey] = row.state as ServiceState;
    }
    const missing = ALL_SERVICES.filter((s) => !rows.some((r) => r.service === s));
    if (missing.length) {
      for (const service of missing) {
        await db.insert(platformServices).values({ service, state: 'VISIBLE' }).onConflictDoNothing();
      }
    }
    return map;
  }

  async setServiceState(service: ServiceKey, state: ServiceState): Promise<ServiceStatesMap> {
    const existing = await db.select().from(platformServices).where(eq(platformServices.service, service));
    if (existing.length) {
      await db.update(platformServices).set({ state, updatedAt: new Date() }).where(eq(platformServices.service, service));
    } else {
      await db.insert(platformServices).values({ service, state });
    }
    return this.getServiceStates();
  }

  // ── Supplier stores ─────────────────────────────────────────────────────────

  async getSupplierStore(supplierId: number): Promise<SupplierStore | undefined> {
    const [store] = await db.select().from(supplierStores).where(eq(supplierStores.supplierId, supplierId));
    return store;
  }

  async upsertSupplierStore(supplierId: number, data: Partial<InsertSupplierStore>): Promise<SupplierStore> {
    const existing = await this.getSupplierStore(supplierId);
    if (!existing) {
      const [created] = await db.insert(supplierStores).values({
        supplierId,
        coverUrl: data.coverUrl ?? null,
        logoUrl: data.logoUrl ?? null,
        name: data.name ?? '',
        description: data.description ?? null,
        isOpen: data.isOpen ?? true,
        visibility: data.visibility ?? 'VISIBLE',
        approvalStatus: 'PENDING',
        mediaType: (data as any).mediaType ?? 'IMAGE',
        coverUrls: (data as any).coverUrls ?? [],
        videoUrl: (data as any).videoUrl ?? null,
        musicUrl: (data as any).musicUrl ?? null,
        openingHours: (data as any).openingHours ?? null,
      }).returning();
      return created;
    }
    const identityChanged = (
      (data.name !== undefined && data.name !== existing.name) ||
      (data.description !== undefined && (data.description ?? null) !== (existing.description ?? null)) ||
      (data.coverUrl !== undefined && (data.coverUrl ?? null) !== (existing.coverUrl ?? null)) ||
      (data.logoUrl !== undefined && (data.logoUrl ?? null) !== (existing.logoUrl ?? null))
    );
    let approvalStatus = existing.approvalStatus;
    if (identityChanged && (existing.approvalStatus === 'APPROVED' || existing.approvalStatus === 'REJECTED')) {
      approvalStatus = 'PENDING';
    }
    const [updated] = await db.update(supplierStores).set({
      ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.isOpen !== undefined ? { isOpen: data.isOpen } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      ...((data as any).mediaType !== undefined ? { mediaType: (data as any).mediaType } : {}),
      ...((data as any).coverUrls !== undefined ? { coverUrls: (data as any).coverUrls } : {}),
      ...((data as any).videoUrl !== undefined ? { videoUrl: (data as any).videoUrl } : {}),
      ...((data as any).musicUrl !== undefined ? { musicUrl: (data as any).musicUrl } : {}),
      ...((data as any).openingHours !== undefined ? { openingHours: (data as any).openingHours } : {}),
      approvalStatus,
      updatedAt: new Date(),
    }).where(eq(supplierStores.id, existing.id)).returning();
    return updated;
  }

  private async buildStoreCards(stores: SupplierStore[]): Promise<StoreCard[]> {
    if (!stores.length) return [];
    const supplierIds = stores.map((s) => s.supplierId);
    const [allUsers, allListings, allProducts] = await Promise.all([
      db.select().from(users).where(inArray(users.id, supplierIds)),
      db.select().from(supplierProductListings).where(inArray(supplierProductListings.supplierId, supplierIds)),
      db.select().from(products),
    ]);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const listingsBySupplier = new Map<number, typeof allListings>();
    for (const l of allListings) {
      if (!listingsBySupplier.has(l.supplierId)) listingsBySupplier.set(l.supplierId, []);
      listingsBySupplier.get(l.supplierId)!.push(l);
    }
    return stores.map((store) => {
      const supplier = userMap.get(store.supplierId);
      const listings = (listingsBySupplier.get(store.supplierId) ?? []).filter((l) => l.stock > 0 && l.price > 0);
      const categoryIds = new Set<number>();
      const subCategoryIds = new Set<number>();
      const brandIds = new Set<number>();
      for (const l of listings) {
        const prod = productMap.get(l.productId);
        if (!prod) continue;
        if (prod.categoryId) categoryIds.add(prod.categoryId);
        if (prod.subCategoryId) subCategoryIds.add(prod.subCategoryId);
        if (prod.brandId) brandIds.add(prod.brandId);
      }
      return {
        id: store.id,
        supplierId: store.supplierId,
        name: store.name,
        description: store.description,
        coverUrl: store.coverUrl,
        logoUrl: store.logoUrl,
        isOpen: store.isOpen,
        visibility: store.visibility,
        approvalStatus: store.approvalStatus,
        supplierLat: supplier?.locationLat ?? null,
        supplierLng: supplier?.locationLng ?? null,
        categoryIds: Array.from(categoryIds),
        subCategoryIds: Array.from(subCategoryIds),
        brandIds: Array.from(brandIds),
        productCount: listings.length,
        displayOrder: (store as any).displayOrder ?? 0,
        mediaType: ((store as any).mediaType ?? 'IMAGE') as 'IMAGE' | 'VIDEO',
        coverUrls: (store as any).coverUrls ?? [],
        videoUrl: (store as any).videoUrl ?? null,
        musicUrl: (store as any).musicUrl ?? null,
        openingHours: (store as any).openingHours ?? null,
      };
    });
  }

  async getAllStoresAdmin(): Promise<StoreAdminRow[]> {
    const stores = await db.select().from(supplierStores);
    const cards = await this.buildStoreCards(stores);
    const supplierIds = stores.map((s) => s.supplierId);
    const allUsers = await db.select().from(users).where(inArray(users.id, supplierIds));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const storeMap = new Map(stores.map((s) => [s.id, s]));
    return cards.map((card) => {
      const supplier = userMap.get(card.supplierId);
      const store = storeMap.get(card.id)!;
      return {
        ...card,
        supplierName: supplier?.name ?? '',
        supplierEmail: supplier?.email ?? '',
        createdAt: store.createdAt,
        updatedAt: store.updatedAt,
      };
    });
  }

  async setStoreApprovalStatus(id: number, status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ON_HOLD'): Promise<SupplierStore | undefined> {
    const [updated] = await db.update(supplierStores).set({ approvalStatus: status, updatedAt: new Date() }).where(eq(supplierStores.id, id)).returning();
    return updated;
  }

  async updateStoreDisplayOrder(id: number, displayOrder: number): Promise<SupplierStore | undefined> {
    const [updated] = await db.update(supplierStores).set({ displayOrder, updatedAt: new Date() }).where(eq(supplierStores.id, id)).returning();
    return updated;
  }

  async deleteStore(id: number): Promise<void> {
    await db.delete(storeFavorites).where(eq(storeFavorites.storeId, id));
    await db.delete(supplierStores).where(eq(supplierStores.id, id));
  }

  async getVisibleStores(): Promise<StoreCard[]> {
    const stores = await db.select().from(supplierStores)
      .where(and(eq(supplierStores.approvalStatus, 'APPROVED'), eq(supplierStores.visibility, 'VISIBLE')))
      .orderBy(asc(supplierStores.displayOrder), asc(supplierStores.id));
    const cards = await this.buildStoreCards(stores);
    // Only return stores that have at least one available product
    return cards.filter((c) => c.productCount > 0);
  }

  async getStoreDetail(id: number, opts?: { requireVisible?: boolean }): Promise<StoreDetail | undefined> {
    const [store] = await db.select().from(supplierStores).where(eq(supplierStores.id, id));
    if (!store) return undefined;
    if (opts?.requireVisible && (store.approvalStatus !== 'APPROVED' || store.visibility !== 'VISIBLE')) return undefined;
    const [card] = await this.buildStoreCards([store]);
    const [listings, reviewRows] = await Promise.all([
      db.select().from(supplierProductListings).where(eq(supplierProductListings.supplierId, store.supplierId)),
      db.select().from(supplierProductReviews).where(
        and(eq(supplierProductReviews.supplierId, store.supplierId), eq(supplierProductReviews.reviewType as any, 'SUPPLIER'))
      ),
    ]);
    const activeListings = listings.filter((l) => l.stock > 0 && l.price > 0);
    const reviewCount = reviewRows.length;
    const avgRating = reviewCount ? reviewRows.reduce((s, r) => s + r.rating, 0) / reviewCount : 0;
    if (!activeListings.length) return { ...card, products: [], avgRating, reviewCount };
    const productIds = activeListings.map((l) => l.productId);
    const prods = await db.select().from(products).where(inArray(products.id, productIds));
    const listingByProduct = new Map(activeListings.map((l) => [l.productId, l]));
    const tx = await buildTaxonomyCache();
    const enriched = prods.map((p) => {
      const listing = listingByProduct.get(p.id)!;
      return { ...enrichProduct(p, tx), price: listing.price, bestPrice: listing.price, totalStock: listing.stock } as unknown as ProductWithTaxonomy;
    });
    return { ...card, products: enriched, avgRating, reviewCount };
  }

  // ── Store favorites ─────────────────────────────────────────────────────────

  async getStoreFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select().from(storeFavorites).where(eq(storeFavorites.userId, userId));
    return rows.map((r) => r.storeId);
  }

  async addStoreFavorite(userId: number, storeId: number): Promise<void> {
    const existing = await db.select().from(storeFavorites)
      .where(and(eq(storeFavorites.userId, userId), eq(storeFavorites.storeId, storeId)));
    if (existing.length) return;
    await db.insert(storeFavorites).values({ userId, storeId });
  }

  async removeStoreFavorite(userId: number, storeId: number): Promise<void> {
    await db.delete(storeFavorites).where(and(eq(storeFavorites.userId, userId), eq(storeFavorites.storeId, storeId)));
  }

  // ── Reviews ──────────────────────────────────────────────────────────────────

  async createReview(data: {
    supplierId?: number | null;
    reviewType?: string | null;
    cafeId: number;
    productId?: number | null;
    listingId?: number | null;
    rating: number;
    comment?: string | null;
    cafeName: string;
    cafeOwnerName: string;
    productName?: string | null;
  }): Promise<SupplierProductReview> {
    const [row] = await db.insert(supplierProductReviews).values({
      supplierId: data.supplierId ?? null,
      reviewType: data.reviewType ?? 'SUPPLIER',
      cafeId: data.cafeId,
      productId: data.productId ?? null,
      listingId: data.listingId ?? null,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      productName: data.productName ?? null,
    } as any).returning();
    return row;
  }

  async getReviewsBySupplier(supplierId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(eq(supplierProductReviews.supplierId, supplierId))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getReviewStatsByProduct(productId: number): Promise<{
    product: { avgRating: number; total: number };
    overall: { avgRating: number; total: number };
    bySupplier: Record<number, { avgRating: number; total: number }>;
  }> {
    const rows = await db.select().from(supplierProductReviews)
      .where(eq(supplierProductReviews.productId, productId));
    if (!rows.length) return { product: { avgRating: 0, total: 0 }, overall: { avgRating: 0, total: 0 }, bySupplier: {} };

    const productReviews = rows.filter(r => (r as any).reviewType === 'PRODUCT' || !r.supplierId);
    const supplierReviews = rows.filter(r => (r as any).reviewType !== 'PRODUCT' && !!r.supplierId);

    const productTotal = productReviews.length;
    const productAvg = productTotal ? productReviews.reduce((s, r) => s + r.rating, 0) / productTotal : 0;

    const bySupplier: Record<number, { sum: number; count: number }> = {};
    for (const r of supplierReviews) {
      if (!r.supplierId) continue;
      if (!bySupplier[r.supplierId]) bySupplier[r.supplierId] = { sum: 0, count: 0 };
      bySupplier[r.supplierId].sum += r.rating;
      bySupplier[r.supplierId].count += 1;
    }

    const total = rows.length;
    const avgRating = total ? rows.reduce((s, r) => s + r.rating, 0) / total : 0;
    return {
      product: { avgRating: productAvg, total: productTotal },
      overall: { avgRating, total },
      bySupplier: Object.fromEntries(
        Object.entries(bySupplier).map(([sid, { sum, count }]) => [
          sid, { avgRating: sum / count, total: count }
        ])
      ) as Record<number, { avgRating: number; total: number }>,
    };
  }
  // ── Pack Reviews ─────────────────────────────────────────────────────────────

  async getPackReviews(packId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.packId as any, packId), eq(supplierProductReviews.reviewType, 'PACK')))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async createPackReview(data: {
    packId: number;
    supplierId: number;
    cafeId: number;
    rating: number;
    comment?: string | null;
    cafeName: string;
    cafeOwnerName: string;
  }): Promise<SupplierProductReview> {
    const [row] = await db.insert(supplierProductReviews).values({
      supplierId: data.supplierId,
      reviewType: 'PACK',
      cafeId: data.cafeId,
      packId: data.packId,
      productId: null,
      listingId: null,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      productName: null,
    } as any).returning();
    return row;
  }

  // ── Landing Config ──────────────────────────────────────────────────────────

  async getLandingConfig(): Promise<LandingConfig> {
    const rows = await db.select().from(landingConfig).limit(1);
    if (rows.length > 0) return rows[0];
    // Auto-create default row
    const [created] = await db.insert(landingConfig).values({}).returning();
    return created;
  }

  async updateLandingConfig(data: Partial<Omit<LandingConfig, "id" | "updatedAt">>): Promise<LandingConfig> {
    const existing = await this.getLandingConfig();
    const [updated] = await db
      .update(landingConfig)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(landingConfig.id, existing.id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
