import { db } from "../../db";
import { eq, inArray } from "drizzle-orm";
import {
  products, users, supplierProductListings, supplierProductVariants,
  type Product, type InsertProduct, type ProductWithSupplier, type ProductWithTaxonomy,
} from "@shared/schema";
import { buildTaxonomyCache, enrichProduct } from "../../storage";

// Stage 2 extraction — Batch 27 (multi-domain, 2/4): Admin Products +
// Legacy Product Browsing, moved verbatim out of server/storage.ts's
// DatabaseStorage class. Zero private helpers, zero transactions, zero
// outbound `this.*` calls — confirmed via a full repository-wide grep.
// `deleteProduct`'s cascade into `supplierProductListings`/
// `supplierProductVariants` is a direct table access, not a call into
// the (much larger, not-yet-extracted) Supplier Product Listings domain.
//
// `buildTaxonomyCache`/`enrichProduct` are shared, pure, module-level
// helper functions in server/storage.ts (used by 15/8 call sites across
// the file, not exclusive to this domain) — exported from there (not
// duplicated) and imported here, the same treatment given to
// `computeListingOffer` for the sibling Marketplace/Supplier Stores
// extractions in this same batch. See
// server/STORAGE_ARCHITECTURE.md ("Stage 2 — Batch 27") for the full
// call-graph trace.
export class ProductsStorage {
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
}
