/**
 * Centralized promotion evaluation engine.
 * This module is the single source of truth for how promotions are applied —
 * both for real-time cart preview (client-driven) and server-side order creation.
 */

import type {
  Promotion, QuantityTier, GiftInfo,
  SupplierPromotionResult, CartPromotionEvaluation,
} from "@shared/schema";

// ── Input types ───────────────────────────────────────────────────────────────

export type PromoCartItem = {
  listingId: number;
  productId: number;
  categoryId: number | null;
  supplierId: number;
  quantity: number;
  unitPrice: number; // cents
};

export type EvaluationContext = {
  cafeId: number;
  cafeOrderCount: number; // total orders this cafe has placed with this supplier
};

// ── Utility ───────────────────────────────────────────────────────────────────

function isPromotionValid(p: Promotion, now: Date, usageByPromo: Map<number, number>): boolean {
  if (p.status === 'PAUSED' || p.status === 'EXPIRED') return false;
  if (p.startDate && now < p.startDate) return false;
  if (p.endDate && now > p.endDate) return false;
  if (p.maxUses != null) {
    const used = usageByPromo.get(p.id) ?? p.usageCount;
    if (used >= p.maxUses) return false;
  }
  return true;
}

function isCafeEligible(p: Promotion, cafeId: number): boolean {
  if (!p.eligibleCafeIds || p.eligibleCafeIds.length === 0) return true;
  return p.eligibleCafeIds.includes(cafeId);
}

function getTargetedItems(p: Promotion, items: PromoCartItem[]): PromoCartItem[] {
  if (p.targetType === 'ALL') return items;
  if (p.targetType === 'PRODUCTS') {
    const ids = new Set(p.targetListingIds ?? []);
    return items.filter(i => ids.has(i.listingId));
  }
  if (p.targetType === 'CATEGORIES') {
    const ids = new Set(p.targetCategoryIds ?? []);
    return items.filter(i => i.categoryId != null && ids.has(i.categoryId));
  }
  return items;
}

// ── Per-promotion discount calculation ────────────────────────────────────────

interface CalcResult {
  discountAmount: number;   // cents
  freeShipping: boolean;
  giftInfo: GiftInfo | null;
  appliedTierPrice: number | null;
}

function calcDiscount(p: Promotion, targeted: PromoCartItem[], subtotal: number): CalcResult | null {
  const totalQty = targeted.reduce((s, i) => s + i.quantity, 0);
  const targetedSubtotal = targeted.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  switch (p.type) {
    case 'PERCENTAGE':
    case 'CATEGORY_DISCOUNT': {
      if (targetedSubtotal === 0) return null;
      const raw = Math.round(targetedSubtotal * p.discountValue / 10000);
      const discount = p.maximumDiscount ? Math.min(raw, p.maximumDiscount) : raw;
      return { discountAmount: discount, freeShipping: false, giftInfo: null, appliedTierPrice: null };
    }
    case 'FIXED_AMOUNT':
    case 'MIN_ORDER_AMOUNT': {
      const minValue = p.minimumOrderValue ?? 0;
      if (subtotal < minValue) return null;
      const discount = Math.min(p.discountValue, subtotal);
      return { discountAmount: discount, freeShipping: false, giftInfo: null, appliedTierPrice: null };
    }
    case 'MIN_QUANTITY': {
      const minQty = p.minimumQuantity ?? 1;
      if (totalQty < minQty) return null;
      const raw = Math.round(targetedSubtotal * p.discountValue / 10000);
      const discount = p.maximumDiscount ? Math.min(raw, p.maximumDiscount) : raw;
      return { discountAmount: discount, freeShipping: false, giftInfo: null, appliedTierPrice: null };
    }
    case 'BUY_X_GET_Y': {
      const buyQty = p.buyQuantity ?? 1;
      const getQty = p.getQuantity ?? 1;
      if (totalQty < buyQty) return null;
      // How many free units are earned
      const sets = Math.floor(totalQty / (buyQty + getQty));
      const freeUnits = sets * getQty;
      if (freeUnits === 0) return null;
      // Use the lowest unit price of targeted items as the free item value
      const lowestPrice = Math.min(...targeted.map(i => i.unitPrice));
      const discount = freeUnits * lowestPrice;
      return { discountAmount: discount, freeShipping: false, giftInfo: null, appliedTierPrice: null };
    }
    case 'QUANTITY_TIER': {
      const tiers = (p.tiers as QuantityTier[] | null) ?? [];
      if (tiers.length === 0 || targeted.length === 0) return null;
      // Find applicable tier for total quantity
      const tier = tiers
        .filter(t => totalQty >= t.minQty && (t.maxQty == null || totalQty <= t.maxQty))
        .sort((a, b) => b.minQty - a.minQty)[0];
      if (!tier) return null;
      // Original subtotal for targeted items vs tier-priced subtotal
      const tieredSubtotal = tier.pricePerUnit * totalQty;
      const discount = Math.max(0, targetedSubtotal - tieredSubtotal);
      return { discountAmount: discount, freeShipping: false, giftInfo: null, appliedTierPrice: tier.pricePerUnit };
    }
    case 'FREE_SHIPPING': {
      const minAmount = p.freeShippingMinAmount ?? 0;
      if (subtotal < minAmount) return null;
      return { discountAmount: 0, freeShipping: true, giftInfo: null, appliedTierPrice: null };
    }
    case 'GIFT': {
      const minValue = p.minimumOrderValue ?? 0;
      const minQty = p.minimumQuantity ?? 0;
      if (subtotal < minValue) return null;
      if (minQty > 0 && totalQty < minQty) return null;
      const gift = (p.giftInfo as GiftInfo | null) ?? { description: 'Free gift', quantity: 1 };
      return { discountAmount: 0, freeShipping: false, giftInfo: gift, appliedTierPrice: null };
    }
    case 'FIRST_ORDER': {
      // Caller sets cafeOrderCount; 0 = first order
      const raw = Math.round(subtotal * p.discountValue / 10000);
      const discount = p.maximumDiscount ? Math.min(raw, p.maximumDiscount) : raw;
      return { discountAmount: discount, freeShipping: false, giftInfo: null, appliedTierPrice: null };
    }
    default:
      return null;
  }
}

