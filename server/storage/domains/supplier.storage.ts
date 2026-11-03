import { db } from "../../db";
import { eq, and, inArray, desc, sql, asc, ne, notInArray } from "drizzle-orm";
import {
  storeFavorites, supplierReports, users, supplierStores, type SupplierReport,
  supplierProductListings, products, supplierProductVariants, supplierProductReviews,
  type SupplierStore, type InsertSupplierStore, type StoreCard, type StoreAdminRow, type StoreDetail,
  type ProductWithTaxonomy,
  categories, subCategories, supplierCategories, supplierSubCategories,
  inventoryAdjustments, packItems, packs,
  type AdminSupplierCategoryOverview, type InsertProduct, type InsertSupplierProductListing,
  type SupplierCategoryMapping, type SupplierListingWithProduct,
} from "@shared/schema";
import { buildTaxonomyCache, enrichProduct, computeListingOffer } from "../../storage";
import type { DatabaseStorage } from "../../storage";

// Stage 2 — Batch 21 business-domain consolidation (original seed). Merged
// Store Favorites (Batch 4) and Supplier Entity-level reports (Batch 18) —
// the two existing storage files whose methods are both exclusively
// consumed by server/routes/supplier.routes.ts (verified via a
// whole-repository consumer search). Both represent how a Cafe Owner
// relates to a Supplier account from the demand side — favoriting a
// supplier's store, and reporting/blacklisting a supplier.
//
// Batch 21's own header explicitly predicted this file's growth: "the
// seed for what will likely become a full Supplier business-domain
// storage file as more Supplier-area methods (product listings,
// inventory, packs, stores — still in server/storage.ts) are extracted
// from the monolith in future batches." Batch 38 fulfills that prediction
// for Stores + the genuinely Supplier-owned slice of product
// listings/workflow — Inventory and Packs/Catalog were investigated and
// confirmed to remain their own independent domains (see below).
//
// === Batch 38 — Supplier Stores consolidation ===
// `server/storage/domains/supplier-stores.storage.ts` (Batch 27) was
// confirmed, by reading its entire implementation, to be a fragmented
// part of this exact same Supplier business domain — store profile
// creation/update, admin approval/auto-approve/display-order, store
// deletion, and the public/admin store-card derivations — not an
// independent domain. Its 10 public methods + 1 private helper
// (`buildStoreCards`) were moved here verbatim and the old file deleted
// after confirming zero remaining references anywhere in the repository.
// Its one cross-domain dependency (`getStoreDetail` → promotions lookup)
// is preserved unchanged via the same `facade: DatabaseStorage`
// constructor parameter this file now also needs for its own new
// dependency (see below) — both reached through
// `this.facade.<method>(...)`.
//
// === Batch 38 — New extraction from server/storage.ts ===
// 23 public methods, 0 private helpers, 1 transaction
// (`createSupplierListingWithVariants`), spanning 4 physically separate
// locations in the monolith:
//   - `// ── Supplier mappings ──` — which Product Categories/
//     SubCategories a Supplier has mapped/is approved to sell under
//     (`getSupplierCategoryMappings`, `getAdminSupplierCategoryOverview`,
//     `addSupplierCategories`, `reorderSupplierCategories`,
//     `removeSupplierCategory`, `setSupplierCategoryFrozen`,
//     `approveSupplierCategoryMapping`, `setSupplierCategories`,
//     `setSupplierSubCategories`, `isProductAllowedForSupplier`) — a
//     Supplier verification/approval workflow, not generic Product
//     catalog ownership (Products domain, already extracted, owns the
//     Categories/SubCategories themselves; this owns which ones THIS
//     Supplier may use).
//   - `// ── Supplier product listings ──` — a Supplier's own storefront
//     listings (`getSupplierListings`, `createSupplierListing`,
//     `createSupplierListingWithVariants`, `updateSupplierListing`,
//     `deleteSupplierListing`, `removeSupplierListingFromPacks`).
//   - The tail of the (unrelated) Packs section —
//     `getSupplierListingByProductId`, physically misplaced there;
//     moved here with its real business-domain siblings (see its own
//     inline comment).
//   - `// ── Supplier product workflow ──` — a Supplier creating/managing
//     their OWN custom products pending admin approval
//     (`getSupplierCreatedProducts`, `createSupplierProduct`,
//     `updateSupplierProduct`, `deleteSupplierProduct`,
//     `getAdminSupplierProducts`, `approveSupplierProduct`).
//
// Deliberately EXCLUDED, confirmed genuinely independent domains per the
// task's explicit boundaries, NOT absorbed just because a Supplier is
// involved in the workflow:
//   - `// ── Supplier variants ──` (`getVariantsByListingId`,
//     `saveVariants`) and the entire `// ── Inventory ──` section —
//     stock/quantity operations on a Supplier's own listings, but
//     "Inventory and stock operations" is its own independent domain by
//     function, not Supplier account/business management. One new
//     facade dependency was needed here regardless:
//     `createSupplierListingWithVariants` → `this.facade.saveVariants(...)`,
//     propagating a live transaction client across the facade boundary
//     (verified safe per the Batch 26/37 precedent — the call happens
//     strictly inside this method's own `db.transaction(...)` block).
//   - The entire `// ── Packs ──` section (Pack CRUD, marketplace pack
//     discovery, admin packs, pack favorites) — its own Packs/Catalog
//     domain; several of its methods are Marketplace-facing
//     (`getMarketplacePacks`, `getAdminPacks`), not Supplier-account
//     management, confirmed by reading the section in full.
//
// One pre-existing, unrelated finding (not caused by this batch, not
// fixed by it): `updateSupplierListing` is declared in `IStorage` but
// has zero external callers anywhere in the repository (routes or other
// domain files) — preserved exactly regardless, since "no caller found
// via grep" is not proof of no caller.
export class SupplierStorage {
  constructor(private facade: DatabaseStorage) {}

