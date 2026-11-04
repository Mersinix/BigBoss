import { db } from "../../db";
import { eq, and, inArray, isNull, desc, sql } from "drizzle-orm";
import {
  supplierProductListings, supplierProductVariants, products, packItems, inventoryAdjustments,
  type SupplierVariantWithLabels,
  type InventoryItem, type InventoryVariantItem, type InventoryListResult, type InventoryStats,
  type InventoryFilters, type InventorySort, type InventoryAdjustmentWithVariant, type StockStatus,
} from "@shared/schema";
import { buildTaxonomyCache } from "../../storage";
import type { DatabaseStorage } from "../../storage";

// Stage 2 — Batch 43: the complete Inventory domain — variant/listing
// stock persistence, stock adjustments + their history, stock-status
// computation, the Supplier Inventory list/stats view, and
// order-cancellation restocking — moved out of server/storage.ts's
// DatabaseStorage class. This merges two previously-separate monolith
// sections: the real "── Inventory ──" section, and
// `getVariantsByListingId`/`saveVariants`, which were physically filed
// under an adjacent "── Supplier variants ──" header despite being
// genuine variant-stock persistence (the Inventory section's own
// methods already called them 5 times internally) — see
// server/STORAGE_ARCHITECTURE.md ("Batch 43") for the full ownership
// audit and the "physically displaced, real ownership elsewhere"
// precedent this follows.
//
// Facade dependency — exactly 1 call into a method that stays resident
// on DatabaseStorage (delegated to SupplierStorage): `bulkInventoryAction`'s
// 'delete' action calls `this.facade.deleteSupplierListing(...)` — a
// genuine Supplier-domain listing-lifecycle operation (which itself
// directly deletes `supplierProductVariants`/`inventoryAdjustments`
// rows as part of that lifecycle, a pre-existing, unchanged pattern —
// see deleteSupplierListing's own code), not something this batch
// absorbs into Inventory.
//
// Reverse dependencies (other domains calling INTO this class) are
// unaffected by this move: order.storage.ts and delivery.storage.ts
// already reach `getVariantsByListingId`/`restockFromOrderCancellation`/
// `restockVariantFromOrderCancellation` via `this.facade.<method>(...)`,
// and supplier.storage.ts already reaches `saveVariants` the same way
// (including with a live transaction client propagated through,
// unchanged) — none of those call sites needed to change, since they
// were already facade calls, never a direct field reference.
//
// Zero transactions exist anywhere in this domain (confirmed via a
// full grep of every source location before moving anything) — the
// project-wide transaction count is unaffected by this batch.
export class InventoryStorage {
  constructor(private facade: DatabaseStorage) {}

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Variant stock persistence — physically filed under "Supplier variants" in the original
  // monolith, but genuinely Inventory-owned (variant stock CRUD, not listing lifecycle).
  // ══════════════════════════════════════════════════════════════════════════════════════

  async getVariantsByListingId(listingId: number): Promise<SupplierVariantWithLabels[]> {
    const variants = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, listingId));
    const tx = await buildTaxonomyCache();
    return variants.map((v) => ({
      ...v,
      flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
      sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
    }));
  }

  async saveVariants(listingId: number, variants: { flavorId?: number | null; sizeId?: number | null; price: number; quantity: number }[], client: any = db): Promise<SupplierVariantWithLabels[]> {
    // Reconciled by flavor/size "slot" instead of delete-all + recreate (task:
    // "Synchronize Supplier Variant Stock Without Overwriting Inventory
    // Settings") — a slot that still exists gets a targeted UPDATE of just
    // price/quantity, which never touches minStock/maxStock (Inventory's own
    // fields, set via updateVariantInventoryFields) and keeps the same row id
    // (so Pack references to it never need reassigning). Only a slot that's
    // genuinely gone gets deleted, and only a genuinely new slot gets inserted.
    const previousVariants = await client.select().from(supplierProductVariants)
      .where(eq(supplierProductVariants.listingId, listingId));
    const previousVariantIds = previousVariants.map((v: any) => v.id);
    const previousPackItems = previousVariantIds.length
      ? await client.select().from(packItems).where(inArray(packItems.variantId, previousVariantIds))
      : [];

    if (!variants.length) {
      // Supplier cleared the Variant Builder entirely — intentional full wipe.
      await client.delete(supplierProductVariants).where(eq(supplierProductVariants.listingId, listingId));
      if (previousPackItems.length) {
        await client.delete(packItems).where(inArray(packItems.id, previousPackItems.map((item: any) => item.id)));
      }
      await client.update(supplierProductListings).set({ price: 0, stock: 0 }).where(eq(supplierProductListings.id, listingId));
      return [];
    }

    const previousBySlot = new Map(previousVariants.map((v: any) => [`${v.flavorId ?? "null"}:${v.sizeId ?? "null"}`, v]));
    const matchedPreviousIds = new Set<number>();
    const result: any[] = [];
    for (const v of variants) {
      const slot = `${v.flavorId ?? "null"}:${v.sizeId ?? "null"}`;
      const prev = previousBySlot.get(slot) as any;
      // Consume the match so a duplicate incoming slot (if the client ever
      // sends one) falls through to a fresh insert instead of double-updating
      // the same existing row — same tolerance for duplicates the old
      // insert-everything approach had.
      if (prev && !matchedPreviousIds.has(prev.id)) {
        matchedPreviousIds.add(prev.id);
        const [updated] = await client.update(supplierProductVariants)
          .set({ price: v.price, quantity: v.quantity })
          .where(eq(supplierProductVariants.id, prev.id))
          .returning();
        result.push(updated);
      } else {
        const [inserted] = await client.insert(supplierProductVariants)
          .values({ listingId, flavorId: v.flavorId ?? null, sizeId: v.sizeId ?? null, price: v.price, quantity: v.quantity })
          .returning();
        result.push(inserted);
      }
    }
    const removedVariants = previousVariants.filter((v: any) => !matchedPreviousIds.has(v.id));
    if (removedVariants.length) {
      await client.delete(supplierProductVariants).where(inArray(supplierProductVariants.id, removedVariants.map((v: any) => v.id)));
    }

    const aggPrice = Math.min(...result.map((v: any) => v.price));
    const aggStock = result.reduce((s: number, v: any) => s + v.quantity, 0);
    await client.update(supplierProductListings).set({ price: aggPrice, stock: aggStock }).where(eq(supplierProductListings.id, listingId));

    // Pack references only need attention for variants that were actually
    // removed — retained variants kept their id, so their Pack references
    // are still valid as-is.
    if (removedVariants.length) {
      const removedIds = new Set(removedVariants.map((v: any) => v.id));
      for (const item of previousPackItems) {
        if (removedIds.has(item.variantId)) {
          await client.delete(packItems).where(eq(packItems.id, item.id));
        }
      }
    }
    // A listing that changes from a non-variant product to a variant product
    // can no longer satisfy an old listing-level Pack component.
    await client.delete(packItems).where(and(
      eq(packItems.listingId, listingId),
      isNull(packItems.variantId),
    ));

    const tx = await buildTaxonomyCache();
    return result.map((v: any) => ({
      ...v,
      flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
      sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Inventory — stock status, the Supplier Inventory list/stats view, stock adjustments +
  // history, and order-cancellation restocking.
  // ══════════════════════════════════════════════════════════════════════════════════════

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
        imageAdjustments: prod.imageAdjustments ?? {},
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
      // Use the single-listing deletion path so Pack relations are removed
      // and affected Packs keep their existing archive behavior.
      for (const listing of owned) {
        await this.facade.deleteSupplierListing(listing.id);
      }
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
}
