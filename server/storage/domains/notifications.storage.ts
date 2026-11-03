import { db } from "../../db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { users, notifications, type Notification, type InsertNotification, type NotificationService } from "@shared/schema";

// Stage 2 extraction — Notifications domain (includes "Notification
// preferences"). Moved verbatim out of server/storage.ts's DatabaseStorage
// class; see server/STORAGE_ARCHITECTURE.md ("Stage 2 — Batch 2") for the
// dependency analysis (zero transactions, zero cross-domain `this.*` calls in
// or out — the only internal call is updateNotificationPreferences calling
// its own sibling getNotificationPreferences).
export class NotificationsStorage {
  // Stored on users.notificationPreferences — see shared/notification-preferences.ts.

  async getNotificationPreferences(userId: number): Promise<Record<string, boolean> | null> {
    const [row] = await db.select({ p: users.notificationPreferences }).from(users).where(eq(users.id, userId));
    return row?.p ?? null;
  }

  /** Merge-patch a user's preference map (only the passed keys change) and return the merged result. */
  async updateNotificationPreferences(userId: number, patch: Record<string, boolean>): Promise<Record<string, boolean>> {
    const current = (await this.getNotificationPreferences(userId)) ?? {};
    const merged = { ...current, ...patch };
    await db.update(users).set({ notificationPreferences: merged }).where(eq(users.id, userId));
    return merged;
  }

  /** Narrow a recipient list down to only those who haven't disabled `prefKey`. */
  async filterUsersWithPreferenceEnabled(userIds: number[], prefKey: string): Promise<number[]> {
    if (userIds.length === 0) return [];
    const rows = await db.select({ id: users.id, p: users.notificationPreferences }).from(users).where(inArray(users.id, userIds));
    return rows.filter((r) => (r.p as Record<string, boolean> | null)?.[prefKey] !== false).map((r) => r.id);
  }

  // One coherent notification source for every service. dedupeKey carries the
  // same idempotency pattern used elsewhere in this file (createDeliveryForSubOrder,
  // acceptBaristaRequest, etc.) — a bare .onConflictDoNothing() against the single
  // unique index on notifications.dedupeKey, so retries/reconnects/duplicate
  // realtime listeners can never double-insert the same event for the same recipient.

  /** Create one notification. Returns undefined if dedupeKey already exists (duplicate event). */
  async createNotification(data: InsertNotification): Promise<Notification | undefined> {
    const [row] = await db.insert(notifications).values(data).onConflictDoNothing().returning();
    return row;
  }

  /** Create the same notification for multiple recipients (e.g. an event with several stakeholders). Each recipient's row is deduped independently via `${dedupeKeyPrefix}:${userId}`. */
  async createNotificationsForUsers(
    userIds: number[],
    data: Omit<InsertNotification, "userId" | "dedupeKey">,
    dedupeKeyPrefix: string,
  ): Promise<Notification[]> {
    const unique = Array.from(new Set(userIds));
    if (unique.length === 0) return [];
    return db.insert(notifications).values(
      unique.map((userId) => ({ ...data, userId, dedupeKey: `${dedupeKeyPrefix}:${userId}` }))
    ).onConflictDoNothing().returning();
  }

  async getNotificationsForUser(userId: number, opts: { service?: NotificationService; unreadOnly?: boolean; limit?: number } = {}): Promise<Notification[]> {
    const { service, unreadOnly, limit = 50 } = opts;
    const conditions = [eq(notifications.userId, userId)];
    if (service) conditions.push(eq(notifications.service, service));
    if (unreadOnly) conditions.push(eq(notifications.isRead, false));
    return db.select().from(notifications).where(and(...conditions)).orderBy(desc(notifications.createdAt)).limit(limit);
  }

  async getUnreadNotificationCount(userId: number, service?: NotificationService): Promise<number> {
    const conditions = [eq(notifications.userId, userId), eq(notifications.isRead, false)];
    if (service) conditions.push(eq(notifications.service, service));
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(and(...conditions));
    return count;
  }

  /** Ownership-scoped — a notification can only be marked read by its own recipient. */
  async markNotificationRead(id: number, userId: number): Promise<void> {
    await db.update(notifications).set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllNotificationsRead(userId: number, service?: NotificationService): Promise<void> {
    const conditions = [eq(notifications.userId, userId), eq(notifications.isRead, false)];
    if (service) conditions.push(eq(notifications.service, service));
    await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(and(...conditions));
  }
}