  // ── Store Favorites ──────────────────────────────────────────────────────
  async getStoreFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select().from(storeFavorites).where(eq(storeFavorites.userId, userId));
    return rows.map((r) => r.storeId);
  }

  async addStoreFavorite(userId: number, storeId: number): Promise<void> {
    const existing = await db.select().from(storeFavorites)
      .where(and(eq(storeFavorites.userId, userId), eq(storeFavorites.storeId, storeId)));
    if (existing.length) return;
    await db.insert(storeFavorites).values({ userId, storeId });
  }

  async removeStoreFavorite(userId: number, storeId: number): Promise<void> {
    await db.delete(storeFavorites).where(and(eq(storeFavorites.userId, userId), eq(storeFavorites.storeId, storeId)));
  }

  // ── Entity-level Supplier reports (Coffee Owner "Blacklist") ─────────────
  async createSupplierReport(cafeOwnerId: number, supplierId: number, reason: string, rating?: number): Promise<SupplierReport> {
    const [created] = await db.insert(supplierReports).values({ cafeOwnerId, supplierId, reason, rating: rating ?? null }).returning();
    return created;
  }

  async getSupplierReportById(id: number): Promise<SupplierReport | undefined> {
    const [row] = await db.select().from(supplierReports).where(eq(supplierReports.id, id));
    return row;
  }

  async getSupplierReports(status?: "PENDING" | "PUBLISHED" | "REJECTED"): Promise<(SupplierReport & { cafeOwnerName: string; supplierName: string })[]> {
    const rows = await db.select().from(supplierReports)
      .where(status ? eq(supplierReports.status, status) : undefined)
      .orderBy(desc(supplierReports.createdAt));
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.supplierId])));
    const userMap = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name]));
    const storeRows = await db.select({ supplierId: supplierStores.supplierId, name: supplierStores.name }).from(supplierStores).where(inArray(supplierStores.supplierId, userIds));
    const storeNameMap = new Map(storeRows.map((s) => [s.supplierId, s.name]));
    return rows.map((r) => ({
      ...r,
      cafeOwnerName: userMap.get(r.cafeOwnerId) ?? "—",
      supplierName: storeNameMap.get(r.supplierId) || userMap.get(r.supplierId) || "—",
    }));
  }

  // Public read — strictly status = PUBLISHED, never cafeOwnerId/name,
  // paginated; joins supplierStores for the store-facing name/logo (never
  // product or pack data).
  async getPublishedSupplierReports(page = 1, limit = 10): Promise<{ reports: (Pick<SupplierReport, "id" | "supplierId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { supplierName: string; supplierProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const where = eq(supplierReports.status, "PUBLISHED");
    const [rows, [{ count }]] = await Promise.all([
      db.select({
        id: supplierReports.id, supplierId: supplierReports.supplierId,
        reason: supplierReports.reason, rating: supplierReports.rating,
        createdAt: supplierReports.createdAt, resolvedAt: supplierReports.resolvedAt,
      }).from(supplierReports).where(where)
        .orderBy(desc(supplierReports.resolvedAt))
        .limit(safeLimit).offset((safePage - 1) * safeLimit),
      db.select({ count: sql<number>`count(*)::int` }).from(supplierReports).where(where),
    ]);
    if (rows.length === 0) return { reports: [], total: count, page: safePage, limit: safeLimit };
    const supplierIds = Array.from(new Set(rows.map((r) => r.supplierId)));
    const [storeRows, userRows] = await Promise.all([
      db.select({ supplierId: supplierStores.supplierId, name: supplierStores.name, logoUrl: supplierStores.logoUrl, coverUrl: supplierStores.coverUrl })
        .from(supplierStores).where(inArray(supplierStores.supplierId, supplierIds)),
      db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, supplierIds)),
    ]);
    const storeMap = new Map(storeRows.map((s) => [s.supplierId, s]));
    const userMap = new Map(userRows.map((u) => [u.id, u.name]));
    const reports = rows.map((r) => {
      const store = storeMap.get(r.supplierId);
      return { ...r, supplierName: store?.name || userMap.get(r.supplierId) || "—", supplierProfileImageUrl: store?.logoUrl ?? store?.coverUrl ?? null };
    });
    return { reports, total: count, page: safePage, limit: safeLimit };
  }

  async resolveSupplierReport(id: number, status: "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<SupplierReport | undefined> {
    const [updated] = await db.update(supplierReports)
      .set({ status, resolvedAt: new Date(), resolutionNote: resolutionNote ?? null, moderatedByAdminId: moderatedByAdminId ?? null })
      .where(eq(supplierReports.id, id))
      .returning();
    return updated;
  }

  // ── Supplier Stores (consolidated from supplier-stores.storage.ts, Batch 38) ──
  async getSupplierStore(supplierId: number): Promise<SupplierStore | undefined> {
    const [store] = await db.select().from(supplierStores).where(eq(supplierStores.supplierId, supplierId));
    return store;
  }

  async upsertSupplierStore(supplierId: number, data: Partial<InsertSupplierStore>): Promise<SupplierStore> {
    const existing = await this.getSupplierStore(supplierId);
    if (!existing) {
      const [created] = await db.insert(supplierStores).values({
        supplierId,
        coverUrl: data.coverUrl ?? null,
        logoUrl: data.logoUrl ?? null,
        name: data.name ?? '',
        description: data.description ?? null,
        isOpen: data.isOpen ?? true,
        visibility: data.visibility ?? 'VISIBLE',
        approvalStatus: 'PENDING',
        mediaType: (data as any).mediaType ?? 'IMAGE',
        coverUrls: (data as any).coverUrls ?? [],
        videoUrl: (data as any).videoUrl ?? null,
        musicUrl: (data as any).musicUrl ?? null,
        openingHours: (data as any).openingHours ?? null,
      }).returning();
      return created;
    }
    const identityChanged = (
      (data.name !== undefined && data.name !== existing.name) ||
      (data.description !== undefined && (data.description ?? null) !== (existing.description ?? null)) ||
      (data.coverUrl !== undefined && (data.coverUrl ?? null) !== (existing.coverUrl ?? null)) ||
      (data.logoUrl !== undefined && (data.logoUrl ?? null) !== (existing.logoUrl ?? null))
    );
    let approvalStatus = existing.approvalStatus;
    const storeHasAutoApprove = (existing as any).autoApprove === true;
    if (identityChanged && !storeHasAutoApprove && (existing.approvalStatus === 'APPROVED' || existing.approvalStatus === 'REJECTED')) {
      approvalStatus = 'PENDING';
    }
    const [updated] = await db.update(supplierStores).set({
      ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.isOpen !== undefined ? { isOpen: data.isOpen } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      ...((data as any).mediaType !== undefined ? { mediaType: (data as any).mediaType } : {}),
      ...((data as any).coverUrls !== undefined ? { coverUrls: (data as any).coverUrls } : {}),
      ...((data as any).videoUrl !== undefined ? { videoUrl: (data as any).videoUrl } : {}),
      ...((data as any).musicUrl !== undefined ? { musicUrl: (data as any).musicUrl } : {}),
      ...((data as any).openingHours !== undefined ? { openingHours: (data as any).openingHours } : {}),
      approvalStatus,
      updatedAt: new Date(),
    }).where(eq(supplierStores.id, existing.id)).returning();
    return updated;
  }

  private async buildStoreCards(stores: SupplierStore[]): Promise<StoreCard[]> {
    if (!stores.length) return [];
    const supplierIds = stores.map((s) => s.supplierId);
    const [allUsers, allListings, allProducts] = await Promise.all([
      db.select().from(users).where(inArray(users.id, supplierIds)),
      db.select().from(supplierProductListings).where(inArray(supplierProductListings.supplierId, supplierIds)),
      db.select().from(products),
    ]);
    // Real offer eligibility (task: "Fix Invalid Supplier Product Mappings
    // and Empty Products") — derived from persisted variants via
    // computeListingOffer, never from l.price/l.stock directly (see that
    // function's comment for why those columns can go stale).
    const listingIds = allListings.map((l) => l.id);
    const allVariants = listingIds.length
      ? await db.select().from(supplierProductVariants).where(inArray(supplierProductVariants.listingId, listingIds))
      : [];
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const v of allVariants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const listingsBySupplier = new Map<number, typeof allListings>();
    for (const l of allListings) {
      if (!listingsBySupplier.has(l.supplierId)) listingsBySupplier.set(l.supplierId, []);
      listingsBySupplier.get(l.supplierId)!.push(l);
    }
    return stores.map((store) => {
      const supplier = userMap.get(store.supplierId);
       const listings = (listingsBySupplier.get(store.supplierId) ?? []).filter(
         (l) => l.visibility === 'VISIBLE' && l.isIndividuallyVisible && !l.onlyForPack
           && computeListingOffer(variantsByListing.get(l.id) ?? []).eligible,
       );
      const categoryIds = new Set<number>();
      const subCategoryIds = new Set<number>();
      const brandIds = new Set<number>();
      for (const l of listings) {
        const prod = productMap.get(l.productId);
        if (!prod) continue;
        if (prod.categoryId) categoryIds.add(prod.categoryId);
        if (prod.subCategoryId) subCategoryIds.add(prod.subCategoryId);
        if (prod.brandId) brandIds.add(prod.brandId);
      }
      return {
        id: store.id,
        supplierId: store.supplierId,
        name: store.name,
        description: store.description,
        coverUrl: store.coverUrl,
        logoUrl: store.logoUrl,
        isOpen: store.isOpen,
        visibility: store.visibility,
        approvalStatus: store.approvalStatus,
        supplierLat: supplier?.locationLat ?? null,
        supplierLng: supplier?.locationLng ?? null,
        categoryIds: Array.from(categoryIds),
        subCategoryIds: Array.from(subCategoryIds),
        brandIds: Array.from(brandIds),
        productCount: listings.length,
        displayOrder: (store as any).displayOrder ?? 0,
        mediaType: ((store as any).mediaType ?? 'IMAGE') as 'IMAGE' | 'VIDEO',
        coverUrls: (store as any).coverUrls ?? [],
        videoUrl: (store as any).videoUrl ?? null,
        musicUrl: (store as any).musicUrl ?? null,
        openingHours: (store as any).openingHours ?? null,
      };
    });
  }

  async getAllStoresAdmin(): Promise<StoreAdminRow[]> {
    const stores = await db.select().from(supplierStores);
    const cards = await this.buildStoreCards(stores);
    const supplierIds = stores.map((s) => s.supplierId);
    const allUsers = await db.select().from(users).where(inArray(users.id, supplierIds));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const storeMap = new Map(stores.map((s) => [s.id, s]));
    return cards.map((card) => {
      const supplier = userMap.get(card.supplierId);
      const store = storeMap.get(card.id)!;
      return {
        ...card,
        supplierName: supplier?.name ?? '',
        supplierEmail: supplier?.email ?? '',
        autoApprove: (store as any).autoApprove ?? false,
        createdAt: store.createdAt,
        updatedAt: store.updatedAt,
      };
    });
  }

  async setStoreApprovalStatus(id: number, status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ON_HOLD'): Promise<SupplierStore | undefined> {
    const [updated] = await db.update(supplierStores).set({ approvalStatus: status, updatedAt: new Date() }).where(eq(supplierStores.id, id)).returning();
    return updated;
  }

  async setStoreAutoApprove(id: number, autoApprove: boolean): Promise<SupplierStore | undefined> {
    const [updated] = await db.update(supplierStores).set({ autoApprove, updatedAt: new Date() } as any).where(eq(supplierStores.id, id)).returning();
    return updated;
  }

  async updateStoreDisplayOrder(id: number, displayOrder: number): Promise<SupplierStore | undefined> {
    const [updated] = await db.update(supplierStores).set({ displayOrder, updatedAt: new Date() }).where(eq(supplierStores.id, id)).returning();
    return updated;
  }

  async bulkUpdateStoreOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(({ id, displayOrder }) =>
      db.update(supplierStores).set({ displayOrder, updatedAt: new Date() }).where(eq(supplierStores.id, id))
    ));
  }

  async deleteStore(id: number): Promise<void> {
    await db.delete(storeFavorites).where(eq(storeFavorites.storeId, id));
    await db.delete(supplierStores).where(eq(supplierStores.id, id));
  }

  async getVisibleStores(): Promise<StoreCard[]> {
    const stores = await db.select().from(supplierStores)
      .where(and(eq(supplierStores.approvalStatus, 'APPROVED'), eq(supplierStores.visibility, 'VISIBLE')))
      .orderBy(asc(supplierStores.displayOrder), asc(supplierStores.id));
    const cards = await this.buildStoreCards(stores);
    // Only return stores that have at least one available product
    return cards.filter((c) => c.productCount > 0);
  }

  async getStoreDetail(id: number, opts?: { requireVisible?: boolean }): Promise<StoreDetail | undefined> {
    const [store] = await db.select().from(supplierStores).where(eq(supplierStores.id, id));
    if (!store) return undefined;
    if (opts?.requireVisible && (store.approvalStatus !== 'APPROVED' || store.visibility !== 'VISIBLE')) return undefined;
    const [card] = await this.buildStoreCards([store]);
    const [listings, reviewRows] = await Promise.all([
      db.select().from(supplierProductListings).where(eq(supplierProductListings.supplierId, store.supplierId)),
      db.select().from(supplierProductReviews).where(
        and(eq(supplierProductReviews.supplierId, store.supplierId), eq(supplierProductReviews.reviewType as any, 'SUPPLIER'))
      ),
    ]);
    // Real offer eligibility derived from persisted variants, not from
    // l.price/l.stock (see computeListingOffer) — task: "Fix Invalid
    // Supplier Product Mappings and Empty Products".
    const allListingIds = listings.map((l) => l.id);
    const allListingVariants = allListingIds.length
      ? await db.select().from(supplierProductVariants).where(inArray(supplierProductVariants.listingId, allListingIds))
      : [];
    const listingVariantsMap = new Map<number, typeof allListingVariants>();
    for (const v of allListingVariants) {
      if (!listingVariantsMap.has(v.listingId)) listingVariantsMap.set(v.listingId, []);
      listingVariantsMap.get(v.listingId)!.push(v);
    }
    const offerByListing = new Map(listings.map((l) => [l.id, computeListingOffer(listingVariantsMap.get(l.id) ?? [])]));
    const activeListings = listings.filter(
      // isIndividuallyVisible is standalone-listing-only (see schema comment) —
      // never checked by pack retrieval, so this store's packs are unaffected.
      (l) => l.visibility === 'VISIBLE' && l.isIndividuallyVisible && !l.onlyForPack && offerByListing.get(l.id)!.eligible,
    );
    const reviewCount = reviewRows.length;
    const avgRating = reviewCount ? reviewRows.reduce((s, r) => s + r.rating, 0) / reviewCount : 0;
    if (!activeListings.length) return { ...card, products: [], avgRating, reviewCount };
    const productIds = activeListings.map((l) => l.productId);
    const listingIds = activeListings.map((l) => l.id);
    const [prods, productReviewRows, promoListings] = await Promise.all([
      db.select().from(products).where(inArray(products.id, productIds)),
      db.select().from(supplierProductReviews).where(
        and(
          inArray(supplierProductReviews.productId as any, productIds),
          eq(supplierProductReviews.reviewType as any, 'PRODUCT')
        )
      ),
      this.facade.getPromotionsForListings(listingIds, undefined),
    ]);
    const promoListingSet = new Set(promoListings.map((p) => p.listingId));
    const listingByProduct = new Map(activeListings.map((l) => [l.productId, l]));
    const productReviewStats = new Map<number, { sum: number; count: number }>();
    for (const r of productReviewRows) {
      if (!r.productId) continue;
      const s = productReviewStats.get(r.productId) ?? { sum: 0, count: 0 };
      s.sum += r.rating; s.count += 1;
      productReviewStats.set(r.productId, s);
    }
    const tx = await buildTaxonomyCache();
    const enriched = prods.map((p) => {
      const listing = listingByProduct.get(p.id)!;
      const offer = offerByListing.get(listing.id)!;
      const stats = productReviewStats.get(p.id);
      return {
        ...enrichProduct(p, tx),
        price: offer.minPrice, bestPrice: offer.minPrice, totalStock: offer.totalStock,
        listingId: listing.id,
        hasPromo: promoListingSet.has(listing.id),
         listingPromotions: promoListings.filter((promo) => promo.listingId === listing.id),
        avgRating: stats ? stats.sum / stats.count : 0,
        reviewCount: stats?.count ?? 0,
      } as unknown as ProductWithTaxonomy;
    });
    return { ...card, products: enriched, avgRating, reviewCount };
  }

  // ── Supplier mappings ───────────────────────────────────────────────────────

  async getSupplierCategoryMappings(supplierId: number, options?: { approvedOnly?: boolean }): Promise<SupplierCategoryMapping[]> {
    const allCats = await db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true)));
    const allSubs = await db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)));
    const supplierCats = await db.select().from(supplierCategories)
      .where(eq(supplierCategories.supplierId, supplierId))
      .orderBy(asc(supplierCategories.displayOrder), asc(supplierCategories.id));
    const supplierSubs = await db.select().from(supplierSubCategories).where(eq(supplierSubCategories.supplierId, supplierId));
    const catMeta = new Map(supplierCats.map((sc) => [sc.categoryId, sc]));

    const catById = new Map(allCats.map((cat) => [cat.id, cat]));
    return supplierCats
      .map((meta) => ({ meta, cat: catById.get(meta.categoryId) }))
      .filter((entry): entry is { meta: typeof supplierCats[number]; cat: typeof allCats[number] } => !!entry.cat)
      .filter(({ meta }) => {
        if (options?.approvedOnly) {
          return meta.mappingStatus === 'APPROVED' && !meta.isFrozen;
        }
        return true;
      })
      .map(({ meta, cat }) => {
        return {
          category: cat,
          subCategories: allSubs.filter((s) => s.categoryId === cat.id),
          selectedSubCategoryIds: supplierSubs
            .filter((ss) => allSubs.some((s) => s.id === ss.subCategoryId && s.categoryId === cat.id))
            .map((ss) => ss.subCategoryId),
          mappingStatus: (meta.mappingStatus === 'PENDING' ? 'PENDING' : 'APPROVED') as 'APPROVED' | 'PENDING',
          isFrozen: meta.isFrozen ?? false,
        };
      });
  }

  async getAdminSupplierCategoryOverview(supplierId: number): Promise<AdminSupplierCategoryOverview> {
    const allMappings = await this.getSupplierCategoryMappings(supplierId);
    const allCats = await db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true)));
    const mappedIds = new Set(allMappings.map((m) => m.category.id));

    return {
      supplierId,
      approved: allMappings.filter((m) => m.mappingStatus === 'APPROVED'),
      pending: allMappings.filter((m) => m.mappingStatus === 'PENDING'),
      notAdded: allCats.filter((c) => !mappedIds.has(c.id)),
    };
  }

  async addSupplierCategories(supplierId: number, categoryIds: number[], status: 'APPROVED' | 'PENDING' = 'PENDING') {
    const availableCategories = await db.select({ categoryId: products.categoryId })
      .from(products)
      .where(and(eq(products.isAdminProduct, true), eq(products.status, 'ACTIVE')));
    const availableCategoryIds = new Set(availableCategories.map((row) => row.categoryId).filter((id): id is number => id != null));
    if (categoryIds.some((id) => !availableCategoryIds.has(id))) {
      throw new Error("Supplier categories must have an active Admin Product");
    }
    const existing = await db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
    const existingIds = new Set(existing.map((e) => e.categoryId));
    const newIds = categoryIds.filter((id) => !existingIds.has(id));
    if (newIds.length) {
      const nextOrder = existing.reduce((max, row) => Math.max(max, row.displayOrder ?? 0), -1) + 1;
      await db.insert(supplierCategories).values(
        newIds.map((categoryId, index) => ({ supplierId, categoryId, displayOrder: nextOrder + index, mappingStatus: status, isFrozen: false })),
      );
    }
  }

  async reorderSupplierCategories(supplierId: number, categoryIds: number[]) {
    const existing = await db.select().from(supplierCategories)
      .where(eq(supplierCategories.supplierId, supplierId));
    const existingIds = new Set(existing.map((row) => row.categoryId));
    if (categoryIds.length !== existing.length || categoryIds.some((id) => !existingIds.has(id))) {
      throw new Error("Category order must contain exactly the supplier's mapped categories");
    }
    await Promise.all(categoryIds.map((categoryId, index) =>
      db.update(supplierCategories)
        .set({ displayOrder: index })
        .where(and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)))
    ));
  }

  async removeSupplierCategory(supplierId: number, categoryId: number) {
    const allSubs = await db.select().from(subCategories).where(eq(subCategories.categoryId, categoryId));
    const subIds = allSubs.map((s) => s.id);
    await db.delete(supplierCategories).where(
      and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)),
    );
    if (subIds.length) {
      await db.delete(supplierSubCategories).where(
        and(eq(supplierSubCategories.supplierId, supplierId), inArray(supplierSubCategories.subCategoryId, subIds)),
      );
    }
  }

  async setSupplierCategoryFrozen(supplierId: number, categoryId: number, isFrozen: boolean) {
    await db.update(supplierCategories)
      .set({ isFrozen })
      .where(and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)));
  }

  async approveSupplierCategoryMapping(supplierId: number, categoryId: number) {
    await db.update(supplierCategories)
      .set({ mappingStatus: 'APPROVED' })
      .where(and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)));
  }

  async setSupplierCategories(supplierId: number, categoryIds: number[]) {
    const existing = await db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));

    // Never drop supplier-initiated PENDING mappings omitted from bulk admin selection
    const pendingPreservedIds = existing
      .filter((e) => e.mappingStatus === 'PENDING' && !categoryIds.includes(e.categoryId))
      .map((e) => e.categoryId);
    const finalCategoryIds = Array.from(new Set([...categoryIds, ...pendingPreservedIds]));

    const allSubs = await db.select().from(subCategories);
    const validSubIds = new Set(allSubs.filter((s) => finalCategoryIds.includes(s.categoryId)).map((s) => s.id));
    const supplierSubs = await db.select().from(supplierSubCategories).where(eq(supplierSubCategories.supplierId, supplierId));
    const orphanSubIds = supplierSubs.filter((ss) => !validSubIds.has(ss.subCategoryId)).map((ss) => ss.subCategoryId);

    if (finalCategoryIds.length === 0) {
      await db.delete(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
    } else {
      await db.delete(supplierCategories).where(
        and(
          eq(supplierCategories.supplierId, supplierId),
          notInArray(supplierCategories.categoryId, finalCategoryIds),
        ),
      );
    }

    const existingIds = new Set(existing.map((e) => e.categoryId));
    const toInsert = finalCategoryIds.filter((cid) => !existingIds.has(cid));
    if (toInsert.length) {
      await db.insert(supplierCategories).values(
        toInsert.map((cid) => ({
          supplierId,
          categoryId: cid,
          mappingStatus: 'APPROVED' as const,
          isFrozen: false,
        })),
      );
    }
    if (orphanSubIds.length) {
      await db.delete(supplierSubCategories).where(
        and(eq(supplierSubCategories.supplierId, supplierId), inArray(supplierSubCategories.subCategoryId, orphanSubIds)),
      );
    }
  }

  async setSupplierSubCategories(supplierId: number, subCategoryIds: number[]) {
    const supplierCats = await db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
    const selectedCatIds = new Set(supplierCats.map((sc) => sc.categoryId));
    const allSubs = await db.select().from(subCategories);
    const validSubIds = subCategoryIds.filter((sid) => {
      const sub = allSubs.find((s) => s.id === sid);
      return sub && selectedCatIds.has(sub.categoryId);
    });

    await db.delete(supplierSubCategories).where(eq(supplierSubCategories.supplierId, supplierId));
    if (validSubIds.length) {
      await db.insert(supplierSubCategories).values(validSubIds.map((sid) => ({ supplierId, subCategoryId: sid })));
    }
  }

  async isProductAllowedForSupplier(supplierId: number, productId: number): Promise<boolean> {
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product?.isAdminProduct) return false;
    if (!product.categoryId) return false;

    const mappings = await this.getSupplierCategoryMappings(supplierId, { approvedOnly: true });
    if (!mappings.length) return false;

    const mappedCatIds = new Set(mappings.map((m) => m.category.id));
    if (!mappedCatIds.has(product.categoryId)) return false;

    const catMapping = mappings.find((m) => m.category.id === product.categoryId);
    if (catMapping && catMapping.selectedSubCategoryIds.length > 0) {
      if (!product.subCategoryId) return false;
      return catMapping.selectedSubCategoryIds.includes(product.subCategoryId);
    }
    return true;
  }

  // ── Supplier product listings ───────────────────────────────────────────────

  async getSupplierListings(supplierId: number, filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number }): Promise<SupplierListingWithProduct[]> {
    const listings = await db.select().from(supplierProductListings).where(eq(supplierProductListings.supplierId, supplierId));
    const allProducts = await db.select().from(products);
    const allVariants = await db.select().from(supplierProductVariants);
    const tx = await buildTaxonomyCache();
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const v of allVariants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }

    // Pack usage — one batched query (never one per listing) so the client
    // can reliably disable "Remove" for a pack-used listing without an N+1
    // round trip (task: "Prevent removing products used in packs"). Counts
    // DISTINCT packs regardless of archived state, matching the same
    // "any pack state" rule the authoritative /pack-usage endpoint already
    // uses — a listing still referenced by an Old (archived) pack must stay
    // just as protected as one referenced by an active pack.
    const listingIds = listings.map((l) => l.id);
    const usageRows = listingIds.length
      ? await db.select({ listingId: packItems.listingId, packId: packItems.packId })
          .from(packItems)
          .where(inArray(packItems.listingId, listingIds))
      : [];
    const packIdsByListing = new Map<number, Set<number>>();
    for (const row of usageRows) {
      if (!packIdsByListing.has(row.listingId)) packIdsByListing.set(row.listingId, new Set());
      packIdsByListing.get(row.listingId)!.add(row.packId);
    }

    let result = listings.map((l) => {
      const prod = productMap.get(l.productId);
      if (!prod) return null;
      const variants = (variantsByListing.get(l.id) ?? []).map((v) => ({
        ...v,
        flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
        sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
      }));
      return { ...l, product: enrichProduct(prod, tx), variants, packUsageCount: packIdsByListing.get(l.id)?.size ?? 0 };
    }).filter(Boolean) as SupplierListingWithProduct[];

    if (filters?.categoryId) result = result.filter((l) => l.product.categoryId === filters.categoryId);
    if (filters?.subCategoryId) result = result.filter((l) => l.product.subCategoryId === filters.subCategoryId);
    if (filters?.flavorId) result = result.filter((l) => l.product.flavorId === filters.flavorId || l.product.flavorIds?.includes(filters.flavorId!));
    if (filters?.sizeId) result = result.filter((l) => l.product.sizeId === filters.sizeId || l.product.sizeIds?.includes(filters.sizeId!));
    if (filters?.brandId) result = result.filter((l) => l.product.brandId === filters.brandId);
    return result;
  }

  async createSupplierListing(data: Partial<InsertSupplierProductListing>, client: any = db) {
    const [created] = await client.insert(supplierProductListings).values(data as any).returning();
    return created;
  }

  // Atomic create (task: "Fix Invalid Supplier Product Mappings and Empty
  // Products") — the listing row and its variant rows used to be written by
  // two separate, non-transactional calls; a failure between them (crash,
  // DB error) could leave a listing persisted with zero variant rows, which
  // is exactly the orphaned/invalid-mapping shape this task fixes elsewhere.
  // Wrapping both in one transaction makes that specific failure mode
  // impossible going forward — either both rows land, or neither does.
  async createSupplierListingWithVariants(
    data: Partial<InsertSupplierProductListing>,
    variants: { flavorId?: number | null; sizeId?: number | null; price: number; quantity: number }[],
  ) {
    return db.transaction(async (tx) => {
      const listing = await this.createSupplierListing(data, tx);
      const savedVariants = await this.facade.saveVariants(listing.id, variants, tx);
      // saveVariants recomputes the listing's cached price/stock as a side
      // effect — re-read so the returned row reflects that, not the
      // pre-sync price:0/stock:0 snapshot from the moment of insertion.
      const [synced] = await tx.select().from(supplierProductListings).where(eq(supplierProductListings.id, listing.id));
      return { listing: synced ?? listing, variants: savedVariants };
    });
  }

  async updateSupplierListing(id: number, updates: { price?: number; stock?: number; availableFlavorIds?: number[]; availableSizeIds?: number[]; availableBrandIds?: number[] }) {
    const [updated] = await db.update(supplierProductListings).set(updates as any).where(eq(supplierProductListings.id, id)).returning();
    return updated;
  }

  // Task: "Prevent removing products used in packs" — this used to archive
  // every referencing pack and delete its packItems as a side effect of
  // removal. Replaced with an outright rejection: a listing referenced by
  // ANY pack (active or archived — an Old Pack's own display still resolves
  // productName/listingVariants through this exact listing row) can no
  // longer be removed at all, so pack composition, items, and history are
  // never touched by this operation. Re-checked here (not just client-side)
  // so a stale/bypassed client request can't slip through; the authoritative
  // relationship (packItems.listingId) is the same one GET .../pack-usage
  // and the batched packUsageCount in getSupplierListings both already use.
  async deleteSupplierListing(id: number) {
    const usageRows = await db.select({ packId: packItems.packId }).from(packItems).where(eq(packItems.listingId, id));
    if (usageRows.length > 0) {
      const err: any = new Error("This product cannot be removed because it is used in one or more packs.");
      err.code = "LISTING_USED_IN_PACK";
      throw err;
    }
    await db.delete(supplierProductVariants).where(eq(supplierProductVariants.listingId, id));
    await db.delete(inventoryAdjustments).where(eq(inventoryAdjustments.listingId, id));
    await db.delete(supplierProductListings).where(eq(supplierProductListings.id, id));
    return [] as number[];
  }

  async removeSupplierListingFromPacks(id: number): Promise<number[]> {
    const affectedRows = await db.select({ packId: packItems.packId })
      .from(packItems)
      .innerJoin(packs, eq(packItems.packId, packs.id))
      .where(and(eq(packItems.listingId, id), eq(packs.isArchived, false)));
    const archivedPackIds = Array.from(new Set(affectedRows.map((row) => row.packId)));
    if (archivedPackIds.length > 0) {
      await db.update(packs)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(inArray(packs.id, archivedPackIds));
    }
    await db.delete(packItems).where(eq(packItems.listingId, id));
    await db.update(supplierProductListings)
      .set({ onlyForPack: false, onlyForMyProducts: true, updatedAt: new Date() })
      .where(eq(supplierProductListings.id, id));
    return archivedPackIds;
  }

  // Physically displaced in the original monolith — was filed at the tail of
  // the (unrelated) Packs section, immediately before this domain's own
  // "Supplier product workflow" sub-section. Moved here with the rest of the
  // Supplier product listings, its real business-domain home.
  async getSupplierListingByProductId(supplierId: number, productId: number) {
    const [listing] = await db.select().from(supplierProductListings).where(
      and(eq(supplierProductListings.supplierId, supplierId), eq(supplierProductListings.productId, productId))
    );
    return listing;
  }

  // ── Supplier product workflow ───────────────────────────────────────────────

  async getSupplierCreatedProducts(supplierId: number) {
    const all = await db.select().from(products).where(
      and(eq(products.createdBySupplier, true), eq(products.createdByUserId, supplierId))
    );
    const tx = await buildTaxonomyCache();
    return all.map((p) => enrichProduct(p, tx));
  }

  async createSupplierProduct(data: Partial<InsertProduct>) {
    const [created] = await db.insert(products).values({
      ...data,
      name: (data.name ?? '') as string,
      isAdminProduct: false,
      status: 'PENDING',
      createdBySupplier: true,
      price: 0,
      stock: 0,
    } as any).returning();
    return created;
  }

  async updateSupplierProduct(id: number, supplierId: number, updates: Partial<InsertProduct>) {
    const [p] = await db.select().from(products).where(eq(products.id, id));
    if (!p || p.createdByUserId !== supplierId || p.status !== 'PENDING') return undefined;
    const [updated] = await db.update(products).set(updates as any).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteSupplierProduct(id: number, supplierId: number) {
    const [p] = await db.select().from(products).where(eq(products.id, id));
    if (!p || p.createdByUserId !== supplierId || p.status !== 'PENDING') {
      return { deleted: false, archivedPackIds: [] };
    }
    const listings = await db.select({ id: supplierProductListings.id })
      .from(supplierProductListings)
      .where(and(eq(supplierProductListings.productId, id), eq(supplierProductListings.supplierId, supplierId)));
    const archivedPackIds = new Set<number>();
    if (listings.length) {
      for (const listing of listings) {
        for (const packId of await this.deleteSupplierListing(listing.id)) archivedPackIds.add(packId);
      }
    }
    await db.delete(products).where(eq(products.id, id));
    return { deleted: true, archivedPackIds: Array.from(archivedPackIds) };
  }

  async getAdminSupplierProducts(): Promise<(ProductWithTaxonomy & { creatorName: string })[]> {
    const all = await db.select().from(products).where(
      and(eq(products.createdBySupplier, true), ne(products.status, 'ACTIVE'))
    );
    const tx = await buildTaxonomyCache();
    const supplierIds = Array.from(new Set(all.map((p) => p.createdByUserId).filter(Boolean))) as number[];
    const supplierRows = supplierIds.length ? await db.select().from(users).where(inArray(users.id, supplierIds)) : [];
    const supplierMap = new Map(supplierRows.map((u) => [u.id, u.name]));
    return all.map((p) => ({
      ...enrichProduct(p, tx),
      creatorName: p.createdByUserId ? (supplierMap.get(p.createdByUserId) ?? 'Unknown') : 'Unknown',
    }));
  }

  async approveSupplierProduct(id: number, adminId: number) {
    const [updated] = await db.update(products).set({
      status: 'ACTIVE',
      isAdminProduct: true,
      approvedBy: adminId,
      approvedAt: new Date(),
    } as any).where(eq(products.id, id)).returning();
    return updated;
  }
}
