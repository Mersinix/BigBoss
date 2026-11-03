import { db } from "../../db";
import { eq, and, inArray, desc, asc, sql, isNull, isNotNull } from "drizzle-orm";
import {
  printCatalogItems, printOrders, printCategoryTaxonomy, printSubCategoryTaxonomy, printReports,
  printFavorites, printerProfiles, users, supplierProductReviews,
  type PrintCatalogItem, type InsertPrintCatalogItem, type PrintCatalogCard,
  type PrintOrder, type PrintOrderWithParties,
  type PrintCategoryTaxonomy, type PrintSubCategoryTaxonomy,
  type PrintReport, type PrinterProfile, type InsertPrinterProfile,
  type PrintCompanyCard, type PrintCompanyListCard,
  type SupplierProductReview,
} from "@shared/schema";
import type { DatabaseStorage } from "../../storage";

// Stage 2 — Batch 31: the COMPLETE Print business domain, consolidated
// into one file per the project's permanent "one business domain = one
// storage file" rule (adopted Batch 28, reapplied Batches 29/30 for
// Maintenance/Marketing). Named `print.storage.ts` to match the
// project's existing `<name>.storage.ts` convention (the task text said
// `print-storage.ts` — the same naming slip already caught once for
// Barista and pre-empted since; corrected here from the start).
//
// No pre-existing Print-specific storage file was found anywhere in the
// repository — unlike Marketing/Maintenance, this is a single-step
// extraction straight out of server/storage.ts, not a consolidation of
// a previously-extracted file plus new extraction.
//
// This covers: Catalog items (CRUD + the public Marketplace card
// listing/single-item/unfiltered-preview variants + derived
// Categories/SubCategories), Orders (create/status-update/list for
// both parties) + Revenue summary, admin-managed Category/SubCategory
// taxonomy (with its own seed-on-empty bootstrap), two independent
// Favorites kinds (item-level and company-level, scoped by
// printItemId NULL/NOT NULL — same pattern as Marketing's two
// Favorites kinds), the Printer's category-mapping validation, Reviews
// (NO written/cached rating column here — PRINT has no per-printer
// profile-level rating field, unlike Maintenance/Marketing/Barista; the
// rating is computed LIVE on every read via computePrintReviewStats,
// confirmed by reading upsertPrintReview's own comment, not assumed),
// Entity-level "Blacklist" reports, the company-level Printer profile
// (lazy-create-on-first-read, mirrors getAcademyProfile) + its
// Company-card/Company-cards-list derivations, and the Admin aggregate
// overview.
//
// EXPLICITLY NOT PART OF THIS DOMAIN, despite being physically filed
// inside the original "── PRINT admin" section in server/storage.ts
// (an adjacency trap, same category as Batch 29's reverse-dependency
// finding): getHeroActionSettings/setHeroActionSettings,
// getServiceHeroConfigs/setServiceHeroConfig/defaultServiceHeroConfig,
// and getAccountDarkModeSettings/setAccountDarkModeSetting. These are
// generic, cross-service admin settings governing ALL service
// accounts (SHOP/BARISTA/ACADEMY/MAINTENANCE/PRINT/MARKETING for the
// first two pairs; 9 accounts including ADMIN/SUPPLIER/DRIVER for the
// third) — confirmed by reading their bodies, which iterate over
// `ALL_SERVICES`/`ALL_ACCOUNTS` arrays, not anything PRINT-specific.
// They were left exactly where they were in server/storage.ts. A
// pre-existing `server/storage/domains/platform-settings.storage.ts`
// (PlatformSettingsStorage) already holds the analogous
// getServiceStates/setServiceState pattern — these three pairs are
// candidates for a FUTURE PlatformSettingsStorage consolidation, not
// this one, per the task's explicit scope restriction against starting
// another domain's consolidation in the same batch.
//
// Has a facade constructor argument for exactly one legitimate
// cross-domain call: getPrintCompanyCard's `this.facade.getUser(...)`
// (the generic User/Auth domain is not yet extracted).
export class PrintStorage {
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

  // ── PRINT ────────────────────────────────────────────────────────────────────
  // See shared/schema.ts printCatalogItems/printOrders for the architecture note.
  // Every catalog-item and order mutation is scoped in the WHERE clause itself
  // (ownership-in-WHERE pattern, mirroring Maintenance) rather than a separate
  // pre-check, so a Printer can never affect another Printer's rows even if a
  // route bug ever skipped the role/ownership check upstream.

