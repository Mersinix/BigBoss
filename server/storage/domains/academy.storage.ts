import { db } from "../../db";
import { eq, and, inArray, desc, asc, sql, isNull, isNotNull } from "drizzle-orm";
import {
  academyProfiles, academyCourses, academyCourseSessions, academyRegistrations,
  academyFavorites, academyReports, users, supplierProductReviews,
  type AcademyProfile, type InsertAcademyProfile, type AcademyCourse, type InsertAcademyCourse,
  type AcademyCourseSession, type AcademyRegistration,
  type AcademyCourseCard, type AcademyRegistrationWithParties, type AcademyCourseSessionWithCourse,
  type AcademyRegistrationStatus, type AcademySessionStatus,
  type AcademyReport, type OpeningHoursMap,
  type SupplierProductReview,
} from "@shared/schema";
import type { DatabaseStorage } from "../../storage";

// Stage 2 — Batch 32: the COMPLETE Academy business domain, extracted
// into one file per the project's permanent "one business domain = one
// storage file" rule (adopted Batch 28, reapplied Batches 29/30/31 for
// Maintenance/Marketing/Print). Named `academy.storage.ts` to match the
// project's existing `<name>.storage.ts` convention (the task text said
// `academy-storage.ts` — the same naming slip already caught once for
// Barista and pre-empted since).
//
// No pre-existing Academy-specific storage file was found anywhere in
// the repository — like Print (Batch 31), this is a single-step
// extraction straight out of server/storage.ts, not a consolidation of
// a previously-extracted file plus new extraction.
//
// This covers: the company-level Academy profile (lazy-create-on-first-
// read, the pattern Print/Maintenance/Marketing's profiles all mirror),
// Courses ("Formations") CRUD + the public course listing/single-card
// derivations, two independent Favorites kinds (course-level and
// organisation-level, scoped by courseId NULL/NOT NULL — the same
// pattern Marketing's/Print's two Favorites kinds use), Entity-level
// "Blacklist" reports, Sessions ("Calendrier") CRUD + the
// Academy-level Profile card (which also folds in upcoming sessions)
// and the lightweight Academy "Store" card list, Registrations
// ("Inscriptions") — including the registrant-may-be-Coffee-Owner-OR-
// Barista-Marketplace distinction and its own explicit state-machine
// (PENDING → CONFIRMED/CANCELLED → COMPLETED, enforced via the
// ACADEMY_REGISTRATION_TRANSITIONS table, moved here as a private
// field alongside its one caller), Reviews (a live-computed rating via
// computeAcademyReviewStats — confirmed by reading the code, same
// architecture as Print, NOT a written/cached column), Revenue summary
// (distinguishes "booked"/CONFIRMED from "earned"/COMPLETED, same
// convention as Barista's), `refreshAcademyMessagingState` (confirmed,
// by direct reading, to already be physically INLINE within this
// section — unlike Maintenance's displaced equivalent, same as
// Marketing's/Print's), and the Admin aggregate overview.
//
// Explicitly investigated and confirmed NOT to overlap with Barista
// Marketplace: zero shared tables (grepped for
// baristaMarketplace*/baristaSkills/baristaWorkHistory/baristaJobPosts
// inside the original section — zero hits). Academy and Barista
// Marketplace are kept as separate domains, per the task's explicit
// instruction not to combine them just because both relate to
// coffee-training professionals.
//
// Has a facade constructor argument for exactly two legitimate
// cross-domain calls: getAcademyProfileCard's
// `this.facade.getUser(...)` (the not-yet-extracted User/Auth domain)
// and refreshAcademyMessagingState's
// `this.facade.syncMessagingRelationship(...)` (the not-yet-extracted
// Messaging domain).
export class AcademyStorage {
  constructor(private facade: DatabaseStorage) {}

  // ── Shared geo/location helpers — duplicated, not moved, per the
  // established Batch 24+ pattern: these also serve ~30 unrelated
  // marketplace-proximity methods elsewhere in server/storage.ts, so
  // they stay there too, byte-for-byte identical. ──────────────────────
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

  // ── Barista Academy ──────────────────────────────────────────────────────────
  // Mirrors the Barista Marketplace section above field-for-field — see the
  // architecture note on academyCourses/academyRegistrations in shared/schema.ts.

  async getAcademyProfile(userId: number): Promise<AcademyProfile> {
    const [profile] = await db.select().from(academyProfiles).where(eq(academyProfiles.userId, userId));
    if (profile) return profile;
    const [created] = await db.insert(academyProfiles).values({ userId }).onConflictDoNothing().returning();
    if (created) return created;
    const [existing] = await db.select().from(academyProfiles).where(eq(academyProfiles.userId, userId));
    return existing!;
  }

