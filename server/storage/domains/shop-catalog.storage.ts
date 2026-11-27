import { db } from "../../db";
import { eq, and, or, inArray, asc } from "drizzle-orm";
import {
  categories, subCategories, flavors, sizes, brands, products, favorites,
  supplierProductListings, supplierProductVariants, supplierStores, users,
  type CategoryWithCount, type InsertCategory,
  type SubCategoryWithDetails, type InsertSubCategory,
  type FlavorWithCount, type InsertFlavor,
  type SizeWithCount, type InsertSize,
  type BrandWithCount, type InsertBrand,
  type ShopFavoriteItem,
  type Product,
  type TaxonomyEntityType, type TaxonomyCommercialSummary, type TaxonomySubCategoryCoverage,
  type TaxonomySuppliersResponse, type TaxonomySupplierGroup, type TaxonomySupplierProduct, type TaxonomyProductStatus,
} from "@shared/schema";
import { computeListingOffer } from "../../storage";

// Stage 2 — Batch 19 business-domain consolidation. Merges 7 previously
// separate, single-responsibility storage files that all belong to the
// same Shop Catalog business area and share the exact same external
// consumer (server/routes/shop-catalog.routes.ts, plus server/seed.ts for
// the taxonomy CRUD methods) — verified via a whole-repository consumer
// search before merging, per server/STORAGE_ARCHITECTURE.md ("Stage 2 —
// Batch 19"). This is a pure architectural consolidation: every method
// body below is unchanged from its original per-domain file (Categories:
// Batch 12, SubCategories: Batch 14, Flavors: Batch 15, Sizes: Batch 16,
// Brands: Batch 17, Taxonomy bulk-order: Batch 18, Favorites: Batch 3).
// None of the 7 original classes had a constructor or cross-domain
// `this.*` calls, so no facade reference is needed here either — merging
// them introduces no new dependency of any kind.
export class ShopCatalogStorage {
  // ── Categories ───────────────────────────────────────────────────────────
  async getCategories(opts?: { includeAll?: boolean }): Promise<CategoryWithCount[]> {
    const cats = opts?.includeAll
      // Supplier suggestions become normal taxonomy rows when approved. Keep
      // pending/rejected supplier rows out of Category Management while
      // preserving the existing include-all behavior for admin-managed rows.
      ? await db.select().from(categories).where(or(
          eq(categories.createdBySupplier, false),
          and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true)),
        )).orderBy(asc(categories.displayOrder), asc(categories.id))
      : await db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true))).orderBy(asc(categories.displayOrder), asc(categories.id));
    const subs = await db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)));
    const prods = await db.select().from(products);
    const availableAdminProducts = prods.filter((p) => p.isAdminProduct && p.status === 'ACTIVE');
    return cats.map((c) => ({
      ...c,
      subCategoryCount: subs.filter((s) => s.categoryId === c.id).length,
      productCount: availableAdminProducts.filter((p) => p.categoryId === c.id).length,
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

  // ── SubCategories ────────────────────────────────────────────────────────
  async getSubCategories(categoryId?: number, opts?: { includeAll?: boolean }): Promise<SubCategoryWithDetails[]> {
    let subs;
    if (opts?.includeAll) {
      subs = categoryId
        ? await db.select().from(subCategories).where(and(
            eq(subCategories.categoryId, categoryId),
            or(eq(subCategories.createdBySupplier, false), and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true))),
          ))
        : await db.select().from(subCategories).where(or(
            eq(subCategories.createdBySupplier, false),
            and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)),
          ));
    } else {
      subs = categoryId
        ? await db.select().from(subCategories).where(and(eq(subCategories.categoryId, categoryId), eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)))
        : await db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)));
    }
    subs = [...subs].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.id - b.id);
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

  // ── Flavors ──────────────────────────────────────────────────────────────
  async getFlavors(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<FlavorWithCount[]> {
    const all = filters?.includeAll
      ? await db.select().from(flavors).where(or(
          eq(flavors.createdBySupplier, false),
          and(eq(flavors.status, 'ACTIVE'), eq(flavors.isActive, true)),
        ))
      : await db.select().from(flavors).where(eq(flavors.status, 'ACTIVE'));
    const prods = await db.select().from(products);
    const subs = await db.select().from(subCategories);
    const subMap = new Map(subs.map((s) => [s.id, s.name]));
    let filtered = all;
    if (filters?.subCategoryId) filtered = filtered.filter((f) => f.subCategoryIds?.includes(filters.subCategoryId!));
    filtered = [...filtered].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.id - b.id);
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

  // ── Sizes ────────────────────────────────────────────────────────────────
  async getSizes(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<SizeWithCount[]> {
    const all = filters?.includeAll
      ? await db.select().from(sizes).where(or(
          eq(sizes.createdBySupplier, false),
          and(eq(sizes.status, 'ACTIVE'), eq(sizes.isActive, true)),
        ))
      : await db.select().from(sizes).where(eq(sizes.status, 'ACTIVE'));
    const prods = await db.select().from(products);
    const subs = await db.select().from(subCategories);
    const subMap = new Map(subs.map((s) => [s.id, s.name]));
    let filtered = all;
    if (filters?.subCategoryId) filtered = filtered.filter((s) => s.subCategoryIds?.includes(filters.subCategoryId!));
    filtered = [...filtered].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.id - b.id);
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

  // ── Brands ───────────────────────────────────────────────────────────────
  async getBrands(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<BrandWithCount[]> {
    const all = filters?.includeAll
      ? await db.select().from(brands).where(or(
          eq(brands.createdBySupplier, false),
          and(eq(brands.status, 'ACTIVE'), eq(brands.isActive, true)),
        ))
      : await db.select().from(brands).where(eq(brands.status, 'ACTIVE'));
    const prods = await db.select().from(products);
    const subs = await db.select().from(subCategories);
    const subMap = new Map(subs.map((s) => [s.id, s.name]));
    let filtered = all;
    if (filters?.subCategoryId) filtered = filtered.filter((b) => b.subCategoryIds?.includes(filters.subCategoryId!));
    filtered = [...filtered].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.id - b.id);
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

  // ── Taxonomy bulk-order ──────────────────────────────────────────────────
  // Admin Category Management drag-and-drop order (task: "Admin Category
  // Management Redesign") — mirrors bulkUpdateStoreOrder's independent-per-row pattern,
  // one method per taxonomy entity since each keeps its own independent order.
  async bulkUpdateCategoryOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(({ id, displayOrder }) =>
      db.update(categories).set({ displayOrder, updatedAt: new Date() }).where(eq(categories.id, id))
    ));
  }

  async bulkUpdateSubCategoryOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(({ id, displayOrder }) =>
      db.update(subCategories).set({ displayOrder, updatedAt: new Date() }).where(eq(subCategories.id, id))
    ));
  }

  async bulkUpdateFlavorOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(({ id, displayOrder }) =>
      db.update(flavors).set({ displayOrder, updatedAt: new Date() }).where(eq(flavors.id, id))
    ));
  }

  async bulkUpdateSizeOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(({ id, displayOrder }) =>
      db.update(sizes).set({ displayOrder, updatedAt: new Date() }).where(eq(sizes.id, id))
    ));
  }

  async bulkUpdateBrandOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(({ id, displayOrder }) =>
      db.update(brands).set({ displayOrder, updatedAt: new Date() }).where(eq(brands.id, id))
    ));
  }

  // ── Admin Categories Management — Supplier Coverage & Catalog Intelligence ──
  // "Informations commerciales" (getTaxonomyCommercialSummary) and "Voir les
  // fournisseurs" (getTaxonomySuppliers) for the Category/SubCategory/Flavor/
  // Size/Brand detail modals. Taxonomy associations live on `products` itself
  // (categoryId/subCategoryId/flavorId/sizeId/brandId/flavorIds/sizeIds —
  // exactly the same fields getFlavors/getSizes/getBrands above already filter
  // on); which suppliers/stores actually OFFER a matching product is a
  // separate question answered by supplierProductListings (never the
  // supplierCategories/supplierSubCategories mapping tables, which only record
  // a supplier's approved taxonomy scope, not what they've actually listed —
  // the task's own explicit "do not assume" warning). A listing's live
  // commercial status reuses computeListingOffer on its persisted variants —
  // the exact same rule buildStoreCards/getMarketplacePacks already use —
  // never a second "is this active" heuristic.
  //
  // Every query here is a small, fixed number of batched `db.select()` calls
  // (products once, listings once scoped to the matching product ids, variants
  // once scoped to those listing ids, stores/users once scoped to the matching
  // supplier ids) followed by in-memory Map/filter aggregation — the same
  // "fetch once, aggregate in JS" convention every other method in this file
  // (and this project's storage layer generally) already uses. No N+1: no
  // query is issued per-product, per-listing, or per-supplier.

  private matchesTaxonomy(p: Product, type: TaxonomyEntityType, id: number): boolean {
    switch (type) {
      case 'category': return p.categoryId === id;
      case 'subcategory': return p.subCategoryId === id;
      case 'flavor': return p.flavorId === id || !!p.flavorIds?.includes(id);
      case 'size': return p.sizeId === id || !!p.sizeIds?.includes(id);
      case 'brand': return p.brandId === id;
    }
  }

  private classifyListingStatus(
    listing: { visibility: string },
    variants: { price: number; quantity: number }[],
  ): TaxonomyProductStatus {
    if (listing.visibility !== 'VISIBLE') return 'inactive';
    return computeListingOffer(variants).eligible ? 'active' : 'out_of_stock';
  }

  async getTaxonomyCommercialSummary(type: TaxonomyEntityType, id: number): Promise<TaxonomyCommercialSummary> {
    const allProducts = await db.select().from(products);
    const matching = allProducts.filter((p) => this.matchesTaxonomy(p, type, id));
    const matchingIds = matching.map((p) => p.id);

    const listings = matchingIds.length
      ? await db.select().from(supplierProductListings).where(inArray(supplierProductListings.productId, matchingIds))
      : [];
    const listingIds = listings.map((l) => l.id);
    const variants = listingIds.length
      ? await db.select().from(supplierProductVariants).where(inArray(supplierProductVariants.listingId, listingIds))
      : [];
    const variantsByListing = new Map<number, typeof variants>();
    for (const v of variants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }

    const supplierIds = Array.from(new Set(listings.map((l) => l.supplierId)));
    const stores = supplierIds.length
      ? await db.select().from(supplierStores).where(inArray(supplierStores.supplierId, supplierIds))
      : [];
    const storeSupplierIds = new Set(stores.map((s) => s.supplierId));

    let productActive = 0, productInactive = 0, productOutOfStock = 0;
    for (const l of listings) {
      const status = this.classifyListingStatus(l, variantsByListing.get(l.id) ?? []);
      if (status === 'active') productActive++;
      else if (status === 'inactive') productInactive++;
      else productOutOfStock++;
    }

    const summary: TaxonomyCommercialSummary = {
      supplierCount: supplierIds.length,
      storeCount: supplierIds.filter((sid) => storeSupplierIds.has(sid)).length,
      productTotal: listings.length,
      productActive, productInactive, productOutOfStock,
    };

    if (type === 'category') {
      // Reuses the SAME allProducts/listings fetch above, scoped per subcategory —
      // no additional per-subcategory query.
      const subs = await db.select().from(subCategories).where(eq(subCategories.categoryId, id));
      const coverage: TaxonomySubCategoryCoverage[] = subs.map((s) => {
        const subProductIds = new Set(allProducts.filter((p) => p.subCategoryId === s.id).map((p) => p.id));
        const subListings = listings.filter((l) => subProductIds.has(l.productId));
        const subSupplierCount = new Set(subListings.map((l) => l.supplierId)).size;
        return { id: s.id, name: s.name, supplierCount: subSupplierCount, productCount: subListings.length, covered: subSupplierCount > 0 };
      });
      summary.subCategoryCoverage = coverage;
    }

    if (type === 'subcategory') {
      const [sub] = await db.select().from(subCategories).where(eq(subCategories.id, id));
      if (sub) {
        const [cat] = await db.select().from(categories).where(eq(categories.id, sub.categoryId));
        summary.parentCategory = cat ? { id: cat.id, name: cat.name } : null;
      }
      const [allFlavors, allSizes, allBrands] = await Promise.all([
        db.select().from(flavors),
        db.select().from(sizes),
        db.select().from(brands),
      ]);
      summary.linkedFlavors = allFlavors.filter((f) => f.subCategoryIds?.includes(id)).map((f) => ({ id: f.id, name: f.name }));
      summary.linkedSizes = allSizes.filter((s) => s.subCategoryIds?.includes(id)).map((s) => ({ id: s.id, name: s.name }));
      summary.linkedBrands = allBrands.filter((b) => b.subCategoryIds?.includes(id)).map((b) => ({ id: b.id, name: b.name }));
    }

    return summary;
  }

  async getTaxonomySuppliers(
    type: TaxonomyEntityType, id: number, opts?: { page?: number; pageSize?: number },
  ): Promise<TaxonomySuppliersResponse> {
    const allProducts = await db.select().from(products);
    const matching = allProducts.filter((p) => this.matchesTaxonomy(p, type, id));
    const productMap = new Map(matching.map((p) => [p.id, p]));
    const matchingIds = matching.map((p) => p.id);
    if (!matchingIds.length) return { suppliers: [], total: 0 };

    const listings = await db.select().from(supplierProductListings).where(inArray(supplierProductListings.productId, matchingIds));
    if (!listings.length) return { suppliers: [], total: 0 };

    const listingIds = listings.map((l) => l.id);
    const variants = listingIds.length
      ? await db.select().from(supplierProductVariants).where(inArray(supplierProductVariants.listingId, listingIds))
      : [];
    const variantsByListing = new Map<number, typeof variants>();
    for (const v of variants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }

    const supplierIds = Array.from(new Set(listings.map((l) => l.supplierId)));
    const [supplierUsers, stores] = await Promise.all([
      db.select().from(users).where(inArray(users.id, supplierIds)),
      db.select().from(supplierStores).where(inArray(supplierStores.supplierId, supplierIds)),
    ]);
    const userMap = new Map(supplierUsers.map((u) => [u.id, u]));
    const storeMap = new Map(stores.map((s) => [s.supplierId, s]));

    const listingsBySupplier = new Map<number, typeof listings>();
    for (const l of listings) {
      if (!listingsBySupplier.has(l.supplierId)) listingsBySupplier.set(l.supplierId, []);
      listingsBySupplier.get(l.supplierId)!.push(l);
    }

    const groups: TaxonomySupplierGroup[] = supplierIds.map((sid) => {
      const supplierListings = listingsBySupplier.get(sid) ?? [];
      const store = storeMap.get(sid);
      const supplierUser = userMap.get(sid);
      const taxProducts: TaxonomySupplierProduct[] = supplierListings.map((l) => {
        const product = productMap.get(l.productId)!;
        return {
          listingId: l.id,
          productId: product.id,
          productName: product.name,
          productImageUrl: product.imageUrl ?? null,
          sku: l.sku ?? null,
          status: this.classifyListingStatus(l, variantsByListing.get(l.id) ?? []),
        };
      });
      const activeCount = taxProducts.filter((p) => p.status === 'active').length;
      const inactiveCount = taxProducts.filter((p) => p.status === 'inactive').length;
      const outOfStockCount = taxProducts.filter((p) => p.status === 'out_of_stock').length;
      return {
        supplierId: sid,
        supplierName: supplierUser?.name ?? '',
        logoUrl: store?.logoUrl ?? null,
        storeCount: store ? 1 : 0,
        productCount: taxProducts.length, activeCount, inactiveCount, outOfStockCount,
        stores: [{
          storeId: store?.id ?? null,
          storeName: store?.name ?? supplierUser?.name ?? '',
          address: supplierUser?.locationAddress ?? null,
          productCount: taxProducts.length, activeCount, inactiveCount, outOfStockCount,
          products: taxProducts,
        }],
      };
    });

    groups.sort((a, b) => b.productCount - a.productCount || a.supplierName.localeCompare(b.supplierName));

    const total = groups.length;
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return { suppliers: groups.slice(start, start + pageSize), total };
  }

  // ── Favorites (product favorites) ───────────────────────────────────────
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
}
