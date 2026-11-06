import { db } from "../../db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import {
  supplierProductReviews, users, supplierProductListings,
  maintenanceProfiles, marketingProfiles, deliveryCompanyProfiles, deliveries,
  type SupplierProductReview,
} from "@shared/schema";

// Stage 2 — Batch 42: the complete, cross-entity Reviews domain —
// shared review persistence (create/upsert/delete/report/moderate) and
// review statistics, regardless of which entity type is being reviewed
// — consolidated into this one coherent ReviewsStorage class.
//
// This merges, per the task's explicit cross-entity ownership rule
// ("the entity being reviewed does not determine the ownership of the
// review operation"):
//  - The generic/admin-wide cluster (createReview/upsertReview/
//    getReviewsBySupplier/getProductReviewsBySupplier/
//    getSupplierTypeReviews/reportReview/resolveReviewReport/
//    deleteReview/getAllReviews/getExistingProductReview/
//    getExistingSupplierReview/getReviewStatsByProduct) — new
//    extraction from server/storage.ts.
//  - The Delivery Company review cluster (getDeliveryCompanyReviews/
//    getDeliveryCompanyReviewForDelivery/upsertDeliveryCompanyReview/
//    refreshDeliveryCompanyReviewStats) — new extraction from
//    server/storage.ts (Delivery Company has no domain file of its own
//    yet; see server/STORAGE_ARCHITECTURE.md "Batch 41" §11).
//  - The review CRUD + cache-refresh slice of 5 existing provider
//    domain files — Maintenance, Marketing, Print, Barista, Academy —
//    extracted OUT of each (while every other method of those domains
//    — Profile, Taxonomy, Job workflows, Course/Registration
//    management, etc. — stays exactly where it was). This reverses the
//    "one business domain = one storage file" grouping those 5 files
//    previously used for their own review methods (a deliberate,
//    documented decision at the time — see e.g. maintenance.storage.ts's
//    own Batch-29 header) in favor of this batch's explicit instruction
//    that review persistence is cross-entity and belongs in one place
//    regardless of which entity is reviewed.
//  - driver-reviews.storage.ts (Batch 13) and pack-reviews.storage.ts
//    (Batch 11) — both already-standalone, already review-exclusive
//    files — merged in whole.
//
// No facade constructor needed: every internal `this.*` call in this
// class targets another method that moved here together with it
// (e.g. deleteReview -> refreshMaintenanceReviewStats,
// upsertMarketingReview -> refreshMarketingReviewStats). Nothing here
// calls back into DatabaseStorage or any other domain class.
//
// `refreshMaintenanceReviewStats`/`refreshDeliveryCompanyReviewStats`
// write a cached rating/reviewCount aggregate onto maintenanceProfiles/
// deliveryCompanyProfiles — tables otherwise owned by Maintenance's and
// Delivery's own domains — but this write is purely a review-side
// cache refresh (triggered only by a review being created/updated/
// deleted), not a Maintenance/Delivery business operation, so it stays
// with the review-write path that triggers it, consistent with how
// `getProductReviewsBySupplier` already reads `supplierProductListings`
// directly for the same reason (a legitimate, narrowly-scoped
// cross-table access for review purposes, not an absorption of another
// domain's business logic).
//
// `refreshMaintenanceReviewStats` was `public` on MaintenanceStorage
// (made public in Batch 29 specifically so DatabaseStorage's generic
// `deleteReview` could reach it) — now that `deleteReview` moved into
// this same class, nothing outside this file calls it anymore, so it
// is `private` here (confirmed via a full repository-wide grep before
// tightening — zero behavior change, TypeScript visibility has no
// runtime effect).
//
// Each provider's own *display-time* rating computation
// (`computeMarketingReviewStats`/`computePrintReviewStats`/
// `computeBaristaReviewStats`/`computeAcademyReviewStats`, plus
// Maintenance/Supplier/Marketplace's own inline equivalents) is a
// DIFFERENT concern — used only by each provider's own marketplace
// card/admin-overview methods, never by review CRUD — and stays
// resident in its own domain, deliberately NOT moved here (see
// server/STORAGE_ARCHITECTURE.md "Batch 42" §2/§5 for the full
// per-provider dependency trace).
//
// `computeDriverReviewStats` (below) is pre-existing dead code (zero
// callers anywhere in the repository, confirmed in Batch 13's own
// header and re-confirmed this batch) — carried over unchanged, not
// deleted, per the project's standing rule against removing code that
// merely appears unused.

// Driver Reviews & Performance Dashboard (task: "Delivery Company — Driver Reviews &
// Performance Dashboard") — a computed/enriched shape, not a DB table, so it lives here
// next to the one method that produces it rather than in shared/schema.ts.
export interface DeliveryCompanyDriverReview {
  id: number;
  supplierId: number | null;
  supplierName: string;
  supplierImageUrl: string | null;
  driverId: number | null;
  driverName: string | null;
  driverImageUrl: string | null;
  deliveryId: number | null;
  rating: number;
  comment: string | null;
  createdAt: Date | null;
}

