import { db } from "../../db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { evaluateCartPromotions as engineEvaluate } from "../../promotions-engine";
import type { PromoCartItem } from "../../promotions-engine";
import {
  promotions, promotionUsage, orders, subOrders, supplierProductListings, products,
} from "@shared/schema";
import type { DatabaseStorage } from "../../storage";

// Stage 2 extraction — Promotions domain (admin CRUD + marketplace evaluation
// engine; the same logical domain, just split across two sections of the
// original file by an interleaved Discount Codes block). Moved verbatim out
// of server/storage.ts's DatabaseStorage class; see
// server/STORAGE_ARCHITECTURE.md ("Stage 2 — Batch 5") for the dependency
// analysis. This is the first extracted domain with a real outbound
// cross-domain call (getPromotionsForListings -> getCurrency, which still
// lives on DatabaseStorage today), resolved through the `facade` reference
// passed in at construction — see server/storage.ts's field initializer.
export class PromotionsStorage {
  constructor(private facade: DatabaseStorage) {}

  async getPromotions(supplierId: number): Promise<import("@shared/schema").Promotion[]> {
    return db.select().from(promotions)
      .where(eq(promotions.supplierId, supplierId))
      .orderBy(desc(promotions.priority), desc(promotions.createdAt));
  }

  async getPromotion(id: number, supplierId?: number): Promise<import("@shared/schema").Promotion | undefined> {
    const conds = [eq(promotions.id, id)];
    if (supplierId != null) conds.push(eq(promotions.supplierId, supplierId));
    const [row] = await db.select().from(promotions).where(and(...conds));
    return row;
  }

  async createPromotion(data: import("@shared/schema").InsertPromotion): Promise<import("@shared/schema").Promotion> {
    const [row] = await db.insert(promotions).values(data as any).returning();
    return row;
  }

  async updatePromotion(id: number, supplierId: number, updates: Partial<import("@shared/schema").InsertPromotion>): Promise<import("@shared/schema").Promotion | undefined> {
    const [row] = await db.update(promotions)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(and(eq(promotions.id, id), eq(promotions.supplierId, supplierId)))
      .returning();
    return row;
  }

  async deletePromotion(id: number, supplierId: number): Promise<void> {
    await db.delete(promotions).where(and(eq(promotions.id, id), eq(promotions.supplierId, supplierId)));
  }

  async duplicatePromotion(id: number, supplierId: number): Promise<import("@shared/schema").Promotion | undefined> {
    const [orig] = await db.select().from(promotions).where(and(eq(promotions.id, id), eq(promotions.supplierId, supplierId)));
    if (!orig) return undefined;
    const { id: _id, createdAt: _ca, updatedAt: _ua, usageCount: _uc, ...rest } = orig;
    const [dup] = await db.insert(promotions).values({
      ...rest,
      name: `${orig.name} (Copy)`,
      status: 'PAUSED',
      usageCount: 0,
    } as any).returning();
    return dup;
  }

  async getPromotionStats(supplierId: number): Promise<{ active: number; paused: number; scheduled: number; expired: number; totalUses: number; totalRevenue: number; totalDiscount: number }> {
    const all = await db.select().from(promotions).where(eq(promotions.supplierId, supplierId));
    const now = new Date();
    let active = 0, paused = 0, scheduled = 0, expired = 0, totalUses = 0;
    for (const p of all) {
      totalUses += p.usageCount;
      if (p.status === 'PAUSED') { paused++; continue; }
      if (p.endDate && p.endDate < now) { expired++; continue; }
      if (p.startDate && p.startDate > now) { scheduled++; continue; }
      if (p.status === 'ACTIVE') active++;
      else if (p.status === 'SCHEDULED') scheduled++;
      else if (p.status === 'EXPIRED') expired++;
    }
    const usageRows = await db.select().from(promotionUsage).where(
      inArray(promotionUsage.promotionId, all.map(p => p.id).filter(Boolean))
    );
    const totalDiscount = usageRows.reduce((s, r) => s + r.discountAmount, 0);
    // Revenue: sum of order totals that used a promotion from this supplier
    const orderIds = Array.from(new Set(usageRows.map(r => r.orderId)));
    let totalRevenue = 0;
    if (orderIds.length > 0) {
      const orderRows = await db.select().from(orders).where(inArray(orders.id, orderIds));
      totalRevenue = orderRows.reduce((s, o) => s + o.totalAmount, 0);
    }
    return { active, paused, scheduled, expired, totalUses, totalRevenue, totalDiscount };
  }

