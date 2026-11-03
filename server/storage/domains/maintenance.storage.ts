import { db } from "../../db";
import { eq, and, inArray, desc, asc, sql } from "drizzle-orm";
import { encodeMaintenanceSubSkillKey } from "@shared/maintenance-sub-skill-key";
import {
  maintenanceProfiles, maintenanceFavorites, maintenanceReservations,
  maintenanceCompetencies, maintenanceZones, maintenanceSubCompetencies, maintenanceReports,
  maintenanceJobPosts, maintenanceJobTargets, maintenanceJobApplications,
  users, supplierProductReviews,
  type MaintenanceProfile, type InsertMaintenanceProfile, type MaintenanceMarketplaceCard,
  type MaintenanceReservation, type InsertMaintenanceReservation,
  type MaintenanceCompetency, type MaintenanceZone, type MaintenanceSubCompetency,
  type MaintenanceJobPost, type InsertMaintenanceJobPost, type MaintenanceJobPostWithStats,
  type MaintenanceJobTarget, type MaintenanceJobApplication,
  type MaintenanceJobApplicationWithParties,
  type SupplierProductReview, type MaintenanceReport,
} from "@shared/schema";
import type { DatabaseStorage } from "../../storage";

// Stage 2 — Batch 29: the COMPLETE Maintenance business domain,
// consolidated into one file per the project's permanent "one business
// domain = one storage file" rule (see server/STORAGE_ARCHITECTURE.md,
// "Business-Domain Storage Organization", adopted Batch 28). Named
// `maintenance.storage.ts` (not the literally-named `maintenance-storage.ts`
// from the task text) to match the project's existing `<name>.storage.ts`
// convention — the same correction already made once for Barista in
// Batch 28.
//
// This merges:
//   (a) the previously-separate maintenance-reports.storage.ts (Batch 18) —
//       Entity-level "Blacklist" reports, and
//   (b) the complete remaining Maintenance Marketplace implementation that
//       was still in server/storage.ts (Profile, Reservations/reschedule
//       workflow, Reviews + the written rating-aggregate refresh, Taxonomy
//       [Competencies/Zones/SubCompetencies, including its own seed-on-empty
//       bootstrap], Admin aggregate overview, Favorites, the complete Job
//       Posting/"Interventions" system [eligibility, skill-matching, posts,
//       targets, applications, accept-creates-reservation]), plus
//       `refreshMaintenanceMessagingState`, which the monolith had
//       physically filed under a separate generic Messaging area despite
//       being entirely Maintenance-specific (reads `maintenanceReservations`,
//       calls `syncMessagingRelationship` with service "MAINTENANCE") — moved
//       here on the same business-ownership reasoning Batch 28 already
//       applied to `refreshBaristaMessagingState`.
//
// Deliberately NOT included: Barista/Barista Academy/Supplier/Delivery (zero
// table overlap, confirmed via full-repository grep), and the generic
// `deleteReview`/`getAllReviews`/etc. Reviews-domain methods (not yet
// extracted) — Maintenance is architecturally DIFFERENT from Barista here:
// it caches a written rating/reviewCount aggregate on `maintenanceProfiles`
// (refreshed by `refreshMaintenanceReviewStats`) rather than computing it
// live on every read. This is a genuine, confirmed business-logic
// difference, not an oversight, and is preserved exactly.
//
// Cross-domain dependencies:
//   - `refreshMaintenanceMessagingState` calls the already-public
//     `syncMessagingRelationship` (not yet extracted, lives on
//     DatabaseStorage) — reached via `this.facade.syncMessagingRelationship(...)`.
//   - The generic (not yet extracted) `deleteReview` method on
//     DatabaseStorage calls `refreshMaintenanceReviewStats` directly, to
//     keep Maintenance's cached rating aggregate in sync after an
//     admin-initiated review deletion. This is the REVERSE direction from
//     the facade pattern above — DatabaseStorage calling INTO this domain —
//     so `refreshMaintenanceReviewStats` is `public` here (was `private` on
//     DatabaseStorage; TypeScript's private/public distinction has no
//     runtime effect, so this is the minimal change needed to preserve that
//     one real external caller), and that call site now reads
//     `this.maintenanceDomain.refreshMaintenanceReviewStats(...)`.
//
// `parseLatLng`/`haversineKm`/`formatPublicLocation` are duplicated here
// (not moved) — all three are shared, pure, side-effect-free helpers also
// used by ~20 other marketplace-proximity methods across Barista/Academy/
// Marketing/Print, still in server/storage.ts. `encodeMaintenanceSubSkillKey`
// is a shared utility *module* (`@shared/maintenance-sub-skill-key`, not a
// storage.ts-internal function) — imported directly, no duplication needed.
//
// Transaction: zero. No method in this entire domain opens a
// `db.transaction(...)` (confirmed via a direct grep of the original
// section before extraction).
export class MaintenanceStorage {
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

  // ── Profile / Marketplace listing ──────────────────────────────────────────
  async getMaintenanceProfiles(filters?: {
    search?: string;
    category?: string;
    profileType?: string;
    available?: boolean;
    location?: string;
    viewerLocation?: { lat?: string | null; lng?: string | null } | null;
  }): Promise<MaintenanceMarketplaceCard[]> {
    const rows = await db.select({ profile: maintenanceProfiles, user: users })
      .from(maintenanceProfiles)
      .innerJoin(users, eq(maintenanceProfiles.userId, users.id))
      .where(and(
        eq(users.role, "MAINTENANCE" as any),
        eq(users.status, "approved"),
        eq(maintenanceProfiles.marketplaceVisible, true),
        eq(maintenanceProfiles.isOnVacation, false),
        eq(maintenanceProfiles.isFrozen, false),
        // GO Live (Phase 5E) — one more AND-gate alongside the existing ones
        // above, never a replacement: a profile stays hidden until BOTH an
        // admin has approved its content AND every pre-existing visibility
        // rule (marketplaceVisible/vacation/freeze) independently allows it.
        eq(maintenanceProfiles.publicationStatus, "APPROVED"),
      ));

    const maintenanceUserIds = rows.map(({ profile }) => profile.userId);
    const reviewRows = maintenanceUserIds.length
      ? await db.select({
          maintenanceUserId: supplierProductReviews.maintenanceUserId,
          rating: supplierProductReviews.rating,
        }).from(supplierProductReviews).where(and(
          eq(supplierProductReviews.reviewType, "MAINTENANCE"),
          inArray(supplierProductReviews.maintenanceUserId as any, maintenanceUserIds),
        ))
      : [];
    const reviewStats = new Map<number, { total: number; sum: number }>();
    for (const review of reviewRows) {
      if (!review.maintenanceUserId) continue;
      const current = reviewStats.get(review.maintenanceUserId) ?? { total: 0, sum: 0 };
      current.total += 1;
      current.sum += review.rating;
      reviewStats.set(review.maintenanceUserId, current);
    }

    const viewerPos = filters?.viewerLocation ? this.parseLatLng(filters.viewerLocation) : null;

    const cards = rows.map(({ profile, user }) => {
      const available = profile.isAvailable && !profile.isOnVacation;
      const location = this.formatPublicLocation(user) || profile.coverageArea || "";
      const stats = reviewStats.get(profile.userId);
      const workingHours = profile.workingDays.length
        ? `${profile.workingDays.join(", ")} · ${profile.startTime}–${profile.endTime}`
        : `${profile.startTime}–${profile.endTime}`;
      const providerPos = this.parseLatLng({ lat: user.locationLat, lng: user.locationLng });
      const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
      return {
        ...profile,
        rating: stats ? Math.round((stats.sum / stats.total) * 10) : 0,
        reviewCount: stats?.total ?? 0,
        name: user.name,
        phone: user.phone ?? null,
        profileImageUrl: user.profileImageUrl ?? null,
        // Flash image sync fix (docs/maintenance_flash_image_sync_audit.md) —
        // this field was missing from the Coffee Owner's own list endpoint,
        // so MaintenanceFastSearch could never show a provider's Flash
        // image: every card's flashImageUrl was silently undefined.
        // getMaintenanceCard (the single-provider detail endpoint, used by
        // this same provider's own self-preview) already included it — this
        // just brings the list in line, mirroring the identical fix already
        // applied to getBaristaMarketplaceProfiles.
        flashImageUrl: user.flashImageUrl ?? null,
        // Same gap as above, for the Coffee Owner detail modal's Cover image
        // (analyse.md — image-mapping task) — getMaintenanceCard already had it.
        coverImageUrl: user.coverImageUrl ?? null,
        location,
        initials: user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        available,
        type: profile.profileType,
        // profile.skills is the one authoritative competency field — see
        // maintenanceProfiles.categories's own schema comment (deprecated, no longer written).
        specialty: profile.skills[0] ?? "Maintenance",
        workingHours,
        distanceKm,
      } as MaintenanceMarketplaceCard;
    });

    // Admin's drag-and-drop reorder (maintenanceProfiles.displayOrder) is the single source
    // of truth for this list's order too — mirrors getVisibleStores()'s role for Supplier Stores.
    // No Maintenance Store exists; the order lives directly on this profile row.
    cards.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.userId - b.userId);

