import { db } from "../../db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { discountCodes, discountCodeUsage } from "@shared/schema";

// Stage 2 extraction — Discount Codes domain. Moved verbatim out of
// server/storage.ts's DatabaseStorage class; see
// server/STORAGE_ARCHITECTURE.md ("Stage 2 — Batch 8") for the dependency
// analysis (zero transactions, zero cross-domain `this.*` calls in or out,
// 0 private helpers — the only internal calls are intra-domain:
// removeDiscountCode -> updateDiscountCode and
// validateDiscountCode -> getDiscountCodeByCode).
export class DiscountCodesStorage {
  async getDiscountCodes(supplierId: number): Promise<import("@shared/schema").DiscountCode[]> {
    return db.select().from(discountCodes)
      .where(and(eq(discountCodes.supplierId, supplierId), eq(discountCodes.isRemoved, false)))
      .orderBy(desc(discountCodes.createdAt));
  }

  // Soft-delete only (task: "Supplier Module — Custom Removal Confirmation
  // Modals and Discount Code Removal") — see the isRemoved column comment in
  // shared/schema.ts for why a hard DELETE is never used here. Reuses
  // updateDiscountCode's existing ownership-scoped WHERE clause.
  async removeDiscountCode(id: number, supplierId: number): Promise<import("@shared/schema").DiscountCode | undefined> {
    return this.updateDiscountCode(id, supplierId, { isRemoved: true } as any);
  }

  async getDiscountCode(id: number, supplierId?: number): Promise<import("@shared/schema").DiscountCode | undefined> {
    const conds = [eq(discountCodes.id, id)];
    if (supplierId != null) conds.push(eq(discountCodes.supplierId, supplierId));
    const [row] = await db.select().from(discountCodes).where(and(...conds));
    return row;
  }

  async getDiscountCodeByCode(code: string): Promise<import("@shared/schema").DiscountCode | undefined> {
    const [row] = await db.select().from(discountCodes).where(eq(discountCodes.code, code.trim().toUpperCase()));
    return row;
  }

  async createDiscountCode(data: import("@shared/schema").InsertDiscountCode): Promise<import("@shared/schema").DiscountCode> {
    const [row] = await db.insert(discountCodes).values({ ...data, code: data.code.trim().toUpperCase() } as any).returning();
    return row;
  }

  async updateDiscountCode(id: number, supplierId: number, updates: Partial<import("@shared/schema").InsertDiscountCode>): Promise<import("@shared/schema").DiscountCode | undefined> {
    const safeUpdates: any = { ...updates, updatedAt: new Date() };
    if (typeof safeUpdates.code === 'string') safeUpdates.code = safeUpdates.code.trim().toUpperCase();
    const [row] = await db.update(discountCodes)
      .set(safeUpdates)
      .where(and(eq(discountCodes.id, id), eq(discountCodes.supplierId, supplierId)))
      .returning();
    return row;
  }

  async getDiscountCodeStats(supplierId: number): Promise<{ active: number; inactive: number; expired: number; usageLimitReached: number; totalRedemptions: number; totalDiscount: number }> {
    // Historical totals (redemptions/discount) count every code the supplier
    // ever had, removed or not — that revenue/discount activity genuinely
    // happened and a later removal shouldn't erase it from reporting. The
    // status buckets (active/inactive/expired/limit) only make sense for
    // codes still in the supplier's list, so those exclude removed codes.
    const all = await db.select().from(discountCodes).where(eq(discountCodes.supplierId, supplierId));
    const now = new Date();
    let active = 0, inactive = 0, expired = 0, usageLimitReached = 0, totalRedemptions = 0;
    for (const c of all) {
      totalRedemptions += c.usageCount;
      if (c.isRemoved) continue;
      if (!c.isActive) { inactive++; continue; }
      if (c.expiresAt && new Date(c.expiresAt) < now) { expired++; continue; }
      if (c.maxUses != null && c.usageCount >= c.maxUses) { usageLimitReached++; continue; }
      active++;
    }
    const usageRows = all.length
      ? await db.select().from(discountCodeUsage).where(inArray(discountCodeUsage.discountCodeId, all.map(c => c.id)))
      : [];
    const totalDiscount = usageRows.reduce((s, r) => s + r.discountAmount, 0);
    return { active, inactive, expired, usageLimitReached, totalRedemptions, totalDiscount };
  }

  async getDiscountCodeUsageHistory(discountCodeId: number): Promise<import("@shared/schema").DiscountCodeUsage[]> {
    return db.select().from(discountCodeUsage)
      .where(eq(discountCodeUsage.discountCodeId, discountCodeId))
      .orderBy(desc(discountCodeUsage.createdAt));
  }

  // Validates a code against ONE supplier's subtotal — a code always belongs to exactly one
  // supplier, so it can never discount another supplier's items in a multi-supplier cart.
  async validateDiscountCode(code: string, supplierId: number, subtotal: number): Promise<import("@shared/schema").DiscountCodeValidationResult> {
    const trimmed = code.trim();
    if (!trimmed) return { valid: false, message: "Veuillez entrer un code." };
    const found = await this.getDiscountCodeByCode(trimmed);
    // A removed code is treated exactly like a nonexistent one — never
    // redeemable, and never reveals to the Coffee Owner that it once existed.
    if (!found || found.isRemoved) return { valid: false, message: "Ce code n'existe pas." };
    if (found.supplierId !== supplierId) {
      return { valid: false, message: "Ce code n'est pas applicable aux articles de ce fournisseur dans votre panier." };
    }
    if (!found.isActive) return { valid: false, message: "Ce code n'est plus actif." };
    if (found.expiresAt && new Date(found.expiresAt) < new Date()) {
      return { valid: false, message: "Ce code a expiré." };
    }
    if (found.maxUses != null && found.usageCount >= found.maxUses) {
      return { valid: false, message: "Ce code a atteint sa limite d'utilisation." };
    }
    if (found.minimumOrderAmount != null && subtotal < found.minimumOrderAmount) {
      return { valid: false, message: "Le montant minimum requis pour ce code n'est pas atteint." };
    }
    const raw = found.discountType === 'PERCENTAGE'
      ? Math.round(subtotal * found.discountValue / 10000)
      : found.discountValue;
    const discountAmount = Math.min(raw, subtotal);
    return { valid: true, discountCodeId: found.id, code: found.code, supplierId: found.supplierId, discountAmount };
  }

  async recordDiscountCodeUsage(discountCodeId: number, cafeId: number, orderId: number, subOrderId: number, discountAmount: number): Promise<void> {
    await db.insert(discountCodeUsage).values({ discountCodeId, cafeId, orderId, subOrderId, discountAmount });
    await db.update(discountCodes)
      .set({ usageCount: sql`${discountCodes.usageCount} + 1` })
      .where(eq(discountCodes.id, discountCodeId));
  }
}