  async getPromotionUsage(promotionId: number): Promise<import("@shared/schema").PromotionUsage[]> {
    return db.select().from(promotionUsage)
      .where(eq(promotionUsage.promotionId, promotionId))
      .orderBy(desc(promotionUsage.createdAt));
  }

  async getActivePromotionsForSupplier(supplierId: number, cafeId?: number): Promise<import("@shared/schema").Promotion[]> {
    const now = new Date();
    const rows = await db.select().from(promotions).where(and(
      eq(promotions.supplierId, supplierId),
      eq(promotions.status, 'ACTIVE'),
    ));
    return rows.filter(p => {
      if (p.startDate && p.startDate > now) return false;
      if (p.endDate && p.endDate < now) return false;
      if (p.maxUses != null && p.usageCount >= p.maxUses) return false;
      if (cafeId != null && p.eligibleCafeIds && p.eligibleCafeIds.length > 0) {
        return p.eligibleCafeIds.includes(cafeId);
      }
      return true;
    });
  }

  async getPromotionsForListings(listingIds: number[], cafeId?: number): Promise<import("@shared/schema").ListingPromotion[]> {
    if (listingIds.length === 0) return [];
    // Get all supplier IDs for these listings
    const listingRows = await db.select().from(supplierProductListings)
      .where(inArray(supplierProductListings.id, listingIds));
    const supplierIds = Array.from(new Set(listingRows.map(l => l.supplierId)));
    if (supplierIds.length === 0) return [];

    const now = new Date();
    const promoRows = await db.select().from(promotions).where(and(
      inArray(promotions.supplierId, supplierIds),
      eq(promotions.status, 'ACTIVE'),
    ));
    const active = promoRows.filter(p => {
      if (p.startDate && p.startDate > now) return false;
      if (p.endDate && p.endDate < now) return false;
      if (p.maxUses != null && p.usageCount >= p.maxUses) return false;
      if (cafeId != null && p.eligibleCafeIds && p.eligibleCafeIds.length > 0) {
        return p.eligibleCafeIds.includes(cafeId);
      }
      return true;
    });

    const currencySymbol = await this.facade.getCurrency();
    const result: import("@shared/schema").ListingPromotion[] = [];
    const supplierListings = new Map<number, number[]>(); // supplierId → listingIds
    for (const l of listingRows) {
      if (!supplierListings.has(l.supplierId)) supplierListings.set(l.supplierId, []);
      supplierListings.get(l.supplierId)!.push(l.id);
    }

    for (const p of active) {
      const supplierListingIds = supplierListings.get(p.supplierId) ?? [];
      let applicableListings: number[] = [];
      if (p.targetType === 'ALL') {
        applicableListings = supplierListingIds.filter(id => listingIds.includes(id));
      } else if (p.targetType === 'PRODUCTS' && p.targetListingIds) {
        applicableListings = p.targetListingIds.filter(id => listingIds.includes(id));
      } else if (p.targetType === 'CATEGORIES' && p.targetCategoryIds) {
        // Resolve by looking at the product's categoryId
        const prods = await db.select().from(products).where(inArray(products.id, listingRows.map(l => l.productId)));
        const catSet = new Set(p.targetCategoryIds);
        // Category Discount promotions are scoped to the supplier that owns
        // the promotion. Only inspect that supplier's requested listings.
        const candidateListings = p.type === 'CATEGORY_DISCOUNT'
          ? listingRows.filter(l => l.supplierId === p.supplierId)
          : listingRows;
        for (const l of candidateListings) {
          const prod = prods.find(pr => pr.id === l.productId);
          if (prod?.categoryId != null && catSet.has(prod.categoryId) && listingIds.includes(l.id)) {
            applicableListings.push(l.id);
          }
        }
      }
      for (const listingId of applicableListings) {
        result.push({
          listingId,
          promotionId: p.id,
          type: p.type,
          label: this._promoLabel(p, currencySymbol),
          endDate: p.endDate,
          discountValue: p.discountValue,
        });
      }
    }
    return result;
  }

  private _promoLabel(p: import("@shared/schema").Promotion, currencySymbol: string): string {
    switch (p.type) {
      case 'PERCENTAGE':
      case 'CATEGORY_DISCOUNT': return `${p.discountValue / 100}% OFF`;
      case 'FIXED_AMOUNT':
      case 'MIN_ORDER_AMOUNT': return `${(p.discountValue / 1000).toFixed(3)} ${currencySymbol} OFF`;
      case 'BUY_X_GET_Y': return `Buy ${p.buyQuantity} Get ${p.getQuantity}`;
      case 'QUANTITY_TIER': return 'Tier Pricing';
      case 'FREE_SHIPPING': return 'Free Shipping';
      case 'GIFT': return 'Free Gift';
      case 'MIN_QUANTITY': return `${p.discountValue / 100}% on ${p.minimumQuantity}+`;
      case 'FIRST_ORDER': return `${p.discountValue / 100}% First Order`;
      default: return p.name;
    }
  }