    const query = filters?.search?.trim().toLowerCase();
    return cards.filter((card) => {
      if (query) {
        const haystack = [
          card.name, card.jobTitle, card.description, card.location,
          card.categories.join(" "), card.skills.join(" "), card.coverageArea,
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters?.category && !card.categories.some((c) => c.toLowerCase() === filters.category!.toLowerCase())) return false;
      if (filters?.profileType && card.profileType !== filters.profileType) return false;
      if (filters?.available !== undefined && card.available !== filters.available) return false;
      if (filters?.location && card.location !== filters.location) return false;
      return true;
    });
  }

  async getMaintenanceCategories(): Promise<string[]> {
    const taxonomy = await this.getMaintenanceTaxonomy();
    const activeTaxonomy = taxonomy.competencies.filter((item) => item.isActive && !item.isFrozen);
    if (activeTaxonomy.length) return activeTaxonomy.map((item) => item.name);
    // Bootstrap fallback only (admin taxonomy completely empty) — reads profile.skills, the
    // one authoritative competency field, never the deprecated profile.categories duplicate.
    const rows = await db.select({ skills: maintenanceProfiles.skills })
      .from(maintenanceProfiles)
      .innerJoin(users, eq(maintenanceProfiles.userId, users.id))
      .where(and(
        eq(users.role, "MAINTENANCE" as any),
        eq(users.status, "approved"),
        eq(maintenanceProfiles.marketplaceVisible, true),
      ));
    return Array.from(new Set(rows.flatMap((row) => row.skills))).sort((a, b) => a.localeCompare(b));
  }

  async getMaintenanceProfile(userId: number): Promise<MaintenanceProfile> {
    const [profile] = await db.select().from(maintenanceProfiles)
      .where(eq(maintenanceProfiles.userId, userId));
    if (profile) return profile;
    const [created] = await db.insert(maintenanceProfiles).values({ userId }).returning();
    return created;
  }

