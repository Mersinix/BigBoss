import { storage } from "../storage";
import { requireAdmin } from "./shared/middleware";
import { broadcast } from "../ws";
import { z } from "zod";
import { isGoogleConfigured, isFacebookConfigured } from "../oauth";
import type { Express } from "express";

export function registerPlatformSettingsRoutes(app: Express): void {
    // ── System Management (platform service visibility) ────────────────────────

    app.get("/api/system-services", async (_req, res) => {
      try {
        const states = await storage.getServiceStates();
        res.json(states);
      } catch (err) {
        res.status(500).json({ message: "Failed to load service states" });
      }
    });

    app.patch("/api/admin/system-services/:service", requireAdmin, async (req, res) => {
      try {
        const service = req.params.service as string;
        const VALID_SERVICES = ['PRINTING', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE'];
        const VALID_STATES = ['VISIBLE', 'HIDDEN', 'COMING_SOON'];
        if (!VALID_SERVICES.includes(service)) return res.status(400).json({ message: "Invalid service" });
        const { state } = req.body;
        if (!VALID_STATES.includes(state)) return res.status(400).json({ message: "Invalid state" });
        const states = await storage.setServiceState(service as any, state);
        broadcast("system_services_updated", states);
        res.json(states);
      } catch (err) {
        res.status(500).json({ message: "Failed to update service state" });
      }
    });

    // ── Hero action settings (Fast Search / Report icon visibility per service) ──
    app.get("/api/hero-actions", async (_req, res) => {
      try {
        res.json(await storage.getHeroActionSettings());
      } catch { res.status(500).json({ message: "Failed to load hero action settings" }); }
    });

    app.patch("/api/admin/hero-actions/:service", requireAdmin, async (req, res) => {
      try {
        const service = req.params.service as string;
        const VALID_SERVICES = ['SHOP', 'BARISTA', 'ACADEMY', 'MAINTENANCE', 'PRINT', 'MARKETING'];
        if (!VALID_SERVICES.includes(service)) return res.status(400).json({ message: "Invalid service" });
        const { fastSearchEnabled, reportEnabled } = z.object({
          fastSearchEnabled: z.boolean().optional(),
          reportEnabled: z.boolean().optional(),
        }).parse(req.body);
        const settings = await storage.setHeroActionSettings(service as any, { fastSearchEnabled, reportEnabled });
        broadcast("hero_actions_updated", settings);
        res.json(settings);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update hero action settings" });
      }
    });

    // ── Service hero visual customization (background/gradient/subtitle/height/alignment/info-row per service) ──
    app.get("/api/service-hero-config", async (_req, res) => {
      try {
        res.json(await storage.getServiceHeroConfigs());
      } catch { res.status(500).json({ message: "Failed to load service hero config" }); }
    });

    app.patch("/api/admin/service-hero-config/:service", requireAdmin, async (req, res) => {
      try {
        const service = req.params.service as string;
        const VALID_SERVICES = ['SHOP', 'BARISTA', 'ACADEMY', 'MAINTENANCE', 'PRINT', 'MARKETING'];
        if (!VALID_SERVICES.includes(service)) return res.status(400).json({ message: "Invalid service" });
        const body = z.object({
          backgroundImages: z.array(z.string().trim().max(1000)).max(8).optional(),
          rotationIntervalSeconds: z.number().int().min(2).max(60).optional(),
          gradientEnabled: z.boolean().optional(),
          gradientFrom: z.string().trim().max(32).optional(),
          gradientVia: z.string().trim().max(32).optional(),
          gradientTo: z.string().trim().max(32).optional(),
          gradientDirection: z.string().trim().max(32).optional(),
          subtitle: z.string().trim().max(240).nullable().optional(),
          subtitleEnabled: z.boolean().optional(),
          subtitleColorLight: z.string().trim().regex(/^(#[0-9a-fA-F]{6})?$/, "Couleur invalide").optional(),
          subtitleColorDark: z.string().trim().regex(/^(#[0-9a-fA-F]{6})?$/, "Couleur invalide").optional(),
          height: z.enum(["compact", "medium", "large"]).optional(),
          horizontalAlign: z.enum(["left", "center", "right"]).optional(),
          verticalAlign: z.enum(["top", "center", "bottom"]).optional(),
          infoRowEnabled: z.boolean().optional(),
          overlayEnabled: z.boolean().optional(),
          overlayColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide").optional(),
          overlayOpacity: z.number().int().min(0).max(100).optional(),
        }).parse(req.body);
        const settings = await storage.setServiceHeroConfig(service as any, body);
        broadcast("service_hero_config_updated", settings);
        res.json(settings);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update service hero config" });
      }
    });

    // ── Dark mode toggle visibility per service account (System Management) ──
    app.get("/api/account-dark-mode-settings", async (_req, res) => {
      try {
        res.json(await storage.getAccountDarkModeSettings());
      } catch { res.status(500).json({ message: "Failed to load dark mode settings" }); }
    });

    app.patch("/api/admin/account-dark-mode-settings/:account", requireAdmin, async (req, res) => {
      try {
        const account = req.params.account as string;
        const VALID_ACCOUNTS = ['BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'DELIVERY_COMPANY', 'DRIVER', 'PRINTER', 'MAINTENANCE', 'MARKETING', 'SUPPLIER', 'ADMIN'];
        if (!VALID_ACCOUNTS.includes(account)) return res.status(400).json({ message: "Invalid account" });
        const { mode } = z.object({ mode: z.enum(['BOTH', 'DARK_ONLY', 'LIGHT_ONLY']) }).parse(req.body);
        const settings = await storage.setAccountDarkModeSetting(account as any, mode);
        broadcast("account_dark_mode_settings_updated", settings);
        res.json(settings);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update dark mode settings" });
      }
    });

    app.get("/api/system-service-order", async (_req, res) => {
      try {
        res.json(await storage.getServiceOrder());
      } catch {
        res.status(500).json({ message: "Failed to load service order" });
      }
    });

    app.patch("/api/admin/system-service-order", requireAdmin, async (req, res) => {
      try {
        const order = z.array(z.enum(['SHOP', 'MAINTENANCE', 'PRINT', 'BARISTA_MARKETPLACE', 'BARISTA_ACADEMY', 'MARKETING'])).parse(req.body?.order);
        const saved = await storage.setServiceOrder(order as any);
        broadcast("system_services_updated", { serviceOrder: saved });
        res.json(saved);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid service order" });
        res.status(500).json({ message: "Failed to update service order" });
      }
    });

    // ── Google/Facebook sign-in controls ───────────────────────────────────────
    // Public GET returns AVAILABILITY (enabled AND configured collapsed into one boolean) —
    // never the raw admin toggle, never whether env credentials exist, so the Connexion
    // modal can decide what to show without ever learning server configuration state.
    app.get("/api/auth-provider-settings", async (_req, res) => {
      try {
        const settings = await storage.getAuthProviderSettings();
        res.json({
          googleAvailable: settings.googleEnabled && isGoogleConfigured(),
          facebookAvailable: settings.facebookEnabled && isFacebookConfigured(),
        });
      } catch {
        res.status(500).json({ message: "Failed to load auth provider settings" });
      }
    });

    // Admin GET additionally exposes the raw toggle + whether credentials are actually
    // configured, so System Management can show "Enabled but not configured" distinctly
    // from "Disabled" — never the credential values themselves.
    app.get("/api/admin/auth-provider-settings", requireAdmin, async (_req, res) => {
      try {
        const settings = await storage.getAuthProviderSettings();
        res.json({
          ...settings,
          googleConfigured: isGoogleConfigured(),
          facebookConfigured: isFacebookConfigured(),
        });
      } catch {
        res.status(500).json({ message: "Failed to load auth provider settings" });
      }
    });

    app.patch("/api/admin/auth-provider-settings", requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          googleEnabled: z.boolean().optional(),
          facebookEnabled: z.boolean().optional(),
        }).strict().parse(req.body);
        const settings = await storage.updateAuthProviderSettings(body);
        broadcast("auth_provider_settings_updated", settings);
        res.json({ ...settings, googleConfigured: isGoogleConfigured(), facebookConfigured: isFacebookConfigured() });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid auth provider settings" });
        res.status(500).json({ message: "Failed to update auth provider settings" });
      }
    });

    // ── Authentication & Security Settings ──────────────────────────────────────
    // Admin-only (task: "Expand Global Authentication & Security Settings" —
    // expands the original cooldown-only setting into a centralized panel: failed-
    // login lockout, login rate limiting, password policy, session timeout). The
    // login route itself reads storage.getLoginSecuritySettings() fresh on every
    // request — the pre-login public Connexion modal never needs to know the
    // configured policy in advance, only the actual remaining seconds a real 429
    // response already carries (retryAfterSeconds).
    app.get("/api/admin/login-security-settings", requireAdmin, async (_req, res) => {
      try {
        res.json(await storage.getLoginSecuritySettings());
      } catch {
        res.status(500).json({ message: "Failed to load login security settings" });
      }
    });

    app.patch("/api/admin/login-security-settings", requireAdmin, async (req, res) => {
      try {
        // Every field optional (partial update — omitted fields keep their current
        // persisted value, enforced by storage.updateLoginSecuritySettings's
        // existing {...current, ...updates} merge). Explicit, reasonable ranges
        // per field per the task's validation requirement.
        const body = z.object({
          lockoutEnabled: z.boolean(),
          maxFailedAttempts: z.number().int().min(1, "Doit être un entier positif").max(20, "Maximum 20 tentatives"),
          cooldownSeconds: z.number().int().min(1, "Doit être un entier positif").max(3600, "Maximum 3600 secondes"),
          rateLimitEnabled: z.boolean(),
          rateLimitMaxRequests: z.number().int().min(1, "Doit être un entier positif").max(1000, "Maximum 1000 requêtes"),
          rateLimitWindowSeconds: z.number().int().min(1, "Doit être un entier positif").max(86400, "Maximum 86400 secondes (24h)"),
          passwordMinLength: z.number().int().min(6, "Minimum 6 caractères").max(64, "Maximum 64 caractères"),
          sessionInactivityTimeoutSeconds: z.number().int().min(60, "Minimum 60 secondes").max(2592000, "Maximum 2592000 secondes (30 jours)").nullable(),
        }).partial().strict().parse(req.body);
        const settings = await storage.updateLoginSecuritySettings(body);
        broadcast("login_security_settings_updated", settings);
        console.info(`[security] Admin ${req.session.userId} updated login security settings: ${JSON.stringify(body)}`);
        res.json(settings);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Failed to update login security settings" });
      }
    });

    // ── Currency ─────────────────────────────────────────────────────────────

    app.get("/api/system-currency", async (_req, res) => {
      try {
        const symbol = await storage.getCurrency();
        res.json({ symbol });
      } catch { res.status(500).json({ message: "Failed to load currency" }); }
    });

    app.patch("/api/admin/system-currency", requireAdmin, async (req, res) => {
      try {
        const { symbol } = req.body;
        const VALID = ['DT', 'د.ت', '$', '€', '£', 'AED', 'SAR', 'MAD', 'DZD', '¥', '₹', 'CHF', 'CAD', 'AUD'];
        if (!symbol || !VALID.includes(symbol)) return res.status(400).json({ message: "Invalid currency symbol" });
        const saved = await storage.setCurrency(symbol);
        broadcast("currency_updated", { symbol: saved });
        res.json({ symbol: saved });
      } catch { res.status(500).json({ message: "Failed to update currency" }); }
    });

    // ── Landing Page Config ───────────────────────────────────────────────────

    app.get("/api/landing-config", async (_req, res) => {
      try {
        const config = await storage.getLandingConfig();
        res.json(config);
      } catch (err) {
        res.status(500).json({ message: "Failed to load landing config" });
      }
    });

    app.patch("/api/admin/landing-config", requireAdmin, async (req, res) => {
      try {
        const config = await storage.updateLandingConfig(req.body);
        broadcast("landing_config_updated", config);
        res.json(config);
      } catch (err) {
        res.status(500).json({ message: "Failed to update landing config" });
      }
    });
}
