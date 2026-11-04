import { storage } from "../storage";
import { requireAuth, requireAdmin, requireApprovedCafeOwner } from "./shared/middleware";
import { z } from "zod";
import { broadcast, broadcastToUsers } from "../ws";
import { type InsertMarketingProfile, type NotificationPriority } from "@shared/schema";
import { notify, notifyMany } from "../notify";
import type { Express } from "express";

export function registerMarketingRoutes(app: Express): void {
    // ── MARKETING marketplace/projects ────────────────────────────────────────
    // Mirrors the Maintenance marketplace routes above structurally (public
    // browsing endpoint, role-gated provider-management endpoints, ownership
    // enforced inside storage.ts's WHERE clauses, reviews on the shared
    // supplierProductReviews table) — see shared/schema.ts marketingProjects and
    // server/storage.ts's MARKETING section for the full rationale.

    app.get("/api/marketing/profiles", async (req: any, res) => {
      try {
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        res.json(await storage.getMarketingProfiles({
          search: typeof req.query.search === "string" ? req.query.search : undefined,
          category: typeof req.query.category === "string" ? req.query.category : undefined,
          profileType: typeof req.query.profileType === "string" ? req.query.profileType : undefined,
          location: typeof req.query.location === "string" ? req.query.location : undefined,
          viewerLocation,
        }));
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to load Marketing profiles" });
      }
    });

    // "Marketing Stores" browsable list for /marketing — mirrors GET /api/print/companies'
    // own public, no-auth convention (docs/marketing_store_mapping_audit.md).
    app.get("/api/marketing/companies", async (req: any, res) => {
      try {
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        res.json(await storage.getMarketingCompanyCards(viewerLocation));
      } catch { res.status(500).json({ message: "Failed to load Marketing companies" }); }
    });

    app.get("/api/marketing/categories", async (_req, res) => {
      try {
        res.json(await storage.getMarketingCategories());
      } catch { res.status(500).json({ message: "Failed to load Marketing categories" }); }
    });

    app.get("/api/marketing/taxonomy", async (_req, res) => {
      try {
        res.json(await storage.getAvailableMarketingTaxonomy());
      } catch { res.status(500).json({ message: "Failed to load Marketing taxonomy" }); }
    });

    // Active subcategory taxonomy — kept as its own endpoint rather than folded
    // into /api/marketing/taxonomy above, since that route's existing response
    // shape (a flat MarketingCategory[]) is already read by several components
    // as an array; changing it to {categories, subcategories} would be a breaking
    // change for no benefit. Optional ?categoryId= mirrors getPrintSubCategoryTaxonomy.
    app.get("/api/marketing/subcategories", async (req, res) => {
      try {
        const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
        res.json(await storage.getAvailableMarketingSubCategoryTaxonomy(categoryId));
      } catch { res.status(500).json({ message: "Failed to load Marketing subcategories" }); }
    });

    // Agency's own category/subcategory selection (Categories & Subcategories:
    // Complete End-to-End Integration) — mirrors GET/PATCH /api/print/me/categories
    // exactly, adapted to marketingProfiles.selectedCategories/selectedSubCategories.
    app.get("/api/marketing/me/categories", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      res.json(await storage.getMarketingCategoryMapping(user.id));
    });

    app.patch("/api/marketing/me/categories", requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId);
        if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
        const body = z.object({
          categories: z.array(z.string()).default([]),
          subCategories: z.array(z.string()).default([]),
        }).parse(req.body);
        const result = await storage.setMarketingCategoryMapping(user.id, body);
        broadcast("marketing_updated", { userId: user.id, kind: "mapping" });
        res.json(result);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update category mapping" });
      }
    });

    app.get("/api/marketing/profile/:userId", requireAuth, async (req: any, res) => {
      const targetUserId = Number(req.params.userId);
      const viewer = await storage.getUser(req.session.userId);
      const isSelfOrAdmin = viewer && (viewer.id === targetUserId || ["ADMIN", "SUPER_ADMIN"].includes(viewer.role));
      const isCafeOwner = viewer?.role === "CAFE_OWNER";
      if (!viewer || (!isSelfOrAdmin && !isCafeOwner)) return res.status(403).json({ message: "Forbidden" });
      const target = await storage.getUser(targetUserId);
      if (!target || target.role !== "MARKETING") return res.status(404).json({ message: "Not found" });
      const [card, allServices] = await Promise.all([
        storage.getMarketingCard(targetUserId, { lat: viewer.locationLat, lng: viewer.locationLng }),
        storage.getMarketingServicesForProvider(targetUserId),
      ]);
      // Agency Details Modal / Eye preview always shows exactly what a Coffee Owner would
      // see — published services only, for every viewer including self (Part 3/6-7).
      const cardWithServices = card ? { ...card, services: allServices.filter((s) => s.isPublished) } : card;
      // Coffee Owners only ever see the sanitized public `card` — never the raw
      // user row (password hash, email, etc.), matching the Maintenance/Barista fix.
      if (!isSelfOrAdmin) return res.json({ card: cardWithServices });
      res.json({ user: target, profile: await storage.getMarketingProfile(targetUserId), card: cardWithServices });
    });

    app.patch("/api/marketing/profile", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      const body = z.object({
        profileType: z.string().optional(),
        categories: z.array(z.string()).optional(),
        responseTime: z.string().optional(),
        startingPriceInCents: z.number().int().min(0).optional(),
        description: z.string().optional(),
        portfolioImages: z.array(z.string()).max(4, "4 photos maximum").optional(),
        websiteUrl: z.union([z.string().trim().url(), z.literal("")]).optional().transform((v) => (v === "" ? null : v)),
        marketplaceVisible: z.boolean().optional(),
      }).parse(req.body);
      // Auto Approve gating (docs/admin_service_store_cards_order_autapprove_audit.md) —
      // mirrors upsertSupplierStore's identityChanged reset, but placed here (the
      // self-service route) rather than inside upsertMarketingProfile, since Admin's own
      // edit route (PATCH /api/admin/marketing/accounts/:userId) also calls
      // upsertMarketingProfile and must never trigger its own re-review.
      const currentProfile = await storage.getMarketingProfile(user.id);
      const identityChanged = (
        (body.description !== undefined && body.description !== currentProfile.description) ||
        (body.websiteUrl !== undefined && (body.websiteUrl ?? null) !== (currentProfile.websiteUrl ?? null))
      );
      const extra: Partial<InsertMarketingProfile> =
        identityChanged && !currentProfile.autoApprove && (currentProfile.publicationStatus === "APPROVED" || currentProfile.publicationStatus === "REJECTED")
          ? { publicationStatus: "PENDING", publicationSubmittedAt: new Date(), publicationRejectionReason: null }
          : {};
      const profile = await storage.upsertMarketingProfile(user.id, { ...body, ...extra });
      broadcast("marketing_updated", { userId: user.id, kind: "profile" });
      res.json(profile);
    });

    // GO Live (Phase 5) — see /api/maintenance/profile/go-live for the full rationale comment.
    app.post("/api/marketing/profile/go-live", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      const profile = await storage.getMarketingProfile(user.id);
      if (profile.publicationStatus === "PENDING") return res.status(400).json({ message: "Une demande est déjà en attente d'approbation." });
      if (!profile.description?.trim()) return res.status(400).json({ message: "Complétez votre description avant de soumettre votre profil." });
      const updated = await storage.upsertMarketingProfile(user.id, {
        publicationStatus: "PENDING", publicationSubmittedAt: new Date(), publicationRejectionReason: null,
      });
      broadcast("marketing_updated", { userId: user.id, kind: "publication" });
      res.json(updated);
    });

    app.patch("/api/admin/marketing/accounts/:userId/publication", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "MARKETING") return res.status(404).json({ message: "Marketing account not found" });
        const { decision, rejectionReason } = z.object({
          decision: z.enum(["APPROVED", "REJECTED"]),
          rejectionReason: z.string().trim().max(1000).optional(),
        }).parse(req.body);
        const profile = await storage.upsertMarketingProfile(userId, {
          publicationStatus: decision, publicationReviewedAt: new Date(),
          publicationRejectionReason: decision === "REJECTED" ? (rejectionReason?.trim() || "Non précisé") : null,
        });
        broadcast("marketing_updated", { userId, kind: "publication" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.patch("/api/marketing/availability", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      const dayHoursSchema = z.object({ open: z.string(), close: z.string(), closed: z.boolean() });
      const body = z.object({
        isAvailable: z.boolean().optional(),
        isOnVacation: z.boolean(),
        weeklyHours: z.object({
          monday: dayHoursSchema, tuesday: dayHoursSchema, wednesday: dayHoursSchema,
          thursday: dayHoursSchema, friday: dayHoursSchema, saturday: dayHoursSchema, sunday: dayHoursSchema,
        }).optional(),
      }).parse(req.body);
      const profile = await storage.upsertMarketingProfile(user.id, {
        ...body,
        isAvailable: body.isAvailable ?? !body.isOnVacation,
      });
      broadcast("marketing_updated", { userId: user.id, kind: "availability" });
      res.json(profile);
    });

    // ── Marketing Services (Agency → Multiple Services) — mirrors the Academy
    // Formations routes (/api/academy/my/courses, /api/academy/courses, POST/PATCH/DELETE
    // /api/academy/courses/:id) exactly, same self-scoped CRUD + public list/detail shape. ──

    const marketingServiceInputSchema = z.object({
      title: z.string().max(160).optional(),
      category: z.string().min(1).optional(),
      subCategories: z.array(z.string()).optional(),
      startingPriceInCents: z.number().int().min(0).optional(),
      responseTime: z.string().optional(),
      description: z.string().optional(),
      offerDetails: z.string().max(4000).optional(),
      imageUrl: z.string().optional().nullable(),
      isPublished: z.boolean().optional(),
    });

    // An agency's category/subCategories choice on a service must be both (a)
    // currently active in the Admin taxonomy and (b) already selected by that
    // agency via PATCH /api/marketing/me/categories — never an arbitrary string,
    // and never a category/subcategory the agency hasn't opted into. Mirrors
    // validatePrintTaxonomySelection, adapted for a subCategories ARRAY (Marketing
    // explicitly allows multiple subcategories per service, unlike PRINT's single
    // subCategory). Only validates fields actually present in this call
    // (partial-update-friendly).
    async function validateMarketingTaxonomySelection(marketingUserId: number, category?: string, subCategories?: string[]): Promise<string | null> {
      if (!category) return null;
      const [categoryTaxonomy, mapping] = await Promise.all([
        storage.getMarketingTaxonomy(),
        storage.getMarketingCategoryMapping(marketingUserId),
      ]);
      const categoryRow = categoryTaxonomy.find((c) => c.name === category);
      if (!categoryRow || !categoryRow.isActive || categoryRow.isFrozen) {
        return "Cette catégorie n'est plus disponible.";
      }
      if (!mapping.categories.includes(category)) {
        return "Sélectionnez d'abord cette catégorie dans Business → Catégories.";
      }
      if (subCategories && subCategories.length) {
        const subCategoryTaxonomy = await storage.getMarketingSubCategoryTaxonomy(categoryRow.id);
        for (const subCategory of subCategories) {
          const subRow = subCategoryTaxonomy.find((s) => s.name === subCategory);
          if (!subRow || !subRow.isActive || subRow.isFrozen) {
            return `La sous-catégorie "${subCategory}" n'est plus disponible.`;
          }
          if (!mapping.subCategories.includes(subCategory)) {
            return `Sélectionnez d'abord "${subCategory}" dans Business → Catégories.`;
          }
        }
      }
      return null;
    }

    app.get("/api/marketing/services/mine", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      try { res.json(await storage.getMarketingServicesForProvider(user.id)); }
      catch { res.status(500).json({ message: "Failed to load services" }); }
    });

    app.post("/api/marketing/services", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      try {
        const data = marketingServiceInputSchema.parse(req.body);
        if (!data.category) return res.status(400).json({ message: "La catégorie est requise" });
        const taxonomyError = await validateMarketingTaxonomySelection(user.id, data.category, data.subCategories);
        if (taxonomyError) return res.status(400).json({ message: taxonomyError });
        const service = await storage.createMarketingService(user.id, data as any);
        broadcast("marketing_service_updated", { userId: user.id, serviceId: service.id, kind: "created" });
        res.status(201).json(service);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? "Error creating service" });
      }
    });

    app.patch("/api/marketing/services/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      try {
        const data = marketingServiceInputSchema.parse(req.body);
        const taxonomyError = await validateMarketingTaxonomySelection(user.id, data.category, data.subCategories);
        if (taxonomyError) return res.status(400).json({ message: taxonomyError });
        const service = await storage.updateMarketingService(Number(req.params.id), user.id, data as any);
        if (!service) return res.status(404).json({ message: "Service not found" });
        broadcast("marketing_service_updated", { userId: user.id, serviceId: service.id, kind: "updated" });
        res.json(service);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? "Error updating service" });
      }
    });

    app.delete("/api/marketing/services/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      try {
        await storage.deleteMarketingService(Number(req.params.id), user.id);
        broadcast("marketing_service_updated", { userId: user.id, serviceId: Number(req.params.id), kind: "deleted" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error deleting service" }); }
    });

    // Public /marketing listing — one card per published service (Part 1/9/12).
    app.get("/api/marketing/services", async (req: any, res) => {
      try {
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        res.json(await storage.getPublishedMarketingServices({
          search: typeof req.query.search === "string" ? req.query.search : undefined,
          category: typeof req.query.category === "string" ? req.query.category : undefined,
          profileType: typeof req.query.profileType === "string" ? req.query.profileType : undefined,
          location: typeof req.query.location === "string" ? req.query.location : undefined,
          viewerLocation,
        }));
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to load Marketing services" });
      }
    });

    app.get("/api/marketing/services/:id", async (req: any, res) => {
      try {
        const service = await storage.getMarketingServiceCard(Number(req.params.id));
        if (!service) return res.status(404).json({ message: "Service not found" });
        // The owning agency (previewing a draft/unpublished service via "Aperçu") and Admin
        // (moderating regardless of publish state) bypass the public visibility rules below —
        // everyone else keeps the exact same rules, mirroring /api/academy/courses/:id.
        const viewer = req.session?.userId ? await storage.getUser(req.session.userId) : null;
        const isSelfOrAdmin = !!viewer && (viewer.id === service.marketingUserId || ["ADMIN", "SUPER_ADMIN"].includes(viewer.role));
        if (!isSelfOrAdmin) {
          if (!service.isPublished) return res.status(404).json({ message: "Service not found" });
          const agency = await storage.getUser(service.marketingUserId);
          const profile = await storage.getMarketingProfile(service.marketingUserId);
          if (!agency || agency.status !== "approved" || !profile.marketplaceVisible || profile.isFrozen || profile.isOnVacation) {
            return res.status(404).json({ message: "Service not found" });
          }
        }
        res.json(service);
      } catch { res.status(500).json({ message: "Failed to load service" }); }
    });

    app.get("/api/marketing/projects", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role === "MARKETING") return res.json(await storage.getMarketingProjectsForProvider(user.id));
      if (user.role === "CAFE_OWNER") return res.json(await storage.getMarketingProjectsForOwner(user.id));
      return res.status(403).json({ message: "Forbidden" });
    });

    app.post("/api/marketing/projects", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const body = z.object({
          marketingUserId: z.number().int().positive(),
          service: z.string().min(1),
          title: z.string().max(200).default(""),
          description: z.string().max(2000).default(""),
        }).parse(req.body);
        const target = await storage.getUser(body.marketingUserId);
        if (!target || target.role !== "MARKETING") return res.status(404).json({ message: "Marketing provider not found" });
        const user = await storage.getUser(req.session.userId!);
        const project = await storage.createMarketingProject({
          marketingUserId: body.marketingUserId, cafeOwnerId: user!.id,
          service: body.service, title: body.title, description: body.description,
          status: "PENDING",
        });
        await storage.refreshMarketingMessagingState(project.id);
        broadcast("marketing_project_updated", { projectId: project.id });
        broadcastToUsers([user!.id, body.marketingUserId], "marketing_project_updated", { projectId: project.id });
        broadcastToUsers([user!.id, body.marketingUserId], "conversation_updated", { service: "MARKETING", projectId: project.id });
        await notify({
          userId: body.marketingUserId,
          service: "MARKETING", type: "marketing_project_created", priority: "WARNING",
          title: "Nouvelle demande Marketing",
          message: `${user!.name} a demandé un service (${body.service}).`,
          entityType: "marketing_project", entityId: project.id,
          prefKey: "marketing_requests",
          dedupeKey: `marketing:project_created:${project.id}:provider`,
        });
        await notify({
          userId: user!.id,
          service: "MARKETING", type: "marketing_project_created", priority: "INFO",
          title: "Demande envoyée",
          message: `Votre demande (${body.service}) a été envoyée avec succès.`,
          entityType: "marketing_project", entityId: project.id,
          prefKey: "marketing_status",
          dedupeKey: `marketing:project_created:${project.id}:owner`,
        });
        res.status(201).json(project);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? "Unable to create request" });
      }
    });

    app.patch("/api/marketing/projects/:id/status", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      try {
        const body = z.object({
          status: z.enum(["QUOTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
          quoteAmountInCents: z.number().int().min(0).optional(),
          finalAmountInCents: z.number().int().min(0).optional(),
          progress: z.number().int().min(0).max(100).optional(),
          startDate: z.string().optional(),
          deadline: z.string().optional(),
        }).parse(req.body);
        const updated = await storage.updateMarketingProjectStatus(Number(req.params.id), user.id, body);
        if (!updated) return res.status(404).json({ message: "Project not found" });
        await storage.refreshMarketingMessagingState(updated.id);
        broadcast("marketing_project_updated", { projectId: updated.id });
        broadcastToUsers([user.id, updated.cafeOwnerId], "marketing_project_updated", { projectId: updated.id });
        const STATUS_TEXT_FR: Partial<Record<string, { title: string; priority: NotificationPriority; text: string }>> = {
          QUOTED: { title: "Devis reçu", priority: "WARNING", text: `vous a envoyé un devis pour "${updated.service}"` },
          IN_PROGRESS: { title: "Projet démarré", priority: "INFO", text: `a démarré votre projet "${updated.service}"` },
          COMPLETED: { title: "Projet terminé", priority: "SUCCESS", text: `a terminé votre projet "${updated.service}". N'hésitez pas à laisser un avis` },
          CANCELLED: { title: "Projet annulé", priority: "WARNING", text: `a annulé votre projet "${updated.service}"` },
        };
        const statusText = body.status ? STATUS_TEXT_FR[body.status] : undefined;
        if (statusText) {
          await notify({
            userId: updated.cafeOwnerId,
            service: "MARKETING", type: "marketing_project_status_changed", priority: statusText.priority,
            title: statusText.title,
            message: `${user.name} ${statusText.text}.`,
            entityType: "marketing_project", entityId: updated.id,
            prefKey: "marketing_status",
            dedupeKey: `marketing:project_status:${updated.id}:${body.status}`,
          });
        }
        res.json(updated);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? "Invalid request" });
      }
    });

    app.patch("/api/marketing/projects/:id/quote-response", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const { accepted } = z.object({ accepted: z.boolean() }).parse(req.body);
      const updated = await storage.respondToMarketingQuote(Number(req.params.id), user.id, accepted);
      if (!updated) return res.status(404).json({ message: "Quote not found or already answered" });
      await storage.refreshMarketingMessagingState(updated.id);
      broadcast("marketing_project_updated", { projectId: updated.id });
      broadcastToUsers([user.id, updated.marketingUserId], "marketing_project_updated", { projectId: updated.id });
      await notify({
        userId: updated.marketingUserId,
        service: "MARKETING", type: "marketing_quote_response", priority: accepted ? "SUCCESS" : "WARNING",
        title: accepted ? "Devis accepté" : "Devis refusé",
        message: `${user.name} a ${accepted ? "accepté" : "refusé"} votre devis pour "${updated.service}".`,
        entityType: "marketing_project", entityId: updated.id,
        prefKey: "marketing_requests",
        dedupeKey: `marketing:quote_response:${updated.id}:${accepted}`,
      });
      res.json(updated);
    });

    app.patch("/api/marketing/projects/:id/cancel", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const updated = await storage.cancelMarketingProjectByOwner(Number(req.params.id), user.id);
      if (!updated) return res.status(400).json({ message: "Project can only be cancelled while still pending" });
      await storage.refreshMarketingMessagingState(updated.id);
      broadcast("marketing_project_updated", { projectId: updated.id });
      broadcastToUsers([user.id, updated.marketingUserId], "marketing_project_updated", { projectId: updated.id });
      res.json(updated);
    });

    app.get("/api/marketing/revenue", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      try { res.json(await storage.getMarketingRevenueSummary(user.id)); }
      catch { res.status(500).json({ message: "Failed to load revenue" }); }
    });

    app.get("/api/marketing/reviews/:marketingUserId", async (req, res) => {
      try { res.json(await storage.getMarketingReviews(Number(req.params.marketingUserId))); }
      catch { res.status(500).json({ message: "Failed to load Marketing reviews" }); }
    });

    app.get("/api/marketing/reviews/project/:projectId", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const projectId = Number(req.params.projectId);
      const ownerProjects = user.role === "CAFE_OWNER" ? await storage.getMarketingProjectsForOwner(user.id) : [];
      const providerProjects = user.role === "MARKETING" ? await storage.getMarketingProjectsForProvider(user.id) : [];
      const owns = [...ownerProjects, ...providerProjects].some((row) => row.id === projectId);
      if (!owns) return res.status(403).json({ message: "Forbidden" });
      res.json(user.role === "CAFE_OWNER" ? await storage.getMarketingReviewForProject(projectId, user.id) : null);
    });

    app.post("/api/marketing/reviews", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER" || user.status !== "approved") {
        return res.status(403).json({ message: "Only approved Coffee Owners can submit reviews" });
      }
      const body = z.object({
        marketingUserId: z.number().int().positive(),
        projectId: z.number().int().positive(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(2000).optional(),
      }).parse(req.body);
      const projects = await storage.getMarketingProjectsForOwner(user.id);
      const project = projects.find((row) => row.id === body.projectId);
      if (!project || project.marketingUserId !== body.marketingUserId || project.status !== "COMPLETED") {
        return res.status(400).json({ message: "Reviews are available after a completed project" });
      }
      const result = await storage.upsertMarketingReview({ ...body, cafeId: user.id, cafeName: user.name, cafeOwnerName: user.name });
      broadcast("marketing_review_updated", { marketingUserId: body.marketingUserId, projectId: body.projectId });
      if (!result.isUpdate) {
        await notify({
          userId: body.marketingUserId,
          service: "MARKETING", type: "marketing_review_created", priority: "INFO",
          title: "Nouvel avis reçu",
          message: `${user.name} vous a laissé un avis (${body.rating}/5).`,
          entityType: "marketing_project", entityId: body.projectId,
          prefKey: "reviews",
          dedupeKey: `marketing:review_created:${body.projectId}`,
        });
      }
      res.status(result.isUpdate ? 200 : 201).json(result.review);
    });

    app.post("/api/marketing/reviews/:id/report", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MARKETING") return res.status(403).json({ message: "Marketing access required" });
      const reviewId = Number(req.params.id);
      const reviews = await storage.getMarketingReviews(user.id);
      if (!reviews.some((review) => review.id === reviewId)) return res.status(404).json({ message: "Review not found" });
      const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(req.body);
      await storage.reportReview(reviewId, reason);
      broadcast("marketing_review_updated", { marketingUserId: user.id, reviewId });
      res.json({ ok: true });
    });

    // Entity-level report — a Coffee Owner flagging a Marketing account itself
    // (distinct from review-reporting above), mirrors the Maintenance blacklist route.
    app.post("/api/marketing/:userId/report", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const marketingUserId = Number(req.params.userId);
      const target = await storage.getUser(marketingUserId);
      if (!target || target.role !== "MARKETING") return res.status(404).json({ message: "Marketing account not found" });
      try {
        const { reason, rating } = z.object({ reason: z.string().min(1).max(500), rating: z.number().int().min(1).max(5) }).parse(req.body);
        const report = await storage.createMarketingReport(user.id, marketingUserId, reason, rating);
        broadcast("admin_marketing_report_created", { marketingUserId });
        const adminIds = await storage.getAdminUserIds();
        await notifyMany({
          userIds: adminIds,
          service: "ADMIN", type: "marketing_report_created", priority: "URGENT",
          title: "Prestataire Marketing signalé",
          message: `${user.name} a signalé ${target.name} (Marketing) : "${reason}".`,
          entityType: "marketing_report", entityId: report.id,
          prefKey: "reports",
          dedupeKeyPrefix: `admin:marketing_report_created:${report.id}`,
        });
        res.status(201).json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid report data" });
      }
    });

    app.get("/api/marketing/reports/mine", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      res.json(await storage.getMarketingReportsByOwner(user.id));
    });

    app.get("/api/marketing/reports/published", requireAuth, async (req: any, res) => {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 50);
      res.json(await storage.getPublishedMarketingReports(page, limit));
    });

    // ── Admin Marketing — mirrors the Admin Maintenance section above exactly. ──
    app.get("/api/admin/marketing", requireAdmin, async (_req, res) => {
      try { res.json(await storage.getMarketingAdminOverview()); }
      catch { res.status(500).json({ message: "Failed to load Marketing overview" }); }
    });

    app.get("/api/admin/marketing/taxonomy", requireAdmin, async (_req, res) => {
      try { res.json(await storage.getMarketingTaxonomy()); }
      catch { res.status(500).json({ message: "Failed to load Marketing taxonomy" }); }
    });

    app.post("/api/admin/marketing/categories", requireAdmin, async (req, res) => {
      try {
        const { name, icon } = z.object({ name: z.string().trim().min(1).max(120), icon: z.string().max(8).optional().nullable() }).parse(req.body);
        const item = await storage.createMarketingCategory(name, icon);
        broadcast("marketing_updated", { kind: "taxonomy" });
        res.status(201).json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Category already exists or is invalid" });
      }
    });

    app.patch("/api/admin/marketing/categories/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          name: z.string().trim().min(1).max(120).optional(),
          icon: z.string().max(8).optional().nullable(),
          isActive: z.boolean().optional(),
          isFrozen: z.boolean().optional(),
        }).parse(req.body);
        const item = await storage.updateMarketingCategory(Number(req.params.id), body);
        if (!item) return res.status(404).json({ message: "Category not found" });
        broadcast("marketing_updated", { kind: "taxonomy" });
        res.json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid category" });
      }
    });

    app.delete("/api/admin/marketing/categories/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deleteMarketingCategory(Number(req.params.id));
        broadcast("marketing_updated", { kind: "taxonomy" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete category" }); }
    });

    // ── Admin Marketing subcategories — mirrors Admin PRINT's
    // POST/PATCH/DELETE /api/admin/print/subcategories exactly. ──
    app.post("/api/admin/marketing/subcategories", requireAdmin, async (req, res) => {
      try {
        const { categoryId, name, icon } = z.object({ categoryId: z.number().int().positive(), name: z.string().trim().min(1).max(120), icon: z.string().trim().max(8).nullable().optional() }).parse(req.body);
        const created = await storage.createMarketingSubCategory(categoryId, name, icon ?? null);
        broadcast("marketing_updated", { kind: "taxonomy" });
        res.status(201).json(created);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to create subcategory" });
      }
    });

    app.patch("/api/admin/marketing/subcategories/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          name: z.string().trim().min(1).max(120).optional(),
          icon: z.string().trim().max(8).nullable().optional(),
          isActive: z.boolean().optional(),
          isFrozen: z.boolean().optional(),
        }).parse(req.body);
        const updated = await storage.updateMarketingSubCategory(Number(req.params.id), body);
        if (!updated) return res.status(404).json({ message: "Subcategory not found" });
        broadcast("marketing_updated", { kind: "taxonomy" });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update subcategory" });
      }
    });

    app.delete("/api/admin/marketing/subcategories/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deleteMarketingSubCategory(Number(req.params.id));
        broadcast("marketing_updated", { kind: "taxonomy" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete subcategory" }); }
    });

    // Registered BEFORE the /:userId route below — see Print's identical comment above
    // and docs/service_card_reorder_and_detail_modal_audit.md Part 1.
    app.patch("/api/admin/marketing/accounts/bulk-order", requireAdmin, async (req, res) => {
      try {
        const orders: { id: number; displayOrder: number }[] = req.body?.orders;
        if (!Array.isArray(orders)) return res.status(400).json({ message: "Invalid payload" });
        await storage.bulkUpdateMarketingOrder(orders);
        broadcast("marketing_updated", { kind: "bulk_order" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.patch("/api/admin/marketing/accounts/:userId", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "MARKETING") return res.status(404).json({ message: "Marketing account not found" });
        const { name, email, phone, profileImageUrl, ...profileFields } = z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          profileImageUrl: z.string().optional().nullable(),
          profileType: z.string().optional(),
          categories: z.array(z.string()).optional(),
          responseTime: z.string().optional(),
          startingPriceInCents: z.number().int().min(0).optional(),
          description: z.string().optional(),
        }).parse(req.body);
        const userUpdates: any = {};
        if (name !== undefined) userUpdates.name = name;
        if (email !== undefined) userUpdates.email = email;
        if (phone !== undefined) userUpdates.phone = phone;
        if (profileImageUrl !== undefined) userUpdates.profileImageUrl = profileImageUrl?.trim() || null;
        if (Object.keys(userUpdates).length) await storage.updateUser(userId, userUpdates);
        const profile = Object.keys(profileFields).length ? await storage.upsertMarketingProfile(userId, profileFields) : await storage.getMarketingProfile(userId);
        broadcastToUsers([userId], "user_profile_updated");
        broadcast("marketing_updated", { userId, kind: "profile" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid account data" });
      }
    });

    app.patch("/api/admin/marketing/accounts/:userId/freeze", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "MARKETING") return res.status(404).json({ message: "Marketing account not found" });
        const { isFrozen } = z.object({ isFrozen: z.boolean() }).parse(req.body);
        const profile = await storage.upsertMarketingProfile(userId, { isFrozen });
        broadcast("marketing_updated", { userId, kind: "freeze" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.patch("/api/admin/marketing/accounts/:userId/auto-approve", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "MARKETING") return res.status(404).json({ message: "Marketing account not found" });
        const autoApprove = Boolean(req.body?.autoApprove);
        const profile = await storage.setMarketingAutoApprove(userId, autoApprove);
        broadcast("marketing_updated", { userId, kind: "auto_approve" });
        res.json(profile);
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.patch("/api/admin/marketing/projects/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          service: z.string().optional(),
          title: z.string().optional(),
          description: z.string().optional(),
          status: z.enum(["PENDING", "QUOTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"]).optional(),
          quoteAmountInCents: z.number().int().min(0).optional(),
          finalAmountInCents: z.number().int().min(0).optional(),
          progress: z.number().int().min(0).max(100).optional(),
          startDate: z.string().optional(),
          deadline: z.string().optional(),
        }).parse(req.body);
        const updated = await storage.adminUpdateMarketingProject(Number(req.params.id), body);
        if (!updated) return res.status(404).json({ message: "Project not found" });
        broadcast("marketing_project_updated", { projectId: updated.id });
        broadcastToUsers([updated.cafeOwnerId, updated.marketingUserId], "marketing_project_updated", { projectId: updated.id });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid project data" });
      }
    });

    app.patch("/api/admin/marketing/projects/:id/freeze", requireAdmin, async (req, res) => {
      try {
        const { isFrozen } = z.object({ isFrozen: z.boolean() }).parse(req.body);
        const updated = await storage.setMarketingProjectFrozen(Number(req.params.id), isFrozen);
        if (!updated) return res.status(404).json({ message: "Project not found" });
        broadcast("marketing_project_updated", { projectId: updated.id });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.delete("/api/admin/marketing/projects/:id", requireAdmin, async (req, res) => {
      try {
        const id = Number(req.params.id);
        const existing = await storage.getMarketingProjectById(id);
        if (!existing) return res.status(404).json({ message: "Project not found" });
        await storage.deleteMarketingProject(id);
        broadcast("marketing_project_updated", { projectId: id, kind: "deleted" });
        broadcastToUsers([existing.cafeOwnerId, existing.marketingUserId], "marketing_project_updated", { projectId: id, kind: "deleted" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete project" }); }
    });

    app.get("/api/admin/marketing/reports", requireAdmin, async (req: any, res) => {
      const status = typeof req.query.status === "string" ? (req.query.status as "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED") : undefined;
      res.json(await storage.getMarketingReports(status));
    });

    app.patch("/api/admin/marketing/reports/:id/resolve", requireAdmin, async (req: any, res) => {
      try {
        const { status, resolutionNote } = z.object({
          status: z.enum(["RESOLVED", "DISMISSED", "PUBLISHED", "REJECTED"]),
          resolutionNote: z.string().max(1000).optional(),
        }).parse(req.body);
        if (status === "PUBLISHED") {
          const target = await storage.getMarketingReportById(Number(req.params.id));
          if (!target) return res.status(404).json({ message: "Not found" });
          if (target.rating == null) return res.status(400).json({ message: "Ce signalement n'a pas de note et ne peut pas être publié." });
        }
        const report = await storage.resolveMarketingReport(Number(req.params.id), status, resolutionNote, req.session.userId);
        if (!report) return res.status(404).json({ message: "Not found" });
        broadcast("admin_marketing_report_created", { marketingUserId: report.marketingUserId });
        res.json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid data" });
      }
    });

    // ── Marketing favorites — mirrors maintenance-favorites endpoint-for-endpoint ──

    app.get("/api/marketing-favorites", requireAuth, async (req: any, res) => {
      res.json(await storage.getMarketingFavoritesByUser(req.session.userId));
    });

    app.post("/api/marketing-favorites", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const marketingUserId = Number(req.body?.marketingUserId);
      if (!marketingUserId) return res.status(400).json({ message: "marketingUserId is required" });
      await storage.addMarketingFavorite(user.id, marketingUserId);
      broadcastToUsers([user.id], "marketing_favorite_updated", { marketingUserId });
      res.status(201).json({ ok: true });
    });

    app.delete("/api/marketing-favorites/:marketingUserId", requireAuth, async (req: any, res) => {
      await storage.removeMarketingFavorite(req.session.userId, Number(req.params.marketingUserId));
      broadcastToUsers([req.session.userId], "marketing_favorite_updated", { marketingUserId: Number(req.params.marketingUserId) });
      res.json({ ok: true });
    });

    // ── Marketing service favorites — independent of the agency favorites above;
    // serviceId rows are distinct from agency-only rows (docs/coffee_owner_favorites_marketplace_audit.md).
    // This finally wires up marketingFavorites.serviceId, which existed in the
    // schema but was never read/written before this task. ──

    app.get("/api/marketing-favorites/services", requireAuth, async (req: any, res) => {
      res.json(await storage.getMarketingServiceFavoritesByUser(req.session.userId));
    });

    app.post("/api/marketing-favorites/services", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const marketingUserId = Number(req.body?.marketingUserId);
      const serviceId = Number(req.body?.serviceId);
      if (!marketingUserId) return res.status(400).json({ message: "marketingUserId is required" });
      if (!serviceId) return res.status(400).json({ message: "serviceId is required" });
      await storage.addMarketingServiceFavorite(user.id, marketingUserId, serviceId);
      broadcastToUsers([user.id], "marketing_service_favorite_updated", { serviceId });
      res.status(201).json({ ok: true });
    });

    app.delete("/api/marketing-favorites/services/:serviceId", requireAuth, async (req: any, res) => {
      await storage.removeMarketingServiceFavorite(req.session.userId, Number(req.params.serviceId));
      broadcastToUsers([req.session.userId], "marketing_service_favorite_updated", { serviceId: Number(req.params.serviceId) });
      res.json({ ok: true });
    });
}
