import { requireAuth, requireAdmin, requireApprovedCafeOwner } from "./shared/middleware";
import { storage } from "../storage";
import { broadcastToUsers, broadcast } from "../ws";
import { z } from "zod";
import { baristaJobMeetings, type InsertBaristaMarketplaceProfile, type NotificationPriority } from "@shared/schema";
import { notify, notifyMany } from "../notify";
import { db } from "../db";
import { eq } from "drizzle-orm";
import type { Express } from "express";

export function registerBaristaRoutes(app: Express): void {
    // ── Barista Marketplace favorites — mirrors maintenance-favorites endpoint-for-endpoint ──

    app.get("/api/barista-favorites", requireAuth, async (req: any, res) => {
      res.json(await storage.getBaristaFavoritesByUser(req.session.userId));
    });

    app.post("/api/barista-favorites", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const baristaUserId = Number(req.body?.baristaUserId);
      if (!baristaUserId) return res.status(400).json({ message: "baristaUserId is required" });
      await storage.addBaristaFavorite(user.id, baristaUserId);
      broadcastToUsers([user.id], "barista_favorite_updated", { baristaUserId });
      res.status(201).json({ ok: true });
    });

    app.delete("/api/barista-favorites/:baristaUserId", requireAuth, async (req: any, res) => {
      await storage.removeBaristaFavorite(req.session.userId, Number(req.params.baristaUserId));
      broadcastToUsers([req.session.userId], "barista_favorite_updated", { baristaUserId: Number(req.params.baristaUserId) });
      res.json({ ok: true });
    });

    // ── Barista Marketplace ──────────────────────────────────────────────────────
    // Mirrors the Maintenance route section above endpoint-for-endpoint. See
    // BARISTA_MARKETPLACE_IMPLEMENTATION_REPORT.md for the full endpoint inventory.

    app.get("/api/barista/skills", async (_req, res) => {
      try { res.json(await storage.getBaristaSkills(true)); }
      catch { res.status(500).json({ message: "Failed to load Barista skills" }); }
    });

    // Niveau d'étude / Langue — Admin-managed taxonomies (Admin > Compétences),
    // same read shape as /api/barista/skills above: active, non-frozen options
    // only, consumed by the Barista profile form, the Coffee Owner /barista
    // filters, and the job-post form.
    app.get("/api/barista/education-levels", async (_req, res) => {
      try { res.json(await storage.getBaristaEducationLevels(true)); }
      catch { res.status(500).json({ message: "Failed to load education levels" }); }
    });

    app.get("/api/barista/languages", async (_req, res) => {
      try { res.json(await storage.getBaristaLanguages(true)); }
      catch { res.status(500).json({ message: "Failed to load languages" }); }
    });

    app.get("/api/barista/profiles", async (req: any, res) => {
      try {
        const available = req.query.available === undefined ? undefined : req.query.available === "true";
        // Distance is only computed for a logged-in viewer with a real stored
        // location (currently meaningful for Coffee Owners browsing /barista) —
        // never fabricated, reuses the same haversine helper as Delivery pricing.
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        res.json(await storage.getBaristaMarketplaceProfiles({
          search: typeof req.query.search === "string" ? req.query.search : undefined,
          level: typeof req.query.level === "string" ? req.query.level : undefined,
          skill: typeof req.query.skill === "string" ? req.query.skill : undefined,
          city: typeof req.query.city === "string" ? req.query.city : undefined,
          available,
          viewerLocation,
        }));
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to load Barista profiles" });
      }
    });

    app.get("/api/barista/profile/:userId", requireAuth, async (req: any, res) => {
      const targetUserId = Number(req.params.userId);
      const viewer = await storage.getUser(req.session.userId);
      const isSelfOrAdmin = viewer && (viewer.id === targetUserId || ["ADMIN", "SUPER_ADMIN"].includes(viewer.role));
      const isCafeOwner = viewer?.role === "CAFE_OWNER";
      if (!viewer || (!isSelfOrAdmin && !isCafeOwner)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const target = await storage.getUser(targetUserId);
      if (!target || target.role !== "BARISTA_MARKETPLACE") return res.status(404).json({ message: "Not found" });
      const card = await storage.getBaristaMarketplaceCard(targetUserId, { lat: viewer.locationLat, lng: viewer.locationLng });
      // Coffee Owners (and any non-self/non-admin viewer) only ever see the sanitized
      // public `card` — never the raw user row (which carries password hash, email,
      // etc.); the full `user`/`profile` payload stays reserved for the Barista
      // themself and Admin, matching Part 21's "never expose private account info".
      if (!isSelfOrAdmin) return res.json({ card });
      res.json({ user: target, profile: await storage.getBaristaMarketplaceProfile(targetUserId), card });
    });

    app.patch("/api/barista/profile", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Barista Marketplace access required" });
      try {
        const body = z.object({
          level: z.enum(["BEGINNER", "ADVANCED", "EXPERT"]).optional(),
          bio: z.string().max(2000).optional(),
          skills: z.array(z.string()).optional(),
          dailyRateInCents: z.number().int().min(0).optional(),
          city: z.string().max(120).optional(),
          marketplaceVisible: z.boolean().optional(),
          // "Certifications & expérience" (Part 18) — real, Barista-entered values only.
          certifications: z.array(z.string().max(120)).optional(),
          experienceYears: z.number().int().min(0).max(80).nullable().optional(),
          portfolioUrls: z.array(z.string().max(2000)).max(4, "4 photos maximum").optional(),
          educationLevel: z.string().max(120).nullable().optional(),
          languages: z.array(z.string().max(60)).optional(),
        }).parse(req.body);
        // Auto Approve gating (docs/admin_maintenance_barista_professional_cards_order_autapprove_audit.md) —
        // mirrors upsertSupplierStore's identityChanged reset, but placed here (the
        // self-service route) rather than inside upsertBaristaMarketplaceProfile, since
        // Admin's own edit route (PATCH /api/admin/barista/accounts/:userId) also calls
        // upsertBaristaMarketplaceProfile and must never trigger its own re-review.
        const currentProfile = await storage.getBaristaMarketplaceProfile(user.id);
        const identityChanged = body.bio !== undefined && body.bio !== currentProfile.bio;
        const extra: Partial<InsertBaristaMarketplaceProfile> =
          identityChanged && !currentProfile.autoApprove && (currentProfile.publicationStatus === "APPROVED" || currentProfile.publicationStatus === "REJECTED")
            ? { publicationStatus: "PENDING", publicationSubmittedAt: new Date(), publicationRejectionReason: null }
            : {};
        const profile = await storage.upsertBaristaMarketplaceProfile(user.id, { ...body, ...extra });
        broadcast("barista_profile_updated", { userId: user.id, kind: "profile" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid profile data" });
      }
    });

    // GO Live (Phase 5) — see /api/maintenance/profile/go-live for the full rationale comment.
    app.post("/api/barista/profile/go-live", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Barista Marketplace access required" });
      const profile = await storage.getBaristaMarketplaceProfile(user.id);
      if (profile.publicationStatus === "PENDING") return res.status(400).json({ message: "Une demande est déjà en attente d'approbation." });
      if (!profile.bio?.trim()) return res.status(400).json({ message: "Complétez votre biographie avant de soumettre votre profil." });
      const updated = await storage.upsertBaristaMarketplaceProfile(user.id, {
        publicationStatus: "PENDING", publicationSubmittedAt: new Date(), publicationRejectionReason: null,
      });
      broadcast("barista_profile_updated", { userId: user.id, kind: "publication" });
      res.json(updated);
    });

    app.patch("/api/admin/barista/accounts/:userId/publication", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "BARISTA_MARKETPLACE") return res.status(404).json({ message: "Barista Marketplace account not found" });
        const { decision, rejectionReason } = z.object({
          decision: z.enum(["APPROVED", "REJECTED"]),
          rejectionReason: z.string().trim().max(1000).optional(),
        }).parse(req.body);
        const profile = await storage.upsertBaristaMarketplaceProfile(userId, {
          publicationStatus: decision, publicationReviewedAt: new Date(),
          publicationRejectionReason: decision === "REJECTED" ? (rejectionReason?.trim() || "Non précisé") : null,
        });
        broadcast("barista_profile_updated", { userId, kind: "publication" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    // ── Barista Marketplace: Job posting system ───────────────────────────────
    // Coffee Owner job posts, two publication modes (AUTOMATIC/MANUAL — see
    // baristaJobPosts in shared/schema.ts for the full rationale). Visibility is
    // enforced server-side on every read, never left to the frontend alone:
    //   AUTOMATIC + PUBLISHED + not expired → every eligible barista
    //   MANUAL + PUBLISHED + not expired → only baristas targeted via
    //     POST .../targets (the existing Fast Search "Flash" component, extended)
    //   DRAFT / CLOSED / expired → only the owning Coffee Owner / Admin

    const jobPostBodySchema = z.object({
      title: z.string().trim().min(1).max(200),
      establishment: z.string().trim().max(200).optional(),
      locationAddress: z.string().trim().max(300).optional(),
      openPositions: z.number().int().min(1).max(999).optional(),
      employmentTypes: z.array(z.string().max(40)).max(10).optional(),
      experienceRequired: z.string().trim().max(120).optional(),
      educationLevels: z.array(z.string().max(120)).max(20).optional(),
      languages: z.array(z.string().max(60)).max(20).optional(),
      remuneration: z.string().trim().max(200).optional(),
      description: z.string().trim().max(5000).optional(),
      requirements: z.string().trim().max(5000).optional(),
      expiresAt: z.string().optional().nullable(),
      // MISSION-only planned period — see shared/schema.ts baristaJobPosts for
      // the distinction from expiresAt. Validated below (end >= start) rather
      // than here, since both fields arrive independently and partial() (the
      // PATCH case) may send only one of them.
      missionStartDate: z.string().trim().max(40).optional().nullable(),
      missionEndDate: z.string().trim().max(40).optional().nullable(),
      publicationMode: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
      status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional(),
      recordType: z.enum(["OFFER", "MISSION"]).optional(),
    });

    function normalizeJobPostBody(body: Partial<z.infer<typeof jobPostBodySchema>>) {
      const payload: any = { ...body };
      if (body.expiresAt !== undefined) payload.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      return payload;
    }

    // Mission period validation — only meaningful once both dates are actually
    // known for the row being saved; `existing` lets PATCH validate using
    // whichever of the two dates the request didn't just change.
    function validateMissionDates(body: Partial<z.infer<typeof jobPostBodySchema>>, existing?: { missionStartDate: string | null; missionEndDate: string | null }): string | null {
      const start = body.missionStartDate !== undefined ? body.missionStartDate : existing?.missionStartDate;
      const end = body.missionEndDate !== undefined ? body.missionEndDate : existing?.missionEndDate;
      if (start && end && end < start) return "La date de fin ne peut pas être antérieure à la date de début.";
      return null;
    }

    app.post("/api/barista/jobs", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const body = jobPostBodySchema.parse(req.body);
        const dateError = validateMissionDates(body);
        if (dateError) return res.status(400).json({ message: dateError });
        const user = await storage.getUser(req.session.userId!);
        const payload = normalizeJobPostBody(body);
        if (!payload.establishment) payload.establishment = user!.name;
        if (!payload.locationAddress) payload.locationAddress = user!.locationAddress ?? "";
        const job = await storage.createBaristaJobPost(user!.id, payload);
        broadcast("barista_jobs_updated", { cafeOwnerId: user!.id });
        res.status(201).json(job);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid job post data" });
      }
    });

    app.get("/api/barista/jobs/mine", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const recordType = req.query.recordType === "MISSION" || req.query.recordType === "OFFER" ? req.query.recordType : undefined;
        const jobs = await storage.getBaristaJobPostsForOwner(req.session.userId!, recordType);
        res.json(jobs);
      } catch { res.status(500).json({ message: "Failed to load job posts" }); }
    });

    // Barista-side discovery — automatic + published + not expired, union
    // manually-targeted + published + not expired for this barista specifically.
    app.get("/api/barista/jobs/discover", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Barista Marketplace access required" });
      try {
        const recordType = req.query.recordType === "MISSION" || req.query.recordType === "OFFER" ? req.query.recordType : undefined;
        const jobs = await storage.getDiscoverableBaristaJobPosts(user.id, recordType);
        const appliedRows = await storage.getBaristaJobApplicationsForBarista(user.id);
        const appliedIds = new Set(appliedRows.map((a) => a.jobPostId));
        res.json(jobs.map((j) => ({ ...j, hasApplied: appliedIds.has(j.id) })));
      } catch { res.status(500).json({ message: "Failed to load job opportunities" }); }
    });

    app.get("/api/barista/applications/mine", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Barista Marketplace access required" });
      try { res.json(await storage.getBaristaJobApplicationsForBarista(user.id)); }
      catch { res.status(500).json({ message: "Failed to load applications" }); }
    });

    // Single job detail — visibility enforced per the rule above. The route is
    // deliberately a POST-auth-gated GET (requireAuth, not public) so a guessed
    // id from an unauthenticated or unrelated account never resolves a MANUAL job.
    app.get("/api/barista/jobs/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const job = await storage.getBaristaJobPostById(Number(req.params.id));
      if (!job) return res.status(404).json({ message: "Job post not found" });
      const isOwnerOrAdmin = user.id === job.cafeOwnerId || ["ADMIN", "SUPER_ADMIN"].includes(user.role);
      if (isOwnerOrAdmin) {
        const withStats = await storage.getBaristaJobPostWithStats(job.id);
        const targets = job.publicationMode === "MANUAL" ? await storage.getBaristaJobTargets(job.id) : [];
        return res.json({ job: withStats, targets });
      }
      if (user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Forbidden" });
      const now = new Date();
      const notExpired = !job.expiresAt || new Date(job.expiresAt as any) > now;
      const visible = job.status === "PUBLISHED" && notExpired && (
        job.publicationMode === "AUTOMATIC" || await storage.isBaristaJobTargeted(job.id, user.id)
      );
      if (!visible) return res.status(404).json({ message: "Job post not found" });
      const hasApplied = await storage.hasBaristaAppliedToJob(job.id, user.id);
      res.json({ job, hasApplied });
    });

    app.patch("/api/barista/jobs/:id", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const body = jobPostBodySchema.partial().parse(req.body);
        const existing = await storage.getBaristaJobPostById(Number(req.params.id));
        if (!existing || existing.cafeOwnerId !== req.session.userId) return res.status(404).json({ message: "Job post not found" });
        const dateError = validateMissionDates(body, existing);
        if (dateError) return res.status(400).json({ message: dateError });
        const payload = normalizeJobPostBody(body);
        const updated = await storage.updateBaristaJobPost(Number(req.params.id), req.session.userId!, payload);
        if (!updated) return res.status(404).json({ message: "Job post not found" });
        broadcast("barista_jobs_updated", { cafeOwnerId: req.session.userId });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid job post data" });
      }
    });

    // Manual targeting — called from the Coffee Owner's Fast Search ("Flash")
    // component when they associate the barista currently shown with one of
    // their own MANUAL job posts. Owner-only, and only for their own job.
    app.post("/api/barista/jobs/:id/targets", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const { baristaUserId } = z.object({ baristaUserId: z.number().int().positive() }).parse(req.body);
        const job = await storage.getBaristaJobPostById(Number(req.params.id));
        if (!job || job.cafeOwnerId !== req.session.userId) return res.status(404).json({ message: "Job post not found" });
        if (job.publicationMode !== "MANUAL") return res.status(400).json({ message: "Seules les offres en publication manuelle peuvent être ciblées." });
        const target = await storage.getUser(baristaUserId);
        if (!target || target.role !== "BARISTA_MARKETPLACE") return res.status(404).json({ message: "Barista not found" });
        const row = await storage.addBaristaJobTarget(job.id, baristaUserId);
        await notify({
          userId: baristaUserId,
          service: "BARISTA", type: "barista_job_targeted", priority: "INFO",
          title: "Nouvelle opportunité d'emploi",
          message: `${job.establishment || "Un établissement"} vous propose l'offre "${job.title}".`,
          entityType: "barista_job_post", entityId: job.id,
          prefKey: "barista_jobs",
          dedupeKey: `barista:job_targeted:${job.id}:${baristaUserId}`,
        });
        res.status(201).json(row);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.get("/api/barista/jobs/:id/targets", requireApprovedCafeOwner, async (req: any, res) => {
      const job = await storage.getBaristaJobPostById(Number(req.params.id));
      if (!job || job.cafeOwnerId !== req.session.userId) return res.status(404).json({ message: "Job post not found" });
      try { res.json(await storage.getBaristaJobTargets(job.id)); }
      catch { res.status(500).json({ message: "Failed to load targets" }); }
    });

    // ── Applications ──
    app.post("/api/barista/jobs/:id/apply", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Barista Marketplace access required" });
      try {
        const { message } = z.object({ message: z.string().max(2000).optional() }).parse(req.body);
        const job = await storage.getBaristaJobPostById(Number(req.params.id));
        if (!job) return res.status(404).json({ message: "Job post not found" });
        const now = new Date();
        const notExpired = !job.expiresAt || new Date(job.expiresAt as any) > now;
        if (job.status !== "PUBLISHED" || !notExpired) return res.status(400).json({ message: "Cette offre n'accepte plus de candidatures." });
        const eligible = job.publicationMode === "AUTOMATIC" || await storage.isBaristaJobTargeted(job.id, user.id);
        if (!eligible) return res.status(403).json({ message: "Forbidden" });
        if (await storage.hasBaristaAppliedToJob(job.id, user.id)) {
          return res.status(400).json({ message: "Vous avez déjà postulé à cette offre." });
        }
        const application = await storage.createBaristaJobApplication(job.id, user.id, message);
        broadcast("barista_jobs_updated", { cafeOwnerId: job.cafeOwnerId });
        await notify({
          userId: job.cafeOwnerId,
          service: "BARISTA", type: "barista_job_application_received", priority: "INFO",
          title: "Nouvelle candidature",
          message: `${user.name} a postulé à "${job.title}".`,
          entityType: "barista_job_application", entityId: application.id,
          prefKey: "barista_jobs",
          dedupeKey: `barista:job_application_created:${application.id}`,
        });
        res.status(201).json(application);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        if (err instanceof Error && /duplicate key|unique/i.test(err.message)) {
          return res.status(400).json({ message: "Vous avez déjà postulé à cette offre." });
        }
        res.status(400).json({ message: "Invalid application" });
      }
    });

    app.get("/api/barista/jobs/:id/applications", requireApprovedCafeOwner, async (req: any, res) => {
      const job = await storage.getBaristaJobPostById(Number(req.params.id));
      if (!job || job.cafeOwnerId !== req.session.userId) return res.status(404).json({ message: "Job post not found" });
      try { res.json(await storage.getBaristaJobApplicationsForJob(job.id)); }
      catch { res.status(500).json({ message: "Failed to load applications" }); }
    });

    app.patch("/api/barista/applications/:id/status", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const { status } = z.object({
          status: z.enum(["PENDING", "PRESELECTED", "INTERVIEW_SCHEDULED", "ACCEPTED", "REJECTED"]),
        }).parse(req.body);
        const application = await storage.getBaristaJobApplicationById(Number(req.params.id));
        if (!application) return res.status(404).json({ message: "Application not found" });
        const job = await storage.getBaristaJobPostById(application.jobPostId);
        if (!job || job.cafeOwnerId !== req.session.userId) return res.status(404).json({ message: "Application not found" });
        const updated = await storage.updateBaristaJobApplicationStatus(application.id, status);
        broadcast("barista_jobs_updated", { cafeOwnerId: job.cafeOwnerId });
        broadcastToUsers([application.baristaUserId], "barista_jobs_updated", {});
        await notify({
          userId: application.baristaUserId,
          service: "BARISTA", type: "barista_job_application_status_changed", priority: "INFO",
          title: "Candidature mise à jour",
          message: `Le statut de votre candidature pour "${job.title}" a changé.`,
          entityType: "barista_job_application", entityId: application.id,
          prefKey: "barista_jobs",
          dedupeKey: `barista:job_application_status:${application.id}:${status}`,
        });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    // ── Meetings ──
    app.post("/api/barista/applications/:id/meeting", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const { scheduledAt, notes } = z.object({
          scheduledAt: z.string().min(1),
          notes: z.string().max(1000).optional().nullable(),
        }).parse(req.body);
        const application = await storage.getBaristaJobApplicationById(Number(req.params.id));
        if (!application) return res.status(404).json({ message: "Application not found" });
        const job = await storage.getBaristaJobPostById(application.jobPostId);
        if (!job || job.cafeOwnerId !== req.session.userId) return res.status(404).json({ message: "Application not found" });
        const meeting = await storage.upsertBaristaJobMeeting(application.id, { scheduledAt: new Date(scheduledAt), notes });
        broadcastToUsers([application.baristaUserId, job.cafeOwnerId], "barista_jobs_updated", {});
        await notify({
          userId: application.baristaUserId,
          service: "BARISTA", type: "barista_job_meeting_proposed", priority: "WARNING",
          title: "Proposition d'entretien",
          message: `${job.establishment || "Un établissement"} vous propose un entretien pour "${job.title}".`,
          entityType: "barista_job_meeting", entityId: meeting.id,
          prefKey: "barista_jobs",
          dedupeKey: `barista:job_meeting_proposed:${meeting.id}:${meeting.updatedAt?.toString() ?? ""}`,
        });
        res.status(201).json(meeting);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid meeting data" });
      }
    });

    // Either party (the Coffee Owner who proposed it, or the barista it was
    // proposed to) may confirm/cancel — never an unrelated account.
    app.patch("/api/barista/meetings/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      try {
        const { status } = z.object({ status: z.enum(["CONFIRMED", "CANCELLED"]) }).parse(req.body);
        const [meeting] = await db.select().from(baristaJobMeetings).where(eq(baristaJobMeetings.id, Number(req.params.id)));
        if (!meeting) return res.status(404).json({ message: "Meeting not found" });
        const application = await storage.getBaristaJobApplicationById(meeting.applicationId);
        if (!application) return res.status(404).json({ message: "Meeting not found" });
        const job = await storage.getBaristaJobPostById(application.jobPostId);
        const isOwner = job && job.cafeOwnerId === user.id;
        const isBarista = application.baristaUserId === user.id;
        if (!isOwner && !isBarista) return res.status(403).json({ message: "Forbidden" });
        const updated = await storage.updateBaristaJobMeetingStatus(meeting.id, status);
        broadcastToUsers([application.baristaUserId, job!.cafeOwnerId], "barista_jobs_updated", {});
        const notifyUserId = isOwner ? application.baristaUserId : job!.cafeOwnerId;
        await notify({
          userId: notifyUserId,
          service: "BARISTA", type: "barista_job_meeting_updated", priority: "INFO",
          title: status === "CONFIRMED" ? "Entretien confirmé" : "Entretien annulé",
          message: `L'entretien pour "${job!.title}" a été ${status === "CONFIRMED" ? "confirmé" : "annulé"}.`,
          entityType: "barista_job_meeting", entityId: meeting.id,
          prefKey: "barista_jobs",
          dedupeKey: `barista:job_meeting_${status.toLowerCase()}:${meeting.id}`,
        });
        res.json(updated);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.patch("/api/barista/availability", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Barista Marketplace access required" });
      try {
        const dayHoursSchema = z.object({ open: z.string(), close: z.string(), closed: z.boolean() });
        const body = z.object({
          availableDays: z.array(z.string()),
          isAvailable: z.boolean().optional(),
          isOnVacation: z.boolean(),
          // Per-day schedule — optional so existing callers that only send
          // availableDays keep working unchanged.
          weeklyHours: z.object({
            monday: dayHoursSchema, tuesday: dayHoursSchema, wednesday: dayHoursSchema,
            thursday: dayHoursSchema, friday: dayHoursSchema, saturday: dayHoursSchema, sunday: dayHoursSchema,
          }).optional(),
        }).parse(req.body);
        const profile = await storage.upsertBaristaMarketplaceProfile(user.id, {
          ...body,
          isAvailable: body.isAvailable ?? !body.isOnVacation,
        });
        broadcast("barista_profile_updated", { userId: user.id, kind: "availability" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid availability data" });
      }
    });

    // ── Work history ("Cafés précédents / Expérience", Part 19) — own table, own
    // ownership-scoped CRUD, exactly like the Skills list. Only the owning Barista
    // may create/update/delete their own entries; entries are publicly readable as
    // part of the Barista card (see getBaristaMarketplaceCard) — no separate route
    // needed for viewing since they're already embedded in /api/barista/profile/:userId.
    app.post("/api/barista/work-history", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Barista Marketplace access required" });
      try {
        const body = z.object({
          cafeName: z.string().min(1).max(200),
          role: z.string().max(200).optional(),
          startPeriod: z.string().max(40).optional(),
          endPeriod: z.string().max(40).optional().nullable(),
          description: z.string().max(2000).optional(),
        }).parse(req.body);
        const entry = await storage.createBaristaWorkHistory(user.id, body);
        broadcast("barista_profile_updated", { userId: user.id, kind: "workHistory" });
        res.status(201).json(entry);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid work history data" });
      }
    });

    app.patch("/api/barista/work-history/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Barista Marketplace access required" });
      try {
        const body = z.object({
          cafeName: z.string().min(1).max(200).optional(),
          role: z.string().max(200).optional(),
          startPeriod: z.string().max(40).optional(),
          endPeriod: z.string().max(40).optional().nullable(),
          description: z.string().max(2000).optional(),
        }).parse(req.body);
        const entry = await storage.updateBaristaWorkHistory(Number(req.params.id), user.id, body);
        if (!entry) return res.status(404).json({ message: "Not found" });
        broadcast("barista_profile_updated", { userId: user.id, kind: "workHistory" });
        res.json(entry);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid work history data" });
      }
    });

    app.delete("/api/barista/work-history/:id", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Barista Marketplace access required" });
      await storage.deleteBaristaWorkHistory(Number(req.params.id), user.id);
      broadcast("barista_profile_updated", { userId: user.id, kind: "workHistory" });
      res.json({ ok: true });
    });

    // Entity-level report — a Coffee Owner flagging a Barista account (distinct
    // from review-reporting). Admin resolves centrally; see /api/admin/barista/reports below.
    // Extended (task: "Add a Grabber to the Maintenance Reports Modal and
    // Extend the Reporting System to Barista") with a 1-5 sadness rating and
    // the same Submitted -> Pending -> Published/Rejected lifecycle already
    // used by Maintenance.
    app.post("/api/barista/:userId/report", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const baristaUserId = Number(req.params.userId);
      const target = await storage.getUser(baristaUserId);
      if (!target || target.role !== "BARISTA_MARKETPLACE") return res.status(404).json({ message: "Barista not found" });
      try {
        const { reason, rating } = z.object({ reason: z.string().min(1).max(500), rating: z.number().int().min(1).max(5) }).parse(req.body);
        const report = await storage.createBaristaReport(user.id, baristaUserId, reason, rating);
        broadcast("admin_barista_report_created", { baristaUserId });
        const adminIds = await storage.getAdminUserIds();
        await notifyMany({
          userIds: adminIds,
          service: "ADMIN", type: "barista_report_created", priority: "URGENT",
          title: "Barista signalé",
          message: `${user.name} a signalé ${target.name} (Barista) : "${reason}".`,
          entityType: "barista_report", entityId: report.id,
          prefKey: "reports",
          dedupeKeyPrefix: `admin:barista_report_created:${report.id}`,
        });
        res.status(201).json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid report data" });
      }
    });

    // Coffee Owner's own "Blacklist" — reports THEY submitted, never another
    // Coffee Owner's (Part 21). Same baristaReports table as Admin's queue below;
    // this is a scoped read, not a second system.
    app.get("/api/barista/reports/mine", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      res.json(await storage.getBaristaReportsByOwner(user.id));
    });

    // Public (any authenticated user) read of admin-published reports only —
    // mirrors GET /api/maintenance/reports/published exactly.
    app.get("/api/barista/reports/published", requireAuth, async (req: any, res) => {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 50);
      res.json(await storage.getPublishedBaristaReports(page, limit));
    });

    app.get("/api/admin/barista/reports", requireAdmin, async (req: any, res) => {
      const status = typeof req.query.status === "string" ? (req.query.status as "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED") : undefined;
      res.json(await storage.getBaristaReports(status));
    });

    app.patch("/api/admin/barista/reports/:id/resolve", requireAdmin, async (req: any, res) => {
      try {
        const { status, resolutionNote } = z.object({
          status: z.enum(["RESOLVED", "DISMISSED", "PUBLISHED", "REJECTED"]),
          resolutionNote: z.string().max(1000).optional(),
        }).parse(req.body);
        if (status === "PUBLISHED") {
          // A legacy report (no rating) can be rejected/dismissed but never
          // published — mirrors the same guard on the Maintenance route.
          const target = await storage.getBaristaReportById(Number(req.params.id));
          if (!target) return res.status(404).json({ message: "Not found" });
          if (target.rating == null) return res.status(400).json({ message: "Ce signalement n'a pas de note et ne peut pas être publié." });
        }
        const report = await storage.resolveBaristaReport(Number(req.params.id), status, resolutionNote, req.session.userId);
        if (!report) return res.status(404).json({ message: "Not found" });
        broadcast("admin_barista_report_created", { baristaUserId: report.baristaUserId });
        res.json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid data" });
      }
    });

    app.get("/api/barista/requests", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role === "BARISTA_MARKETPLACE") return res.json(await storage.getBaristaRequestsForBarista(user.id));
      if (user.role === "CAFE_OWNER") return res.json(await storage.getBaristaRequestsForOwner(user.id));
      return res.status(403).json({ message: "Forbidden" });
    });

    app.post("/api/barista/requests", requireApprovedCafeOwner, async (req: any, res) => {
      try {
        const body = z.object({
          baristaUserId: z.number().int().positive(),
          missionType: z.string().min(1).max(200),
          message: z.string().max(2000).default(""),
          proposedRateInCents: z.number().int().min(0).optional().nullable(),
          startDate: z.string().min(1),
          endDate: z.string().optional().nullable(),
        }).parse(req.body);
        const user = await storage.getUser(req.session.userId!);
        const request = await storage.createBaristaRequest(user!.id, body);
        await storage.refreshBaristaMessagingState(request.id);
        broadcastToUsers([request.baristaUserId], "barista_request_created", { requestId: request.id });
        broadcastToUsers([request.cafeOwnerId, request.baristaUserId], "conversation_updated", { service: "BARISTA", requestId: request.id });
        await notify({
          userId: request.baristaUserId,
          service: "BARISTA", type: "barista_request_created", priority: "WARNING",
          title: "Nouvelle demande de mission",
          message: `${user!.name} vous a envoyé une demande pour "${body.missionType}".`,
          entityType: "barista_request", entityId: request.id,
          prefKey: "barista_requests",
          dedupeKey: `barista:request_created:${request.id}`,
        });
        res.status(201).json(request);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? "Unable to create request" });
      }
    });

    app.patch("/api/barista/requests/:id/status", requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: "Unauthorized" });
        const body = z.object({
          status: z.enum(["DISCUSSION", "ACCEPTED", "REJECTED", "CANCELLED"]),
          cancelReason: z.string().max(500).optional(),
        }).parse(req.body);
        const { request, mission } = await storage.updateBaristaRequestStatus(
          Number(req.params.id), { id: user.id, role: user.role }, body.status, { cancelReason: body.cancelReason },
        );
        await storage.refreshBaristaMessagingState(request.id);
        const recipients = [request.cafeOwnerId, request.baristaUserId];
        broadcastToUsers(recipients, "barista_request_status_changed", { requestId: request.id, status: request.status });
        broadcast("barista_request_status_changed", { requestId: request.id, status: request.status });
        broadcastToUsers(recipients, "conversation_updated", { service: "BARISTA", requestId: request.id });
        if (mission) {
          broadcastToUsers(recipients, "barista_mission_created", { missionId: mission.id, requestId: request.id });
        }
        const otherPartyId = user.id === request.cafeOwnerId ? request.baristaUserId : request.cafeOwnerId;
        const STATUS_TEXT_FR: Partial<Record<string, { title: string; priority: NotificationPriority; verb: string }>> = {
          ACCEPTED: { title: "Demande acceptée", priority: "SUCCESS", verb: "a accepté" },
          REJECTED: { title: "Demande refusée", priority: "WARNING", verb: "a refusé" },
          CANCELLED: { title: "Demande annulée", priority: "WARNING", verb: "a annulé" },
        };
        const statusText = STATUS_TEXT_FR[body.status];
        if (statusText) {
          await notify({
            userId: otherPartyId,
            service: "BARISTA", type: "barista_request_status_changed", priority: statusText.priority,
            title: statusText.title,
            message: `${user.name} ${statusText.verb} la demande pour "${request.missionType}".`,
            entityType: "barista_request", entityId: request.id,
            prefKey: "barista_missions",
            dedupeKey: `barista:request_status:${request.id}:${body.status}`,
          });
        }
        if (mission) {
          await notify({
            userId: otherPartyId,
            service: "BARISTA", type: "barista_mission_created", priority: "SUCCESS",
            title: "Mission confirmée",
            message: `Votre mission "${request.missionType}" est confirmée.`,
            entityType: "barista_mission", entityId: mission.id,
            prefKey: "barista_missions",
            dedupeKey: `barista:mission_created:${mission.id}`,
          });
        }
        res.json({ request, mission });
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(409).json({ message: err.message ?? "Unable to update request" });
      }
    });

    app.get("/api/barista/missions", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role === "BARISTA_MARKETPLACE") return res.json(await storage.getBaristaMissionsForBarista(user.id));
      if (user.role === "CAFE_OWNER") return res.json(await storage.getBaristaMissionsForOwner(user.id));
      return res.status(403).json({ message: "Forbidden" });
    });

    app.patch("/api/barista/missions/:id/status", requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: "Unauthorized" });
        const { status } = z.object({ status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]) }).parse(req.body);
        const mission = await storage.updateBaristaMissionStatus(Number(req.params.id), { id: user.id, role: user.role }, status);
        const recipients = [mission.cafeOwnerId, mission.baristaUserId];
        broadcastToUsers(recipients, "barista_mission_status_changed", { missionId: mission.id, status: mission.status });
        broadcast("barista_mission_status_changed", { missionId: mission.id, status: mission.status });
        const otherPartyId = user.id === mission.cafeOwnerId ? mission.baristaUserId : mission.cafeOwnerId;
        const MISSION_STATUS_TEXT_FR: Partial<Record<string, { title: string; priority: NotificationPriority; text: string }>> = {
          ACTIVE: { title: "Mission démarrée", priority: "INFO", text: "a démarré la mission" },
          COMPLETED: { title: "Mission terminée", priority: "SUCCESS", text: "a marqué la mission comme terminée. N'hésitez pas à laisser un avis" },
          CANCELLED: { title: "Mission annulée", priority: "WARNING", text: "a annulé la mission" },
        };
        const missionText = MISSION_STATUS_TEXT_FR[status];
        if (missionText) {
          await notify({
            userId: otherPartyId,
            service: "BARISTA", type: "barista_mission_status_changed", priority: missionText.priority,
            title: missionText.title,
            message: `${user.name} ${missionText.text}.`,
            entityType: "barista_mission", entityId: mission.id,
            prefKey: "barista_missions",
            dedupeKey: `barista:mission_status:${mission.id}:${status}`,
          });
        }
        res.json(mission);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(409).json({ message: err.message ?? "Unable to update mission" });
      }
    });

    app.get("/api/barista/reviews/:baristaUserId", async (req, res) => {
      try { res.json(await storage.getBaristaReviews(Number(req.params.baristaUserId))); }
      catch { res.status(500).json({ message: "Failed to load Barista reviews" }); }
    });

    app.get("/api/barista/reviews/mission/:missionId", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const missionId = Number(req.params.missionId);
      const mission = await storage.getBaristaMissionById(missionId);
      if (!mission) return res.status(404).json({ message: "Mission not found" });
      const owns = (user.role === "CAFE_OWNER" && mission.cafeOwnerId === user.id) ||
        (user.role === "BARISTA_MARKETPLACE" && mission.baristaUserId === user.id);
      if (!owns) return res.status(403).json({ message: "Forbidden" });
      res.json(user.role === "CAFE_OWNER" ? (await storage.getBaristaReviewForMission(missionId, user.id)) ?? null : null);
    });

    app.post("/api/barista/reviews", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER" || user.status !== "approved") {
        return res.status(403).json({ message: "Only approved Coffee Owners can submit reviews" });
      }
      try {
        const body = z.object({
          baristaUserId: z.number().int().positive(),
          missionId: z.number().int().positive(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().max(2000).optional(),
        }).parse(req.body);
        const mission = await storage.getBaristaMissionById(body.missionId);
        if (!mission || mission.cafeOwnerId !== user.id || mission.baristaUserId !== body.baristaUserId || mission.status !== "COMPLETED") {
          return res.status(400).json({ message: "Reviews are only available after a completed mission" });
        }
        const result = await storage.upsertBaristaReview({
          ...body, cafeId: user.id, cafeName: user.name, cafeOwnerName: user.name,
        });
        broadcast("barista_review_created", { baristaUserId: body.baristaUserId, missionId: body.missionId });
        if (!result.isUpdate) {
          await notify({
            userId: body.baristaUserId,
            service: "BARISTA", type: "barista_review_created", priority: "INFO",
            title: "Nouvel avis reçu",
            message: `${user.name} vous a laissé un avis (${body.rating}/5).`,
            entityType: "barista_mission", entityId: body.missionId,
            prefKey: "reviews",
            dedupeKey: `barista:review_created:${body.missionId}`,
          });
        }
        res.status(result.isUpdate ? 200 : 201).json(result.review);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? "Unable to submit review" });
      }
    });

    app.get("/api/barista/revenue", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "BARISTA_MARKETPLACE") return res.status(403).json({ message: "Barista Marketplace access required" });
      try { res.json(await storage.getBaristaRevenueSummary(user.id)); }
      catch { res.status(500).json({ message: "Failed to load revenue" }); }
    });

    // ── Admin BARISTA — same philosophy as Admin PRINT above: one aggregate
    // overview endpoint the client tabs/filters over, built entirely from the
    // real Barista Marketplace tables (no duplicate data, no mock KPIs). ──────

    app.get("/api/admin/barista", requireAdmin, async (_req, res) => {
      try { res.json(await storage.getBaristaAdminOverview()); }
      catch (err) { console.error(err); res.status(500).json({ message: "Failed to load Barista overview" }); }
    });

    // ── Barista Marketplace: admin skills taxonomy (mirrors admin/maintenance/competencies) ──

    app.get("/api/admin/barista/skills", requireAdmin, async (_req, res) => {
      try { res.json(await storage.getBaristaSkills(false)); }
      catch { res.status(500).json({ message: "Failed to load Barista skills" }); }
    });

    app.post("/api/admin/barista/skills", requireAdmin, async (req, res) => {
      try {
        const { name, icon } = z.object({ name: z.string().trim().min(1).max(120), icon: z.string().trim().max(8).nullable().optional() }).parse(req.body);
        const item = await storage.createBaristaSkill(name, icon ?? null);
        broadcast("barista_taxonomy_updated", {});
        res.status(201).json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Skill already exists or is invalid" });
      }
    });

    app.patch("/api/admin/barista/skills/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          name: z.string().trim().min(1).max(120).optional(),
          icon: z.string().trim().max(8).nullable().optional(),
          isActive: z.boolean().optional(),
          isFrozen: z.boolean().optional(),
        }).parse(req.body);
        const item = await storage.updateBaristaSkill(Number(req.params.id), body);
        if (!item) return res.status(404).json({ message: "Skill not found" });
        broadcast("barista_taxonomy_updated", {});
        res.json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid skill" });
      }
    });

    app.delete("/api/admin/barista/skills/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deleteBaristaSkill(Number(req.params.id));
        broadcast("barista_taxonomy_updated", {});
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete skill" }); }
    });

    // ── Barista Marketplace: admin Niveau d'étude taxonomy (same CRUD shape as skills above) ──

    app.get("/api/admin/barista/education-levels", requireAdmin, async (_req, res) => {
      try { res.json(await storage.getBaristaEducationLevels(false)); }
      catch { res.status(500).json({ message: "Failed to load education levels" }); }
    });

    app.post("/api/admin/barista/education-levels", requireAdmin, async (req, res) => {
      try {
        const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body);
        const item = await storage.createBaristaEducationLevel(name);
        broadcast("barista_taxonomy_updated", {});
        res.status(201).json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Education level already exists or is invalid" });
      }
    });

    app.patch("/api/admin/barista/education-levels/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          name: z.string().trim().min(1).max(120).optional(),
          isActive: z.boolean().optional(),
          isFrozen: z.boolean().optional(),
        }).parse(req.body);
        const item = await storage.updateBaristaEducationLevel(Number(req.params.id), body);
        if (!item) return res.status(404).json({ message: "Education level not found" });
        broadcast("barista_taxonomy_updated", {});
        res.json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid education level" });
      }
    });

    app.delete("/api/admin/barista/education-levels/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deleteBaristaEducationLevel(Number(req.params.id));
        broadcast("barista_taxonomy_updated", {});
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete education level" }); }
    });

    // ── Barista Marketplace: admin Langue taxonomy (same CRUD shape as skills above) ──

    app.get("/api/admin/barista/languages", requireAdmin, async (_req, res) => {
      try { res.json(await storage.getBaristaLanguages(false)); }
      catch { res.status(500).json({ message: "Failed to load languages" }); }
    });

    app.post("/api/admin/barista/languages", requireAdmin, async (req, res) => {
      try {
        const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
        const item = await storage.createBaristaLanguage(name);
        broadcast("barista_taxonomy_updated", {});
        res.status(201).json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Language already exists or is invalid" });
      }
    });

    app.patch("/api/admin/barista/languages/:id", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          name: z.string().trim().min(1).max(60).optional(),
          isActive: z.boolean().optional(),
          isFrozen: z.boolean().optional(),
        }).parse(req.body);
        const item = await storage.updateBaristaLanguage(Number(req.params.id), body);
        if (!item) return res.status(404).json({ message: "Language not found" });
        broadcast("barista_taxonomy_updated", {});
        res.json(item);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid language" });
      }
    });

    app.delete("/api/admin/barista/languages/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deleteBaristaLanguage(Number(req.params.id));
        broadcast("barista_taxonomy_updated", {});
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Failed to delete language" }); }
    });

    // ── Admin Barista Marketplace account actions — same edit/freeze pattern as
    // /api/admin/maintenance/accounts (Marketing/Maintenance reference). ──────────
    // Registered BEFORE the /:userId route below — see Print's identical comment above
    // and docs/service_card_reorder_and_detail_modal_audit.md Part 1.
    app.patch("/api/admin/barista/accounts/bulk-order", requireAdmin, async (req, res) => {
      try {
        const orders: { id: number; displayOrder: number }[] = req.body?.orders;
        if (!Array.isArray(orders)) return res.status(400).json({ message: "Invalid payload" });
        await storage.bulkUpdateBaristaOrder(orders);
        broadcast("barista_profile_updated", { kind: "bulk_order" });
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error" }); }
    });

    app.patch("/api/admin/barista/accounts/:userId", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "BARISTA_MARKETPLACE") return res.status(404).json({ message: "Barista account not found" });
        const { name, email, phone, profileImageUrl, ...profileFields } = z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          profileImageUrl: z.string().optional().nullable(),
          bio: z.string().optional(),
          level: z.string().optional(),
          skills: z.array(z.string()).optional(),
          dailyRateInCents: z.number().int().min(0).optional(),
        }).parse(req.body);
        const userUpdates: any = {};
        if (name !== undefined) userUpdates.name = name;
        if (email !== undefined) userUpdates.email = email;
        if (phone !== undefined) userUpdates.phone = phone;
        if (profileImageUrl !== undefined) userUpdates.profileImageUrl = profileImageUrl?.trim() || null;
        if (Object.keys(userUpdates).length) await storage.updateUser(userId, userUpdates);
        const profile = Object.keys(profileFields).length ? await storage.upsertBaristaMarketplaceProfile(userId, profileFields as any) : await storage.getBaristaMarketplaceProfile(userId);
        broadcastToUsers([userId], "user_profile_updated");
        broadcast("barista_profile_updated", { userId, kind: "admin_edit" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid account data" });
      }
    });

    app.patch("/api/admin/barista/accounts/:userId/freeze", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "BARISTA_MARKETPLACE") return res.status(404).json({ message: "Barista account not found" });
        const { isFrozen } = z.object({ isFrozen: z.boolean() }).parse(req.body);
        const profile = await storage.upsertBaristaMarketplaceProfile(userId, { isFrozen });
        broadcast("barista_profile_updated", { userId, kind: "freeze" });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid request" });
      }
    });

    app.patch("/api/admin/barista/accounts/:userId/auto-approve", requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== "BARISTA_MARKETPLACE") return res.status(404).json({ message: "Barista account not found" });
        const autoApprove = Boolean(req.body?.autoApprove);
        const profile = await storage.setBaristaAutoApprove(userId, autoApprove);
        broadcast("barista_profile_updated", { userId, kind: "auto_approve" });
        res.json(profile);
      } catch { res.status(500).json({ message: "Error" }); }
    });
}