  private async computePrintReviewStats(printerIds: number[]): Promise<Map<number, { rating: number; reviewCount: number }>> {
    const stats = new Map<number, { rating: number; reviewCount: number }>();
    if (printerIds.length === 0) return stats;
    const rows = await db.select({ printerId: supplierProductReviews.printerId, rating: supplierProductReviews.rating })
      .from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.reviewType, "PRINT"), inArray(supplierProductReviews.printerId as any, printerIds)));
    const agg = new Map<number, { sum: number; count: number }>();
    for (const row of rows) {
      if (!row.printerId) continue;
      const cur = agg.get(row.printerId) ?? { sum: 0, count: 0 };
      cur.sum += row.rating; cur.count += 1;
      agg.set(row.printerId, cur);
    }
    for (const [printerId, { sum, count }] of Array.from(agg)) {
      stats.set(printerId, { rating: Math.round((sum / count) * 10), reviewCount: count });
    }
    return stats;
  }

  async getPrintCatalogForPrinter(printerId: number): Promise<PrintCatalogItem[]> {
    return db.select().from(printCatalogItems)
      .where(eq(printCatalogItems.printerId, printerId))
      .orderBy(desc(printCatalogItems.createdAt));
  }

  async createPrintCatalogItem(printerId: number, data: Partial<InsertPrintCatalogItem>): Promise<PrintCatalogItem> {
    const [created] = await db.insert(printCatalogItems).values({ ...data, printerId } as any).returning();
    return created;
  }

  async updatePrintCatalogItem(id: number, printerId: number, updates: Partial<InsertPrintCatalogItem>): Promise<PrintCatalogItem | undefined> {
    const safeUpdates = { ...updates };
    delete (safeUpdates as any).printerId; // ownership is fixed at creation, never client-reassignable
    const [updated] = await db.update(printCatalogItems)
      .set({ ...safeUpdates, updatedAt: new Date() } as any)
      .where(and(eq(printCatalogItems.id, id), eq(printCatalogItems.printerId, printerId)))
      .returning();
    return updated;
  }

  async deletePrintCatalogItem(id: number, printerId: number): Promise<boolean> {
    const deleted = await db.delete(printCatalogItems)
      .where(and(eq(printCatalogItems.id, id), eq(printCatalogItems.printerId, printerId)))
      .returning();
    return deleted.length > 0;
  }

  async getPrintMarketplaceCards(filters?: { search?: string; category?: string; printerId?: number; viewerLocation?: { lat: string | null; lng: string | null } | null }): Promise<PrintCatalogCard[]> {
    const rows = await db.select({ item: printCatalogItems, printer: users })
      .from(printCatalogItems)
      .innerJoin(users, eq(printCatalogItems.printerId, users.id))
      .where(and(
        eq(printCatalogItems.isActive, true),
        eq(users.role, "PRINTER" as any),
        eq(users.status, "approved"),
        ...(filters?.printerId ? [eq(printCatalogItems.printerId, filters.printerId)] : []),
      ));

    const printerIds = Array.from(new Set(rows.map((r) => r.printer.id)));
    const statsMap = await this.computePrintReviewStats(printerIds);
    // Company-level opt-out (printerProfiles.marketplaceVisible) — a printer with no
    // profile row yet defaults to visible (see getPrinterProfile's lazy-create), so
    // only an explicit false here hides its otherwise-active services.
    // GO Live (Phase 5E) — a printer not yet approved for publication is excluded
    // here too, one more AND-gate alongside the existing marketplaceVisible opt-out.
    const profileRows = printerIds.length
      ? await db.select({ userId: printerProfiles.userId, marketplaceVisible: printerProfiles.marketplaceVisible, publicationStatus: printerProfiles.publicationStatus, isOnVacation: printerProfiles.isOnVacation })
          .from(printerProfiles)
          .where(inArray(printerProfiles.userId, printerIds))
      : [];
    const hiddenPrinterIds = new Set(
      profileRows.filter((p) => !p.marketplaceVisible || p.publicationStatus !== "APPROVED").map((p) => p.userId),
    );
    // No profile row yet defaults to available, same lazy-create convention used everywhere else.
    const vacationByPrinter = new Map(profileRows.map((p) => [p.userId, p.isOnVacation]));

    const viewerPos = filters?.viewerLocation ? this.parseLatLng(filters.viewerLocation) : null;

    const cards = rows
      .filter(({ printer }) => !hiddenPrinterIds.has(printer.id))
      .map(({ item, printer }) => {
      const stats = statsMap.get(printer.id);
      const providerPos = this.parseLatLng({ lat: printer.locationLat, lng: printer.locationLng });
      const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
      return {
        ...item,
        printerName: printer.name,
        printerPhone: printer.phone ?? null,
        printerImageUrl: printer.profileImageUrl ?? null,
        printerLocation: this.formatPublicLocation(printer),
        printerIsAvailable: !(vacationByPrinter.get(printer.id) ?? false),
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
        distanceKm,
      } as PrintCatalogCard;
    });

    const query = filters?.search?.trim().toLowerCase();
    return cards.filter((card) => {
      if (query) {
        const haystack = [card.name, card.description, card.category, card.subCategory, card.printerName].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters?.category && card.category.toLowerCase() !== filters.category.toLowerCase()) return false;
      return true;
    });
  }

  /** Single-item detail for the Coffee Owner's PRINT product-detail page. Only
   *  active items from approved printers are visible here — same visibility
   *  rule as getPrintMarketplaceCards, just narrowed to one id. */
  async getPrintMarketplaceCard(id: number, viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<PrintCatalogCard | undefined> {
    const [row] = await db.select({ item: printCatalogItems, printer: users })
      .from(printCatalogItems)
      .innerJoin(users, eq(printCatalogItems.printerId, users.id))
      .where(and(
        eq(printCatalogItems.id, id),
        eq(printCatalogItems.isActive, true),
        eq(users.role, "PRINTER" as any),
        eq(users.status, "approved"),
      ));
    if (!row) return undefined;
    const stats = (await this.computePrintReviewStats([row.printer.id])).get(row.printer.id);
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const providerPos = this.parseLatLng({ lat: row.printer.locationLat, lng: row.printer.locationLng });
    const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
    const profile = await this.getPrinterProfile(row.printer.id);
    return {
      ...row.item,
      printerName: row.printer.name,
      printerPhone: row.printer.phone ?? null,
      printerImageUrl: row.printer.profileImageUrl ?? null,
      printerLocation: this.formatPublicLocation(row.printer),
      printerIsAvailable: !profile.isOnVacation,
      rating: stats?.rating ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
      distanceKm,
    };
  }

  /** Unfiltered single-item lookup (no isActive/approved/marketplaceVisible gate) —
   *  used only for the owning Printer's/Admin's own "Aperçu" preview of a
   *  draft/inactive service or a service belonging to a currently-hidden company,
   *  never exposed to a Coffee Owner. See GET /api/print/marketplace/:id's self/admin
   *  bypass, same pattern as the academy courses self-preview fix. */
  async getPrintCatalogItemCard(id: number): Promise<PrintCatalogCard | undefined> {
    const [row] = await db.select({ item: printCatalogItems, printer: users })
      .from(printCatalogItems)
      .innerJoin(users, eq(printCatalogItems.printerId, users.id))
      .where(eq(printCatalogItems.id, id));
    if (!row) return undefined;
    const stats = (await this.computePrintReviewStats([row.printer.id])).get(row.printer.id);
    const profile = await this.getPrinterProfile(row.printer.id);
    return {
      ...row.item,
      printerName: row.printer.name,
      printerPhone: row.printer.phone ?? null,
      printerImageUrl: row.printer.profileImageUrl ?? null,
      printerLocation: this.formatPublicLocation(row.printer),
      printerIsAvailable: !profile.isOnVacation,
      rating: stats?.rating ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
    };
  }

  /** IMPORTANT DISTINCTION (do not "fix" this back to taxonomy-first — that was
   *  tried and deliberately reverted): Admin taxonomy *availability* is a
   *  different concept from marketplace *visibility*. A category can be active
   *  in printCategoryTaxonomy (so Printers can map/use it) without ever
   *  appearing on /print, if no approved Printer currently has an active
   *  catalog item using it. This must stay a pure derivation from real active
   *  marketplace data — never taxonomy-first — so /print never shows an empty
   *  category. The taxonomy itself is exposed separately via getPrintTaxonomy()
   *  for Admin's and the Printer's own category-mapping UIs. */
  async getPrintCategories(): Promise<string[]> {
    const rows = await db.select({ category: printCatalogItems.category })
      .from(printCatalogItems)
      .innerJoin(users, eq(printCatalogItems.printerId, users.id))
      .where(and(
        eq(printCatalogItems.isActive, true),
        eq(users.role, "PRINTER" as any),
        eq(users.status, "approved"),
      ));
    return Array.from(new Set(rows.map((r) => r.category).filter((c) => c.trim().length > 0))).sort((a, b) => a.localeCompare(b));
  }

  /** Same "derived from actually-used active marketplace data" rule as
   *  getPrintCategories() — see the note above. */
  async getPrintSubCategories(): Promise<string[]> {
    const rows = await db.select({ subCategory: printCatalogItems.subCategory })
      .from(printCatalogItems)
      .innerJoin(users, eq(printCatalogItems.printerId, users.id))
      .where(and(
        eq(printCatalogItems.isActive, true),
        eq(users.role, "PRINTER" as any),
        eq(users.status, "approved"),
      ));
    return Array.from(new Set(rows.map((r) => r.subCategory).filter((c) => c.trim().length > 0))).sort((a, b) => a.localeCompare(b));
  }

  async getPrintOrdersForPrinter(printerId: number): Promise<PrintOrderWithParties[]> {
    const rows = await db.select({ order: printOrders, owner: users })
      .from(printOrders)
      .innerJoin(users, eq(printOrders.cafeOwnerId, users.id))
      .where(eq(printOrders.printerId, printerId))
      .orderBy(desc(printOrders.createdAt));
    return rows.map(({ order, owner }) => ({ ...order, printerName: "", cafeOwnerName: owner.name }));
  }

  async getPrintOrdersForOwner(ownerId: number): Promise<PrintOrderWithParties[]> {
    const rows = await db.select({ order: printOrders, printer: users })
      .from(printOrders)
      .innerJoin(users, eq(printOrders.printerId, users.id))
      .where(eq(printOrders.cafeOwnerId, ownerId))
      .orderBy(desc(printOrders.createdAt));
    return rows.map(({ order, printer }) => ({ ...order, printerName: printer.name, cafeOwnerName: "" }));
  }

  /** Snapshots the catalog item's current name/price onto the order so a later
   *  catalog edit (or deletion) never rewrites an already-placed order's price —
   *  see the architecture note on printOrders in shared/schema.ts. */
  async createPrintOrder(cafeOwnerId: number, data: { catalogItemId: number; quantity: number; notes?: string; deliveryAddress?: string; contactPhone?: string }): Promise<PrintOrder> {
    const [item] = await db.select().from(printCatalogItems).where(eq(printCatalogItems.id, data.catalogItemId));
    if (!item || !item.isActive) throw new Error("This print service is no longer available.");
    const quantity = Math.max(1, Math.floor(data.quantity));
    if (quantity < item.minQuantity) throw new Error(`Minimum quantity for this service is ${item.minQuantity}.`);
    const [created] = await db.insert(printOrders).values({
      printerId: item.printerId,
      cafeOwnerId,
      catalogItemId: item.id,
      itemName: item.name,
      unitPriceInCents: item.priceInCents,
      quantity,
      totalInCents: item.priceInCents * quantity,
      status: "PENDING",
      notes: data.notes ?? "",
      deliveryAddress: data.deliveryAddress ?? null,
      contactPhone: data.contactPhone ?? "",
    } as any).returning();
    return created;
  }

  async updatePrintOrderStatus(id: number, printerId: number, status: string): Promise<PrintOrder | undefined> {
    const [updated] = await db.update(printOrders)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(printOrders.id, id), eq(printOrders.printerId, printerId)))
      .returning();
    return updated;
  }

  async getPrintRevenueSummary(printerId: number): Promise<{
    totalEarnedCents: number; completedOrders: number;
    currentMonthCents: number; currentMonthOrders: number;
    history: { month: string; totalCents: number; orders: number }[];
  }> {
    const completed = await db.select().from(printOrders).where(and(
      eq(printOrders.printerId, printerId),
      eq(printOrders.status, "DELIVERED"),
    ));
    const now = new Date();
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthKey = monthKey(now);

    const byMonth = new Map<string, { totalCents: number; orders: number }>();
    let currentMonthCents = 0;
    let currentMonthOrders = 0;
    for (const o of completed) {
      const completedAt = o.updatedAt ?? o.createdAt ?? now;
      const key = monthKey(new Date(completedAt));
      const bucket = byMonth.get(key) ?? { totalCents: 0, orders: 0 };
      bucket.totalCents += o.totalInCents;
      bucket.orders += 1;
      byMonth.set(key, bucket);
      if (key === currentMonthKey) { currentMonthCents += o.totalInCents; currentMonthOrders += 1; }
    }

    const history: { month: string; totalCents: number; orders: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      const bucket = byMonth.get(key);
      history.push({ month: key, totalCents: bucket?.totalCents ?? 0, orders: bucket?.orders ?? 0 });
    }

    return {
      totalEarnedCents: completed.reduce((s, o) => s + o.totalInCents, 0),
      completedOrders: completed.length,
      currentMonthCents,
      currentMonthOrders,
      history,
    };
  }

  // ── PRINT admin ──────────────────────────────────────────────────────────────
  // Mirrors maintenanceCompetencies' taxonomy-management pattern (see above):
  // auto-seeded once from whatever category text already exists on catalog
  // items, then admin-managed independently; hard delete, no referential guard
  // (printCatalogItems.category stays plain text, matching maintenanceProfiles'
  // convention, so a renamed/deleted taxonomy entry never corrupts history).

  private async seedPrintCategoryTaxonomyIfEmpty(): Promise<void> {
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(printCategoryTaxonomy);
    if (count && count.count > 0) return;
    const rows = await db.select({ category: printCatalogItems.category }).from(printCatalogItems);
    const names = Array.from(new Set(rows.map((r) => r.category.trim()).filter(Boolean)));
    if (names.length) await db.insert(printCategoryTaxonomy).values(names.map((name) => ({ name }))).onConflictDoNothing();
  }

  async getPrintCategoryTaxonomy(): Promise<PrintCategoryTaxonomy[]> {
    await this.seedPrintCategoryTaxonomyIfEmpty();
    return db.select().from(printCategoryTaxonomy).orderBy(asc(printCategoryTaxonomy.name));
  }

  async createPrintCategory(name: string, icon?: string | null): Promise<PrintCategoryTaxonomy> {
    const [created] = await db.insert(printCategoryTaxonomy).values({ name: name.trim(), icon: icon ?? null }).returning();
    return created;
  }

  async updatePrintCategory(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<PrintCategoryTaxonomy | undefined> {
    const [updated] = await db.update(printCategoryTaxonomy)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), updatedAt: new Date() })
      .where(eq(printCategoryTaxonomy.id, id)).returning();
    return updated;
  }

  async deletePrintCategory(id: number): Promise<void> {
    await db.delete(printCategoryTaxonomy).where(eq(printCategoryTaxonomy.id, id));
  }

  async getPrintSubCategoryTaxonomy(categoryId?: number): Promise<PrintSubCategoryTaxonomy[]> {
    const rows = await db.select().from(printSubCategoryTaxonomy)
      .where(categoryId !== undefined ? eq(printSubCategoryTaxonomy.categoryId, categoryId) : undefined)
      .orderBy(asc(printSubCategoryTaxonomy.name));
    return rows;
  }

  async createPrintSubCategory(categoryId: number, name: string, icon?: string | null): Promise<PrintSubCategoryTaxonomy> {
    const [created] = await db.insert(printSubCategoryTaxonomy).values({ categoryId, name: name.trim(), icon: icon ?? null }).returning();
    return created;
  }

  async updatePrintSubCategory(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<PrintSubCategoryTaxonomy | undefined> {
    const [updated] = await db.update(printSubCategoryTaxonomy)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), updatedAt: new Date() })
      .where(eq(printSubCategoryTaxonomy.id, id)).returning();
    return updated;
  }

  async deletePrintSubCategory(id: number): Promise<void> {
    await db.delete(printSubCategoryTaxonomy).where(eq(printSubCategoryTaxonomy.id, id));
  }

  // Print favorites — item (catalog item) rows have printItemId set; company
  // (printer) favorites have printItemId NULL and printerId set instead
  // (docs/coffee_owner_favorites_marketplace_audit.md, Section 4).
  async getPrintFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select({ printItemId: printFavorites.printItemId })
      .from(printFavorites)
      .where(and(eq(printFavorites.userId, userId), isNotNull(printFavorites.printItemId)));
    return rows.map((row) => row.printItemId as number);
  }

  async addPrintFavorite(userId: number, printItemId: number): Promise<void> {
    const [existing] = await db.select().from(printFavorites).where(and(
      eq(printFavorites.userId, userId),
      eq(printFavorites.printItemId, printItemId),
    ));
    if (!existing) await db.insert(printFavorites).values({ userId, printItemId });
  }

  async removePrintFavorite(userId: number, printItemId: number): Promise<void> {
    await db.delete(printFavorites).where(and(
      eq(printFavorites.userId, userId),
      eq(printFavorites.printItemId, printItemId),
    ));
  }

  async getPrintCompanyFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select({ printerId: printFavorites.printerId })
      .from(printFavorites)
      .where(and(eq(printFavorites.userId, userId), isNull(printFavorites.printItemId), isNotNull(printFavorites.printerId)));
    return rows.map((row) => row.printerId as number);
  }

  async addPrintCompanyFavorite(userId: number, printerId: number): Promise<void> {
    const [existing] = await db.select().from(printFavorites).where(and(
      eq(printFavorites.userId, userId),
      eq(printFavorites.printerId, printerId),
      isNull(printFavorites.printItemId),
    ));
    if (!existing) await db.insert(printFavorites).values({ userId, printerId, printItemId: null });
  }

  async removePrintCompanyFavorite(userId: number, printerId: number): Promise<void> {
    await db.delete(printFavorites).where(and(
      eq(printFavorites.userId, userId),
      eq(printFavorites.printerId, printerId),
      isNull(printFavorites.printItemId),
    ));
  }

  // Entity-level Print reports ("Blacklist") — mirrors createMarketingReport/
  // getMarketingReportsByOwner/resolveMarketingReport exactly, keyed by printerId.
  async createPrintReport(cafeOwnerId: number, printerId: number, reason: string, rating?: number): Promise<PrintReport> {
    const [created] = await db.insert(printReports).values({ cafeOwnerId, printerId, reason, rating: rating ?? null }).returning();
    return created;
  }

  async getPrintReportById(id: number): Promise<PrintReport | undefined> {
    const [row] = await db.select().from(printReports).where(eq(printReports.id, id));
    return row;
  }

  async getPrintReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(PrintReport & { cafeOwnerName: string; printerName: string })[]> {
    const rows = await db.select().from(printReports)
      .where(status ? eq(printReports.status, status) : undefined)
      .orderBy(desc(printReports.createdAt));
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.printerId])));
    const userMap = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name]));
    return rows.map((r) => ({ ...r, cafeOwnerName: userMap.get(r.cafeOwnerId) ?? "—", printerName: userMap.get(r.printerId) ?? "—" }));
  }

  async getPrintReportsByOwner(cafeOwnerId: number): Promise<(PrintReport & {
    printerName: string; printerProfileImageUrl: string | null; printerLocation: string | null;
  })[]> {
    const rows = await db.select().from(printReports)
      .where(eq(printReports.cafeOwnerId, cafeOwnerId))
      .orderBy(desc(printReports.createdAt));
    if (rows.length === 0) return [];
    const printerIds = Array.from(new Set(rows.map((r) => r.printerId)));
    const rowsUsers = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl, locationAddress: users.locationAddress })
      .from(users).where(inArray(users.id, printerIds));
    const map = new Map(rowsUsers.map((u) => [u.id, u]));
    return rows.map((r) => {
      const p = map.get(r.printerId);
      return { ...r, printerName: p?.name ?? "—", printerProfileImageUrl: p?.profileImageUrl ?? null, printerLocation: p?.locationAddress ?? null };
    });
  }

  async getPublishedPrintReports(page = 1, limit = 10): Promise<{ reports: (Pick<PrintReport, "id" | "printerId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { printerName: string; printerProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const where = eq(printReports.status, "PUBLISHED");
    const [rows, [{ count }]] = await Promise.all([
      db.select({
        id: printReports.id, printerId: printReports.printerId,
        reason: printReports.reason, rating: printReports.rating,
        createdAt: printReports.createdAt, resolvedAt: printReports.resolvedAt,
      }).from(printReports).where(where)
        .orderBy(desc(printReports.resolvedAt))
        .limit(safeLimit).offset((safePage - 1) * safeLimit),
      db.select({ count: sql<number>`count(*)::int` }).from(printReports).where(where),
    ]);
    if (rows.length === 0) return { reports: [], total: count, page: safePage, limit: safeLimit };
    const printerIds = Array.from(new Set(rows.map((r) => r.printerId)));
    const rowsUsers = await db.select({ id: users.id, name: users.name, profileImageUrl: users.profileImageUrl })
      .from(users).where(inArray(users.id, printerIds));
    const map = new Map(rowsUsers.map((u) => [u.id, u]));
    const reports = rows.map((r) => {
      const p = map.get(r.printerId);
      return { ...r, printerName: p?.name ?? "—", printerProfileImageUrl: p?.profileImageUrl ?? null };
    });
    return { reports, total: count, page: safePage, limit: safeLimit };
  }

  async resolvePrintReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<PrintReport | undefined> {
    const [updated] = await db.update(printReports)
      .set({ status, resolvedAt: new Date(), resolutionNote: resolutionNote ?? null, moderatedByAdminId: moderatedByAdminId ?? null })
      .where(eq(printReports.id, id))
      .returning();
    return updated;
  }

  /** The Printer's own account (users.printCategories/printSubCategories) is
   *  reused as the mapping store — it already existed for an admin-set-approval
   *  purpose (see admin/users-page.tsx), which this doesn't remove; a Printer
   *  self-selecting from the same taxonomy via this method just becomes the
   *  additional, primary way that array gets populated going forward. */
  async getPrinterCategoryMapping(printerId: number): Promise<{ categories: string[]; subCategories: string[] }> {
    const [row] = await db.select({ categories: users.printCategories, subCategories: users.printSubCategories })
      .from(users).where(eq(users.id, printerId));
    return { categories: row?.categories ?? [], subCategories: row?.subCategories ?? [] };
  }

  /** Validates every submitted name against the ACTIVE admin taxonomy (a
   *  Printer can never map an inactive/frozen or nonexistent category), and
   *  every subcategory against both the active taxonomy AND its declared
   *  parent category being one of the categories being mapped in the same
   *  call — silently drops anything invalid rather than erroring, and reports
   *  what was dropped so the route layer can surface it. */
  async setPrinterCategoryMapping(printerId: number, mapping: { categories: string[]; subCategories: string[] }): Promise<{ categories: string[]; subCategories: string[]; rejected: { categories: string[]; subCategories: string[] } }> {
    const [categoryTaxonomy, subCategoryTaxonomy] = await Promise.all([
      this.getPrintCategoryTaxonomy(),
      this.getPrintSubCategoryTaxonomy(),
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

    await db.update(users)
      .set({ printCategories: acceptedCategories, printSubCategories: acceptedSubCategories })
      .where(eq(users.id, printerId));

    return {
      categories: acceptedCategories,
      subCategories: acceptedSubCategories,
      rejected: { categories: rejectedCategories, subCategories: rejectedSubCategories },
    };
  }

  // Stage 2 — Batch 42: Print's review CRUD (getPrintReviews/
  // getPrintReviewForOrder/upsertPrintReview) moved to
  // server/storage/domains/reviews.storage.ts (the cross-entity Reviews
  // domain) — see server/STORAGE_ARCHITECTURE.md ("Batch 42"). Every
  // other Print method, including computePrintReviewStats (a
  // display-time concern used by getPrintMarketplaceCards/
  // getPrintAdminOverview, not review CRUD), is unaffected and stays
  // here unchanged.

  // ── Printer (company-level) profile — mirrors getAcademyProfile/upsertAcademyProfile
  // exactly (same lazy-create-on-first-read pattern). Distinct from the catalog CRUD
  // above: this table only ever stores company-level fields (description/website/
  // visibility), never touched by service create/update/delete and vice versa. ──
  async getPrinterProfile(userId: number): Promise<PrinterProfile> {
    const [profile] = await db.select().from(printerProfiles).where(eq(printerProfiles.userId, userId));
    if (profile) return profile;
    const [created] = await db.insert(printerProfiles).values({ userId }).onConflictDoNothing().returning();
    if (created) return created;
    const [existing] = await db.select().from(printerProfiles).where(eq(printerProfiles.userId, userId));
    return existing!;
  }

  async upsertPrinterProfile(userId: number, updates: Partial<InsertPrinterProfile>): Promise<PrinterProfile> {
    const current = await this.getPrinterProfile(userId);
    const [updated] = await db.update(printerProfiles)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(printerProfiles.id, current.id))
      .returning();
    return updated;
  }

  /** Admin PRINT drag-and-drop — mirrors bulkUpdateStoreOrder's independent-per-row pattern. */
  async bulkUpdatePrinterOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(async ({ id, displayOrder }) => {
      await this.getPrinterProfile(id); // lazy-create the row if it doesn't exist yet
      await db.update(printerProfiles).set({ displayOrder, updatedAt: new Date() }).where(eq(printerProfiles.userId, id));
    }));
  }

  /** Admin PRINT Auto Approve — mirrors setStoreAutoApprove. */
  async setPrinterAutoApprove(userId: number, autoApprove: boolean): Promise<PrinterProfile> {
    return this.upsertPrinterProfile(userId, { autoApprove });
  }

  /** Company-level card for the printing company itself — Espace Imprimerie's own
   *  Business → Profil → Aperçu, the Coffee Owner's Service modal "Imprimerie"
   *  section, and Admin PRINT's company view all read this SAME derivation (no
   *  separate/duplicate company representation). `services` reuses the exact
   *  PrintCatalogCard shape getPrintMarketplaceCards already returns, filtered to
   *  this printer's active items — one synchronized service list everywhere. */
  async getPrintCompanyCard(userId: number, viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<PrintCompanyCard | undefined> {
    const user = await this.facade.getUser(userId);
    if (!user || user.role !== 'PRINTER') return undefined;
    const [profile, items, mapping, stats] = await Promise.all([
      this.getPrinterProfile(userId),
      this.getPrintCatalogForPrinter(userId),
      this.getPrinterCategoryMapping(userId),
      this.computePrintReviewStats([userId]),
    ]);
    // Built directly from this printer's own active items (not the public
    // getPrintMarketplaceCards, which also gates on printerProfiles.marketplaceVisible) —
    // the company's own Aperçu must show its real active services even while the
    // profile itself is temporarily hidden from the marketplace, same reasoning
    // as getAcademyProfileCard using getAcademyCoursesForAcademy directly.
    const activeStats = stats.get(userId);
    const services: PrintCatalogCard[] = items.filter((i) => i.isActive).map((item) => ({
      ...item,
      printerName: user.name,
      printerPhone: user.phone ?? null,
      printerImageUrl: user.profileImageUrl ?? null,
      printerLocation: this.formatPublicLocation(user),
      printerIsAvailable: !profile.isOnVacation,
      rating: activeStats?.rating ?? 0,
      reviewCount: activeStats?.reviewCount ?? 0,
    }));
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const providerPos = this.parseLatLng({ lat: user.locationLat, lng: user.locationLng });
    const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
    return {
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
      rating: stats.get(userId)?.rating ?? 0,
      reviewCount: stats.get(userId)?.reviewCount ?? 0,
      portfolioImages: profile.portfolioImages ?? [],
      categories: mapping.categories,
      services,
      distanceKm,
    };
  }

  /** Lightweight "Print Store" list — one card per visible Printer company
   *  with at least one active service, mirroring getVisibleStores()'s role
   *  for Supplier Stores (docs/print_store_mapping_audit.md). Reuses the
   *  exact same visibility gate as getPrintMarketplaceCards (approved PRINTER
   *  role, marketplaceVisible && publicationStatus==='APPROVED'), batched
   *  into a handful of queries — no per-printer getPrinterProfile/
   *  getPrinterCategoryMapping calls. */
  async getPrintCompanyCards(viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<PrintCompanyListCard[]> {
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const rows = await db.select({ printerId: printCatalogItems.printerId })
      .from(printCatalogItems)
      .innerJoin(users, eq(printCatalogItems.printerId, users.id))
      .where(and(
        eq(printCatalogItems.isActive, true),
        eq(users.role, "PRINTER" as any),
        eq(users.status, "approved"),
      ));
    const countByPrinter = new Map<number, number>();
    for (const row of rows) countByPrinter.set(row.printerId, (countByPrinter.get(row.printerId) ?? 0) + 1);
    const printerIds = Array.from(countByPrinter.keys());
    if (printerIds.length === 0) return [];

    const [profileRows, userRows, statsMap] = await Promise.all([
      db.select().from(printerProfiles).where(inArray(printerProfiles.userId, printerIds)),
      db.select().from(users).where(inArray(users.id, printerIds)),
      this.computePrintReviewStats(printerIds),
    ]);
    const profileByUser = new Map(profileRows.map((p) => [p.userId, p]));
    const userById = new Map(userRows.map((u) => [u.id, u]));

    const cards: PrintCompanyListCard[] = [];
    for (const printerId of printerIds) {
      const user = userById.get(printerId);
      if (!user) continue;
      const profile = profileByUser.get(printerId);
      // No profile row yet defaults to visible (same lazy-create convention as
      // getPrintMarketplaceCards's hiddenPrinterIds) — a printer with no
      // profile row shouldn't vanish from this list.
      const marketplaceVisible = profile?.marketplaceVisible ?? true;
      const publicationStatus = profile?.publicationStatus ?? "APPROVED";
      if (!marketplaceVisible || publicationStatus !== "APPROVED") continue;
      const stats = statsMap.get(printerId);
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
        description: profile?.description ?? "",
        websiteUrl: profile?.websiteUrl ?? null,
        marketplaceVisible,
        weeklyHours: profile?.weeklyHours ?? null,
        isOnVacation: profile?.isOnVacation ?? false,
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
        portfolioImages: profile?.portfolioImages ?? [],
        categories: user.printCategories ?? [],
        serviceCount: countByPrinter.get(printerId) ?? 0,
        distanceKm,
      });
    }
    // Admin's drag-and-drop reorder (printerProfiles.displayOrder) is the single source
    // of truth for Store-card order here too — mirrors getVisibleStores()'s role for Supplier Stores.
    cards.sort((a, b) => (profileByUser.get(a.userId)?.displayOrder ?? 0) - (profileByUser.get(b.userId)?.displayOrder ?? 0) || a.userId - b.userId);
    return cards;
  }

  /** Admin moderation — toggle any printer's catalog item, no ownership check.
   *  Deliberately narrower than the printer's own updatePrintCatalogItem: Admin
   *  moderates visibility, it doesn't edit another business's catalog content. */
  async adminSetPrintCatalogItemActive(id: number, isActive: boolean): Promise<PrintCatalogItem | undefined> {
    const [updated] = await db.update(printCatalogItems)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(printCatalogItems.id, id))
      .returning();
    return updated;
  }

  async getPrintAdminOverview(): Promise<any> {
    const taxonomy = await this.getPrintCategoryTaxonomy();
    const subcategoryTaxonomy = await this.getPrintSubCategoryTaxonomy();
    const printerRows = await db.select().from(users).where(eq(users.role, "PRINTER" as any));
    const catalogRows = await db.select().from(printCatalogItems);
    const orderRows = await db.select().from(printOrders);
    const reviewRows = await db.select().from(supplierProductReviews).where(eq(supplierProductReviews.reviewType, "PRINT"));
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const profileRows = printerRows.length
      ? await db.select().from(printerProfiles).where(inArray(printerProfiles.userId, printerRows.map((p) => p.id)))
      : [];
    const profileMap = new Map(profileRows.map((p) => [p.userId, p]));

    const categoryCounts = new Map<string, number>();
    for (const item of catalogRows) if (item.category.trim()) {
      categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    }

    const reviewStats = new Map<number, { sum: number; count: number }>();
    for (const r of reviewRows) {
      if (!r.printerId) continue;
      const cur = reviewStats.get(r.printerId) ?? { sum: 0, count: 0 };
      cur.sum += r.rating; cur.count += 1;
      reviewStats.set(r.printerId, cur);
    }

    const printers = printerRows.map((printer) => {
      const items = catalogRows.filter((i) => i.printerId === printer.id);
      const orders = orderRows.filter((o) => o.printerId === printer.id);
      const revenueCents = orders.filter((o) => o.status === "DELIVERED").reduce((s, o) => s + o.totalInCents, 0);
      const stats = reviewStats.get(printer.id);
      const profile = profileMap.get(printer.id);
      return {
        userId: printer.id,
        name: printer.name,
        email: printer.email,
        phone: printer.phone,
        profileImageUrl: printer.profileImageUrl,
        coverImageUrl: printer.coverImageUrl,
        status: printer.status,
        location: printer.locationAddress ?? "",
        createdAt: printer.createdAt,
        description: profile?.description ?? "",
        websiteUrl: profile?.websiteUrl ?? null,
        marketplaceVisible: profile?.marketplaceVisible ?? true,
        isFrozen: profile?.isFrozen ?? false,
        // GO Live review state (Phase 5D) — read by Admin PRINT's account detail
        // to show the status badge + Approve/Reject block, same as Maintenance.
        publicationStatus: profile?.publicationStatus ?? "DRAFT",
        publicationRejectionReason: profile?.publicationRejectionReason ?? null,
        displayOrder: profile?.displayOrder ?? 0,
        autoApprove: profile?.autoApprove ?? false,
        activeServiceCount: items.filter((i) => i.isActive).length,
        totalServiceCount: items.length,
        totalOrders: orders.length,
        revenueCents,
        rating: stats ? Math.round((stats.sum / stats.count) * 10) : 0,
        reviewCount: stats?.count ?? 0,
        initials: printer.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      };
    });

    const orders = orderRows
      .slice()
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .map((o) => ({
        ...o,
        printerName: userMap.get(o.printerId)?.name ?? "—",
        cafeOwnerName: userMap.get(o.cafeOwnerId)?.name ?? "—",
      }));

    const reviews = reviewRows.map((r) => ({
      ...r,
      printerName: r.printerId ? (userMap.get(r.printerId)?.name ?? "—") : "—",
    }));

    // Enriched with the same per-printer rating/availability/visibility already
    // computed above for the `printers` tab (reviewStats/profileMap) — mirrors
    // Admin Marketing's Services tab, which attaches agencyRating/agencyIsAvailable/
    // agencyMarketplaceVisible per service (docs/print_services_management_marketing_synchronization_audit.md).
    const catalogItems = catalogRows
      .slice()
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .map((item) => {
        const printerStats = reviewStats.get(item.printerId);
        const printerProfile = profileMap.get(item.printerId);
        return {
          ...item,
          printerName: userMap.get(item.printerId)?.name ?? "—",
          printerRating: printerStats ? Math.round((printerStats.sum / printerStats.count) * 10) : 0,
          printerReviewCount: printerStats?.count ?? 0,
          printerIsAvailable: !(printerProfile?.isOnVacation ?? false),
          printerMarketplaceVisible: printerProfile?.marketplaceVisible ?? true,
        };
      });

    const deliveredOrders = orderRows.filter((o) => o.status === "DELIVERED");
    const totalRevenueCents = deliveredOrders.reduce((s, o) => s + o.totalInCents, 0);
    const totalReviewRating = reviewRows.reduce((s, r) => s + r.rating, 0);

    return {
      stats: {
        totalPrinters: printerRows.length,
        activePrinters: printerRows.filter((p) => p.status === "approved").length,
        availablePrinters: printers.filter((p) => p.activeServiceCount > 0).length,
        totalServices: catalogRows.length,
        activeServices: catalogRows.filter((i) => i.isActive).length,
        totalOrders: orderRows.length,
        pendingOrders: orderRows.filter((o) => o.status === "PENDING").length,
        inProductionOrders: orderRows.filter((o) => o.status === "PREPARING").length,
        completedOrders: deliveredOrders.length,
        cancelledOrders: orderRows.filter((o) => o.status === "CANCELLED").length,
        totalRevenueCents,
        reviewCount: reviewRows.length,
        averageRating: reviewRows.length ? Math.round((totalReviewRating / reviewRows.length) * 10) / 10 : 0,
      },
      categories: Array.from(categoryCounts, ([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      taxonomy,
      subcategoryTaxonomy,
      printers,
      catalogItems,
      orders,
      reviews,
    };
  }
}
