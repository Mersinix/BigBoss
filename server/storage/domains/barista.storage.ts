import { db } from "../../db";
import { eq, and, inArray, desc, asc, sql } from "drizzle-orm";
import {
  baristaSkills, baristaMarketplaceProfiles, baristaMarketplaceRequests, baristaMarketplaceMissions, baristaMarketplaceFavorites,
  baristaWorkHistory, baristaReports,
  baristaEducationLevels, baristaLanguages,
  baristaJobPosts, baristaJobTargets, baristaJobApplications, baristaJobMeetings,
  users, supplierProductReviews,
  type BaristaSkill, type BaristaMarketplaceProfile, type InsertBaristaMarketplaceProfile,
  type BaristaMarketplaceRequest, type BaristaMarketplaceMission,
  type BaristaMarketplaceCard, type BaristaRequestWithParties, type BaristaMissionWithParties,
  type BaristaWorkHistory, type InsertBaristaWorkHistory,
  type BaristaReport,
  type BaristaEducationLevel, type BaristaLanguage,
  type BaristaJobPost, type InsertBaristaJobPost, type BaristaJobPostWithStats,
  type BaristaJobTarget, type BaristaJobApplication,
  type BaristaJobApplicationWithParties, type BaristaJobMeeting,
  type BaristaRequestStatus, type BaristaMissionStatus,
  type SupplierProductReview, type User,
} from "@shared/schema";
import type { DatabaseStorage } from "../../storage";

// Stage 2 — Batch 28: the COMPLETE Barista business domain, consolidated
// into one file per the project's permanent "one business domain = one
// storage file" rule (see server/STORAGE_ARCHITECTURE.md, "Business-Domain
// Storage Organization"). This merges:
//   (a) the previously-separate barista-taxonomy.storage.ts (Batch 18) —
//       Skills/Education Levels/Languages reference data, and
//   (b) the complete remaining Barista Marketplace implementation that was
//       still in server/storage.ts (Profile, Work History, Entity-level
//       Reports, Marketplace listing/card, Job posting system, Job
//       applications, Job meetings, Requests, Missions, Reviews, Revenue,
//       Messaging integration, Favorites, Admin aggregate overview).
//
// Deliberately NOT included (confirmed via source evidence, not the shared
// "Barista" word): Barista ACADEMY (a different professional-account type
// with its own tables/courses/sessions/registrations — zero table overlap
// with anything here) and `hasEligibleMessagingRelationship` (a Messaging-
// domain private helper that happens to read `baristaMarketplaceRequests`
// for one of its many service-specific branches — Messaging's own
// cross-cutting method, not Barista's).
//
// Cross-domain dependency: `refreshBaristaMessagingState` calls
// `syncMessagingRelationship` (public, not yet extracted, lives on
// DatabaseStorage) — reached via `this.facade.syncMessagingRelationship(...)`,
// a legitimate cross-domain call, same established pattern as
// PromotionsStorage/SupplierStoresStorage.
//
// `parseLatLng`/`haversineKm`/`formatPublicLocation` are duplicated here
// (not moved) — all three are shared, pure, side-effect-free helpers also
// used by ~20 other marketplace-proximity methods across Academy/
// Maintenance/Marketing/Print, still in server/storage.ts. The originals
// there are untouched.
//
// Transaction: `updateBaristaRequestStatus` opens its own self-contained
// `db.transaction(...)` (one of the project's 16 transaction sites). It
// never receives an external transaction client and never participates in
// another method's transaction, so moving it changes nothing about
// transaction behavior — `db.transaction` is a property of the shared `db`
// import, not of which file calls it.
export class BaristaStorage {
  constructor(private facade: DatabaseStorage) {}

  // ── Skills taxonomy ──
  async getBaristaSkills(activeOnly = false): Promise<BaristaSkill[]> {
    const rows = await db.select().from(baristaSkills).orderBy(asc(baristaSkills.name));
    return activeOnly ? rows.filter((s) => s.isActive && !s.isFrozen) : rows;
  }

  async createBaristaSkill(name: string, icon?: string | null): Promise<BaristaSkill> {
    const [created] = await db.insert(baristaSkills).values({ name: name.trim(), icon: icon?.trim() || null }).returning();
    return created;
  }