// ── Main evaluation function ──────────────────────────────────────────────────

/**
 * Evaluate all promotions for a cart grouped by supplier.
 * `promotionsBySupplier` maps supplierId → sorted (by priority desc) promotions.
 * `usageByPromo` maps promotionId → how many times cafeId has used it.
 * `cafeOrderCountBySupplier` maps supplierId → total orders this cafe placed.
 */
export function evaluateCartPromotions(
  itemsBySupplier: Map<number, PromoCartItem[]>,
  promotionsBySupplier: Map<number, Promotion[]>,
  usageByPromo: Map<number, number>,
  cafeOrderCountBySupplier: Map<number, number>,
  cafeId: number,
): CartPromotionEvaluation {
  const now = new Date();
  const bySupplier: SupplierPromotionResult[] = [];

  for (const [supplierId, items] of Array.from(itemsBySupplier.entries())) {
    const subtotal = (items as PromoCartItem[]).reduce((s: number, i: PromoCartItem) => s + i.unitPrice * i.quantity, 0);
    const promos = (promotionsBySupplier.get(supplierId) ?? [])
      .filter(p => isPromotionValid(p, now, usageByPromo) && isCafeEligible(p, cafeId))
      .sort((a, b) => b.priority - a.priority);

    const orderCount = cafeOrderCountBySupplier.get(supplierId) ?? 0;
    const isFirst = orderCount === 0;

    let bestDiscount = 0;
    let bestResult: CalcResult | null = null;
    let bestPromo: Promotion | null = null;

    const stackable: { promo: Promotion; result: CalcResult }[] = [];

    for (const p of promos) {
      // First-order promotions: skip if this is not a first order
      if (p.type === 'FIRST_ORDER' && !isFirst) continue;

      const targeted = getTargetedItems(p, items);
      if (targeted.length === 0 && p.targetType !== 'ALL') continue;

      const result = calcDiscount(p, targeted, subtotal);
      if (!result) continue;

      if (p.stackable) {
        stackable.push({ promo: p, result });
      } else {
        // Non-stackable: pick the one that gives the highest monetary benefit
        const value = result.discountAmount + (result.freeShipping ? 1 : 0) + (result.giftInfo ? 1 : 0);
        if (value > bestDiscount) {
          bestDiscount = value;
          bestResult = result;
          bestPromo = p;
        }
      }
    }

    // Combine stackable promotions on top of the best non-stackable
    let totalDiscount = bestResult?.discountAmount ?? 0;
    let freeShipping = bestResult?.freeShipping ?? false;
    let giftInfo = bestResult?.giftInfo ?? null;
    let appliedTierPrice = bestResult?.appliedTierPrice ?? null;
    let appliedPromo = bestPromo;

    for (const { promo, result } of stackable) {
      totalDiscount += result.discountAmount;
      if (result.freeShipping) freeShipping = true;
      if (result.giftInfo && !giftInfo) giftInfo = result.giftInfo;
      if (!appliedPromo) { appliedPromo = promo; appliedTierPrice = result.appliedTierPrice; }
    }

    // Don't discount more than the subtotal
    totalDiscount = Math.min(totalDiscount, subtotal);

    bySupplier.push({
      supplierId,
      promotionId: appliedPromo?.id ?? null,
      promotionName: appliedPromo?.name ?? null,
      promotionType: appliedPromo?.type ?? null,
      originalSubtotal: subtotal,
      discountAmount: totalDiscount,
      finalSubtotal: subtotal - totalDiscount,
      freeShipping,
      giftInfo,
      appliedTierPrice,
    });
  }

  const totalOriginal = bySupplier.reduce((s, r) => s + r.originalSubtotal, 0);
  const totalDiscount = bySupplier.reduce((s, r) => s + r.discountAmount, 0);

  return {
    bySupplier,
    totalOriginal,
    totalDiscount,
    totalFinal: totalOriginal - totalDiscount,
  };
}