  async upsertAcademyProfile(userId: number, updates: Partial<InsertAcademyProfile>): Promise<AcademyProfile> {
    const current = await this.getAcademyProfile(userId);
    const [updated] = await db.update(academyProfiles)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(academyProfiles.id, current.id))
      .returning();
    return updated;
  }

  /** Admin ACADEMY drag-and-drop — mirrors bulkUpdateStoreOrder's independent-per-row pattern. */
  async bulkUpdateAcademyOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(async ({ id, displayOrder }) => {
      await this.getAcademyProfile(id); // lazy-create the row if it doesn't exist yet
      await db.update(academyProfiles).set({ displayOrder, updatedAt: new Date() }).where(eq(academyProfiles.userId, id));
    }));
  }

  /** Admin ACADEMY Auto Approve — mirrors setStoreAutoApprove. */
  async setAcademyAutoApprove(userId: number, autoApprove: boolean): Promise<AcademyProfile> {
    return this.upsertAcademyProfile(userId, { autoApprove });
  }

  // ── Courses ("Formations") ──
  async getAcademyCoursesForAcademy(academyUserId: number): Promise<AcademyCourse[]> {
    return db.select().from(academyCourses).where(eq(academyCourses.academyUserId, academyUserId)).orderBy(desc(academyCourses.createdAt));
  }

  async getAcademyCourseById(id: number): Promise<AcademyCourse | undefined> {
    const [row] = await db.select().from(academyCourses).where(eq(academyCourses.id, id));
    return row;
  }

  async createAcademyCourse(academyUserId: number, data: Partial<InsertAcademyCourse>): Promise<AcademyCourse> {
    const { academyUserId: _ignored, id: _ignoredId, ...safeData } = data as any;
    const [created] = await db.insert(academyCourses).values({
      ...safeData, academyUserId, isPublished: data.isPublished ?? false,
    } as any).returning();
    return created;
  }

  async updateAcademyCourse(id: number, academyUserId: number, data: Partial<InsertAcademyCourse>): Promise<AcademyCourse | undefined> {
    const { academyUserId: _ignored, id: _ignoredId, ...safeData } = data as any; // never let the owner be reassigned via update
    const [updated] = await db.update(academyCourses)
      .set({ ...safeData, updatedAt: new Date() })
      .where(and(eq(academyCourses.id, id), eq(academyCourses.academyUserId, academyUserId)))
      .returning();
    return updated;
  }

  async deleteAcademyCourse(id: number, academyUserId: number): Promise<void> {
    await db.delete(academyCourses).where(and(eq(academyCourses.id, id), eq(academyCourses.academyUserId, academyUserId)));
  }

  /** Live rating/reviewCount for one Academy — shared by the list builder and single-card reads. */
  private async computeAcademyReviewStats(academyUserIds: number[]): Promise<Map<number, { rating: number; reviewCount: number }>> {
    if (!academyUserIds.length) return new Map();
    const reviewRows = await db.select({
      academyUserId: supplierProductReviews.academyUserId,
      rating: supplierProductReviews.rating,
    }).from(supplierProductReviews).where(and(
      eq(supplierProductReviews.reviewType, "ACADEMY"),
      inArray(supplierProductReviews.academyUserId as any, academyUserIds),
    ));
    const sums = new Map<number, { total: number; sum: number }>();
    for (const row of reviewRows) {
      if (!row.academyUserId) continue;
      const current = sums.get(row.academyUserId) ?? { total: 0, sum: 0 };
      current.total += 1;
      current.sum += row.rating;
      sums.set(row.academyUserId, current);
    }
    const result = new Map<number, { rating: number; reviewCount: number }>();
    for (const [userId, stats] of Array.from(sums.entries())) {
      result.set(userId, { rating: Math.round((stats.sum / stats.total) * 10), reviewCount: stats.total });
    }
    return result;
  }

  /** Public /academy listing — mirrors getBaristaMarketplaceProfiles() exactly:
   *  only published courses from approved, marketplace-visible academies. */
  async getPublishedAcademyCourses(filters?: { search?: string; level?: string; certification?: boolean; viewerLocation?: { lat: string | null; lng: string | null } | null }): Promise<AcademyCourseCard[]> {
    const rows = await db.select({ course: academyCourses, user: users, profile: academyProfiles })
      .from(academyCourses)
      .innerJoin(users, eq(academyCourses.academyUserId, users.id))
      .leftJoin(academyProfiles, eq(academyProfiles.userId, academyCourses.academyUserId))
      .where(and(
        eq(academyCourses.isPublished, true),
        eq(users.role, "BARISTA_ACADEMY" as any),
        eq(users.status, "approved"),
      ));

    // GO Live (Phase 5E) — one more AND-gate: an academy not yet approved for
    // publication is excluded here too, alongside the existing marketplaceVisible check.
    const filteredRows = rows.filter(({ profile }) => profile?.marketplaceVisible !== false && profile?.publicationStatus === "APPROVED");
    const academyUserIds = Array.from(new Set(filteredRows.map(({ course }) => course.academyUserId)));
    const statsMap = await this.computeAcademyReviewStats(academyUserIds);
    const viewerPos = filters?.viewerLocation ? this.parseLatLng(filters.viewerLocation) : null;

    const cards = filteredRows.map(({ course, user, profile }) => {
      const stats = statsMap.get(course.academyUserId);
      const providerPos = this.parseLatLng({ lat: user.locationLat, lng: user.locationLng });
      const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
      return {
        ...course,
        academyName: user.name,
        academyLocation: this.formatPublicLocation(user),
        academyProfileImageUrl: user.profileImageUrl ?? null,
        flashImageUrl: user.flashImageUrl ?? null,
        academyDescription: profile?.description ?? "",
        academyPhone: user.phone ?? null,
        academyIsAvailable: profile ? !profile.isOnVacation : true,
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
        distanceKm,
      } as AcademyCourseCard;
    });

    const query = filters?.search?.trim().toLowerCase();
    return cards.filter((card) => {
      if (query) {
        const haystack = [card.title, card.description, card.academyName, card.category].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters?.level && card.level !== filters.level) return false;
      if (filters?.certification !== undefined && card.hasCertification !== filters.certification) return false;
      return true;
    });
  }

  async getAcademyCourseCard(id: number, viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<AcademyCourseCard | undefined> {
    const [row] = await db.select({ course: academyCourses, user: users, profile: academyProfiles })
      .from(academyCourses)
      .innerJoin(users, eq(academyCourses.academyUserId, users.id))
      .leftJoin(academyProfiles, eq(academyProfiles.userId, academyCourses.academyUserId))
      .where(eq(academyCourses.id, id));
    if (!row) return undefined;
    const stats = (await this.computeAcademyReviewStats([row.course.academyUserId])).get(row.course.academyUserId);
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const providerPos = this.parseLatLng({ lat: row.user.locationLat, lng: row.user.locationLng });
    const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
    return {
      ...row.course,
      academyName: row.user.name,
      academyLocation: this.formatPublicLocation(row.user),
      academyProfileImageUrl: row.user.profileImageUrl ?? null,
      flashImageUrl: row.user.flashImageUrl ?? null,
      academyDescription: row.profile?.description ?? "",
      academyPhone: row.user.phone ?? null,
      academyIsAvailable: row.profile ? !row.profile.isOnVacation : true,
      rating: stats?.rating ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
      distanceKm,
    };
  }

  // Academy favorites — course (item) rows have courseId set; organisation
  // (academyUserId) favorites have courseId NULL and academyUserId set instead
  // (docs/coffee_owner_favorites_marketplace_audit.md, Section 4).
  async getAcademyFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select({ courseId: academyFavorites.courseId })
      .from(academyFavorites)
      .where(and(eq(academyFavorites.userId, userId), isNotNull(academyFavorites.courseId)));
    return rows.map((row) => row.courseId as number);
  }

  async addAcademyFavorite(userId: number, courseId: number): Promise<void> {
    const [existing] = await db.select().from(academyFavorites).where(and(
      eq(academyFavorites.userId, userId),
      eq(academyFavorites.courseId, courseId),
    ));
    if (!existing) await db.insert(academyFavorites).values({ userId, courseId });
  }

  async removeAcademyFavorite(userId: number, courseId: number): Promise<void> {
    await db.delete(academyFavorites).where(and(
      eq(academyFavorites.userId, userId),
      eq(academyFavorites.courseId, courseId),
    ));
  }

  async getAcademyOrganisationFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select({ academyUserId: academyFavorites.academyUserId })
      .from(academyFavorites)
      .where(and(eq(academyFavorites.userId, userId), isNull(academyFavorites.courseId), isNotNull(academyFavorites.academyUserId)));
    return rows.map((row) => row.academyUserId as number);
  }

  async addAcademyOrganisationFavorite(userId: number, academyUserId: number): Promise<void> {
    const [existing] = await db.select().from(academyFavorites).where(and(
      eq(academyFavorites.userId, userId),
      eq(academyFavorites.academyUserId, academyUserId),
      isNull(academyFavorites.courseId),
    ));
    if (!existing) await db.insert(academyFavorites).values({ userId, academyUserId, courseId: null });
  }

  async removeAcademyOrganisationFavorite(userId: number, academyUserId: number): Promise<void> {
    await db.delete(academyFavorites).where(and(
      eq(academyFavorites.userId, userId),
      eq(academyFavorites.academyUserId, academyUserId),
      isNull(academyFavorites.courseId),
    ));
  }

  // Entity-level Academy reports ("Blacklist") — mirrors createMarketingReport/
  // getMarketingReportsByOwner/resolveMarketingReport exactly.
  async createAcademyReport(cafeOwnerId: number, academyUserId: number, reason: string, rating?: number): Promise<AcademyReport> {
    const [created] = await db.insert(academyReports).values({ cafeOwnerId, academyUserId, reason, rating: rating ?? null }).returning();
    return created;
  }

  async getAcademyReportById(id: number): Promise<AcademyReport | undefined> {
    const [row] = await db.select().from(academyReports).where(eq(academyReports.id, id));
    return row;
  }

  async getAcademyReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(AcademyReport & { cafeOwnerName: string; academyName: string })[]> {
    const rows = await db.select().from(academyReports)
      .where(status ? eq(academyReports.status, status) : undefined)
      .orderBy(desc(academyReports.createdAt));
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.academyUserId])));
    const userMap = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name]));
    return rows.map((r) => ({ ...r, cafeOwnerName: userMap.get(r.cafeOwnerId) ?? "—", academyName: userMap.get(r.academyUserId) ?? "—" }));
  }

  async getAcademyReportsByOwner(cafeOwnerId: number): Promise<(AcademyReport & {
    academyName: string; academyProfileImageUrl: string | null; academyLocation: string | null;
  })[]> {
    const rows = await db.select().from(academyReports)
      .where(eq(academyReports.cafeOwnerId, cafeOwnerId))
      .orderBy(desc(academyReports.createdAt));
    if (rows.length === 0) return [];
    const academyIds = Array.from(new Set(rows.map((r) => r.academyUserId)));
    const rowsUsers = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl, locationAddress: users.locationAddress })
      .from(users).where(inArray(users.id, academyIds));
    const map = new Map(rowsUsers.map((u) => [u.id, u]));
    return rows.map((r) => {
      const a = map.get(r.academyUserId);
      return { ...r, academyName: a?.name ?? "—", academyProfileImageUrl: a?.profileImageUrl ?? null, academyLocation: a?.locationAddress ?? null };
    });
  }

  async getPublishedAcademyReports(page = 1, limit = 10): Promise<{ reports: (Pick<AcademyReport, "id" | "academyUserId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { academyName: string; academyProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const where = eq(academyReports.status, "PUBLISHED");
    const [rows, [{ count }]] = await Promise.all([
      db.select({
        id: academyReports.id, academyUserId: academyReports.academyUserId,
        reason: academyReports.reason, rating: academyReports.rating,
        createdAt: academyReports.createdAt, resolvedAt: academyReports.resolvedAt,
      }).from(academyReports).where(where)
        .orderBy(desc(academyReports.resolvedAt))
        .limit(safeLimit).offset((safePage - 1) * safeLimit),
      db.select({ count: sql<number>`count(*)::int` }).from(academyReports).where(where),
    ]);
    if (rows.length === 0) return { reports: [], total: count, page: safePage, limit: safeLimit };
    const academyIds = Array.from(new Set(rows.map((r) => r.academyUserId)));
    const rowsUsers = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl })
      .from(users).where(inArray(users.id, academyIds));
    const map = new Map(rowsUsers.map((u) => [u.id, u]));
    const reports = rows.map((r) => {
      const a = map.get(r.academyUserId);
      return { ...r, academyName: a?.name ?? "—", academyProfileImageUrl: a?.profileImageUrl ?? null };
    });
    return { reports, total: count, page: safePage, limit: safeLimit };
  }

  async resolveAcademyReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<AcademyReport | undefined> {
    const [updated] = await db.update(academyReports)
      .set({ status, resolvedAt: new Date(), resolutionNote: resolutionNote ?? null, moderatedByAdminId: moderatedByAdminId ?? null })
      .where(eq(academyReports.id, id))
      .returning();
    return updated;
  }

  // ── Sessions ("Calendrier") ──
  async getAcademySessionsForCourse(courseId: number): Promise<AcademyCourseSession[]> {
    return db.select().from(academyCourseSessions).where(eq(academyCourseSessions.courseId, courseId)).orderBy(asc(academyCourseSessions.startDate));
  }

  async getAcademySessionsForAcademy(academyUserId: number): Promise<AcademyCourseSessionWithCourse[]> {
    const sessions = await db.select().from(academyCourseSessions).where(eq(academyCourseSessions.academyUserId, academyUserId)).orderBy(asc(academyCourseSessions.startDate));
    if (!sessions.length) return [];
    const courseIds = Array.from(new Set(sessions.map((s) => s.courseId)));
    const courses = await db.select().from(academyCourses).where(inArray(academyCourses.id, courseIds));
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const sessionIds = sessions.map((s) => s.id);
    const registrations = sessionIds.length
      ? await db.select({ sessionId: academyRegistrations.sessionId, participantCount: academyRegistrations.participantCount, status: academyRegistrations.status })
        .from(academyRegistrations)
        .where(inArray(academyRegistrations.sessionId, sessionIds))
      : [];
    const countMap = new Map<number, number>();
    for (const r of registrations) {
      if (!r.sessionId || r.status === "CANCELLED") continue;
      countMap.set(r.sessionId, (countMap.get(r.sessionId) ?? 0) + r.participantCount);
    }
    return sessions.map((s) => ({
      ...s,
      courseTitle: courseMap.get(s.courseId)?.title ?? "—",
      registeredCount: countMap.get(s.id) ?? 0,
    }));
  }

  /** Academy-level public/admin card — the single synchronized representation reused by
   *  the Coffee Owner's "click Académie inside a Formation" flow, Admin's Academy card, and
   *  the Academy's own Eye preview (Part 43's "one details modal per entity type"). Never a
   *  duplicate profile: built from the exact same academyProfiles/users/academyCourses/
   *  academyCourseSessions/supplierProductReviews rows every other Academy surface reads. */
  async getAcademyProfileCard(userId: number, viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<{
    userId: number; name: string; profileImageUrl: string | null; coverImageUrl: string | null; flashImageUrl: string | null; location: string; phone: string | null;
    description: string; marketplaceVisible: boolean; weeklyHours: OpeningHoursMap | null; isOnVacation: boolean;
    rating: number; reviewCount: number; portfolioImages: string[]; distanceKm?: number | null;
    courses: AcademyCourseCard[]; upcomingSessions: AcademyCourseSessionWithCourse[];
  } | undefined> {
    const user = await this.facade.getUser(userId);
    if (!user || user.role !== 'BARISTA_ACADEMY') return undefined;
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const providerPos = this.parseLatLng({ lat: user.locationLat, lng: user.locationLng });
    const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
    const [profile, allCourses, stats, allSessions] = await Promise.all([
      this.getAcademyProfile(userId),
      this.getAcademyCoursesForAcademy(userId),
      this.computeAcademyReviewStats([userId]),
      this.getAcademySessionsForAcademy(userId),
    ]);
    const publishedCourses = allCourses.filter((c) => c.isPublished);
    const courses: AcademyCourseCard[] = publishedCourses.map((course) => ({
      ...course,
      academyName: user.name,
      academyLocation: this.formatPublicLocation(user),
      academyProfileImageUrl: user.profileImageUrl ?? null,
      flashImageUrl: user.flashImageUrl ?? null,
      academyDescription: profile.description,
      academyPhone: user.phone ?? null,
      academyIsAvailable: !profile.isOnVacation,
      rating: stats.get(userId)?.rating ?? 0,
      reviewCount: stats.get(userId)?.reviewCount ?? 0,
    }));
    const publishedCourseIds = new Set(publishedCourses.map((c) => c.id));
    const now = new Date();
    const upcomingSessions = allSessions.filter((s) => publishedCourseIds.has(s.courseId) && new Date(s.startDate) >= now);
    return {
      userId: user.id,
      name: user.name,
      profileImageUrl: user.profileImageUrl ?? null,
      coverImageUrl: user.coverImageUrl ?? null,
      flashImageUrl: user.flashImageUrl ?? null,
      location: this.formatPublicLocation(user),
      phone: user.phone ?? null,
      description: profile.description,
      marketplaceVisible: profile.marketplaceVisible,
      weeklyHours: profile.weeklyHours ?? null,
      isOnVacation: profile.isOnVacation,
      rating: stats.get(userId)?.rating ?? 0,
      reviewCount: stats.get(userId)?.reviewCount ?? 0,
      portfolioImages: profile.portfolioImages ?? [],
      distanceKm,
      courses,
      upcomingSessions,
    };
  }

  /** Lightweight "Academy Store" list — one card per visible Academy with at
   *  least one published course, mirrors getPrintCompanyCards()'s role for
   *  Print Stores (docs/academy_store_mapping_audit.md). Reuses the exact
   *  same visibility gate getPublishedAcademyCourses already uses. No
   *  `websiteUrl` — academyProfiles has no such column. */
  async getAcademyCompanyCards(viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<{
    userId: number; name: string; profileImageUrl: string | null; coverImageUrl: string | null; flashImageUrl: string | null;
    location: string; phone: string | null; description: string; marketplaceVisible: boolean;
    weeklyHours: OpeningHoursMap | null; isOnVacation: boolean; rating: number; reviewCount: number;
    portfolioImages: string[]; courseCount: number; distanceKm?: number | null;
  }[]> {
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const courseRows = await db.select({ academyUserId: academyCourses.academyUserId })
      .from(academyCourses)
      .innerJoin(users, eq(academyCourses.academyUserId, users.id))
      .where(and(
        eq(academyCourses.isPublished, true),
        eq(users.role, "BARISTA_ACADEMY" as any),
        eq(users.status, "approved"),
      ));
    const countByAcademy = new Map<number, number>();
    for (const row of courseRows) countByAcademy.set(row.academyUserId, (countByAcademy.get(row.academyUserId) ?? 0) + 1);
    const academyIds = Array.from(countByAcademy.keys());
    if (academyIds.length === 0) return [];

    const [profileRows, userRows, statsMap] = await Promise.all([
      db.select().from(academyProfiles).where(inArray(academyProfiles.userId, academyIds)),
      db.select().from(users).where(inArray(users.id, academyIds)),
      this.computeAcademyReviewStats(academyIds),
    ]);
    const profileByUser = new Map(profileRows.map((p) => [p.userId, p]));
    const userById = new Map(userRows.map((u) => [u.id, u]));

    const cards: Awaited<ReturnType<typeof this.getAcademyCompanyCards>> = [];
    for (const academyId of academyIds) {
      const user = userById.get(academyId);
      const profile = profileByUser.get(academyId);
      if (!user || !profile) continue;
      if (profile.marketplaceVisible === false || profile.isFrozen || profile.publicationStatus !== "APPROVED") continue;
      const stats = statsMap.get(academyId);
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
        marketplaceVisible: profile.marketplaceVisible,
        weeklyHours: profile.weeklyHours ?? null,
        isOnVacation: profile.isOnVacation,
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
        portfolioImages: profile.portfolioImages ?? [],
        courseCount: countByAcademy.get(academyId) ?? 0,
        distanceKm,
      });
    }
    // Admin's drag-and-drop reorder (academyProfiles.displayOrder) is the single source
    // of truth for Store-card order here too — mirrors getVisibleStores()'s role for Supplier Stores.
    cards.sort((a, b) => (profileByUser.get(a.userId)?.displayOrder ?? 0) - (profileByUser.get(b.userId)?.displayOrder ?? 0) || a.userId - b.userId);
    return cards;
  }

  async createAcademySession(academyUserId: number, data: { courseId: number; startDate: string; endDate?: string | null; capacity?: number | null }): Promise<AcademyCourseSession> {
    const course = await this.getAcademyCourseById(data.courseId);
    if (!course || course.academyUserId !== academyUserId) throw new Error("Course not found");
    const [created] = await db.insert(academyCourseSessions).values({
      courseId: data.courseId,
      academyUserId,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      capacity: data.capacity ?? null,
      status: "UPCOMING",
    }).returning();
    return created;
  }

  async updateAcademySession(id: number, academyUserId: number, data: Partial<{ startDate: string; endDate: string | null; capacity: number | null; status: AcademySessionStatus }>): Promise<AcademyCourseSession | undefined> {
    const [updated] = await db.update(academyCourseSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(academyCourseSessions.id, id), eq(academyCourseSessions.academyUserId, academyUserId)))
      .returning();
    return updated;
  }

  async deleteAcademySession(id: number, academyUserId: number): Promise<void> {
    await db.delete(academyCourseSessions).where(and(eq(academyCourseSessions.id, id), eq(academyCourseSessions.academyUserId, academyUserId)));
  }

  // ── Registrations ("Inscriptions") ──
  private async attachRegistrationParties(rows: AcademyRegistration[]): Promise<AcademyRegistrationWithParties[]> {
    if (!rows.length) return [];
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.academyUserId])));
    const userMap = new Map((await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u]));
    const courseIds = Array.from(new Set(rows.map((r) => r.courseId)));
    const courseMap = new Map((await db.select().from(academyCourses).where(inArray(academyCourses.id, courseIds))).map((c) => [c.id, c]));
    const sessionIds = Array.from(new Set(rows.map((r) => r.sessionId).filter((id): id is number => id != null)));
    const sessionMap = sessionIds.length
      ? new Map((await db.select().from(academyCourseSessions).where(inArray(academyCourseSessions.id, sessionIds))).map((s) => [s.id, s]))
      : new Map<number, AcademyCourseSession>();
    return rows.map((r) => ({
      ...r,
      cafeOwnerName: userMap.get(r.cafeOwnerId)?.name ?? "—",
      academyName: userMap.get(r.academyUserId)?.name ?? "—",
      courseTitle: courseMap.get(r.courseId)?.title ?? "—",
      sessionStartDate: r.sessionId ? (sessionMap.get(r.sessionId)?.startDate ?? null) : null,
      sessionEndDate: r.sessionId ? (sessionMap.get(r.sessionId)?.endDate ?? null) : null,
    }));
  }

  async getAcademyRegistrationsForAcademy(academyUserId: number): Promise<AcademyRegistrationWithParties[]> {
    const rows = await db.select().from(academyRegistrations).where(eq(academyRegistrations.academyUserId, academyUserId)).orderBy(desc(academyRegistrations.createdAt));
    return this.attachRegistrationParties(rows);
  }

  async getAcademyRegistrationsForOwner(cafeOwnerId: number): Promise<AcademyRegistrationWithParties[]> {
    const rows = await db.select().from(academyRegistrations).where(eq(academyRegistrations.cafeOwnerId, cafeOwnerId)).orderBy(desc(academyRegistrations.createdAt));
    return this.attachRegistrationParties(rows);
  }

  /** Same underlying column/query as getAcademyRegistrationsForOwner — cafeOwnerId
   *  holds the registrant's user id regardless of participantType (see the note
   *  on academyRegistrations in shared/schema.ts). A separate method only for
   *  call-site clarity in the Barista Marketplace → Academy routes. */
  async getAcademyRegistrationsForBarista(baristaUserId: number): Promise<AcademyRegistrationWithParties[]> {
    const rows = await db.select().from(academyRegistrations).where(eq(academyRegistrations.cafeOwnerId, baristaUserId)).orderBy(desc(academyRegistrations.createdAt));
    return this.attachRegistrationParties(rows);
  }

  async getAcademyRegistrationById(id: number): Promise<AcademyRegistration | undefined> {
    const [row] = await db.select().from(academyRegistrations).where(eq(academyRegistrations.id, id));
    return row;
  }

  async createAcademyRegistration(registrantId: number, data: { courseId: number; sessionId?: number | null; participantCount?: number; participants?: string[]; notes?: string; participantType?: 'CAFE_OWNER' | 'BARISTA_MARKETPLACE' }): Promise<AcademyRegistration> {
    const course = await this.getAcademyCourseById(data.courseId);
    if (!course || !course.isPublished) throw new Error("This course is not available for registration");
    const [academyUser] = await db.select().from(users).where(eq(users.id, course.academyUserId));
    if (!academyUser || academyUser.status !== "approved") throw new Error("This academy is not available for registration");
    const profile = await this.getAcademyProfile(course.academyUserId);
    if (!profile.marketplaceVisible) throw new Error("This academy is not currently visible on the marketplace");

    const participantCount = Math.max(1, data.participantCount ?? 1);

    let session: AcademyCourseSession | undefined;
    if (data.sessionId != null) {
      const [s] = await db.select().from(academyCourseSessions).where(eq(academyCourseSessions.id, data.sessionId));
      if (!s || s.courseId !== data.courseId) throw new Error("Session not found for this course");
      if (s.status !== "UPCOMING") throw new Error("This session is no longer open for registration");
      const capacity = s.capacity ?? course.capacity;
      if (capacity != null) {
        const existing = await db.select({ participantCount: academyRegistrations.participantCount, status: academyRegistrations.status })
          .from(academyRegistrations)
          .where(eq(academyRegistrations.sessionId, s.id));
        const registered = existing.filter((r) => r.status !== "CANCELLED").reduce((sum, r) => sum + r.participantCount, 0);
        if (registered + participantCount > capacity) throw new Error("This session is fully booked");
      }
      session = s;
    }

    const [created] = await db.insert(academyRegistrations).values({
      courseId: data.courseId,
      sessionId: session?.id ?? null,
      academyUserId: course.academyUserId,
      cafeOwnerId: registrantId,
      participantType: data.participantType ?? 'CAFE_OWNER',
      participantCount,
      participants: data.participants ?? [],
      priceInCents: course.priceInCents * participantCount,
      notes: data.notes ?? "",
      status: "PENDING",
    }).returning();
    return created;
  }

  private readonly ACADEMY_REGISTRATION_TRANSITIONS: Record<AcademyRegistrationStatus, AcademyRegistrationStatus[]> = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["COMPLETED", "CANCELLED"],
    CANCELLED: [],
    COMPLETED: [],
  };

  async updateAcademyRegistrationStatus(id: number, actingUser: { id: number; role: string }, newStatus: AcademyRegistrationStatus): Promise<AcademyRegistration> {
    const [current] = await db.select().from(academyRegistrations).where(eq(academyRegistrations.id, id));
    if (!current) throw new Error("Registration not found");

    const allowed = this.ACADEMY_REGISTRATION_TRANSITIONS[current.status as AcademyRegistrationStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot move a registration from ${current.status} to ${newStatus}`);
    }

    const isAcademy = actingUser.role === "BARISTA_ACADEMY" && current.academyUserId === actingUser.id;
    // The registrant may be a Coffee Owner or a Barista Marketplace professional
    // (see participantType note on academyRegistrations in shared/schema.ts) —
    // either can cancel their own registration, matching whoever actually
    // created it rather than assuming CAFE_OWNER.
    const isRegistrant = (actingUser.role === "CAFE_OWNER" || actingUser.role === "BARISTA_MARKETPLACE") && current.cafeOwnerId === actingUser.id;
    if (newStatus === "CANCELLED") {
      if (!isAcademy && !isRegistrant) throw new Error("Only the academy or the registrant can cancel this registration");
    } else {
      // CONFIRMED / COMPLETED — only the academy advances these.
      if (!isAcademy) throw new Error("Only the academy can update this registration's status");
    }

    const updates: any = { status: newStatus, updatedAt: new Date() };
    if (newStatus === "CONFIRMED") updates.confirmedAt = new Date();
    if (newStatus === "CANCELLED") updates.cancelledAt = new Date();
    if (newStatus === "COMPLETED") updates.completedAt = new Date();

    const [updated] = await db.update(academyRegistrations)
      .set(updates)
      .where(and(eq(academyRegistrations.id, id), eq(academyRegistrations.status, current.status)))
      .returning();
    if (!updated) throw new Error("Registration status changed concurrently — please retry");
    return updated;
  }

  // Stage 2 — Batch 42: Academy's review CRUD (getAcademyReviews/
  // getAcademyReviewForRegistration/upsertAcademyReview) moved to
  // server/storage/domains/reviews.storage.ts (the cross-entity Reviews
  // domain) — see server/STORAGE_ARCHITECTURE.md ("Batch 42"). Every
  // other Academy method, including computeAcademyReviewStats (a
  // display-time concern, not review CRUD), is unaffected and stays
  // here unchanged.

  // ── Revenue — distinguishes "booked" (CONFIRMED, not yet delivered) from
  // "earned" (COMPLETED, training actually delivered) since no payment
  // processor exists — mirrors getBaristaRevenueSummary's own note exactly. ──
  async getAcademyRevenueSummary(academyUserId: number): Promise<{
    totalEarnedCents: number; completedRegistrations: number; currentMonthCents: number; currentMonthRegistrations: number;
    pendingCents: number; pendingRegistrations: number;
    history: { month: string; totalCents: number; registrations: number }[];
  }> {
    const rows = await db.select().from(academyRegistrations).where(eq(academyRegistrations.academyUserId, academyUserId));
    const completed = rows.filter((r) => r.status === "COMPLETED");
    const pending = rows.filter((r) => r.status === "CONFIRMED");
    const now = new Date();
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthKey = monthKey(now);

    const byMonth = new Map<string, { totalCents: number; registrations: number }>();
    let currentMonthCents = 0;
    let currentMonthRegistrations = 0;
    for (const r of completed) {
      const completedAt = r.completedAt ?? r.createdAt ?? now;
      const key = monthKey(new Date(completedAt));
      const bucket = byMonth.get(key) ?? { totalCents: 0, registrations: 0 };
      bucket.totalCents += r.priceInCents;
      bucket.registrations += 1;
      byMonth.set(key, bucket);
      if (key === currentMonthKey) { currentMonthCents += r.priceInCents; currentMonthRegistrations += 1; }
    }

    const history: { month: string; totalCents: number; registrations: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      const bucket = byMonth.get(key);
      history.push({ month: key, totalCents: bucket?.totalCents ?? 0, registrations: bucket?.registrations ?? 0 });
    }

    return {
      totalEarnedCents: completed.reduce((s, r) => s + r.priceInCents, 0),
      completedRegistrations: completed.length,
      currentMonthCents, currentMonthRegistrations,
      pendingCents: pending.reduce((s, r) => s + r.priceInCents, 0),
      pendingRegistrations: pending.length,
      history,
    };
  }

  // ── Messaging integration ──
  async refreshAcademyMessagingState(registrationId: number): Promise<void> {
    const [registration] = await db.select().from(academyRegistrations).where(eq(academyRegistrations.id, registrationId));
    if (registration) {
      await this.facade.syncMessagingRelationship(registration.cafeOwnerId, registration.academyUserId, "ACADEMY");
    }
  }

  // ── Admin aggregate overview — same philosophy as getBaristaAdminOverview/getPrintAdminOverview. ──
  async getAcademyAdminOverview(): Promise<any> {
    const academyUsers = await db.select().from(users).where(eq(users.role, "BARISTA_ACADEMY" as any));
    const profileRows = await db.select().from(academyProfiles);
    const profileByUserId = new Map(profileRows.map((p) => [p.userId, p]));
    const courseRows = await db.select().from(academyCourses).orderBy(desc(academyCourses.createdAt));
    const sessionRows = await db.select().from(academyCourseSessions).orderBy(asc(academyCourseSessions.startDate));
    const registrationRows = await db.select().from(academyRegistrations).orderBy(desc(academyRegistrations.createdAt));
    const reviewRows = await db.select().from(supplierProductReviews).where(eq(supplierProductReviews.reviewType, "ACADEMY"));
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const academyUserIds = academyUsers.map((u) => u.id);
    const statsMap = await this.computeAcademyReviewStats(academyUserIds);
    const courseMap = new Map(courseRows.map((c) => [c.id, c]));

    const academies = academyUsers.map((u) => {
      const profile = profileByUserId.get(u.id);
      const stats = statsMap.get(u.id);
      const ownCourses = courseRows.filter((c) => c.academyUserId === u.id);
      const ownRegistrations = registrationRows.filter((r) => r.academyUserId === u.id);
      const completedOwnRegistrations = ownRegistrations.filter((r) => r.status === "COMPLETED");
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? null,
        profileImageUrl: u.profileImageUrl ?? null,
        coverImageUrl: u.coverImageUrl ?? null,
        status: u.status,
        description: profile?.description ?? "",
        location: u.locationAddress ?? "",
        marketplaceVisible: profile?.marketplaceVisible ?? false,
        isFrozen: profile?.isFrozen ?? false,
        // GO Live review state (Phase 5D) — read by Admin ACADEMY's account detail
        // to show the status badge + Approve/Reject block, same as Maintenance/Printer.
        publicationStatus: profile?.publicationStatus ?? "DRAFT",
        publicationRejectionReason: profile?.publicationRejectionReason ?? null,
        displayOrder: profile?.displayOrder ?? 0,
        autoApprove: profile?.autoApprove ?? false,
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
        courseCount: ownCourses.length,
        publishedCourseCount: ownCourses.filter((c) => c.isPublished).length,
        registrationCount: ownRegistrations.length,
        completedRegistrationCount: completedOwnRegistrations.length,
        revenueCents: completedOwnRegistrations.reduce((s, r) => s + r.priceInCents, 0),
        createdAt: u.createdAt,
        initials: u.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      };
    });

    const courses = courseRows.map((c) => ({ ...c, academyName: userMap.get(c.academyUserId)?.name ?? "—" }));

    const registrations = await this.attachRegistrationParties(registrationRows);

    const sessions = sessionRows.map((s) => ({
      ...s,
      courseTitle: courseMap.get(s.courseId)?.title ?? "—",
      academyName: userMap.get(s.academyUserId)?.name ?? "—",
      registeredCount: registrationRows.filter((r) => r.sessionId === s.id && r.status !== "CANCELLED").reduce((sum, r) => sum + r.participantCount, 0),
    }));

    const reviews = reviewRows.map((r) => ({
      ...r,
      academyName: r.academyUserId ? (userMap.get(r.academyUserId)?.name ?? "—") : "—",
    }));

    const completedRegistrations = registrationRows.filter((r) => r.status === "COMPLETED");
    const pendingRegistrations = registrationRows.filter((r) => r.status === "PENDING");
    const confirmedRegistrations = registrationRows.filter((r) => r.status === "CONFIRMED");
    const totalReviewRating = reviewRows.reduce((s, r) => s + r.rating, 0);

    return {
      stats: {
        totalAcademies: academyUsers.length,
        activeAcademies: academyUsers.filter((u) => u.status === "approved").length,
        totalCourses: courseRows.length,
        publishedCourses: courseRows.filter((c) => c.isPublished).length,
        totalRegistrations: registrationRows.length,
        pendingRegistrations: pendingRegistrations.length,
        confirmedRegistrations: confirmedRegistrations.length,
        completedRegistrations: completedRegistrations.length,
        cancelledRegistrations: registrationRows.filter((r) => r.status === "CANCELLED").length,
        upcomingSessions: sessionRows.filter((s) => s.status === "UPCOMING").length,
        completedSessions: sessionRows.filter((s) => s.status === "COMPLETED").length,
        completedRegistrationValueCents: completedRegistrations.reduce((s, r) => s + r.priceInCents, 0),
        pendingRegistrationValueCents: confirmedRegistrations.reduce((s, r) => s + r.priceInCents, 0),
        reviewCount: reviewRows.length,
        averageRating: reviewRows.length ? Math.round((totalReviewRating / reviewRows.length) * 10) / 10 : 0,
      },
      academies,
      courses,
      registrations,
      sessions,
      reviews,
    };
  }
}