  async updateBaristaSkill(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaSkill | undefined> {
    const [updated] = await db.update(baristaSkills)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), ...(data.icon !== undefined ? { icon: data.icon?.trim() || null } : {}), updatedAt: new Date() })
      .where(eq(baristaSkills.id, id)).returning();
    return updated;
  }

  async deleteBaristaSkill(id: number): Promise<void> {
    await db.delete(baristaSkills).where(eq(baristaSkills.id, id));
  }

  // ── Niveau d'étude taxonomy — same CRUD shape as Skills above ──
  async getBaristaEducationLevels(activeOnly = false): Promise<BaristaEducationLevel[]> {
    const rows = await db.select().from(baristaEducationLevels).orderBy(asc(baristaEducationLevels.name));
    return activeOnly ? rows.filter((s) => s.isActive && !s.isFrozen) : rows;
  }
  async createBaristaEducationLevel(name: string): Promise<BaristaEducationLevel> {
    const [created] = await db.insert(baristaEducationLevels).values({ name: name.trim() }).returning();
    return created;
  }
  async updateBaristaEducationLevel(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaEducationLevel | undefined> {
    const [updated] = await db.update(baristaEducationLevels)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), updatedAt: new Date() })
      .where(eq(baristaEducationLevels.id, id)).returning();
    return updated;
  }
  async deleteBaristaEducationLevel(id: number): Promise<void> {
    await db.delete(baristaEducationLevels).where(eq(baristaEducationLevels.id, id));
  }

  // ── Langue taxonomy — same CRUD shape as Skills above ──
  async getBaristaLanguages(activeOnly = false): Promise<BaristaLanguage[]> {
    const rows = await db.select().from(baristaLanguages).orderBy(asc(baristaLanguages.name));
    return activeOnly ? rows.filter((s) => s.isActive && !s.isFrozen) : rows;
  }
  async createBaristaLanguage(name: string): Promise<BaristaLanguage> {
    const [created] = await db.insert(baristaLanguages).values({ name: name.trim() }).returning();
    return created;
  }
  async updateBaristaLanguage(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaLanguage | undefined> {
    const [updated] = await db.update(baristaLanguages)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), updatedAt: new Date() })
      .where(eq(baristaLanguages.id, id)).returning();
    return updated;
  }
  async deleteBaristaLanguage(id: number): Promise<void> {
    await db.delete(baristaLanguages).where(eq(baristaLanguages.id, id));
  }

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

  /** Public marketplace location label — "Municipalité, Gouvernorat" (or the closest
   *  available approximation) instead of the full street address, for every
   *  Coffee-Owner-facing card/Details Modal across Barista/Academy/Maintenance/
   *  Marketing/Print (the `location`/`printerLocation`/`academyLocation`/`agencyLocation`
   *  fields those card builders already return). The full geocoded
   *  users.locationAddress stays untouched and still used everywhere it needs to be
   *  (Settings, Business → Profil, Admin) — this only shapes what the PUBLIC
   *  representation shows, never a second location value. Prefers the account's own
   *  optional locationDetails.municipality/governorate (Settings → Localisation) when
   *  filled in; falls back to deriving a short label from the full address string
   *  otherwise, so accounts that haven't completed those optional fields yet still get
   *  a reasonable public label instead of leaking their full street address.
   */
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

  // ── Profile ──
  async getBaristaMarketplaceProfile(userId: number): Promise<BaristaMarketplaceProfile> {
    const [profile] = await db.select().from(baristaMarketplaceProfiles).where(eq(baristaMarketplaceProfiles.userId, userId));
    if (profile) return profile;
    const [created] = await db.insert(baristaMarketplaceProfiles).values({ userId }).onConflictDoNothing().returning();
    if (created) return created;
    // Lost a create race — re-read.
    const [existing] = await db.select().from(baristaMarketplaceProfiles).where(eq(baristaMarketplaceProfiles.userId, userId));
    return existing!;
  }

  async upsertBaristaMarketplaceProfile(userId: number, updates: Partial<InsertBaristaMarketplaceProfile>): Promise<BaristaMarketplaceProfile> {
    const current = await this.getBaristaMarketplaceProfile(userId);
    const [updated] = await db.update(baristaMarketplaceProfiles)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(baristaMarketplaceProfiles.id, current.id))
      .returning();
    return updated;
  }

  /** Admin BARISTA drag-and-drop — mirrors bulkUpdateStoreOrder's independent-per-row
   *  pattern, applied directly to the professional's own profile row (no Store). */
  async bulkUpdateBaristaOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(async ({ id, displayOrder }) => {
      await this.getBaristaMarketplaceProfile(id); // lazy-create the row if it doesn't exist yet
      await db.update(baristaMarketplaceProfiles).set({ displayOrder, updatedAt: new Date() }).where(eq(baristaMarketplaceProfiles.userId, id));
    }));
  }

  /** Admin BARISTA Auto Approve — mirrors setStoreAutoApprove, applied to the profile. */
  async setBaristaAutoApprove(userId: number, autoApprove: boolean): Promise<BaristaMarketplaceProfile> {
    return this.upsertBaristaMarketplaceProfile(userId, { autoApprove });
  }

  // ── Work history ("Cafés précédents / Expérience") — own table, own CRUD, exactly like
  // baristaSkills, so entries can be added/removed individually. ──────────────────────────

  async getBaristaWorkHistory(baristaUserId: number): Promise<BaristaWorkHistory[]> {
    const rows = await db.select().from(baristaWorkHistory).where(eq(baristaWorkHistory.baristaUserId, baristaUserId));
    return rows.sort((a, b) => (b.startPeriod > a.startPeriod ? 1 : -1));
  }

  async createBaristaWorkHistory(baristaUserId: number, data: Partial<InsertBaristaWorkHistory>): Promise<BaristaWorkHistory> {
    const { baristaUserId: _ignored, id: _id, ...safe } = data as any;
    const [created] = await db.insert(baristaWorkHistory).values({ ...safe, baristaUserId }).returning();
    return created;
  }

  async updateBaristaWorkHistory(id: number, baristaUserId: number, data: Partial<InsertBaristaWorkHistory>): Promise<BaristaWorkHistory | undefined> {
    const { baristaUserId: _ignored, id: _id, ...safe } = data as any;
    const [updated] = await db.update(baristaWorkHistory)
      .set({ ...safe, updatedAt: new Date() })
      .where(and(eq(baristaWorkHistory.id, id), eq(baristaWorkHistory.baristaUserId, baristaUserId)))
      .returning();
    return updated;
  }

  async deleteBaristaWorkHistory(id: number, baristaUserId: number): Promise<void> {
    await db.delete(baristaWorkHistory).where(and(eq(baristaWorkHistory.id, id), eq(baristaWorkHistory.baristaUserId, baristaUserId)));
  }

  // ── Entity-level Barista reports (Coffee Owner reporting a Barista account) —
  // distinct from review-reporting; resolved centrally by Admin. ─────────────────

  async createBaristaReport(cafeOwnerId: number, baristaUserId: number, reason: string, rating?: number): Promise<BaristaReport> {
    const [created] = await db.insert(baristaReports).values({ cafeOwnerId, baristaUserId, reason, rating: rating ?? null }).returning();
    return created;
  }

  async getBaristaReportById(id: number): Promise<BaristaReport | undefined> {
    const [row] = await db.select().from(baristaReports).where(eq(baristaReports.id, id));
    return row;
  }

  async getBaristaReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(BaristaReport & { cafeOwnerName: string; baristaName: string })[]> {
    const rows = await db.select().from(baristaReports)
      .where(status ? eq(baristaReports.status, status) : undefined)
      .orderBy(desc(baristaReports.createdAt));
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.baristaUserId])));
    const userMap = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name]));
    return rows.map((r) => ({ ...r, cafeOwnerName: userMap.get(r.cafeOwnerId) ?? "—", baristaName: userMap.get(r.baristaUserId) ?? "—" }));
  }

  // Public read (task: "Add a Grabber to the Maintenance Reports Modal and
  // Extend the Reporting System to Barista") — mirrors
  // getPublishedMaintenanceReports exactly: strictly status = PUBLISHED,
  // never the reporting cafeOwnerId/name, paginated.
  async getPublishedBaristaReports(page = 1, limit = 10): Promise<{ reports: (Pick<BaristaReport, "id" | "baristaUserId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { baristaName: string; baristaProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const where = eq(baristaReports.status, "PUBLISHED");
    const [rows, [{ count }]] = await Promise.all([
      db.select({
        id: baristaReports.id, baristaUserId: baristaReports.baristaUserId,
        reason: baristaReports.reason, rating: baristaReports.rating,
        createdAt: baristaReports.createdAt, resolvedAt: baristaReports.resolvedAt,
      }).from(baristaReports).where(where)
        .orderBy(desc(baristaReports.resolvedAt))
        .limit(safeLimit).offset((safePage - 1) * safeLimit),
      db.select({ count: sql<number>`count(*)::int` }).from(baristaReports).where(where),
    ]);
    if (rows.length === 0) return { reports: [], total: count, page: safePage, limit: safeLimit };
    const baristaIds = Array.from(new Set(rows.map((r) => r.baristaUserId)));
    const rowsUsers = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl })
      .from(users).where(inArray(users.id, baristaIds));
    const map = new Map(rowsUsers.map((u) => [u.id, u]));
    const reports = rows.map((r) => {
      const b = map.get(r.baristaUserId);
      return { ...r, baristaName: b?.name ?? "—", baristaProfileImageUrl: b?.profileImageUrl ?? null };
    });
    return { reports, total: count, page: safePage, limit: safeLimit };
  }

  // Coffee Owner's own "Blacklist" view (Part 18-21) — a scoped read of the same
  // baristaReports table above, filtered to reports THIS Coffee Owner submitted.
  // Not a second persistence layer: same rows Admin moderates, just narrowed by
  // cafeOwnerId server-side so one Coffee Owner never sees another's report text.
  async getBaristaReportsByOwner(cafeOwnerId: number): Promise<(BaristaReport & {
    baristaName: string; baristaProfileImageUrl: string | null; baristaLocation: string | null;
  })[]> {
    const rows = await db.select().from(baristaReports)
      .where(eq(baristaReports.cafeOwnerId, cafeOwnerId))
      .orderBy(desc(baristaReports.createdAt));
    if (rows.length === 0) return [];
    const baristaIds = Array.from(new Set(rows.map((r) => r.baristaUserId)));
    const baristaRows = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl, locationAddress: users.locationAddress })
      .from(users).where(inArray(users.id, baristaIds));
    const baristaMap = new Map(baristaRows.map((u) => [u.id, u]));
    return rows.map((r) => {
      const barista = baristaMap.get(r.baristaUserId);
      return { ...r, baristaName: barista?.name ?? "—", baristaProfileImageUrl: barista?.profileImageUrl ?? null, baristaLocation: barista?.locationAddress ?? null };
    });
  }

  async resolveBaristaReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<BaristaReport | undefined> {
    const [updated] = await db.update(baristaReports)
      .set({ status, resolvedAt: new Date(), resolutionNote: resolutionNote ?? null, moderatedByAdminId: moderatedByAdminId ?? null })
      .where(eq(baristaReports.id, id))
      .returning();
    return updated;
  }

  /** Live rating/reviewCount for one Barista — shared by the list builder and single-card reads. */
  private async computeBaristaReviewStats(baristaUserIds: number[]): Promise<Map<number, { rating: number; reviewCount: number }>> {
    if (!baristaUserIds.length) return new Map();
    const reviewRows = await db.select({
      baristaMarketplaceUserId: supplierProductReviews.baristaMarketplaceUserId,
      rating: supplierProductReviews.rating,
    }).from(supplierProductReviews).where(and(
      eq(supplierProductReviews.reviewType, "BARISTA_MARKETPLACE"),
      inArray(supplierProductReviews.baristaMarketplaceUserId as any, baristaUserIds),
    ));
    const sums = new Map<number, { total: number; sum: number }>();
    for (const row of reviewRows) {
      if (!row.baristaMarketplaceUserId) continue;
      const current = sums.get(row.baristaMarketplaceUserId) ?? { total: 0, sum: 0 };
      current.total += 1;
      current.sum += row.rating;
      sums.set(row.baristaMarketplaceUserId, current);
    }
    const result = new Map<number, { rating: number; reviewCount: number }>();
    for (const [userId, stats] of Array.from(sums.entries())) {
      result.set(userId, { rating: Math.round((stats.sum / stats.total) * 10), reviewCount: stats.total });
    }
    return result;
  }

  /** Public marketplace listing — mirrors getMaintenanceProfiles() exactly. */
  async getBaristaMarketplaceProfiles(filters?: {
    search?: string; level?: string; skill?: string; city?: string; available?: boolean;
    viewerLocation?: { lat?: string | null; lng?: string | null } | null;
  }): Promise<BaristaMarketplaceCard[]> {
    const rows = await db.select({ profile: baristaMarketplaceProfiles, user: users })
      .from(baristaMarketplaceProfiles)
      .innerJoin(users, eq(baristaMarketplaceProfiles.userId, users.id))
      .where(and(
        eq(users.role, "BARISTA_MARKETPLACE" as any),
        eq(users.status, "approved"),
        eq(baristaMarketplaceProfiles.marketplaceVisible, true),
        // GO Live (Phase 5E) — one more AND-gate, never a replacement.
        eq(baristaMarketplaceProfiles.publicationStatus, "APPROVED"),
      ));

    const userIds = rows.map(({ profile }) => profile.userId);
    const statsMap = await this.computeBaristaReviewStats(userIds);

    // "Available" on the public list means: not manually toggled off, not on vacation,
    // and not mid-mission right now (today falls within an ACTIVE mission's date range).
    // Fine-grained "are you free for MY specific dates" is checked server-side at request
    // creation/acceptance time (see createBaristaRequest/acceptBaristaRequest), not here.
    const todayStr = new Date().toISOString().slice(0, 10);
    const activeMissions = userIds.length
      ? await db.select({ baristaUserId: baristaMarketplaceMissions.baristaUserId, startDate: baristaMarketplaceMissions.startDate, endDate: baristaMarketplaceMissions.endDate })
        .from(baristaMarketplaceMissions)
        .where(and(
          inArray(baristaMarketplaceMissions.baristaUserId, userIds),
          eq(baristaMarketplaceMissions.status, "ACTIVE"),
        ))
      : [];
    const busyToday = new Set(
      activeMissions.filter((m) => m.startDate <= todayStr && (m.endDate ?? m.startDate) >= todayStr).map((m) => m.baristaUserId),
    );

    const workHistoryRows = userIds.length
      ? await db.select().from(baristaWorkHistory).where(inArray(baristaWorkHistory.baristaUserId, userIds))
      : [];
    const workHistoryByUser = new Map<number, BaristaWorkHistory[]>();
    for (const w of workHistoryRows) {
      const list = workHistoryByUser.get(w.baristaUserId) ?? [];
      list.push(w);
      workHistoryByUser.set(w.baristaUserId, list);
    }

    const viewerPos = filters?.viewerLocation ? this.parseLatLng(filters.viewerLocation) : null;

    const cards = rows.map(({ profile, user }) => {
      const stats = statsMap.get(profile.userId);
      const available = profile.isAvailable && !profile.isOnVacation && !busyToday.has(profile.userId);
      const baristaPos = this.parseLatLng({ lat: user.locationLat, lng: user.locationLng });
      const distanceKm = viewerPos && baristaPos ? Math.round(this.haversineKm(viewerPos, baristaPos) * 10) / 10 : null;
      return {
        ...profile,
        userId: user.id,
        name: user.name,
        phone: user.phone ?? null,
        profileImageUrl: user.profileImageUrl ?? null,
        // Flash image sync fix (flash_image_sync_audit.md) — this field was
        // missing from the public list, so the Coffee Owner's Fast Search
        // (fed by this list) could never show a barista's Flash image: every
        // card's flashImageUrl was silently undefined, making the client's
        // already-correct Flash-first logic always fall through to the
        // profile photo. getBaristaMarketplaceCard (the single-barista detail
        // endpoint) already included it — this just brings the list in line.
        flashImageUrl: user.flashImageUrl ?? null,
        // Same gap as above, for the Coffee Owner mapped card's Cover fallback
        // (analyse.md — image-mapping task) — getBaristaMarketplaceCard already had it.
        coverImageUrl: user.coverImageUrl ?? null,
        initials: user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        location: profile.city || this.formatPublicLocation(user),
        available,
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
        workHistory: (workHistoryByUser.get(profile.userId) ?? []).sort((a, b) => (b.startPeriod > a.startPeriod ? 1 : -1)),
        distanceKm,
      } as BaristaMarketplaceCard;
    });

    // Admin's drag-and-drop reorder (baristaMarketplaceProfiles.displayOrder) is the single
    // source of truth for this list's order too — mirrors getVisibleStores()'s role for
    // Supplier Stores. No Barista Store exists; the order lives directly on this profile row.
    cards.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.userId - b.userId);

    const query = filters?.search?.trim().toLowerCase();
    return cards.filter((card) => {
      if (query) {
        const haystack = [card.name, card.bio, card.location, card.skills.join(" ")].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters?.level && card.level !== filters.level) return false;
      if (filters?.skill && !card.skills.some((s) => s.toLowerCase() === filters.skill!.toLowerCase())) return false;
      if (filters?.city && card.location.toLowerCase() !== filters.city.toLowerCase()) return false;
      if (filters?.available !== undefined && card.available !== filters.available) return false;
      return true;
    });
  }

  async getBaristaMarketplaceCard(userId: number, viewerLocation?: { lat?: string | null; lng?: string | null } | null): Promise<BaristaMarketplaceCard | undefined> {
    const [row] = await db.select({ profile: baristaMarketplaceProfiles, user: users })
      .from(baristaMarketplaceProfiles)
      .innerJoin(users, eq(baristaMarketplaceProfiles.userId, users.id))
      .where(eq(baristaMarketplaceProfiles.userId, userId));
    if (!row) return undefined;
    const stats = (await this.computeBaristaReviewStats([userId])).get(userId);
    const workHistory = await db.select().from(baristaWorkHistory).where(eq(baristaWorkHistory.baristaUserId, userId));
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const baristaPos = this.parseLatLng({ lat: row.user.locationLat, lng: row.user.locationLng });
    const distanceKm = viewerPos && baristaPos ? Math.round(this.haversineKm(viewerPos, baristaPos) * 10) / 10 : null;
    return {
      ...row.profile,
      userId: row.user.id,
      name: row.user.name,
      phone: row.user.phone ?? null,
      profileImageUrl: row.user.profileImageUrl ?? null,
      coverImageUrl: row.user.coverImageUrl ?? null,
      flashImageUrl: row.user.flashImageUrl ?? null,
      initials: row.user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      location: row.profile.city || this.formatPublicLocation(row.user),
      available: row.profile.isAvailable && !row.profile.isOnVacation,
      workHistory: workHistory.sort((a, b) => (b.startPeriod > a.startPeriod ? 1 : -1)),
      distanceKm,
      rating: stats?.rating ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
    };
  }

  // ── Job posting system ──────────────────────────────────────────────────
  // Visibility is enforced here, never left to the frontend alone:
  //   AUTOMATIC + PUBLISHED + not expired → discoverable by every eligible barista
  //   MANUAL + PUBLISHED + not expired → discoverable only by specifically targeted baristas
  //   DRAFT / CLOSED / expired → never discoverable; only the owner (and Admin) can see them

  async createBaristaJobPost(cafeOwnerId: number, data: Partial<InsertBaristaJobPost>): Promise<BaristaJobPost> {
    const { cafeOwnerId: _ignored, id: _id, createdAt: _c, updatedAt: _u, ...safe } = data as any;
    const [created] = await db.insert(baristaJobPosts).values({ ...safe, cafeOwnerId }).returning();
    return created;
  }

  async updateBaristaJobPost(id: number, cafeOwnerId: number, data: Partial<InsertBaristaJobPost>): Promise<BaristaJobPost | undefined> {
    const { cafeOwnerId: _ignored, id: _id, createdAt: _c, updatedAt: _u, ...safe } = data as any;
    const [updated] = await db.update(baristaJobPosts)
      .set({ ...safe, updatedAt: new Date() })
      .where(and(eq(baristaJobPosts.id, id), eq(baristaJobPosts.cafeOwnerId, cafeOwnerId)))
      .returning();
    return updated;
  }

  async getBaristaJobPostById(id: number): Promise<BaristaJobPost | undefined> {
    const [row] = await db.select().from(baristaJobPosts).where(eq(baristaJobPosts.id, id));
    return row;
  }

  private async computeBaristaJobStats(jobPostIds: number[]): Promise<Map<number, { total: number; pending: number; preselected: number; rejected: number; targetCount: number }>> {
    const result = new Map<number, { total: number; pending: number; preselected: number; rejected: number; targetCount: number }>();
    if (!jobPostIds.length) return result;
    for (const id of jobPostIds) result.set(id, { total: 0, pending: 0, preselected: 0, rejected: 0, targetCount: 0 });
    const appRows = await db.select({ jobPostId: baristaJobApplications.jobPostId, status: baristaJobApplications.status })
      .from(baristaJobApplications).where(inArray(baristaJobApplications.jobPostId, jobPostIds));
    for (const row of appRows) {
      const s = result.get(row.jobPostId)!;
      s.total += 1;
      if (row.status === "PENDING") s.pending += 1;
      else if (row.status === "PRESELECTED") s.preselected += 1;
      else if (row.status === "REJECTED") s.rejected += 1;
    }
    const targetRows = await db.select({ jobPostId: baristaJobTargets.jobPostId })
      .from(baristaJobTargets).where(inArray(baristaJobTargets.jobPostId, jobPostIds));
    for (const row of targetRows) result.get(row.jobPostId)!.targetCount += 1;
    return result;
  }

  private attachJobStats(row: BaristaJobPost, s: { total: number; pending: number; preselected: number; rejected: number; targetCount: number } | undefined): BaristaJobPostWithStats {
    const stats = s ?? { total: 0, pending: 0, preselected: 0, rejected: 0, targetCount: 0 };
    return {
      ...row,
      totalApplications: stats.total,
      pendingApplications: stats.pending,
      preselectedApplications: stats.preselected,
      rejectedApplications: stats.rejected,
      processedApplications: stats.total - stats.pending,
      targetCount: stats.targetCount,
    };
  }

  async getBaristaJobPostsForOwner(cafeOwnerId: number, recordType?: "OFFER" | "MISSION"): Promise<BaristaJobPostWithStats[]> {
    const rows = await db.select().from(baristaJobPosts).where(and(
      eq(baristaJobPosts.cafeOwnerId, cafeOwnerId),
      recordType ? eq(baristaJobPosts.recordType, recordType) : undefined,
    )).orderBy(desc(baristaJobPosts.createdAt));
    const statsMap = await this.computeBaristaJobStats(rows.map((r) => r.id));
    return rows.map((r) => this.attachJobStats(r, statsMap.get(r.id)));
  }

  async getBaristaJobPostWithStats(id: number): Promise<BaristaJobPostWithStats | undefined> {
    const row = await this.getBaristaJobPostById(id);
    if (!row) return undefined;
    const statsMap = await this.computeBaristaJobStats([id]);
    return this.attachJobStats(row, statsMap.get(id));
  }

  // Automatic jobs eligible to every barista, UNION jobs this barista was specifically
  // targeted for (MANUAL) — both filtered to PUBLISHED and not expired. `isTargeted`
  // tells the client which kind this is so it can label manually-offered opportunities.
  async getDiscoverableBaristaJobPosts(baristaUserId: number, recordType?: "OFFER" | "MISSION"): Promise<(BaristaJobPost & { isTargeted: boolean })[]> {
    const now = new Date();
    const automatic = await db.select().from(baristaJobPosts).where(and(
      eq(baristaJobPosts.status, "PUBLISHED"),
      eq(baristaJobPosts.publicationMode, "AUTOMATIC"),
      recordType ? eq(baristaJobPosts.recordType, recordType) : undefined,
    ));
    const targetRows = await db.select({ jobPostId: baristaJobTargets.jobPostId }).from(baristaJobTargets).where(eq(baristaJobTargets.baristaUserId, baristaUserId));
    const targetedIds = targetRows.map((t) => t.jobPostId);
    const manual = targetedIds.length
      ? await db.select().from(baristaJobPosts).where(and(
          eq(baristaJobPosts.status, "PUBLISHED"),
          eq(baristaJobPosts.publicationMode, "MANUAL"),
          inArray(baristaJobPosts.id, targetedIds),
          recordType ? eq(baristaJobPosts.recordType, recordType) : undefined,
        ))
      : [];
    const notExpired = (j: BaristaJobPost) => !j.expiresAt || new Date(j.expiresAt as any) > now;
    return [
      ...automatic.filter(notExpired).map((j) => ({ ...j, isTargeted: false })),
      ...manual.filter(notExpired).map((j) => ({ ...j, isTargeted: true })),
    ];
  }

  async addBaristaJobTarget(jobPostId: number, baristaUserId: number): Promise<BaristaJobTarget> {
    const [created] = await db.insert(baristaJobTargets).values({ jobPostId, baristaUserId }).onConflictDoNothing().returning();
    if (created) return created;
    const [existing] = await db.select().from(baristaJobTargets).where(and(eq(baristaJobTargets.jobPostId, jobPostId), eq(baristaJobTargets.baristaUserId, baristaUserId)));
    return existing!;
  }

  async getBaristaJobTargets(jobPostId: number): Promise<(BaristaJobTarget & { baristaName: string; baristaProfileImageUrl: string | null })[]> {
    const rows = await db.select().from(baristaJobTargets).where(eq(baristaJobTargets.jobPostId, jobPostId)).orderBy(desc(baristaJobTargets.createdAt));
    if (!rows.length) return [];
    const userIds = rows.map((r) => r.baristaUserId);
    const userRows = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl }).from(users).where(inArray(users.id, userIds));
    const userMap = new Map(userRows.map((u) => [u.id, u]));
    return rows.map((r) => ({ ...r, baristaName: userMap.get(r.baristaUserId)?.name ?? "—", baristaProfileImageUrl: userMap.get(r.baristaUserId)?.profileImageUrl ?? null }));
  }

  async isBaristaJobTargeted(jobPostId: number, baristaUserId: number): Promise<boolean> {
    const [row] = await db.select({ id: baristaJobTargets.id }).from(baristaJobTargets).where(and(eq(baristaJobTargets.jobPostId, jobPostId), eq(baristaJobTargets.baristaUserId, baristaUserId)));
    return !!row;
  }

  // ── Job applications ──
  async createBaristaJobApplication(jobPostId: number, baristaUserId: number, message?: string | null): Promise<BaristaJobApplication> {
    const [created] = await db.insert(baristaJobApplications).values({ jobPostId, baristaUserId, message: message?.trim() || null }).returning();
    return created;
  }

  async getBaristaJobApplicationById(id: number): Promise<BaristaJobApplication | undefined> {
    const [row] = await db.select().from(baristaJobApplications).where(eq(baristaJobApplications.id, id));
    return row;
  }

  async hasBaristaAppliedToJob(jobPostId: number, baristaUserId: number): Promise<boolean> {
    const [row] = await db.select({ id: baristaJobApplications.id }).from(baristaJobApplications).where(and(eq(baristaJobApplications.jobPostId, jobPostId), eq(baristaJobApplications.baristaUserId, baristaUserId)));
    return !!row;
  }

  private async attachApplicationParties(rows: BaristaJobApplication[]): Promise<BaristaJobApplicationWithParties[]> {
    if (!rows.length) return [];
    const baristaIds = Array.from(new Set(rows.map((r) => r.baristaUserId)));
    const jobIds = Array.from(new Set(rows.map((r) => r.jobPostId)));
    const [baristaRows, jobRows, meetingRows] = await Promise.all([
      db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl }).from(users).where(inArray(users.id, baristaIds)),
      db.select().from(baristaJobPosts).where(inArray(baristaJobPosts.id, jobIds)),
      db.select().from(baristaJobMeetings).where(inArray(baristaJobMeetings.applicationId, rows.map((r) => r.id))),
    ]);
    const baristaMap = new Map(baristaRows.map((u) => [u.id, u]));
    const jobMap = new Map(jobRows.map((j) => [j.id, j]));
    const meetingMap = new Map(meetingRows.map((m) => [m.applicationId, m]));
    return rows.map((r) => ({
      ...r,
      baristaName: baristaMap.get(r.baristaUserId)?.name ?? "—",
      baristaProfileImageUrl: baristaMap.get(r.baristaUserId)?.profileImageUrl ?? null,
      jobTitle: jobMap.get(r.jobPostId)?.title ?? "—",
      establishment: jobMap.get(r.jobPostId)?.establishment ?? "",
      // Additive (Performance pages update) — lets the Barista's own
      // Dashboard/Analyses distinguish Offer vs Mission applications directly,
      // without the discover-endpoint cross-reference jobs.tsx's own
      // useMyJobApplicationsByType() uses (which mis-buckets an application
      // once its job post is no longer "discoverable", e.g. closed/expired).
      // Backward-compatible: existing consumers (job-management-modal.tsx)
      // simply ignore the extra field.
      recordType: jobMap.get(r.jobPostId)?.recordType ?? "OFFER",
      meeting: meetingMap.get(r.id) ?? null,
    }));
  }

  async getBaristaJobApplicationsForJob(jobPostId: number): Promise<BaristaJobApplicationWithParties[]> {
    const rows = await db.select().from(baristaJobApplications).where(eq(baristaJobApplications.jobPostId, jobPostId)).orderBy(desc(baristaJobApplications.createdAt));
    return this.attachApplicationParties(rows);
  }

  async getBaristaJobApplicationsForBarista(baristaUserId: number): Promise<BaristaJobApplicationWithParties[]> {
    const rows = await db.select().from(baristaJobApplications).where(eq(baristaJobApplications.baristaUserId, baristaUserId)).orderBy(desc(baristaJobApplications.createdAt));
    return this.attachApplicationParties(rows);
  }

  async updateBaristaJobApplicationStatus(id: number, status: string): Promise<BaristaJobApplication | undefined> {
    const [updated] = await db.update(baristaJobApplications).set({ status: status as any, updatedAt: new Date() }).where(eq(baristaJobApplications.id, id)).returning();
    return updated;
  }

  // ── Job meetings ──
  async upsertBaristaJobMeeting(applicationId: number, data: { scheduledAt: Date; notes?: string | null }): Promise<BaristaJobMeeting> {
    const existing = await this.getBaristaJobMeetingByApplication(applicationId);
    if (existing) {
      const [updated] = await db.update(baristaJobMeetings)
        .set({ scheduledAt: data.scheduledAt, notes: data.notes ?? null, status: "PROPOSED", updatedAt: new Date() })
        .where(eq(baristaJobMeetings.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(baristaJobMeetings).values({ applicationId, scheduledAt: data.scheduledAt, notes: data.notes ?? null }).returning();
    return created;
  }

  async updateBaristaJobMeetingStatus(id: number, status: string): Promise<BaristaJobMeeting | undefined> {
    const [updated] = await db.update(baristaJobMeetings).set({ status: status as any, updatedAt: new Date() }).where(eq(baristaJobMeetings.id, id)).returning();
    return updated;
  }

  async getBaristaJobMeetingByApplication(applicationId: number): Promise<BaristaJobMeeting | undefined> {
    const [row] = await db.select().from(baristaJobMeetings).where(eq(baristaJobMeetings.applicationId, applicationId));
    return row;
  }

  // ── Requests ──
  private attachRequestParties(rows: BaristaMarketplaceRequest[], userMap: Map<number, User>): BaristaRequestWithParties[] {
    return rows.map((r) => ({
      ...r,
      cafeOwnerName: userMap.get(r.cafeOwnerId)?.name ?? "—",
      cafeOwnerPhone: userMap.get(r.cafeOwnerId)?.phone ?? null,
      baristaName: userMap.get(r.baristaUserId)?.name ?? "—",
      baristaPhone: userMap.get(r.baristaUserId)?.phone ?? null,
    }));
  }

  async getBaristaRequestsForBarista(userId: number): Promise<BaristaRequestWithParties[]> {
    const rows = await db.select().from(baristaMarketplaceRequests)
      .where(eq(baristaMarketplaceRequests.baristaUserId, userId))
      .orderBy(desc(baristaMarketplaceRequests.createdAt));
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.baristaUserId])));
    const userMap = new Map((await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u]));
    return this.attachRequestParties(rows, userMap);
  }

  async getBaristaRequestsForOwner(userId: number): Promise<BaristaRequestWithParties[]> {
    const rows = await db.select().from(baristaMarketplaceRequests)
      .where(eq(baristaMarketplaceRequests.cafeOwnerId, userId))
      .orderBy(desc(baristaMarketplaceRequests.createdAt));
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.baristaUserId])));
    const userMap = new Map((await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u]));
    return this.attachRequestParties(rows, userMap);
  }

  async getBaristaRequestById(id: number): Promise<BaristaMarketplaceRequest | undefined> {
    const [row] = await db.select().from(baristaMarketplaceRequests).where(eq(baristaMarketplaceRequests.id, id));
    return row;
  }

  async createBaristaRequest(cafeOwnerId: number, data: {
    baristaUserId: number; missionType: string; message: string;
    proposedRateInCents?: number | null; startDate: string; endDate?: string | null;
  }): Promise<BaristaMarketplaceRequest> {
    const [target] = await db.select().from(users).where(eq(users.id, data.baristaUserId));
    if (!target || target.role !== "BARISTA_MARKETPLACE" || target.status !== "approved") {
      throw new Error("This Barista is not available for recruitment");
    }
    if (target.id === cafeOwnerId) throw new Error("You cannot recruit yourself");
    const profile = await this.getBaristaMarketplaceProfile(data.baristaUserId);
    if (!profile.marketplaceVisible) throw new Error("This Barista is not currently visible on the marketplace");

    // Integrate the new per-day schedule into the existing recruitment flow
    // (Barista availability update, Part 21) — a day marked Closed must never
    // be offered as if the Barista were working. Only enforced once a
    // weeklyHours schedule has actually been saved; additive, not a behavior
    // change for Baristas who haven't configured one yet.
    if (profile.weeklyHours) {
      const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
      const requestedDate = new Date(`${data.startDate}T00:00:00`);
      if (!Number.isNaN(requestedDate.getTime())) {
        const dayKey = WEEKDAY_KEYS[requestedDate.getDay()];
        if (profile.weeklyHours[dayKey]?.closed) {
          throw new Error("This Barista is closed on the selected start date");
        }
      }
    }

    // Duplicate-active-request guard: one cafe may not have more than one
    // open (PENDING/DISCUSSION) request against the same Barista at a time.
    const existingActive = await db.select().from(baristaMarketplaceRequests).where(and(
      eq(baristaMarketplaceRequests.cafeOwnerId, cafeOwnerId),
      eq(baristaMarketplaceRequests.baristaUserId, data.baristaUserId),
      inArray(baristaMarketplaceRequests.status, ["PENDING", "DISCUSSION"]),
    ));
    if (existingActive.length > 0) {
      throw new Error("You already have an open request with this Barista");
    }

    const [created] = await db.insert(baristaMarketplaceRequests).values({
      cafeOwnerId,
      baristaUserId: data.baristaUserId,
      missionType: data.missionType,
      message: data.message,
      proposedRateInCents: data.proposedRateInCents ?? profile.dailyRateInCents,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      status: "PENDING",
    }).returning();
    return created;
  }

  /** True if [startA,endA] and [startB,endB] (inclusive, endDate may equal startDate) overlap. */
  private dateRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    return startA <= endB && startB <= endA;
  }

  private readonly BARISTA_REQUEST_TRANSITIONS: Record<BaristaRequestStatus, BaristaRequestStatus[]> = {
    PENDING: ["DISCUSSION", "ACCEPTED", "REJECTED", "CANCELLED"],
    DISCUSSION: ["ACCEPTED", "REJECTED", "CANCELLED"],
    ACCEPTED: ["COMPLETED"],
    REJECTED: [],
    CANCELLED: [],
    COMPLETED: [],
  };

  /**
   * Applies a request status transition with full ownership + state-machine enforcement.
   * ACCEPTED atomically creates the mission (transaction) after checking the Barista has
   * no overlapping UPCOMING/ACTIVE mission for the requested dates — this is the
   * server-side overlap guard; the frontend never decides this.
   */
  async updateBaristaRequestStatus(
    requestId: number,
    actingUser: { id: number; role: string },
    newStatus: BaristaRequestStatus,
    extra?: { cancelReason?: string },
  ): Promise<{ request: BaristaMarketplaceRequest; mission: BaristaMarketplaceMission | null }> {
    const [current] = await db.select().from(baristaMarketplaceRequests).where(eq(baristaMarketplaceRequests.id, requestId));
    if (!current) throw new Error("Request not found");

    const allowed = this.BARISTA_REQUEST_TRANSITIONS[current.status as BaristaRequestStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot move a request from ${current.status} to ${newStatus}`);
    }

    const isBaristaStep = ["DISCUSSION", "ACCEPTED", "REJECTED"].includes(newStatus);
    if (isBaristaStep) {
      if (actingUser.role !== "BARISTA_MARKETPLACE" || current.baristaUserId !== actingUser.id) {
        throw new Error("Only the recruited Barista can respond to this request");
      }
    } else if (newStatus === "CANCELLED") {
      if (actingUser.role !== "CAFE_OWNER" || current.cafeOwnerId !== actingUser.id) {
        throw new Error("Only the requesting café can cancel this request");
      }
    }

    if (newStatus === "ACCEPTED") {
      const endDate = current.endDate ?? current.startDate;
      const overlapping = await db.select().from(baristaMarketplaceMissions).where(and(
        eq(baristaMarketplaceMissions.baristaUserId, current.baristaUserId),
        inArray(baristaMarketplaceMissions.status, ["UPCOMING", "ACTIVE"]),
      ));
      const conflict = overlapping.find((m) => this.dateRangesOverlap(current.startDate, endDate, m.startDate, m.endDate ?? m.startDate));
      if (conflict) {
        throw new Error(`You already have a mission booked from ${conflict.startDate} to ${conflict.endDate ?? conflict.startDate}`);
      }
    }

    return db.transaction(async (tx) => {
      const updates: any = { status: newStatus, updatedAt: new Date() };
      if (["ACCEPTED", "REJECTED"].includes(newStatus)) updates.respondedAt = new Date();
      if (newStatus === "CANCELLED" && extra?.cancelReason) updates.cancelReason = extra.cancelReason;

      const [row] = await tx.update(baristaMarketplaceRequests)
        .set(updates)
        .where(and(eq(baristaMarketplaceRequests.id, requestId), eq(baristaMarketplaceRequests.status, current.status)))
        .returning();
      if (!row) throw new Error("Request status changed concurrently — please retry");

      let mission: BaristaMarketplaceMission | null = null;
      if (newStatus === "ACCEPTED") {
        const [createdMission] = await tx.insert(baristaMarketplaceMissions).values({
          requestId: row.id,
          cafeOwnerId: row.cafeOwnerId,
          baristaUserId: row.baristaUserId,
          missionType: row.missionType,
          rateInCents: row.proposedRateInCents ?? 0,
          startDate: row.startDate,
          endDate: row.endDate,
          status: "UPCOMING",
        }).onConflictDoNothing().returning(); // requestId is unique — idempotent against duplicate accept calls
        mission = createdMission ?? null;
      }

      return { request: row, mission };
    });
  }

  // ── Missions ──
  private attachMissionParties(rows: BaristaMarketplaceMission[], userMap: Map<number, User>): BaristaMissionWithParties[] {
    return rows.map((m) => ({
      ...m,
      cafeOwnerName: userMap.get(m.cafeOwnerId)?.name ?? "—",
      baristaName: userMap.get(m.baristaUserId)?.name ?? "—",
    }));
  }

  async getBaristaMissionsForBarista(userId: number): Promise<BaristaMissionWithParties[]> {
    const rows = await db.select().from(baristaMarketplaceMissions)
      .where(eq(baristaMarketplaceMissions.baristaUserId, userId))
      .orderBy(desc(baristaMarketplaceMissions.createdAt));
    const userIds = Array.from(new Set(rows.flatMap((m) => [m.cafeOwnerId, m.baristaUserId])));
    const userMap = new Map((await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u]));
    return this.attachMissionParties(rows, userMap);
  }

  async getBaristaMissionsForOwner(userId: number): Promise<BaristaMissionWithParties[]> {
    const rows = await db.select().from(baristaMarketplaceMissions)
      .where(eq(baristaMarketplaceMissions.cafeOwnerId, userId))
      .orderBy(desc(baristaMarketplaceMissions.createdAt));
    const userIds = Array.from(new Set(rows.flatMap((m) => [m.cafeOwnerId, m.baristaUserId])));
    const userMap = new Map((await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u]));
    return this.attachMissionParties(rows, userMap);
  }

  async getBaristaMissionById(id: number): Promise<BaristaMarketplaceMission | undefined> {
    const [row] = await db.select().from(baristaMarketplaceMissions).where(eq(baristaMarketplaceMissions.id, id));
    return row;
  }

  private readonly BARISTA_MISSION_TRANSITIONS: Record<BaristaMissionStatus, BaristaMissionStatus[]> = {
    UPCOMING: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };

  async updateBaristaMissionStatus(missionId: number, actingUser: { id: number; role: string }, newStatus: BaristaMissionStatus): Promise<BaristaMarketplaceMission> {
    const [current] = await db.select().from(baristaMarketplaceMissions).where(eq(baristaMarketplaceMissions.id, missionId));
    if (!current) throw new Error("Mission not found");

    const allowed = this.BARISTA_MISSION_TRANSITIONS[current.status as BaristaMissionStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot move a mission from ${current.status} to ${newStatus}`);
    }

    const isBarista = actingUser.role === "BARISTA_MARKETPLACE" && current.baristaUserId === actingUser.id;
    const isOwner = actingUser.role === "CAFE_OWNER" && current.cafeOwnerId === actingUser.id;
    if (newStatus === "CANCELLED") {
      if (!isBarista && !isOwner) throw new Error("Only the Barista or the requesting café can cancel this mission");
      if (isOwner && current.status !== "UPCOMING") throw new Error("The café can only cancel a mission that hasn't started yet");
    } else {
      // ACTIVE / COMPLETED — only the Barista performing the work advances these.
      if (!isBarista) throw new Error("Only the assigned Barista can update this mission's progress");
    }

    const updates: any = { status: newStatus };
    if (newStatus === "COMPLETED") updates.completedAt = new Date();
    if (newStatus === "CANCELLED") updates.cancelledAt = new Date();

    const [updated] = await db.update(baristaMarketplaceMissions)
      .set(updates)
      .where(and(eq(baristaMarketplaceMissions.id, missionId), eq(baristaMarketplaceMissions.status, current.status)))
      .returning();
    if (!updated) throw new Error("Mission status changed concurrently — please retry");

    // Mirror the completion back onto the originating request for historical accuracy —
    // the request row is otherwise terminal at ACCEPTED (see BARISTA_REQUEST_TRANSITIONS).
    if (newStatus === "COMPLETED") {
      await db.update(baristaMarketplaceRequests)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(and(eq(baristaMarketplaceRequests.id, updated.requestId), eq(baristaMarketplaceRequests.status, "ACCEPTED")));
    }

    return updated;
  }

  // Stage 2 — Batch 42: Barista's review CRUD (getBaristaReviews/
  // getBaristaReviewForMission/upsertBaristaReview) moved to
  // server/storage/domains/reviews.storage.ts (the cross-entity Reviews
  // domain) — see server/STORAGE_ARCHITECTURE.md ("Batch 42"). Every
  // other Barista method, including computeBaristaReviewStats (a
  // display-time concern, not review CRUD), is unaffected and stays
  // here unchanged.

  // ── Revenue (read-only aggregation over completed missions — no payment system exists) ──
  async getBaristaRevenueSummary(baristaUserId: number): Promise<{
    totalEarnedCents: number;
    completedMissions: number;
    currentMonthCents: number;
    currentMonthMissions: number;
    history: { month: string; totalCents: number; missions: number }[];
  }> {
    const completed = await db.select().from(baristaMarketplaceMissions).where(and(
      eq(baristaMarketplaceMissions.baristaUserId, baristaUserId),
      eq(baristaMarketplaceMissions.status, "COMPLETED"),
    ));
    const now = new Date();
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthKey = monthKey(now);

    const byMonth = new Map<string, { totalCents: number; missions: number }>();
    let currentMonthCents = 0;
    let currentMonthMissions = 0;
    for (const m of completed) {
      const completedAt = m.completedAt ?? m.createdAt ?? now;
      const key = monthKey(new Date(completedAt));
      const bucket = byMonth.get(key) ?? { totalCents: 0, missions: 0 };
      bucket.totalCents += m.rateInCents;
      bucket.missions += 1;
      byMonth.set(key, bucket);
      if (key === currentMonthKey) { currentMonthCents += m.rateInCents; currentMonthMissions += 1; }
    }

    // Last 6 months, oldest first, zero-filled for months with no completed missions.
    const history: { month: string; totalCents: number; missions: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      const bucket = byMonth.get(key);
      history.push({ month: key, totalCents: bucket?.totalCents ?? 0, missions: bucket?.missions ?? 0 });
    }

    return {
      totalEarnedCents: completed.reduce((s, m) => s + m.rateInCents, 0),
      completedMissions: completed.length,
      currentMonthCents,
      currentMonthMissions,
      history,
    };
  }

  // ── Messaging integration ──
  async refreshBaristaMessagingState(requestId: number): Promise<void> {
    const [request] = await db.select().from(baristaMarketplaceRequests).where(eq(baristaMarketplaceRequests.id, requestId));
    if (request) {
      await this.facade.syncMessagingRelationship(request.cafeOwnerId, request.baristaUserId, "BARISTA");
    }
  }

  // ── Favorites — mirrors the Maintenance favorites methods exactly ──
  async getBaristaFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select({ baristaUserId: baristaMarketplaceFavorites.baristaUserId })
      .from(baristaMarketplaceFavorites)
      .where(eq(baristaMarketplaceFavorites.userId, userId));
    return rows.map((row) => row.baristaUserId);
  }

  async addBaristaFavorite(userId: number, baristaUserId: number): Promise<void> {
    const [existing] = await db.select().from(baristaMarketplaceFavorites).where(and(
      eq(baristaMarketplaceFavorites.userId, userId),
      eq(baristaMarketplaceFavorites.baristaUserId, baristaUserId),
    ));
    if (!existing) await db.insert(baristaMarketplaceFavorites).values({ userId, baristaUserId });
  }

  async removeBaristaFavorite(userId: number, baristaUserId: number): Promise<void> {
    await db.delete(baristaMarketplaceFavorites).where(and(
      eq(baristaMarketplaceFavorites.userId, userId),
      eq(baristaMarketplaceFavorites.baristaUserId, baristaUserId),
    ));
  }

  // ── Admin aggregate overview — same philosophy as getPrintAdminOverview:
  // one endpoint the client tabs/filters over, built entirely from the real
  // Barista Marketplace tables above (no duplicate/derived storage, no mock
  // data). Rating/reviewCount reuse computeBaristaReviewStats — the same live
  // computation the public marketplace and single-card reads already use, so
  // Admin, Coffee Owner and the Barista's own account always agree. ──────────
  async getBaristaAdminOverview(): Promise<any> {
    const skills = await this.getBaristaSkills(false);
    const baristaUsers = await db.select().from(users).where(eq(users.role, "BARISTA_MARKETPLACE" as any));
    const profileRows = await db.select().from(baristaMarketplaceProfiles);
    const profileByUserId = new Map(profileRows.map((p) => [p.userId, p]));
    const requestRows = await db.select().from(baristaMarketplaceRequests).orderBy(desc(baristaMarketplaceRequests.createdAt));
    const missionRows = await db.select().from(baristaMarketplaceMissions).orderBy(desc(baristaMarketplaceMissions.createdAt));
    const reviewRows = await db.select().from(supplierProductReviews).where(eq(supplierProductReviews.reviewType, "BARISTA_MARKETPLACE"));
    // Job posting system (Offres/Missions, Phase 9) — same underlying
    // baristaJobPosts/baristaJobApplications rows the Coffee Owner's own "Mes
    // offres d'emploi" modal and the Barista's "Offres"/"Missions" pages read;
    // read-only here, no parallel admin data source.
    const jobPostRows = await db.select().from(baristaJobPosts).orderBy(desc(baristaJobPosts.createdAt));
    const jobApplicationRows = await db.select().from(baristaJobApplications);
    const jobMeetingRows = await db.select().from(baristaJobMeetings);
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const baristaUserIds = baristaUsers.map((u) => u.id);
    const statsMap = await this.computeBaristaReviewStats(baristaUserIds);

    const baristas = baristaUsers.map((u) => {
      const profile = profileByUserId.get(u.id);
      const stats = statsMap.get(u.id);
      const ownMissions = missionRows.filter((m) => m.baristaUserId === u.id);
      const completedOwnMissions = ownMissions.filter((m) => m.status === "COMPLETED");
      const available = !!profile && profile.isAvailable && !profile.isOnVacation && profile.marketplaceVisible;
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? null,
        profileImageUrl: u.profileImageUrl ?? null,
        coverImageUrl: u.coverImageUrl ?? null,
        status: u.status,
        level: profile?.level ?? "BEGINNER",
        city: profile?.city || u.locationAddress || "",
        location: u.locationAddress ?? profile?.city ?? "",
        bio: profile?.bio ?? "",
        skills: profile?.skills ?? [],
        availableDays: profile?.availableDays ?? [],
        isAvailable: profile?.isAvailable ?? false,
        isOnVacation: profile?.isOnVacation ?? false,
        marketplaceVisible: profile?.marketplaceVisible ?? false,
        isFrozen: profile?.isFrozen ?? false,
        // GO Live (Phase 5D) — Admin's publication-review UI needs these to
        // show the status badge and the Approve/Reject controls.
        publicationStatus: profile?.publicationStatus ?? "DRAFT",
        publicationRejectionReason: profile?.publicationRejectionReason ?? null,
        displayOrder: profile?.displayOrder ?? 0,
        autoApprove: profile?.autoApprove ?? false,
        available,
        dailyRateInCents: profile?.dailyRateInCents ?? 0,
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
        requestCount: requestRows.filter((r) => r.baristaUserId === u.id).length,
        missionCount: ownMissions.length,
        completedMissionCount: completedOwnMissions.length,
        revenueCents: completedOwnMissions.reduce((s, m) => s + m.rateInCents, 0),
        // New job-posting system (mission-workflow cleanup) — the Admin
        // Baristas tab shows these instead of the legacy request/mission
        // counts above, which stay computed here (not deleted) but unused by
        // that tab now. See mission_workflow_cleanup_audit.md.
        jobApplicationCount: jobApplicationRows.filter((a) => a.baristaUserId === u.id).length,
        acceptedJobApplicationCount: jobApplicationRows.filter((a) => a.baristaUserId === u.id && a.status === "ACCEPTED").length,
        createdAt: u.createdAt,
        initials: u.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      };
    });

    const requests = requestRows.map((r) => ({
      ...r,
      cafeOwnerName: userMap.get(r.cafeOwnerId)?.name ?? "—",
      baristaName: userMap.get(r.baristaUserId)?.name ?? "—",
    }));

    const missions = missionRows.map((m) => ({
      ...m,
      cafeOwnerName: userMap.get(m.cafeOwnerId)?.name ?? "—",
      baristaName: userMap.get(m.baristaUserId)?.name ?? "—",
    }));

    const reviews = reviewRows.map((r) => ({
      ...r,
      baristaName: r.baristaMarketplaceUserId ? (userMap.get(r.baristaMarketplaceUserId)?.name ?? "—") : "—",
    }));

    const completedMissions = missionRows.filter((m) => m.status === "COMPLETED");
    const pendingMissions = missionRows.filter((m) => m.status === "UPCOMING" || m.status === "ACTIVE");
    const totalReviewRating = reviewRows.reduce((s, r) => s + r.rating, 0);

    // Job posting system (Phase 9) — read-only admin visibility, same rows
    // the Coffee Owner/Barista interfaces already manage. Offers and Missions
    // are counted separately (recordType), never merged into one bucket, and
    // applications are counted once each (no double-counting across statuses).
    const jobOfferRows = jobPostRows.filter((j) => j.recordType === "OFFER");
    const jobMissionRows = jobPostRows.filter((j) => j.recordType === "MISSION");
    const jobPosts = jobPostRows.map((j) => ({
      ...j,
      cafeOwnerName: userMap.get(j.cafeOwnerId)?.name ?? "—",
      applicationCount: jobApplicationRows.filter((a) => a.jobPostId === j.id).length,
    }));
    const jobPostRecordTypeById = new Map(jobPostRows.map((j) => [j.id, j.recordType]));
    // Lightweight (no message/PII) rows for Analytics' applications-over-time
    // trend and applications-by-status/record-type breakdown — same
    // jobApplicationRows counted in `stats` above, just not pre-aggregated.
    const jobApplications = jobApplicationRows.map((a) => ({
      id: a.id,
      jobPostId: a.jobPostId,
      recordType: jobPostRecordTypeById.get(a.jobPostId) ?? "OFFER",
      status: a.status,
      createdAt: a.createdAt,
    }));

    return {
      stats: {
        totalBaristas: baristaUsers.length,
        activeBaristas: baristaUsers.filter((u) => u.status === "approved").length,
        availableBaristas: baristas.filter((b) => b.available).length,
        totalRequests: requestRows.length,
        pendingRequests: requestRows.filter((r) => r.status === "PENDING" || r.status === "DISCUSSION").length,
        totalMissions: missionRows.length,
        completedMissions: completedMissions.length,
        cancelledMissions: missionRows.filter((m) => m.status === "CANCELLED").length,
        completedMissionValueCents: completedMissions.reduce((s, m) => s + m.rateInCents, 0),
        pendingMissionValueCents: pendingMissions.reduce((s, m) => s + m.rateInCents, 0),
        reviewCount: reviewRows.length,
        averageRating: reviewRows.length ? Math.round((totalReviewRating / reviewRows.length) * 10) / 10 : 0,
        totalJobOffers: jobOfferRows.length,
        publishedJobOffers: jobOfferRows.filter((j) => j.status === "PUBLISHED").length,
        totalJobMissions: jobMissionRows.length,
        publishedJobMissions: jobMissionRows.filter((j) => j.status === "PUBLISHED").length,
        totalJobApplications: jobApplicationRows.length,
        // Mission-workflow cleanup (new-system Analytics/KPIs) — see
        // mission_workflow_cleanup_audit.md. Counted from the same rows above,
        // never double-counted (one application = one row; one meeting = one
        // application via its unique applicationId).
        pendingJobApplications: jobApplicationRows.filter((a) => a.status === "PENDING").length,
        preselectedJobApplications: jobApplicationRows.filter((a) => a.status === "PRESELECTED").length,
        interviewScheduledJobApplications: jobApplicationRows.filter((a) => a.status === "INTERVIEW_SCHEDULED").length,
        acceptedJobApplications: jobApplicationRows.filter((a) => a.status === "ACCEPTED").length,
        rejectedJobApplications: jobApplicationRows.filter((a) => a.status === "REJECTED").length,
        applicationsToJobOffers: jobApplicationRows.filter((a) => jobOfferRows.some((j) => j.id === a.jobPostId)).length,
        applicationsToJobMissions: jobApplicationRows.filter((a) => jobMissionRows.some((j) => j.id === a.jobPostId)).length,
        scheduledInterviews: jobMeetingRows.filter((m) => m.status === "PROPOSED" || m.status === "CONFIRMED").length,
        closedJobOffers: jobOfferRows.filter((j) => j.status === "CLOSED").length,
        closedJobMissions: jobMissionRows.filter((j) => j.status === "CLOSED").length,
        draftJobOffers: jobOfferRows.filter((j) => j.status === "DRAFT").length,
        draftJobMissions: jobMissionRows.filter((j) => j.status === "DRAFT").length,
      },
      skills,
      baristas,
      requests,
      missions,
      reviews,
      jobPosts,
      jobApplications,
    };
  }
}