  // Single-provider public card — sanitized shape used for the Coffee-Owner-
  // facing Details modal (Part 17), mirroring getBaristaMarketplaceCard exactly.
  async getMaintenanceCard(userId: number, viewerLocation?: { lat?: string | null; lng?: string | null } | null): Promise<MaintenanceMarketplaceCard | undefined> {
    const [row] = await db.select({ profile: maintenanceProfiles, user: users })
      .from(maintenanceProfiles)
      .innerJoin(users, eq(maintenanceProfiles.userId, users.id))
      .where(eq(maintenanceProfiles.userId, userId));
    if (!row) return undefined;
    const reviews = await db.select({ rating: supplierProductReviews.rating }).from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.reviewType, "MAINTENANCE"), eq(supplierProductReviews.maintenanceUserId as any, userId)));
    const rating = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) : 0;
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const providerPos = this.parseLatLng({ lat: row.user.locationLat, lng: row.user.locationLng });
    const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
    const workingHours = row.profile.workingDays.length
      ? `${row.profile.workingDays.join(", ")} · ${row.profile.startTime}–${row.profile.endTime}`
      : `${row.profile.startTime}–${row.profile.endTime}`;
    return {
      ...row.profile,
      userId: row.user.id,
      name: row.user.name,
      phone: row.user.phone ?? null,
      profileImageUrl: row.user.profileImageUrl ?? null,
      coverImageUrl: row.user.coverImageUrl ?? null,
      flashImageUrl: row.user.flashImageUrl ?? null,
      location: this.formatPublicLocation(row.user) || row.profile.coverageArea || "",
      initials: row.user.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      available: row.profile.isAvailable && !row.profile.isOnVacation,
      type: row.profile.profileType,
      // profile.skills is the one authoritative competency field — see
      // maintenanceProfiles.categories's own schema comment (deprecated, no longer written).
      specialty: row.profile.skills[0] ?? "Maintenance",
      workingHours,
      distanceKm,
      rating,
      reviewCount: reviews.length,
    };
  }

  async upsertMaintenanceProfile(userId: number, updates: Partial<InsertMaintenanceProfile>): Promise<MaintenanceProfile> {
    const current = await this.getMaintenanceProfile(userId);
    const [updated] = await db.update(maintenanceProfiles)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(maintenanceProfiles.id, current.id))
      .returning();
    return updated;
  }

  /** Admin MAINTENANCE drag-and-drop — mirrors bulkUpdateStoreOrder's independent-per-row
   *  pattern, applied directly to the professional's own profile row (no Store). */
  async bulkUpdateMaintenanceOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(async ({ id, displayOrder }) => {
      await this.getMaintenanceProfile(id); // lazy-create the row if it doesn't exist yet
      await db.update(maintenanceProfiles).set({ displayOrder, updatedAt: new Date() }).where(eq(maintenanceProfiles.userId, id));
    }));
  }

  /** Admin MAINTENANCE Auto Approve — mirrors setStoreAutoApprove, applied to the profile. */
  async setMaintenanceAutoApprove(userId: number, autoApprove: boolean): Promise<MaintenanceProfile> {
    return this.upsertMaintenanceProfile(userId, { autoApprove });
  }

  async getMaintenanceReservationsForProvider(userId: number): Promise<(MaintenanceReservation & { cafeOwner: string; ownerPhone: string | null })[]> {
    const rows = await db.select({ reservation: maintenanceReservations, owner: users })
      .from(maintenanceReservations)
      .innerJoin(users, eq(maintenanceReservations.cafeOwnerId, users.id))
      .where(eq(maintenanceReservations.maintenanceUserId, userId))
      .orderBy(asc(maintenanceReservations.date), asc(maintenanceReservations.time));
    return rows.map(({ reservation, owner }) => ({
      ...reservation,
      cafeOwner: owner.name,
      ownerPhone: owner.phone ?? null,
    }));
  }

  async getMaintenanceReservationsForOwner(userId: number): Promise<(MaintenanceReservation & { maintenanceName: string })[]> {
    const rows = await db.select({ reservation: maintenanceReservations, provider: users })
      .from(maintenanceReservations)
      .innerJoin(users, eq(maintenanceReservations.maintenanceUserId, users.id))
      .where(eq(maintenanceReservations.cafeOwnerId, userId))
      .orderBy(asc(maintenanceReservations.date), asc(maintenanceReservations.time));
    return rows.map(({ reservation, provider }) => ({
      ...reservation,
      maintenanceName: provider.name,
    }));
  }

  // Mirrors getAcademyRevenueSummary exactly (same COMPLETED-only "Total
  // gagné" / CONFIRMED-only "En attente" split, same 6-month history
  // bucketing). One real difference: maintenanceReservations has no
  // priceInCents captured per-booking (unlike academyRegistrations), so each
  // completed/pending reservation is valued at the provider's CURRENT
  // maintenanceProfiles.dailyRateInCents — a real, synchronized figure (the
  // same rate shown on Business → Profil), not a fabricated number. Because
  // the rate can change over time, this is presented to the client as an
  // estimate, not authoritative billing history — no completedAt column
  // exists on this table either, so updatedAt (set on every status change,
  // i.e. the COMPLETED/CONFIRMED transition itself) is used as the
  // completion-month proxy, same fallback chain shape as Academy's.
  async getMaintenanceRevenueSummary(maintenanceUserId: number): Promise<{
    totalEarnedCents: number; completedReservations: number; currentMonthCents: number; currentMonthReservations: number;
    pendingCents: number; pendingReservations: number; dailyRateInCents: number;
    history: { month: string; totalCents: number; reservations: number }[];
  }> {
    const [profile] = await db.select().from(maintenanceProfiles).where(eq(maintenanceProfiles.userId, maintenanceUserId));
    const rate = profile?.dailyRateInCents ?? 0;
    const rows = await db.select().from(maintenanceReservations).where(eq(maintenanceReservations.maintenanceUserId, maintenanceUserId));
    const completed = rows.filter((r) => r.status === "COMPLETED");
    const pending = rows.filter((r) => r.status === "CONFIRMED");
    const now = new Date();
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthKey = monthKey(now);

    const byMonth = new Map<string, { totalCents: number; reservations: number }>();
    let currentMonthCents = 0;
    let currentMonthReservations = 0;
    for (const r of completed) {
      const completedAt = r.updatedAt ?? r.createdAt ?? now;
      const key = monthKey(new Date(completedAt));
      const bucket = byMonth.get(key) ?? { totalCents: 0, reservations: 0 };
      bucket.totalCents += rate;
      bucket.reservations += 1;
      byMonth.set(key, bucket);
      if (key === currentMonthKey) { currentMonthCents += rate; currentMonthReservations += 1; }
    }

    const history: { month: string; totalCents: number; reservations: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      const bucket = byMonth.get(key);
      history.push({ month: key, totalCents: bucket?.totalCents ?? 0, reservations: bucket?.reservations ?? 0 });
    }

    return {
      totalEarnedCents: completed.length * rate,
      completedReservations: completed.length,
      currentMonthCents, currentMonthReservations,
      pendingCents: pending.length * rate,
      pendingReservations: pending.length,
      dailyRateInCents: rate,
      history,
    };
  }

  async createMaintenanceReservation(data: InsertMaintenanceReservation): Promise<MaintenanceReservation> {
    const [created] = await db.insert(maintenanceReservations).values(data as any).returning();
    return created;
  }

  // Coffee Owner self-service cancellation (Part 18) — only valid while the
  // Maintenance professional hasn't confirmed yet, matching the existing
  // status vocabulary exactly (PENDING → CANCELLED); no new state introduced.
  async cancelMaintenanceReservationByOwner(id: number, cafeOwnerId: number): Promise<MaintenanceReservation | undefined> {
    const [updated] = await db.update(maintenanceReservations)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(and(
        eq(maintenanceReservations.id, id),
        eq(maintenanceReservations.cafeOwnerId, cafeOwnerId),
        eq(maintenanceReservations.status, "PENDING"),
      ))
      .returning();
    return updated;
  }

  // Admin reservation management (Part 9) — unlike the provider-scoped
  // updateMaintenanceReservationStatus above, these are not ownership-scoped
  // since Admin acts on any reservation; EDIT still goes through the same
  // status vocabulary (no invalid transition is possible client-side beyond
  // what the existing enum allows), FREEZE only touches the new administrative
  // isFrozen flag (never the business status), DELETE is a genuine hard delete
  // gated by requireAdmin + a confirmation step client-side.
  async adminUpdateMaintenanceReservation(id: number, data: Partial<{
    service: string; date: string; time: string | null; location: string; description: string;
    category: string; urgency: string; contactPhone: string; status: string;
  }>): Promise<MaintenanceReservation | undefined> {
    const [updated] = await db.update(maintenanceReservations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(maintenanceReservations.id, id))
      .returning();
    return updated;
  }

  async setMaintenanceReservationFrozen(id: number, isFrozen: boolean): Promise<MaintenanceReservation | undefined> {
    const [updated] = await db.update(maintenanceReservations)
      .set({ isFrozen, updatedAt: new Date() })
      .where(eq(maintenanceReservations.id, id))
      .returning();
    return updated;
  }

  async deleteMaintenanceReservation(id: number): Promise<void> {
    await db.delete(maintenanceReservations).where(eq(maintenanceReservations.id, id));
  }

  async getMaintenanceReservationById(id: number): Promise<MaintenanceReservation | undefined> {
    const [row] = await db.select().from(maintenanceReservations).where(eq(maintenanceReservations.id, id));
    return row;
  }

  async updateMaintenanceReservationStatus(id: number, providerId: number, status: string, schedule?: { date?: string; time?: string | null }): Promise<MaintenanceReservation | undefined> {
    const [updated] = await db.update(maintenanceReservations)
      .set({ status, ...(schedule ?? {}), updatedAt: new Date() })
      .where(and(
        eq(maintenanceReservations.id, id),
        eq(maintenanceReservations.maintenanceUserId, providerId),
      ))
      .returning();
    return updated;
  }

  async requestMaintenanceReschedule(id: number, providerId: number, proposedDate: string, proposedTime: string | null): Promise<MaintenanceReservation | undefined> {
    const [updated] = await db.update(maintenanceReservations)
      .set({
        status: "RESCHEDULE_PENDING",
        proposedDate,
        proposedTime,
        updatedAt: new Date(),
      })
      .where(and(
        eq(maintenanceReservations.id, id),
        eq(maintenanceReservations.maintenanceUserId, providerId),
      ))
      .returning();
    return updated;
  }

  async respondToMaintenanceReschedule(id: number, ownerId: number, accepted: boolean): Promise<MaintenanceReservation | undefined> {
    const [reservation] = await db.select().from(maintenanceReservations)
      .where(and(
        eq(maintenanceReservations.id, id),
        eq(maintenanceReservations.cafeOwnerId, ownerId),
        eq(maintenanceReservations.status, "RESCHEDULE_PENDING"),
      ));
    if (!reservation) return undefined;

    const [updated] = await db.update(maintenanceReservations)
      .set({
        status: accepted ? "CONFIRMED" : "RESCHEDULE_REJECTED",
        ...(accepted && reservation.proposedDate
          ? { date: reservation.proposedDate, time: reservation.proposedTime }
          : {}),
        proposedDate: null,
        proposedTime: null,
        updatedAt: new Date(),
      })
      .where(eq(maintenanceReservations.id, id))
      .returning();
    return updated;
  }

  // Stage 2 — Batch 42: Maintenance's review CRUD (getMaintenanceReviews/
  // deleteMaintenanceReview/getMaintenanceReviewForReservation/
  // upsertMaintenanceReview) and its cached-rating refresh helper
  // (refreshMaintenanceReviewStats) moved to
  // server/storage/domains/reviews.storage.ts (the cross-entity Reviews
  // domain) — see server/STORAGE_ARCHITECTURE.md ("Batch 42"). Every
  // other Maintenance method (Profile, Taxonomy, Job workflows, Admin
  // overview, etc.) is unaffected and stays here unchanged.

  private async seedMaintenanceTaxonomyIfEmpty(): Promise<void> {
    const [competencyCount] = await db.select({ count: sql<number>`count(*)::int` }).from(maintenanceCompetencies);
    if (!competencyCount || competencyCount.count === 0) {
      // Bootstrap fallback only (taxonomy table completely empty) — seeds from
      // profile.skills, the one authoritative competency field, never the deprecated
      // profile.categories duplicate.
      const rows = await db.select({ skills: maintenanceProfiles.skills }).from(maintenanceProfiles);
      const names = Array.from(new Set(rows.flatMap((row) => row.skills ?? []).map((name) => name.trim()).filter(Boolean)));
      if (names.length) await db.insert(maintenanceCompetencies).values(names.map((name) => ({ name }))).onConflictDoNothing();
    }
    const [zoneCount] = await db.select({ count: sql<number>`count(*)::int` }).from(maintenanceZones);
    if (!zoneCount || zoneCount.count === 0) {
      const rows = await db.select({ coverageArea: maintenanceProfiles.coverageArea }).from(maintenanceProfiles);
      const names = Array.from(new Set(rows.flatMap((row) => (row.coverageArea ?? "").split(",")).map((name) => name.trim()).filter(Boolean)));
      if (names.length) await db.insert(maintenanceZones).values(names.map((name) => ({ name }))).onConflictDoNothing();
    }
  }

  async getMaintenanceTaxonomy(): Promise<{ competencies: MaintenanceCompetency[]; zones: MaintenanceZone[]; subCompetencies: MaintenanceSubCompetency[] }> {
    await this.seedMaintenanceTaxonomyIfEmpty();
    const [competencies, zones, subCompetencies] = await Promise.all([
      db.select().from(maintenanceCompetencies).orderBy(asc(maintenanceCompetencies.name)),
      db.select().from(maintenanceZones).orderBy(asc(maintenanceZones.name)),
      db.select().from(maintenanceSubCompetencies).orderBy(asc(maintenanceSubCompetencies.name)),
    ]);
    return { competencies, zones, subCompetencies };
  }

  async getAvailableMaintenanceTaxonomy(): Promise<{ competencies: MaintenanceCompetency[]; zones: MaintenanceZone[]; subCompetencies: MaintenanceSubCompetency[] }> {
    const taxonomy = await this.getMaintenanceTaxonomy();
    return {
      competencies: taxonomy.competencies.filter((item) => item.isActive && !item.isFrozen),
      zones: taxonomy.zones.filter((item) => item.isActive && !item.isFrozen),
      subCompetencies: taxonomy.subCompetencies.filter((item) => item.isActive && !item.isFrozen),
    };
  }

  async getMaintenanceSubCompetencies(competencyId?: number): Promise<MaintenanceSubCompetency[]> {
    return db.select().from(maintenanceSubCompetencies)
      .where(competencyId !== undefined ? eq(maintenanceSubCompetencies.competencyId, competencyId) : undefined)
      .orderBy(asc(maintenanceSubCompetencies.name));
  }

  async createMaintenanceSubCompetency(competencyId: number, name: string, icon?: string | null): Promise<MaintenanceSubCompetency> {
    const [created] = await db.insert(maintenanceSubCompetencies).values({ competencyId, name: name.trim(), icon: icon?.trim() || null }).returning();
    return created;
  }

  async updateMaintenanceSubCompetency(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceSubCompetency | undefined> {
    const [updated] = await db.update(maintenanceSubCompetencies)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), ...(data.icon !== undefined ? { icon: data.icon?.trim() || null } : {}), updatedAt: new Date() })
      .where(eq(maintenanceSubCompetencies.id, id)).returning();
    return updated;
  }

  async deleteMaintenanceSubCompetency(id: number): Promise<void> {
    await db.delete(maintenanceSubCompetencies).where(eq(maintenanceSubCompetencies.id, id));
  }

  async createMaintenanceCompetency(name: string, icon?: string | null): Promise<MaintenanceCompetency> {
    const [created] = await db.insert(maintenanceCompetencies).values({ name: name.trim(), icon: icon?.trim() || null }).returning();
    return created;
  }

  async updateMaintenanceCompetency(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceCompetency | undefined> {
    const [updated] = await db.update(maintenanceCompetencies)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), ...(data.icon !== undefined ? { icon: data.icon?.trim() || null } : {}), updatedAt: new Date() })
      .where(eq(maintenanceCompetencies.id, id)).returning();
    return updated;
  }

  async deleteMaintenanceCompetency(id: number): Promise<void> {
    await db.delete(maintenanceCompetencies).where(eq(maintenanceCompetencies.id, id));
  }

  async createMaintenanceZone(name: string): Promise<MaintenanceZone> {
    const [created] = await db.insert(maintenanceZones).values({ name: name.trim() }).returning();
    return created;
  }

  async updateMaintenanceZone(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceZone | undefined> {
    const [updated] = await db.update(maintenanceZones)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), updatedAt: new Date() })
      .where(eq(maintenanceZones.id, id)).returning();
    return updated;
  }

  async deleteMaintenanceZone(id: number): Promise<void> {
    await db.delete(maintenanceZones).where(eq(maintenanceZones.id, id));
  }

  async getMaintenanceAdminOverview(): Promise<any> {
    const taxonomy = await this.getMaintenanceTaxonomy();
    const accounts = await db.select({ profile: maintenanceProfiles, user: users })
      .from(maintenanceProfiles)
      .innerJoin(users, eq(maintenanceProfiles.userId, users.id))
      .where(eq(users.role, "MAINTENANCE" as any));
    const reservations = await db.select().from(maintenanceReservations);
    const reviews = await db.select().from(supplierProductReviews)
      .where(eq(supplierProductReviews.reviewType, "MAINTENANCE"));
    // Job posting system ("Interventions") — same underlying maintenanceJobPosts/
    // maintenanceJobApplications rows the Coffee Owner's own "Intervention"
    // modal and the Maintenance professional's "Interventions" page read;
    // read-only here, no parallel admin data source (mirrors
    // getBaristaAdminOverview's identical jobPosts/jobApplications fold-in —
    // see docs/maintenance_intervention_reservation_cleanup_audit.md).
    const jobPostRows = await db.select().from(maintenanceJobPosts).orderBy(desc(maintenanceJobPosts.createdAt));
    const jobApplicationRows = await db.select().from(maintenanceJobApplications);
    const jobTargetRows = await db.select().from(maintenanceJobTargets);
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((user) => [user.id, user]));
    // Reads profile.skills — the ONE authoritative Maintenance competency field (task:
    // "Remove Legacy Categories from Maintenance and Use Only Compétences"). profile.categories
    // is a deprecated, no-longer-written duplicate of this same selection (see
    // maintenanceProfiles.categories's own schema comment) — reading it here would make this
    // stat silently stop tracking new skill selections once accounts stop touching it.
    const categoryCounts = new Map<string, number>();
    for (const row of accounts) for (const skill of row.profile.skills) {
      categoryCounts.set(skill, (categoryCounts.get(skill) ?? 0) + 1);
    }
    const averageRating = reviews.length ? reviews.reduce((sum, row) => sum + row.rating, 0) / reviews.length : 0;

    // "En cours/Terminées/Annulées" for the Admin KPI row — an ACCEPTED
    // application's real-world state lives on its LINKED reservation, not on
    // the application's own PENDING/ACCEPTED/REJECTED status (Maintenance's
    // application lifecycle has no "en cours" of its own — see the prior
    // consolidation audit's Section 10). Computed here from the exact same
    // jobApplicationRows/reservations rows every other role-specific view
    // already reads — never a separate hardcoded counter (docs/maintenance_pricing_admin_performance_audit.md
    // Section 11).
    const reservationById = new Map(reservations.map((r) => [r.id, r]));
    const FINISHED_RESERVATION_STATUSES = new Set(["CONFIRMED", "RESCHEDULED", "RESCHEDULE_PENDING"]);
    let interventionsOngoing = 0, interventionsCompleted = 0, interventionsCancelled = 0;
    for (const app of jobApplicationRows) {
      if (app.status !== "ACCEPTED") continue;
      const reservation = app.reservationId != null ? reservationById.get(app.reservationId) : undefined;
      if (!reservation || reservation.status === "PENDING" || FINISHED_RESERVATION_STATUSES.has(reservation.status)) interventionsOngoing += 1;
      else if (reservation.status === "COMPLETED") interventionsCompleted += 1;
      else if (reservation.status === "CANCELLED") interventionsCancelled += 1;
    }

    const jobPosts = jobPostRows.map((j) => ({
      ...j,
      cafeOwnerName: userMap.get(j.cafeOwnerId)?.name ?? "—",
      totalApplications: jobApplicationRows.filter((a) => a.jobPostId === j.id).length,
      pendingApplications: jobApplicationRows.filter((a) => a.jobPostId === j.id && a.status === "PENDING").length,
      acceptedApplications: jobApplicationRows.filter((a) => a.jobPostId === j.id && a.status === "ACCEPTED").length,
      rejectedApplications: jobApplicationRows.filter((a) => a.jobPostId === j.id && a.status === "REJECTED").length,
      targetCount: jobTargetRows.filter((t) => t.jobPostId === j.id).length,
    }));
    // Lightweight rows (no message/PII) for any future Analytics breakdown —
    // same jobApplicationRows counted in `stats` below, just not pre-aggregated.
    const jobApplications = jobApplicationRows.map((a) => ({
      id: a.id,
      jobPostId: a.jobPostId,
      maintenanceUserId: a.maintenanceUserId,
      status: a.status,
      reservationId: a.reservationId,
      createdAt: a.createdAt,
    }));

    return {
      stats: {
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter(({ user }) => user.status === "approved").length,
        availableAccounts: accounts.filter(({ user, profile }) => user.status === "approved" && profile.isAvailable && !profile.isOnVacation).length,
        totalReservations: reservations.length,
        pendingReservations: reservations.filter((row) => row.status === "PENDING").length,
        completedReservations: reservations.filter((row) => row.status === "COMPLETED").length,
        cancelledReservations: reservations.filter((row) => row.status === "CANCELLED").length,
        reviewCount: reviews.length,
        averageRating,
        totalInterventions: jobPostRows.length,
        publishedInterventions: jobPostRows.filter((j) => j.status === "PUBLISHED").length,
        draftInterventions: jobPostRows.filter((j) => j.status === "DRAFT").length,
        closedInterventions: jobPostRows.filter((j) => j.status === "CLOSED").length,
        totalInterventionApplications: jobApplicationRows.length,
        pendingInterventionApplications: jobApplicationRows.filter((a) => a.status === "PENDING").length,
        acceptedInterventionApplications: jobApplicationRows.filter((a) => a.status === "ACCEPTED").length,
        rejectedInterventionApplications: jobApplicationRows.filter((a) => a.status === "REJECTED").length,
        interventionsOngoing,
        interventionsCompleted,
        interventionsCancelled,
      },
      categories: Array.from(categoryCounts, ([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      taxonomy,
      accounts: accounts.map(({ profile, user }) => ({
        ...profile,
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImageUrl: user.profileImageUrl,
        coverImageUrl: user.coverImageUrl ?? null,
        status: user.status,
        location: user.locationAddress ?? profile.coverageArea,
        available: profile.isAvailable && !profile.isOnVacation,
        initials: user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      })),
      reservations: reservations
        .map((reservation) => ({
          ...reservation,
          maintenanceName: userMap.get(reservation.maintenanceUserId)?.name ?? "—",
          cafeOwner: userMap.get(reservation.cafeOwnerId)?.name ?? "—",
          ownerPhone: userMap.get(reservation.cafeOwnerId)?.phone ?? null,
        }))
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
      reviews: reviews.map((review) => ({
        ...review,
        maintenanceName: userMap.get(review.maintenanceUserId ?? 0)?.name ?? "—",
        reviewerName: userMap.get(review.cafeId)?.name ?? review.cafeName,
      })),
      jobPosts,
      jobApplications,
    };
  }

  async getMaintenanceFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select({ maintenanceUserId: maintenanceFavorites.maintenanceUserId })
      .from(maintenanceFavorites)
      .where(eq(maintenanceFavorites.userId, userId));
    return rows.map((row) => row.maintenanceUserId);
  }

  async addMaintenanceFavorite(userId: number, maintenanceUserId: number): Promise<void> {
    const [existing] = await db.select().from(maintenanceFavorites).where(and(
      eq(maintenanceFavorites.userId, userId),
      eq(maintenanceFavorites.maintenanceUserId, maintenanceUserId),
    ));
    if (!existing) await db.insert(maintenanceFavorites).values({ userId, maintenanceUserId });
  }

  async removeMaintenanceFavorite(userId: number, maintenanceUserId: number): Promise<void> {
    await db.delete(maintenanceFavorites).where(and(
      eq(maintenanceFavorites.userId, userId),
      eq(maintenanceFavorites.maintenanceUserId, maintenanceUserId),
    ));
  }

  // ── Maintenance — Job posting system ("Interventions") — mirrors the
  // Barista job-posting block (createBaristaJobPost etc.) field-for-field;
  // see docs/maintenance_interventions_implementation_audit.md. ─────────────

  // Same visibility gate as getMaintenanceProfiles (Section 4 of the audit
  // doc) — reused here so job-post discovery/targeting never exposes an
  // unapproved, suspended, vacationing, or marketplace-hidden provider.
  async isMaintenanceProviderEligible(userId: number): Promise<boolean> {
    const [row] = await db.select({ id: users.id })
      .from(maintenanceProfiles)
      .innerJoin(users, eq(maintenanceProfiles.userId, users.id))
      .where(and(
        eq(maintenanceProfiles.userId, userId),
        eq(users.role, "MAINTENANCE" as any),
        eq(users.status, "approved"),
        eq(maintenanceProfiles.marketplaceVisible, true),
        eq(maintenanceProfiles.isOnVacation, false),
        eq(maintenanceProfiles.isFrozen, false),
        eq(maintenanceProfiles.publicationStatus, "APPROVED"),
      ));
    return !!row;
  }

  /**
   * Skill-matching gate — ADDITIONAL to isMaintenanceProviderEligible above (that one is
   * untouched; this is a separate, composable check). Used by both AUTOMATIC discovery
   * (getDiscoverableMaintenanceJobPosts) and MANUAL targeting
   * (POST /api/maintenance/jobs/:id/targets) so the two publication modes enforce the
   * exact same matching rule.
   *
   * An intervention has exactly one required parent category (job.categories[0] — the
   * "Fix Maintenance Sub-Skill Isolation..." task moved intervention creation to a
   * single-select parent, see maintenance-job-post-form-modal.tsx). A job with no
   * category at all always matches (nothing to require). Otherwise the provider must
   * have that parent in their own `skills`; if the job additionally requires specific
   * sub-skills, the provider must have EVERY one of them (not just one — "do not
   * silently weaken the requirements") under that SAME parent, checked via the same
   * parent-qualified key encodeMaintenanceSubSkillKey/decodeMaintenanceSubSkillKey uses
   * to store a provider's own subSkills (bug fix: a provider who has "Installation"
   * selected under an unrelated parent must not match a job requiring
   * "Caméras → Installation" merely because the label matches).
   */
  async isMaintenanceProviderSkillMatch(userId: number, job: { categories: string[]; subCategories: string[] }): Promise<boolean> {
    if (!job.categories.length) return true;
    const parent = job.categories[0];
    const profile = await this.getMaintenanceProfile(userId);
    if (!profile.skills.includes(parent)) return false;
    if (!job.subCategories.length) return true;
    return job.subCategories.every((subName) => profile.subSkills.includes(encodeMaintenanceSubSkillKey(parent, subName)));
  }

  async createMaintenanceJobPost(cafeOwnerId: number, data: Partial<InsertMaintenanceJobPost>): Promise<MaintenanceJobPost> {
    const { cafeOwnerId: _ignored, id: _id, createdAt: _c, updatedAt: _u, ...safe } = data as any;
    const [created] = await db.insert(maintenanceJobPosts).values({ ...safe, cafeOwnerId }).returning();
    return created;
  }

  async updateMaintenanceJobPost(id: number, cafeOwnerId: number, data: Partial<InsertMaintenanceJobPost>): Promise<MaintenanceJobPost | undefined> {
    const { cafeOwnerId: _ignored, id: _id, createdAt: _c, updatedAt: _u, ...safe } = data as any;
    const [updated] = await db.update(maintenanceJobPosts)
      .set({ ...safe, updatedAt: new Date() })
      .where(and(eq(maintenanceJobPosts.id, id), eq(maintenanceJobPosts.cafeOwnerId, cafeOwnerId)))
      .returning();
    return updated;
  }

  async getMaintenanceJobPostById(id: number): Promise<MaintenanceJobPost | undefined> {
    const [row] = await db.select().from(maintenanceJobPosts).where(eq(maintenanceJobPosts.id, id));
    return row;
  }

  private async computeMaintenanceJobStats(jobPostIds: number[]): Promise<Map<number, { total: number; pending: number; accepted: number; rejected: number; targetCount: number }>> {
    const result = new Map<number, { total: number; pending: number; accepted: number; rejected: number; targetCount: number }>();
    if (!jobPostIds.length) return result;
    for (const id of jobPostIds) result.set(id, { total: 0, pending: 0, accepted: 0, rejected: 0, targetCount: 0 });
    const appRows = await db.select({ jobPostId: maintenanceJobApplications.jobPostId, status: maintenanceJobApplications.status })
      .from(maintenanceJobApplications).where(inArray(maintenanceJobApplications.jobPostId, jobPostIds));
    for (const row of appRows) {
      const s = result.get(row.jobPostId)!;
      s.total += 1;
      if (row.status === "PENDING") s.pending += 1;
      else if (row.status === "ACCEPTED") s.accepted += 1;
      else if (row.status === "REJECTED") s.rejected += 1;
    }
    const targetRows = await db.select({ jobPostId: maintenanceJobTargets.jobPostId })
      .from(maintenanceJobTargets).where(inArray(maintenanceJobTargets.jobPostId, jobPostIds));
    for (const row of targetRows) result.get(row.jobPostId)!.targetCount += 1;
    return result;
  }

  private attachMaintenanceJobStats(row: MaintenanceJobPost, s: { total: number; pending: number; accepted: number; rejected: number; targetCount: number } | undefined): MaintenanceJobPostWithStats {
    const stats = s ?? { total: 0, pending: 0, accepted: 0, rejected: 0, targetCount: 0 };
    return {
      ...row,
      totalApplications: stats.total,
      pendingApplications: stats.pending,
      acceptedApplications: stats.accepted,
      rejectedApplications: stats.rejected,
      targetCount: stats.targetCount,
    };
  }

  async getMaintenanceJobPostsForOwner(cafeOwnerId: number): Promise<MaintenanceJobPostWithStats[]> {
    const rows = await db.select().from(maintenanceJobPosts).where(eq(maintenanceJobPosts.cafeOwnerId, cafeOwnerId)).orderBy(desc(maintenanceJobPosts.createdAt));
    const statsMap = await this.computeMaintenanceJobStats(rows.map((r) => r.id));
    return rows.map((r) => this.attachMaintenanceJobStats(r, statsMap.get(r.id)));
  }

  async getMaintenanceJobPostWithStats(id: number): Promise<MaintenanceJobPostWithStats | undefined> {
    const row = await this.getMaintenanceJobPostById(id);
    if (!row) return undefined;
    const statsMap = await this.computeMaintenanceJobStats([id]);
    return this.attachMaintenanceJobStats(row, statsMap.get(id));
  }

  // Automatic jobs eligible to every ELIGIBLE Maintenance provider (stricter
  // than the Barista reference — see the audit doc Section 4 for why: an
  // unapproved/suspended/hidden provider must never discover an intervention),
  // UNION jobs this provider was specifically targeted for (MANUAL) — both
  // filtered to PUBLISHED and not expired.
  async getDiscoverableMaintenanceJobPosts(maintenanceUserId: number): Promise<(MaintenanceJobPost & { isTargeted: boolean })[]> {
    const eligible = await this.isMaintenanceProviderEligible(maintenanceUserId);
    if (!eligible) return [];
    const now = new Date();
    const automatic = await db.select().from(maintenanceJobPosts).where(and(
      eq(maintenanceJobPosts.status, "PUBLISHED"),
      eq(maintenanceJobPosts.publicationMode, "AUTOMATIC"),
    ));
    const targetRows = await db.select({ jobPostId: maintenanceJobTargets.jobPostId }).from(maintenanceJobTargets).where(eq(maintenanceJobTargets.maintenanceUserId, maintenanceUserId));
    const targetedIds = targetRows.map((t) => t.jobPostId);
    const manual = targetedIds.length
      ? await db.select().from(maintenanceJobPosts).where(and(
          eq(maintenanceJobPosts.status, "PUBLISHED"),
          eq(maintenanceJobPosts.publicationMode, "MANUAL"),
          inArray(maintenanceJobPosts.id, targetedIds),
        ))
      : [];
    const notExpired = (j: MaintenanceJobPost) => !j.expiresAt || new Date(j.expiresAt as any) > now;
    // Skill-matching applies to AUTOMATIC distribution only — MANUAL jobs reach a provider
    // through an explicit Coffee-Owner-chosen target (already skill-validated at assignment
    // and re-validated at publish time, see POST .../targets and PATCH .../jobs/:id), so an
    // already-targeted provider is never silently hidden from their own discover list by a
    // later re-check here.
    const automaticMatches = await Promise.all(
      automatic.filter(notExpired).map((j) => this.isMaintenanceProviderSkillMatch(maintenanceUserId, { categories: j.categories, subCategories: j.subCategories })),
    );
    return [
      ...automatic.filter(notExpired).filter((_, i) => automaticMatches[i]).map((j) => ({ ...j, isTargeted: false })),
      ...manual.filter(notExpired).map((j) => ({ ...j, isTargeted: true })),
    ];
  }

  async addMaintenanceJobTarget(jobPostId: number, maintenanceUserId: number): Promise<MaintenanceJobTarget> {
    const [created] = await db.insert(maintenanceJobTargets).values({ jobPostId, maintenanceUserId }).onConflictDoNothing().returning();
    if (created) return created;
    const [existing] = await db.select().from(maintenanceJobTargets).where(and(eq(maintenanceJobTargets.jobPostId, jobPostId), eq(maintenanceJobTargets.maintenanceUserId, maintenanceUserId)));
    return existing!;
  }

  async getMaintenanceJobTargets(jobPostId: number): Promise<(MaintenanceJobTarget & { maintenanceName: string; maintenanceProfileImageUrl: string | null })[]> {
    const rows = await db.select().from(maintenanceJobTargets).where(eq(maintenanceJobTargets.jobPostId, jobPostId)).orderBy(desc(maintenanceJobTargets.createdAt));
    if (!rows.length) return [];
    const userIds = rows.map((r) => r.maintenanceUserId);
    const userRows = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl }).from(users).where(inArray(users.id, userIds));
    const userMap = new Map(userRows.map((u) => [u.id, u]));
    return rows.map((r) => ({ ...r, maintenanceName: userMap.get(r.maintenanceUserId)?.name ?? "—", maintenanceProfileImageUrl: userMap.get(r.maintenanceUserId)?.profileImageUrl ?? null }));
  }

  async isMaintenanceJobTargeted(jobPostId: number, maintenanceUserId: number): Promise<boolean> {
    const [row] = await db.select({ id: maintenanceJobTargets.id }).from(maintenanceJobTargets).where(and(eq(maintenanceJobTargets.jobPostId, jobPostId), eq(maintenanceJobTargets.maintenanceUserId, maintenanceUserId)));
    return !!row;
  }

  // ── Job applications ──
  async createMaintenanceJobApplication(jobPostId: number, maintenanceUserId: number, message?: string | null): Promise<MaintenanceJobApplication> {
    const [created] = await db.insert(maintenanceJobApplications).values({ jobPostId, maintenanceUserId, message: message?.trim() || null }).returning();
    return created;
  }

  async getMaintenanceJobApplicationById(id: number): Promise<MaintenanceJobApplication | undefined> {
    const [row] = await db.select().from(maintenanceJobApplications).where(eq(maintenanceJobApplications.id, id));
    return row;
  }

  async hasMaintenanceAppliedToJob(jobPostId: number, maintenanceUserId: number): Promise<boolean> {
    const [row] = await db.select({ id: maintenanceJobApplications.id }).from(maintenanceJobApplications).where(and(eq(maintenanceJobApplications.jobPostId, jobPostId), eq(maintenanceJobApplications.maintenanceUserId, maintenanceUserId)));
    return !!row;
  }

  private async attachMaintenanceApplicationParties(rows: MaintenanceJobApplication[]): Promise<MaintenanceJobApplicationWithParties[]> {
    if (!rows.length) return [];
    const providerIds = Array.from(new Set(rows.map((r) => r.maintenanceUserId)));
    const jobIds = Array.from(new Set(rows.map((r) => r.jobPostId)));
    const reservationIds = rows.map((r) => r.reservationId).filter((id): id is number => id != null);
    const [providerRows, jobRows, reservationRows] = await Promise.all([
      db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl }).from(users).where(inArray(users.id, providerIds)),
      db.select().from(maintenanceJobPosts).where(inArray(maintenanceJobPosts.id, jobIds)),
      // Attached so the provider-side status switcher (Toutes/À venir/En
      // cours/Terminées/Annulées) can classify an ACCEPTED response by its
      // real execution state rather than guessing from the application's own
      // PENDING/ACCEPTED/REJECTED status alone — see
      // docs/maintenance_intervention_reservation_cleanup_audit.md Section 10.
      reservationIds.length
        ? db.select({ id: maintenanceReservations.id, status: maintenanceReservations.status, date: maintenanceReservations.date, time: maintenanceReservations.time })
            .from(maintenanceReservations).where(inArray(maintenanceReservations.id, reservationIds))
        : Promise.resolve([]),
    ]);
    const providerMap = new Map(providerRows.map((u) => [u.id, u]));
    const jobMap = new Map(jobRows.map((j) => [j.id, j]));
    const reservationMap = new Map(reservationRows.map((r) => [r.id, r]));
    return rows.map((r) => ({
      ...r,
      maintenanceName: providerMap.get(r.maintenanceUserId)?.name ?? "—",
      maintenanceProfileImageUrl: providerMap.get(r.maintenanceUserId)?.profileImageUrl ?? null,
      jobTitle: jobMap.get(r.jobPostId)?.title ?? "—",
      establishment: jobMap.get(r.jobPostId)?.establishment ?? "",
      reservation: r.reservationId != null ? (reservationMap.get(r.reservationId) ?? null) : null,
    }));
  }

  async getMaintenanceJobApplicationsForJob(jobPostId: number): Promise<MaintenanceJobApplicationWithParties[]> {
    const rows = await db.select().from(maintenanceJobApplications).where(eq(maintenanceJobApplications.jobPostId, jobPostId)).orderBy(desc(maintenanceJobApplications.createdAt));
    return this.attachMaintenanceApplicationParties(rows);
  }

  async getMaintenanceJobApplicationsForProvider(maintenanceUserId: number): Promise<MaintenanceJobApplicationWithParties[]> {
    const rows = await db.select().from(maintenanceJobApplications).where(eq(maintenanceJobApplications.maintenanceUserId, maintenanceUserId)).orderBy(desc(maintenanceJobApplications.createdAt));
    return this.attachMaintenanceApplicationParties(rows);
  }

  async rejectMaintenanceJobApplication(id: number): Promise<MaintenanceJobApplication | undefined> {
    const [updated] = await db.update(maintenanceJobApplications).set({ status: "REJECTED", updatedAt: new Date() }).where(eq(maintenanceJobApplications.id, id)).returning();
    return updated;
  }

  // Accepting an application creates the real, linked maintenanceReservations
  // row (reusing the entire existing reservation lifecycle/UI rather than
  // duplicating it — see the audit doc Section 4/8) and records the link on
  // the application itself. The job post's own status is untouched here —
  // the owner closes it explicitly, same as Barista.
  async acceptMaintenanceJobApplication(id: number): Promise<{ application: MaintenanceJobApplication; reservation: MaintenanceReservation } | undefined> {
    const application = await this.getMaintenanceJobApplicationById(id);
    if (!application) return undefined;
    const job = await this.getMaintenanceJobPostById(application.jobPostId);
    if (!job) return undefined;
    const reservation = await this.createMaintenanceReservation({
      maintenanceUserId: application.maintenanceUserId,
      cafeOwnerId: job.cafeOwnerId,
      service: job.title,
      date: job.scheduledDate || new Date().toISOString().slice(0, 10),
      time: job.scheduledTime ?? null,
      location: job.locationAddress,
      description: job.description,
      category: job.categories[0] ?? "",
      urgency: job.urgency,
      contactPhone: job.contactPhone,
      status: "PENDING",
    });
    const [updated] = await db.update(maintenanceJobApplications)
      .set({ status: "ACCEPTED", reservationId: reservation.id, updatedAt: new Date() })
      .where(eq(maintenanceJobApplications.id, id))
      .returning();
    return { application: updated, reservation };
  }

  // ── Messaging integration ──
  // Was physically filed under a generic Messaging area in server/storage.ts,
  // despite being entirely Maintenance-specific — see file header.
  async refreshMaintenanceMessagingState(reservationId: number): Promise<void> {
    const [reservation] = await db.select().from(maintenanceReservations)
      .where(eq(maintenanceReservations.id, reservationId));
    if (reservation) {
      await this.facade.syncMessagingRelationship(reservation.cafeOwnerId, reservation.maintenanceUserId, "MAINTENANCE");
    }
  }

  // ── Entity-level Maintenance reports ("Blacklist") — consolidated from
  // server/storage/domains/maintenance-reports.storage.ts (Batch 18). ──────
  async createMaintenanceReport(cafeOwnerId: number, maintenanceUserId: number, reason: string, rating?: number): Promise<MaintenanceReport> {
    const [created] = await db.insert(maintenanceReports).values({ cafeOwnerId, maintenanceUserId, reason, rating: rating ?? null }).returning();
    return created;
  }

  async getMaintenanceReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(MaintenanceReport & { cafeOwnerName: string; maintenanceName: string })[]> {
    const rows = await db.select().from(maintenanceReports)
      .where(status ? eq(maintenanceReports.status, status) : undefined)
      .orderBy(desc(maintenanceReports.createdAt));
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.maintenanceUserId])));
    const userMap = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name]));
    return rows.map((r) => ({ ...r, cafeOwnerName: userMap.get(r.cafeOwnerId) ?? "—", maintenanceName: userMap.get(r.maintenanceUserId) ?? "—" }));
  }

  async getMaintenanceReportById(id: number): Promise<MaintenanceReport | undefined> {
    const [row] = await db.select().from(maintenanceReports).where(eq(maintenanceReports.id, id));
    return row;
  }

  async getMaintenanceReportsByOwner(cafeOwnerId: number): Promise<(MaintenanceReport & {
    maintenanceName: string; maintenanceProfileImageUrl: string | null; maintenanceLocation: string | null;
  })[]> {
    const rows = await db.select().from(maintenanceReports)
      .where(eq(maintenanceReports.cafeOwnerId, cafeOwnerId))
      .orderBy(desc(maintenanceReports.createdAt));
    if (rows.length === 0) return [];
    const maintenanceIds = Array.from(new Set(rows.map((r) => r.maintenanceUserId)));
    const rowsUsers = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl, locationAddress: users.locationAddress })
      .from(users).where(inArray(users.id, maintenanceIds));
    const map = new Map(rowsUsers.map((u) => [u.id, u]));
    return rows.map((r) => {
      const m = map.get(r.maintenanceUserId);
      return { ...r, maintenanceName: m?.name ?? "—", maintenanceProfileImageUrl: m?.profileImageUrl ?? null, maintenanceLocation: m?.locationAddress ?? null };
    });
  }

  // Public read (task: "Redesign Maintenance Reports Using the Avis Modal
  // Pattern and Add Admin Moderation") — strictly status = PUBLISHED, never
  // the reporting cafeOwnerId/name (privacy requirement), paginated same
  // convention as getDeliveryFinancialLedger ({ data, total, page, limit }).
  async getPublishedMaintenanceReports(page = 1, limit = 10): Promise<{ reports: (Pick<MaintenanceReport, "id" | "maintenanceUserId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { maintenanceName: string; maintenanceProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const where = eq(maintenanceReports.status, "PUBLISHED");
    const [rows, [{ count }]] = await Promise.all([
      db.select({
        id: maintenanceReports.id, maintenanceUserId: maintenanceReports.maintenanceUserId,
        reason: maintenanceReports.reason, rating: maintenanceReports.rating,
        createdAt: maintenanceReports.createdAt, resolvedAt: maintenanceReports.resolvedAt,
      }).from(maintenanceReports).where(where)
        .orderBy(desc(maintenanceReports.resolvedAt))
        .limit(safeLimit).offset((safePage - 1) * safeLimit),
      db.select({ count: sql<number>`count(*)::int` }).from(maintenanceReports).where(where),
    ]);
    if (rows.length === 0) return { reports: [], total: count, page: safePage, limit: safeLimit };
    const maintenanceIds = Array.from(new Set(rows.map((r) => r.maintenanceUserId)));
    const rowsUsers = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl })
      .from(users).where(inArray(users.id, maintenanceIds));
    const map = new Map(rowsUsers.map((u) => [u.id, u]));
    const reports = rows.map((r) => {
      const m = map.get(r.maintenanceUserId);
      return { ...r, maintenanceName: m?.name ?? "—", maintenanceProfileImageUrl: m?.profileImageUrl ?? null };
    });
    return { reports, total: count, page: safePage, limit: safeLimit };
  }

  async resolveMaintenanceReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<MaintenanceReport | undefined> {
    const [updated] = await db.update(maintenanceReports)
      .set({ status, resolvedAt: new Date(), resolutionNote: resolutionNote ?? null, moderatedByAdminId: moderatedByAdminId ?? null })
      .where(eq(maintenanceReports.id, id))
      .returning();
    return updated;
  }
}
