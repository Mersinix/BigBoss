import { storage } from "./storage";
import { broadcastToUsers } from "./ws";
import type { NotificationService, NotificationPriority } from "@shared/schema";
import type { NotificationPrefKey } from "@shared/notification-preferences";

interface NotifyParams {
  userId: number;
  service: NotificationService;
  type: string;
  title: string;
  message: string;
  priority?: NotificationPriority;
  entityType?: string;
  entityId?: number;
  dedupeKey?: string;
  /**
   * Which opt-out toggle (see shared/notification-preferences.ts) gates this
   * notification. Omit only for notifications that must never be silenceable
   * (e.g. account approved/rejected) — everything else should carry one.
   */
  prefKey?: NotificationPrefKey;
}

/**
 * Create a persistent notification for one user and push it over the realtime
 * channel. Call this right alongside a route handler's existing broadcast()/
 * broadcastToUsers() call for the same business event — creation is idempotent
 * via dedupeKey (storage.createNotification uses onConflictDoNothing), so it is
 * safe against retries, reconnects, and duplicate listeners. If the recipient has
 * opted out of `prefKey`, nothing is created — this only affects future
 * notifications, never historical ones already stored.
 */
export async function notify(params: NotifyParams): Promise<void> {
  const { userId, priority = "INFO", prefKey, ...rest } = params;
  if (prefKey) {
    const prefs = await storage.getNotificationPreferences(userId);
    if (prefs?.[prefKey] === false) return;
  }
  const row = await storage.createNotification({ userId, priority, ...rest });
  if (!row) return; // duplicate event for this recipient — already notified
  broadcastToUsers([userId], "notification_created", { notification: row });
}

interface NotifyManyParams extends Omit<NotifyParams, "userId" | "dedupeKey"> {
  userIds: number[];
  dedupeKeyPrefix: string;
}

/**
 * Same event, several recipients (e.g. a delivery update relevant to Coffee
 * Owner + Supplier + Delivery Company). Each recipient's row is deduped
 * independently via `${dedupeKeyPrefix}:${userId}`, and each recipient's own
 * preference for `prefKey` is checked independently before their row is created.
 */
export async function notifyMany(params: NotifyManyParams): Promise<void> {
  const { userIds, dedupeKeyPrefix, priority = "INFO", prefKey, ...rest } = params;
  const recipients = prefKey ? await storage.filterUsersWithPreferenceEnabled(userIds, prefKey) : userIds;
  const rows = await storage.createNotificationsForUsers(recipients, { priority, ...rest }, dedupeKeyPrefix);
  for (const row of rows) {
    broadcastToUsers([row.userId], "notification_created", { notification: row });
  }
}
