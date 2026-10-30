import { z } from "zod";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { buildRegistrationPasswordSchema, isValidRegistrationPassword, registrationPasswordMessage } from "./shared/helpers";
import { broadcast, broadcastToUsers } from "../ws";
import { notifyMany } from "../notify";
import { checkAndRecordLoginRateLimit } from "../login-rate-limit";
import { getCooldownRemainingSeconds, recordFailedAttempt, resetLoginAttempts } from "../login-attempts";
import { sendPasswordResetEmail, EmailDeliveryError } from "../email";
import { requireAuth } from "./shared/middleware";
import rateLimit from "express-rate-limit";
import type { Express } from "express";

const authRateLimitMessage = { message: "Trop de tentatives. Veuillez réessayer plus tard." };
const loginRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: authRateLimitMessage });
const registerRateLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: authRateLimitMessage });
const forgotPasswordRateLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: authRateLimitMessage });
const verifyResetCodeRateLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: authRateLimitMessage });
const resetPasswordRateLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: authRateLimitMessage });

export function registerAuthRoutes(app: Express): void {
    // ── Auth ────────────────────────────────────────────────────────────────────

    const registerBodySchema = z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Valid email required"),
      // Complexity/length validated separately below with the currently
      // configured passwordMinLength — see buildRegistrationPasswordSchema.
      password: z.string().min(1, "Password required"),
      role: z.enum(['CAFE_OWNER', 'SUPPLIER', 'DELIVERY_COMPANY', 'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE']).optional(),
      phone: z.string().optional().nullable(),
      isWhatsapp: z.boolean().optional(),
      profileImageUrl: z.string().optional().nullable(),
      governorates: z.array(z.string()).optional().nullable(),
      printCategories: z.array(z.string()).optional().nullable(),
      marketingCategories: z.array(z.string()).optional().nullable(),
      maintenanceCategories: z.array(z.string()).optional().nullable(),
      maintenanceJobTitle: z.string().trim().min(2).optional(),
      maintenanceProfileType: z.enum(["Freelance", "Company", "Agency"]).optional(),
      maintenanceSkills: z.array(z.string()).optional(),
      maintenanceDescription: z.string().trim().max(2000).optional(),
      maintenanceExperienceYears: z.number().int().min(0).max(80).optional(),
      categories: z.array(z.string()).optional().nullable(),
      locationAddress: z.string().optional().nullable(),
      locationLat: z.number().optional().nullable(),
      locationLng: z.number().optional().nullable(),
      locationPlaceId: z.string().optional().nullable(),
      locationDetails: z.object({
        street: z.string().optional(),
        buildingNumber: z.string().optional(),
        postalCode: z.string().optional(),
        governorate: z.string().optional(),
        municipality: z.string().optional(),
        buildingType: z.string().optional(),
        apartment: z.string().optional(),
        floor: z.string().optional(),
        door: z.string().optional(),
        additionalNotes: z.string().optional(),
      }).optional().nullable(),
    });

    app.post(api.auth.register.path, registerRateLimiter, async (req, res) => {
      try {
        const parsed = registerBodySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
        const body = parsed.data;
        const { passwordMinLength } = await storage.getLoginSecuritySettings();
        const passwordCheck = buildRegistrationPasswordSchema(passwordMinLength).safeParse(body.password);
        if (!passwordCheck.success) return res.status(400).json({ message: passwordCheck.error.errors[0].message });
        // All new registrations (non-admin-created) start as pending
        const PENDING_ROLES = ['CAFE_OWNER', 'SUPPLIER', 'DELIVERY_COMPANY', 'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE'];
        const LOCATION_REQUIRED_ROLES = ['CAFE_OWNER', 'SUPPLIER', 'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE'];
        const role = body.role ?? 'CAFE_OWNER';
        // Registration now only collects the address-details step (no map pin), so
        // lat/lng are no longer required here — Admin sets/refines the precise
        // geolocation later via the full 3-step location picker (see /api/admin/users/:id/location).
        if (LOCATION_REQUIRED_ROLES.includes(role) && !body.locationAddress) {
          return res.status(400).json({ message: "L'adresse est requise pour ce type de compte." });
        }
        // Adresse (the free-text street field on the registration address step) is now
        // required independently of locationAddress — a request could otherwise satisfy
        // the check above while sending an empty/missing locationDetails.street.
        if (LOCATION_REQUIRED_ROLES.includes(role) && !body.locationDetails?.street?.trim()) {
          return res.status(400).json({ message: "L'adresse est requise." });
        }
        const status = PENDING_ROLES.includes(role) ? 'pending' : 'approved';
        const existing = await storage.getUserByEmail(body.email);
        if (existing) return res.status(400).json({ message: "Email already exists" });

        if (body.phone) {
          const existingPhone = await storage.getUserByPhone(body.phone);
          if (existingPhone) return res.status(400).json({ message: "Phone number already in use" });
        }

        const userData: any = {
          name: body.name,
          email: body.email,
          password: body.password,
          role,
          status,
          phone: body.phone ?? null,
          isWhatsapp: body.isWhatsapp ?? false,
          profileImageUrl: body.profileImageUrl?.trim() || null,
          categories: body.categories ?? null,
          governorates: body.governorates ?? null,
          printCategories: body.printCategories ?? null,
          marketingCategories: body.marketingCategories ?? null,
          maintenanceCategories: body.maintenanceCategories ?? null,
          locationAddress: body.locationAddress ?? null,
          locationLat: body.locationLat ?? null,
          locationLng: body.locationLng ?? null,
          locationPlaceId: body.locationPlaceId ?? null,
          locationDetails: body.locationDetails ?? null,
        };

        const user = await storage.createUser(userData);
        if (role === "MAINTENANCE") {
          // `categories` intentionally not set here (task: "Remove Legacy Categories from
          // Maintenance and Use Only Compétences") — `skills` is the one authoritative
          // competency field, selected post-registration from Business → Compétences
          // (the registration form itself no longer collects any skill/category at
          // signup time — see MaintenanceForm's own comment in landing-page.tsx).
          // body.maintenanceCategories stays accepted-but-unused in the shared
          // registration schema above, same as governorates/printCategories/etc. for
          // other roles' own equivalent not-yet-collected-at-signup fields.
          await storage.upsertMaintenanceProfile(user.id, {
            jobTitle: body.maintenanceJobTitle,
            profileType: body.maintenanceProfileType,
            skills: body.maintenanceSkills ?? [],
            description: body.maintenanceDescription ?? "",
            yearsExperience: body.maintenanceExperienceYears ?? 0,
            coverageArea: body.locationAddress ?? "",
          });
        }
        req.session.userId = user.id;
        broadcast("admin_user_directory_changed");
        if (status === 'pending') {
          const adminIds = await storage.getAdminUserIds();
          await notifyMany({
            userIds: adminIds,
            service: "ADMIN", type: "account_registration_pending", priority: "WARNING",
            title: "Nouvelle inscription à approuver",
            message: `${user.name} (${role}) attend une approbation.`,
            entityType: "user", entityId: user.id,
            prefKey: "accounts",
            dedupeKeyPrefix: `admin:registration_pending:${user.id}`,
          });
        }
        res.status(201).json(user);
      } catch (err) {
        if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
        else res.status(500).json({ message: "Internal server error" });
      }
    });

    app.post(api.auth.login.path, loginRateLimiter, async (req, res) => {
      try {
        const settings = await storage.getLoginSecuritySettings();

        // Admin-configurable login rate limiting (task: "Expand Global
        // Authentication & Security Settings") — independent, additional layer;
        // the IP-scoped loginRateLimiter middleware above is the mandatory
        // baseline and keeps running unconditionally regardless of this toggle.
        if (settings.rateLimitEnabled) {
          const ip = req.ip ?? "unknown";
          const { limited, retryAfterSeconds } = checkAndRecordLoginRateLimit(ip, settings.rateLimitMaxRequests, settings.rateLimitWindowSeconds);
          if (limited) {
            res.set("Retry-After", String(retryAfterSeconds));
            console.warn(`[security] Login rate limit triggered ip=${ip}`);
            return res.status(429).json(authRateLimitMessage);
          }
        }

        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: "Email/phone and password required" });
        // Try email first, then phone
        let user = await storage.getUserByEmail(email);
        if (!user) user = await storage.getUserByPhone(email);
        // Tracked by the account's own canonical email when one was found (so trying the
        // same account via its phone number vs its email number shares one counter, and
        // one account's failures never touch another's) — falls back to whatever
        // identifier was typed when no account matches at all, so repeatedly guessing a
        // single nonexistent identifier is still throttled. This is a SEPARATE, tighter,
        // per-account layer on top of the existing IP-scoped loginRateLimiter above
        // (unchanged) — that broader limiter still guards against distributed abuse
        // across many different accounts from one IP.
        const identifier = user ? user.email : email;

        // Per-account failed-login lockout — admin-toggleable; when disabled, no
        // account is ever locked out by this layer, but the baseline IP rate
        // limiter and the optional rate-limit layer above keep running.
        if (settings.lockoutEnabled) {
          const activeCooldown = getCooldownRemainingSeconds(identifier);
          if (activeCooldown > 0) {
            res.set("Retry-After", String(activeCooldown));
            return res.status(429).json({
              message: `Trop de tentatives. Veuillez patienter ${activeCooldown} secondes avant de réessayer.`,
              retryAfterSeconds: activeCooldown,
            });
          }
        }

        if (!user || !(await storage.verifyPassword(user.id, password, user.password))) {
          console.warn(`[security] Failed login attempt identifier=${identifier}`);
          if (settings.lockoutEnabled) {
            const { cooldownRemainingSeconds } = recordFailedAttempt(identifier, settings.cooldownSeconds, settings.maxFailedAttempts);
            if (cooldownRemainingSeconds > 0) {
              console.warn(`[security] Account lockout triggered identifier=${identifier} durationSeconds=${settings.cooldownSeconds}`);
              res.set("Retry-After", String(cooldownRemainingSeconds));
              return res.status(429).json({
                message: `Trop de tentatives. Veuillez patienter ${cooldownRemainingSeconds} secondes avant de réessayer.`,
                retryAfterSeconds: cooldownRemainingSeconds,
              });
            }
          }
          return res.status(401).json({ message: "Invalid credentials" });
        }

        if (settings.lockoutEnabled) resetLoginAttempts(identifier);
        req.session.userId = user.id;
        res.json(user);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get(api.auth.me.path, async (req, res) => {
      if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      res.json(user);
    });

    app.post(api.auth.logout.path, (req, res) => {
      req.session.destroy(() => {
        // Session is already invalidated server-side by destroy() above — this just clears
        // the now-meaningless cookie from the browser too, instead of leaving it to sit
        // until it naturally expires/gets overwritten.
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out" });
      });
    });

    // ── Password reset ────────────────────────────────────────────────────────────
    // Reuses the existing users table / getUserByEmail / updateUserProfile — no parallel
    // account system. See shared/schema.ts passwordResetCodes and storage.ts's
    // createPasswordResetCode/verifyPasswordResetCode/resetPasswordWithToken for the security
    // model (hashed codes, expiry, single-use, attempt limits, opaque second-phase token).
    const GENERIC_FORGOT_MESSAGE = "Si un compte existe avec cet email, un code de vérification a été envoyé.";

    app.post("/api/auth/forgot-password", forgotPasswordRateLimiter, async (req, res) => {
      try {
        const { email } = z.object({ email: z.string().email() }).parse(req.body);
        const user = await storage.getUserByEmail(email);
        // Always the same response whether or not the account exists — never lets a caller
        // distinguish a real account from an unknown email (account-enumeration protection).
        if (user) {
          const canSend = await storage.canRequestNewPasswordResetCode(user.id);
          if (canSend) {
            const code = await storage.createPasswordResetCode(user.id);
            await sendPasswordResetEmail(user.email, code);
          }
        }
        res.json({ message: GENERIC_FORGOT_MESSAGE });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: "Email invalide." });
        // A real SMTP failure now surfaces as EmailDeliveryError (see email.ts) instead of
        // being indistinguishable from success — log it loudly here so an operator can see
        // it, while the CLIENT still gets the exact same generic message either way (never
        // reveals whether the account exists or whether delivery actually happened).
        if (err instanceof EmailDeliveryError) {
          console.error("[auth:forgot-password] Email delivery failed:", err.message, err.cause instanceof Error ? err.cause.message : err.cause);
        }
        res.status(200).json({ message: GENERIC_FORGOT_MESSAGE });
      }
    });

    app.post("/api/auth/verify-reset-code", verifyResetCodeRateLimiter, async (req, res) => {
      try {
        const { email, code } = z.object({ email: z.string().email(), code: z.string().min(1) }).parse(req.body);
        const user = await storage.getUserByEmail(email);
        if (!user) return res.status(400).json({ message: "Code invalide.", reason: "invalid" });
        const result = await storage.verifyPasswordResetCode(user.id, code);
        if (!result.ok) {
          const messages: Record<string, string> = {
            invalid: "Code invalide.",
            expired: "Ce code a expiré. Veuillez en demander un nouveau.",
            too_many_attempts: "Trop de tentatives. Veuillez demander un nouveau code.",
          };
          return res.status(400).json({ message: messages[result.reason], reason: result.reason });
        }
        res.json({ resetToken: result.resetToken });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: "Requête invalide." });
        res.status(500).json({ message: "Erreur serveur." });
      }
    });

    app.post("/api/auth/reset-password", resetPasswordRateLimiter, async (req, res) => {
      try {
        const { resetToken, newPassword, confirmPassword } = z.object({
          resetToken: z.string().min(1),
          // Complexity/length validated separately below with the currently
          // configured passwordMinLength — see buildRegistrationPasswordSchema.
          newPassword: z.string().min(1),
          confirmPassword: z.string().min(1),
        }).parse(req.body);
        if (newPassword !== confirmPassword) {
          return res.status(400).json({ message: "Les mots de passe ne correspondent pas." });
        }
        const { passwordMinLength } = await storage.getLoginSecuritySettings();
        const passwordCheck = buildRegistrationPasswordSchema(passwordMinLength).safeParse(newPassword);
        if (!passwordCheck.success) return res.status(400).json({ message: passwordCheck.error.errors[0].message });
        const success = await storage.resetPasswordWithToken(resetToken, newPassword);
        if (!success) {
          return res.status(400).json({ message: "Ce lien de réinitialisation a expiré ou a déjà été utilisé. Veuillez recommencer." });
        }
        res.json({ message: "Mot de passe réinitialisé avec succès." });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Erreur serveur." });
      }
    });

    app.patch('/api/auth/me/billing', requireAuth, async (req, res) => {
      try {
        const billing = req.body;
        const user = await storage.updateUserBilling(req.session.userId!, billing);
        res.json(user);
      } catch (err) {
        res.status(500).json({ message: "Failed to update billing info" });
      }
    });

    app.patch('/api/auth/me/profile', requireAuth, async (req, res) => {
      try {
        const { name, phone, isWhatsapp, profileImageUrl, coverImageUrl, flashImageUrl, locationDetails, password, currentPassword } = req.body;
        const updates: { name?: string; phone?: string; isWhatsapp?: boolean; profileImageUrl?: string | null; coverImageUrl?: string | null; flashImageUrl?: string | null; locationDetails?: import("@shared/schema").AddressDetails | null; password?: string } = {};
        if (name !== undefined) updates.name = name;
        if (phone !== undefined) updates.phone = phone;
        if (isWhatsapp !== undefined) updates.isWhatsapp = !!isWhatsapp;
        if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl?.trim() || null;
        if (coverImageUrl !== undefined) updates.coverImageUrl = coverImageUrl?.trim() || null;
        if (flashImageUrl !== undefined) updates.flashImageUrl = flashImageUrl?.trim() || null;
        // Owner-editable address DETAILS only (street/building/postal code/…) — never
        // lat/lng/the geocoded address string, which stay exclusively Admin-authoritative
        // via the existing map-based LocationPickerModal (PATCH /api/auth/me/location,
        // untouched by this route). See account-address-card.tsx.
        if (locationDetails !== undefined) updates.locationDetails = locationDetails ?? null;
        if (password) {
          if (!currentPassword) return res.status(400).json({ message: "Current password required" });
          const existing = await storage.getUser(req.session.userId!);
          if (!existing || !(await storage.verifyPassword(existing.id, currentPassword, existing.password))) {
            return res.status(400).json({ message: "Current password is incorrect" });
          }
          const { passwordMinLength } = await storage.getLoginSecuritySettings();
          if (!isValidRegistrationPassword(password, passwordMinLength)) return res.status(400).json({ message: registrationPasswordMessage(passwordMinLength) });
          updates.password = await storage.hashPassword(password);
        }
        const user = await storage.updateUserProfile(req.session.userId!, updates);
        broadcastToUsers([req.session.userId!], "user_profile_updated");
        broadcast("admin_user_directory_changed");
        res.json(user);
      } catch (err) {
        res.status(500).json({ message: "Failed to update profile" });
      }
    });

    app.patch('/api/auth/me/location', requireAuth, async (req, res) => {
      try {
        const { address, lat, lng, placeId, details } = req.body;
        if (!address || !lat || !lng) return res.status(400).json({ message: "address, lat and lng are required" });
        const user = await storage.updateUserLocation(req.session.userId!, {
          address: String(address),
          lat: String(lat),
          lng: String(lng),
          placeId: String(placeId ?? ""),
          details: details ?? undefined,
        });
        broadcastToUsers([req.session.userId!], "user_profile_updated");
        broadcast("admin_user_directory_changed");
        res.json(user);
      } catch (err) {
        res.status(500).json({ message: "Failed to update location" });
      }
    });
}