// Delivery Company Avis — Coffee-Owner-authored DRIVER reviews of this company's own
// drivers (task: "Fix Delivery Company Avis — Include Coffee Owner Reviews of Its
// Drivers", DELIVERY_COMPANY_DRIVER_REVIEWS_GAP_AUDIT.md §6) — a genuinely different
// reviewer/target pair from DeliveryCompanyDriverReview above (Cafe Owner -> driver, not
// Supplier -> company), kept as its own type so the two populations are never merged.
export interface CompanyDriverPerformanceReview {
  id: number;
  reviewerId: number | null;
  reviewerName: string;
  reviewerImageUrl: string | null;
  driverId: number;
  driverName: string | null;
  driverImageUrl: string | null;
  deliveryId: number | null;
  rating: number;
  comment: string | null;
  createdAt: Date | null;
}

export class ReviewsStorage {
  // ══════════════════════════════════════════════════════════════════════════════════════
  // Generic / admin-wide review operations — new extraction from server/storage.ts.
  // ══════════════════════════════════════════════════════════════════════════════════════

  async createReview(data: {
    supplierId?: number | null;
    reviewType?: string | null;
    cafeId: number;
    productId?: number | null;
    listingId?: number | null;
    rating: number;
    comment?: string | null;
    cafeName: string;
    cafeOwnerName: string;
    productName?: string | null;
  }): Promise<SupplierProductReview> {
    const [row] = await db.insert(supplierProductReviews).values({
      supplierId: data.supplierId ?? null,
      reviewType: data.reviewType ?? 'SUPPLIER',
      cafeId: data.cafeId,
      productId: data.productId ?? null,
      listingId: data.listingId ?? null,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      productName: data.productName ?? null,
    } as any).returning();
    return row;
  }

  async upsertReview(data: {
    supplierId?: number | null;
    reviewType: string;
    cafeId: number;
    productId?: number | null;
    listingId?: number | null;
    rating: number;
    comment?: string | null;
    cafeName: string;
    cafeOwnerName: string;
    productName?: string | null;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    // Find existing review for this cafe/product or cafe/supplier
    let existing: SupplierProductReview | undefined;
    if (data.reviewType === 'PRODUCT' && data.productId) {
      const [row] = await db.select().from(supplierProductReviews)
        .where(and(
          eq(supplierProductReviews.productId, data.productId),
          eq(supplierProductReviews.cafeId, data.cafeId),
          eq(supplierProductReviews.reviewType, 'PRODUCT')
        ));
      existing = row;
    } else if (data.reviewType === 'SUPPLIER' && data.supplierId) {
      const [row] = await db.select().from(supplierProductReviews)
        .where(and(
          eq(supplierProductReviews.supplierId, data.supplierId),
          eq(supplierProductReviews.cafeId, data.cafeId),
          eq(supplierProductReviews.reviewType, 'SUPPLIER')
        ));
      existing = row;
    }

    if (existing) {
      const [updated] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() } as any)
        .where(eq(supplierProductReviews.id, existing.id))
        .returning();
      return { review: updated, isUpdate: true };
    }

