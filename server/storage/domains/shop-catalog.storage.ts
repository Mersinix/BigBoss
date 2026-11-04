import { db } from "../../db";
import { eq, and, or, inArray, asc } from "drizzle-orm";
import {
  categories, subCategories, flavors, sizes, brands, products, favorites,
  type CategoryWithCount, type InsertCategory,
  type SubCategoryWithDetails, type InsertSubCategory,
  type FlavorWithCount, type InsertFlavor,
  type SizeWithCount, type InsertSize,
  type BrandWithCount, type InsertBrand,
  type ShopFavoriteItem,
} from "@shared/schema";

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
