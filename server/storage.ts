import { db } from "./db";
import {
  users, products, orders, orderItems, subOrders, supplierProductVariants,
  categories, subCategories, flavors, sizes, brands,
  supplierCategories, supplierSubCategories, supplierProductListings,
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
} from "@shared/schema";
import { eq, and, inArray, ne, sql, notInArray, asc } from "drizzle-orm";

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
  createOrder(cafeId: number, cartItems: CreateOrderItem[], opts?: { deliveryAddress?: import("@shared/schema").GeoLocation; courierInstructions?: string }): Promise<Order>;
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
        .map((i) => ({ ...i, product: productMap.get(i.productId) ?? {} as Product }));
      const orderSubOrders = allSubOrders.filter((so) => so.orderId === order.id).map((so) => ({
        ...so,
        items: allItems.filter((i) => i.subOrderId === so.id).map((i) => ({ ...i, product: productMap.get(i.productId) ?? {} as Product })),
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

  async createOrder(
    cafeId: number,
    cartItems: CreateOrderItem[],
    opts?: { deliveryAddress?: import("@shared/schema").GeoLocation; courierInstructions?: string },
  ): Promise<Order> {
    const totalAmount = cartItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const supplierIds = Array.from(new Set(cartItems.map((i) => i.supplierId)));
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

    if (supplierIds.length > 1) {
      for (const sid of supplierIds) {
        const supplierItems = cartItems.filter((i) => i.supplierId === sid);
        const subtotal = supplierItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        const supplierName = supplierItems[0].supplierName;
        const [so] = await db.insert(subOrders).values({ orderId: order.id, supplierId: sid, supplierName, subtotal }).returning();
        for (const item of supplierItems) {
          await db.insert(orderItems).values({ orderId: order.id, subOrderId: so.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.unitPrice * item.quantity, flavorId: item.flavorId ?? null, sizeId: item.sizeId ?? null });
        }
      }
    } else {
      for (const item of cartItems) {
        await db.insert(orderItems).values({ orderId: order.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.unitPrice * item.quantity, flavorId: item.flavorId ?? null, sizeId: item.sizeId ?? null });
      }
    }
    return order;
  }

  async updateOrderStatus(id: number, status: typeof orders.$inferSelect.status, deliveryId?: number) {
    const updates: any = { status };
    if (deliveryId) updates.deliveryId = deliveryId;
    const [updated] = await db.update(orders).set(updates).where(eq(orders.id, id)).returning();
    return updated;
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

    const supplierMap = new Map(allUsers.map((u) => [u.id, u.name]));
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
          return { id: l.id, supplierId: l.supplierId, supplierName: supplierMap.get(l.supplierId) ?? "", variants, totalStock, minPrice };
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
    await db.delete(supplierProductListings).where(eq(supplierProductListings.id, id));
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
}

export const storage = new DatabaseStorage();
