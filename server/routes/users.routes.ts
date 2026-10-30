import { requireAuth, requireAdmin } from "./shared/middleware";
import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema";
import { isValidRegistrationPassword, registrationPasswordMessage } from "./shared/helpers";
import { broadcast, broadcastToUsers } from "../ws";
import { notify } from "../notify";
import { eq } from "drizzle-orm";
import type { Express } from "express";

export function registerUsersRoutes(app: Express): void {
    app.get('/api/me/financial-history', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const q = req.query as Record<string, string | undefined>;
        const result = await storage.getActorFinancialHistory({ id: user.id, role: user.role }, {
          entryType: q.entryType || undefined,
          status: q.status || undefined,
          fromDate: q.fromDate ? new Date(q.fromDate) : undefined,
          toDate: q.toDate ? new Date(q.toDate) : undefined,
          page: q.page ? parseInt(q.page) : undefined,
          limit: q.limit ? parseInt(q.limit) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ message: err.message ?? 'Unable to load financial history' });
      }
    });

    app.get('/api/me/settlement-history', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const q = req.query as Record<string, string | undefined>;
        const result = await storage.getActorSettlementHistory({ id: user.id, role: user.role }, {
          status: q.status || undefined,
          page: q.page ? parseInt(q.page) : undefined,
          limit: q.limit ? parseInt(q.limit) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ message: err.message ?? 'Unable to load settlement history' });
      }
    });

    app.get('/api/me/financial-summary', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        res.json(await storage.getActorFinancialSummary({ id: user.id, role: user.role }));
      } catch (err: any) {
        res.status(400).json({ message: err.message ?? 'Unable to load financial summary' });
      }
    });

    // ── Admin Users ────────────────────────────────────────────────────────────

    app.get("/api/admin/users", requireAdmin, async (req, res) => {
      try {
        const allUsers = await db.select().from(users);
        res.json(allUsers);
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.post("/api/admin/users", requireAdmin, async (req, res) => {
      try {
        const {
          name, email, password, role, phone, isWhatsapp, profileImageUrl,
          governorates, printCategories, marketingCategories, maintenanceCategories, categories,
          // Location — same fields the public /api/auth/register and the PATCH
          // /api/admin/users/:id route already accept, now also accepted at
          // creation time (previously only settable via a separate PATCH after
          // create) so the Prospecting "Create Account" flow can set it in one
          // call, exactly like the public Inscription flow does.
          locationAddress, locationLat, locationLng, locationPlaceId, locationDetails,
        } = req.body;
        if (!name || !email || !password || !role) return res.status(400).json({ message: "name, email, password and role are required" });
        const { passwordMinLength: adminCreatePasswordMinLength } = await storage.getLoginSecuritySettings();
        if (!isValidRegistrationPassword(password, adminCreatePasswordMinLength)) return res.status(400).json({ message: registrationPasswordMessage(adminCreatePasswordMinLength) });
        const existing = await storage.getUserByEmail(email);
        if (existing) return res.status(400).json({ message: "Email already exists" });
        if (phone) {
          const existingPhone = await storage.getUserByPhone(phone);
          if (existingPhone) return res.status(400).json({ message: "Phone number already in use" });
        }
        const user = await storage.createUser({
          name, email, password, role, status: 'approved',
          phone: phone ?? null,
          isWhatsapp: !!isWhatsapp,
          profileImageUrl: profileImageUrl?.trim() || null,
          governorates: governorates ?? null,
          printCategories: printCategories ?? null,
          marketingCategories: marketingCategories ?? null,
          maintenanceCategories: maintenanceCategories ?? null,
          categories: categories ?? null,
          locationAddress: locationAddress ?? null,
          locationLat: locationLat != null ? String(locationLat) : null,
          locationLng: locationLng != null ? String(locationLng) : null,
          locationPlaceId: locationPlaceId ?? null,
          locationDetails: locationDetails ?? null,
        } as any);
        // Parity with public registration: a MAINTENANCE account gets its profile
        // row created (with sensible defaults) right away rather than waiting for
        // first access — same storage.upsertMaintenanceProfile call /api/auth/register
        // already makes for this role.
        if (role === "MAINTENANCE") {
          await storage.upsertMaintenanceProfile(user.id, {});
        }
        broadcast("admin_user_directory_changed");
        res.status(201).json(user);
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const {
          name, email, phone, isWhatsapp, profileImageUrl,
          governorates, printCategories, marketingCategories, maintenanceCategories, categories,
          locationAddress, locationLat, locationLng, locationPlaceId, locationDetails,
        } = req.body;
        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (phone !== undefined) updates.phone = phone;
        if (isWhatsapp !== undefined) updates.isWhatsapp = !!isWhatsapp;
        if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl?.trim() || null;
        if (governorates !== undefined) updates.governorates = governorates;
        if (printCategories !== undefined) updates.printCategories = printCategories;
        if (marketingCategories !== undefined) updates.marketingCategories = marketingCategories;
        if (maintenanceCategories !== undefined) updates.maintenanceCategories = maintenanceCategories;
        if (categories !== undefined) updates.categories = categories;
        if (locationAddress !== undefined) updates.locationAddress = locationAddress;
        if (locationLat !== undefined) updates.locationLat = locationLat !== null ? String(locationLat) : null;
        if (locationLng !== undefined) updates.locationLng = locationLng !== null ? String(locationLng) : null;
        if (locationPlaceId !== undefined) updates.locationPlaceId = locationPlaceId;
        if (locationDetails !== undefined) updates.locationDetails = locationDetails;
        const updated = await storage.updateUser(id, updates);
        broadcastToUsers([id], "user_profile_updated");
        broadcast("admin_user_directory_changed");
        res.json(updated);
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deleteUser(parseInt(req.params.id));
        broadcast("admin_user_directory_changed");
        res.json({ message: "Deleted" });
      } catch { res.status(500).json({ message: "Error" }); }
    });

    async function notifyAccountStatusChange(userId: number, status: 'pending' | 'approved' | 'rejected') {
      broadcastToUsers([userId], "user_profile_updated");
      broadcast("admin_user_directory_changed");
      if (status === 'approved' || status === 'rejected') {
        await notify({
          userId,
          service: "ADMIN", type: "account_status_changed", priority: status === 'approved' ? "SUCCESS" : "URGENT",
          title: status === 'approved' ? "Compte approuvé" : "Compte refusé",
          message: status === 'approved'
            ? "Votre compte a été approuvé. Vous avez maintenant accès à la plateforme."
            : "Votre compte a été refusé. Contactez l'administration pour plus d'informations.",
          entityType: "user", entityId: userId,
        });
      }
    }

    app.patch("/api/admin/users/:id/status", requireAdmin, async (req, res) => {
      try {
        const { status } = req.body;
        if (!['pending', 'approved', 'rejected'].includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }
        const id = parseInt(req.params.id);
        const user = await storage.updateUserStatus(id, status);
        await notifyAccountStatusChange(id, status);
        res.json(user);
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.patch("/api/admin/users/:id/approve", requireAdmin, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const user = await storage.updateUserStatus(id, 'approved');
        await notifyAccountStatusChange(id, 'approved');
        res.json(user);
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.patch("/api/admin/users/:id/reject", requireAdmin, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const user = await storage.updateUserStatus(id, 'rejected');
        await notifyAccountStatusChange(id, 'rejected');
        res.json(user);
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.patch("/api/admin/users/:id/categories", requireAdmin, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const { categories, printCategories, marketingCategories, maintenanceCategories } = req.body;
        const updateData: any = {};
        if (categories !== undefined) updateData.categories = categories;
        if (printCategories !== undefined) updateData.printCategories = printCategories;
        if (marketingCategories !== undefined) updateData.marketingCategories = marketingCategories;
        if (maintenanceCategories !== undefined) updateData.maintenanceCategories = maintenanceCategories;
        const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
        res.json(updated);
      } catch { res.status(500).json({ message: "Error" }); }
    });
}
