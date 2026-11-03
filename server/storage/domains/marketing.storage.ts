import { db } from "../../db";
import { eq, and, inArray, desc, asc, sql, isNull, isNotNull } from "drizzle-orm";
import {
  marketingProfiles, marketingProjects, marketingCategoryTaxonomy, marketingSubCategoryTaxonomy, marketingReports, marketingFavorites,
  marketingServices, users, supplierProductReviews,
  type MarketingService, type InsertMarketingService, type MarketingServiceCard, type MarketingSubCategory,
  type MarketingProfile, type InsertMarketingProfile, type MarketingMarketplaceCard, type MarketingCompanyListCard,
  type MarketingProject, type InsertMarketingProject,
  type MarketingReport, type MarketingCategory,
  type SupplierProductReview,
} from "@shared/schema";
import type { DatabaseStorage } from "../../storage";

// Stage 2 — Batch 30: the COMPLETE Marketing business domain,
// consolidated into one file per the project's permanent "one business
// domain = one storage file" rule (adopted Batch 28, reapplied Batch 29
// for Maintenance). Named `marketing.storage.ts` to match the project's
// existing `<name>.storage.ts` convention (the task text said
// `marketing-storage.ts` — the same naming slip already caught and
// corrected for Barista/Maintenance; corrected here from the start).
//
// This merges:
//   (a) the previously-separate marketing-reports.storage.ts (Batch 18) —
//       Entity-level "Blacklist" reports, and
//   (b) the complete remaining Marketing implementation that was still in
//       server/storage.ts (Profile, the Agency "Company card" list,
//       Services [Agency → Multiple Services, with its own one-time
//       migration/category-sync helpers], Favorites [two independent
//       kinds — agency-level and service-level, scoped by serviceId
//       NULL/NOT NULL], Projects [the full request → quote → active →
//       completion lifecycle], Reviews [a written, cached rating
//       aggregate on `marketingProfiles`, same architecture as
//       Maintenance's, confirmed independently — not assumed from the
//       similarity], Revenue summary, Taxonomy [Category + SubCategory,
//       each with their own CRUD, plus a category-mapping migration
//       helper], Admin aggregate overview), plus
//       `refreshMarketingMessagingState`, which — unlike Maintenance's
//       displaced equivalent — was ALREADY physically inline within this
//       same section (confirmed by direct reading, not assumed from
//       Maintenance's precedent).
//
// Deliberately NOT included: Barista/Barista Academy/Maintenance/
// Supplier/Delivery/Print (zero table overlap, confirmed via
// repository-wide grep). Unlike Maintenance's `refreshMaintenanceReviewStats`,
// `refreshMarketingReviewStats` has **zero** external callers anywhere in
// the repository (confirmed via a full grep for `marketingUserId` outside
// this domain's original section — zero matches), so it stays fully
// `private` here; the generic (not yet extracted) Reviews domain's
// `deleteReview` only special-cases MAINTENANCE, not MARKETING — a real,
// confirmed asymmetry between the two domains, not an oversight.
//
// Cross-domain dependency: `refreshMarketingMessagingState` calls the
// already-public `syncMessagingRelationship` (not yet extracted, lives on
// DatabaseStorage) — reached via `this.facade.syncMessagingRelationship(...)`.
//
// `parseLatLng`/`haversineKm`/`formatPublicLocation` are duplicated here
// (not moved) — all three are shared, pure, side-effect-free helpers also
// used by other marketplace-proximity methods across Barista/Maintenance/
// Academy/Print, still in server/storage.ts or already duplicated into
// their own domain files.
//
// Transaction: zero. No method in this entire domain opens a
// `db.transaction(...)` (confirmed via a direct grep of the original
// section before extraction).
export class MarketingStorage {
  constructor(private facade: DatabaseStorage) {}

  // ── Shared geo/location helpers (duplicated, not moved — see file header) ──
  private haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  private parseLatLng(loc?: { lat?: string | null; lng?: string | null } | null): { lat: number; lng: number } | null {
    if (!loc?.lat || !loc?.lng) return null;
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  }

  private formatPublicLocation(user: { locationAddress?: string | null; locationDetails?: unknown }): string {
    const details = (user.locationDetails ?? null) as { municipality?: string; governorate?: string } | null;
    const municipality = details?.municipality?.trim();
    const governorate = details?.governorate?.trim();
    if (municipality && governorate && municipality.toLowerCase() !== governorate.toLowerCase()) {
      return `${municipality}, ${governorate}`;
    }
    if (municipality) return `${municipality}, Tunisie`;
    if (governorate) return `${governorate}, Tunisie`;

    const address = user.locationAddress?.trim();
    if (!address) return "";
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return "";
    const last = parts[parts.length - 1];
    const isCountry = /tunisia|tunisie/i.test(last);
    const country = isCountry ? last : "Tunisie";
    const cityPart = isCountry ? parts[parts.length - 2] : parts[parts.length - 1];
    if (!cityPart) return country;
    const city = cityPart.replace(/^\d{3,5}\s+/, "").trim(); // strip a leading postal code, e.g. "3000 Sfax"
    return city ? `${city}, ${country}` : country;
  }

