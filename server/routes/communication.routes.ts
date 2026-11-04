import { requireAuth, requireAdmin } from "./shared/middleware";
import { storage } from "../storage";
import { z } from "zod";
import { broadcast, broadcastToUsers } from "../ws";
import { notifyMany } from "../notify";
import type { Express } from "express";

export function registerCommunicationRoutes(app: Express): void {
    // ── Messages System controls ───────────────────────────────────────────────

    app.get("/api/messages/settings", requireAuth, async (req: any, res) => {
      try {
        const settings = await storage.getMessagingSettings();
        const user = await storage.getUser(req.session.userId);
        // Admins always retain visibility of the management system.
        if (user && !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
          return res.json({ ...settings });
        }
        res.json(settings);
      } catch {
        res.status(500).json({ message: "Failed to load messaging settings" });
      }
    });

    app.patch("/api/admin/messages/settings", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          globalVisible: z.boolean().optional(),
          supplierMessagingEnabled: z.boolean().optional(),
          maintenanceMessagingEnabled: z.boolean().optional(),
          baristaMessagingEnabled: z.boolean().optional(),
          academyMessagingEnabled: z.boolean().optional(),
          broadcastsEnabled: z.boolean().optional(),
          gracePeriodMinutes: z.number().int().min(1).max(240).optional(),
        }).strict().parse(req.body);
        const settings = await storage.updateMessagingSettings(body);
        broadcast("messages_settings_updated", settings);
        res.json(settings);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid Messages System settings" });
        res.status(500).json({ message: "Failed to update messaging settings" });
      }
    });

    // ── Messaging routes ──────────────────────────────────────────────────────

    /** GET /api/messages/conversations — list all visible conversations for the current user */
    app.get("/api/messages/conversations", requireAuth, async (req: any, res) => {
      try {
        const userId: number = req.session.userId;
        const service = typeof req.query.service === "string" ? req.query.service : undefined;
        if (service && !["SHOP", "MAINTENANCE", "BARISTA", "ACADEMY", "PRINT", "MARKETING"].includes(service)) {
          return res.status(400).json({ message: "Invalid service" });
        }
        const conversations = await storage.getConversationsForUser(userId, service);
        res.json(conversations);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** POST /api/messages/conversations — find or create a direct conversation */
    app.post("/api/messages/conversations", requireAuth, async (req: any, res) => {
      const { targetUserId, service = "SHOP" } = req.body;
      if (!targetUserId || typeof targetUserId !== "number") {
        return res.status(400).json({ message: "targetUserId is required" });
      }
      if (typeof service !== "string" || !["SHOP", "MAINTENANCE", "BARISTA", "ACADEMY", "PRINT", "MARKETING"].includes(service)) {
        return res.status(400).json({ message: "Invalid service" });
      }
      try {
        const userId: number = req.session.userId;
        const me = await storage.getUser(userId);
        if (!me) return res.status(401).json({ message: "User not found" });
        // Authorization: verify the target belongs to the selected service for
        // every role, including Admin. This prevents cross-service conversations
        // from being created by a forged targetUserId.
        const eligible = await storage.getEligibleContacts(userId, service);
        if (!eligible.some(c => c.id === targetUserId)) {
          return res.status(403).json({ message: "You are not authorized to message this user in the selected service" });
        }
        const { conversation, isNew } = await storage.findOrCreateDirectConversation(userId, targetUserId, service);
        // Notify both participants immediately so the other side sees the conversation appear in real time
        broadcast("conversation_updated", { conversationId: conversation.id, service });
        broadcastToUsers([userId, targetUserId], "conversation_updated", { conversationId: conversation.id });
        res.json({ conversation, isNew });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** GET /api/messages/conversations/:id/messages — paginated messages */
    app.get("/api/messages/conversations/:id/messages", requireAuth, async (req: any, res) => {
      const convId = parseInt(req.params.id);
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 200);
      try {
        const userId: number = req.session.userId;
        const authorized = await storage.isParticipant(convId, userId);
        if (!authorized) return res.status(403).json({ message: "Not authorized" });
        const { msgs, total } = await storage.getConversationMessages(convId, page, pageSize);
        res.json({ messages: msgs, total, page, pageSize });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** POST /api/messages/conversations/:id/messages — send a message */
    app.post("/api/messages/conversations/:id/messages", requireAuth, async (req: any, res) => {
      const convId = parseInt(req.params.id);
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ message: "content is required" });
      try {
        const userId: number = req.session.userId;
        const authorized = await storage.isParticipant(convId, userId);
        if (!authorized) return res.status(403).json({ message: "Not authorized" });
        const msg = await storage.sendMessage(convId, userId, content.trim());
        // Notify all participants via WebSocket
        const participantIds = await storage.getConversationParticipantIds(convId);
        broadcast("new_message", { conversationId: convId, message: msg });
        broadcastToUsers(participantIds, "new_message", { conversationId: convId, message: msg });
        // A lightweight pointer into the notification center (Part 16/31 — never the
        // message content itself, no second conversation) for every OTHER participant.
        const convService = await storage.getConversationService(convId);
        const preview = msg.content.length > 80 ? `${msg.content.slice(0, 80)}…` : msg.content;
        const recipients = participantIds.filter((id) => id !== userId);
        await notifyMany({
          userIds: recipients,
          service: (convService as any) ?? "SHOP", type: "new_message", priority: "INFO",
          title: `Nouveau message de ${msg.senderName}`,
          message: preview,
          entityType: "conversation", entityId: convId,
          prefKey: "messages",
          dedupeKeyPrefix: `messages:new_message:${msg.id}`,
        });
        res.json(msg);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** PATCH /api/messages/conversations/:id/read — mark conversation as read */
    app.patch("/api/messages/conversations/:id/read", requireAuth, async (req: any, res) => {
      const convId = parseInt(req.params.id);
      try {
        const userId: number = req.session.userId;
        if (!await storage.isParticipant(convId, userId)) {
          return res.status(403).json({ message: "Not authorized" });
        }
        await storage.markConversationRead(convId, userId);
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** GET /api/messages/eligible-contacts — users I can start a conversation with */
    app.get("/api/messages/eligible-contacts", requireAuth, async (req: any, res) => {
      try {
        const userId: number = req.session.userId;
        const service = typeof req.query.service === "string" ? req.query.service : undefined;
        if (service && !["SHOP", "MAINTENANCE", "BARISTA", "ACADEMY", "PRINT", "MARKETING"].includes(service)) {
          return res.status(400).json({ message: "Invalid service" });
        }
        const contacts = await storage.getEligibleContacts(userId, service);
        res.json(contacts);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** GET /api/messages/unread-count — unread badge count */
    app.get("/api/messages/unread-count", requireAuth, async (req: any, res) => {
      try {
        const userId: number = req.session.userId;
        const count = await storage.getUnreadMessageCount(userId);
        res.json({ count });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** POST /api/messages/broadcast — admin creates a broadcast conversation */
    app.post("/api/messages/broadcast", requireAdmin, async (req: any, res) => {
      const { title, targetUserIds, content } = req.body;
      if (!title || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
        return res.status(400).json({ message: "title and targetUserIds are required" });
      }
      try {
        const adminId: number = req.session.userId;
        const settings = await storage.getMessagingSettings();
        if (!settings.broadcastsEnabled) return res.status(403).json({ message: "Broadcasts are disabled" });
        const conv = await storage.createBroadcastConversation(adminId, title, targetUserIds);
        if (content?.trim()) {
          const msg = await storage.sendMessage(conv.id, adminId, content.trim());
          broadcastToUsers(targetUserIds, "new_message", { conversationId: conv.id, message: msg });
          const preview = msg.content.length > 80 ? `${msg.content.slice(0, 80)}…` : msg.content;
          await notifyMany({
            userIds: targetUserIds,
            service: "ADMIN", type: "new_message", priority: "INFO",
            title: `Message de l'administration : ${title}`,
            message: preview,
            entityType: "conversation", entityId: conv.id,
            prefKey: "messages",
            dedupeKeyPrefix: `messages:broadcast:${msg.id}`,
          });
        }
        res.json({ conversation: conv });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** PATCH /api/messages/conversations/:id/visibility — admin hide/show a conversation */
    app.patch("/api/messages/conversations/:id/visibility", requireAdmin, async (req: any, res) => {
      const convId = parseInt(req.params.id);
      const { targetUserId, hidden } = req.body;
      if (typeof hidden !== "boolean") return res.status(400).json({ message: "hidden (boolean) is required" });
      try {
        const adminId: number = req.session.userId;
        await storage.setConversationVisibility(convId, targetUserId ?? null, hidden, adminId);
        // Notify affected user(s)
        const affectedIds = targetUserId ? [targetUserId] : await storage.getConversationParticipantIds(convId);
        broadcastToUsers(affectedIds, "conversation_updated", { conversationId: convId });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** DELETE /api/messages/conversations/:id — admin permanently deletes a conversation and its messages */
    app.delete("/api/messages/conversations/:id", requireAdmin, async (req: any, res) => {
      const convId = parseInt(req.params.id);
      if (!Number.isInteger(convId)) return res.status(400).json({ message: "Invalid conversation id" });
      try {
        const participantIds = await storage.deleteConversation(convId);
        broadcast("conversation_deleted", { conversationId: convId });
        broadcastToUsers(participantIds, "conversation_deleted", { conversationId: convId });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** GET /api/messages/admin/export — admin CSV export by selection or period */
    app.get("/api/messages/admin/export", requireAdmin, async (req: any, res) => {
      try {
        const service = typeof req.query.service === "string" ? req.query.service : undefined;
        const ids = typeof req.query.ids === "string"
          ? req.query.ids.split(",").map(Number).filter(Number.isInteger)
          : undefined;
        let from: Date | undefined;
        let to: Date | undefined;
        const period = typeof req.query.date === "string" ? req.query.date
          : typeof req.query.month === "string" ? req.query.month
          : typeof req.query.from === "string" ? req.query.from : undefined;
        const rawTo = typeof req.query.to === "string" ? req.query.to : undefined;
        if (period) {
          const parsed = new Date(period.length === 7 ? `${period}-01T00:00:00` : `${period}T00:00:00`);
          if (Number.isNaN(parsed.getTime())) return res.status(400).json({ message: "Invalid export period" });
          from = parsed;
          if (period.length === 7) {
            to = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 1);
            to.setMilliseconds(to.getMilliseconds() - 1);
          } else {
            to = new Date(parsed);
            to.setDate(to.getDate() + 1);
            to.setMilliseconds(to.getMilliseconds() - 1);
          }
        }
        if (rawTo) {
          const parsedTo = new Date(`${rawTo}T00:00:00`);
          if (Number.isNaN(parsedTo.getTime())) return res.status(400).json({ message: "Invalid export end date" });
          to = new Date(parsedTo);
          to.setDate(to.getDate() + 1);
          to.setMilliseconds(to.getMilliseconds() - 1);
        }
        const rows = await storage.getAdminConversationExport({ service, ids, from, to });
        const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        const header = [
          "Conversation ID", "Participants", "Participant roles", "Conversation type",
          "Service/context", "Created date", "Last activity", "Message count",
          "Message ID", "Sender", "Sender role", "Message timestamp", "Message/content",
        ];
        const csvRows = [header, ...rows.map(row => [
          row.conversation.id,
          row.participants.map(p => p.name).join(" | "),
          row.participants.map(p => p.role).join(" | "),
          row.conversation.type,
          row.conversation.service,
          row.conversation.createdAt?.toISOString(),
          row.conversation.lastMessageAt?.toISOString(),
          rows.filter(r => r.conversation.id === row.conversation.id).length,
          row.message?.id,
          row.message?.senderName,
          row.message?.senderRole,
          row.message?.createdAt,
          row.message?.content,
        ])].map(row => row.map(csvEscape).join(",")).join("\r\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="conversations-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send(`\uFEFF${csvRows}`);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });

    /** GET /api/messages/admin/all — admin: all conversations with participant summaries */
    app.get("/api/messages/admin/all", requireAdmin, async (req, res) => {
      try {
        const service = typeof req.query.service === "string" ? req.query.service : undefined;
        if (service && !["SHOP", "MAINTENANCE", "BARISTA", "ACADEMY", "PRINT", "MARKETING"].includes(service)) {
          return res.status(400).json({ message: "Invalid service" });
        }
        const conversations = await storage.adminGetAllConversations(service);
        res.json(conversations);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    });
}
