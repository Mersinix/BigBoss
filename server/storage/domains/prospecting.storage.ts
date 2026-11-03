import { db } from "../../db";
import { eq, and, inArray, asc, desc, sql, isNull, isNotNull, or, like } from "drizzle-orm";
import {
  users, prospects, prospectCustomTypes, PROSPECT_TYPES,
  type Prospect, type InsertProspect, type ProspectStats,
} from "@shared/schema";

// Stage 2 extraction — Prospecting domain. Moved verbatim out of
// server/storage.ts's DatabaseStorage class; see
// server/STORAGE_ARCHITECTURE.md ("Stage 2 — First extraction batch") for the
// dependency analysis that made this the first domain extracted (zero
// transactions, zero cross-domain `this.*` calls in or out).
export class ProspectingStorage {
  // Last-8-digits comparison robustly treats +216XXXXXXXX / 216XXXXXXXX /
  // 0XXXXXXXX / XXXXXXXX as the same Tunisian number regardless of how either
  // side happened to store it (international prefix, trunk 0, spaces/dashes).
  private normalizePhoneForMatch(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) return null; // too short to reliably match — avoid false positives
    return digits.slice(-8);
  }
  private normalizeEmailForMatch(email: string | null | undefined): string | null {
    const e = email?.trim().toLowerCase();
    return e || null;
  }

  // Batch account-existence check for a page of prospects — one pass over the
  // users table (not one query per prospect) so this stays cheap on the list
  // endpoint. Always computed live from current users/prospect data, never
  // persisted on the prospect row, so it can never go stale when either side's
  // contact info changes (task's own synchronization requirement).
  async matchProspectsToAccounts(
    prospectList: { id: number; email: string | null; phone: string | null }[]
  ): Promise<Map<number, { status: 'MATCHED' | 'AMBIGUOUS' | 'NONE'; accounts: { id: number; name: string; email: string; role: string }[] }>> {
    const result = new Map<number, { status: 'MATCHED' | 'AMBIGUOUS' | 'NONE'; accounts: { id: number; name: string; email: string; role: string }[] }>();
    const needsAny = prospectList.some((p) => p.email || p.phone);
    if (!needsAny) {
      for (const p of prospectList) result.set(p.id, { status: 'NONE', accounts: [] });
      return result;
    }
    const allUsers = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role }).from(users);
    const byEmail = new Map<string, typeof allUsers>();
    const byPhone = new Map<string, typeof allUsers>();
    for (const u of allUsers) {
      const em = this.normalizeEmailForMatch(u.email);
      if (em) { const arr = byEmail.get(em) ?? []; arr.push(u); byEmail.set(em, arr); }
      const ph = this.normalizePhoneForMatch(u.phone);
      if (ph) { const arr = byPhone.get(ph) ?? []; arr.push(u); byPhone.set(ph, arr); }
    }
    for (const p of prospectList) {
      const em = this.normalizeEmailForMatch(p.email);
      const ph = this.normalizePhoneForMatch(p.phone);
      const emailMatches = em ? (byEmail.get(em) ?? []) : [];
      const phoneMatches = ph ? (byPhone.get(ph) ?? []) : [];
      // Union by user id — a single account matched by both email and phone is
      // one confirmed match, not two.
      const byId = new Map<number, typeof allUsers[number]>();
      for (const u of [...emailMatches, ...phoneMatches]) byId.set(u.id, u);
      const matched = Array.from(byId.values());
      // Email and phone each matched, but pointing at DIFFERENT accounts — don't
      // silently assume they're the same person (task requirement #6): surface
      // as ambiguous rather than picking one arbitrarily.
      const conflicting = emailMatches.length > 0 && phoneMatches.length > 0 &&
        !emailMatches.some((e) => phoneMatches.some((ph2) => ph2.id === e.id));
      let status: 'MATCHED' | 'AMBIGUOUS' | 'NONE';
      if (matched.length === 0) status = 'NONE';
      else if (matched.length > 1 || conflicting) status = 'AMBIGUOUS';
      else status = 'MATCHED';
      result.set(p.id, { status, accounts: matched.map((u) => ({ id: u.id, name: u.name, email: u.email ?? '', role: u.role })) });
    }
    return result;
  }

  async getProspects(params: {
    search?: string; status?: string; prospectType?: string; city?: string;
    assignedTo?: number | null; hasPhone?: boolean; hasWebsite?: boolean; hasEmail?: boolean;
    minRating?: number; page?: number; limit?: number; sortBy?: string; sortOrder?: string;
  }): Promise<{ prospects: Prospect[]; total: number }> {
    const { search, status, prospectType, city, hasPhone, hasWebsite, hasEmail, minRating, page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    const conds: any[] = [isNull(prospects.deletedAt)];
    if (search?.trim()) {
      const q = `%${search.trim()}%`;
      conds.push(or(like(prospects.businessName, q), like(prospects.phone as any, q), like(prospects.city as any, q), like(prospects.address as any, q)));
    }
    if (status) conds.push(eq(prospects.status, status));
    if (prospectType) conds.push(eq(prospects.prospectType as any, prospectType));
    if (city) conds.push(like(prospects.city as any, `%${city}%`));
    if (hasPhone === true) conds.push(isNotNull(prospects.phone));
    if (hasPhone === false) conds.push(isNull(prospects.phone));
    if (hasWebsite === true) conds.push(isNotNull(prospects.website));
    if (hasWebsite === false) conds.push(isNull(prospects.website));
    if (hasEmail === true) conds.push(isNotNull(prospects.email));
    // rating is stored as text — cast for a numeric comparison. NULL ratings
    // naturally fail this comparison (never coerced to 0), so a prospect with no
    // rating simply never matches a "2+"/"3+"/etc. filter — not treated as 0-rated.
    if (minRating != null) conds.push(sql`${prospects.rating} IS NOT NULL AND CAST(${prospects.rating} AS DECIMAL) >= ${minRating}`);
    const where = conds.length === 1 ? conds[0] : and(...conds);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(prospects).where(where);
    const offset = (page - 1) * limit;
    let orderCol: any;
    if (sortBy === 'businessName') orderCol = sortOrder === 'asc' ? asc(prospects.businessName) : desc(prospects.businessName);
    else if (sortBy === 'rating') orderCol = sortOrder === 'asc' ? asc(prospects.rating) : desc(prospects.rating);
    else if (sortBy === 'reviewCount') orderCol = sortOrder === 'asc' ? asc(prospects.reviewCount) : desc(prospects.reviewCount);
    else if (sortBy === 'distanceKm') orderCol = sortOrder === 'asc' ? asc(prospects.distanceKm) : desc(prospects.distanceKm);
    else orderCol = sortOrder === 'asc' ? asc(prospects.createdAt) : desc(prospects.createdAt);
    const rows = await db.select().from(prospects).where(where).orderBy(orderCol).limit(limit).offset(offset);
    return { prospects: rows, total: count };
  }

  async getProspect(id: number): Promise<Prospect | null> {
    const [row] = await db.select().from(prospects).where(and(eq(prospects.id, id), isNull(prospects.deletedAt)));
    return row ?? null;
  }

  async createProspect(data: Partial<InsertProspect>): Promise<Prospect> {
    const [row] = await db.insert(prospects).values({
      ...data,
      notes: (data.notes as any) ?? [],
      timeline: (data.timeline as any) ?? [],
      contacts: (data.contacts as any) ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }

  async updateProspect(id: number, data: Partial<InsertProspect>): Promise<Prospect> {
    const [row] = await db.update(prospects).set({ ...data as any, updatedAt: new Date() }).where(eq(prospects.id, id)).returning();
    return row;
  }

  async softDeleteProspect(id: number): Promise<void> {
    await db.update(prospects).set({ deletedAt: new Date(), updatedAt: new Date() } as any).where(eq(prospects.id, id));
  }

  async bulkUpdateProspects(ids: number[], data: Partial<Prospect>): Promise<void> {
    if (!ids.length) return;
    await db.update(prospects).set({ ...data as any, updatedAt: new Date() }).where(inArray(prospects.id, ids));
  }

  async bulkSoftDeleteProspects(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await db.update(prospects).set({ deletedAt: new Date(), updatedAt: new Date() } as any).where(inArray(prospects.id, ids));
  }

  async getProspectStats(): Promise<ProspectStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);
    const all = await db.select().from(prospects).where(isNull(prospects.deletedAt));
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let withPhone = 0, withWebsite = 0, withEmail = 0, ratingSum = 0, ratingCount = 0;
    let followUpsToday = 0, overdueFollowUps = 0, convertedCount = 0, calledToday = 0, interestedCount = 0;
    for (const p of all) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
      if (p.prospectType) byType[p.prospectType] = (byType[p.prospectType] ?? 0) + 1;
      if (p.phone) withPhone++;
      if (p.website) withWebsite++;
      if (p.email) withEmail++;
      if (p.rating) { const r = parseFloat(p.rating); if (!isNaN(r)) { ratingSum += r; ratingCount++; } }
      if (p.status === 'CONVERTED') convertedCount++;
      if (p.status === 'INTERESTED') interestedCount++;
      if (p.nextFollowUpDate) {
        const fd = new Date(p.nextFollowUpDate);
        if (fd >= todayStart && fd < tomorrowStart) followUpsToday++;
        if (fd < todayStart) overdueFollowUps++;
      }
      if (p.lastContactDate) { const ld = new Date(p.lastContactDate); if (ld >= todayStart) calledToday++; }
    }
    return { total: all.length, byStatus, byType, withPhone, withWebsite, withEmail, avgRating: ratingCount > 0 ? ratingSum / ratingCount : 0, followUpsToday, overdueFollowUps, convertedCount, calledToday, interestedCount };
  }

  // ── Prospect types (built-ins ∪ admin-added) ─────────────────────────────────
  // Built-ins come from the compiled-in PROSPECT_TYPES constant (existing prospect
  // records already reference these keys and they're never editable/deletable);
  // this just layers admin-added custom ones on top so every screen (filter, Edit
  // Details, Add Manually, Google Places search) reads the same merged list.
  async getAllProspectTypes(): Promise<{ key: string; label: string; builtin: boolean }[]> {
    const builtins = PROSPECT_TYPES.map((key) => ({
      key,
      label: key.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' '),
      builtin: true,
    }));
    const custom = await db.select().from(prospectCustomTypes).orderBy(asc(prospectCustomTypes.label));
    return [...builtins, ...custom.map((c) => ({ key: c.key, label: c.label, builtin: false }))];
  }

  async createProspectCustomType(label: string): Promise<{ key: string; label: string; builtin: boolean }> {
    const trimmed = label.trim();
    // Normalize the same way the rest of the module's existing type keys look
    // (UPPER_SNAKE_CASE) so a newly created type behaves identically to a
    // built-in one everywhere it's used (Select value, filter param, etc.).
    const key = trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) throw new Error('Invalid type name');
    if ((PROSPECT_TYPES as readonly string[]).includes(key)) {
      throw new Error('This type already exists');
    }
    const [existing] = await db.select().from(prospectCustomTypes).where(eq(prospectCustomTypes.key, key));
    if (existing) throw new Error('This type already exists');
    const [row] = await db.insert(prospectCustomTypes).values({ key, label: trimmed }).returning();
    return { key: row.key, label: row.label, builtin: false };
  }

  async findDuplicateProspect(data: { googlePlaceId?: string; phone?: string }): Promise<Prospect | null> {
    if (data.googlePlaceId) {
      const [row] = await db.select().from(prospects).where(and(eq(prospects.googlePlaceId as any, data.googlePlaceId), isNull(prospects.deletedAt)));
      if (row) return row;
    }
    if (data.phone) {
      const [row] = await db.select().from(prospects).where(and(eq(prospects.phone as any, data.phone), isNull(prospects.deletedAt)));
      if (row) return row;
    }
    return null;
  }
}
