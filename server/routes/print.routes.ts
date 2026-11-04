import { requireAuth, requireAdmin } from "./shared/middleware";
import { storage } from "../storage";
import { z } from "zod";
import { broadcast, broadcastToUsers } from "../ws";
import { notifyMany, notify } from "../notify";
import { type InsertPrinterProfile, type NotificationPriority } from "@shared/schema";
import type { Express } from "express";

export function registerPrintRoutes(app: Express): void {
    // ── PRINT catalog/marketplace/orders ──────────────────────────────────────
    // Mirrors the Maintenance marketplace routes above structurally (public
    // browsing endpoint, role-gated provider-management endpoints, a single
    // role-branched /orders endpoint, ownership enforced inside storage.ts's
    // WHERE clauses) — see shared/schema.ts printCatalogItems/printOrders and
    // server/storage.ts's PRINT section for the full rationale.
    const PRINT_ORDER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "IN_DELIVERY", "DELIVERED", "CANCELLED"] as const;

    app.get("/api/print/catalog", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "PRINTER") return res.status(403).json({ message: "Printer access required" });
      res.json(await storage.getPrintCatalogForPrinter(user.id));
    });

    // A Printer's category/subCategory choice on a service must be both (a)
    // currently active in the Admin taxonomy and (b) already mapped/selected by
    // that Printer via PATCH /api/print/me/categories — never an arbitrary
    // string, and never a category the Printer hasn't opted into. Only validates
    // fields that are actually present in this call (partial-update-friendly).
    async function validatePrintTaxonomySelection(printerId: number, category?: string, subCategory?: string): Promise<string | null> {
      if (!category) return null;
      const [categoryTaxonomy, mapping] = await Promise.all([
        storage.getPrintCategoryTaxonomy(),
        storage.getPrinterCategoryMapping(printerId),
      ]);
      const categoryRow = categoryTaxonomy.find((c) => c.name === category);
      if (!categoryRow || !categoryRow.isActive || categoryRow.isFrozen) {
        return "Cette catégorie n'est plus disponible.";
      }
      if (!mapping.categories.includes(category)) {
        return "Sélectionnez d'abord cette catégorie dans l'onglet Catégories.";
      }
      if (subCategory) {
        const subCategoryTaxonomy = await storage.getPrintSubCategoryTaxonomy(categoryRow.id);
        const subRow = subCategoryTaxonomy.find((s) => s.name === subCategory);
        if (!subRow || !subRow.isActive || subRow.isFrozen) {
          return "Cette sous-catégorie n'est plus disponible.";
        }
        if (!mapping.subCategories.includes(subCategory)) {
          return "Sélectionnez d'abord cette sous-catégorie dans l'onglet Catégories.";
        }
      }
      return null;
    }

    app.post("/api/print/catalog", requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId);
        if (!user || user.role !== "PRINTER") return res.status(403).json({ message: "Printer access required" });
        const body = z.object({
          name: z.string().min(1),
          description: z.string().default(""),
          imageUrl: z.string().optional().nullable(),
          category: z.string().default(""),
          subCategory: z.string().default(""),
          priceInCents: z.number().int().min(0),
          unit: z.string().default("unité"),
          minQuantity: z.number().int().min(1).default(1),
          productionTimeDays: z.number().int().min(0).default(3),
          materials: z.array(z.string()).default([]),
          isActive: z.boolean().default(true),
          offerDetails: z.string().max(4000).default(""),
        }).parse(req.body);
        const taxonomyError = await validatePrintTaxonomySelection(user.id, body.category, body.subCategory);
        if (taxonomyError) return res.status(400).json({ message: taxonomyError });
        const item = await storage.createPrintCatalogItem(user.id, body);
        broadcast("print_catalog_updated", { printerId: user.id });
        res.status(201).json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to create catalog item" });
      }
    });

    app.patch("/api/print/catalog/:id", requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId);
        if (!user || user.role !== "PRINTER") return res.status(403).json({ message: "Printer access required" });
        const body = z.object({
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          imageUrl: z.string().optional().nullable(),
          category: z.string().optional(),
          subCategory: z.string().optional(),
          priceInCents: z.number().int().min(0).optional(),
          unit: z.string().optional(),
          minQuantity: z.number().int().min(1).optional(),
          productionTimeDays: z.number().int().min(0).optional(),
          materials: z.array(z.string()).optional(),
          isActive: z.boolean().optional(),
          offerDetails: z.string().max(4000).optional(),
        }).parse(req.body);
        const taxonomyError = await validatePrintTaxonomySelection(user.id, body.category, body.subCategory);
        if (taxonomyError) return res.status(400).json({ message: taxonomyError });
        const updated = await storage.updatePrintCatalogItem(parseInt(req.params.id), user.id, body);
        if (!updated) return res.status(404).json({ message: "Catalog item not found" });
        broadcast("print_catalog_updated", { printerId: user.id });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update catalog item" });
      }
    });

    app.delete("/api/print/catalog/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "PRINTER") return res.status(403).json({ message: "Printer access required" });
      const deleted = await storage.deletePrintCatalogItem(parseInt(req.params.id), user.id);
      if (!deleted) return res.status(404).json({ message: "Catalog item not found" });
      broadcast("print_catalog_updated", { printerId: user.id });
      res.json({ message: "Deleted" });
    });

    app.get("/api/print/marketplace", async (req: any, res) => {
      try {
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        res.json(await storage.getPrintMarketplaceCards({
          search: typeof req.query.search === "string" ? req.query.search : undefined,
          category: typeof req.query.category === "string" ? req.query.category : undefined,
          printerId: req.query.printerId ? Number(req.query.printerId) : undefined,
          viewerLocation,
        }));
      } catch (err) {
        res.status(500).json({ message: "Failed to load PRINT marketplace" });
      }
    });

    // "Print Stores" browsable list for /print — mirrors GET /api/stores' own
    // public, no-auth convention (docs/print_store_mapping_audit.md).
    app.get("/api/print/companies", async (req: any, res) => {
      try {
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        res.json(await storage.getPrintCompanyCards(viewerLocation));
      } catch { res.status(500).json({ message: "Failed to load PRINT companies" }); }
    });

    app.get("/api/print/marketplace/:id", async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        const card = await storage.getPrintMarketplaceCard(id, viewerLocation);
        if (card) return res.json(card);
        // Not publicly visible (inactive, unapproved printer, or a currently-hidden
        // company) — the owning Printer/Admin can still preview it (Business →
        // Services "Aperçu" must work for a draft/inactive service), same self/admin
        // bypass pattern as GET /api/academy/courses/:id.
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          const rawCard = await storage.getPrintCatalogItemCard(id);
          if (viewer && rawCard && (viewer.id === rawCard.printerId || ["ADMIN", "SUPER_ADMIN"].includes(viewer.role))) {
            return res.json(rawCard);
          }
        }
        return res.status(404).json({ message: "Print service not found" });
      } catch (err) {
        res.status(500).json({ message: "Failed to load PRINT item" });
      }
    });

    app.get("/api/print/categories", async (_req, res) => {
      try { res.json(await storage.getPrintCategories()); }
      catch { res.status(500).json({ message: "Failed to load PRINT categories" }); }
    });

    // Active Admin taxonomy (categories + subcategories) — what a Printer is allowed
    // to map/select from. Distinct from GET /api/print/categories above, which is
    // the marketplace-visibility list (derived from actually-used active services,
    // not the raw taxonomy) — see the note on storage.getPrintCategories().
    app.get("/api/print/taxonomy", async (_req, res) => {
      try {
        const [categories, subcategories] = await Promise.all([
          storage.getPrintCategoryTaxonomy(),
          storage.getPrintSubCategoryTaxonomy(),
        ]);
        res.json({
          categories: categories.filter((c) => c.isActive && !c.isFrozen),
          subcategories: subcategories.filter((s) => s.isActive && !s.isFrozen),
        });
      } catch { res.status(500).json({ message: "Failed to load PRINT taxonomy" }); }
    });

    // Entity-level report ("Blacklist") — a Coffee Owner flagging a Printer
    // account itself, mirrors POST /api/marketing/:userId/report exactly.
    app.post("/api/print/:printerId/report", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const printerId = Number(req.params.printerId);
      const target = await storage.getUser(printerId);
      if (!target || target.role !== "PRINTER") return res.status(404).json({ message: "Printer account not found" });
      try {
        const { reason, rating } = z.object({ reason: z.string().min(1).max(500), rating: z.number().int().min(1).max(5) }).parse(req.body);
        const report = await storage.createPrintReport(user.id, printerId, reason, rating);
        broadcast("admin_print_report_created", { printerId });
        const adminIds = await storage.getAdminUserIds();
        await notifyMany({
          userIds: adminIds,
          service: "ADMIN", type: "print_report_created", priority: "URGENT",
          title: "Imprimeur signalé",
          message: `${user.name} a signalé ${target.name} (PRINT) : "${reason}".`,
          entityType: "print_report", entityId: report.id,
          prefKey: "reports",
          dedupeKeyPrefix: `admin:print_report_created:${report.id}`,
        });
        res.status(201).json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid report data" });
      }
    });

    app.get("/api/print/reports/mine", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      res.json(await storage.getPrintReportsByOwner(user.id));
    });

    app.get("/api/print/reports/published", requireAuth, async (req: any, res) => {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 50);
      res.json(await storage.getPublishedPrintReports(page, limit));
    });

    app.get("/api/print/me/categories", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "PRINTER") return res.status(403).json({ message: "Printer access required" });
      res.json(await storage.getPrinterCategoryMapping(user.id));
    });

    app.patch("/api/print/me/categories", requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId);
        if (!user || user.role !== "PRINTER") return res.status(403).json({ message: "Printer access required" });
        const body = z.object({
          categories: z.array(z.string()).default([]),
          subCategories: z.array(z.string()).default([]),
        }).parse(req.body);
        const result = await storage.setPrinterCategoryMapping(user.id, body);
        broadcast("print_categories_updated", { printerId: user.id, kind: "mapping" });
        res.json(result);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update category mapping" });
      }
    });

    // Company-level printer profile — mirrors GET/PATCH /api/academy/profile
    // exactly (self/admin get the full row + card, any other authenticated
    // viewer — e.g. a Coffee Owner clicking "Imprimerie" inside a Service
    // details modal — only ever gets the sanitized public `card`).
    app.get("/api/print/company/:userId", requireAuth, async (req: any, res) => {
      const targetUserId = Number(req.params.userId);
      const viewer = await storage.getUser(req.session.userId);
      if (!viewer) return res.status(401).json({ message: "Unauthorized" });
      const target = await storage.getUser(targetUserId);
      if (!target || target.role !== "PRINTER") return res.status(404).json({ message: "Not found" });
      const isSelfOrAdmin = viewer.id === targetUserId || ["ADMIN", "SUPER_ADMIN"].includes(viewer.role);
      const card = await storage.getPrintCompanyCard(targetUserId, { lat: viewer.locationLat, lng: viewer.locationLng });
      if (!card) return res.status(404).json({ message: "Not found" });
      if (!isSelfOrAdmin) return res.json({ card });
      res.json({ user: target, profile: await storage.getPrinterProfile(targetUserId), card });
    });

    app.patch("/api/print/profile", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "PRINTER") return res.status(403).json({ message: "Printer access required" });
      try {
        const dayHoursSchema = z.object({ open: z.string(), close: z.string(), closed: z.boolean() });
        const body = z.object({
          description: z.string().max(2000).optional(),
          websiteUrl: z.union([z.string().trim().url(), z.literal("")]).optional().transform((v) => (v === "" ? null : v)),
          marketplaceVisible: z.boolean().optional(),
          isOnVacation: z.boolean().optional(),
          portfolioImages: z.array(z.string()).max(4, "4 photos maximum").optional(),
          weeklyHours: z.object({
            monday: dayHoursSchema, tuesday: dayHoursSchema, wednesday: dayHoursSchema,
            thursday: dayHoursSchema, friday: dayHoursSchema, saturday: dayHoursSchema, sunday: dayHoursSchema,
          }).optional(),
        }).parse(req.body);
        // Auto Approve gating (docs/admin_service_store_cards_order_autapprove_audit.md) —
        // mirrors upsertSupplierStore's identityChanged reset, but placed here (the
        // self-service route) rather than inside upsertPrinterProfile, since Admin's own
        // edit route (PATCH /api/admin/print/accounts/:userId) also calls upsertPrinterProfile
        // and must never trigger its own re-review.
        const currentProfile = await storage.getPrinterProfile(user.id);
        const identityChanged = (
          (body.description !== undefined && body.description !== currentProfile.description) ||
          (body.websiteUrl !== undefined && (body.websiteUrl ?? null) !== (currentProfile.websiteUrl ?? null))
        );
        const extra: Partial<InsertPrinterProfile> =
          identityChanged && !currentProfile.autoApprove && (currentProfile.publicationStatus === "APPROVED" || currentProfile.publicationStatus === "REJECTED")
            ? { publicationStatus: "PENDING", publicationSubmittedAt: new Date(), publicationRejectionReason: null }
            : {};
        const profile = await storage.upsertPrinterProfile(user.id, { ...body, ...extra });
        broadcast("print_profile_updated", { printerId: user.id, kind: "profile" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid profile data" });
      }
    });

    // GO Live (Phase 5) — see /api/maintenance/profile/go-live for the full rationale comment.
    app.post("/api/print/profile/go-live", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "PRINTER") return res.status(403).json({ message: "Printer access required" });
      const profile = await storage.getPrinterProfile(user.id);
      if (profile.publicationStatus === "PENDING") return res.status(400).json({ message: "Une demande est déjà en attente d'approbation." });
      if (!profile.description?.trim()) return res.status(400).json({ message: "Complétez votre description avant de soumettre votre profil." });
      const updated = await storage.upsertPrinterProfile(user.id, {
        publicationStatus: "PENDING", publicationSubmittedAt: new Date(), publicationRejectionReason: null,
      });
      broadcast("print_profile_updated", { printerId: user.id, kind: "publication" });
      res.json(updated);
    });

    app.patch("/api/admin/print/accounts/:userId/publication", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "PRINTER") return res.status(404).json({ message: "Printer account not found" });
        const { decision, rejectionReason } = z.object({
          decision: z.enum(["APPROVED", "REJECTED"]),
          rejectionReason: z.string().trim().max(1000).optional(),
        }).parse(req.body);
        const profile = await storage.upsertPrinterProfile(userId, {
          publicationStatus: decision, publicationReviewedAt: new Date(),
          publicationRejectionReason: decision === "REJECTED" ? (rejectionReason?.trim() || "Non précisé") : null,
        });
        broadcast("print_profile_updated", { printerId: userId, kind: "publication" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.get("/api/print/reviews/order/:orderId", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const review = await storage.getPrintReviewForOrder(parseInt(req.params.orderId), user.id);
      res.json(review ?? null);
    });

    app.get("/api/print/reviews/:printerId", async (req, res) => {
      try { res.json(await storage.getPrintReviews(parseInt(req.params.printerId))); }
      catch { res.status(500).json({ message: "Failed to load PRINT reviews" }); }
    });

    app.post("/api/print/reviews", requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId);
        if (!user || user.role !== "CAFE_OWNER" || user.status !== "approved") {
          return res.status(403).json({ message: "Only approved Coffee Owners can submit reviews" });
        }
        const body = z.object({
          printerId: z.number().int().positive(),
          printOrderId: z.number().int().positive(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().max(2000).optional(),
        }).parse(req.body);
        // Ownership + eligibility enforced the same way as Maintenance reviews:
        // the order is looked up only within this Coffee Owner's own orders, so a
        // review can never be attached to someone else's order, and only a
        // DELIVERED order (this module's terminal/completed state) is reviewable.
        const ownOrders = await storage.getPrintOrdersForOwner(user.id);
        const order = ownOrders.find((o) => o.id === body.printOrderId);
        if (!order || order.printerId !== body.printerId || order.status !== "DELIVERED") {
          return res.status(400).json({ message: "Les avis sont disponibles après une commande livrée." });
        }
        const result = await storage.upsertPrintReview({ ...body, cafeId: user.id, cafeName: user.name });
        broadcast("print_review_updated", { printerId: body.printerId, printOrderId: body.printOrderId });
        if (!result.isUpdate) {
          await notify({
            userId: body.printerId,
            service: "PRINT", type: "print_review_created", priority: "INFO",
            title: "Nouvel avis reçu",
            message: `${user.name} vous a laissé un avis (${body.rating}/5).`,
            entityType: "print_order", entityId: body.printOrderId,
            prefKey: "reviews",
            dedupeKey: `print:review_created:${body.printOrderId}`,
          });
        }
        res.status(result.isUpdate ? 200 : 201).json(result.review);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to submit review" });
      }
    });

    app.get("/api/print/orders", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role === "PRINTER") return res.json(await storage.getPrintOrdersForPrinter(user.id));
      if (user.role === "CAFE_OWNER") return res.json(await storage.getPrintOrdersForOwner(user.id));
      return res.status(403).json({ message: "Forbidden" });
    });

    app.post("/api/print/orders", requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId);
        if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
        const body = z.object({
          catalogItemId: z.number().int().positive(),
          quantity: z.number().int().min(1),
          notes: z.string().optional(),
          deliveryAddress: z.string().optional(),
          contactPhone: z.string().optional(),
        }).parse(req.body);
        const order = await storage.createPrintOrder(user.id, {
          ...body,
          contactPhone: body.contactPhone || user.phone || "",
        });
        broadcast("print_order_updated", { orderId: order.id });
        broadcastToUsers([user.id, order.printerId], "print_order_updated", { orderId: order.id });
        broadcastToUsers([user.id, order.printerId], "conversation_updated", { service: "PRINT", orderId: order.id });
        await notify({
          userId: order.printerId,
          service: "PRINT", type: "print_order_created", priority: "WARNING",
          title: "Nouvelle demande d'impression",
          message: `${user.name} a passé une nouvelle commande d'impression #${order.id}.`,
          entityType: "print_order", entityId: order.id,
          prefKey: "print_requests",
          dedupeKey: `print:order_created:${order.id}:printer`,
        });
        await notify({
          userId: user.id,
          service: "PRINT", type: "print_order_created", priority: "INFO",
          title: "Demande envoyée",
          message: `Votre commande d'impression #${order.id} a été envoyée.`,
          entityType: "print_order", entityId: order.id,
          prefKey: "print_status",
          dedupeKey: `print:order_created:${order.id}:owner`,
        });
        res.status(201).json(order);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err?.message ?? "Failed to create order" });
      }
    });

    app.patch("/api/print/orders/:id/status", requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId);
        if (!user || user.role !== "PRINTER") return res.status(403).json({ message: "Printer access required" });
        const { status } = z.object({ status: z.enum(PRINT_ORDER_STATUSES) }).parse(req.body);
        const updated = await storage.updatePrintOrderStatus(parseInt(req.params.id), user.id, status);
        if (!updated) return res.status(404).json({ message: "Order not found" });
        broadcast("print_order_updated", { orderId: updated.id });
        broadcastToUsers([user.id, updated.cafeOwnerId], "print_order_updated", { orderId: updated.id });
        const PRINT_STATUS_TEXT_FR: Partial<Record<string, { title: string; priority: NotificationPriority; text: string }>> = {
          CONFIRMED: { title: "Commande confirmée", priority: "SUCCESS", text: "a accepté votre demande d'impression" },
          PREPARING: { title: "Impression en préparation", priority: "INFO", text: "prépare votre commande d'impression" },
          READY: { title: "Commande prête", priority: "SUCCESS", text: "a terminé votre commande d'impression — prête" },
          DELIVERED: { title: "Commande livrée", priority: "SUCCESS", text: "a livré votre commande d'impression" },
          CANCELLED: { title: "Commande annulée", priority: "WARNING", text: "a annulé votre commande d'impression" },
        };
        const printStatusText = PRINT_STATUS_TEXT_FR[status];
        if (printStatusText) {
          await notify({
            userId: updated.cafeOwnerId,
            service: "PRINT", type: "print_order_status_changed", priority: printStatusText.priority,
            title: printStatusText.title,
            message: `${user.name} ${printStatusText.text} #${updated.id}.`,
            entityType: "print_order", entityId: updated.id,
            prefKey: "print_status",
            dedupeKey: `print:order_status:${updated.id}:${status}`,
          });
        }
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update order status" });
      }
    });

    app.get("/api/print/revenue", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "PRINTER") return res.status(403).json({ message: "Printer access required" });
      res.json(await storage.getPrintRevenueSummary(user.id));
    });

    // ── Admin PRINT — same philosophy as Admin Maintenance above: one aggregate
    // overview endpoint the client filters/tabs over client-side, plus dedicated
    // mutation endpoints for taxonomy CRUD and catalog moderation. ──────────────

    app.get("/api/admin/print", requireAdmin, async (_req, res) => {
      try { res.json(await storage.getPrintAdminOverview()); }
      catch (err) { console.error(err); res.status(500).json({ message: "Failed to load PRINT overview" }); }
    });

    app.post("/api/admin/print/categories", requireAdmin, async (req, res) => {
      try {
        const { name, icon } = z.object({ name: z.string().trim().min(1).max(120), icon: z.string().trim().max(8).nullable().optional() }).parse(req.body);
        const created = await storage.createPrintCategory(name, icon ?? null);
        broadcast("print_categories_updated", { kind: "taxonomy" });
        res.status(201).json(created);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to create category" });
      }
    });

    app.patch("/api/admin/print/categories/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          name: z.string().trim().min(1).max(120).optional(),
          icon: z.string().trim().max(8).nullable().optional(),
          isActive: z.boolean().optional(),
          isFrozen: z.boolean().optional(),
        }).parse(req.body);
        const updated = await storage.updatePrintCategory(parseInt(req.params.id), body);
        if (!updated) return res.status(404).json({ message: "Category not found" });
        broadcast("print_categories_updated", { kind: "taxonomy" });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update category" });
      }
    });

    app.delete("/api/admin/print/categories/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deletePrintCategory(parseInt(req.params.id));
        broadcast("print_categories_updated", { kind: "taxonomy" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete category" }); }
    });

    app.post("/api/admin/print/subcategories", requireAdmin, async (req, res) => {
      try {
        const { categoryId, name, icon } = z.object({ categoryId: z.number().int().positive(), name: z.string().trim().min(1).max(120), icon: z.string().trim().max(8).nullable().optional() }).parse(req.body);
        const created = await storage.createPrintSubCategory(categoryId, name, icon ?? null);
        broadcast("print_categories_updated", { kind: "taxonomy" });
        res.status(201).json(created);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to create subcategory" });
      }
    });

    app.patch("/api/admin/print/subcategories/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          name: z.string().trim().min(1).max(120).optional(),
          icon: z.string().trim().max(8).nullable().optional(),
          isActive: z.boolean().optional(),
          isFrozen: z.boolean().optional(),
        }).parse(req.body);
        const updated = await storage.updatePrintSubCategory(parseInt(req.params.id), body);
        if (!updated) return res.status(404).json({ message: "Subcategory not found" });
        broadcast("print_categories_updated", { kind: "taxonomy" });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update subcategory" });
      }
    });

    app.delete("/api/admin/print/subcategories/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deletePrintSubCategory(parseInt(req.params.id));
        broadcast("print_categories_updated", { kind: "taxonomy" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete subcategory" }); }
    });

    app.patch("/api/admin/print/catalog/:id", requireAdmin, async (req, res) => {
      try {
        const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
        const updated = await storage.adminSetPrintCatalogItemActive(parseInt(req.params.id), isActive);
        if (!updated) return res.status(404).json({ message: "Catalog item not found" });
        broadcast("print_catalog_updated", { printerId: updated.printerId, kind: "admin_moderation" });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update catalog item" });
      }
    });

    // ── Admin Print account actions — same edit/freeze pattern as
    // /api/admin/maintenance/accounts above (Marketing/Maintenance reference). ──
    // Registered BEFORE the /:userId route below: both paths share the same shape
    // (/api/admin/print/accounts/<segment>), so if bulk-order were registered after,
    // Express would match it against :userId first (userId="bulk-order" → NaN → DB
    // error → generic 400 "Invalid account data") and this handler would never run —
    // see docs/service_card_reorder_and_detail_modal_audit.md Part 1.
    app.patch("/api/admin/print/accounts/bulk-order", requireAdmin, async (req, res) => {
      try {
        const orders: { id: number; displayOrder: number }[] = req.body?.orders;
        if (!Array.isArray(orders)) return res.status(400).json({ message: "Invalid payload" });
        await storage.bulkUpdatePrinterOrder(orders);
        broadcast("print_profile_updated", { kind: "bulk_order" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.patch("/api/admin/print/accounts/:userId", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "PRINTER") return res.status(404).json({ message: "Printer account not found" });
        const { name, email, phone, profileImageUrl, ...profileFields } = z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          profileImageUrl: z.string().optional().nullable(),
          description: z.string().optional(),
          websiteUrl: z.string().optional().nullable(),
        }).parse(req.body);
        const userUpdates: any = {};
        if (name !== undefined) userUpdates.name = name;
        if (email !== undefined) userUpdates.email = email;
        if (phone !== undefined) userUpdates.phone = phone;
        if (profileImageUrl !== undefined) userUpdates.profileImageUrl = profileImageUrl?.trim() || null;
        if (Object.keys(userUpdates).length) await storage.updateUser(userId, userUpdates);
        const profile = Object.keys(profileFields).length ? await storage.upsertPrinterProfile(userId, profileFields) : await storage.getPrinterProfile(userId);
        broadcastToUsers([userId], "user_profile_updated");
        broadcast("print_profile_updated", { printerId: userId, kind: "admin_edit" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid account data" });
      }
    });

    app.patch("/api/admin/print/accounts/:userId/freeze", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "PRINTER") return res.status(404).json({ message: "Printer account not found" });
        const { isFrozen } = z.object({ isFrozen: z.boolean() }).parse(req.body);
        const profile = await storage.upsertPrinterProfile(userId, { isFrozen });
        broadcast("print_profile_updated", { printerId: userId, kind: "freeze" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.patch("/api/admin/print/accounts/:userId/auto-approve", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "PRINTER") return res.status(404).json({ message: "Printer account not found" });
        const autoApprove = Boolean(req.body?.autoApprove);
        const profile = await storage.setPrinterAutoApprove(userId, autoApprove);
        broadcast("print_profile_updated", { printerId: userId, kind: "auto_approve" });
        res.json(profile);
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.get("/api/admin/print/reports", requireAdmin, async (req: any, res) => {
      const status = typeof req.query.status === "string" ? (req.query.status as "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED") : undefined;
      res.json(await storage.getPrintReports(status));
    });

    app.patch("/api/admin/print/reports/:id/resolve", requireAdmin, async (req: any, res) => {
      try {
        const { status, resolutionNote } = z.object({
          status: z.enum(["RESOLVED", "DISMISSED", "PUBLISHED", "REJECTED"]),
          resolutionNote: z.string().max(1000).optional(),
        }).parse(req.body);
        if (status === "PUBLISHED") {
          const target = await storage.getPrintReportById(Number(req.params.id));
          if (!target) return res.status(404).json({ message: "Not found" });
          if (target.rating == null) return res.status(400).json({ message: "Ce signalement n'a pas de note et ne peut pas être publié." });
        }
        const report = await storage.resolvePrintReport(Number(req.params.id), status, resolutionNote, req.session.userId);
        if (!report) return res.status(404).json({ message: "Not found" });
        broadcast("admin_print_report_created", { printerId: report.printerId });
        res.json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid data" });
      }
    });

    // ── Print favorites — mirrors maintenance-favorites endpoint-for-endpoint,
    // keyed by the catalog item (service), not the printer account. ──

    app.get("/api/print-favorites", requireAuth, async (req: any, res) => {
      res.json(await storage.getPrintFavoritesByUser(req.session.userId));
    });

    app.post("/api/print-favorites", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const printItemId = Number(req.body?.printItemId);
      if (!printItemId) return res.status(400).json({ message: "printItemId is required" });
      await storage.addPrintFavorite(user.id, printItemId);
      broadcastToUsers([user.id], "print_favorite_updated", { printItemId });
      res.status(201).json({ ok: true });
    });

    app.delete("/api/print-favorites/:printItemId", requireAuth, async (req: any, res) => {
      await storage.removePrintFavorite(req.session.userId, Number(req.params.printItemId));
      broadcastToUsers([req.session.userId], "print_favorite_updated", { printItemId: Number(req.params.printItemId) });
      res.json({ ok: true });
    });

    // ── Print company (printer) favorites — independent of the product favorites
    // above; printerId rows have printItemId NULL (docs/coffee_owner_favorites_marketplace_audit.md) ──

    app.get("/api/print-favorites/companies", requireAuth, async (req: any, res) => {
      res.json(await storage.getPrintCompanyFavoritesByUser(req.session.userId));
    });

    app.post("/api/print-favorites/companies", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const printerId = Number(req.body?.printerId);
      if (!printerId) return res.status(400).json({ message: "printerId is required" });
      await storage.addPrintCompanyFavorite(user.id, printerId);
      broadcastToUsers([user.id], "print_company_favorite_updated", { printerId });
      res.status(201).json({ ok: true });
    });

    app.delete("/api/print-favorites/companies/:printerId", requireAuth, async (req: any, res) => {
      await storage.removePrintCompanyFavorite(req.session.userId, Number(req.params.printerId));
      broadcastToUsers([req.session.userId], "print_company_favorite_updated", { printerId: Number(req.params.printerId) });
      res.json({ ok: true });
    });
}
