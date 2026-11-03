import { db } from "../../db";
import { eq, and, inArray, isNull, desc } from "drizzle-orm";
import {
  packs, packItems, packFavorites, supplierProductListings, supplierProductVariants,
  products, users, supplierProductReviews,
  type Pack, type PackDetail, type PackItemDetail,
} from "@shared/schema";
import { buildTaxonomyCache } from "../../storage";

// Stage 2 — Batch 44: the complete Packs domain — Pack lifecycle
// (create/update/duplicate/delete), composition-building, pricing/
// auto-quantity calculations, marketplace/admin/supplier discovery
// queries, and Pack favorites — moved out of server/storage.ts's
// DatabaseStorage class. This merges the real "── Packs ──" section
// with `getPackComposition`, which was physically filed much earlier
// in the monolith (immediately after an Order-domain delegate) despite
// being genuine Pack composition display logic — see
// server/STORAGE_ARCHITECTURE.md ("Batch 44") for the full ownership
// audit and the "physically displaced, real ownership elsewhere"
// precedent this follows (same pattern as Batches 37/38/43).
//
// No facade constructor needed: every internal `this.*` call in this
// class targets another method that moved here together with it
// (createPack/updatePack/getSupplierPacks/getPackDetail/
// getMarketplacePacks/getAdminPacks/getPackComposition all call
// buildPackDetails; duplicatePack calls createPack) — confirmed via a
// full repository-wide grep before moving anything. Nothing here ever
// called back into DatabaseStorage.
//
// Reverse dependency (unaffected by this move): order.storage.ts
// already reaches `buildPackDetails` exclusively via
// `this.facade.buildPackDetails(...)` (3 call sites — resolvePackOrderItems,
// getReorderData, getSubOrderItemsForCartRestore), never a direct field
// reference, so no change was needed there — the facade delegate stays,
// now resolving through `this.packsDomain.buildPackDetails(...)`.
//
// Zero transactions exist anywhere in this domain (confirmed via a
// full grep of every source location before moving anything) — the
// project-wide transaction count is unaffected by this batch.
export class PacksStorage {
  /**
   * Returns the composition of a pack (product name, variant, flavor, size, quantity per slot)
   * for display in the Supplier order details modal.
   */
  async getPackComposition(packId: number): Promise<Array<{
    listingId: number;
    variantId: number | null;
    productName: string;
    flavorName: string | null;
    sizeName: string | null;
    quantity: number;
  }>> {
    const [pack] = await db.select().from(packs).where(eq(packs.id, packId));
    if (!pack) return [];
    const [detail] = await this.buildPackDetails([pack]);
    if (!detail) return [];
    return detail.items.map((item) => ({
      listingId: item.listingId,
      variantId: item.variantId ?? null,
      productName: item.productName,
      flavorName: item.flavorName ?? null,
      sizeName: item.sizeName ?? null,
      quantity: item.quantity,
    }));
  }

