import { requireAuth, requireAdmin } from "./shared/middleware";
import { storage } from "../storage";
import { db } from "../db";
import { users, supplierStores } from "@shared/schema";
import { isValidRegistrationPassword, registrationPasswordMessage } from "./shared/helpers";
import { broadcast, broadcastToUsers } from "../ws";
import { notify } from "../notify";
import { eq, inArray } from "drizzle-orm";
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

        // Supplier card cover-image fallback (task: "Supplier Cards: Fallback Cover Image
        // from Related Store") — a Supplier's card should fall back to their Store's first
        // configured cover image when the Supplier has no personal coverImageUrl of their
        // own. Resolved here, batched in one extra query (never one query per card), so the
        // frontend receives one ready-to-use `displayCoverImageUrl` per user — for every
        // non-SUPPLIER role this is just coverImageUrl itself, unchanged.
        const supplierIds = allUsers.filter((u) => u.role === 'SUPPLIER').map((u) => u.id);
        const storeCoverBySupplierId = new Map<number, string | null>();
        if (supplierIds.length > 0) {
          const stores = await db.select({ supplierId: supplierStores.supplierId, coverUrl: supplierStores.coverUrl, coverUrls: supplierStores.coverUrls })
            .from(supplierStores)
            .where(inArray(supplierStores.supplierId, supplierIds));
          for (const store of stores) {
            // Same "ordered coverUrls, falling back to the single legacy coverUrl" logic
            // already used to resolve a store's display cover elsewhere (see
            // admin/stores-page.tsx's own coverUrls/coverUrl handling) — the first entry of
            // the existing ordered collection, never a random pick.
            const orderedCovers = (store.coverUrls?.length ? store.coverUrls : store.coverUrl ? [store.coverUrl] : []).filter(Boolean);
            storeCoverBySupplierId.set(store.supplierId, orderedCovers[0] ?? null);
          }
        }

        const usersWithDisplayCover = allUsers.map((u) => {
          const personalCover = u.coverImageUrl && u.coverImageUrl.trim() ? u.coverImageUrl : null;
          let displayCoverImageUrl: string | null;
          if (u.role === 'SUPPLIER') {
            displayCoverImageUrl = personalCover ?? storeCoverBySupplierId.get(u.id) ?? null;
          } else if (u.role === 'CAFE_OWNER') {
            // Coffee Owner card cover-image fallback (task: "Admin Users: Coffee Owner Card
            // Cover Fallback") — falls back to the account's own profileImageUrl (never the
            // Supplier Store cover above, and never written back to coverImageUrl) when the
            // Coffee Owner has no personal cover of their own. The avatar below still reads
            // profileImageUrl directly (via getAvatarUrl), independently of this field, so
            // the same URL can end up rendered in both places without either one driving
            // the other.
            const personalPhoto = u.profileImageUrl && u.profileImageUrl.trim() ? u.profileImageUrl : null;
            displayCoverImageUrl = personalCover ?? personalPhoto ?? null;
          } else {
            displayCoverImageUrl = u.coverImageUrl ?? null;
          }
          return { ...u, displayCoverImageUrl };
        });

        res.json(usersWithDisplayCover);
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.post("/api/admin/users", requireAdmin, async (req, res) => {
      try {
        const {
          name, email, password, role, phone, isWhatsapp, profileImageUrl, coverImageUrl,
          governorates, printCategories, marketingCategories, maintenanceCategories, categories,
          // Location — same fields the public /api/auth/register and the PATCH
          // /api/admin/users/:id route already accept, now also accepted at
          // creation time (previously only settable via a separate PATCH after
          // create) so the Prospecting "Create Account" flow can set it in one
          // call, exactly like the public Inscription flow does.
          locationAddress, locationLat, locationLng, locationPlaceId, locationDetails,
        } = req.body;
        if (!name || !email || !password || !role) return res.status(400).json({ message: "name, email, password and role are required" });
        // SUPER_ADMIN creation authorization (task: "Add ADMIN and SUPER_ADMIN Account Types
        // to the Admin Add User Modal") — this codebase has no pre-existing rule anywhere that
        // treats SUPER_ADMIN as higher-privileged than ADMIN (every authorization check across
        // the app, e.g. requireAdmin itself, treats ['ADMIN','SUPER_ADMIN'] as equivalent).
        // Since none existed, the safest compatible rule is enforced here: only an acting
        // SUPER_ADMIN may create another SUPER_ADMIN account. A regular ADMIN may still create
        // ADMIN accounts (unchanged — gated the same way as every other role, by requireAdmin
        // above). Enforced here, server-side, regardless of what the request body claims —
        // never by merely hiding the option in the frontend dropdown.
        if (role === 'SUPER_ADMIN') {
          const actingUser = await storage.getUser(req.session.userId!);
          if (!actingUser || actingUser.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: "Seul un compte Super Admin peut créer un autre compte Super Admin." });
          }
        }
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
          coverImageUrl: coverImageUrl?.trim() || null,
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
          name, email, phone, isWhatsapp, profileImageUrl, coverImageUrl,
          governorates, printCategories, marketingCategories, maintenanceCategories, categories,
          locationAddress, locationLat, locationLng, locationPlaceId, locationDetails,
        } = req.body;
        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (phone !== undefined) updates.phone = phone;
        if (isWhatsapp !== undefined) updates.isWhatsapp = !!isWhatsapp;
        if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl?.trim() || null;
        // Admin User Details modal "Cover (URL)" field — same independent, partial-update
        // convention as profileImageUrl right above: omitting it from the request leaves the
        // saved value untouched, sending it (even as "") clears it to null. Never derived
        // from or written into profileImageUrl, and never the computed displayCoverImageUrl
        // GET /api/admin/users returns for card rendering — this is always the real,
        // underlying users.coverImageUrl column.
        if (coverImageUrl !== undefined) updates.coverImageUrl = coverImageUrl?.trim() || null;
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