  async evaluateCartPromotions(
    itemsBySupplier: Map<number, PromoCartItem[]>,
    cafeId: number,
  ): Promise<import("@shared/schema").CartPromotionEvaluation> {
    // The cart clients do not need to persist taxonomy data. Resolve category
    // IDs from the authoritative listing/product rows before evaluating so a
    // category promotion can never rely on stale or missing client data.
    const allItems = Array.from(itemsBySupplier.values()).flat();
    const listingIds = Array.from(new Set(allItems.map(item => item.listingId)));
    if (listingIds.length > 0) {
      const listingRows = await db.select().from(supplierProductListings)
        .where(inArray(supplierProductListings.id, listingIds));
      const productIds = Array.from(new Set(listingRows.map(listing => listing.productId)));
      const productRows = productIds.length
        ? await db.select().from(products).where(inArray(products.id, productIds))
        : [];
      const listingMap = new Map(listingRows.map(listing => [listing.id, listing]));
      const productMap = new Map(productRows.map(product => [product.id, product]));

      for (const [supplierId, items] of Array.from(itemsBySupplier.entries())) {
        for (const item of items) {
          const listing = listingMap.get(item.listingId);
          const product = listing ? productMap.get(listing.productId) : undefined;
          // Keep the supplied grouping and all other promotion inputs intact;
          // only replace the category with the server-authoritative value.
          item.categoryId = listing && listing.supplierId === supplierId && product
            ? product.categoryId
            : null;
        }
      }
    }

    const supplierIds = Array.from(itemsBySupplier.keys());
    if (supplierIds.length === 0) {
      return { bySupplier: [], totalOriginal: 0, totalDiscount: 0, totalFinal: 0 };
    }

    // Load active promotions for all suppliers
    const promotionsBySupplier = new Map<number, import("@shared/schema").Promotion[]>();
    await Promise.all(supplierIds.map(async (sid) => {
      const promos = await this.getActivePromotionsForSupplier(sid, cafeId);
      promotionsBySupplier.set(sid, promos);
    }));

    // Load per-cafe usage counts for rate-limiting
    const allPromoIds = Array.from(promotionsBySupplier.values()).flat().map((p: import("@shared/schema").Promotion) => p.id);
    const usageByPromo = new Map<number, number>();
    if (allPromoIds.length > 0) {
      const usages = await db.select().from(promotionUsage).where(and(
        inArray(promotionUsage.promotionId, allPromoIds),
        eq(promotionUsage.cafeId, cafeId),
      ));
      for (const u of usages) {
        usageByPromo.set(u.promotionId, (usageByPromo.get(u.promotionId) ?? 0) + 1);
      }
    }

    // Load order counts per supplier for first-order promotions
    const cafeOrderCountBySupplier = new Map<number, number>();
    await Promise.all(supplierIds.map(async (sid) => {
      const count = await this.getCafeOrderCountForSupplier(cafeId, sid);
      cafeOrderCountBySupplier.set(sid, count);
    }));

    return engineEvaluate(itemsBySupplier, promotionsBySupplier, usageByPromo, cafeOrderCountBySupplier, cafeId);
  }

  async recordPromotionUsage(promotionId: number, cafeId: number, orderId: number, discountAmount: number): Promise<void> {
    await db.insert(promotionUsage).values({ promotionId, cafeId, orderId, discountAmount });
    await db.update(promotions)
      .set({ usageCount: sql`${promotions.usageCount} + 1` })
      .where(eq(promotions.id, promotionId));
  }

  async getCafeOrderCountForSupplier(cafeId: number, supplierId: number): Promise<number> {
    // Count sub-orders this cafe has placed with this supplier
    const rows = await db.select().from(subOrders).where(eq(subOrders.supplierId, supplierId));
    // Filter by cafeId via orders join
    const orderIds = rows.map(r => r.orderId);
    if (orderIds.length === 0) return 0;
    const cafeOrders = await db.select().from(orders).where(and(
      inArray(orders.id, orderIds),
      eq(orders.cafeId, cafeId),
    ));
    return cafeOrders.length;
  }
}