    const [row] = await db.insert(supplierProductReviews).values({
      supplierId: data.supplierId ?? null,
      reviewType: data.reviewType,
      cafeId: data.cafeId,
      productId: data.productId ?? null,
      listingId: data.listingId ?? null,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      productName: data.productName ?? null,
    } as any).returning();
    return { review: row, isUpdate: false };
  }

  async getReviewsBySupplier(supplierId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(eq(supplierProductReviews.supplierId, supplierId))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getProductReviewsBySupplier(supplierId: number): Promise<SupplierProductReview[]> {
    // Product reviews for products this supplier has a listing for
    const listings = await db.select({ productId: supplierProductListings.productId })
      .from(supplierProductListings)
      .where(eq(supplierProductListings.supplierId, supplierId));
    const productIds = listings.map((l) => l.productId);
    if (!productIds.length) return [];
    return db.select().from(supplierProductReviews)
      .where(and(
        inArray(supplierProductReviews.productId, productIds),
        eq(supplierProductReviews.reviewType, 'PRODUCT')
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getSupplierTypeReviews(supplierId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.supplierId, supplierId),
        eq(supplierProductReviews.reviewType, 'SUPPLIER')
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async reportReview(reviewId: number, reason: string): Promise<void> {
    await db.update(supplierProductReviews)
      .set({ reportedAt: new Date(), reportReason: reason } as any)
      .where(eq(supplierProductReviews.id, reviewId));
  }

  async resolveReviewReport(reviewId: number): Promise<void> {
    await db.update(supplierProductReviews)
      .set({ resolvedAt: new Date() } as any)
      .where(eq(supplierProductReviews.id, reviewId));
  }

  async deleteReview(reviewId: number): Promise<void> {
    const [review] = await db.select({
      maintenanceUserId: supplierProductReviews.maintenanceUserId,
      reviewType: supplierProductReviews.reviewType,
    }).from(supplierProductReviews).where(eq(supplierProductReviews.id, reviewId));
    await db.delete(supplierProductReviews).where(eq(supplierProductReviews.id, reviewId));
    if (review?.reviewType === "MAINTENANCE" && review.maintenanceUserId) {
      await this.refreshMaintenanceReviewStats(review.maintenanceUserId);
    }
  }

  async getAllReviews(filters?: { reviewType?: string; reported?: boolean }): Promise<SupplierProductReview[]> {
    const conditions: any[] = [];
    if (filters?.reviewType) conditions.push(eq(supplierProductReviews.reviewType, filters.reviewType));
    if (filters?.reported) conditions.push(sql`${supplierProductReviews.reportedAt} IS NOT NULL`);
    const rows = await db.select().from(supplierProductReviews)
      .where(conditions.length ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined)
      .orderBy(desc(supplierProductReviews.createdAt));

    // Resolve the reviewed entity's real name for every review type that targets a user
    // account (Maintenance/Barista/Academy/Print/Driver) — same user-backed source of
    // truth each domain's own Admin overview already reads, attached generically here
    // instead of one bespoke branch per type. Product/Pack/Supplier reviews already carry
    // enough denormalized fields (productName, cafeName) and need no resolution.
    const targetIds = Array.from(new Set(rows.flatMap((review) => [
      review.reviewType === "MAINTENANCE" ? review.maintenanceUserId : null,
      review.reviewType === "BARISTA_MARKETPLACE" ? review.baristaMarketplaceUserId : null,
      review.reviewType === "ACADEMY" ? review.academyUserId : null,
      review.reviewType === "PRINT" ? review.printerId : null,
      review.reviewType === "DRIVER" ? review.driverId : null,
      review.cafeId,
    ]).filter((id): id is number => typeof id === "number")));
    if (targetIds.length === 0) return rows;
    const relatedUsers = await db.select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, targetIds));
    const names = new Map(relatedUsers.map((user) => [user.id, user.name]));
    const targetIdFor = (review: SupplierProductReview): number | null => {
      switch (review.reviewType) {
        case "MAINTENANCE": return review.maintenanceUserId;
        case "BARISTA_MARKETPLACE": return review.baristaMarketplaceUserId;
        case "ACADEMY": return review.academyUserId;
        case "PRINT": return review.printerId;
        case "DRIVER": return review.driverId;
        default: return null;
      }
    };
    return rows.map((review) => {
      const targetId = targetIdFor(review);
      return {
        ...review,
        // maintenanceName kept for backward compatibility with the existing Maintenance tab.
        maintenanceName: review.reviewType === "MAINTENANCE" ? (names.get(review.maintenanceUserId ?? 0) ?? review.cafeName) : undefined,
        targetName: targetId != null ? (names.get(targetId) ?? review.cafeName) : undefined,
        reviewerName: names.get(review.cafeId) ?? review.cafeName,
      } as any;
    });
  }

  async getExistingProductReview(productId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [row] = await db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.productId, productId),
        eq(supplierProductReviews.cafeId, cafeId),
        eq(supplierProductReviews.reviewType, 'PRODUCT')
      ));
    return row;
  }

  async getExistingSupplierReview(supplierId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [row] = await db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.supplierId, supplierId),
        eq(supplierProductReviews.cafeId, cafeId),
        eq(supplierProductReviews.reviewType, 'SUPPLIER')
      ));
    return row;
  }

  async getReviewStatsByProduct(productId: number): Promise<{
    product: { avgRating: number; total: number };
    overall: { avgRating: number; total: number };
    bySupplier: Record<number, { avgRating: number; total: number }>;
  }> {
    const rows = await db.select().from(supplierProductReviews)
      .where(eq(supplierProductReviews.productId, productId));
    if (!rows.length) return { product: { avgRating: 0, total: 0 }, overall: { avgRating: 0, total: 0 }, bySupplier: {} };

    const productReviews = rows.filter(r => (r as any).reviewType === 'PRODUCT' || !r.supplierId);
    const supplierReviews = rows.filter(r => (r as any).reviewType !== 'PRODUCT' && !!r.supplierId);

    const productTotal = productReviews.length;
    const productAvg = productTotal ? productReviews.reduce((s, r) => s + r.rating, 0) / productTotal : 0;

    const bySupplier: Record<number, { sum: number; count: number }> = {};
    for (const r of supplierReviews) {
      if (!r.supplierId) continue;
      if (!bySupplier[r.supplierId]) bySupplier[r.supplierId] = { sum: 0, count: 0 };
      bySupplier[r.supplierId].sum += r.rating;
      bySupplier[r.supplierId].count += 1;
    }

    const total = rows.length;
    const avgRating = total ? rows.reduce((s, r) => s + r.rating, 0) / total : 0;
    return {
      product: { avgRating: productAvg, total: productTotal },
      overall: { avgRating, total },
      bySupplier: Object.fromEntries(
        Object.entries(bySupplier).map(([sid, { sum, count }]) => [
          sid, { avgRating: sum / count, total: count }
        ])
      ) as Record<number, { avgRating: number; total: number }>,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Delivery Company reviews — new extraction from server/storage.ts (Delivery Company has
  // no domain file of its own yet; see server/STORAGE_ARCHITECTURE.md "Batch 41" §11).
  // ══════════════════════════════════════════════════════════════════════════════════════

  async getDeliveryCompanyReviews(deliveryCompanyUserId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.deliveryCompanyUserId as any, deliveryCompanyUserId),
        eq(supplierProductReviews.reviewType, "DELIVERY_COMPANY"),
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  /**
   * Driver Reviews & Performance Dashboard (task: "Delivery Company — Driver Reviews &
   * Performance Dashboard", DELIVERY_DRIVER_REVIEWS_AUDIT.md §9) — the exact same
   * DELIVERY_COMPANY-type, Supplier-authored reviews getDeliveryCompanyReviews already
   * returns, enriched with the driver who performed each review's underlying delivery.
   * driverId/deliveryCompanyId on `deliveries` are frozen once a delivery leaves ASSIGNED
   * (reassignDriver refuses once "already been collected") and a review can only exist for
   * a DELIVERED delivery — so reading them off the delivery row is historically accurate
   * regardless of a driver's CURRENT company membership (see audit §5). Never includes
   * reviewType='DRIVER' rows (a different reviewer — the Cafe Owner, not the Supplier).
   *
   * Two extra batched lookups total (deliveries, users), never one per review — no N+1.
   */
  async getDeliveryCompanyDriverReviews(deliveryCompanyUserId: number): Promise<DeliveryCompanyDriverReview[]> {
    const reviews = await this.getDeliveryCompanyReviews(deliveryCompanyUserId);
    if (reviews.length === 0) return [];

    const deliveryIds = Array.from(new Set(reviews.map((r) => r.deliveryId).filter((id): id is number => id != null)));
    const deliveryRows = deliveryIds.length
      ? await db.select({ id: deliveries.id, driverId: deliveries.driverId, deliveryCompanyId: deliveries.deliveryCompanyId })
          .from(deliveries).where(inArray(deliveries.id, deliveryIds))
      : [];
    const deliveryById = new Map(deliveryRows.map((d) => [d.id, d]));

    // Safety check (belt-and-suspenders on top of the deliveryCompanyUserId filter already
    // applied above, which is the real, write-time-enforced isolation boundary — see
    // POST /api/delivery-company/reviews's own delivery.deliveryCompanyId === body check):
    // only attach driver attribution when the delivery's own company snapshot still agrees.
    const driverIdByReviewId = new Map<number, number>();
    for (const r of reviews) {
      if (r.deliveryId == null) continue;
      const delivery = deliveryById.get(r.deliveryId);
      if (delivery?.driverId != null && delivery.deliveryCompanyId === deliveryCompanyUserId) {
        driverIdByReviewId.set(r.id, delivery.driverId);
      }
    }

    const userIds = Array.from(new Set([
      ...Array.from(driverIdByReviewId.values()),
      ...reviews.map((r) => r.cafeId).filter((id): id is number => id != null),
    ]));
    const userRows = userIds.length
      ? await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl }).from(users).where(inArray(users.id, userIds))
      : [];
    const userById = new Map(userRows.map((u) => [u.id, u]));

    return reviews.map((r) => {
      const driverId = driverIdByReviewId.get(r.id) ?? null;
      const driver = driverId != null ? userById.get(driverId) : undefined;
      const supplier = r.cafeId != null ? userById.get(r.cafeId) : undefined;
      return {
        id: r.id,
        supplierId: r.cafeId ?? null,
        supplierName: r.cafeName || "Fournisseur",
        supplierImageUrl: supplier?.profileImageUrl ?? null,
        driverId,
        driverName: driver?.name ?? null,
        driverImageUrl: driver?.profileImageUrl ?? null,
        deliveryId: r.deliveryId ?? null,
        rating: r.rating,
        comment: r.comment ?? null,
        createdAt: r.createdAt,
      };
    });
  }

  /**
   * Delivery Company Avis — Coffee-Owner-authored reviews of this company's own drivers
   * (task: "Fix Delivery Company Avis — Include Coffee Owner Reviews of Its Drivers",
   * DELIVERY_COMPANY_DRIVER_REVIEWS_GAP_AUDIT.md §6). A deliberately different population
   * from getDeliveryCompanyDriverReviews above (reviewType='DRIVER', reviewer=Cafe Owner —
   * never merged with the DELIVERY_COMPANY/Supplier population).
   *
   * Scoped by this company's own `deliveries` rows first (WHERE deliveryCompanyId = :id),
   * not by `users.deliveryCompanyId` (a driver's CURRENT membership) and not by scanning the
   * platform-wide DRIVER review population — deliveries.deliveryCompanyId is frozen once a
   * delivery leaves ASSIGNED (see reassignDriver), so this is the historically-correct
   * ownership boundary regardless of a driver's membership today. Three queries total
   * (deliveries, reviews, users), independent of review count — no N+1.
   */
  async getDriverReviewsForDeliveryCompany(deliveryCompanyUserId: number): Promise<CompanyDriverPerformanceReview[]> {
    const companyDeliveries = await db.select({ id: deliveries.id, driverId: deliveries.driverId })
      .from(deliveries).where(eq(deliveries.deliveryCompanyId, deliveryCompanyUserId));
    if (companyDeliveries.length === 0) return [];

    const driverIdByDeliveryId = new Map(companyDeliveries.map((d) => [d.id, d.driverId]));
    const reviews = await db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.reviewType, "DRIVER"),
        inArray(supplierProductReviews.deliveryId as any, companyDeliveries.map((d) => d.id)),
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
    if (reviews.length === 0) return [];

    // The delivery row (not the review row) is the trusted source for which driver performed
    // it — re-derived here the same way getDeliveryCompanyDriverReviews re-derives it, even
    // though review.driverId is already write-time validated to agree (never trust a value
    // merely because it usually agrees).
    const userIds = Array.from(new Set([
      ...reviews.map((r) => r.deliveryId != null ? driverIdByDeliveryId.get(r.deliveryId) : null).filter((id): id is number => id != null),
      ...reviews.map((r) => r.cafeId).filter((id): id is number => id != null),
    ]));
    const userRows = userIds.length
      ? await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl }).from(users).where(inArray(users.id, userIds))
      : [];
    const userById = new Map(userRows.map((u) => [u.id, u]));

    const result: CompanyDriverPerformanceReview[] = [];
    for (const r of reviews) {
      const driverId = r.deliveryId != null ? driverIdByDeliveryId.get(r.deliveryId) : undefined;
      if (driverId == null) continue; // delivery row vanished or had no driver — cannot attribute, skip rather than fabricate
      const driver = userById.get(driverId);
      const reviewer = r.cafeId != null ? userById.get(r.cafeId) : undefined;
      result.push({
        id: r.id,
        reviewerId: r.cafeId ?? null,
        reviewerName: r.cafeName || "Café",
        reviewerImageUrl: reviewer?.profileImageUrl ?? null,
        driverId,
        driverName: driver?.name ?? null,
        driverImageUrl: driver?.profileImageUrl ?? null,
        deliveryId: r.deliveryId ?? null,
        rating: r.rating,
        comment: r.comment ?? null,
        createdAt: r.createdAt,
      });
    }
    return result;
  }

  async getDeliveryCompanyReviewForDelivery(deliveryId: number, supplierId: number): Promise<SupplierProductReview | undefined> {
    const [review] = await db.select().from(supplierProductReviews).where(and(
      eq(supplierProductReviews.deliveryId as any, deliveryId),
      eq(supplierProductReviews.cafeId, supplierId),
      eq(supplierProductReviews.reviewType, "DELIVERY_COMPANY"),
    ));
    return review;
  }

  async upsertDeliveryCompanyReview(data: {
    deliveryCompanyUserId: number;
    deliveryId: number;
    supplierId: number;
    rating: number;
    comment?: string | null;
    supplierName: string;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    const existing = await this.getDeliveryCompanyReviewForDelivery(data.deliveryId, data.supplierId);
    if (existing) {
      const [review] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() } as any)
        .where(eq(supplierProductReviews.id, existing.id))
        .returning();
      await this.refreshDeliveryCompanyReviewStats(data.deliveryCompanyUserId);
      return { review, isUpdate: true };
    }
    const [review] = await db.insert(supplierProductReviews).values({
      reviewType: "DELIVERY_COMPANY",
      deliveryCompanyUserId: data.deliveryCompanyUserId,
      deliveryId: data.deliveryId,
      cafeId: data.supplierId,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.supplierName,
      cafeOwnerName: data.supplierName,
      supplierId: null,
      productId: null,
      listingId: null,
      packId: null,
      productName: null,
    } as any).returning();
    await this.refreshDeliveryCompanyReviewStats(data.deliveryCompanyUserId);
    return { review, isUpdate: false };
  }

  private async refreshDeliveryCompanyReviewStats(deliveryCompanyUserId: number): Promise<void> {
    const reviews = await this.getDeliveryCompanyReviews(deliveryCompanyUserId);
    const reviewCount = reviews.length;
    const rating = reviewCount
      ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount) * 10)
      : 0;
    await db.update(deliveryCompanyProfiles)
      .set({ rating, reviewCount, updatedAt: new Date() })
      .where(eq(deliveryCompanyProfiles.userId, deliveryCompanyUserId));
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Maintenance reviews — consolidated out of maintenance.storage.ts (Batch 29). Every other
  // Maintenance method (Profile, Taxonomy, Job workflows, etc.) stays in MaintenanceStorage.
  // ══════════════════════════════════════════════════════════════════════════════════════

  async getMaintenanceReviews(maintenanceUserId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.maintenanceUserId as any, maintenanceUserId),
        eq(supplierProductReviews.reviewType, "MAINTENANCE"),
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async deleteMaintenanceReview(reviewId: number): Promise<boolean> {
    const [review] = await db.select({
      id: supplierProductReviews.id,
      maintenanceUserId: supplierProductReviews.maintenanceUserId,
    }).from(supplierProductReviews).where(and(
      eq(supplierProductReviews.id, reviewId),
      eq(supplierProductReviews.reviewType, "MAINTENANCE"),
    ));
    if (!review) return false;
    await db.delete(supplierProductReviews).where(eq(supplierProductReviews.id, reviewId));
    if (review.maintenanceUserId) await this.refreshMaintenanceReviewStats(review.maintenanceUserId);
    return true;
  }

  async getMaintenanceReviewForReservation(reservationId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [review] = await db.select().from(supplierProductReviews).where(and(
      eq(supplierProductReviews.reservationId as any, reservationId),
      eq(supplierProductReviews.cafeId, cafeId),
      eq(supplierProductReviews.reviewType, "MAINTENANCE"),
    ));
    return review;
  }

  async upsertMaintenanceReview(data: {
    maintenanceUserId: number;
    reservationId: number;
    cafeId: number;
    rating: number;
    comment?: string | null;
    cafeName: string;
    cafeOwnerName: string;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    const existing = await this.getMaintenanceReviewForReservation(data.reservationId, data.cafeId);
    if (existing) {
      const [review] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() } as any)
        .where(eq(supplierProductReviews.id, existing.id))
        .returning();
      await this.refreshMaintenanceReviewStats(data.maintenanceUserId);
      return { review, isUpdate: true };
    }
    const [review] = await db.insert(supplierProductReviews).values({
      reviewType: "MAINTENANCE",
      maintenanceUserId: data.maintenanceUserId,
      reservationId: data.reservationId,
      cafeId: data.cafeId,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      supplierId: null,
      productId: null,
      listingId: null,
      packId: null,
      productName: null,
    } as any).returning();
    await this.refreshMaintenanceReviewStats(data.maintenanceUserId);
    return { review, isUpdate: false };
  }

  // Was `public` on MaintenanceStorage (made public in Batch 29 so DatabaseStorage's generic
  // `deleteReview` could reach it); now that `deleteReview` lives in this same class, this is
  // `private` again — zero behavior change, see file header.
  private async refreshMaintenanceReviewStats(maintenanceUserId: number): Promise<void> {
    const reviews = await this.getMaintenanceReviews(maintenanceUserId);
    const reviewCount = reviews.length;
    const rating = reviewCount
      ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount) * 10)
      : 0;
    await db.update(maintenanceProfiles)
      .set({ rating, reviewCount, updatedAt: new Date() })
      .where(eq(maintenanceProfiles.userId, maintenanceUserId));
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Marketing reviews — consolidated out of marketing.storage.ts. Every other Marketing
  // method (Profile, Projects, Category mapping, etc.) stays in MarketingStorage.
  // ══════════════════════════════════════════════════════════════════════════════════════

  async getMarketingReviews(marketingUserId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.marketingUserId as any, marketingUserId), eq(supplierProductReviews.reviewType, "MARKETING")))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getMarketingReviewForProject(projectId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [row] = await db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.marketingProjectId as any, projectId),
        eq(supplierProductReviews.cafeId, cafeId),
        eq(supplierProductReviews.reviewType, "MARKETING"),
      ));
    return row;
  }

  async upsertMarketingReview(data: {
    marketingUserId: number; projectId: number; cafeId: number; rating: number; comment?: string | null;
    cafeName: string; cafeOwnerName: string;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    const existing = await this.getMarketingReviewForProject(data.projectId, data.cafeId);
    if (existing) {
      const [review] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() } as any)
        .where(eq(supplierProductReviews.id, existing.id))
        .returning();
      await this.refreshMarketingReviewStats(data.marketingUserId);
      return { review, isUpdate: true };
    }
    const [review] = await db.insert(supplierProductReviews).values({
      reviewType: "MARKETING",
      marketingUserId: data.marketingUserId,
      marketingProjectId: data.projectId,
      cafeId: data.cafeId,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      supplierId: null, productId: null, listingId: null, packId: null, productName: null,
    } as any).returning();
    await this.refreshMarketingReviewStats(data.marketingUserId);
    return { review, isUpdate: false };
  }

  async deleteMarketingReview(reviewId: number): Promise<boolean> {
    const [review] = await db.select({ id: supplierProductReviews.id, marketingUserId: supplierProductReviews.marketingUserId })
      .from(supplierProductReviews).where(and(eq(supplierProductReviews.id, reviewId), eq(supplierProductReviews.reviewType, "MARKETING")));
    if (!review) return false;
    await db.delete(supplierProductReviews).where(eq(supplierProductReviews.id, reviewId));
    if (review.marketingUserId) await this.refreshMarketingReviewStats(review.marketingUserId);
    return true;
  }

  private async refreshMarketingReviewStats(marketingUserId: number): Promise<void> {
    const reviews = await this.getMarketingReviews(marketingUserId);
    const reviewCount = reviews.length;
    const rating = reviewCount ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount) * 10) : 0;
    await db.update(marketingProfiles).set({ rating, reviewCount, updatedAt: new Date() }).where(eq(marketingProfiles.userId, marketingUserId));
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Print reviews — consolidated out of print.storage.ts. No denormalized rating column to
  // refresh here: PRINT has no per-printer profile row (unlike maintenanceProfiles) —
  // getPrintMarketplaceCards/getPrintAdminOverview (still in PrintStorage) already compute
  // rating/reviewCount live from this same table on every read via computePrintReviewStats
  // (not moved — a display-time concern, not review CRUD; see file header).
  // ══════════════════════════════════════════════════════════════════════════════════════

  async getPrintReviews(printerId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.reviewType, "PRINT"), eq(supplierProductReviews.printerId as any, printerId)))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getPrintReviewForOrder(orderId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [row] = await db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.reviewType, "PRINT"),
        eq(supplierProductReviews.printOrderId as any, orderId),
        eq(supplierProductReviews.cafeId, cafeId),
      ));
    return row;
  }

  /** Upsert keyed on (printOrderId, cafeId) — mirrors upsertMaintenanceReview
   *  exactly (re-submitting for the same order updates rather than
   *  duplicates). No denormalized rating column to refresh here: PRINT has no
   *  per-printer profile row (unlike maintenanceProfiles) — getPrintMarketplaceCards/
   *  getPrintAdminOverview already compute rating/reviewCount live from this
   *  same table on every read via computePrintReviewStats, so there is nothing
   *  to keep in sync — the live computation IS the source of truth. */
  async upsertPrintReview(data: { printerId: number; printOrderId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    const existing = await this.getPrintReviewForOrder(data.printOrderId, data.cafeId);
    if (existing) {
      const [updated] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() })
        .where(eq(supplierProductReviews.id, existing.id)).returning();
      return { review: updated, isUpdate: true };
    }
    const [created] = await db.insert(supplierProductReviews).values({
      reviewType: "PRINT",
      cafeId: data.cafeId,
      printerId: data.printerId,
      printOrderId: data.printOrderId,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeName,
    } as any).returning();
    return { review: created, isUpdate: false };
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Barista reviews — consolidated out of barista.storage.ts (reuses supplierProductReviews,
  // reviewType='BARISTA_MARKETPLACE'). No cache to refresh — same live-computation model as
  // Print (computeBaristaReviewStats, not moved — a display-time concern, not review CRUD).
  // ══════════════════════════════════════════════════════════════════════════════════════

  async getBaristaReviews(baristaUserId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.baristaMarketplaceUserId as any, baristaUserId),
        eq(supplierProductReviews.reviewType, "BARISTA_MARKETPLACE"),
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getBaristaReviewForMission(missionId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [review] = await db.select().from(supplierProductReviews).where(and(
      eq(supplierProductReviews.baristaMissionId as any, missionId),
      eq(supplierProductReviews.cafeId, cafeId),
      eq(supplierProductReviews.reviewType, "BARISTA_MARKETPLACE"),
    ));
    return review;
  }

  async upsertBaristaReview(data: {
    baristaUserId: number; missionId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string; cafeOwnerName: string;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    const existing = await this.getBaristaReviewForMission(data.missionId, data.cafeId);
    if (existing) {
      const [review] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() } as any)
        .where(eq(supplierProductReviews.id, existing.id))
        .returning();
      return { review, isUpdate: true };
    }
    const [review] = await db.insert(supplierProductReviews).values({
      reviewType: "BARISTA_MARKETPLACE",
      baristaMarketplaceUserId: data.baristaUserId,
      baristaMissionId: data.missionId,
      cafeId: data.cafeId,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      supplierId: null, productId: null, listingId: null, packId: null, productName: null,
    } as any).returning();
    return { review, isUpdate: false };
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Academy reviews — consolidated out of academy.storage.ts (reuses supplierProductReviews,
  // reviewType='ACADEMY'). No cache to refresh — same live-computation model as Print/Barista
  // (computeAcademyReviewStats, not moved — a display-time concern, not review CRUD).
  // ══════════════════════════════════════════════════════════════════════════════════════

  async getAcademyReviews(academyUserId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.academyUserId as any, academyUserId),
        eq(supplierProductReviews.reviewType, "ACADEMY"),
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getAcademyReviewForRegistration(registrationId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [review] = await db.select().from(supplierProductReviews).where(and(
      eq(supplierProductReviews.academyRegistrationId as any, registrationId),
      eq(supplierProductReviews.cafeId, cafeId),
      eq(supplierProductReviews.reviewType, "ACADEMY"),
    ));
    return review;
  }

  async upsertAcademyReview(data: { academyUserId: number; registrationId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string; cafeOwnerName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    const existing = await this.getAcademyReviewForRegistration(data.registrationId, data.cafeId);
    if (existing) {
      const [review] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() } as any)
        .where(eq(supplierProductReviews.id, existing.id))
        .returning();
      return { review, isUpdate: true };
    }
    const [review] = await db.insert(supplierProductReviews).values({
      reviewType: "ACADEMY",
      academyUserId: data.academyUserId,
      academyRegistrationId: data.registrationId,
      cafeId: data.cafeId,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      supplierId: null, productId: null, listingId: null, packId: null, productName: null,
    } as any).returning();
    return { review, isUpdate: false };
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Driver reviews — consolidated whole from driver-reviews.storage.ts (Batch 13).
  // ══════════════════════════════════════════════════════════════════════════════════════

  async getDriverReviews(driverId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.driverId as any, driverId), eq(supplierProductReviews.reviewType, 'DRIVER')))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getDriverReviewForDelivery(deliveryId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [review] = await db.select().from(supplierProductReviews).where(and(
      eq(supplierProductReviews.deliveryId as any, deliveryId),
      eq(supplierProductReviews.cafeId, cafeId),
      eq(supplierProductReviews.reviewType, 'DRIVER'),
    ));
    return review;
  }

  // Pre-existing dead code — zero callers anywhere in the repository (confirmed in Batch 13's
  // own header and re-confirmed this batch). Carried over unchanged, not deleted, per the
  // project's standing rule against removing code that merely appears unused.
  private async computeDriverReviewStats(driverIds: number[]): Promise<Map<number, { rating: number; reviewCount: number }>> {
    if (!driverIds.length) return new Map();
    const rows = await db.select({ driverId: supplierProductReviews.driverId, rating: supplierProductReviews.rating })
      .from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.reviewType, 'DRIVER'), inArray(supplierProductReviews.driverId as any, driverIds)));
    const sums = new Map<number, { total: number; sum: number }>();
    for (const row of rows) {
      if (!row.driverId) continue;
      const cur = sums.get(row.driverId) ?? { total: 0, sum: 0 };
      cur.total += 1; cur.sum += row.rating;
      sums.set(row.driverId, cur);
    }
    const result = new Map<number, { rating: number; reviewCount: number }>();
    for (const [id, s] of Array.from(sums.entries())) result.set(id, { rating: Math.round((s.sum / s.total) * 10), reviewCount: s.total });
    return result;
  }

  async upsertDriverReview(data: { driverId: number; deliveryId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string; cafeOwnerName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    const existing = await this.getDriverReviewForDelivery(data.deliveryId, data.cafeId);
    if (existing) {
      const [review] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() } as any)
        .where(eq(supplierProductReviews.id, existing.id))
        .returning();
      return { review, isUpdate: true };
    }
    const [review] = await db.insert(supplierProductReviews).values({
      reviewType: 'DRIVER',
      driverId: data.driverId,
      deliveryId: data.deliveryId,
      cafeId: data.cafeId,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      supplierId: null, productId: null, listingId: null, packId: null, productName: null,
    } as any).returning();
    return { review, isUpdate: false };
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Pack reviews — consolidated whole from pack-reviews.storage.ts (Batch 11).
  // ══════════════════════════════════════════════════════════════════════════════════════

  async getPackReviews(packId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.packId as any, packId), eq(supplierProductReviews.reviewType, 'PACK')))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async createPackReview(data: {
    packId: number;
    supplierId: number;
    cafeId: number;
    rating: number;
    comment?: string | null;
    cafeName: string;
    cafeOwnerName: string;
  }): Promise<SupplierProductReview> {
    const [row] = await db.insert(supplierProductReviews).values({
      supplierId: data.supplierId,
      reviewType: 'PACK',
      cafeId: data.cafeId,
      packId: data.packId,
      productId: null,
      listingId: null,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      productName: null,
    } as any).returning();
    return row;
  }
}