  async getMarketingProfiles(filters?: {
    search?: string;
    category?: string;
    profileType?: string;
    location?: string;
    viewerLocation?: { lat?: string | null; lng?: string | null } | null;
  }): Promise<MarketingMarketplaceCard[]> {
    const rows = await db.select({ profile: marketingProfiles, user: users })
      .from(marketingProfiles)
      .innerJoin(users, eq(marketingProfiles.userId, users.id))
      .where(and(
        eq(users.role, "MARKETING" as any),
        eq(users.status, "approved"),
        eq(marketingProfiles.marketplaceVisible, true),
        eq(marketingProfiles.isFrozen, false),
        // GO Live (Phase 5E) — one more AND-gate, never a replacement.
        eq(marketingProfiles.publicationStatus, "APPROVED"),
      ));

    const marketingUserIds = rows.map(({ profile }) => profile.userId);
    const reviewRows = marketingUserIds.length
      ? await db.select({
          marketingUserId: supplierProductReviews.marketingUserId,
          rating: supplierProductReviews.rating,
        }).from(supplierProductReviews).where(and(
          eq(supplierProductReviews.reviewType, "MARKETING"),
          inArray(supplierProductReviews.marketingUserId as any, marketingUserIds),
        ))
      : [];
    const reviewStats = new Map<number, { total: number; sum: number }>();
    for (const review of reviewRows) {
      if (!review.marketingUserId) continue;
      const current = reviewStats.get(review.marketingUserId) ?? { total: 0, sum: 0 };
      current.total += 1;
      current.sum += review.rating;
      reviewStats.set(review.marketingUserId, current);
    }

    const viewerPos = filters?.viewerLocation ? this.parseLatLng(filters.viewerLocation) : null;

    const cards = rows.map(({ profile, user }) => {
      const stats = reviewStats.get(profile.userId);
      const providerPos = this.parseLatLng({ lat: user.locationLat, lng: user.locationLng });
      const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
      return {
        ...profile,
        rating: stats ? Math.round((stats.sum / stats.total) * 10) : 0,
        reviewCount: stats?.total ?? 0,
        name: user.name,
        phone: user.phone ?? null,
        profileImageUrl: user.profileImageUrl ?? null,
        location: this.formatPublicLocation(user),
        initials: user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        distanceKm,
      } as MarketingMarketplaceCard;
    });

    const query = filters?.search?.trim().toLowerCase();
    return cards.filter((card) => {
      if (query) {
        const haystack = [card.name, card.description, card.location, card.categories.join(" ")].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters?.category && !card.categories.some((c) => c.toLowerCase() === filters.category!.toLowerCase())) return false;
      if (filters?.profileType && card.profileType !== filters.profileType) return false;
      if (filters?.location && card.location !== filters.location) return false;
      return true;
    });
  }

  async getMarketingCategories(): Promise<string[]> {
    const taxonomy = await this.getMarketingTaxonomy();
    const activeTaxonomy = taxonomy.filter((item) => item.isActive && !item.isFrozen);
    if (activeTaxonomy.length) return activeTaxonomy.map((item) => item.name);
    const rows = await db.select({ categories: marketingProfiles.categories })
      .from(marketingProfiles)
      .innerJoin(users, eq(marketingProfiles.userId, users.id))
      .where(and(eq(users.role, "MARKETING" as any), eq(users.status, "approved"), eq(marketingProfiles.marketplaceVisible, true)));
    return Array.from(new Set(rows.flatMap((row) => row.categories))).sort((a, b) => a.localeCompare(b));
  }

  async getMarketingProfile(userId: number): Promise<MarketingProfile> {
    const [profile] = await db.select().from(marketingProfiles).where(eq(marketingProfiles.userId, userId));
    if (profile) return profile;
    const [created] = await db.insert(marketingProfiles).values({ userId }).returning();
    return created;
  }

