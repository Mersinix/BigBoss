import { requireAuth } from "./shared/middleware";
import { storage } from "../storage";
import { z } from "zod";
import { broadcastToUsers } from "../ws";
import type { Express } from "express";

export function registerNotificationsRoutes(app: Express): void {
    // ── Notification preferences ────────────────────────────────────────────
    // Stored on the user's own row (users.notificationPreferences) — reuses the
    // same PATCH-then-broadcast pattern as /api/auth/me/profile below, so a
    // preference change syncs to every open tab/device the same way a profile
    // edit already does (user_profile_updated → invalidate /api/auth/me), with no
    // new realtime plumbing.
    app.get("/api/notification-preferences", requireAuth, async (req: any, res) => {
      try {
        const prefs = await storage.getNotificationPreferences(req.session.userId);
        res.json({ preferences: prefs ?? {} });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    app.patch("/api/notification-preferences", requireAuth, async (req: any, res) => {
      try {
        const patch = z.record(z.string(), z.boolean()).parse(req.body);
        const merged = await storage.updateNotificationPreferences(req.session.userId, patch);
        broadcastToUsers([req.session.userId], "user_profile_updated");
        res.json({ preferences: merged });
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid preferences payload" });
        res.status(500).json({ message: err.message });
      }
    });

    // ── Notifications ────────────────────────────────────────────────────────
    const NOTIFICATION_SERVICES = ["ADMIN", "SHOP", "PRINT", "MAINTENANCE", "BARISTA", "ACADEMY", "MARKETING"];

    /** GET /api/notifications — the requesting user's own notifications, optionally filtered by service */
    app.get("/api/notifications", requireAuth, async (req: any, res) => {
      try {
        const userId: number = req.session.userId;
        const service = typeof req.query.service === "string" ? req.query.service : undefined;
        if (service && !NOTIFICATION_SERVICES.includes(service)) {
          return res.status(400).json({ message: "Invalid service" });
        }
        const unreadOnly = req.query.unreadOnly === "true";
        const limit = req.query.limit ? Math.min(parseInt(req.query.limit), 200) : undefined;
        const items = await storage.getNotificationsForUser(userId, { service: service as any, unreadOnly, limit });
        res.json(items);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** GET /api/notifications/unread-count — badge count, optionally scoped to a service */
    app.get("/api/notifications/unread-count", requireAuth, async (req: any, res) => {
      try {
        const userId: number = req.session.userId;
        const service = typeof req.query.service === "string" ? req.query.service : undefined;
        if (service && !NOTIFICATION_SERVICES.includes(service)) {
          return res.status(400).json({ message: "Invalid service" });
        }
        const count = await storage.getUnreadNotificationCount(userId, service as any);
        res.json({ count });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** PATCH /api/notifications/:id/read — mark one notification read (ownership-scoped in storage) */
    app.patch("/api/notifications/:id/read", requireAuth, async (req: any, res) => {
      try {
        const userId: number = req.session.userId;
        const id = parseInt(req.params.id);
        await storage.markNotificationRead(id, userId);
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** PATCH /api/notifications/read-all — mark all (optionally: all within one service) as read */
    app.patch("/api/notifications/read-all", requireAuth, async (req: any, res) => {
      try {
        const userId: number = req.session.userId;
        const service = typeof req.body?.service === "string" ? req.body.service : undefined;
        if (service && !NOTIFICATION_SERVICES.includes(service)) {
          return res.status(400).json({ message: "Invalid service" });
        }
        await storage.markAllNotificationsRead(userId, service as any);
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });
}
