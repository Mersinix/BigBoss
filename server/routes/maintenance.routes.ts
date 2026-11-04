import { storage } from "../storage";
import { requireAuth, requireAdmin, requireApprovedCafeOwner } from "./shared/middleware";
import { z } from "zod";
import { type InsertMaintenanceProfile, type NotificationPriority } from "@shared/schema";
import { decodeMaintenanceSubSkillKey } from "@shared/maintenance-sub-skill-key";
import { broadcast, broadcastToUsers } from "../ws";
import { notify, notifyMany } from "../notify";
import type { Express } from "express";

export function registerMaintenanceRoutes(app: Express): void {
    // ── Maintenance marketplace/profile/reservations ─────────────────────────

    app.get("/api/maintenance/profiles", async (req: any, res) => {
      try {
        const available = req.query.available === undefined
          ? undefined
          : req.query.available === "true";
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        res.json(await storage.getMaintenanceProfiles({
          search: typeof req.query.search === "string" ? req.query.search : undefined,
          category: typeof req.query.category === "string" ? req.query.category : undefined,
          profileType: typeof req.query.profileType === "string" ? req.query.profileType : undefined,
          available,
          location: typeof req.query.location === "string" ? req.query.location : undefined,
          viewerLocation,
        }));
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to load Maintenance profiles" });
      }
    });

    app.get("/api/maintenance/categories", async (_req, res) => {
      try {
        res.json(await storage.getMaintenanceCategories());
      } catch (err) {
        res.status(500).json({ message: "Failed to load Maintenance categories" });
      }
    });

    app.get("/api/maintenance/taxonomy", async (_req, res) => {
      try {
        res.json(await storage.getAvailableMaintenanceTaxonomy());
      } catch (err) {
        res.status(500).json({ message: "Failed to load Maintenance taxonomy" });
      }
    });

    app.get("/api/maintenance/profile/:userId", requireAuth, async (req: any, res) => {
      const targetUserId = Number(req.params.userId);
      const viewer = await storage.getUser(req.session.userId);
      const isSelfOrAdmin = viewer && (viewer.id === targetUserId || ["ADMIN", "SUPER_ADMIN"].includes(viewer.role));
      const isCafeOwner = viewer?.role === "CAFE_OWNER";
      if (!viewer || (!isSelfOrAdmin && !isCafeOwner)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const target = await storage.getUser(targetUserId);
      if (!target || target.role !== "MAINTENANCE") return res.status(404).json({ message: "Not found" });
      const card = await storage.getMaintenanceCard(targetUserId, { lat: viewer.locationLat, lng: viewer.locationLng });
      // Coffee Owners only ever see the sanitized public `card` — never the raw
      // user row (password hash, email, etc.) — matching the same fix applied to
      // the equivalent Barista route.
      if (!isSelfOrAdmin) return res.json({ card });
      res.json({ user: target, profile: await storage.getMaintenanceProfile(targetUserId), card });
    });

    app.patch("/api/maintenance/profile", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
      const body = z.object({
        jobTitle: z.string().optional(),
        profileType: z.string().optional(),
        // `categories` intentionally removed (task: "Remove Legacy Categories from
        // Maintenance and Use Only Compétences") — `skills` is the one authoritative
        // competency field; maintaining a second parallel array that's supposed to always
        // mirror it had already drifted out of sync for at least one real account.
        skills: z.array(z.string()).optional(),
        subSkills: z.array(z.string()).optional(),
        certifications: z.array(z.string()).optional(),
        yearsExperience: z.number().int().min(0).optional(),
        responseTime: z.string().optional(),
        description: z.string().optional(),
        serviceDetails: z.string().max(4000).optional(),
        portfolioImages: z.array(z.string()).max(4, "4 photos maximum").optional(),
        coverageArea: z.string().optional(),
        marketplaceVisible: z.boolean().optional(),
      }).parse(req.body);
      // dailyRateInCents is intentionally not in this self-service schema —
      // the field is preserved internally/Admin-managed only (Admin >
      // Maintenance > Comptes), not editable by the professional themselves
      // (docs/maintenance_pricing_admin_performance_audit.md Section 5).
      // Auto Approve gating (docs/admin_maintenance_barista_professional_cards_order_autapprove_audit.md) —
      // mirrors upsertSupplierStore's identityChanged reset, but placed here (the
      // self-service route) rather than inside upsertMaintenanceProfile, since Admin's own
      // edit route (PATCH /api/admin/maintenance/accounts/:userId) also calls
      // upsertMaintenanceProfile and must never trigger its own re-review.
      const currentProfile = await storage.getMaintenanceProfile(user.id);
      const identityChanged =
        (body.description !== undefined && body.description !== currentProfile.description) ||
        (body.serviceDetails !== undefined && body.serviceDetails !== currentProfile.serviceDetails);
      const extra: Partial<InsertMaintenanceProfile> =
        identityChanged && !currentProfile.autoApprove && (currentProfile.publicationStatus === "APPROVED" || currentProfile.publicationStatus === "REJECTED")
          ? { publicationStatus: "PENDING", publicationSubmittedAt: new Date(), publicationRejectionReason: null }
          : {};
      // Data integrity: a sub-skill is only ever meaningful alongside its own parent
      // competency — silently drop (never error) any submitted sub-skill whose parent isn't
      // in the EFFECTIVE skills selection (the submitted body.skills if present, else the
      // account's already-saved skills), and whose name isn't a real, admin-managed
      // sub-competency of that parent. Mirrors the client's own "unselecting a parent drops
      // its children" rule, enforced here too so a direct API call can't save an orphaned
      // sub-skill under a parent the account doesn't actually have selected.
      //
      // Each submitted entry is a parent-qualified key ("<competency>::<subSkill>", see
      // shared/maintenance-sub-skill-key.ts) — bug fix: the same sub-skill name can exist
      // under several different parent competencies, so validating/storing by bare name
      // would silently let a selection under one parent "leak" validity to another parent
      // that happens to share a sub-skill of the same name.
      let subSkills = body.subSkills;
      if (subSkills !== undefined) {
        const effectiveSkills = body.skills ?? currentProfile.skills;
        const taxonomy = await storage.getMaintenanceTaxonomy();
        const competencyIdByName = new Map(taxonomy.competencies.map((c) => [c.name, c.id]));
        const validSubSkillNamesByCompetencyId = new Map<number, Set<string>>();
        for (const s of taxonomy.subCompetencies) {
          if (!validSubSkillNamesByCompetencyId.has(s.competencyId)) validSubSkillNamesByCompetencyId.set(s.competencyId, new Set());
          validSubSkillNamesByCompetencyId.get(s.competencyId)!.add(s.name);
        }
        subSkills = subSkills.filter((key) => {
          const decoded = decodeMaintenanceSubSkillKey(key);
          if (!decoded || !effectiveSkills.includes(decoded.competency)) return false;
          const competencyId = competencyIdByName.get(decoded.competency);
          if (competencyId === undefined) return false;
          return validSubSkillNamesByCompetencyId.get(competencyId)?.has(decoded.subSkill) ?? false;
        });
      }
      const profile = await storage.upsertMaintenanceProfile(user.id, { ...body, ...(subSkills !== undefined ? { subSkills } : {}), ...extra });
      broadcast("maintenance_updated", { userId: user.id, kind: "profile" });
      res.json(profile);
    });

    // GO Live — self-service publication request (Phase 5). Reuses the existing
    // upsertMaintenanceProfile partial-update (no new storage method needed) —
    // this is purely a status transition on the SAME profile row the professional
    // already edits via PATCH /api/maintenance/profile above. Minimal
    // completeness check only (a real description); the frontend is responsible
    // for having already saved the latest edits before calling this.
    app.post("/api/maintenance/profile/go-live", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
      const profile = await storage.getMaintenanceProfile(user.id);
      if (profile.publicationStatus === "PENDING") return res.status(400).json({ message: "Une demande est déjà en attente d'approbation." });
      if (!profile.description?.trim()) return res.status(400).json({ message: "Complétez votre biographie avant de soumettre votre profil." });
      if (!profile.jobTitle?.trim()) return res.status(400).json({ message: "Le titre du poste est requis avant de soumettre votre profil." });
      const updated = await storage.upsertMaintenanceProfile(user.id, {
        publicationStatus: "PENDING", publicationSubmittedAt: new Date(), publicationRejectionReason: null,
      });
      broadcast("maintenance_updated", { userId: user.id, kind: "publication" });
      res.json(updated);
    });

    // Admin review of a submitted publication request — distinct from both
    // account registration approval (users.status) and the isFrozen kill-switch
    // above; approving/rejecting PROFILE CONTENT for marketplace display.
    app.patch("/api/admin/maintenance/accounts/:userId/publication", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "MAINTENANCE") return res.status(404).json({ message: "Maintenance account not found" });
        const { decision, rejectionReason } = z.object({
          decision: z.enum(["APPROVED", "REJECTED"]),
          rejectionReason: z.string().trim().max(1000).optional(),
        }).parse(req.body);
        const profile = await storage.upsertMaintenanceProfile(userId, {
          publicationStatus: decision,
          publicationReviewedAt: new Date(),
          publicationRejectionReason: decision === "REJECTED" ? (rejectionReason?.trim() || "Non précisé") : null,
        });
        broadcast("maintenance_updated", { userId, kind: "publication" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.patch("/api/maintenance/availability", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
      const dayHoursSchema = z.object({ open: z.string(), close: z.string(), closed: z.boolean() });
      const body = z.object({
        workingDays: z.array(z.string()),
        startTime: z.string(),
        endTime: z.string(),
        isAvailable: z.boolean().optional(),
        isOnVacation: z.boolean(),
        // Per-day schedule (Part 2) — optional so the legacy global fields above
        // keep working unchanged for any caller that doesn't send it.
        weeklyHours: z.object({
          monday: dayHoursSchema, tuesday: dayHoursSchema, wednesday: dayHoursSchema,
          thursday: dayHoursSchema, friday: dayHoursSchema, saturday: dayHoursSchema, sunday: dayHoursSchema,
        }).optional(),
      }).parse(req.body);
      const profile = await storage.upsertMaintenanceProfile(user.id, {
        ...body,
        isAvailable: body.isAvailable ?? !body.isOnVacation,
      });
      broadcast("maintenance_updated", { userId: user.id, kind: "availability" });
      res.json(profile);
    });

    app.get("/api/maintenance/reservations", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role === "MAINTENANCE") return res.json(await storage.getMaintenanceReservationsForProvider(user.id));
      if (user.role === "CAFE_OWNER") return res.json(await storage.getMaintenanceReservationsForOwner(user.id));
      return res.status(403).json({ message: "Forbidden" });
    });

    app.get("/api/maintenance/revenue", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
      try { res.json(await storage.getMaintenanceRevenueSummary(user.id)); }
      catch { res.status(500).json({ message: "Failed to load revenue" }); }
    });

    app.post("/api/maintenance/reservations", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const body = z.object({
        maintenanceUserId: z.number().int().positive(),
        service: z.string().min(1),
        date: z.string().min(1),
        time: z.string().optional().nullable(),
        location: z.string().default(""),
        description: z.string().default(""),
        category: z.string().default(""),
        urgency: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
        contactPhone: z.string().default(""),
      }).parse(req.body);
      const profiles = await storage.getMaintenanceProfiles();
      const provider = profiles.find((profile) => profile.userId === body.maintenanceUserId && profile.available);
      if (!provider) return res.status(400).json({ message: "This Maintenance professional is not available" });
      const competencies = new Set([...provider.categories, ...provider.skills]);
      if (body.category && !competencies.has(body.category)) {
        return res.status(400).json({ message: "Selected competency is not offered by this Maintenance professional" });
      }
      // Part 17 — integrate the new per-day schedule into the existing booking
      // flow: a closed day must never be offered as if the professional were
      // working. Only enforced when a weeklyHours schedule has actually been
      // saved; the legacy global workingDays/startTime/endTime never had this
      // check either, so this is additive, not a behavior change for accounts
      // that haven't configured a per-day schedule yet.
      if (provider.weeklyHours) {
        const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
        const requestedDate = new Date(`${body.date}T00:00:00`);
        if (!Number.isNaN(requestedDate.getTime())) {
          const dayKey = WEEKDAY_KEYS[requestedDate.getDay()];
          if (provider.weeklyHours[dayKey]?.closed) {
            return res.status(400).json({ message: "This Maintenance professional is closed on the selected day" });
          }
        }
      }
      const reservation = await storage.createMaintenanceReservation({
        ...body,
        cafeOwnerId: user.id,
        contactPhone: body.contactPhone || user.phone || "",
        status: "PENDING",
      });
      await storage.refreshMaintenanceMessagingState(reservation.id);
      broadcast("maintenance_reservation_updated", { reservationId: reservation.id });
      broadcastToUsers([user.id, body.maintenanceUserId], "maintenance_reservation_updated", { reservationId: reservation.id });
      broadcastToUsers([user.id, body.maintenanceUserId], "conversation_updated", {
        service: "MAINTENANCE",
        reservationId: reservation.id,
      });
      await notify({
        userId: body.maintenanceUserId,
        service: "MAINTENANCE", type: "maintenance_reservation_created", priority: "WARNING",
        title: "Nouvelle demande de maintenance",
        message: `${user.name} a demandé une intervention (${body.service}).`,
        entityType: "maintenance_reservation", entityId: reservation.id,
        prefKey: "maintenance_requests",
        dedupeKey: `maintenance:reservation_created:${reservation.id}:provider`,
      });
      await notify({
        userId: user.id,
        service: "MAINTENANCE", type: "maintenance_reservation_created", priority: "INFO",
        title: "Demande envoyée",
        message: `Votre demande d'intervention (${body.service}) a été envoyée avec succès.`,
        entityType: "maintenance_reservation", entityId: reservation.id,
        prefKey: "maintenance_status",
        dedupeKey: `maintenance:reservation_created:${reservation.id}:owner`,
      });
      res.status(201).json(reservation);
    });

    app.patch("/api/maintenance/reservations/:id/status", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
      const body = z.object({
        status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "RESCHEDULED", "RESCHEDULE_PENDING"]),
        date: z.string().optional(),
        time: z.string().nullable().optional(),
      }).parse(req.body);
      if (body.status === "RESCHEDULE_PENDING") {
        if (!body.date) return res.status(400).json({ message: "A proposed date is required" });
        const proposed = await storage.requestMaintenanceReschedule(Number(req.params.id), user.id, body.date, body.time ?? null);
        if (!proposed) return res.status(404).json({ message: "Reservation not found" });
        broadcast("maintenance_reservation_updated", { reservationId: proposed.id, kind: "reschedule_requested" });
        broadcastToUsers([user.id, proposed.cafeOwnerId], "maintenance_reservation_updated", { reservationId: proposed.id, kind: "reschedule_requested" });
        broadcastToUsers([user.id, proposed.cafeOwnerId], "conversation_updated", {
          service: "MAINTENANCE",
          reservationId: proposed.id,
        });
        await notify({
          userId: proposed.cafeOwnerId,
          service: "MAINTENANCE", type: "maintenance_reschedule_requested", priority: "WARNING",
          title: "Nouvelle date proposée",
          message: `${user.name} propose une nouvelle date pour votre intervention (${proposed.service}).`,
          entityType: "maintenance_reservation", entityId: proposed.id,
          prefKey: "maintenance_status",
          dedupeKey: `maintenance:reschedule_requested:${proposed.id}:${proposed.proposedDate}`,
        });
        return res.json(proposed);
      }
      const updated = await storage.updateMaintenanceReservationStatus(Number(req.params.id), user.id, body.status, {
        date: body.date,
        time: body.time,
      });
      if (!updated) return res.status(404).json({ message: "Reservation not found" });
      await storage.refreshMaintenanceMessagingState(updated.id);
      broadcast("maintenance_reservation_updated", { reservationId: updated.id });
      broadcastToUsers([user.id, updated.cafeOwnerId], "maintenance_reservation_updated", { reservationId: updated.id });
      broadcastToUsers([user.id, updated.cafeOwnerId], "conversation_updated", {
        service: "MAINTENANCE",
        reservationId: updated.id,
      });
      const STATUS_TEXT_FR: Partial<Record<string, { title: string; message: string; priority: NotificationPriority }>> = {
        CONFIRMED: { title: "Intervention confirmée", message: `${user.name} a confirmé votre intervention (${updated.service}).`, priority: "SUCCESS" },
        COMPLETED: { title: "Intervention terminée", message: `${user.name} a terminé l'intervention (${updated.service}). N'hésitez pas à laisser un avis.`, priority: "INFO" },
        CANCELLED: { title: "Intervention annulée", message: `${user.name} a annulé votre intervention (${updated.service}).`, priority: "WARNING" },
      };
      const statusText = STATUS_TEXT_FR[body.status];
      if (statusText) {
        await notify({
          userId: updated.cafeOwnerId,
          service: "MAINTENANCE", type: "maintenance_reservation_status_changed", priority: statusText.priority,
          title: statusText.title, message: statusText.message,
          entityType: "maintenance_reservation", entityId: updated.id,
          prefKey: "maintenance_status",
          dedupeKey: `maintenance:reservation_status:${updated.id}:${body.status}`,
        });
      }
      res.json(updated);
    });

    app.patch("/api/maintenance/reservations/:id/reschedule-response", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const body = z.object({ accepted: z.boolean() }).parse(req.body);
      const updated = await storage.respondToMaintenanceReschedule(Number(req.params.id), user.id, body.accepted);
      if (!updated) return res.status(404).json({ message: "Rescheduling request not found" });
      await storage.refreshMaintenanceMessagingState(updated.id);
      broadcast("maintenance_reservation_updated", { reservationId: updated.id, kind: body.accepted ? "reschedule_accepted" : "reschedule_rejected" });
      broadcastToUsers([user.id, updated.maintenanceUserId], "maintenance_reservation_updated", { reservationId: updated.id, kind: body.accepted ? "reschedule_accepted" : "reschedule_rejected" });
        broadcastToUsers([user.id, updated.maintenanceUserId], "conversation_updated", {
          service: "MAINTENANCE",
          reservationId: updated.id,
        });
      await notify({
        userId: updated.maintenanceUserId,
        service: "MAINTENANCE", type: "maintenance_reschedule_response", priority: body.accepted ? "SUCCESS" : "WARNING",
        title: body.accepted ? "Reprogrammation acceptée" : "Reprogrammation refusée",
        message: `${user.name} a ${body.accepted ? "accepté" : "refusé"} la nouvelle date pour l'intervention (${updated.service}).`,
        entityType: "maintenance_reservation", entityId: updated.id,
        prefKey: "maintenance_requests",
        dedupeKey: `maintenance:reschedule_response:${updated.id}:${body.accepted}`,
      });
      res.json(updated);
    });

    // ── Maintenance — Job posting system ("Interventions") ───────────────────
    // Mirrors the Barista job-posting routes (POST /api/barista/jobs etc.)
    // field-for-field — see docs/maintenance_interventions_implementation_audit.md.
    // Visibility is enforced server-side on every read, never left to the
    // frontend alone:
    //   AUTOMATIC + PUBLISHED + not expired -> every ELIGIBLE Maintenance provider
    //     (same gate as getMaintenanceProfiles: approved, marketplaceVisible,
    //     not on vacation, not frozen, publicationStatus APPROVED)
    //   MANUAL + PUBLISHED + not expired -> only providers targeted via
    //     POST .../targets (MaintenanceJobTargetButton, mounted in Fast Search
    //     and the provider Details modal)
    //   DRAFT / CLOSED / expired -> only the owning Coffee Owner / Admin

    const maintenanceJobPostBodySchema = z.object({
      title: z.string().trim().min(1).max(200),
      establishment: z.string().trim().max(200).optional(),
      locationAddress: z.string().trim().max(300).optional(),
      categories: z.array(z.string().max(60)).max(20).optional(),
      subCategories: z.array(z.string().max(60)).max(40).optional(),
      urgency: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
      scheduledDate: z.string().trim().max(20).optional().nullable(),
      scheduledTime: z.string().trim().max(10).optional().nullable(),
      contactPhone: z.string().trim().max(40).optional(),
      description: z.string().trim().max(5000).optional(),
      requirements: z.string().trim().max(5000).optional(),
      expiresAt: z.string().optional().nullable(),
      publicationMode: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
      status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional(),
    });

    function normalizeMaintenanceJobPostBody(body: Partial<z.infer<typeof maintenanceJobPostBodySchema>>) {
      const payload: any = { ...body };
      if (body.expiresAt !== undefined) payload.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      return payload;
    }

    // Data integrity: a required sub-skill is only ever meaningful alongside its own
    // parent category — silently drop (never error) any submitted sub-category whose
    // parent isn't in the EFFECTIVE categories selection, and whose name isn't a real,
    // admin-managed sub-competency of that parent. Same pattern as PATCH
    // /api/maintenance/profile's subSkills validation.
    async function validMaintenanceSubCategories(categories: string[], subCategories: string[]): Promise<string[]> {
      if (!subCategories.length) return subCategories;
      const taxonomy = await storage.getMaintenanceTaxonomy();
      const competencyNameById = new Map(taxonomy.competencies.map((c) => [c.id, c.name]));
      const validNames = new Set(
        taxonomy.subCompetencies
          .filter((s) => categories.includes(competencyNameById.get(s.competencyId) ?? ""))
          .map((s) => s.name),
      );
      return subCategories.filter((name) => validNames.has(name));
    }

    app.post("/api/maintenance/jobs", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const body = maintenanceJobPostBodySchema.parse(req.body);
        const user = await storage.getUser(req.session.userId!);
        const payload = normalizeMaintenanceJobPostBody(body);
        if (payload.subCategories !== undefined) {
          payload.subCategories = await validMaintenanceSubCategories(payload.categories ?? [], payload.subCategories);
        }
        if (!payload.establishment) payload.establishment = user!.name;
        if (!payload.locationAddress) payload.locationAddress = user!.locationAddress ?? "";
        if (!payload.contactPhone) payload.contactPhone = user!.phone ?? "";
        const job = await storage.createMaintenanceJobPost(user!.id, payload);
        broadcast("maintenance_jobs_updated", { cafeOwnerId: user!.id });
        res.status(201).json(job);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid intervention data" });
      }
    });

    app.get("/api/maintenance/jobs/mine", requireApprovedCafeOwner, async (req: any, res) => {
      try { res.json(await storage.getMaintenanceJobPostsForOwner(req.session.userId!)); }
      catch { res.status(500).json({ message: "Failed to load interventions" }); }
    });

    // Provider-side discovery — automatic + published + not expired (eligible
    // providers only), union manually-targeted + published + not expired for
    // this provider specifically.
    app.get("/api/maintenance/jobs/discover", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
      try {
        const jobs = await storage.getDiscoverableMaintenanceJobPosts(user.id);
        const appliedRows = await storage.getMaintenanceJobApplicationsForProvider(user.id);
        const appliedIds = new Set(appliedRows.map((a) => a.jobPostId));
        res.json(jobs.map((j) => ({ ...j, hasApplied: appliedIds.has(j.id) })));
      } catch { res.status(500).json({ message: "Failed to load intervention opportunities" }); }
    });

    app.get("/api/maintenance/applications/mine", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
      try { res.json(await storage.getMaintenanceJobApplicationsForProvider(user.id)); }
      catch { res.status(500).json({ message: "Failed to load applications" }); }
    });

    // Single job detail — visibility enforced per the rule above. Deliberately
    // a requireAuth-gated GET (not public) so a guessed id from an
    // unauthenticated or unrelated account never resolves a MANUAL job.
    app.get("/api/maintenance/jobs/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const job = await storage.getMaintenanceJobPostById(Number(req.params.id));
      if (!job) return res.status(404).json({ message: "Intervention not found" });
      const isOwnerOrAdmin = user.id === job.cafeOwnerId || ["ADMIN", "SUPER_ADMIN"].includes(user.role);
      if (isOwnerOrAdmin) {
        const withStats = await storage.getMaintenanceJobPostWithStats(job.id);
        const targets = job.publicationMode === "MANUAL" ? await storage.getMaintenanceJobTargets(job.id) : [];
        return res.json({ job: withStats, targets });
      }
      if (user.role !== "MAINTENANCE") return res.status(403).json({ message: "Forbidden" });
      const eligible = await storage.isMaintenanceProviderEligible(user.id);
      if (!eligible) return res.status(404).json({ message: "Intervention not found" });
      const now = new Date();
      const notExpired = !job.expiresAt || new Date(job.expiresAt as any) > now;
      const visible = job.status === "PUBLISHED" && notExpired && (
        job.publicationMode === "AUTOMATIC" || await storage.isMaintenanceJobTargeted(job.id, user.id)
      );
      if (!visible) return res.status(404).json({ message: "Intervention not found" });
      const hasApplied = await storage.hasMaintenanceAppliedToJob(job.id, user.id);
      res.json({ job, hasApplied });
    });

    app.patch("/api/maintenance/jobs/:id", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const body = maintenanceJobPostBodySchema.partial().parse(req.body);
        const existing = await storage.getMaintenanceJobPostById(Number(req.params.id));
        if (!existing || existing.cafeOwnerId !== req.session.userId) return res.status(404).json({ message: "Intervention not found" });
        const payload = normalizeMaintenanceJobPostBody(body);
        const effectiveCategories = payload.categories ?? existing.categories;
        if (payload.subCategories !== undefined) {
          payload.subCategories = await validMaintenanceSubCategories(effectiveCategories, payload.subCategories);
        }
        // Re-validate manual targets' skill match before actually publishing — a target's
        // own skills may have changed since they were added, or the required categories/
        // sub-categories may be changing in this very request. Never silently drop a saved
        // target: block the publish instead so the Coffee Owner fixes the target list or
        // the requirements themselves (task: "re-evaluate eligibility before publication
        // and handle any mismatch clearly").
        const willBePublished = (payload.status ?? existing.status) === "PUBLISHED";
        const effectiveMode = payload.publicationMode ?? existing.publicationMode;
        if (willBePublished && effectiveMode === "MANUAL") {
          const effectiveSubCategories = payload.subCategories ?? existing.subCategories;
          const targets = await storage.getMaintenanceJobTargets(existing.id);
          const mismatchedNames: string[] = [];
          for (const t of targets) {
            const ok = await storage.isMaintenanceProviderSkillMatch(t.maintenanceUserId, { categories: effectiveCategories, subCategories: effectiveSubCategories });
            if (!ok) mismatchedNames.push(t.maintenanceName);
          }
          if (mismatchedNames.length) {
            return res.status(400).json({
              message: `Impossible de publier : ${mismatchedNames.join(", ")} ne correspond${mismatchedNames.length > 1 ? "ent" : ""} plus aux compétences requises. Retirez ce${mismatchedNames.length > 1 ? "s profils" : " profil"} de la liste des cibles ou ajustez les compétences requises avant de publier.`,
            });
          }
        }
        const updated = await storage.updateMaintenanceJobPost(Number(req.params.id), req.session.userId!, payload);
        if (!updated) return res.status(404).json({ message: "Intervention not found" });
        broadcast("maintenance_jobs_updated", { cafeOwnerId: req.session.userId });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid intervention data" });
      }
    });

    // Manual targeting — called from MaintenanceJobTargetButton when the Coffee
    // Owner associates the provider currently shown with one of their own
    // MANUAL intervention posts. Owner-only, and only for their own job; the
    // target must be an eligible Maintenance provider, not merely role-matching.
    app.post("/api/maintenance/jobs/:id/targets", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const { maintenanceUserId } = z.object({ maintenanceUserId: z.number().int().positive() }).parse(req.body);
        const job = await storage.getMaintenanceJobPostById(Number(req.params.id));
        if (!job || job.cafeOwnerId !== req.session.userId) return res.status(404).json({ message: "Intervention not found" });
        if (job.publicationMode !== "MANUAL") return res.status(400).json({ message: "Seules les interventions en publication manuelle peuvent être ciblées." });
        const target = await storage.getUser(maintenanceUserId);
        if (!target || target.role !== "MAINTENANCE") return res.status(404).json({ message: "Maintenance provider not found" });
        if (!(await storage.isMaintenanceProviderEligible(maintenanceUserId))) {
          return res.status(400).json({ message: "Ce professionnel n'est pas éligible (profil non approuvé ou masqué)." });
        }
        // Real enforcement point for "the Coffee Owner must not be able to bypass eligibility
        // rules by manually selecting an otherwise ineligible profile" — this route is the
        // only place a manual target is actually saved, regardless of which UI reached it.
        if (!(await storage.isMaintenanceProviderSkillMatch(maintenanceUserId, { categories: job.categories, subCategories: job.subCategories }))) {
          return res.status(400).json({ message: "Ce professionnel n'a pas les compétences requises pour cette intervention." });
        }
        const row = await storage.addMaintenanceJobTarget(job.id, maintenanceUserId);
        await notify({
          userId: maintenanceUserId,
          service: "MAINTENANCE", type: "maintenance_job_targeted", priority: "INFO",
          title: "Nouvelle intervention proposée",
          message: `${job.establishment || "Un établissement"} vous propose l'intervention "${job.title}".`,
          entityType: "maintenance_job_post", entityId: job.id,
          prefKey: "maintenance_jobs",
          dedupeKey: `maintenance:job_targeted:${job.id}:${maintenanceUserId}`,
        });
        // Pre-existing realtime gap (unrelated to skill-matching itself, found during this
        // task's audit): this route never broadcast at all, so a newly-targeted provider's
        // already-open "discover" view never refreshed until some other event happened to
        // invalidate it. Closes it using the exact same event/convention the create/update
        // routes above already use — no new event introduced.
        broadcast("maintenance_jobs_updated", { cafeOwnerId: req.session.userId });
        res.status(201).json(row);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    // Admin read access mirrors GET /api/maintenance/jobs/:id's own
    // isOwnerOrAdmin rule — needed so Admin's read-only intervention detail
    // modal can show "Profils ciblés" (docs/maintenance_intervention_reservation_cleanup_audit.md
    // Section 11, item 8), never granted to an unrelated Coffee Owner.
    app.get("/api/maintenance/jobs/:id/targets", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const job = await storage.getMaintenanceJobPostById(Number(req.params.id));
      const isOwnerOrAdmin = !!job && (user.id === job.cafeOwnerId || ["ADMIN", "SUPER_ADMIN"].includes(user.role));
      if (!job || !isOwnerOrAdmin) return res.status(404).json({ message: "Intervention not found" });
      try { res.json(await storage.getMaintenanceJobTargets(job.id)); }
      catch { res.status(500).json({ message: "Failed to load targets" }); }
    });

    // ── Applications ──
    app.post("/api/maintenance/jobs/:id/apply", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
      try {
        const { message } = z.object({ message: z.string().max(2000).optional() }).parse(req.body);
        const job = await storage.getMaintenanceJobPostById(Number(req.params.id));
        if (!job) return res.status(404).json({ message: "Intervention not found" });
        if (!(await storage.isMaintenanceProviderEligible(user.id))) return res.status(403).json({ message: "Forbidden" });
        const now = new Date();
        const notExpired = !job.expiresAt || new Date(job.expiresAt as any) > now;
        if (job.status !== "PUBLISHED" || !notExpired) return res.status(400).json({ message: "Cette intervention n'accepte plus de réponses." });
        const eligible = job.publicationMode === "AUTOMATIC" || await storage.isMaintenanceJobTargeted(job.id, user.id);
        if (!eligible) return res.status(403).json({ message: "Forbidden" });
        if (await storage.hasMaintenanceAppliedToJob(job.id, user.id)) {
          return res.status(400).json({ message: "Vous avez déjà répondu à cette intervention." });
        }
        const application = await storage.createMaintenanceJobApplication(job.id, user.id, message);
        broadcast("maintenance_jobs_updated", { cafeOwnerId: job.cafeOwnerId });
        await notify({
          userId: job.cafeOwnerId,
          service: "MAINTENANCE", type: "maintenance_job_application_received", priority: "INFO",
          title: "Nouvelle réponse à votre intervention",
          message: `${user.name} a répondu à "${job.title}".`,
          entityType: "maintenance_job_application", entityId: application.id,
          prefKey: "maintenance_jobs",
          dedupeKey: `maintenance:job_application_created:${application.id}`,
        });
        res.status(201).json(application);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        if (err instanceof Error && /duplicate key|unique/i.test(err.message)) {
          return res.status(400).json({ message: "Vous avez déjà répondu à cette intervention." });
        }
        res.status(400).json({ message: "Invalid application" });
      }
    });

    // Admin read access mirrors GET /api/maintenance/jobs/:id's own
    // isOwnerOrAdmin rule — needed so Admin's read-only intervention detail
    // modal can show "Réponses" (docs/maintenance_intervention_reservation_cleanup_audit.md
    // Section 11, item 8), never granted to an unrelated Coffee Owner.
    app.get("/api/maintenance/jobs/:id/applications", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const job = await storage.getMaintenanceJobPostById(Number(req.params.id));
      const isOwnerOrAdmin = !!job && (user.id === job.cafeOwnerId || ["ADMIN", "SUPER_ADMIN"].includes(user.role));
      if (!job || !isOwnerOrAdmin) return res.status(404).json({ message: "Intervention not found" });
      try { res.json(await storage.getMaintenanceJobApplicationsForJob(job.id)); }
      catch { res.status(500).json({ message: "Failed to load applications" }); }
    });

    // Accepting creates the real, linked maintenanceReservations row (see
    // storage.acceptMaintenanceJobApplication) and fires the exact same
    // notify/broadcast pattern the existing POST /api/maintenance/reservations
    // route already fires, so the new reservation appears instantly in both
    // parties' existing, unmodified Réservations/Planning views.
    app.patch("/api/maintenance/applications/:id/status", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const { status } = z.object({ status: z.enum(["ACCEPTED", "REJECTED"]) }).parse(req.body);
        const application = await storage.getMaintenanceJobApplicationById(Number(req.params.id));
        if (!application) return res.status(404).json({ message: "Application not found" });
        const job = await storage.getMaintenanceJobPostById(application.jobPostId);
        if (!job || job.cafeOwnerId !== req.session.userId) return res.status(404).json({ message: "Application not found" });
        if (application.status !== "PENDING") return res.status(400).json({ message: "Cette réponse a déjà été traitée." });
        const user = await storage.getUser(req.session.userId!);

        if (status === "REJECTED") {
          const updated = await storage.rejectMaintenanceJobApplication(application.id);
          broadcast("maintenance_jobs_updated", { cafeOwnerId: job.cafeOwnerId });
          broadcastToUsers([application.maintenanceUserId], "maintenance_jobs_updated", {});
          await notify({
            userId: application.maintenanceUserId,
            service: "MAINTENANCE", type: "maintenance_job_application_status_changed", priority: "INFO",
            title: "Réponse déclinée",
            message: `Votre réponse pour "${job.title}" n'a pas été retenue.`,
            entityType: "maintenance_job_application", entityId: application.id,
            prefKey: "maintenance_jobs",
            dedupeKey: `maintenance:job_application_status:${application.id}:REJECTED`,
          });
          return res.json(updated);
        }

        const result = await storage.acceptMaintenanceJobApplication(application.id);
        if (!result) return res.status(404).json({ message: "Application not found" });
        const { application: updatedApplication, reservation } = result;
        await storage.refreshMaintenanceMessagingState(reservation.id);
        broadcast("maintenance_jobs_updated", { cafeOwnerId: job.cafeOwnerId });
        broadcastToUsers([application.maintenanceUserId], "maintenance_jobs_updated", {});
        broadcast("maintenance_reservation_updated", { reservationId: reservation.id });
        broadcastToUsers([job.cafeOwnerId, application.maintenanceUserId], "maintenance_reservation_updated", { reservationId: reservation.id });
        broadcastToUsers([job.cafeOwnerId, application.maintenanceUserId], "conversation_updated", {
          service: "MAINTENANCE",
          reservationId: reservation.id,
        });
        await notify({
          userId: application.maintenanceUserId,
          service: "MAINTENANCE", type: "maintenance_job_application_status_changed", priority: "SUCCESS",
          title: "Réponse acceptée",
          message: `${user!.name} a accepté votre réponse pour "${job.title}". Une intervention a été créée.`,
          entityType: "maintenance_reservation", entityId: reservation.id,
          prefKey: "maintenance_jobs",
          dedupeKey: `maintenance:job_application_status:${application.id}:ACCEPTED`,
        });
        res.json(updatedApplication);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.get("/api/maintenance/reviews/:maintenanceUserId", async (req, res) => {
      try {
        res.json(await storage.getMaintenanceReviews(Number(req.params.maintenanceUserId)));
      } catch { res.status(500).json({ message: "Failed to load Maintenance reviews" }); }
    });

    app.get("/api/maintenance/reviews/reservation/:reservationId", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const reservationId = Number(req.params.reservationId);
      const ownerReviews = user.role === "CAFE_OWNER"
        ? await storage.getMaintenanceReservationsForOwner(user.id)
        : [];
      const providerReviews = user.role === "MAINTENANCE"
        ? await storage.getMaintenanceReservationsForProvider(user.id)
        : [];
      const owns = [...ownerReviews, ...providerReviews].some((row) => row.id === reservationId);
      if (!owns) return res.status(403).json({ message: "Forbidden" });
      res.json(user.role === "CAFE_OWNER"
        ? await storage.getMaintenanceReviewForReservation(reservationId, user.id)
        : null);
    });

    app.post("/api/maintenance/reviews", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER" || user.status !== "approved") {
        return res.status(403).json({ message: "Only approved Coffee Owners can submit reviews" });
      }
      const body = z.object({
        maintenanceUserId: z.number().int().positive(),
        reservationId: z.number().int().positive(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(2000).optional(),
      }).parse(req.body);
      const reservations = await storage.getMaintenanceReservationsForOwner(user.id);
      const reservation = reservations.find((row) => row.id === body.reservationId);
      if (!reservation || reservation.maintenanceUserId !== body.maintenanceUserId || reservation.status !== "COMPLETED") {
        return res.status(400).json({ message: "Reviews are available after a completed intervention" });
      }
      const result = await storage.upsertMaintenanceReview({
        ...body,
        cafeId: user.id,
        cafeName: user.name,
        cafeOwnerName: user.name,
      });
      broadcast("maintenance_review_updated", { maintenanceUserId: body.maintenanceUserId, reservationId: body.reservationId });
      if (!result.isUpdate) {
        await notify({
          userId: body.maintenanceUserId,
          service: "MAINTENANCE", type: "maintenance_review_created", priority: "INFO",
          title: "Nouvel avis reçu",
          message: `${user.name} vous a laissé un avis (${body.rating}/5).`,
          entityType: "maintenance_reservation", entityId: body.reservationId,
          prefKey: "reviews",
          dedupeKey: `maintenance:review_created:${body.reservationId}`,
        });
      }
      res.status(result.isUpdate ? 200 : 201).json(result.review);
    });

    app.post("/api/maintenance/reviews/:id/report", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
      const reviewId = Number(req.params.id);
      const reviews = await storage.getMaintenanceReviews(user.id);
      if (!reviews.some((review) => review.id === reviewId)) return res.status(404).json({ message: "Review not found" });
      const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(req.body);
      await storage.reportReview(reviewId, reason);
      broadcast("maintenance_review_updated", { maintenanceUserId: user.id, reviewId });
      res.json({ ok: true });
    });

    app.get("/api/admin/maintenance", requireAdmin, async (_req, res) => {
      try { res.json(await storage.getMaintenanceAdminOverview()); }
      catch { res.status(500).json({ message: "Failed to load Maintenance overview" }); }
    });

    app.get("/api/admin/maintenance/taxonomy", requireAdmin, async (_req, res) => {
      try { res.json(await storage.getMaintenanceTaxonomy()); }
      catch { res.status(500).json({ message: "Failed to load Maintenance taxonomy" }); }
    });

    app.post("/api/admin/maintenance/competencies", requireAdmin, async (req, res) => {
      try {
        const { name, icon } = z.object({ name: z.string().trim().min(1).max(120), icon: z.string().max(8).optional().nullable() }).parse(req.body);
        const item = await storage.createMaintenanceCompetency(name, icon);
        broadcast("maintenance_updated", { kind: "taxonomy" });
        res.status(201).json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Competency already exists or is invalid" });
      }
    });

    app.patch("/api/admin/maintenance/competencies/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          name: z.string().trim().min(1).max(120).optional(),
          icon: z.string().max(8).optional().nullable(),
          isActive: z.boolean().optional(),
          isFrozen: z.boolean().optional(),
        }).parse(req.body);
        const item = await storage.updateMaintenanceCompetency(Number(req.params.id), body);
        if (!item) return res.status(404).json({ message: "Competency not found" });
        broadcast("maintenance_updated", { kind: "taxonomy" });
        res.json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid competency" });
      }
    });

    app.delete("/api/admin/maintenance/competencies/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deleteMaintenanceCompetency(Number(req.params.id));
        broadcast("maintenance_updated", { kind: "taxonomy" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete competency" }); }
    });

    app.post("/api/admin/maintenance/zones", requireAdmin, async (req, res) => {
      try {
        const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body);
        const item = await storage.createMaintenanceZone(name);
        broadcast("maintenance_updated", { kind: "taxonomy" });
        res.status(201).json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Zone already exists or is invalid" });
      }
    });

    app.patch("/api/admin/maintenance/zones/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          name: z.string().trim().min(1).max(120).optional(),
          isActive: z.boolean().optional(),
          isFrozen: z.boolean().optional(),
        }).parse(req.body);
        const item = await storage.updateMaintenanceZone(Number(req.params.id), body);
        if (!item) return res.status(404).json({ message: "Zone not found" });
        broadcast("maintenance_updated", { kind: "taxonomy" });
        res.json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid zone" });
      }
    });

    app.delete("/api/admin/maintenance/zones/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deleteMaintenanceZone(Number(req.params.id));
        broadcast("maintenance_updated", { kind: "taxonomy" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete zone" }); }
    });

    // Sub-skills ("Sous-compétences") — one level below a Maintenance competency, mirroring
    // POST/PATCH/DELETE /api/admin/print/subcategories exactly (same broadcast convention: reuses
    // the existing 'maintenance_updated' event, already wired client-side to invalidate
    // /api/maintenance/categories, /api/maintenance/taxonomy and /api/admin/maintenance — no new
    // real-time event needed).
    app.post("/api/admin/maintenance/sub-competencies", requireAdmin, async (req, res) => {
      try {
        const { competencyId, name, icon } = z.object({
          competencyId: z.number().int().positive(),
          name: z.string().trim().min(1).max(120),
          icon: z.string().trim().max(8).nullable().optional(),
        }).parse(req.body);
        const created = await storage.createMaintenanceSubCompetency(competencyId, name, icon ?? null);
        broadcast("maintenance_updated", { kind: "taxonomy" });
        res.status(201).json(created);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Sub-skill already exists or is invalid" });
      }
    });

    app.patch("/api/admin/maintenance/sub-competencies/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          name: z.string().trim().min(1).max(120).optional(),
          icon: z.string().trim().max(8).nullable().optional(),
          isActive: z.boolean().optional(),
          isFrozen: z.boolean().optional(),
        }).parse(req.body);
        const updated = await storage.updateMaintenanceSubCompetency(Number(req.params.id), body);
        if (!updated) return res.status(404).json({ message: "Sub-skill not found" });
        broadcast("maintenance_updated", { kind: "taxonomy" });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid sub-skill" });
      }
    });

    app.delete("/api/admin/maintenance/sub-competencies/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deleteMaintenanceSubCompetency(Number(req.params.id));
        broadcast("maintenance_updated", { kind: "taxonomy" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete sub-skill" }); }
    });

    // ── Admin Maintenance account actions (Part 6-7) — EDIT reuses the existing
    // upsertMaintenanceProfile (the same method the Maintenance user's own
    // self-service PATCH /api/maintenance/profile calls); FREEZE toggles the new
    // admin-only isFrozen flag; DELETE reuses the existing generic user deletion
    // (storage.deleteUser) rather than a Maintenance-specific one. ──────────────
    // Registered BEFORE the /:userId route below — see Print's identical comment above
    // and docs/service_card_reorder_and_detail_modal_audit.md Part 1.
    app.patch("/api/admin/maintenance/accounts/bulk-order", requireAdmin, async (req, res) => {
      try {
        const orders: { id: number; displayOrder: number }[] = req.body?.orders;
        if (!Array.isArray(orders)) return res.status(400).json({ message: "Invalid payload" });
        await storage.bulkUpdateMaintenanceOrder(orders);
        broadcast("maintenance_updated", { kind: "bulk_order" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.patch("/api/admin/maintenance/accounts/:userId", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "MAINTENANCE") return res.status(404).json({ message: "Maintenance account not found" });
        const { name, email, phone, profileImageUrl, ...profileFields } = z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          profileImageUrl: z.string().optional().nullable(),
          jobTitle: z.string().optional(),
          profileType: z.string().optional(),
          categories: z.array(z.string()).optional(),
          skills: z.array(z.string()).optional(),
          certifications: z.array(z.string()).optional(),
          yearsExperience: z.number().int().min(0).optional(),
          responseTime: z.string().optional(),
          dailyRateInCents: z.number().int().min(0).optional(),
          description: z.string().optional(),
          coverageArea: z.string().optional(),
        }).parse(req.body);
        const userUpdates: any = {};
        if (name !== undefined) userUpdates.name = name;
        if (email !== undefined) userUpdates.email = email;
        if (phone !== undefined) userUpdates.phone = phone;
        if (profileImageUrl !== undefined) userUpdates.profileImageUrl = profileImageUrl?.trim() || null;
        if (Object.keys(userUpdates).length) await storage.updateUser(userId, userUpdates);
        const profile = Object.keys(profileFields).length ? await storage.upsertMaintenanceProfile(userId, profileFields) : await storage.getMaintenanceProfile(userId);
        broadcastToUsers([userId], "user_profile_updated");
        broadcast("maintenance_updated", { userId, kind: "profile" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid account data" });
      }
    });

    app.patch("/api/admin/maintenance/accounts/:userId/freeze", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "MAINTENANCE") return res.status(404).json({ message: "Maintenance account not found" });
        const { isFrozen } = z.object({ isFrozen: z.boolean() }).parse(req.body);
        const profile = await storage.upsertMaintenanceProfile(userId, { isFrozen });
        broadcast("maintenance_updated", { userId, kind: "freeze" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.patch("/api/admin/maintenance/accounts/:userId/auto-approve", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "MAINTENANCE") return res.status(404).json({ message: "Maintenance account not found" });
        const autoApprove = Boolean(req.body?.autoApprove);
        const profile = await storage.setMaintenanceAutoApprove(userId, autoApprove);
        broadcast("maintenance_updated", { userId, kind: "auto_approve" });
        res.json(profile);
      } catch { res.status(500).json({ message: "Error" }); }
    });

    // ── Admin Maintenance reservation actions (Part 8-9) ────────────────────────
    app.patch("/api/admin/maintenance/reservations/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          service: z.string().optional(),
          date: z.string().optional(),
          time: z.string().nullable().optional(),
          location: z.string().optional(),
          description: z.string().optional(),
          category: z.string().optional(),
          urgency: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
          contactPhone: z.string().optional(),
          status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "RESCHEDULED", "RESCHEDULE_PENDING", "RESCHEDULE_REJECTED"]).optional(),
        }).parse(req.body);
        const updated = await storage.adminUpdateMaintenanceReservation(Number(req.params.id), body);
        if (!updated) return res.status(404).json({ message: "Reservation not found" });
        broadcast("maintenance_reservation_updated", { reservationId: updated.id });
        broadcastToUsers([updated.cafeOwnerId, updated.maintenanceUserId], "maintenance_reservation_updated", { reservationId: updated.id });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid reservation data" });
      }
    });

    app.patch("/api/admin/maintenance/reservations/:id/freeze", requireAdmin, async (req, res) => {
      try {
        const { isFrozen } = z.object({ isFrozen: z.boolean() }).parse(req.body);
        const updated = await storage.setMaintenanceReservationFrozen(Number(req.params.id), isFrozen);
        if (!updated) return res.status(404).json({ message: "Reservation not found" });
        broadcast("maintenance_reservation_updated", { reservationId: updated.id });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.delete("/api/admin/maintenance/reservations/:id", requireAdmin, async (req, res) => {
      try {
        const id = Number(req.params.id);
        const existing = await storage.getMaintenanceReservationById(id);
        if (!existing) return res.status(404).json({ message: "Reservation not found" });
        await storage.deleteMaintenanceReservation(id);
        broadcast("maintenance_reservation_updated", { reservationId: id, kind: "deleted" });
        broadcastToUsers([existing.cafeOwnerId, existing.maintenanceUserId], "maintenance_reservation_updated", { reservationId: id, kind: "deleted" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete reservation" }); }
    });

    // Coffee Owner self-service cancellation (Part 18) — only while still PENDING.
    app.patch("/api/maintenance/reservations/:id/cancel", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const updated = await storage.cancelMaintenanceReservationByOwner(Number(req.params.id), user.id);
      if (!updated) return res.status(400).json({ message: "Reservation can only be cancelled while still pending" });
      await storage.refreshMaintenanceMessagingState(updated.id);
      broadcast("maintenance_reservation_updated", { reservationId: updated.id });
      broadcastToUsers([user.id, updated.maintenanceUserId], "maintenance_reservation_updated", { reservationId: updated.id });
      res.json(updated);
    });

    // ── Entity-level Maintenance reports — "Blacklist" (Parts 20-23), extended
    // (task: "Redesign Maintenance Reports Using the Avis Modal Pattern and
    // Add Admin Moderation") with a 1-5 sadness rating and a
    // Submitted -> Pending -> Published/Rejected moderation lifecycle. ────────
    app.post("/api/maintenance/:userId/report", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const maintenanceUserId = Number(req.params.userId);
      const target = await storage.getUser(maintenanceUserId);
      if (!target || target.role !== "MAINTENANCE") return res.status(404).json({ message: "Maintenance account not found" });
      try {
        // rating/status are never trusted from elsewhere — the reporting user
        // is always the authenticated session user (never a client-supplied
        // id), and the report always starts PENDING (createMaintenanceReport
        // never accepts a status), so a report can never be self-published by
        // manipulating this request.
        const { reason, rating } = z.object({ reason: z.string().min(1).max(500), rating: z.number().int().min(1).max(5) }).parse(req.body);
        const report = await storage.createMaintenanceReport(user.id, maintenanceUserId, reason, rating);
        broadcast("admin_maintenance_report_created", { maintenanceUserId });
        const adminIds = await storage.getAdminUserIds();
        await notifyMany({
          userIds: adminIds,
          service: "ADMIN", type: "maintenance_report_created", priority: "URGENT",
          title: "Professionnel Maintenance signalé",
          message: `${user.name} a signalé ${target.name} (Maintenance) : "${reason}".`,
          entityType: "maintenance_report", entityId: report.id,
          prefKey: "reports",
          dedupeKeyPrefix: `admin:maintenance_report_created:${report.id}`,
        });
        res.status(201).json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid report data" });
      }
    });

    app.get("/api/maintenance/reports/mine", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      res.json(await storage.getMaintenanceReportsByOwner(user.id));
    });

    // Public (any authenticated user) read of admin-published reports only —
    // server-side filtered (status = PUBLISHED), never exposes cafeOwnerId or
    // the reporting owner's name/identity.
    app.get("/api/maintenance/reports/published", requireAuth, async (req: any, res) => {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 50);
      res.json(await storage.getPublishedMaintenanceReports(page, limit));
    });

    app.get("/api/admin/maintenance/reports", requireAdmin, async (req: any, res) => {
      const status = typeof req.query.status === "string" ? (req.query.status as "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED") : undefined;
      res.json(await storage.getMaintenanceReports(status));
    });

    app.patch("/api/admin/maintenance/reports/:id/resolve", requireAdmin, async (req: any, res) => {
      try {
        const { status, resolutionNote } = z.object({
          status: z.enum(["RESOLVED", "DISMISSED", "PUBLISHED", "REJECTED"]),
          resolutionNote: z.string().max(1000).optional(),
        }).parse(req.body);
        if (status === "PUBLISHED") {
          // A legacy report (submitted before this task, no rating) can be
          // rejected/dismissed but never published — the public list always
          // shows a real 1-5 rating, never a fabricated or missing one.
          const target = await storage.getMaintenanceReportById(Number(req.params.id));
          if (!target) return res.status(404).json({ message: "Not found" });
          if (target.rating == null) return res.status(400).json({ message: "Ce signalement n'a pas de note et ne peut pas être publié." });
        }
        const report = await storage.resolveMaintenanceReport(Number(req.params.id), status, resolutionNote, req.session.userId);
        if (!report) return res.status(404).json({ message: "Not found" });
        broadcast("admin_maintenance_report_created", { maintenanceUserId: report.maintenanceUserId });
        res.json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid data" });
      }
    });

    app.get("/api/maintenance-favorites", requireAuth, async (req: any, res) => {
      res.json(await storage.getMaintenanceFavoritesByUser(req.session.userId));
    });

    app.post("/api/maintenance-favorites", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const maintenanceUserId = Number(req.body?.maintenanceUserId);
      if (!maintenanceUserId) return res.status(400).json({ message: "maintenanceUserId is required" });
      await storage.addMaintenanceFavorite(user.id, maintenanceUserId);
      broadcastToUsers([user.id], "maintenance_favorite_updated", { maintenanceUserId });
      res.status(201).json({ ok: true });
    });

    app.delete("/api/maintenance-favorites/:maintenanceUserId", requireAuth, async (req: any, res) => {
      await storage.removeMaintenanceFavorite(req.session.userId, Number(req.params.maintenanceUserId));
      broadcastToUsers([req.session.userId], "maintenance_favorite_updated", { maintenanceUserId: Number(req.params.maintenanceUserId) });
      res.json({ ok: true });
    });
}