  // Stage 2 — Batch 37: made public (was private) on DatabaseStorage —
  // 3 of its callers (resolvePackOrderItems, getReorderData,
  // getSubOrderItemsForCartRestore) moved to
  // server/storage/domains/order.storage.ts and reach this via
  // this.facade.buildPackDetails(...); every other caller
  // (getPackComposition and the Pack-listing methods below) keeps
  // calling it as a plain same-class method here. Zero behavior change.
  async buildPackDetails(rows: Pack[]): Promise<PackDetail[]> {
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
    const selectedGroupVariants = (item: typeof allItems[number]) => {
      const representative = item.variantId != null ? variantMap.get(item.variantId) : undefined;
      const group = (variantsByListing.get(item.listingId) ?? []).filter((v) =>
        representative
          ? (v.sizeId ?? null) === (representative.sizeId ?? null)
          : true,
      );
      // NULL is the legacy value and intentionally means all currently
      // available flavors in this size group.
      if (item.flavorIds == null) return group.filter((v) => v.price > 0 && v.quantity > 0);
      const selected = new Set(item.flavorIds);
      return group.filter((v) => v.flavorId != null && selected.has(v.flavorId) && v.price > 0 && v.quantity > 0);
    };
    const productIds = Array.from(new Set(listings.map((l) => l.productId)));
    const prods = productIds.length ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
    const productMap = new Map(prods.map((p) => [p.id, p]));

    // A Pack component is valid only while its listing is visible, its product
    // is active, and its selected inventory slot is currently sellable. A
    // zero-price or out-of-stock variant is no longer an active Pack choice,
    // just like a missing/hidden product. The onlyForMyProducts flag is also
    // the persisted "removed from Packs" state. Prune invalid rows here so
    // every Pack consumer gets the same result and stale rows do not remain
    // in the relation after a read.
    const validItems = allItems.filter((item) => {
      const listing = listingMap.get(item.listingId);
      const product = listing ? productMap.get(listing.productId) : undefined;
      if (!listing || listing.visibility !== 'VISIBLE' || listing.onlyForMyProducts || product?.status !== 'ACTIVE') {
        return false;
      }
      if (item.variantId != null) {
        const variant = variantMap.get(item.variantId);
        if (!variant || variant.listingId !== item.listingId || variant.price <= 0) return false;
        return selectedGroupVariants(item).length > 0;
      }
      return !(variantsByListing.get(item.listingId)?.length) && listing.price > 0 && listing.stock > 0;
    });
    const invalidItemIds = allItems
      .filter((item) => !validItems.some((valid) => valid.id === item.id))
      .map((item) => item.id);
    if (invalidItemIds.length) {
      await db.delete(packItems).where(inArray(packItems.id, invalidItemIds));
    }

    const supplierIds = Array.from(new Set(rows.map((p) => p.supplierId)));
    const suppliers = supplierIds.length ? await db.select().from(users).where(inArray(users.id, supplierIds)) : [];
    const supplierMap = new Map(suppliers.map((u) => [u.id, { name: u.name, lat: u.locationLat ?? null, lng: u.locationLng ?? null }]));
    const tx = await buildTaxonomyCache();
    const itemsByPack = new Map<number, typeof allItems>();
    for (const it of validItems) {
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
    // Batch-fetch supplier-level review stats (same source as StoreDetail.avgRating)
    const supplierReviews = supplierIds.length
      ? await db.select().from(supplierProductReviews)
          .where(and(inArray(supplierProductReviews.supplierId, supplierIds), eq(supplierProductReviews.reviewType as any, 'SUPPLIER')))
      : [];
    const supplierRatingMap = new Map<number, { sum: number; count: number }>();
    for (const r of supplierReviews) {
      const sid = r.supplierId!;
      if (!supplierRatingMap.has(sid)) supplierRatingMap.set(sid, { sum: 0, count: 0 });
      supplierRatingMap.get(sid)!.sum += r.rating;
      supplierRatingMap.get(sid)!.count += 1;
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
        const selectedVariants = variant ? selectedGroupVariants(it) : [];
        const availableQuantity = variant
          ? selectedVariants.reduce((sum, v) => sum + v.quantity, 0)
          : (listing?.stock ?? 0);
        if (product?.categoryId) categoryIds.add(product.categoryId);
        if (product?.subCategoryId) subCategoryIds.add(product.subCategoryId);
        if (product?.brandId) brandIds.add(product.brandId);
        const buildable = it.quantity > 0 ? Math.floor(availableQuantity / it.quantity) : 0;
        maxBuildable = Math.min(maxBuildable, buildable);
        // Variants of this listing that share the same size as the selected variant
        // (flavor distribution must stay within the supplier-created size group — never
        // mix flavors across sizes).
        const sameGroupVariants = selectedGroupVariants(it);
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
          flavorIds: it.flavorIds ?? null,
          quantity: it.quantity,
          packVariantPrice: (it as any).packVariantPrice ?? 0,
          productId: product?.id ?? 0,
          productName: product?.name ?? "Unknown product",
          productImageUrl: product?.imageUrl ?? null,
          productImageAdjustments: product?.imageAdjustments ?? {},
          categoryId: product?.categoryId ?? null,
          subCategoryId: product?.subCategoryId ?? null,
          brandId: product?.brandId ?? null,
          categoryName: product?.categoryId ? (tx.catMap.get(product.categoryId)?.name ?? null) : null,
          subCategoryName: product?.subCategoryId ? (tx.subMap.get(product.subCategoryId)?.name ?? null) : null,
          brandName: product?.brandId ? (tx.brdMap.get(product.brandId)?.name ?? null) : null,
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
      const supplierInfo = supplierMap.get(pack.supplierId);
      const supRating = supplierRatingMap.get(pack.supplierId);
      result.push({
        ...pack,
        supplierName: supplierInfo?.name ?? "",
        supplierLat: supplierInfo?.lat ?? null,
        supplierLng: supplierInfo?.lng ?? null,
        supplierAvgRating: supRating ? supRating.sum / supRating.count : 0,
        supplierReviewCount: supRating?.count ?? 0,
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

  async validatePackItems(supplierId: number, items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<boolean> {
    if (!items.length) return false;
    const listingIds = Array.from(new Set(items.map((item) => item.listingId)));
    const listings = await db.select().from(supplierProductListings).where(inArray(supplierProductListings.id, listingIds));
    const listingMap = new Map(listings.map((listing) => [listing.id, listing]));
    if (listings.length !== listingIds.length || listings.some((listing) => listing.supplierId !== supplierId)) return false;

    const productIds = Array.from(new Set(listings.map((listing) => listing.productId)));
    const productRows = productIds.length ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
    const productMap = new Map(productRows.map((product) => [product.id, product]));

    const allVariants = await db.select().from(supplierProductVariants)
      .where(inArray(supplierProductVariants.listingId, listingIds));
    const variantIds = items.map((item) => item.variantId).filter((id): id is number => id != null);
    const variantRows = variantIds.length
      ? allVariants.filter((variant) => variantIds.includes(variant.id))
      : [];
    const variantMap = new Map(variantRows.map((variant) => [variant.id, variant]));
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const variant of allVariants) {
      if (!variantsByListing.has(variant.listingId)) variantsByListing.set(variant.listingId, []);
      variantsByListing.get(variant.listingId)!.push(variant);
    }

    return items.every((item) => {
      const listing = listingMap.get(item.listingId);
      const product = listing ? productMap.get(listing.productId) : undefined;
      if (!listing || listing.visibility !== 'VISIBLE' || listing.onlyForMyProducts || product?.status !== 'ACTIVE') return false;
      if (item.variantId != null) {
        const variant = variantMap.get(item.variantId);
        if (!variant || variant.listingId !== item.listingId || variant.price <= 0) return false;
        if (item.flavorIds == null) {
          return (variantsByListing.get(item.listingId) ?? []).some(v =>
            (v.sizeId ?? null) === (variant.sizeId ?? null) && v.price > 0 && v.quantity > 0,
          );
        }
        const selectedIds = new Set(item.flavorIds);
        return item.flavorIds.length > 0 && (variantsByListing.get(item.listingId) ?? []).some(v =>
          (v.sizeId ?? null) === (variant.sizeId ?? null) &&
          v.flavorId != null &&
          selectedIds.has(v.flavorId) &&
          v.price > 0 &&
          v.quantity > 0,
        );
      }
      return !variantsByListing.has(item.listingId) && listing.price > 0 && listing.stock > 0;
    });
  }

  async createPack(supplierId: number, data: { name: string; description?: string | null; imageUrl?: string | null; imageUrls?: string[] | null; flashImageUrl?: string | null; price: number; quantityAvailable: number; expirationDate?: Date | null; visibility?: 'VISIBLE' | 'HIDDEN' }, items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number; packVariantPrice?: number }[]): Promise<PackDetail> {
    const [pack] = await db.insert(packs).values({
      supplierId,
      name: data.name,
      description: data.description ?? null,
      imageUrl: data.imageUrl ?? null,
      imageUrls: data.imageUrls ?? null,
      flashImageUrl: data.flashImageUrl ?? null,
      price: data.price,
      quantityAvailable: data.quantityAvailable,
      expirationDate: data.expirationDate ?? null,
      visibility: data.visibility ?? 'VISIBLE',
    }).returning();
    if (items.length) {
      await db.insert(packItems).values(items.map((i) => ({ packId: pack.id, listingId: i.listingId, variantId: i.variantId ?? null, flavorIds: i.flavorIds ?? null, quantity: i.quantity, packVariantPrice: i.packVariantPrice ?? 0 })));
    }
    const [detail] = await this.buildPackDetails([pack]);
    return detail;
  }

  async updatePack(id: number, supplierId: number, data: Partial<{ name: string; description: string | null; imageUrl: string | null; imageUrls: string[] | null; flashImageUrl: string | null; price: number; quantityAvailable: number; expirationDate: Date | null; visibility: 'VISIBLE' | 'HIDDEN'; isArchived: boolean }>, items?: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number; packVariantPrice?: number }[]): Promise<PackDetail | undefined> {
    const [existing] = await db.select().from(packs).where(and(eq(packs.id, id), eq(packs.supplierId, supplierId)));
    if (!existing) return undefined;
    const [updated] = await db.update(packs).set({ ...data, updatedAt: new Date() } as any).where(eq(packs.id, id)).returning();
    if (items !== undefined) {
      await db.delete(packItems).where(eq(packItems.packId, id));
      if (items.length) {
        await db.insert(packItems).values(items.map((i) => ({ packId: id, listingId: i.listingId, variantId: i.variantId ?? null, flavorIds: i.flavorIds ?? null, quantity: i.quantity, packVariantPrice: i.packVariantPrice ?? 0 })));
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
      imageUrls: existing.imageUrls,
      flashImageUrl: existing.flashImageUrl,
      price: existing.price,
      quantityAvailable: existing.quantityAvailable,
      expirationDate: existing.expirationDate,
      visibility: existing.visibility === 'VISIBLE' ? 'HIDDEN' : existing.visibility,
    }, existingItems.map((i) => ({ listingId: i.listingId, variantId: i.variantId, flavorIds: i.flavorIds, quantity: i.quantity, packVariantPrice: (i as any).packVariantPrice ?? 0 })));
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
    if (filters?.flavorId) details = details.filter((p) => p.items.some((i) => i.flavorId === filters.flavorId || i.listingVariants.some((v) => v.flavorId === filters.flavorId)));
    if (filters?.sizeId) details = details.filter((p) => p.items.some((i) => i.sizeId === filters.sizeId || i.listingVariants.some((v) => v.sizeId === filters.sizeId)));
    return details;
  }

  async getAdminPacks(): Promise<PackDetail[]> {
    const rows = await db.select().from(packs).orderBy(desc(packs.createdAt));
    return this.buildPackDetails(rows);
  }

  async computeAutoPackQuantity(items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<number> {
    if (!items.length) return 0;
    let max = Infinity;
    for (const it of items) {
      let availableQty = 0;
      if (it.variantId != null) {
        const [representative] = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, it.variantId));
        const group = await db.select().from(supplierProductVariants).where(and(
          eq(supplierProductVariants.listingId, it.listingId),
          representative?.sizeId == null ? isNull(supplierProductVariants.sizeId) : eq(supplierProductVariants.sizeId, representative.sizeId),
        ));
        const selected = it.flavorIds == null ? group : group.filter((v) => v.flavorId != null && it.flavorIds!.includes(v.flavorId));
        availableQty = selected.reduce((sum, v) => sum + (v.price > 0 && v.quantity > 0 ? v.quantity : 0), 0);
      } else {
        const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, it.listingId));
        availableQty = listing?.stock ?? 0;
      }
      const buildable = it.quantity > 0 ? Math.floor(availableQty / it.quantity) : 0;
      max = Math.min(max, buildable);
    }
    return isFinite(max) ? max : 0;
  }

  async computePackItemsTotal(items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<number> {
    let total = 0;
    for (const it of items) {
      let unitPrice = 0;
      if (it.variantId != null) {
        const [representative] = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, it.variantId));
        const group = await db.select().from(supplierProductVariants).where(and(
          eq(supplierProductVariants.listingId, it.listingId),
          representative?.sizeId == null ? isNull(supplierProductVariants.sizeId) : eq(supplierProductVariants.sizeId, representative.sizeId),
        ));
        const selected = it.flavorIds == null ? group : group.filter((v) => v.flavorId != null && it.flavorIds!.includes(v.flavorId));
        // A pack may be built from any selected flavor; use the highest
        // selected original price for the discount safety check.
        unitPrice = selected.reduce((maxPrice, v) => Math.max(maxPrice, v.price), 0);
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
}
