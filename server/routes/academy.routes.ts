import { requireAdmin, requireAuth, requireApprovedAcademyRegistrant } from "./shared/middleware";
import { storage } from "../storage";
import { z } from "zod";
import { broadcast, broadcastToUsers } from "../ws";
import { notifyMany, notify } from "../notify";
import { type InsertAcademyProfile, type NotificationPriority } from "@shared/schema";
import type { Express } from "express";

export function registerAcademyRoutes(app: Express): void {
    app.get("/api/admin/academy/reports", requireAdmin, async (req: any, res) => {
      const status = typeof req.query.status === "string" ? (req.query.status as "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED") : undefined;
      res.json(await storage.getAcademyReports(status));
    });

    app.patch("/api/admin/academy/reports/:id/resolve", requireAdmin, async (req: any, res) => {
      try {
        const { status, resolutionNote } = z.object({
          status: z.enum(["RESOLVED", "DISMISSED", "PUBLISHED", "REJECTED"]),
          resolutionNote: z.string().max(1000).optional(),
        }).parse(req.body);
        if (status === "PUBLISHED") {
          const target = await storage.getAcademyReportById(Number(req.params.id));
          if (!target) return res.status(404).json({ message: "Not found" });
          if (target.rating == null) return res.status(400).json({ message: "Ce signalement n'a pas de note et ne peut pas être publié." });
        }
        const report = await storage.resolveAcademyReport(Number(req.params.id), status, resolutionNote, req.session.userId);
        if (!report) return res.status(404).json({ message: "Not found" });
        broadcast("admin_academy_report_created", { academyUserId: report.academyUserId });
        res.json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid data" });
      }
    });

    // ── Barista Academy ──────────────────────────────────────────────────────────
    // Mirrors the Barista Marketplace route section above endpoint-for-endpoint,
    // adapted to Academy semantics (courses/formations, sessions, registrations
    // instead of profile/requests/missions).

    app.get("/api/academy/courses", async (req: any, res) => {
      try {
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        res.json(await storage.getPublishedAcademyCourses({
          search: typeof req.query.search === "string" ? req.query.search : undefined,
          level: typeof req.query.level === "string" ? req.query.level : undefined,
          certification: req.query.certification === undefined ? undefined : req.query.certification === "true",
          viewerLocation,
        }));
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to load Academy courses" });
      }
    });

    // "Academy Stores" browsable list for /academy — mirrors GET /api/print/companies'
    // own public, no-auth convention (docs/academy_store_mapping_audit.md).
    app.get("/api/academy/companies", async (req: any, res) => {
      try {
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        res.json(await storage.getAcademyCompanyCards(viewerLocation));
      } catch { res.status(500).json({ message: "Failed to load Academy companies" }); }
    });

    app.get("/api/academy/courses/:id", async (req: any, res) => {
      try {
        const viewer = req.session?.userId ? await storage.getUser(req.session.userId) : null;
        const viewerLocation = viewer ? { lat: viewer.locationLat, lng: viewer.locationLng } : null;
        const course = await storage.getAcademyCourseCard(Number(req.params.id), viewerLocation);
        if (!course) return res.status(404).json({ message: "Course not found" });
        // The owning Academy (previewing a draft/unpublished formation via the same
        // Formation details modal, Part 12) and Admin (moderating any formation
        // regardless of publish state, Part 40) bypass the public visibility rules
        // below — everyone else keeps the exact same rules as before.
        const isSelfOrAdmin = !!viewer && (viewer.id === course.academyUserId || ["ADMIN", "SUPER_ADMIN"].includes(viewer.role));
        if (!isSelfOrAdmin) {
          if (!course.isPublished) return res.status(404).json({ message: "Course not found" });
          // Same visibility rule as the list endpoint (getPublishedAcademyCourses):
          // an Academy that disabled "Afficher mon académie sur /academy" must not
          // be reachable via a direct course id either (e.g. a stale favorite/link).
          const academy = await storage.getUser(course.academyUserId);
          const profile = await storage.getAcademyProfile(course.academyUserId);
          if (!academy || academy.status !== "approved" || profile?.marketplaceVisible === false) {
            return res.status(404).json({ message: "Course not found" });
          }
        }
        res.json(course);
      } catch { res.status(500).json({ message: "Failed to load course" }); }
    });

    app.get("/api/academy/courses/:id/sessions", async (req, res) => {
      try {
        const sessions = await storage.getAcademySessionsForCourse(Number(req.params.id));
        res.json(sessions.filter((s) => s.status === "UPCOMING"));
      } catch { res.status(500).json({ message: "Failed to load sessions" }); }
    });

    // ── Academy favorites — mirrors maintenance-favorites endpoint-for-endpoint,
    // keyed by courseId instead of a provider id (see academyFavorites note). ──

    app.get("/api/academy-favorites", requireAuth, async (req: any, res) => {
      res.json(await storage.getAcademyFavoritesByUser(req.session.userId));
    });

    app.post("/api/academy-favorites", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const courseId = Number(req.body?.courseId);
      if (!courseId) return res.status(400).json({ message: "courseId is required" });
      await storage.addAcademyFavorite(user.id, courseId);
      broadcastToUsers([user.id], "academy_favorite_updated", { courseId });
      res.status(201).json({ ok: true });
    });

    app.delete("/api/academy-favorites/:courseId", requireAuth, async (req: any, res) => {
      await storage.removeAcademyFavorite(req.session.userId, Number(req.params.courseId));
      broadcastToUsers([req.session.userId], "academy_favorite_updated", { courseId: Number(req.params.courseId) });
      res.json({ ok: true });
    });

    // ── Academy organisation favorites — independent of the course favorites
    // above; academyUserId rows have courseId NULL (docs/coffee_owner_favorites_marketplace_audit.md) ──

    app.get("/api/academy-favorites/organisations", requireAuth, async (req: any, res) => {
      res.json(await storage.getAcademyOrganisationFavoritesByUser(req.session.userId));
    });

    app.post("/api/academy-favorites/organisations", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const academyUserId = Number(req.body?.academyUserId);
      if (!academyUserId) return res.status(400).json({ message: "academyUserId is required" });
      await storage.addAcademyOrganisationFavorite(user.id, academyUserId);
      broadcastToUsers([user.id], "academy_organisation_favorite_updated", { academyUserId });
      res.status(201).json({ ok: true });
    });

    app.delete("/api/academy-favorites/organisations/:academyUserId", requireAuth, async (req: any, res) => {
      await storage.removeAcademyOrganisationFavorite(req.session.userId, Number(req.params.academyUserId));
      broadcastToUsers([req.session.userId], "academy_organisation_favorite_updated", { academyUserId: Number(req.params.academyUserId) });
      res.json({ ok: true });
    });

    // Entity-level report ("Blacklist") — a Coffee Owner flagging an Academy
    // account itself, mirrors POST /api/marketing/:userId/report exactly.
    app.post("/api/academy/:userId/report", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const academyUserId = Number(req.params.userId);
      const target = await storage.getUser(academyUserId);
      if (!target || target.role !== "BARISTA_ACADEMY") return res.status(404).json({ message: "Academy account not found" });
      try {
        const { reason, rating } = z.object({ reason: z.string().min(1).max(500), rating: z.number().int().min(1).max(5) }).parse(req.body);
        const report = await storage.createAcademyReport(user.id, academyUserId, reason, rating);
        broadcast("admin_academy_report_created", { academyUserId });
        const adminIds = await storage.getAdminUserIds();
        await notifyMany({
          userIds: adminIds,
          service: "ADMIN", type: "academy_report_created", priority: "URGENT",
          title: "Académie signalée",
          message: `${user.name} a signalé ${target.name} (Academy) : "${reason}".`,
          entityType: "academy_report", entityId: report.id,
          prefKey: "reports",
          dedupeKeyPrefix: `admin:academy_report_created:${report.id}`,
        });
        res.status(201).json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid report data" });
      }
    });

    app.get("/api/academy/reports/mine", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      res.json(await storage.getAcademyReportsByOwner(user.id));
    });

    app.get("/api/academy/reports/published", requireAuth, async (req: any, res) => {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 50);
      res.json(await storage.getPublishedAcademyReports(page, limit));
    });

    app.get("/api/academy/profile/:userId", requireAuth, async (req: any, res) => {
      const targetUserId = Number(req.params.userId);
      const viewer = await storage.getUser(req.session.userId);
      if (!viewer) return res.status(401).json({ message: "Unauthorized" });
      const target = await storage.getUser(targetUserId);
      if (!target || target.role !== "BARISTA_ACADEMY") return res.status(404).json({ message: "Not found" });
      const isSelfOrAdmin = viewer.id === targetUserId || ["ADMIN", "SUPER_ADMIN"].includes(viewer.role);
      // Any other authenticated viewer (Coffee Owner clicking "Académie" inside a Formation
      // modal) only ever gets the sanitized public `card` — same convention as every other
      // service's profile route (Barista/Maintenance/Marketing/Delivery Company).
      if (!isSelfOrAdmin) {
        const card = await storage.getAcademyProfileCard(targetUserId, { lat: viewer.locationLat, lng: viewer.locationLng });
        if (!card) return res.status(404).json({ message: "Not found" });
        return res.json({ card });
      }
      const card = await storage.getAcademyProfileCard(targetUserId, { lat: viewer.locationLat, lng: viewer.locationLng });
      res.json({ user: target, profile: await storage.getAcademyProfile(targetUserId), card });
    });

    app.patch("/api/academy/profile", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      try {
        const dayHoursSchema = z.object({ open: z.string(), close: z.string(), closed: z.boolean() });
        const body = z.object({
          description: z.string().max(2000).optional(),
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
        // self-service route) rather than inside upsertAcademyProfile, since Admin's own
        // edit route (PATCH /api/admin/academy/accounts/:userId) also calls upsertAcademyProfile
        // and must never trigger its own re-review.
        const currentProfile = await storage.getAcademyProfile(user.id);
        const identityChanged = body.description !== undefined && body.description !== currentProfile.description;
        const extra: Partial<InsertAcademyProfile> =
          identityChanged && !currentProfile.autoApprove && (currentProfile.publicationStatus === "APPROVED" || currentProfile.publicationStatus === "REJECTED")
            ? { publicationStatus: "PENDING", publicationSubmittedAt: new Date(), publicationRejectionReason: null }
            : {};
        const profile = await storage.upsertAcademyProfile(user.id, { ...body, ...extra });
        broadcast("academy_profile_updated", { userId: user.id, kind: "profile" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid profile data" });
      }
    });

    // GO Live (Phase 5) — see /api/maintenance/profile/go-live for the full rationale comment.
    app.post("/api/academy/profile/go-live", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      const profile = await storage.getAcademyProfile(user.id);
      if (profile.publicationStatus === "PENDING") return res.status(400).json({ message: "Une demande est déjà en attente d'approbation." });
      if (!profile.description?.trim()) return res.status(400).json({ message: "Complétez votre description avant de soumettre votre profil." });
      const updated = await storage.upsertAcademyProfile(user.id, {
        publicationStatus: "PENDING", publicationSubmittedAt: new Date(), publicationRejectionReason: null,
      });
      broadcast("academy_profile_updated", { userId: user.id, kind: "publication" });
      res.json(updated);
    });

    app.patch("/api/admin/academy/accounts/:userId/publication", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "BARISTA_ACADEMY") return res.status(404).json({ message: "Academy account not found" });
        const { decision, rejectionReason } = z.object({
          decision: z.enum(["APPROVED", "REJECTED"]),
          rejectionReason: z.string().trim().max(1000).optional(),
        }).parse(req.body);
        const profile = await storage.upsertAcademyProfile(userId, {
          publicationStatus: decision, publicationReviewedAt: new Date(),
          publicationRejectionReason: decision === "REJECTED" ? (rejectionReason?.trim() || "Non précisé") : null,
        });
        broadcast("academy_profile_updated", { userId, kind: "publication" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.get("/api/academy/my/courses", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      try { res.json(await storage.getAcademyCoursesForAcademy(user.id)); }
      catch { res.status(500).json({ message: "Failed to load your courses" }); }
    });

    const academyCourseInput = z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(4000).optional(),
      level: z.enum(["BEGINNER", "ADVANCED", "EXPERT"]).optional(),
      priceInCents: z.number().int().min(0).optional(),
      duration: z.string().max(120).optional(),
      hasCertification: z.boolean().optional(),
      category: z.string().max(120).optional(),
      location: z.string().max(200).optional(),
      trainingMode: z.string().max(60).optional(),
      capacity: z.number().int().min(1).optional().nullable(),
      imageUrl: z.string().max(2000).optional().nullable(),
      formationDetails: z.string().max(4000).optional(),
    });

    app.post("/api/academy/courses", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      try {
        const body = academyCourseInput.parse(req.body);
        const course = await storage.createAcademyCourse(user.id, body as any);
        broadcast("academy_course_updated", { academyUserId: user.id, courseId: course.id, kind: "created" });
        res.status(201).json(course);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid course data" });
      }
    });

    app.patch("/api/academy/courses/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      try {
        const body = academyCourseInput.partial().extend({ isPublished: z.boolean().optional() }).parse(req.body);
        const course = await storage.updateAcademyCourse(Number(req.params.id), user.id, body as any);
        if (!course) return res.status(404).json({ message: "Course not found" });
        broadcast("academy_course_updated", { academyUserId: user.id, courseId: course.id, kind: "updated" });
        res.json(course);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid course data" });
      }
    });

    app.delete("/api/academy/courses/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      try {
        await storage.deleteAcademyCourse(Number(req.params.id), user.id);
        broadcast("academy_course_updated", { academyUserId: user.id, courseId: Number(req.params.id), kind: "deleted" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete course" }); }
    });

    app.get("/api/academy/sessions", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      try { res.json(await storage.getAcademySessionsForAcademy(user.id)); }
      catch { res.status(500).json({ message: "Failed to load sessions" }); }
    });

    app.post("/api/academy/sessions", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      try {
        const body = z.object({
          courseId: z.number().int().positive(),
          startDate: z.string().min(1),
          endDate: z.string().optional().nullable(),
          capacity: z.number().int().min(1).optional().nullable(),
        }).parse(req.body);
        const session = await storage.createAcademySession(user.id, body);
        broadcast("academy_session_updated", { academyUserId: user.id, sessionId: session.id, kind: "created" });
        res.status(201).json(session);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? "Invalid session data" });
      }
    });

    app.patch("/api/academy/sessions/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      try {
        const body = z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional().nullable(),
          capacity: z.number().int().min(1).optional().nullable(),
          status: z.enum(["UPCOMING", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
        }).parse(req.body);
        const session = await storage.updateAcademySession(Number(req.params.id), user.id, body);
        if (!session) return res.status(404).json({ message: "Session not found" });
        broadcast("academy_session_updated", { academyUserId: user.id, sessionId: session.id, kind: "updated" });
        res.json(session);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid session data" });
      }
    });

    app.delete("/api/academy/sessions/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      try {
        await storage.deleteAcademySession(Number(req.params.id), user.id);
        broadcast("academy_session_updated", { academyUserId: user.id, sessionId: Number(req.params.id), kind: "deleted" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete session" }); }
    });

    app.get("/api/academy/registrations", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role === "BARISTA_ACADEMY") return res.json(await storage.getAcademyRegistrationsForAcademy(user.id));
      if (user.role === "CAFE_OWNER") return res.json(await storage.getAcademyRegistrationsForOwner(user.id));
      if (user.role === "BARISTA_MARKETPLACE") return res.json(await storage.getAcademyRegistrationsForBarista(user.id));
      return res.status(403).json({ message: "Forbidden" });
    });

    app.post("/api/academy/registrations", requireApprovedAcademyRegistrant, async (req: any, res) => {
      try {
        const body = z.object({
          courseId: z.number().int().positive(),
          sessionId: z.number().int().positive().optional().nullable(),
          participantCount: z.number().int().min(1).max(100).optional(),
          participants: z.array(z.string().max(200)).optional(),
          notes: z.string().max(1000).optional(),
        }).parse(req.body);
        const user = await storage.getUser(req.session.userId!);
        const registration = await storage.createAcademyRegistration(user!.id, {
          ...body,
          participantType: user!.role === "BARISTA_MARKETPLACE" ? "BARISTA_MARKETPLACE" : "CAFE_OWNER",
        });
        await storage.refreshAcademyMessagingState(registration.id);
        broadcastToUsers([registration.academyUserId], "academy_registration_created", { registrationId: registration.id });
        broadcastToUsers([registration.cafeOwnerId, registration.academyUserId], "conversation_updated", { service: "ACADEMY", registrationId: registration.id });
        const course = await storage.getAcademyCourseById(registration.courseId);
        await notify({
          userId: registration.academyUserId,
          service: "ACADEMY", type: "academy_registration_created", priority: "WARNING",
          title: "Nouvelle inscription",
          message: `${user!.name} s'est inscrit à "${course?.title ?? "une formation"}".`,
          entityType: "academy_registration", entityId: registration.id,
          prefKey: "academy",
          dedupeKey: `academy:registration_created:${registration.id}:academy`,
        });
        await notify({
          userId: registration.cafeOwnerId,
          service: "ACADEMY", type: "academy_registration_created", priority: "INFO",
          title: "Inscription envoyée",
          message: `Votre inscription à "${course?.title ?? "la formation"}" a été envoyée.`,
          entityType: "academy_registration", entityId: registration.id,
          prefKey: "academy",
          dedupeKey: `academy:registration_created:${registration.id}:registrant`,
        });
        res.status(201).json(registration);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? "Unable to create registration" });
      }
    });

    app.patch("/api/academy/registrations/:id/status", requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: "Unauthorized" });
        const body = z.object({ status: z.enum(["CONFIRMED", "COMPLETED", "CANCELLED"]) }).parse(req.body);
        const registration = await storage.updateAcademyRegistrationStatus(Number(req.params.id), { id: user.id, role: user.role }, body.status);
        await storage.refreshAcademyMessagingState(registration.id);
        const recipients = [registration.cafeOwnerId, registration.academyUserId];
        broadcastToUsers(recipients, "academy_registration_status_changed", { registrationId: registration.id, status: registration.status });
        broadcast("academy_registration_status_changed", { registrationId: registration.id, status: registration.status });
        broadcastToUsers(recipients, "conversation_updated", { service: "ACADEMY", registrationId: registration.id });
        const otherPartyId = user.id === registration.cafeOwnerId ? registration.academyUserId : registration.cafeOwnerId;
        const ACADEMY_STATUS_TEXT_FR: Partial<Record<string, { title: string; priority: NotificationPriority; text: string }>> = {
          CONFIRMED: { title: "Inscription confirmée", priority: "SUCCESS", text: "a confirmé votre inscription" },
          COMPLETED: { title: "Formation terminée", priority: "INFO", text: "a marqué la formation comme terminée. N'hésitez pas à laisser un avis" },
          CANCELLED: { title: "Inscription annulée", priority: "WARNING", text: "a annulé l'inscription" },
        };
        const academyStatusText = ACADEMY_STATUS_TEXT_FR[body.status];
        if (academyStatusText) {
          await notify({
            userId: otherPartyId,
            service: "ACADEMY", type: "academy_registration_status_changed", priority: academyStatusText.priority,
            title: academyStatusText.title,
            message: `${user.name} ${academyStatusText.text}.`,
            entityType: "academy_registration", entityId: registration.id,
            prefKey: "academy",
            dedupeKey: `academy:registration_status:${registration.id}:${body.status}`,
          });
        }
        res.json(registration);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(409).json({ message: err.message ?? "Unable to update registration" });
      }
    });

    app.get("/api/academy/reviews/:academyUserId", async (req, res) => {
      try { res.json(await storage.getAcademyReviews(Number(req.params.academyUserId))); }
      catch { res.status(500).json({ message: "Failed to load Academy reviews" }); }
    });

    app.get("/api/academy/reviews/registration/:registrationId", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const registrationId = Number(req.params.registrationId);
      const registration = await storage.getAcademyRegistrationById(registrationId);
      if (!registration) return res.status(404).json({ message: "Registration not found" });
      const isRegistrant = (user.role === "CAFE_OWNER" || user.role === "BARISTA_MARKETPLACE") && registration.cafeOwnerId === user.id;
      const owns = isRegistrant || (user.role === "BARISTA_ACADEMY" && registration.academyUserId === user.id);
      if (!owns) return res.status(403).json({ message: "Forbidden" });
      res.json(isRegistrant ? (await storage.getAcademyReviewForRegistration(registrationId, user.id)) ?? null : null);
    });

    app.post("/api/academy/reviews", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || !["CAFE_OWNER", "BARISTA_MARKETPLACE"].includes(user.role) || user.status !== "approved") {
        return res.status(403).json({ message: "Only approved Coffee Owners or Baristas can submit reviews" });
      }
      try {
        const body = z.object({
          academyUserId: z.number().int().positive(),
          registrationId: z.number().int().positive(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().max(2000).optional(),
        }).parse(req.body);
        const registration = await storage.getAcademyRegistrationById(body.registrationId);
        if (!registration || registration.cafeOwnerId !== user.id || registration.academyUserId !== body.academyUserId || registration.status !== "COMPLETED") {
          return res.status(400).json({ message: "Reviews are only available after a completed registration" });
        }
        const result = await storage.upsertAcademyReview({
          ...body, cafeId: user.id, cafeName: user.name, cafeOwnerName: user.name,
        });
        broadcast("academy_review_created", { academyUserId: body.academyUserId, registrationId: body.registrationId });
        if (!result.isUpdate) {
          await notify({
            userId: body.academyUserId,
            service: "ACADEMY", type: "academy_review_created", priority: "INFO",
            title: "Nouvel avis reçu",
            message: `${user.name} vous a laissé un avis (${body.rating}/5).`,
            entityType: "academy_registration", entityId: body.registrationId,
            prefKey: "reviews",
            dedupeKey: `academy:review_created:${body.registrationId}`,
          });
        }
        res.status(result.isUpdate ? 200 : 201).json(result.review);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? "Unable to submit review" });
      }
    });

    app.get("/api/academy/revenue", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
      try { res.json(await storage.getAcademyRevenueSummary(user.id)); }
      catch { res.status(500).json({ message: "Failed to load revenue" }); }
    });

    // ── Admin ACADEMY — same philosophy as Admin BARISTA/PRINT above: one
    // aggregate overview endpoint the client tabs/filters over. ─────────────────

    app.get("/api/admin/academy", requireAdmin, async (_req, res) => {
      try { res.json(await storage.getAcademyAdminOverview()); }
      catch (err) { console.error(err); res.status(500).json({ message: "Failed to load Academy overview" }); }
    });

    // ── Admin Academy account actions — same edit/freeze pattern as
    // /api/admin/maintenance/accounts (Marketing/Maintenance reference). ──────────
    // Registered BEFORE the /:userId route below — see Print's identical comment above
    // and docs/service_card_reorder_and_detail_modal_audit.md Part 1.
    app.patch("/api/admin/academy/accounts/bulk-order", requireAdmin, async (req, res) => {
      try {
        const orders: { id: number; displayOrder: number }[] = req.body?.orders;
        if (!Array.isArray(orders)) return res.status(400).json({ message: "Invalid payload" });
        await storage.bulkUpdateAcademyOrder(orders);
        broadcast("academy_profile_updated", { kind: "bulk_order" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.patch("/api/admin/academy/accounts/:userId", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "BARISTA_ACADEMY") return res.status(404).json({ message: "Academy account not found" });
        const { name, email, phone, profileImageUrl, ...profileFields } = z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          profileImageUrl: z.string().optional().nullable(),
          description: z.string().optional(),
        }).parse(req.body);
        const userUpdates: any = {};
        if (name !== undefined) userUpdates.name = name;
        if (email !== undefined) userUpdates.email = email;
        if (phone !== undefined) userUpdates.phone = phone;
        if (profileImageUrl !== undefined) userUpdates.profileImageUrl = profileImageUrl?.trim() || null;
        if (Object.keys(userUpdates).length) await storage.updateUser(userId, userUpdates);
        const profile = Object.keys(profileFields).length ? await storage.upsertAcademyProfile(userId, profileFields) : await storage.getAcademyProfile(userId);
        broadcastToUsers([userId], "user_profile_updated");
        broadcast("academy_profile_updated", { userId, kind: "admin_edit" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid account data" });
      }
    });

    app.patch("/api/admin/academy/accounts/:userId/freeze", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "BARISTA_ACADEMY") return res.status(404).json({ message: "Academy account not found" });
        const { isFrozen } = z.object({ isFrozen: z.boolean() }).parse(req.body);
        const profile = await storage.upsertAcademyProfile(userId, { isFrozen });
        broadcast("academy_profile_updated", { userId, kind: "freeze" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.patch("/api/admin/academy/accounts/:userId/auto-approve", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "BARISTA_ACADEMY") return res.status(404).json({ message: "Academy account not found" });
        const autoApprove = Boolean(req.body?.autoApprove);
        const profile = await storage.setAcademyAutoApprove(userId, autoApprove);
        broadcast("academy_profile_updated", { userId, kind: "auto_approve" });
        res.json(profile);
      } catch { res.status(500).json({ message: "Error" }); }
    });
}
