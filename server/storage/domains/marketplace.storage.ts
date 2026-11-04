import { db } from "../../db";
import { eq, inArray } from "drizzle-orm";
import {
  products, users, supplierProductListings, supplierProductVariants,
  supplierCategories, supplierStores, supplierProductReviews,
  type MarketplaceProduct, type MarketplaceListing,
} from "@shared/schema";
import { buildTaxonomyCache, enrichProduct, computeListingOffer } from "../../storage";

// Stage 2 extraction — Batch 27 (multi-domain, 3/4): Marketplace
// (the Coffee-Owner-facing, cross-supplier product browsing surface),
// moved verbatim out of server/storage.ts's DatabaseStorage class. Zero
// private helpers, zero transactions, zero outbound `this.*` calls to
// another domain class (getMarketplaceProduct's call to
// this.getMarketplaceProducts is intra-cluster, moved together) —
// confirmed via a full repository-wide grep to have exactly one external
// consumer, server/routes/shop-catalog.routes.ts — so no facade
// constructor is needed.
//
// `buildTaxonomyCache`/`enrichProduct`/`computeListingOffer` are shared,
// pure, module-level helper functions in server/storage.ts (used widely
// across the file, not exclusive to this domain) — exported from there
// (not duplicated) and imported here; the same treatment given to the
// sibling Products/Supplier Stores extractions in this same batch. This
// circular import (server/storage.ts <-> this file) was verified safe at
// runtime — the functions are only ever called inside method bodies,
// long after both modules have finished loading — see
// server/STORAGE_ARCHITECTURE.md ("Stage 2 — Batch 27").
export class MarketplaceStorage {
  async getMarketplaceProducts(filters?: { categoryId?: number; subCategoryId?: number; search?: string; supplierId?: number }): Promise<MarketplaceProduct[]> {
    const allProducts = filters?.supplierId != null
      ? await db.select().from(products)
      : await db.select().from(products).where(eq(products.isAdminProduct, true));
    const allListings = await db.select().from(supplierProductListings);
    const allVariants = await db.select().from(supplierProductVariants);
    const allUsers = await db.select().from(users);
    const frozenMappings = await db.select().from(supplierCategories).where(eq(supplierCategories.isFrozen, true));
    const frozenSet = new Set(frozenMappings.map((f) => `${f.supplierId}:${f.categoryId}`));
    const tx = await buildTaxonomyCache();

    // Build supplier store logo map (supplierId → logoUrl)
    const allStores = await db.select({ supplierId: supplierStores.supplierId, logoUrl: supplierStores.logoUrl }).from(supplierStores);
    const storeLogoMap = new Map(allStores.map((s) => [s.supplierId, s.logoUrl]));

    // Build product review stats map (productId → { sum, count })
    const allProductReviews = await db.select({ productId: supplierProductReviews.productId, rating: supplierProductReviews.rating })
      .from(supplierProductReviews)
      .where(eq(supplierProductReviews.reviewType, 'PRODUCT'));
    const reviewStatsByProduct = new Map<number, { sum: number; count: number }>();
    for (const r of allProductReviews) {
      if (!r.productId) continue;
      if (!reviewStatsByProduct.has(r.productId)) reviewStatsByProduct.set(r.productId, { sum: 0, count: 0 });
      const s = reviewStatsByProduct.get(r.productId)!;
      s.sum += r.rating;
      s.count += 1;
    }

    const supplierMap = new Map(allUsers.map((u) => [u.id, { name: u.name, lat: u.locationLat, lng: u.locationLng }]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const v of allVariants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }

    let prods = allProducts.filter((p) => p.status !== 'FREEZE');
    if (filters?.categoryId) prods = prods.filter((p) => p.categoryId === filters.categoryId);
    if (filters?.subCategoryId) prods = prods.filter((p) => p.subCategoryId === filters.subCategoryId);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      prods = prods.filter((p) => p.name.toLowerCase().includes(q));
    }

    const result: MarketplaceProduct[] = [];
    for (const prod of prods) {
       const listings = allListings.filter((l) =>
         l.productId === prod.id && (filters?.supplierId == null || l.supplierId === filters.supplierId)
       );
      if (!listings.length) continue;
      const marketListings: MarketplaceListing[] = listings
         .filter((l) => {
          if (l.onlyForPack) return false;
           if (filters?.supplierId != null && l.visibility !== 'VISIBLE') return false;
          // Standalone-listing-only visibility — never checked by pack
          // retrieval/validation (see buildPackDetails), so hiding a
          // product here never touches any pack that references it.
          if (!l.isIndividuallyVisible) return false;
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
          // Derived from real persisted variants only — never the listing's
          // own price/stock cache (see computeListingOffer) — so a listing
          // with zero variants is never treated as a flat single offer.
          const { totalStock, minPrice } = computeListingOffer(variants);
          const sup = supplierMap.get(l.supplierId);
          return { id: l.id, supplierId: l.supplierId, supplierName: sup?.name ?? "", supplierLat: sup?.lat ?? null, supplierLng: sup?.lng ?? null, storeLogoUrl: storeLogoMap.get(l.supplierId) ?? null, variants, totalStock, minPrice };
        })
        .filter((l) => l.totalStock > 0 && l.minPrice > 0);
      if (!marketListings.length) continue;
      const bestPrice = Math.min(...marketListings.map((l) => l.minPrice));
      const totalStock = marketListings.reduce((s, l) => s + l.totalStock, 0);
      const reviewStats = reviewStatsByProduct.get(prod.id);
      const avgRating = reviewStats ? reviewStats.sum / reviewStats.count : 0;
      const reviewCount = reviewStats?.count ?? 0;
      result.push({ ...enrichProduct(prod, tx), listings: marketListings, bestPrice, totalStock, supplierCount: marketListings.length, avgRating, reviewCount });
    }
    return result;
  }

  async getMarketplaceProduct(productId: number, supplierId?: number): Promise<MarketplaceProduct | undefined> {
    const all = await this.getMarketplaceProducts(supplierId == null ? undefined : { supplierId });
    return all.find((p) => p.id === productId);
  }

  async getProductImageData(ids: number[]): Promise<Array<{ id: number; imageUrl: string | null; imageUrls: string[] | null; imageAdjustments: Record<string, number> }>> {
    const uniqueIds = Array.from(new Set(ids)).filter((id) => Number.isInteger(id) && id > 0);
    if (!uniqueIds.length) return [];
    const rows = await db.select({
      id: products.id,
      imageUrl: products.imageUrl,
      imageUrls: products.imageUrls,
      imageAdjustments: products.imageAdjustments,
    }).from(products).where(inArray(products.id, uniqueIds));
    return rows.map((r) => ({ ...r, imageAdjustments: r.imageAdjustments ?? {} }));
  }
}