  async getMarketingCard(userId: number, viewerLocation?: { lat?: string | null; lng?: string | null } | null): Promise<MarketingMarketplaceCard | undefined> {
    const [row] = await db.select({ profile: marketingProfiles, user: users })
      .from(marketingProfiles)
      .innerJoin(users, eq(marketingProfiles.userId, users.id))
      .where(eq(marketingProfiles.userId, userId));
    if (!row) return undefined;
    const reviews = await db.select({ rating: supplierProductReviews.rating }).from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.reviewType, "MARKETING"), eq(supplierProductReviews.marketingUserId as any, userId)));
    const rating = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) : 0;
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const providerPos = this.parseLatLng({ lat: row.user.locationLat, lng: row.user.locationLng });
    const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
    return {
      ...row.profile,
      userId: row.user.id,
      name: row.user.name,
      phone: row.user.phone ?? null,
      profileImageUrl: row.user.profileImageUrl ?? null,
      coverImageUrl: row.user.coverImageUrl ?? null,
      flashImageUrl: row.user.flashImageUrl ?? null,
      location: this.formatPublicLocation(row.user),
      initials: row.user.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      distanceKm,
      rating,
      reviewCount: reviews.length,
    };
  }

  /** Lightweight "Marketing Store" list — one card per visible Agency with at
   *  least one published service, mirrors getPrintCompanyCards()'s role for
   *  Print Stores (docs/marketing_store_mapping_audit.md). Reuses the exact
   *  same visibility gate getMarketingProfiles/getPublishedMarketingServices
   *  already use. */
  async getMarketingCompanyCards(viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<MarketingCompanyListCard[]> {
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const serviceRows = await db.select({ marketingUserId: marketingServices.marketingUserId })
      .from(marketingServices)
      .innerJoin(users, eq(marketingServices.marketingUserId, users.id))
      .where(and(
        eq(marketingServices.isPublished, true),
        eq(users.role, "MARKETING" as any),
        eq(users.status, "approved"),
      ));
    const countByAgency = new Map<number, number>();
    for (const row of serviceRows) countByAgency.set(row.marketingUserId, (countByAgency.get(row.marketingUserId) ?? 0) + 1);
    const agencyIds = Array.from(countByAgency.keys());
    if (agencyIds.length === 0) return [];

    const [profileRows, userRows, statsMap] = await Promise.all([
      db.select().from(marketingProfiles).where(inArray(marketingProfiles.userId, agencyIds)),
      db.select().from(users).where(inArray(users.id, agencyIds)),
      this.computeMarketingReviewStats(agencyIds),
    ]);
    const profileByUser = new Map(profileRows.map((p) => [p.userId, p]));
    const userById = new Map(userRows.map((u) => [u.id, u]));

    const cards: MarketingCompanyListCard[] = [];
    for (const agencyId of agencyIds) {
      const user = userById.get(agencyId);
      const profile = profileByUser.get(agencyId);
      if (!user || !profile) continue;
      if (!profile.marketplaceVisible || profile.isFrozen || profile.publicationStatus !== "APPROVED") continue;
      const stats = statsMap.get(agencyId);
      const providerPos = this.parseLatLng({ lat: user.locationLat, lng: user.locationLng });
      const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
      cards.push({
        userId: user.id,
        name: user.name,
        profileImageUrl: user.profileImageUrl ?? null,
        coverImageUrl: user.coverImageUrl ?? null,
        flashImageUrl: user.flashImageUrl ?? null,
        location: this.formatPublicLocation(user),
        phone: user.phone ?? null,
        description: profile.description,
        websiteUrl: profile.websiteUrl ?? null,
        marketplaceVisible: profile.marketplaceVisible,
        weeklyHours: profile.weeklyHours ?? null,
        isOnVacation: profile.isOnVacation,
        profileType: profile.profileType,
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
        portfolioImages: profile.portfolioImages ?? [],
        categories: profile.categories ?? [],
        serviceCount: countByAgency.get(agencyId) ?? 0,
        distanceKm,
      });
    }
    // Admin's drag-and-drop reorder (marketingProfiles.displayOrder) is the single source
    // of truth for Store-card order here too — mirrors getVisibleStores()'s role for Supplier Stores.
    cards.sort((a, b) => (profileByUser.get(a.userId)?.displayOrder ?? 0) - (profileByUser.get(b.userId)?.displayOrder ?? 0) || a.userId - b.userId);
    return cards;
  }

  async upsertMarketingProfile(userId: number, updates: Partial<InsertMarketingProfile>): Promise<MarketingProfile> {
    const current = await this.getMarketingProfile(userId);
    const [updated] = await db.update(marketingProfiles)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(marketingProfiles.id, current.id))
      .returning();
    return updated;
  }

  /** Admin MARKETING drag-and-drop — mirrors bulkUpdateStoreOrder's independent-per-row pattern. */
  async bulkUpdateMarketingOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(async ({ id, displayOrder }) => {
      await this.getMarketingProfile(id); // lazy-create the row if it doesn't exist yet
      await db.update(marketingProfiles).set({ displayOrder, updatedAt: new Date() }).where(eq(marketingProfiles.userId, id));
    }));
  }

  /** Admin MARKETING Auto Approve — mirrors setStoreAutoApprove. */
  async setMarketingAutoApprove(userId: number, autoApprove: boolean): Promise<MarketingProfile> {
    return this.upsertMarketingProfile(userId, { autoApprove });
  }

  // Marketing favorites — mirrors getMaintenanceFavoritesByUser/add/remove exactly.
  // ── Marketing Services (Agency → Multiple Services) ──────────────────────────
  // Mirrors the academyCourses/getAcademyCoursesForAcademy/getPublishedAcademyCourses/
  // getAcademyCourseCard section exactly — same "one profile + many offerings" split.

  /** Self-healing one-time migration: an agency's pre-existing categories/price/
   *  responseTime/description (all agency-level before this task) become one real
   *  service per category the FIRST time its services are ever read, if it has none
   *  yet — never destroys the old fields (they stay on marketingProfiles, now simply
   *  unused by new UI), never re-runs once services exist. Preserves real data
   *  instead of resetting it, exactly as required. */
  private async migrateMarketingServicesIfNeeded(marketingUserId: number): Promise<void> {
    const [existingCount] = await db.select({ count: sql<number>`count(*)::int` }).from(marketingServices)
      .where(eq(marketingServices.marketingUserId, marketingUserId));
    if (existingCount && existingCount.count > 0) return;
    const profile = await this.getMarketingProfile(marketingUserId);
    if (!profile.categories.length) return;
    await db.insert(marketingServices).values(profile.categories.map((category) => ({
      marketingUserId,
      category,
      startingPriceInCents: profile.startingPriceInCents,
      responseTime: profile.responseTime,
      description: profile.description,
      imageUrl: profile.portfolioImages[0] ?? null,
      isPublished: true,
    }))).onConflictDoNothing();
  }

  async getMarketingServicesForProvider(marketingUserId: number): Promise<MarketingService[]> {
    await this.migrateMarketingServicesIfNeeded(marketingUserId);
    return db.select().from(marketingServices).where(eq(marketingServices.marketingUserId, marketingUserId)).orderBy(desc(marketingServices.createdAt));
  }

  async getMarketingServiceById(id: number): Promise<MarketingService | undefined> {
    const [row] = await db.select().from(marketingServices).where(eq(marketingServices.id, id));
    return row;
  }

  async createMarketingService(marketingUserId: number, data: Partial<InsertMarketingService>): Promise<MarketingService> {
    const { marketingUserId: _ignored, id: _ignoredId, ...safeData } = data as any;
    const [created] = await db.insert(marketingServices).values({
      ...safeData, marketingUserId, isPublished: data.isPublished ?? true,
    } as any).returning();
    await this.syncMarketingProfileCategories(marketingUserId);
    return created;
  }

  async updateMarketingService(id: number, marketingUserId: number, data: Partial<InsertMarketingService>): Promise<MarketingService | undefined> {
    const { marketingUserId: _ignored, id: _ignoredId, ...safeData } = data as any;
    const [updated] = await db.update(marketingServices)
      .set({ ...safeData, updatedAt: new Date() })
      .where(and(eq(marketingServices.id, id), eq(marketingServices.marketingUserId, marketingUserId)))
      .returning();
    if (updated) await this.syncMarketingProfileCategories(marketingUserId);
    return updated;
  }

  async deleteMarketingService(id: number, marketingUserId: number): Promise<void> {
    await db.delete(marketingServices).where(and(eq(marketingServices.id, id), eq(marketingServices.marketingUserId, marketingUserId)));
    await this.syncMarketingProfileCategories(marketingUserId);
  }

  /** Keeps the legacy marketingProfiles.categories field (still read by
   *  MarketingFastSearch/MarketingBlacklistModal and the agency-level
   *  /api/marketing/profiles list — deliberately left in place, unmigrated,
   *  as peripheral/out-of-scope surfaces) in sync with the agency's real,
   *  currently PUBLISHED services — never a second, independently-edited
   *  category list drifting out of sync with the new source of truth. */
  private async syncMarketingProfileCategories(marketingUserId: number): Promise<void> {
    const services = await db.select({ category: marketingServices.category, isPublished: marketingServices.isPublished })
      .from(marketingServices).where(eq(marketingServices.marketingUserId, marketingUserId));
    const categories = Array.from(new Set(services.filter((s) => s.isPublished).map((s) => s.category)));
    await db.update(marketingProfiles).set({ categories, updatedAt: new Date() }).where(eq(marketingProfiles.userId, marketingUserId));
  }

  /** Public /marketing listing — one card per published SERVICE (mirrors
   *  getPublishedAcademyCourses exactly): only from approved, marketplace-visible,
   *  non-frozen, non-vacationing agencies. Runs the lazy migration for every
   *  agency with categories but no services row yet, so existing real data
   *  surfaces here automatically instead of silently disappearing. */
  async getPublishedMarketingServices(filters?: {
    search?: string; category?: string; profileType?: string; location?: string;
    viewerLocation?: { lat?: string | null; lng?: string | null } | null;
  }): Promise<MarketingServiceCard[]> {
    const agencyRows = await db.select({ profile: marketingProfiles, user: users })
      .from(marketingProfiles)
      .innerJoin(users, eq(marketingProfiles.userId, users.id))
      .where(and(
        eq(users.role, "MARKETING" as any),
        eq(users.status, "approved"),
        eq(marketingProfiles.marketplaceVisible, true),
        eq(marketingProfiles.isFrozen, false),
        // GO Live (Phase 5E) — one more AND-gate, never a replacement.
        eq(marketingProfiles.publicationStatus, "APPROVED"),
      ));
    for (const { profile } of agencyRows) await this.migrateMarketingServicesIfNeeded(profile.userId);

    const agencyIds = agencyRows.map(({ profile }) => profile.userId);
    if (!agencyIds.length) return [];
    const serviceRows = agencyIds.length
      ? await db.select().from(marketingServices).where(and(eq(marketingServices.isPublished, true), inArray(marketingServices.marketingUserId, agencyIds)))
      : [];
    const agencyById = new Map(agencyRows.map((r) => [r.profile.userId, r]));
    const statsMap = await this.computeMarketingReviewStats(agencyIds);
    const viewerPos = filters?.viewerLocation ? this.parseLatLng(filters.viewerLocation) : null;

    const cards = serviceRows
      .filter((service) => !agencyById.get(service.marketingUserId)!.profile.isOnVacation)
      .map((service) => {
        const { profile, user } = agencyById.get(service.marketingUserId)!;
        const stats = statsMap.get(service.marketingUserId);
        const providerPos = this.parseLatLng({ lat: user.locationLat, lng: user.locationLng });
        const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
        return {
          ...service,
          agencyName: user.name,
          agencyLocation: this.formatPublicLocation(user),
          agencyProfileImageUrl: user.profileImageUrl ?? null,
          agencyDescription: profile.description,
          agencyWebsiteUrl: profile.websiteUrl ?? null,
          agencyProfileType: profile.profileType,
          agencyIsAvailable: profile.isAvailable && !profile.isOnVacation,
          rating: stats?.rating ?? 0,
          reviewCount: stats?.reviewCount ?? 0,
          distanceKm,
        } as MarketingServiceCard;
      });

    const query = filters?.search?.trim().toLowerCase();
    return cards.filter((card) => {
      if (query) {
        const haystack = [card.category, card.description, card.agencyName, card.agencyLocation].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters?.category && card.category.toLowerCase() !== filters.category.toLowerCase()) return false;
      if (filters?.profileType && card.agencyProfileType !== filters.profileType) return false;
      if (filters?.location && card.agencyLocation !== filters.location) return false;
      return true;
    });
  }

  async getMarketingServiceCard(id: number): Promise<MarketingServiceCard | undefined> {
    const service = await this.getMarketingServiceById(id);
    if (!service) return undefined;
    const [row] = await db.select({ profile: marketingProfiles, user: users })
      .from(marketingProfiles)
      .innerJoin(users, eq(marketingProfiles.userId, users.id))
      .where(eq(marketingProfiles.userId, service.marketingUserId));
    if (!row) return undefined;
    const stats = (await this.computeMarketingReviewStats([service.marketingUserId])).get(service.marketingUserId);
    return {
      ...service,
      agencyName: row.user.name,
      agencyLocation: this.formatPublicLocation(row.user),
      agencyProfileImageUrl: row.user.profileImageUrl ?? null,
      agencyDescription: row.profile.description,
      agencyWebsiteUrl: row.profile.websiteUrl ?? null,
      agencyProfileType: row.profile.profileType,
      agencyIsAvailable: row.profile.isAvailable && !row.profile.isOnVacation,
      rating: stats?.rating ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
    };
  }

  /** Live rating/reviewCount for one or more agencies — shared by the service list
   *  builder, the single-service card, and the agency card. Mirrors
   *  computeAcademyReviewStats exactly. */
  private async computeMarketingReviewStats(marketingUserIds: number[]): Promise<Map<number, { rating: number; reviewCount: number }>> {
    if (!marketingUserIds.length) return new Map();
    const reviewRows = await db.select({
      marketingUserId: supplierProductReviews.marketingUserId,
      rating: supplierProductReviews.rating,
    }).from(supplierProductReviews).where(and(
      eq(supplierProductReviews.reviewType, "MARKETING"),
      inArray(supplierProductReviews.marketingUserId as any, marketingUserIds),
    ));
    const sums = new Map<number, { total: number; sum: number }>();
    for (const row of reviewRows) {
      if (!row.marketingUserId) continue;
      const current = sums.get(row.marketingUserId) ?? { total: 0, sum: 0 };
      current.total += 1;
      current.sum += row.rating;
      sums.set(row.marketingUserId, current);
    }
    const result = new Map<number, { rating: number; reviewCount: number }>();
    for (const [userId, s] of Array.from(sums.entries())) result.set(userId, { rating: Math.round((s.sum / s.total) * 10), reviewCount: s.total });
    return result;
  }

  // Marketing favorites — agency (company) rows have serviceId NULL; service
  // (item) rows have serviceId set (docs/coffee_owner_favorites_marketplace_audit.md,
  // Section 4). These three methods are scoped to serviceId IS NULL so that
  // favoriting/unfavoriting the agency never touches a Coffee Owner's separate
  // service favorites for that same agency.
  async getMarketingFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select({ marketingUserId: marketingFavorites.marketingUserId })
      .from(marketingFavorites)
      .where(and(eq(marketingFavorites.userId, userId), isNull(marketingFavorites.serviceId)));
    return rows.map((row) => row.marketingUserId);
  }

  async addMarketingFavorite(userId: number, marketingUserId: number): Promise<void> {
    const [existing] = await db.select().from(marketingFavorites).where(and(
      eq(marketingFavorites.userId, userId),
      eq(marketingFavorites.marketingUserId, marketingUserId),
      isNull(marketingFavorites.serviceId),
    ));
    if (!existing) await db.insert(marketingFavorites).values({ userId, marketingUserId, serviceId: null });
  }

  async removeMarketingFavorite(userId: number, marketingUserId: number): Promise<void> {
    await db.delete(marketingFavorites).where(and(
      eq(marketingFavorites.userId, userId),
      eq(marketingFavorites.marketingUserId, marketingUserId),
      isNull(marketingFavorites.serviceId),
    ));
  }

  async getMarketingServiceFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select({ serviceId: marketingFavorites.serviceId })
      .from(marketingFavorites)
      .where(and(eq(marketingFavorites.userId, userId), isNotNull(marketingFavorites.serviceId)));
    return rows.map((row) => row.serviceId as number);
  }

  async addMarketingServiceFavorite(userId: number, marketingUserId: number, serviceId: number): Promise<void> {
    const [existing] = await db.select().from(marketingFavorites).where(and(
      eq(marketingFavorites.userId, userId),
      eq(marketingFavorites.serviceId, serviceId),
    ));
    if (!existing) await db.insert(marketingFavorites).values({ userId, marketingUserId, serviceId });
  }

  async removeMarketingServiceFavorite(userId: number, serviceId: number): Promise<void> {
    await db.delete(marketingFavorites).where(and(
      eq(marketingFavorites.userId, userId),
      eq(marketingFavorites.serviceId, serviceId),
    ));
  }

  async getMarketingProjectsForProvider(userId: number): Promise<(MarketingProject & { cafeOwner: string; ownerPhone: string | null })[]> {
    const rows = await db.select({ project: marketingProjects, owner: users })
      .from(marketingProjects)
      .innerJoin(users, eq(marketingProjects.cafeOwnerId, users.id))
      .where(eq(marketingProjects.marketingUserId, userId))
      .orderBy(desc(marketingProjects.createdAt));
    return rows.map(({ project, owner }) => ({ ...project, cafeOwner: owner.name, ownerPhone: owner.phone ?? null }));
  }

  async getMarketingProjectsForOwner(userId: number): Promise<(MarketingProject & { marketingName: string })[]> {
    const rows = await db.select({ project: marketingProjects, provider: users })
      .from(marketingProjects)
      .innerJoin(users, eq(marketingProjects.marketingUserId, users.id))
      .where(eq(marketingProjects.cafeOwnerId, userId))
      .orderBy(desc(marketingProjects.createdAt));
    return rows.map(({ project, provider }) => ({ ...project, marketingName: provider.name }));
  }

  async createMarketingProject(data: InsertMarketingProject): Promise<MarketingProject> {
    const [created] = await db.insert(marketingProjects).values(data as any).returning();
    return created;
  }

  async getMarketingProjectById(id: number): Promise<MarketingProject | undefined> {
    const [row] = await db.select().from(marketingProjects).where(eq(marketingProjects.id, id));
    return row;
  }

  // Provider-side lifecycle move (quote a PENDING request, start/progress an
  // ACCEPTED project, mark COMPLETED) — ownership-scoped in the WHERE clause,
  // mirroring updateMaintenanceReservationStatus.
  async updateMarketingProjectStatus(id: number, providerId: number, updates: {
    status?: string; quoteAmountInCents?: number; finalAmountInCents?: number; progress?: number;
    startDate?: string; deadline?: string;
  }): Promise<MarketingProject | undefined> {
    const [updated] = await db.update(marketingProjects)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(marketingProjects.id, id), eq(marketingProjects.marketingUserId, providerId)))
      .returning();
    return updated;
  }

  // Owner responds to a QUOTED project — accept (→ ACCEPTED, active project) or
  // reject (→ REJECTED, terminal, mirrors Maintenance's reschedule-response shape).
  async respondToMarketingQuote(id: number, ownerId: number, accepted: boolean): Promise<MarketingProject | undefined> {
    const [updated] = await db.update(marketingProjects)
      .set({ status: accepted ? "ACCEPTED" : "REJECTED", updatedAt: new Date() })
      .where(and(eq(marketingProjects.id, id), eq(marketingProjects.cafeOwnerId, ownerId), eq(marketingProjects.status, "QUOTED")))
      .returning();
    return updated;
  }

  // Coffee Owner self-service cancellation — only while still PENDING (no quote
  // sent yet), mirroring cancelMaintenanceReservationByOwner.
  async cancelMarketingProjectByOwner(id: number, cafeOwnerId: number): Promise<MarketingProject | undefined> {
    const [updated] = await db.update(marketingProjects)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(and(eq(marketingProjects.id, id), eq(marketingProjects.cafeOwnerId, cafeOwnerId), eq(marketingProjects.status, "PENDING")))
      .returning();
    return updated;
  }

  async adminUpdateMarketingProject(id: number, data: Partial<{
    service: string; title: string; description: string; status: string;
    quoteAmountInCents: number; finalAmountInCents: number; progress: number; startDate: string; deadline: string;
  }>): Promise<MarketingProject | undefined> {
    const [updated] = await db.update(marketingProjects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(marketingProjects.id, id))
      .returning();
    return updated;
  }

  async setMarketingProjectFrozen(id: number, isFrozen: boolean): Promise<MarketingProject | undefined> {
    const [updated] = await db.update(marketingProjects).set({ isFrozen, updatedAt: new Date() }).where(eq(marketingProjects.id, id)).returning();
    return updated;
  }

  async deleteMarketingProject(id: number): Promise<void> {
    await db.delete(marketingProjects).where(eq(marketingProjects.id, id));
  }

  // Stage 2 — Batch 42: Marketing's review CRUD (getMarketingReviews/
  // getMarketingReviewForProject/upsertMarketingReview/
  // deleteMarketingReview) and its cached-rating refresh helper
  // (refreshMarketingReviewStats) moved to
  // server/storage/domains/reviews.storage.ts (the cross-entity Reviews
  // domain) — see server/STORAGE_ARCHITECTURE.md ("Batch 42"). Every
  // other Marketing method (Profile, Projects, Category mapping, etc.)
  // is unaffected and stays here unchanged.

  // Monthly revenue breakdown from COMPLETED projects' finalAmountInCents —
  // same shape/reasoning as getBaristaRevenueSummary (Dashboard/Analytics chart).
  async getMarketingRevenueSummary(userId: number): Promise<{
    totalEarnedCents: number; completedProjects: number; currentMonthCents: number; currentMonthProjects: number;
    history: { month: string; totalCents: number; projects: number }[];
  }> {
    const rows = await db.select().from(marketingProjects)
      .where(and(eq(marketingProjects.marketingUserId, userId), eq(marketingProjects.status, "COMPLETED")));
    const now = new Date();
    const months: { key: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` });
    }
    const byMonth = new Map<string, { totalCents: number; projects: number }>();
    for (const row of rows) {
      const updated = row.updatedAt ?? row.createdAt ?? now;
      const key = `${updated.getFullYear()}-${String(updated.getMonth() + 1).padStart(2, "0")}`;
      const current = byMonth.get(key) ?? { totalCents: 0, projects: 0 };
      current.totalCents += row.finalAmountInCents ?? 0;
      current.projects += 1;
      byMonth.set(key, current);
    }
    const currentKey = months[months.length - 1].key;
    const currentMonth = byMonth.get(currentKey) ?? { totalCents: 0, projects: 0 };
    return {
      totalEarnedCents: rows.reduce((sum, r) => sum + (r.finalAmountInCents ?? 0), 0),
      completedProjects: rows.length,
      currentMonthCents: currentMonth.totalCents,
      currentMonthProjects: currentMonth.projects,
      history: months.map((m) => ({ month: m.key, totalCents: byMonth.get(m.key)?.totalCents ?? 0, projects: byMonth.get(m.key)?.projects ?? 0 })),
    };
  }

  private async seedMarketingTaxonomyIfEmpty(): Promise<void> {
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(marketingCategoryTaxonomy);
    if (count && count.count > 0) return;
    const DEFAULTS = ["Website", "SEO", "Ads", "Social", "Vidéo", "Photo", "Branding"];
    await db.insert(marketingCategoryTaxonomy).values(DEFAULTS.map((name) => ({ name }))).onConflictDoNothing();
  }

  async getMarketingTaxonomy(): Promise<MarketingCategory[]> {
    await this.seedMarketingTaxonomyIfEmpty();
    return db.select().from(marketingCategoryTaxonomy).orderBy(asc(marketingCategoryTaxonomy.name));
  }

  async getAvailableMarketingTaxonomy(): Promise<MarketingCategory[]> {
    const taxonomy = await this.getMarketingTaxonomy();
    return taxonomy.filter((item) => item.isActive && !item.isFrozen);
  }

  async createMarketingCategory(name: string, icon?: string | null): Promise<MarketingCategory> {
    const [created] = await db.insert(marketingCategoryTaxonomy).values({ name: name.trim(), icon: icon?.trim() || null }).returning();
    return created;
  }

  async updateMarketingCategory(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<MarketingCategory | undefined> {
    const [updated] = await db.update(marketingCategoryTaxonomy)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), ...(data.icon !== undefined ? { icon: data.icon?.trim() || null } : {}), updatedAt: new Date() })
      .where(eq(marketingCategoryTaxonomy.id, id)).returning();
    return updated;
  }

  async deleteMarketingCategory(id: number): Promise<void> {
    await db.delete(marketingCategoryTaxonomy).where(eq(marketingCategoryTaxonomy.id, id));
  }

  // ── Marketing subcategory taxonomy — mirrors getPrintSubCategoryTaxonomy/
  // createPrintSubCategory/updatePrintSubCategory/deletePrintSubCategory exactly. ──

  async getMarketingSubCategoryTaxonomy(categoryId?: number): Promise<MarketingSubCategory[]> {
    const rows = await db.select().from(marketingSubCategoryTaxonomy)
      .where(categoryId !== undefined ? eq(marketingSubCategoryTaxonomy.categoryId, categoryId) : undefined)
      .orderBy(asc(marketingSubCategoryTaxonomy.name));
    return rows;
  }

  async createMarketingSubCategory(categoryId: number, name: string, icon?: string | null): Promise<MarketingSubCategory> {
    const [created] = await db.insert(marketingSubCategoryTaxonomy).values({ categoryId, name: name.trim(), icon: icon?.trim() || null }).returning();
    return created;
  }

  async updateMarketingSubCategory(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<MarketingSubCategory | undefined> {
    const [updated] = await db.update(marketingSubCategoryTaxonomy)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), ...(data.icon !== undefined ? { icon: data.icon?.trim() || null } : {}), updatedAt: new Date() })
      .where(eq(marketingSubCategoryTaxonomy.id, id)).returning();
    return updated;
  }

  async deleteMarketingSubCategory(id: number): Promise<void> {
    await db.delete(marketingSubCategoryTaxonomy).where(eq(marketingSubCategoryTaxonomy.id, id));
  }

  async getAvailableMarketingSubCategoryTaxonomy(categoryId?: number): Promise<MarketingSubCategory[]> {
    const rows = await this.getMarketingSubCategoryTaxonomy(categoryId);
    return rows.filter((item) => item.isActive && !item.isFrozen);
  }

  /** Self-healing one-time migration: an agency that has real (pre-existing)
   *  services but has never touched the new Business → Catégories tab gets its
   *  `selectedCategories` seeded from those services' real categories, the first
   *  time its mapping is ever read — never overwrites a real selection, never
   *  fabricates subcategories (there's no historical subcategory data to
   *  migrate). Without this, every agency that existed before this task would
   *  suddenly be unable to edit its own existing services (their categories
   *  wouldn't be in the new, empty-by-default selection yet). Mirrors the
   *  exact rationale/shape of migrateMarketingServicesIfNeeded above. */
  private async migrateMarketingCategoryMappingIfNeeded(marketingUserId: number): Promise<void> {
    const profile = await this.getMarketingProfile(marketingUserId);
    if (profile.selectedCategories.length > 0) return;
    const services = await db.select({ category: marketingServices.category })
      .from(marketingServices).where(eq(marketingServices.marketingUserId, marketingUserId));
    const categories = Array.from(new Set(services.map((s) => s.category).filter(Boolean)));
    if (!categories.length) return;
    await db.update(marketingProfiles).set({ selectedCategories: categories, updatedAt: new Date() }).where(eq(marketingProfiles.userId, marketingUserId));
  }

  async getMarketingCategoryMapping(marketingUserId: number): Promise<{ categories: string[]; subCategories: string[] }> {
    await this.migrateMarketingCategoryMappingIfNeeded(marketingUserId);
    const profile = await this.getMarketingProfile(marketingUserId);
    return { categories: profile.selectedCategories, subCategories: profile.selectedSubCategories };
  }

  /** Validates every submitted name against the ACTIVE admin taxonomy (an agency
   *  can never map an inactive/frozen or nonexistent category), and every
   *  subcategory against both the active taxonomy AND its declared parent
   *  category being one of the categories being mapped in the same call —
   *  silently drops anything invalid rather than erroring, and reports what was
   *  dropped so the route layer can surface it. Mirrors
   *  setPrinterCategoryMapping exactly. */
  async setMarketingCategoryMapping(marketingUserId: number, mapping: { categories: string[]; subCategories: string[] }): Promise<{ categories: string[]; subCategories: string[]; rejected: { categories: string[]; subCategories: string[] } }> {
    const [categoryTaxonomy, subCategoryTaxonomy] = await Promise.all([
      this.getMarketingTaxonomy(),
      this.getMarketingSubCategoryTaxonomy(),
    ]);
    const activeCategoryNames = new Set(categoryTaxonomy.filter((c) => c.isActive && !c.isFrozen).map((c) => c.name));
    const categoryByName = new Map(categoryTaxonomy.map((c) => [c.name, c] as const));

    const acceptedCategories = mapping.categories.filter((name) => activeCategoryNames.has(name));
    const rejectedCategories = mapping.categories.filter((name) => !activeCategoryNames.has(name));
    const acceptedCategorySet = new Set(acceptedCategories);

    const acceptedSubCategories = mapping.subCategories.filter((name) => {
      const sub = subCategoryTaxonomy.find((s) => s.name === name && s.isActive && !s.isFrozen);
      if (!sub) return false;
      const parent = Array.from(categoryByName.values()).find((c) => c.id === sub.categoryId);
      return !!parent && acceptedCategorySet.has(parent.name);
    });
    const rejectedSubCategories = mapping.subCategories.filter((name) => !acceptedSubCategories.includes(name));

    await this.upsertMarketingProfile(marketingUserId, { selectedCategories: acceptedCategories, selectedSubCategories: acceptedSubCategories });
    return {
      categories: acceptedCategories,
      subCategories: acceptedSubCategories,
      rejected: { categories: rejectedCategories, subCategories: rejectedSubCategories },
    };
  }

  async getMarketingAdminOverview(): Promise<any> {
    const taxonomy = await this.getMarketingTaxonomy();
    const subcategoryTaxonomy = await this.getMarketingSubCategoryTaxonomy();
    const accounts = await db.select({ profile: marketingProfiles, user: users })
      .from(marketingProfiles)
      .innerJoin(users, eq(marketingProfiles.userId, users.id))
      .where(eq(users.role, "MARKETING" as any));
    // Agency → Multiple Services (Part 10-11): Admin must see the real services belonging
    // to each agency, never a disconnected/duplicate model — same migration + real table
    // every other Marketing surface reads.
    for (const { profile } of accounts) await this.migrateMarketingServicesIfNeeded(profile.userId);
    const allServices = accounts.length
      ? await db.select().from(marketingServices).where(inArray(marketingServices.marketingUserId, accounts.map(({ profile }) => profile.userId)))
      : [];
    const servicesByAgency = new Map<number, MarketingService[]>();
    for (const service of allServices) {
      const list = servicesByAgency.get(service.marketingUserId) ?? [];
      list.push(service);
      servicesByAgency.set(service.marketingUserId, list);
    }
    const projects = await db.select().from(marketingProjects);
    const reviews = await db.select().from(supplierProductReviews).where(eq(supplierProductReviews.reviewType, "MARKETING"));
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((user) => [user.id, user]));
    const categoryCounts = new Map<string, number>();
    for (const row of accounts) for (const category of row.profile.categories) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
    const averageRating = reviews.length ? reviews.reduce((sum, row) => sum + row.rating, 0) / reviews.length : 0;
    const totalRevenueCents = projects.filter((p) => p.status === "COMPLETED").reduce((sum, p) => sum + (p.finalAmountInCents ?? 0), 0);
    return {
      stats: {
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter(({ user }) => user.status === "approved").length,
        visibleAccounts: accounts.filter(({ user, profile }) => user.status === "approved" && profile.marketplaceVisible).length,
        totalProjects: projects.length,
        pendingProjects: projects.filter((row) => row.status === "PENDING").length,
        activeProjects: projects.filter((row) => ["ACCEPTED", "IN_PROGRESS"].includes(row.status)).length,
        completedProjects: projects.filter((row) => row.status === "COMPLETED").length,
        cancelledProjects: projects.filter((row) => ["CANCELLED", "REJECTED"].includes(row.status)).length,
        reviewCount: reviews.length,
        averageRating,
        totalRevenueCents,
      },
      categories: Array.from(categoryCounts, ([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      taxonomy,
      subcategoryTaxonomy,
      accounts: accounts.map(({ profile, user }) => ({
        ...profile,
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImageUrl: user.profileImageUrl,
        coverImageUrl: user.coverImageUrl,
        status: user.status,
        location: user.locationAddress,
        initials: user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        services: servicesByAgency.get(user.id) ?? [],
      })),
      projects: projects
        .map((project) => ({
          ...project,
          marketingName: userMap.get(project.marketingUserId)?.name ?? "—",
          cafeOwner: userMap.get(project.cafeOwnerId)?.name ?? "—",
          ownerPhone: userMap.get(project.cafeOwnerId)?.phone ?? null,
        }))
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
      reviews: reviews.map((review) => ({
        ...review,
        marketingName: userMap.get(review.marketingUserId ?? 0)?.name ?? "—",
        reviewerName: userMap.get(review.cafeId)?.name ?? review.cafeName,
      })),
    };
  }

  // ── Entity-level Marketing reports ("Blacklist") — consolidated from
  // server/storage/domains/marketing-reports.storage.ts (Batch 18). ──────
  async createMarketingReport(cafeOwnerId: number, marketingUserId: number, reason: string, rating?: number): Promise<MarketingReport> {
    const [created] = await db.insert(marketingReports).values({ cafeOwnerId, marketingUserId, reason, rating: rating ?? null }).returning();
    return created;
  }

  async getMarketingReportById(id: number): Promise<MarketingReport | undefined> {
    const [row] = await db.select().from(marketingReports).where(eq(marketingReports.id, id));
    return row;
  }

  async getMarketingReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(MarketingReport & { cafeOwnerName: string; marketingName: string })[]> {
    const rows = await db.select().from(marketingReports)
      .where(status ? eq(marketingReports.status, status) : undefined)
      .orderBy(desc(marketingReports.createdAt));
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.marketingUserId])));
    const userMap = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name]));
    return rows.map((r) => ({ ...r, cafeOwnerName: userMap.get(r.cafeOwnerId) ?? "—", marketingName: userMap.get(r.marketingUserId) ?? "—" }));
  }

  async getMarketingReportsByOwner(cafeOwnerId: number): Promise<(MarketingReport & {
    marketingName: string; marketingProfileImageUrl: string | null; marketingLocation: string | null;
  })[]> {
    const rows = await db.select().from(marketingReports)
      .where(eq(marketingReports.cafeOwnerId, cafeOwnerId))
      .orderBy(desc(marketingReports.createdAt));
    if (rows.length === 0) return [];
    const marketingIds = Array.from(new Set(rows.map((r) => r.marketingUserId)));
    const rowsUsers = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl, locationAddress: users.locationAddress })
      .from(users).where(inArray(users.id, marketingIds));
    const map = new Map(rowsUsers.map((u) => [u.id, u]));
    return rows.map((r) => {
      const m = map.get(r.marketingUserId);
      return { ...r, marketingName: m?.name ?? "—", marketingProfileImageUrl: m?.profileImageUrl ?? null, marketingLocation: m?.locationAddress ?? null };
    });
  }

  async getPublishedMarketingReports(page = 1, limit = 10): Promise<{ reports: (Pick<MarketingReport, "id" | "marketingUserId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { marketingName: string; marketingProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const where = eq(marketingReports.status, "PUBLISHED");
    const [rows, [{ count }]] = await Promise.all([
      db.select({
        id: marketingReports.id, marketingUserId: marketingReports.marketingUserId,
        reason: marketingReports.reason, rating: marketingReports.rating,
        createdAt: marketingReports.createdAt, resolvedAt: marketingReports.resolvedAt,
      }).from(marketingReports).where(where)
        .orderBy(desc(marketingReports.resolvedAt))
        .limit(safeLimit).offset((safePage - 1) * safeLimit),
      db.select({ count: sql<number>`count(*)::int` }).from(marketingReports).where(where),
    ]);
    if (rows.length === 0) return { reports: [], total: count, page: safePage, limit: safeLimit };
    const marketingIds = Array.from(new Set(rows.map((r) => r.marketingUserId)));
    const rowsUsers = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl })
      .from(users).where(inArray(users.id, marketingIds));
    const map = new Map(rowsUsers.map((u) => [u.id, u]));
    const reports = rows.map((r) => {
      const m = map.get(r.marketingUserId);
      return { ...r, marketingName: m?.name ?? "—", marketingProfileImageUrl: m?.profileImageUrl ?? null };
    });
    return { reports, total: count, page: safePage, limit: safeLimit };
  }

  async resolveMarketingReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<MarketingReport | undefined> {
    const [updated] = await db.update(marketingReports)
      .set({ status, resolvedAt: new Date(), resolutionNote: resolutionNote ?? null, moderatedByAdminId: moderatedByAdminId ?? null })
      .where(eq(marketingReports.id, id))
      .returning();
    return updated;
  }

  // ── Messaging integration ──
  async refreshMarketingMessagingState(projectId: number): Promise<void> {
    const [project] = await db.select().from(marketingProjects).where(eq(marketingProjects.id, projectId));
    if (project) await this.facade.syncMessagingRelationship(project.cafeOwnerId, project.marketingUserId, "MARKETING");
  }
}
