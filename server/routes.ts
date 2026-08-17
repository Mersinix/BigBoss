import type { Express } from "express";
import { createServer, type Server } from "http";
import { broadcast, broadcastToUsers } from "./ws";
import { storage } from "./storage";
import {
  geocodeAddress,
  generateGrid,
  fetchAllNearbyPages,
  fetchPlaceDetails,
  extractAddressComponents,
  calculateDistanceKm,
  calculateProspectScore,
  withConcurrency,
  type NearbyPlace,
} from "./prospecting-engine";
import { api } from "@shared/routes";
import { z } from "zod";
import { sessionMiddleware } from "./session";
import { db } from "./db";
import {
  users, categories, subCategories, flavors, sizes, brands, products, supplierProductListings, supplierCategories, supplierSubCategories,
  insertCategorySchema, insertSubCategorySchema, insertFlavorSchema,
  insertSizeSchema, insertBrandSchema,
  type MarketplaceProduct,
  supplierProductReviews, supplierStores, packs, packItems as packItemsTable, subOrders,
  orders, orderItems,
  supplierProductVariants,
  type InventoryFilters, type InventorySort,
} from "@shared/schema";
import { eq, and, inArray, desc } from "drizzle-orm";

declare module "express-session" {
  interface SessionData { userId: number; }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(sessionMiddleware);

  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
    next();
  };

  const requireAdmin = async (req: any, res: any, next: any) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
    const user = await storage.getUser(req.session.userId);
    if (!user || !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };

  const requireApprovedCafeOwner = async (req: any, res: any, next: any) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== 'CAFE_OWNER' || user.status !== 'approved') {
      return res.status(403).json({ message: 'Only approved cafe owners can perform this action' });
    }
    next();
  };

  const requireApprovedSupplier = async (req: any, res: any, next: any) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== 'SUPPLIER' || user.status !== 'approved') {
      return res.status(403).json({ message: 'Only approved suppliers can perform this action' });
    }
    next();
  };

  const requireApprovedDeliveryCompany = async (req: any, res: any, next: any) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== 'DELIVERY_COMPANY' || user.status !== 'approved') {
      return res.status(403).json({ message: 'Only approved delivery companies can perform this action' });
    }
    (req as any).deliveryCompany = user;
    next();
  };

  const requireDriver = async (req: any, res: any, next: any) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== 'DRIVER' || user.status !== 'approved') {
      return res.status(403).json({ message: 'Only drivers can perform this action' });
    }
    (req as any).driver = user;
    next();
  };

  async function hasCommercialAccess(req: any): Promise<boolean> {
    if (!req.session?.userId) return false;
    const u = await storage.getUser(req.session.userId);
    if (!u) return false;
    if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(u.role)) return true;
    return u.role === 'CAFE_OWNER' && u.status === 'approved';
  }

  function stripCommercialData(p: MarketplaceProduct): any {
    const { listings, bestPrice, ...pub } = p as any;
    return { ...pub, listings: [], bestPrice: null, supplierCount: 0 };
  }

  // NOTE: DRIVER/DELIVERY_COMPANY intentionally have no branch here. Delivery-stage status
  // changes (READY→IN_DELIVERY→DELIVERED) are no longer made through this endpoint — they go
  // through PATCH /api/deliveries/:id/status, which is ownership-checked against the
  // deliveries table (see storage.updateDeliveryStatus) and propagates back into sub_orders/
  // orders via the shared aggregation logic. Routing delivery roles through here previously
  // let any driver/delivery company mutate any order in READY/IN_DELIVERY state — see
  // SHOP_DELIVERY_SYNCHRONIZATION_ANALYSIS.md §9.4.
  function canUpdateOrderStatus(user: { id: number; role: string }, order: any, newStatus: string): boolean {
    // Admin has read-only access to orders; status management is Supplier-only
    if (user.role === 'CAFE_OWNER') {
      return order.cafeId === user.id && newStatus === 'CANCELLED' && order.status === 'PENDING';
    }
    if (user.role === 'SUPPLIER') {
      const involved = order.supplierId === user.id || order.subOrders?.some((so: any) => so.supplierId === user.id);
      if (!involved) return false;
      return ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'CANCELLED'].includes(newStatus);
    }
    return false;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  const registerBodySchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum(['CAFE_OWNER', 'SUPPLIER', 'DELIVERY_COMPANY', 'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE']).optional(),
    phone: z.string().optional().nullable(),
    governorates: z.array(z.string()).optional().nullable(),
    printCategories: z.array(z.string()).optional().nullable(),
    marketingCategories: z.array(z.string()).optional().nullable(),
    maintenanceCategories: z.array(z.string()).optional().nullable(),
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

  app.post(api.auth.register.path, async (req, res) => {
    try {
      const parsed = registerBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const body = parsed.data;
      // All new registrations (non-admin-created) start as pending
      const PENDING_ROLES = ['CAFE_OWNER', 'SUPPLIER', 'DELIVERY_COMPANY', 'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE'];
      const LOCATION_REQUIRED_ROLES = ['CAFE_OWNER', 'SUPPLIER', 'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE'];
      const role = body.role ?? 'CAFE_OWNER';
      if (LOCATION_REQUIRED_ROLES.includes(role) && (!body.locationAddress || !body.locationLat || !body.locationLng)) {
        return res.status(400).json({ message: "Location is required for this role. Please pick your address on the map." });
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
      req.session.userId = user.id;
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email/phone and password required" });
      // Try email first, then phone
      let user = await storage.getUserByEmail(email);
      if (!user) user = await storage.getUserByPhone(email);
      if (!user || user.password !== password) return res.status(401).json({ message: "Invalid credentials" });
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
    req.session.destroy(() => res.json({ message: "Logged out" }));
  });

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
      const VALID_SERVICES = ['PRINTING', 'MARKETING', 'BARISTA', 'MAINTENANCE'];
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

  app.get("/api/system-service-order", async (_req, res) => {
    try {
      res.json(await storage.getServiceOrder());
    } catch {
      res.status(500).json({ message: "Failed to load service order" });
    }
  });

  app.patch("/api/admin/system-service-order", requireAdmin, async (req, res) => {
    try {
      const order = z.array(z.enum(['SHOP', 'PRINT', 'BARISTA', 'MARKETING', 'MAINTENANCE'])).parse(req.body?.order);
      const saved = await storage.setServiceOrder(order as any);
      broadcast("system_services_updated", { serviceOrder: saved });
      res.json(saved);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid service order" });
      res.status(500).json({ message: "Failed to update service order" });
    }
  });

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
      const { name, phone, password, currentPassword } = req.body;
      const updates: { name?: string; phone?: string; password?: string } = {};
      if (name !== undefined) updates.name = name;
      if (phone !== undefined) updates.phone = phone;
      if (password) {
        if (!currentPassword) return res.status(400).json({ message: "Current password required" });
        const existing = await storage.getUser(req.session.userId!);
        if (!existing || existing.password !== currentPassword) {
          return res.status(400).json({ message: "Current password is incorrect" });
        }
        if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
        updates.password = password;
      }
      const user = await storage.updateUserProfile(req.session.userId!, updates);
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
      res.json(user);
    } catch (err) {
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  // ── Maintenance marketplace/profile/reservations ─────────────────────────

  app.get("/api/maintenance/profiles", async (req: any, res) => {
    try {
      const available = req.query.available === undefined
        ? undefined
        : req.query.available === "true";
      res.json(await storage.getMaintenanceProfiles({
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        category: typeof req.query.category === "string" ? req.query.category : undefined,
        profileType: typeof req.query.profileType === "string" ? req.query.profileType : undefined,
        available,
        location: typeof req.query.location === "string" ? req.query.location : undefined,
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
    if (!viewer || (viewer.id !== targetUserId && !["ADMIN", "SUPER_ADMIN"].includes(viewer.role))) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const target = await storage.getUser(targetUserId);
    if (!target || target.role !== "MAINTENANCE") return res.status(404).json({ message: "Not found" });
    res.json({ user: target, profile: await storage.getMaintenanceProfile(targetUserId) });
  });

  app.patch("/api/maintenance/profile", requireAuth, async (req: any, res) => {
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
    const body = z.object({
      jobTitle: z.string().optional(),
      profileType: z.string().optional(),
      categories: z.array(z.string()).optional(),
      skills: z.array(z.string()).optional(),
      certifications: z.array(z.string()).optional(),
      yearsExperience: z.number().int().min(0).optional(),
      responseTime: z.string().optional(),
      dailyRateInCents: z.number().int().min(0).optional(),
      description: z.string().optional(),
      portfolioImages: z.array(z.string()).optional(),
      coverageArea: z.string().optional(),
      marketplaceVisible: z.boolean().optional(),
    }).parse(req.body);
    const profile = await storage.upsertMaintenanceProfile(user.id, body);
    broadcast("maintenance_updated", { userId: user.id, kind: "profile" });
    res.json(profile);
  });

  app.patch("/api/maintenance/availability", requireAuth, async (req: any, res) => {
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "MAINTENANCE") return res.status(403).json({ message: "Maintenance access required" });
    const body = z.object({
      workingDays: z.array(z.string()),
      startTime: z.string(),
      endTime: z.string(),
      isAvailable: z.boolean().optional(),
      isOnVacation: z.boolean(),
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
    res.json(updated);
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
      const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body);
      const item = await storage.createMaintenanceCompetency(name);
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

  // ── Favorites (shop/product favorites, persisted per-user) ─────────────────

  app.get('/api/favorites', requireAuth, async (req: any, res) => {
    const favorites = await storage.getFavoritesByUser(req.session.userId);
    res.json(favorites);
  });

  app.post('/api/favorites', requireAuth, async (req: any, res) => {
    const productId = Number(req.body?.productId);
    if (!productId) return res.status(400).json({ message: 'productId is required' });
    await storage.addFavorite(req.session.userId, productId);
    res.status(201).json({ ok: true });
  });

  app.delete('/api/favorites/:productId', requireAuth, async (req: any, res) => {
    const productId = Number(req.params.productId);
    if (!productId) return res.status(400).json({ message: 'Invalid productId' });
    await storage.removeFavorite(req.session.userId, productId);
    res.json({ ok: true });
  });

  // ── Store favorites (persisted per-user, kept separate from product favorites) ──

  app.get('/api/store-favorites', requireAuth, async (req: any, res) => {
    const ids = await storage.getStoreFavoritesByUser(req.session.userId);
    res.json(ids);
  });

  app.post('/api/store-favorites', requireAuth, async (req: any, res) => {
    const storeId = Number(req.body?.storeId);
    if (!storeId) return res.status(400).json({ message: 'storeId is required' });
    await storage.addStoreFavorite(req.session.userId, storeId);
    res.status(201).json({ ok: true });
  });

  app.delete('/api/store-favorites/:storeId', requireAuth, async (req: any, res) => {
    const storeId = Number(req.params.storeId);
    if (!storeId) return res.status(400).json({ message: 'Invalid storeId' });
    await storage.removeStoreFavorite(req.session.userId, storeId);
    res.json({ ok: true });
  });

  // ── Pack favorites (persisted per-user, mirrors product favorites) ──────────

  app.get('/api/pack-favorites', requireAuth, async (req: any, res) => {
    const ids = await storage.getPackFavoritesByUser(req.session.userId);
    res.json(ids);
  });

  app.post('/api/pack-favorites', requireAuth, async (req: any, res) => {
    const packId = Number(req.body?.packId);
    if (!packId) return res.status(400).json({ message: 'packId is required' });
    await storage.addPackFavorite(req.session.userId, packId);
    res.status(201).json({ ok: true });
  });

  app.delete('/api/pack-favorites/:packId', requireAuth, async (req: any, res) => {
    const packId = Number(req.params.packId);
    if (!packId) return res.status(400).json({ message: 'Invalid packId' });
    await storage.removePackFavorite(req.session.userId, packId);
    res.json({ ok: true });
  });

  app.get(api.products.list.path, requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(user.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const prods = await storage.getProducts({
        category: req.query.category as string | undefined,
        search: req.query.search as string | undefined,
        supplierId: user.role === 'SUPPLIER' ? user.id : (req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined),
      });
      res.json(prods);
    } catch (e) {
      res.status(500).json({ message: "Error fetching products" });
    }
  });

  app.get(api.products.get.path, requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const product = await storage.getProduct(parseInt(req.params.id));
    if (!product) return res.status(404).json({ message: "Not found" });
    if (user.role === 'SUPPLIER' && product.supplierId !== user.id && product.createdByUserId !== user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.json(product);
  });

  app.post(api.products.create.path, requireAdmin, async (req, res) => {
    try {
      const product = await storage.createProduct(req.body);
      broadcast("product_updated", { productId: product.id });
      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ message: "Error" });
    }
  });

  app.put(api.products.update.path, requireAdmin, async (req, res) => {
    try {
      const product = await storage.updateProduct(parseInt(req.params.id), req.body);
      broadcast("product_updated", { productId: parseInt(req.params.id) });
      res.json(product);
    } catch (err) {
      res.status(400).json({ message: "Invalid" });
    }
  });

  app.delete(api.products.delete.path, requireAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      await storage.deleteProduct(productId);
      broadcast("product_updated", { productId });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Error" });
    }
  });

  // ── Admin Products ─────────────────────────────────────────────────────────

  app.get("/api/admin/products", requireAdmin, async (req, res) => {
    try {
      const filters = {
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
        subCategoryId: req.query.subCategoryId ? parseInt(req.query.subCategoryId as string) : undefined,
        flavorId: req.query.flavorId ? parseInt(req.query.flavorId as string) : undefined,
        sizeId: req.query.sizeId ? parseInt(req.query.sizeId as string) : undefined,
        brandId: req.query.brandId ? parseInt(req.query.brandId as string) : undefined,
        search: req.query.search as string | undefined,
      };
      res.json(await storage.getAdminProducts(filters));
    } catch (e) {
      res.status(500).json({ message: "Error" });
    }
  });

  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!req.body.name?.trim()) return res.status(400).json({ message: "Name is required" });
      const product = await storage.createProduct({
        name: req.body.name.trim(),
        description: req.body.description?.trim() || null,
        imageUrl: req.body.imageUrl?.trim() || null,
        imageUrls: Array.isArray(req.body.imageUrls) ? req.body.imageUrls.filter((u: string) => u?.trim()) : null,
        category: req.body.category || "",
        categoryId: req.body.categoryId ? parseInt(req.body.categoryId) : null,
        subCategoryId: req.body.subCategoryId ? parseInt(req.body.subCategoryId) : null,
        flavorId: req.body.flavorId ? parseInt(req.body.flavorId) : null,
        sizeId: req.body.sizeId ? parseInt(req.body.sizeId) : null,
        brandId: req.body.brandId ? parseInt(req.body.brandId) : null,
        flavorIds: Array.isArray(req.body.flavorIds) ? req.body.flavorIds.map(Number) : null,
        sizeIds: Array.isArray(req.body.sizeIds) ? req.body.sizeIds.map(Number) : null,
        price: 0,
        stock: 0,
        supplierId: null,
        isAdminProduct: true,
      });
      broadcast("product_updated", { productId: product.id });
      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ message: "Error creating product" });
    }
  });

  app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.imageUrl !== undefined) updates.imageUrl = req.body.imageUrl;
      if (req.body.category !== undefined) updates.category = req.body.category;
      if (req.body.categoryId !== undefined) updates.categoryId = req.body.categoryId ? parseInt(req.body.categoryId) : null;
      if (req.body.subCategoryId !== undefined) updates.subCategoryId = req.body.subCategoryId ? parseInt(req.body.subCategoryId) : null;
      if (req.body.flavorId !== undefined) updates.flavorId = req.body.flavorId ? parseInt(req.body.flavorId) : null;
      if (req.body.sizeId !== undefined) updates.sizeId = req.body.sizeId ? parseInt(req.body.sizeId) : null;
      if (req.body.brandId !== undefined) updates.brandId = req.body.brandId ? parseInt(req.body.brandId) : null;
      if (req.body.flavorIds !== undefined) updates.flavorIds = Array.isArray(req.body.flavorIds) ? req.body.flavorIds.map(Number) : null;
      if (req.body.sizeIds !== undefined) updates.sizeIds = Array.isArray(req.body.sizeIds) ? req.body.sizeIds.map(Number) : null;
      if (req.body.imageUrls !== undefined) updates.imageUrls = Array.isArray(req.body.imageUrls) ? req.body.imageUrls.filter((u: string) => u?.trim()) : null;
      if (req.body.status !== undefined) {
        const ALLOWED_STATUSES = ['ACTIVE', 'INACTIVE', 'PENDING', 'FREEZE'];
        if (!ALLOWED_STATUSES.includes(req.body.status)) return res.status(400).json({ message: "Invalid status" });
        updates.status = req.body.status;
      }
      const product = await storage.updateProduct(parseInt(req.params.id), updates);
      broadcast("product_updated", { productId: parseInt(req.params.id) });
      res.json(product);
    } catch (err) {
      res.status(400).json({ message: "Invalid" });
    }
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      await storage.deleteProduct(productId);
      broadcast("product_updated", { productId });
      res.json({ message: "Deleted" });
    } catch (err) {
      res.status(500).json({ message: "Error" });
    }
  });

  // ── Admin supplier-product review queue ─────────────────────────────────────

  app.get("/api/admin/supplier-products", requireAdmin, async (req, res) => {
    try {
      res.json(await storage.getAdminSupplierProducts());
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/supplier-products/:id/approve", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const product = await storage.approveSupplierProduct(parseInt(req.params.id), user!.id);
      broadcast("product_updated", { productId: parseInt(req.params.id) });
      res.json(product);
    } catch { res.status(500).json({ message: "Error approving product" }); }
  });

  app.patch("/api/admin/supplier-products/:id", requireAdmin, async (req, res) => {
    try {
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.imageUrl !== undefined) updates.imageUrl = req.body.imageUrl;
      if (req.body.category !== undefined) updates.category = req.body.category;
      if (req.body.categoryId !== undefined) updates.categoryId = req.body.categoryId ? parseInt(req.body.categoryId) : null;
      if (req.body.subCategoryId !== undefined) updates.subCategoryId = req.body.subCategoryId ? parseInt(req.body.subCategoryId) : null;
      if (req.body.flavorId !== undefined) updates.flavorId = req.body.flavorId ? parseInt(req.body.flavorId) : null;
      if (req.body.sizeId !== undefined) updates.sizeId = req.body.sizeId ? parseInt(req.body.sizeId) : null;
      if (req.body.brandId !== undefined) updates.brandId = req.body.brandId ? parseInt(req.body.brandId) : null;
      if (req.body.flavorIds !== undefined) updates.flavorIds = Array.isArray(req.body.flavorIds) ? req.body.flavorIds.map(Number) : null;
      if (req.body.sizeIds !== undefined) updates.sizeIds = Array.isArray(req.body.sizeIds) ? req.body.sizeIds.map(Number) : null;
      const productId = parseInt(req.params.id);
      const product = await storage.updateProduct(productId, updates);
      broadcast("product_updated", { productId });
      res.json(product);
    } catch { res.status(400).json({ message: "Invalid" }); }
  });

  app.delete("/api/admin/supplier-products/:id", requireAdmin, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      await storage.deleteProduct(productId);
      broadcast("product_updated", { productId });
      res.json({ message: "Deleted" });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // ── Orders ─────────────────────────────────────────────────────────────────

  app.get(api.orders.list.path, requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      let filters: any = {};
      if (user?.role === 'CAFE_OWNER') filters.cafeId = user.id;
      if (user?.role === 'SUPPLIER') filters.supplierId = user.id;
      // Delivery roles are scoped by real deliveries rows, not order status — see
      // storage.getOrders(). DELIVERY_COMPANY previously had no branch here at all and
      // received every order in the system (SHOP_DELIVERY_SYNCHRONIZATION_ANALYSIS.md §9.1);
      // DRIVER's old filter (orders.deliveryId) was dead code (§9.2) since that column is
      // never written.
      if (user?.role === 'DRIVER') filters.driverId = user.id;
      if (user?.role === 'DELIVERY_COMPANY') filters.deliveryCompanyId = user.id;
      res.json(await storage.getOrders(filters));
    } catch (e) {
      res.status(500).json({ message: "Error fetching orders" });
    }
  });

  app.get(api.orders.get.path, requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    const orderId = parseInt(req.params.id);
    const canAccess = await storage.canUserAccessOrder(user.id, user.role, orderId);
    if (!canAccess) return res.status(403).json({ message: 'Forbidden' });
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ message: "Not found" });
    res.json(order);
  });

  app.post(api.orders.create.path, requireApprovedCafeOwner, async (req, res) => {
    try {
      const deliveryAddressSchema = z.object({
        address: z.string(),
        lat: z.string(),
        lng: z.string(),
        placeId: z.string().optional(),
        details: z.object({
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
        }).optional(),
      }).optional();

      const { items, packItems, deliveryAddress, deliveryMethod, paymentMethod, courierInstructions, priority, scheduledAt } = z.object({
        items: z.array(z.object({
          listingId: z.number(),
          productId: z.number(),
          supplierId: z.number(),
          supplierName: z.string().optional(),
          flavorId: z.number().nullable().optional(),
          sizeId: z.number().nullable().optional(),
          flavorName: z.string().nullable().optional(),
          sizeName: z.string().nullable().optional(),
          quantity: z.number().min(1),
          unitPrice: z.number().min(0).optional(),
        })).default([]),
        packItems: z.array(z.object({
          packId: z.number(),
          supplierId: z.number(),
          quantity: z.number().min(1),
          includedProducts: z.array(z.object({
            productId: z.number(),
            productName: z.string(),
            productImageUrl: z.string().nullable(),
            brandName: z.string().nullable(),
            categoryName: z.string().nullable(),
            subCategoryName: z.string().nullable(),
            flavorName: z.string().nullable(),
            sizeName: z.string().nullable(),
            quantity: z.number().min(1),
          })).optional(),
        })).optional(),
        deliveryAddress: deliveryAddressSchema,
        deliveryMethod: z.enum(["SELF_PICKUP", "DELIVERY_SERVICE"]).default("DELIVERY_SERVICE"),
        paymentMethod: z.enum(["CASH_ON_DELIVERY", "CREDIT_CARD", "MOBILE_PAYMENT", "BANK_TRANSFER"]).default("CASH_ON_DELIVERY"),
        courierInstructions: z.string().max(500).optional(),
        priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).optional(),
        scheduledAt: z.string().datetime().optional(),
      }).parse(req.body);

      if (paymentMethod !== "CASH_ON_DELIVERY") {
        return res.status(400).json({ message: "Only cash on delivery is currently available." });
      }
      if (deliveryMethod === "DELIVERY_SERVICE" && !deliveryAddress) {
        return res.status(400).json({ message: "A delivery address is required for delivery service." });
      }

      const validatedItems = await storage.resolveOrderItems(items);
      const validatedPackItems = packItems?.length ? await storage.resolvePackOrderItems(packItems) : [];
      if (!validatedItems.length && !validatedPackItems.length) {
        return res.status(400).json({ message: "No items in order" });
      }
      const normalizedDelivery = deliveryAddress ? {
        ...deliveryAddress,
        placeId: deliveryAddress.placeId ?? "",
      } : undefined;

      // ── Server-side promotion evaluation ──────────────────────────────────
      const cafeId = req.session.userId!;
      const itemsBySupplier = new Map<number, import('./promotions-engine').PromoCartItem[]>();
      for (const item of validatedItems) {
        if (!itemsBySupplier.has(item.supplierId)) itemsBySupplier.set(item.supplierId, []);
        itemsBySupplier.get(item.supplierId)!.push({
          listingId: item.listingId,
          productId: item.productId,
          categoryId: null, // resolved from product below if needed
          supplierId: item.supplierId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        });
      }
      const promoEval = validatedItems.length > 0
        ? await storage.evaluateCartPromotions(itemsBySupplier, cafeId)
        : { bySupplier: [], totalOriginal: 0, totalDiscount: 0, totalFinal: 0 };

      const order = await storage.createOrder(cafeId, validatedItems, {
        deliveryAddress: normalizedDelivery,
        deliveryMethod,
        paymentMethod,
        courierInstructions,
        packItems: validatedPackItems,
        promotionResults: promoEval.bySupplier,
        priority: priority ?? 'NORMAL',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      });

      // Record promotion usage for each applied promotion
      for (const result of promoEval.bySupplier) {
        if (result.promotionId && result.discountAmount > 0) {
          await storage.recordPromotionUsage(result.promotionId, cafeId, order.id, result.discountAmount);
        }
      }

      // Notify all involved suppliers about the new order
      const involvedSupplierIds = Array.from(new Set([...validatedItems.map(i => i.supplierId), ...(validatedPackItems ?? []).map(i => i.supplierId)]));
      await storage.refreshOrderMessagingState(order.id);
      broadcastToUsers(involvedSupplierIds, 'order_created', { orderId: order.id, cafeId });
      broadcastToUsers([cafeId, ...involvedSupplierIds], 'conversation_updated', { orderId: order.id, service: "SHOP" });
      broadcast('inventory_updated', { orderId: order.id });

      res.status(201).json({ ...order, promotionSavings: promoEval.totalDiscount });
    } catch (err: any) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else if (err?.message) res.status(400).json({ message: err.message });
      else res.status(500).json({ message: "Error creating order" });
    }
  });

  app.patch(api.orders.updateStatus.path, requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const orderId = parseInt(req.params.id);
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: 'Not found' });
      const input = api.orders.updateStatus.input.parse(req.body);
      if (!canUpdateOrderStatus(user, order, input.status)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const updated = await storage.updateOrderStatus(orderId, input.status, input.deliveryId);
      await storage.refreshOrderMessagingState(orderId);
      if (order.status !== 'CANCELLED' && input.status === 'CANCELLED') {
        broadcast("inventory_updated", { orderId });
      }
      // Notify cafe owner of status change in real time
      broadcastToUsers([order.cafeId], 'order_status_changed', { orderId, status: input.status });
      broadcast('order_status_changed', { orderId, status: input.status });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // ── SubOrder status update (Supplier) ────────────────────────────────────────

  app.patch('/api/suborders/:id/status', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      if (!['ADMIN', 'SUPER_ADMIN', 'SUPPLIER'].includes(user.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const subOrderId = parseInt(req.params.id);
      const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
      if (!subOrder) return res.status(404).json({ message: 'SubOrder not found' });
      if (user.role === 'SUPPLIER' && subOrder.supplierId !== user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      // Once a Delivery has taken a sub-order to DELIVERED (or it's CANCELLED), it's terminal
      // from this endpoint's perspective — no further supplier/admin edits here.
      if (['DELIVERED', 'CANCELLED'].includes(subOrder.status ?? '')) {
        return res.status(409).json({ message: `Sub-order is already ${subOrder.status} and cannot be changed` });
      }
      // IN_DELIVERY / DELIVERED are intentionally excluded here — those are now written only
      // by storage.updateDeliveryStatus() (via PATCH /api/deliveries/:id/status), the single
      // source of truth for the physical delivery lifecycle. Letting a supplier (or admin)
      // set them directly on the sub-order would create the exact "conflicting status writer"
      // the sync spec prohibits — a supplier could self-report a delivery that was never
      // created, accepted, or completed by an actual courier.
      const { status } = z.object({
        status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'CANCELLED']),
      }).parse(req.body);
      const becameReady = subOrder.status !== 'READY' && status === 'READY';
      const updated = await storage.updateSubOrderStatus(subOrderId, status);
      await storage.refreshOrderMessagingState(subOrder.orderId);

      // Shop → Delivery hand-off: the delivery is created PENDING here — not yet visible to
      // any Delivery Company (see storage.createDeliveryForSubOrder). Only the supplier is
      // notified that a dispatch decision is waiting; the company-wide notification happens
      // later, at PATCH /api/deliveries/:id/dispatch, only if the supplier chooses that mode.
      if (becameReady) {
        const created = await storage.getActiveDeliveryForSubOrder(subOrderId);
        if (created) {
          broadcastToUsers([subOrder.supplierId], 'delivery_created', { deliveryId: created.id, subOrderId, orderId: subOrder.orderId, status: created.status });
        }
      }
      // Notify cafe owner + supplier of suborder change
      const order = await storage.getOrder(subOrder.orderId);
      if (order) {
        // Targeted: cafe owner + supplier (for cart/UI updates specific to them)
        broadcastToUsers([order.cafeId, subOrder.supplierId], 'suborder_status_changed', {
          orderId: subOrder.orderId, subOrderId, status,
        });
        // Global: ensures Admin and all other connected clients (other browser tabs) also
        // invalidate their orders cache and see the status change in real time.
        broadcast('suborder_status_changed', {
          orderId: subOrder.orderId, subOrderId, status,
        });
      }
      // Broadcast inventory_updated so all Pack/product screens refresh stock in realtime
      const CONFIRMED_STATUSES = new Set(['CONFIRMED', 'APPROVED', 'PROCESSING', 'SHIPPED', 'DELIVERED']);
      if (CONFIRMED_STATUSES.has(status)) {
        broadcast('inventory_updated', { subOrderId, orderId: subOrder.orderId });
      }
      // When supplier rejects (CANCELLED), broadcast items back to the cafe owner so their cart
      // can be restored automatically without losing the product/variant details.
      if (status === 'CANCELLED' && order) {
        const cartItems = await storage.getSubOrderItemsForCartRestore(subOrderId);
        broadcastToUsers([order.cafeId], 'suborder_rejected', {
          orderId: subOrder.orderId,
          subOrderId,
          supplierName: subOrder.supplierName,
          regularItems: cartItems.regularItems,
          packItems: cartItems.packItems,
        });
        // Also restore pack.quantityAvailable and component stock for already-confirmed sub-orders
        broadcast('inventory_updated', { subOrderId, orderId: subOrder.orderId });
      }
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(400).json({ message: err.message ?? 'Invalid request' });
    }
  });

  // ── Deliveries ─────────────────────────────────────────────────────────────
  // Delivery-stage status changes (accept/assign/pickup/in-transit/delivered/cancel) go
  // through this namespace, not PATCH /api/orders/:id/status. See canUpdateOrderStatus above.

  app.get('/api/deliveries', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      res.json(await storage.getDeliveries(user.id, user.role));
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error fetching deliveries' });
    }
  });

  app.get('/api/deliveries/:id', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const deliveryId = parseInt(req.params.id);
      const canAccess = await storage.canUserAccessDelivery(user.id, user.role, deliveryId);
      if (!canAccess) return res.status(403).json({ message: 'Forbidden' });
      const delivery = await storage.getDelivery(deliveryId);
      if (!delivery) return res.status(404).json({ message: 'Not found' });
      res.json(delivery);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error fetching delivery' });
    }
  });

  // Manual/recovery creation — Admin only. Normal creation is automatic and idempotent
  // (storage.createDeliveryForSubOrder, invoked when a sub-order reaches READY). This exists
  // as an oversight tool for a stuck sub-order, and reuses the exact same idempotent method,
  // so it cannot bypass business rules (READY + DELIVERY_SERVICE) or create a duplicate.
  app.post('/api/deliveries', requireAdmin, async (req, res) => {
    try {
      const { subOrderId } = z.object({ subOrderId: z.number() }).parse(req.body);
      const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
      if (!subOrder) return res.status(404).json({ message: 'Sub-order not found' });
      if (subOrder.status !== 'READY') return res.status(400).json({ message: 'Sub-order is not READY' });
      const created = await storage.createDeliveryForSubOrder(subOrderId);
      if (!created) return res.status(409).json({ message: 'A delivery already exists for this sub-order, or the order is self-pickup' });
      // Created PENDING — notify the supplier that a dispatch decision is waiting (mirrors the
      // automatic READY→PENDING path; no Delivery Company is notified until dispatch).
      broadcastToUsers([subOrder.supplierId], 'delivery_created', { deliveryId: created.id, subOrderId, orderId: subOrder.orderId, status: created.status });
      res.status(201).json(created);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(400).json({ message: err.message ?? 'Error creating delivery' });
    }
  });

  // Supplier's dispatch decision for a PENDING delivery — Delivery Company queue, or the
  // supplier's own drivers. See storage.dispatchDelivery().
  app.patch('/api/deliveries/:id/dispatch', requireApprovedSupplier, async (req: any, res) => {
    try {
      const deliveryId = parseInt(req.params.id);
      const supplier = req.session.userId!;
      const { mode } = z.object({ mode: z.enum(['DELIVERY_COMPANY', 'SUPPLIER']) }).parse(req.body);
      const updated = await storage.dispatchDelivery(deliveryId, supplier, mode);
      const delivery = await storage.getDelivery(deliveryId);
      if (mode === 'DELIVERY_COMPANY') {
        // Only now does the delivery become visible to Delivery Companies.
        const companyIds = await storage.getApprovedDeliveryCompanyIds();
        broadcastToUsers(companyIds, 'delivery_created', { deliveryId, status: updated.status });
      }
      if (delivery) {
        broadcastToUsers([delivery.cafeId, delivery.supplierId], 'delivery_status_changed', {
          deliveryId, status: updated.status, orderId: delivery.orderId, subOrderId: delivery.subOrderId,
        });
      }
      broadcast('delivery_status_changed', { deliveryId, status: updated.status });
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(409).json({ message: err.message ?? 'Unable to dispatch delivery' });
    }
  });

  app.patch('/api/deliveries/:id/accept', requireApprovedDeliveryCompany, async (req: any, res) => {
    try {
      const deliveryId = parseInt(req.params.id);
      const company = req.deliveryCompany;
      const updated = await storage.acceptDelivery(deliveryId, company.id);
      const delivery = await storage.getDelivery(deliveryId);
      broadcastToUsers([company.id], 'delivery_accepted', { deliveryId, status: updated.status });
      // Minimal global ping so every connected delivery-company dashboard removes it from
      // its "available" pool in realtime — no addresses/customer info in the payload.
      broadcast('delivery_status_changed', { deliveryId, status: updated.status });
      if (delivery) {
        broadcastToUsers([delivery.cafeId, delivery.supplierId], 'delivery_status_changed', {
          deliveryId, status: updated.status, orderId: delivery.orderId, subOrderId: delivery.subOrderId,
        });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(409).json({ message: err.message ?? 'Unable to accept delivery' });
    }
  });

  // Either operator can assign — a Delivery Company assigning one of its own drivers, or a
  // Supplier assigning one of its own drivers (for its SUPPLIER-mode deliveries). Ownership is
  // fully re-verified inside storage.assignDriver() against the delivery's actual
  // deliveryMode/owner id — the route only checks that the caller is one of the two eligible
  // roles, never trusting an id the frontend sends.
  app.patch('/api/deliveries/:id/assign', requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      if (!['DELIVERY_COMPANY', 'SUPPLIER'].includes(user.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const deliveryId = parseInt(req.params.id);
      const { driverId } = z.object({ driverId: z.number() }).parse(req.body);
      const updated = await storage.assignDriver(deliveryId, { id: user.id, role: user.role }, driverId);
      const delivery = await storage.getDelivery(deliveryId);
      broadcastToUsers([driverId, user.id], 'delivery_assigned', { deliveryId, status: updated.status, driverId });
      broadcast('delivery_status_changed', { deliveryId, status: updated.status });
      if (delivery) {
        broadcastToUsers([delivery.cafeId, delivery.supplierId], 'delivery_status_changed', {
          deliveryId, status: updated.status, orderId: delivery.orderId, subOrderId: delivery.subOrderId,
        });
      }
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(409).json({ message: err.message ?? 'Unable to assign driver' });
    }
  });

  app.patch('/api/deliveries/:id/status', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const deliveryId = parseInt(req.params.id);
      const { status } = z.object({
        status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
      }).parse(req.body);
      const updated = await storage.updateDeliveryStatus(deliveryId, { id: user.id, role: user.role }, status);
      const delivery = await storage.getDelivery(deliveryId);
      if (delivery) {
        await storage.refreshOrderMessagingState(delivery.orderId);
        const recipients = [delivery.cafeId, delivery.supplierId, delivery.driverId, delivery.deliveryCompanyId]
          .filter((x): x is number => x != null);
        broadcastToUsers(recipients, 'delivery_status_changed', {
          deliveryId, status: updated.status, orderId: delivery.orderId, subOrderId: delivery.subOrderId,
        });
        // Minimal global ping — keeps admin oversight + other delivery-company/driver tabs
        // in sync without exposing address/customer data to everyone.
        broadcast('delivery_status_changed', { deliveryId, status: updated.status });
        // Sub-order/order aggregates changed as a side effect of updateDeliveryStatus — echo
        // the existing events the Coffee Owner / Supplier UIs already listen for.
        if (['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(status)) {
          broadcastToUsers([delivery.cafeId], 'order_status_changed', { orderId: delivery.orderId });
          broadcast('suborder_status_changed', { orderId: delivery.orderId, subOrderId: delivery.subOrderId });
          if (status === 'DELIVERED') {
            broadcast('inventory_updated', { orderId: delivery.orderId, subOrderId: delivery.subOrderId });
          }
        }
      }
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(409).json({ message: err.message ?? 'Unable to update delivery status' });
    }
  });

  // ── Driver rosters ────────────────────────────────────────────────────────────
  // A Driver belongs to exactly one operator — a Delivery Company OR a Supplier (never both;
  // enforced by a DB CHECK constraint on users, see shared/schema.ts). Both operator types
  // manage their own roster through the same underlying storage methods
  // (getDriversForOwner/createDriverForOwner) via two thin, separately-authorized route
  // groups — one Driver system, two ownership paths. This replaces the earlier
  // supplier/drivers-page.tsx mock, which incorrectly implied suppliers managed a
  // Delivery-Company-style fleet with no real ownership model behind it.

  const driverRosterSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    phone: z.string().optional().nullable(),
  });

  app.get('/api/delivery-company/drivers', requireApprovedDeliveryCompany, async (req: any, res) => {
    try {
      res.json(await storage.getDriversForOwner('DELIVERY_COMPANY', req.deliveryCompany.id));
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error fetching drivers' });
    }
  });

  app.post('/api/delivery-company/drivers', requireApprovedDeliveryCompany, async (req: any, res) => {
    try {
      const data = driverRosterSchema.parse(req.body);
      const driver = await storage.createDriverForOwner('DELIVERY_COMPANY', req.deliveryCompany.id, data);
      res.status(201).json(driver);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(400).json({ message: err.message ?? 'Error creating driver' });
    }
  });

  app.get('/api/supplier/drivers', requireApprovedSupplier, async (req, res) => {
    try {
      res.json(await storage.getDriversForOwner('SUPPLIER', req.session.userId!));
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error fetching drivers' });
    }
  });

  app.post('/api/supplier/drivers', requireApprovedSupplier, async (req, res) => {
    try {
      const data = driverRosterSchema.parse(req.body);
      const driver = await storage.createDriverForOwner('SUPPLIER', req.session.userId!, data);
      res.status(201).json(driver);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(400).json({ message: err.message ?? 'Error creating driver' });
    }
  });

  // ── Pack composition (for Supplier order details modal) ────────────────────

  app.get('/api/packs/:id/composition', requireAuth, async (req: any, res) => {
    try {
      const packId = parseInt(req.params.id);
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });

      // Load the pack to enforce ownership / visibility
      const [pack] = await db.select().from(packs).where(eq(packs.id, packId));
      if (!pack) return res.status(404).json({ message: 'Pack not found' });

      // Suppliers may only view composition of their own packs
      if (user.role === 'SUPPLIER' && pack.supplierId !== user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      // Cafe owners may view composition of visible packs OR packs they have ordered
      if (user.role === 'CAFE_OWNER') {
        const isVisible = pack.visibility === 'VISIBLE' && !pack.isArchived;
        if (!isVisible) {
          // Allow if the cafe has an order containing this pack
          const ordered = await db
            .select({ id: orderItems.id })
            .from(orderItems)
            .innerJoin(subOrders, eq(subOrders.id, orderItems.subOrderId))
            .innerJoin(orders, eq(orders.id, subOrders.orderId))
            .where(and(eq(orderItems.packId, packId), eq(orders.cafeId, user.id)))
            .limit(1);
          if (!ordered.length) return res.status(403).json({ message: 'Forbidden' });
        }
      }

      const composition = await storage.getPackComposition(packId);
      res.json(composition);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error fetching pack composition' });
    }
  });

  // ── Admin: delete an order (cascade) ─────────────────────────────────────────

  app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      const cafeId = order.cafeId;
      const supplierIds = Array.from(new Set((order.subOrders ?? []).map((so: any) => so.supplierId)));
      await storage.deleteOrder(orderId);
      // Broadcast to all involved parties so their UI removes the order in real time
      broadcastToUsers([cafeId, ...supplierIds], 'order_deleted', { orderId });
      broadcast('order_deleted', { orderId });
      res.json({ message: 'Deleted' });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error deleting order' });
    }
  });

  // ── Reorder — validate previous order items against current stock ────────────

  app.get('/api/orders/:id/reorder', requireApprovedCafeOwner, async (req, res) => {
    try {
      const cafeId = req.session.userId!;
      const orderId = parseInt(req.params.id);
      const data = await storage.getReorderData(orderId, cafeId);
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err.message ?? 'Error preparing reorder' });
    }
  });

  // ── Returns ────────────────────────────────────────────────────────────────

  // GET /api/returns — cafe sees their requests; supplier sees their incoming requests; admin sees all
  app.get('/api/returns', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
      const filters = isAdmin ? undefined
        : user.role === 'CAFE_OWNER' ? { cafeId: userId }
        : user.role === 'SUPPLIER'   ? { supplierId: userId }
        : undefined;
      const returns = await storage.getReturns(filters);
      res.json(returns);
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error fetching returns' });
    }
  });

  // POST /api/returns — cafe owner creates a return request
  app.post('/api/returns', requireApprovedCafeOwner, async (req, res) => {
    try {
      const cafeId = req.session.userId!;
      const { orderId, subOrderId, supplierId, itemType, orderItemId, itemName, quantity, reason } = req.body;
      if (!orderId || !supplierId || !itemName || !quantity || !reason) {
        return res.status(400).json({ message: 'orderId, supplierId, itemName, quantity and reason are required' });
      }
      const returnReq = await storage.createReturn({
        orderId, subOrderId: subOrderId ?? null, cafeId, supplierId,
        itemType: itemType ?? 'PRODUCT', orderItemId: orderItemId ?? null,
        itemName, quantity: Number(quantity), reason, status: 'PENDING_REVIEW',
        supplierNotes: null, processedAt: null,
      });
      res.status(201).json(returnReq);
    } catch (err: any) {
      res.status(400).json({ message: err.message ?? 'Error creating return' });
    }
  });

  // PATCH /api/returns/:id/status — supplier or admin processes a return
  app.patch('/api/returns/:id/status', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !(['SUPPLIER','ADMIN','SUPER_ADMIN'].includes(user.role))) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const returnId = parseInt(req.params.id);
      if (isNaN(returnId)) return res.status(400).json({ message: 'Invalid return id' });
      const { status, supplierNotes } = req.body;
      if (!status) return res.status(400).json({ message: 'status is required' });
      const updated = await storage.updateReturnStatus(returnId, status, supplierNotes);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message ?? 'Error updating return' });
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
      const { name, email, password, role, phone, governorates, printCategories, marketingCategories, maintenanceCategories, categories } = req.body;
      if (!name || !email || !password || !role) return res.status(400).json({ message: "name, email, password and role are required" });
      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(400).json({ message: "Email already exists" });
      if (phone) {
        const existingPhone = await storage.getUserByPhone(phone);
        if (existingPhone) return res.status(400).json({ message: "Phone number already in use" });
      }
      const user = await storage.createUser({
        name, email, password, role, status: 'approved',
        phone: phone ?? null,
        governorates: governorates ?? null,
        printCategories: printCategories ?? null,
        marketingCategories: marketingCategories ?? null,
        maintenanceCategories: maintenanceCategories ?? null,
        categories: categories ?? null,
      } as any);
      res.status(201).json(user);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, email, phone, governorates, printCategories, marketingCategories, maintenanceCategories, categories, locationAddress } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (governorates !== undefined) updates.governorates = governorates;
      if (printCategories !== undefined) updates.printCategories = printCategories;
      if (marketingCategories !== undefined) updates.marketingCategories = marketingCategories;
      if (maintenanceCategories !== undefined) updates.maintenanceCategories = maintenanceCategories;
      if (categories !== undefined) updates.categories = categories;
      if (locationAddress !== undefined) updates.locationAddress = locationAddress;
      const updated = await storage.updateUser(id, updates);
      res.json(updated);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteUser(parseInt(req.params.id));
      res.json({ message: "Deleted" });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.get("/api/admin/supplier-mappings", requireAdmin, async (req, res) => {
    try {
      const allSuppliers = await db.select().from(users).where(eq(users.role, 'SUPPLIER'));
      const result = await Promise.all(allSuppliers.map(async (s: any) => ({
        user: { id: s.id, name: s.name, email: s.email, role: s.role, status: s.status },
        mappings: await storage.getSupplierCategoryMappings(s.id),
      })));
      res.json(result);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/supplier-mappings/:supplierId", requireAdmin, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      const { categoryIds } = req.body;
      await storage.setSupplierCategories(supplierId, Array.isArray(categoryIds) ? categoryIds : []);
      broadcast("supplier_mapping_changed", { supplierId });
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.get("/api/admin/supplier-mappings/:supplierId/overview", requireAdmin, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      res.json(await storage.getAdminSupplierCategoryOverview(supplierId));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/admin/supplier-mappings/:supplierId/categories/:categoryId", requireAdmin, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      const categoryId = parseInt(req.params.categoryId);
      await storage.addSupplierCategories(supplierId, [categoryId], 'APPROVED');
      broadcast("supplier_mapping_changed", { supplierId, categoryId });
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/supplier-mappings/:supplierId/categories/:categoryId/approve", requireAdmin, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      const categoryId = parseInt(req.params.categoryId);
      await storage.approveSupplierCategoryMapping(supplierId, categoryId);
      broadcast("supplier_mapping_changed", { supplierId, categoryId });
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/supplier-mappings/:supplierId/categories/:categoryId/freeze", requireAdmin, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      const categoryId = parseInt(req.params.categoryId);
      const { isFrozen } = z.object({ isFrozen: z.boolean() }).parse(req.body);
      await storage.setSupplierCategoryFrozen(supplierId, categoryId, isFrozen);
      broadcast("supplier_mapping_changed", { supplierId, categoryId, isFrozen });
      res.json({ success: true });
    } catch { res.status(400).json({ message: "Invalid" }); }
  });

  app.delete("/api/admin/supplier-mappings/:supplierId/categories/:categoryId", requireAdmin, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      const categoryId = parseInt(req.params.categoryId);
      await storage.removeSupplierCategory(supplierId, categoryId);
      broadcast("supplier_mapping_changed", { supplierId, categoryId });
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/users/:id/status", requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const user = await storage.updateUserStatus(parseInt(req.params.id), status);
      res.json(user);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/users/:id/approve", requireAdmin, async (req, res) => {
    try {
      const user = await storage.updateUserStatus(parseInt(req.params.id), 'approved');
      res.json(user);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/users/:id/reject", requireAdmin, async (req, res) => {
    try {
      const user = await storage.updateUserStatus(parseInt(req.params.id), 'rejected');
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

  // ── Categories ─────────────────────────────────────────────────────────────

  app.get("/api/categories", async (req, res) => {
    try {
      const isAdmin = req.session.userId ? await storage.getUser(req.session.userId).then(u => u && ['SUPER_ADMIN', 'ADMIN'].includes(u.role)) : false;
      res.json(await storage.getCategories({ includeAll: !!isAdmin }));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/categories", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      // Duplicate name check
      const existing = await storage.getCategories();
      if (existing.some(c => c.name.toLowerCase() === req.body.name?.toLowerCase()?.trim())) {
        return res.status(400).json({ message: "A category with this name already exists" });
      }
      const data = insertCategorySchema.partial().parse(req.body);
      res.status(201).json(await storage.createCategory({ ...data, createdBy: user?.name ?? "Admin" }));
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Error" });
    }
  });

  app.patch("/api/categories/:id", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const data = insertCategorySchema.partial().parse(req.body);
      const result = await storage.updateCategory(parseInt(req.params.id), data);
      broadcast("taxonomy_updated", {});
      res.json(result);
    } catch { res.status(400).json({ message: "Invalid" }); }
  });

  app.delete("/api/categories/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteCategory(parseInt(req.params.id));
      broadcast("taxonomy_updated", {});
      res.json({ message: "Deleted" });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // ── SubCategories ──────────────────────────────────────────────────────────

  app.get("/api/subcategories", async (req, res) => {
    try {
      const cid = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
      const isAdmin = req.session.userId ? await storage.getUser(req.session.userId).then(u => u && ['SUPER_ADMIN', 'ADMIN'].includes(u.role)) : false;
      res.json(await storage.getSubCategories(cid, { includeAll: !!isAdmin }));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/subcategories", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const data = insertSubCategorySchema.partial().parse(req.body);
      // Duplicate check within same category
      if (data.categoryId && data.name) {
        const existing = await storage.getSubCategories(data.categoryId as number);
        if (existing.some(s => s.name.toLowerCase() === data.name!.toLowerCase().trim())) {
          return res.status(400).json({ message: "A sub-category with this name already exists in this category" });
        }
      }
      res.status(201).json(await storage.createSubCategory({ ...data, createdBy: user?.name ?? "Admin" }));
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Error" });
    }
  });

  app.patch("/api/subcategories/:id", requireAdmin, async (req, res) => {
    try {
      const result = await storage.updateSubCategory(parseInt(req.params.id), insertSubCategorySchema.partial().parse(req.body));
      broadcast("taxonomy_updated", {});
      res.json(result);
    } catch { res.status(400).json({ message: "Invalid" }); }
  });

  app.delete("/api/subcategories/:id", requireAdmin, async (req, res) => {
    try { await storage.deleteSubCategory(parseInt(req.params.id)); broadcast("taxonomy_updated", {}); res.json({ message: "Deleted" }); }
    catch { res.status(500).json({ message: "Error" }); }
  });

  // ── Flavors ────────────────────────────────────────────────────────────────

  app.get("/api/flavors", async (req, res) => {
    try {
      const isAdmin = req.session.userId ? await storage.getUser(req.session.userId).then(u => u && ['SUPER_ADMIN', 'ADMIN'].includes(u.role)) : false;
      const filters = {
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
        subCategoryId: req.query.subCategoryId ? parseInt(req.query.subCategoryId as string) : undefined,
        includeAll: !!isAdmin,
      };
      res.json(await storage.getFlavors(filters));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/flavors", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const data = insertFlavorSchema.partial().parse(req.body);
      const existing = await storage.getFlavors();
      if (existing.some(f => f.name.toLowerCase() === data.name?.toLowerCase()?.trim())) {
        return res.status(400).json({ message: "A flavor with this name already exists" });
      }
      res.status(201).json(await storage.createFlavor({ ...data, createdBy: user?.name ?? "Admin" }));
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Error" });
    }
  });

  app.patch("/api/flavors/:id", requireAdmin, async (req, res) => {
    try { const result = await storage.updateFlavor(parseInt(req.params.id), insertFlavorSchema.partial().parse(req.body)); broadcast("taxonomy_updated", {}); res.json(result); }
    catch { res.status(400).json({ message: "Invalid" }); }
  });

  app.delete("/api/flavors/:id", requireAdmin, async (req, res) => {
    try { await storage.deleteFlavor(parseInt(req.params.id)); broadcast("taxonomy_updated", {}); res.json({ message: "Deleted" }); }
    catch { res.status(500).json({ message: "Error" }); }
  });

  // ── Sizes ──────────────────────────────────────────────────────────────────

  app.get("/api/sizes", async (req, res) => {
    try {
      const isAdmin = req.session.userId ? await storage.getUser(req.session.userId).then(u => u && ['SUPER_ADMIN', 'ADMIN'].includes(u.role)) : false;
      const filters = {
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
        subCategoryId: req.query.subCategoryId ? parseInt(req.query.subCategoryId as string) : undefined,
        includeAll: !!isAdmin,
      };
      res.json(await storage.getSizes(filters));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/sizes", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const data = insertSizeSchema.partial().parse(req.body);
      res.status(201).json(await storage.createSize({ ...data, createdBy: user?.name ?? "Admin" }));
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Error" });
    }
  });

  app.patch("/api/sizes/:id", requireAdmin, async (req, res) => {
    try { const result = await storage.updateSize(parseInt(req.params.id), insertSizeSchema.partial().parse(req.body)); broadcast("taxonomy_updated", {}); res.json(result); }
    catch { res.status(400).json({ message: "Invalid" }); }
  });

  app.delete("/api/sizes/:id", requireAdmin, async (req, res) => {
    try { await storage.deleteSize(parseInt(req.params.id)); broadcast("taxonomy_updated", {}); res.json({ message: "Deleted" }); }
    catch { res.status(500).json({ message: "Error" }); }
  });

  // ── Brands ─────────────────────────────────────────────────────────────────

  app.get("/api/brands", async (req, res) => {
    try {
      const isAdmin = req.session.userId ? await storage.getUser(req.session.userId).then(u => u && ['SUPER_ADMIN', 'ADMIN'].includes(u.role)) : false;
      const filters = {
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
        subCategoryId: req.query.subCategoryId ? parseInt(req.query.subCategoryId as string) : undefined,
        includeAll: !!isAdmin,
      };
      res.json(await storage.getBrands(filters));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/brands", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const data = insertBrandSchema.partial().parse(req.body);
      res.status(201).json(await storage.createBrand({ ...data, createdBy: user?.name ?? "Admin" }));
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Error" });
    }
  });

  app.patch("/api/brands/:id", requireAdmin, async (req, res) => {
    try { const result = await storage.updateBrand(parseInt(req.params.id), insertBrandSchema.partial().parse(req.body)); broadcast("taxonomy_updated", {}); res.json(result); }
    catch { res.status(400).json({ message: "Invalid" }); }
  });

  app.delete("/api/brands/:id", requireAdmin, async (req, res) => {
    try { await storage.deleteBrand(parseInt(req.params.id)); broadcast("taxonomy_updated", {}); res.json({ message: "Deleted" }); }
    catch { res.status(500).json({ message: "Error" }); }
  });

  // ── Catalog Suggestions ────────────────────────────────────────────────────

  const CATALOG_TYPES = ['category', 'subcategory', 'brand', 'flavor', 'size'] as const;

  function getCatalogTable(type: string): any {
    return { category: categories, subcategory: subCategories, brand: brands, flavor: flavors, size: sizes }[type];
  }

  app.get("/api/supplier/catalog-suggestions", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const [cats, subs, flvs, szs, brds] = await Promise.all([
        db.select().from(categories).where(eq(categories.createdByUserId, user!.id)),
        db.select().from(subCategories).where(eq(subCategories.createdByUserId, user!.id)),
        db.select().from(flavors).where(eq(flavors.createdByUserId, user!.id)),
        db.select().from(sizes).where(eq(sizes.createdByUserId, user!.id)),
        db.select().from(brands).where(eq(brands.createdByUserId, user!.id)),
      ]);
       // Once approved, category/sub-category/flavor/size suggestions live in
       // Category Management as regular taxonomy. Pending and rejected rows
       // remain here so suppliers can see their review history. Brands retain
       // the existing behavior.
       res.json([
         ...cats.filter(c => c.status !== 'ACTIVE').map(c => ({ ...c, type: 'category' })),
         ...subs.filter(s => s.status !== 'ACTIVE').map(s => ({ ...s, type: 'subcategory' })),
         ...flvs.filter(f => f.status !== 'ACTIVE').map(f => ({ ...f, type: 'flavor' })),
         ...szs.filter(s => s.status !== 'ACTIVE').map(s => ({ ...s, type: 'size' })),
         ...brds.filter(b => b.status !== 'ACTIVE').map(b => ({ ...b, type: 'brand' })),
       ]);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/supplier/catalog-suggestions", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const { type, name, description, icon, categoryId, value, subCategoryIds } = req.body;
      if (!CATALOG_TYPES.includes(type)) return res.status(400).json({ message: "Invalid type" });
      if (!name?.trim()) return res.status(400).json({ message: "Name is required" });
      const base: any = {
        name: name.trim(), description: description?.trim() || null, icon: icon?.trim() || null,
        status: 'PENDING', createdBySupplier: true, createdByUserId: user!.id,
        createdBy: user!.name, isActive: false,
      };
      let created: any;
      if (type === 'category') {
        [created] = await db.insert(categories).values(base).returning();
      } else if (type === 'subcategory') {
        if (!categoryId) return res.status(400).json({ message: "categoryId required" });
        [created] = await db.insert(subCategories).values({ ...base, categoryId: parseInt(categoryId) }).returning();
      } else if (type === 'flavor') {
        [created] = await db.insert(flavors).values({ ...base, subCategoryIds: subCategoryIds ?? null }).returning();
      } else if (type === 'size') {
        [created] = await db.insert(sizes).values({ ...base, value: value?.trim() || null, subCategoryIds: subCategoryIds ?? null }).returning();
      } else if (type === 'brand') {
        [created] = await db.insert(brands).values({ ...base, subCategoryIds: subCategoryIds ?? null }).returning();
      }
      res.status(201).json({ ...created, type });
      broadcast("catalog_suggestion_created", { type });
    } catch (err: any) { res.status(500).json({ message: err?.message || "Error" }); }
  });

  app.patch("/api/supplier/catalog-suggestions/:type/:id", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const { type, id: idStr } = req.params;
      const id = parseInt(idStr);
      if (!CATALOG_TYPES.includes(type as any)) return res.status(400).json({ message: "Invalid type" });
      const table = getCatalogTable(type);
      const [existing] = await db.select().from(table).where(eq(table.id, id));
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (existing.createdByUserId !== user!.id) return res.status(403).json({ message: "Forbidden" });
      if (existing.status !== 'PENDING') return res.status(400).json({ message: "Can only edit PENDING suggestions" });
      const { name, description, icon, categoryId, value, subCategoryIds } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      if (icon !== undefined) updates.icon = icon?.trim() || null;
      if (type === 'subcategory' && categoryId !== undefined) updates.categoryId = parseInt(categoryId);
      if (type === 'size' && value !== undefined) updates.value = value?.trim() || null;
      if (['brand', 'flavor', 'size'].includes(type) && subCategoryIds !== undefined) updates.subCategoryIds = subCategoryIds;
      const [updated] = await db.update(table).set(updates).where(eq(table.id, id)).returning();
      res.json({ ...updated, type });
      broadcast("catalog_suggestion_updated", { type, id });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.delete("/api/supplier/catalog-suggestions/:type/:id", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const { type, id: idStr } = req.params;
      const id = parseInt(idStr);
      if (!CATALOG_TYPES.includes(type as any)) return res.status(400).json({ message: "Invalid type" });
      const table = getCatalogTable(type);
      const [existing] = await db.select().from(table).where(eq(table.id, id));
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (existing.createdByUserId !== user!.id) return res.status(403).json({ message: "Forbidden" });
      if (existing.status !== 'PENDING') return res.status(400).json({ message: "Can only delete PENDING suggestions" });
      await db.delete(table).where(eq(table.id, id));
      res.json({ message: "Deleted" });
      broadcast("catalog_suggestion_deleted", { type, id });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.get("/api/admin/catalog-suggestions", requireAdmin, async (req, res) => {
    try {
      const [cats, subs, flvs, szs, brds] = await Promise.all([
        db.select().from(categories).where(eq(categories.createdBySupplier, true)),
        db.select().from(subCategories).where(eq(subCategories.createdBySupplier, true)),
        db.select().from(flavors).where(eq(flavors.createdBySupplier, true)),
        db.select().from(sizes).where(eq(sizes.createdBySupplier, true)),
        db.select().from(brands).where(eq(brands.createdBySupplier, true)),
      ]);
      const allItems = [...cats, ...subs, ...flvs, ...szs, ...brds];
      const userIds = Array.from(new Set(allItems.map((r: any) => r.createdByUserId).filter(Boolean))) as number[];
      const supplierRows = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
      const supplierMap = new Map(supplierRows.map(u => [u.id, u.name]));
      const enrich = (items: any[], type: string) => items
        // Approved supplier taxonomy is now represented in Category
        // Management. Keep pending/rejected review history in this table;
        // Approved supplier taxonomy is represented in Category Management;
        // pending/rejected rows remain here for review history.
        .filter(item => item.status !== 'ACTIVE')
        .map(item => ({
          ...item, type,
          supplierName: item.createdByUserId ? (supplierMap.get(item.createdByUserId) ?? 'Unknown') : 'Unknown',
        }));
      res.json([
        ...enrich(cats, 'category'), ...enrich(subs, 'subcategory'),
        ...enrich(flvs, 'flavor'), ...enrich(szs, 'size'), ...enrich(brds, 'brand'),
      ]);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/catalog-suggestions/:type/:id/approve", requireAdmin, async (req, res) => {
    try {
      const { type, id: idStr } = req.params;
      const id = parseInt(idStr);
      if (!CATALOG_TYPES.includes(type as any)) return res.status(400).json({ message: "Invalid type" });
      const adminUser = await storage.getUser(req.session.userId!);
      const table = getCatalogTable(type);
      const [updated] = await db.update(table).set({
        status: 'ACTIVE', isActive: true,
        approvedBy: adminUser?.id ?? null, approvedAt: new Date(),
      } as any).where(eq(table.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json({ ...updated, type });
      broadcast("catalog_suggestion_approved", { type, id });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/catalog-suggestions/:type/:id", requireAdmin, async (req, res) => {
    try {
      const { type, id: idStr } = req.params;
      const id = parseInt(idStr);
      if (!CATALOG_TYPES.includes(type as any)) return res.status(400).json({ message: "Invalid type" });
      const table = getCatalogTable(type);
      const { name, description, icon, categoryId, value, subCategoryIds, status } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      if (icon !== undefined) updates.icon = icon?.trim() || null;
       if (status !== undefined) {
         updates.status = status;
         if (['PENDING', 'REJECTED'].includes(status)) updates.isActive = false;
         if (status === 'ACTIVE') updates.isActive = true;
       }
      if (type === 'subcategory' && categoryId !== undefined) updates.categoryId = parseInt(categoryId);
      if (type === 'size' && value !== undefined) updates.value = value?.trim() || null;
      if (['brand', 'flavor', 'size'].includes(type) && subCategoryIds !== undefined) updates.subCategoryIds = subCategoryIds;
      const [updated] = await db.update(table).set(updates).where(eq(table.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json({ ...updated, type });
      broadcast("catalog_suggestion_updated", { type, id });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.delete("/api/admin/catalog-suggestions/:type/:id", requireAdmin, async (req, res) => {
    try {
      const { type, id: idStr } = req.params;
      const id = parseInt(idStr);
      if (!CATALOG_TYPES.includes(type as any)) return res.status(400).json({ message: "Invalid type" });
      const table = getCatalogTable(type);
      await db.delete(table).where(eq(table.id, id));
      res.json({ message: "Deleted" });
      broadcast("catalog_suggestion_deleted", { type, id });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // ── Supplier Category Mappings ─────────────────────────────────────────────

  app.get("/api/supplier/categories", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      res.json(await storage.getSupplierCategoryMappings(user!.id));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/supplier/categories", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const { categoryIds } = z.object({ categoryIds: z.array(z.number()) }).parse(req.body);
      await storage.addSupplierCategories(user!.id, categoryIds, 'PENDING');
      broadcast("supplier_mapping_changed", { supplierId: user!.id });
      res.json({ message: "Saved" });
    } catch { res.status(400).json({ message: "Invalid" }); }
  });

  app.patch("/api/supplier/categories/:categoryId/freeze", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const categoryId = parseInt(req.params.categoryId);
      const { isFrozen } = z.object({ isFrozen: z.boolean() }).parse(req.body);
      await storage.setSupplierCategoryFrozen(user!.id, categoryId, isFrozen);
      broadcast("supplier_mapping_changed", { supplierId: user!.id, categoryId, isFrozen });
      res.json({ success: true });
    } catch { res.status(400).json({ message: "Invalid" }); }
  });

  app.delete("/api/supplier/categories/:categoryId", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const categoryId = parseInt(req.params.categoryId);
      await storage.removeSupplierCategory(user!.id, categoryId);
      broadcast("supplier_mapping_changed", { supplierId: user!.id, categoryId });
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/supplier/subcategories", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const { subCategoryIds } = z.object({ subCategoryIds: z.array(z.number()) }).parse(req.body);
      await storage.setSupplierSubCategories(user!.id, subCategoryIds);
      broadcast("supplier_mapping_changed", { supplierId: user!.id });
      res.json({ message: "Saved" });
    } catch { res.status(400).json({ message: "Invalid" }); }
  });

  // ── Supplier Product Listings ──────────────────────────────────────────────

  // Admin products browse (filtered by supplier's mapped categories)
  app.get("/api/supplier/admin-products", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);

      // categoryId/subCategoryId params intentionally removed — the supplier mapping filter
      // below handles ALL checked subcategories across ALL the supplier's categories.
      const filters = {
        flavorId: req.query.flavorId ? parseInt(req.query.flavorId as string) : undefined,
        sizeId: req.query.sizeId ? parseInt(req.query.sizeId as string) : undefined,
        brandId: req.query.brandId ? parseInt(req.query.brandId as string) : undefined,
        search: req.query.search as string | undefined,
      };

      const [adminProds, supplierMappings, myListings] = await Promise.all([
        storage.getAdminProducts(filters),
        storage.getSupplierCategoryMappings(user!.id, { approvedOnly: true }),
        db.select().from(supplierProductListings).where(eq(supplierProductListings.supplierId, user!.id)),
      ]);

      // Filter by ALL the supplier's mapped categories and ALL their checked subcategories.
      // This supports multi-category / multi-subcategory selections simultaneously.
      const mappedCatIds = new Set(supplierMappings.map(m => m.category.id));
      const allCheckedSubIds = new Set(supplierMappings.flatMap(m => m.selectedSubCategoryIds));

      let filtered = adminProds;
      if (mappedCatIds.size > 0) {
        filtered = filtered.filter(p => {
          if (!p.categoryId) return false;
          if (!mappedCatIds.has(p.categoryId)) return false;
          const catMapping = supplierMappings.find(m => m.category.id === p.categoryId);
          if (catMapping && catMapping.selectedSubCategoryIds.length > 0) {
            if (!p.subCategoryId) return false;
            return allCheckedSubIds.has(p.subCategoryId);
          }
          return true;
        });
      } else {
        filtered = [];
      }

      // Attach my listing info
      const result = filtered.map(p => ({
        ...p,
        myListing: myListings.find(l => l.productId === p.id) ?? null,
      }));

      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Error" });
    }
  });

  // ── Supplier created-products workflow ─────────────────────────────────────

  app.get("/api/supplier/created-products", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      res.json(await storage.getSupplierCreatedProducts(user!.id));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/supplier/created-products", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!req.body.name?.trim()) return res.status(400).json({ message: "Name required" });
      const product = await storage.createSupplierProduct({
        name: req.body.name.trim(),
        description: req.body.description?.trim() || null,
        imageUrl: req.body.imageUrl?.trim() || null,
        categoryId: req.body.categoryId ? parseInt(req.body.categoryId) : null,
        subCategoryId: req.body.subCategoryId ? parseInt(req.body.subCategoryId) : null,
        flavorId: req.body.flavorId ? parseInt(req.body.flavorId) : null,
        sizeId: req.body.sizeId ? parseInt(req.body.sizeId) : null,
        brandId: req.body.brandId ? parseInt(req.body.brandId) : null,
        flavorIds: Array.isArray(req.body.flavorIds) ? req.body.flavorIds.map(Number) : null,
        sizeIds: Array.isArray(req.body.sizeIds) ? req.body.sizeIds.map(Number) : null,
        category: req.body.category || "",
        supplierId: user!.id,
        createdByUserId: user!.id,
      });
      broadcast("product_updated", { productId: product.id, supplierId: user!.id });
      res.status(201).json(product);
    } catch { res.status(500).json({ message: "Error creating product" }); }
  });

  app.patch("/api/supplier/created-products/:id", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.imageUrl !== undefined) updates.imageUrl = req.body.imageUrl;
      if (req.body.category !== undefined) updates.category = req.body.category;
      if (req.body.categoryId !== undefined) updates.categoryId = req.body.categoryId ? parseInt(req.body.categoryId) : null;
      if (req.body.subCategoryId !== undefined) updates.subCategoryId = req.body.subCategoryId ? parseInt(req.body.subCategoryId) : null;
      if (req.body.flavorId !== undefined) updates.flavorId = req.body.flavorId ? parseInt(req.body.flavorId) : null;
      if (req.body.sizeId !== undefined) updates.sizeId = req.body.sizeId ? parseInt(req.body.sizeId) : null;
      if (req.body.brandId !== undefined) updates.brandId = req.body.brandId ? parseInt(req.body.brandId) : null;
      if (req.body.flavorIds !== undefined) updates.flavorIds = Array.isArray(req.body.flavorIds) ? req.body.flavorIds.map(Number) : null;
      if (req.body.sizeIds !== undefined) updates.sizeIds = Array.isArray(req.body.sizeIds) ? req.body.sizeIds.map(Number) : null;
      const updated = await storage.updateSupplierProduct(parseInt(req.params.id), user!.id, updates);
      if (!updated) return res.status(403).json({ message: "Cannot edit this product" });
      broadcast("product_updated", { productId: parseInt(req.params.id), supplierId: user!.id });
      res.json(updated);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.delete("/api/supplier/created-products/:id", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const result = await storage.deleteSupplierProduct(parseInt(req.params.id), user!.id);
      if (!result.deleted) return res.status(403).json({ message: "Cannot delete this product" });
      broadcast("product_updated", { productId: parseInt(req.params.id), supplierId: user!.id });
      for (const packId of result.archivedPackIds) {
        broadcast("pack_updated", { packId, supplierId: user!.id });
      }
      res.json({ message: "Deleted", archivedPackIds: result.archivedPackIds });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.get("/api/supplier/created-products/:id/pack-usage", requireApprovedSupplier, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const [product] = await db.select().from(products).where(eq(products.id, productId));
      if (!product || product.createdByUserId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const listingRows = await db.select({ id: supplierProductListings.id })
        .from(supplierProductListings)
        .where(and(eq(supplierProductListings.productId, productId), eq(supplierProductListings.supplierId, req.session.userId)));
      const listingIds = listingRows.map((row) => row.id);
      const rows = listingIds.length
        ? await db.select({ id: packs.id, name: packs.name, isArchived: packs.isArchived })
          .from(packItemsTable)
          .innerJoin(packs, eq(packItemsTable.packId, packs.id))
          .where(inArray(packItemsTable.listingId, listingIds))
        : [];
      res.json({ packs: Array.from(new Map(rows.map((row) => [row.id, row])).values()) });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.get("/api/supplier/listings", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const filters = {
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
        subCategoryId: req.query.subCategoryId ? parseInt(req.query.subCategoryId as string) : undefined,
        flavorId: req.query.flavorId ? parseInt(req.query.flavorId as string) : undefined,
        sizeId: req.query.sizeId ? parseInt(req.query.sizeId as string) : undefined,
        brandId: req.query.brandId ? parseInt(req.query.brandId as string) : undefined,
      };
      res.json(await storage.getSupplierListings(user!.id, filters));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/supplier/listings", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const body = z.object({
        productId: z.number(),
        onlyForPack: z.boolean().optional(),
        onlyForMyProducts: z.boolean().optional(),
        variants: z.array(z.object({
          flavorId: z.number().nullable().optional(),
          sizeId: z.number().nullable().optional(),
          price: z.number().min(0),
          quantity: z.number().min(0),
        })).optional(),
      }).parse(req.body);

      const allowed = await storage.isProductAllowedForSupplier(user!.id, body.productId);
      if (!allowed) return res.status(403).json({ message: "Product is not in your approved categories" });

      const existing = await storage.getSupplierListingByProductId(user!.id, body.productId);
      if (existing) return res.status(409).json({ message: "Product already in your listings" });

      // Enforce mutual exclusivity server-side
      const onlyForPack = body.onlyForPack ?? false;
      const onlyForMyProducts = body.onlyForMyProducts ?? false;
      if (onlyForPack && onlyForMyProducts) {
        return res.status(400).json({ message: "A listing cannot be both 'Only for Pack' and 'Only for My Products' at the same time" });
      }

      const listing = await storage.createSupplierListing({
        supplierId: user!.id,
        productId: body.productId,
        price: 0,
        stock: 0,
        availableFlavorIds: null,
        availableSizeIds: null,
        availableBrandIds: null,
        onlyForPack,
        onlyForMyProducts,
      });

      if (body.variants && body.variants.length > 0) {
        await storage.saveVariants(listing.id, body.variants.map(v => ({
          flavorId: v.flavorId ?? null,
          sizeId: v.sizeId ?? null,
          price: Math.round(v.price * 100),
          quantity: v.quantity,
        })));
      }

      broadcast("product_updated", { productId: body.productId, listingId: listing.id, supplierId: user!.id });
      res.status(201).json(listing);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Error" });
    }
  });

  app.patch("/api/supplier/listings/:id", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const listingId = parseInt(req.params.id);
      const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
      if (!listing) return res.status(404).json({ message: "Not found" });
      if (listing.supplierId !== user!.id) return res.status(403).json({ message: "Forbidden" });

      const body = z.object({
        onlyForPack: z.boolean().optional(),
        onlyForMyProducts: z.boolean().optional(),
        variants: z.array(z.object({
          flavorId: z.number().nullable().optional(),
          sizeId: z.number().nullable().optional(),
          price: z.number().min(0),
          quantity: z.number().min(0),
        })).optional(),
      }).parse(req.body);

      // Enforce mutual exclusivity server-side
      const resolvedOnlyForPack = body.onlyForPack !== undefined ? body.onlyForPack : listing.onlyForPack;
      const resolvedOnlyForMyProducts = body.onlyForMyProducts !== undefined ? body.onlyForMyProducts : (listing as any).onlyForMyProducts;
      if (resolvedOnlyForPack && resolvedOnlyForMyProducts) {
        return res.status(400).json({ message: "A listing cannot be both 'Only for Pack' and 'Only for My Products' at the same time" });
      }

      const listingUpdate: Record<string, any> = {};
      const removingFromPackProducts = body.onlyForPack === false && body.onlyForMyProducts === true;
      let archivedPackIds: number[] = [];
      if (removingFromPackProducts) {
        archivedPackIds = await storage.removeSupplierListingFromPacks(listingId);
      }
      if (body.onlyForPack !== undefined) listingUpdate.onlyForPack = body.onlyForPack;
      if (body.onlyForMyProducts !== undefined) listingUpdate.onlyForMyProducts = body.onlyForMyProducts;
      if (Object.keys(listingUpdate).length && !removingFromPackProducts) {
        await db.update(supplierProductListings).set(listingUpdate).where(eq(supplierProductListings.id, listingId));
      }

      if (body.variants !== undefined) {
        await storage.saveVariants(listingId, body.variants.map(v => ({
          flavorId: v.flavorId ?? null,
          sizeId: v.sizeId ?? null,
          price: Math.round(v.price * 100),
          quantity: v.quantity,
        })));
      }

      const [updated] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
      broadcast("product_updated", { productId: listing.productId, listingId, supplierId: user!.id });
      for (const packId of archivedPackIds) {
        broadcast("pack_updated", { packId, supplierId: user!.id });
      }
      res.json(updated ?? { id: listingId });
    } catch (err) {
      console.error(err);
      res.status(400).json({ message: "Invalid" });
    }
  });

  app.delete("/api/supplier/listings/:id", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const listingId = parseInt(req.params.id);
      const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
      if (!listing) return res.status(404).json({ message: "Not found" });
      if (listing.supplierId !== user!.id) return res.status(403).json({ message: "Forbidden" });
      const archivedPackIds = await storage.deleteSupplierListing(listingId);
      broadcast("product_updated", { productId: listing.productId, listingId, supplierId: user!.id });
      for (const packId of archivedPackIds) {
        broadcast("pack_updated", { packId, supplierId: user!.id });
      }
      res.json({ message: "Removed", archivedPackIds });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.get("/api/supplier/listings/:id/pack-usage", requireApprovedSupplier, async (req, res) => {
    try {
      const listingId = parseInt(req.params.id);
      const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
      if (!listing) return res.status(404).json({ message: "Not found" });
      if (listing.supplierId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const rows = await db.select({ id: packs.id, name: packs.name, isArchived: packs.isArchived })
        .from(packItemsTable)
        .innerJoin(packs, eq(packItemsTable.packId, packs.id))
        .where(eq(packItemsTable.listingId, listingId));
      res.json({ packs: rows });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // ── Supplier Inventory ────────────────────────────────────────────────────────

  function parseInventoryFilters(q: any): InventoryFilters {
    return {
      search: q.search ? String(q.search) : undefined,
      categoryId: q.categoryId ? parseInt(q.categoryId) : undefined,
      brandId: q.brandId ? parseInt(q.brandId) : undefined,
      status: q.status && ['ACTIVE', 'HIDDEN', 'DRAFT'].includes(q.status) ? q.status : undefined,
      stockStatus: q.stockStatus && ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(q.stockStatus) ? q.stockStatus : undefined,
      minPrice: q.minPrice ? Number(q.minPrice) : undefined,
      maxPrice: q.maxPrice ? Number(q.maxPrice) : undefined,
      hasPacks: q.hasPacks === 'true' ? true : q.hasPacks === 'false' ? false : undefined,
      lowStockOnly: q.lowStockOnly === 'true' ? true : undefined,
    };
  }

  const VALID_SORTS = ['name_asc', 'name_desc', 'stock_asc', 'stock_desc', 'price_asc', 'price_desc', 'updated_desc', 'created_desc'];

  app.get("/api/supplier/inventory", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const filters = parseInventoryFilters(req.query);
      const sort: InventorySort | undefined = VALID_SORTS.includes(req.query.sort as string) ? (req.query.sort as InventorySort) : undefined;
      const page = req.query.page ? Math.max(1, parseInt(req.query.page as string)) : 1;
      const pageSize = req.query.pageSize ? Math.min(200, Math.max(1, parseInt(req.query.pageSize as string))) : 50;
      res.json(await storage.getSupplierInventory(user!.id, filters, sort, page, pageSize));
    } catch (err) { console.error(err); res.status(500).json({ message: "Error" }); }
  });

  app.get("/api/supplier/inventory/stats", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const filters = parseInventoryFilters(req.query);
      const hasFilters = Object.values(filters).some((v) => v !== undefined);
      res.json(await storage.getSupplierInventoryStats(user!.id, hasFilters ? filters : undefined));
    } catch (err) { console.error(err); res.status(500).json({ message: "Error" }); }
  });

  app.get("/api/supplier/inventory/export", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const filters = parseInventoryFilters(req.query);
      const sort: InventorySort | undefined = VALID_SORTS.includes(req.query.sort as string) ? (req.query.sort as InventorySort) : undefined;
      const { items } = await storage.getSupplierInventory(user!.id, filters, sort, 1, 100000);
      const headers = ["Product", "SKU", "Category", "Brand", "Stock", "Min Stock", "Unit", "Price", "Inventory Value", "Status", "Visibility"];
      const escapeCsv = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = items.map((i) => [i.productName, i.sku ?? "", i.categoryName ?? "", i.brandName ?? "", i.stock, i.minStock, i.unit, (i.price / 100).toFixed(2), (i.inventoryValue / 100).toFixed(2), i.stockStatus, i.visibility].map(escapeCsv).join(","));
      const csv = [headers.map(escapeCsv).join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="inventory-export.csv"`);
      res.send(csv);
    } catch (err) { console.error(err); res.status(500).json({ message: "Error" }); }
  });

  app.get("/api/supplier/inventory/:listingId/history", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const listingId = parseInt(req.params.listingId);
      const history = await storage.getListingStockHistory(listingId, user!.id);
      res.json(history);
    } catch (err: any) { res.status(400).json({ message: err?.message ?? "Error" }); }
  });

  app.patch("/api/supplier/inventory/:listingId", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const listingId = parseInt(req.params.listingId);
      const body = z.object({
        sku: z.string().nullable().optional(),
        barcode: z.string().nullable().optional(),
        minStock: z.number().min(0).optional(),
        maxStock: z.number().min(0).nullable().optional(),
        unit: z.string().min(1).optional(),
        visibility: z.enum(['VISIBLE', 'HIDDEN']).optional(),
      }).parse(req.body);
      const updated = await storage.updateListingInventoryFields(listingId, user!.id, body);
      broadcast("inventory_updated", { supplierId: user!.id, listingId });
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(400).json({ message: err?.message ?? "Error" });
    }
  });

  app.patch("/api/supplier/inventory/:listingId/stock", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const listingId = parseInt(req.params.listingId);
      const body = z.object({
        type: z.enum(['INCREASE', 'DECREASE', 'SET']),
        quantity: z.number().min(0),
        reason: z.string().min(1),
        notes: z.string().optional(),
      }).parse(req.body);
      const result = await storage.adjustListingStock(listingId, user!.id, user!.id, body);
      broadcast("inventory_updated", { supplierId: user!.id, listingId });
      invalidateMarketplaceOnBroadcast();
      res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(400).json({ message: err?.message ?? "Error" });
    }
  });

  app.patch("/api/supplier/inventory/:listingId/variants/:variantId", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const variantId = parseInt(req.params.variantId);
      const body = z.object({
        minStock: z.number().min(0).nullable().optional(),
        maxStock: z.number().min(0).nullable().optional(),
      }).parse(req.body);
      const updated = await storage.updateVariantInventoryFields(variantId, user!.id, body);
      broadcast("inventory_updated", { supplierId: user!.id, listingId: parseInt(req.params.listingId) });
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(400).json({ message: err?.message ?? "Error" });
    }
  });

  app.patch("/api/supplier/inventory/:listingId/variants/:variantId/stock", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const variantId = parseInt(req.params.variantId);
      const body = z.object({
        type: z.enum(['INCREASE', 'DECREASE', 'SET']),
        quantity: z.number().min(0),
        reason: z.string().min(1),
        notes: z.string().optional(),
      }).parse(req.body);
      const result = await storage.adjustVariantStock(variantId, user!.id, user!.id, body);
      broadcast("inventory_updated", { supplierId: user!.id, listingId: parseInt(req.params.listingId) });
      invalidateMarketplaceOnBroadcast();
      if (result.lowStockTriggered) {
        broadcast("low_stock_alert", {
          supplierId: user!.id,
          listingId: parseInt(req.params.listingId),
          variantId,
          stock: result.variant.quantity,
          minStock: result.variant.minStock,
          status: result.variant.quantity <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
        });
      }
      res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(400).json({ message: err?.message ?? "Error" });
    }
  });

  app.post("/api/supplier/inventory/bulk", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const body = z.object({
        action: z.enum(['hide', 'show', 'delete', 'setMinStock', 'stock']),
        listingIds: z.array(z.number()).min(1),
        minStock: z.number().min(0).optional(),
        type: z.enum(['INCREASE', 'DECREASE', 'SET']).optional(),
        quantity: z.number().min(0).optional(),
        reason: z.string().optional(),
      }).parse(req.body);
      const result = await storage.bulkInventoryAction(user!.id, body.listingIds, body.action, { ...body, userId: user!.id });
      broadcast("inventory_updated", { supplierId: user!.id });
      invalidateMarketplaceOnBroadcast();
      res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(400).json({ message: err?.message ?? "Error" });
    }
  });

  // Marketplace listens for "supplier_mapping_changed" to refresh; reuse that event so
  // café-facing marketplace/product views also refresh after any inventory change.
  function invalidateMarketplaceOnBroadcast() {
    broadcast("supplier_mapping_changed", {});
  }

  // ── Supplier Packs (bundle own listings into a sellable Pack) ────────────────

  const packItemSchema = z.object({
    listingId: z.number(),
    variantId: z.number().nullable().optional(),
    flavorIds: z.array(z.number().int()).min(1).nullable().optional(),
    quantity: z.number().min(1),
    packVariantPrice: z.number().min(0).optional(),
  });
  const packBodySchema = z.object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    imageUrls: z.array(z.string()).max(4).nullable().optional(),
    flashImageUrl: z.string().nullable().optional(),
    price: z.number().min(0),
    quantityAvailable: z.number().min(0).optional(), // ignored — pack stock is auto-computed from variant stock
    expirationDate: z.string().nullable().optional(),
    visibility: z.enum(['VISIBLE', 'HIDDEN']).optional(),
    items: z.array(packItemSchema).min(1),
  });

  // Expiration date, if provided, must not be in the past
  function validatePackExpiration(expirationDate: string | null | undefined): string | null {
    if (!expirationDate) return null;
    const d = new Date(expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) return "Expiration date cannot be in the past";
    return null;
  }

  app.get('/api/supplier/packs', requireApprovedSupplier, async (req: any, res) => {
    try { res.json(await storage.getSupplierPacks(req.session.userId)); }
    catch { res.status(500).json({ message: 'Error' }); }
  });

  app.post('/api/supplier/packs', requireApprovedSupplier, async (req: any, res) => {
    try {
      const body = packBodySchema.parse(req.body);
      if (!await storage.validatePackItems(req.session.userId, body.items)) {
        return res.status(400).json({ message: 'One of the selected products or variants is no longer active' });
      }
      const expirationError = validatePackExpiration(body.expirationDate);
      if (expirationError) return res.status(400).json({ message: expirationError });
      const itemsTotal = await storage.computePackItemsTotal(body.items);
      const priceCents = Math.round(body.price * 100);
      if (itemsTotal > 0 && priceCents >= itemsTotal) {
        return res.status(400).json({ message: "Pack price must be lower than the total price of the included products" });
      }
      const autoQuantity = await storage.computeAutoPackQuantity(body.items);
      const pack = await storage.createPack(req.session.userId, {
        name: body.name,
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        imageUrls: body.imageUrls ?? null,
        flashImageUrl: body.flashImageUrl ?? null,
        price: priceCents,
        quantityAvailable: autoQuantity,
        expirationDate: body.expirationDate ? new Date(body.expirationDate) : null,
        visibility: body.visibility ?? 'VISIBLE',
      }, body.items.map(i => ({ ...i, packVariantPrice: i.packVariantPrice !== undefined ? Math.round(i.packVariantPrice * 100) : 0 })));
      broadcast('pack_updated', { packId: pack.id, supplierId: req.session.userId });
      res.status(201).json(pack);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else { console.error(err); res.status(500).json({ message: 'Error' }); }
    }
  });

  app.patch('/api/supplier/packs/:id', requireApprovedSupplier, async (req: any, res) => {
    try {
      const packId = parseInt(req.params.id);
      const body = packBodySchema.partial().extend({ isArchived: z.boolean().optional() }).parse(req.body);
      if (body.items) {
        if (!await storage.validatePackItems(req.session.userId, body.items)) {
          return res.status(400).json({ message: 'One of the selected products or variants is no longer active' });
        }
      }
      if (body.expirationDate !== undefined) {
        const expirationError = validatePackExpiration(body.expirationDate);
        if (expirationError) return res.status(400).json({ message: expirationError });
      }
      // Price validation: needs the item list — use the incoming items if provided,
      // otherwise fall back to the pack's existing items.
      let priceCheckItems: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[] | undefined = body.items as any;
      if (!priceCheckItems && body.price !== undefined) {
        const existingItems = await db.select().from(packItemsTable).where(eq(packItemsTable.packId, packId));
        priceCheckItems = existingItems.map(i => ({ listingId: i.listingId, variantId: i.variantId, flavorIds: i.flavorIds, quantity: i.quantity }));
      }
      const effectivePriceCents = body.price !== undefined ? Math.round(body.price * 100) : undefined;
      if (priceCheckItems && effectivePriceCents !== undefined) {
        const itemsTotal = await storage.computePackItemsTotal(priceCheckItems);
        if (itemsTotal > 0 && effectivePriceCents >= itemsTotal) {
          return res.status(400).json({ message: "Pack price must be lower than the total price of the included products" });
        }
      }
      const autoQuantity = body.items ? await storage.computeAutoPackQuantity(body.items as any) : undefined;
      const updated = await storage.updatePack(packId, req.session.userId, {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
        ...(body.imageUrls !== undefined && { imageUrls: body.imageUrls }),
        ...(body.flashImageUrl !== undefined && { flashImageUrl: body.flashImageUrl }),
        ...(body.price !== undefined && { price: Math.round(body.price * 100) }),
        ...(autoQuantity !== undefined && { quantityAvailable: autoQuantity }),
        ...(body.expirationDate !== undefined && { expirationDate: body.expirationDate ? new Date(body.expirationDate) : null }),
        ...(body.visibility !== undefined && { visibility: body.visibility }),
        ...(body.isArchived !== undefined && { isArchived: body.isArchived }),
      }, body.items ? (body.items as any[]).map((i: any) => ({ ...i, packVariantPrice: i.packVariantPrice !== undefined ? Math.round(i.packVariantPrice * 100) : 0 })) : undefined);
      if (!updated) return res.status(404).json({ message: 'Not found' });
      broadcast('pack_updated', { packId, supplierId: req.session.userId });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else { console.error(err); res.status(500).json({ message: 'Error' }); }
    }
  });

  app.post('/api/supplier/packs/:id/duplicate', requireApprovedSupplier, async (req: any, res) => {
    try {
      const dup = await storage.duplicatePack(parseInt(req.params.id), req.session.userId);
      if (!dup) return res.status(404).json({ message: 'Not found' });
      broadcast('pack_updated', { packId: dup.id, supplierId: req.session.userId });
      res.status(201).json(dup);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.delete('/api/supplier/packs/:id', requireApprovedSupplier, async (req: any, res) => {
    try {
      const packId = parseInt(req.params.id);
      const [existing] = await db.select().from(packs).where(eq(packs.id, packId));
      if (!existing || existing.supplierId !== req.session.userId) return res.status(404).json({ message: 'Not found' });
      await storage.deletePack(packId);
      broadcast('pack_updated', { packId, supplierId: req.session.userId });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // ── Marketplace Packs (cafe browsing) ────────────────────────────────────────

  app.get('/api/marketplace/packs', async (req, res) => {
    try {
      const filters = {
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
        subCategoryId: req.query.subCategoryId ? parseInt(req.query.subCategoryId as string) : undefined,
        brandId: req.query.brandId ? parseInt(req.query.brandId as string) : undefined,
        flavorId: req.query.flavorId ? parseInt(req.query.flavorId as string) : undefined,
        sizeId: req.query.sizeId ? parseInt(req.query.sizeId as string) : undefined,
      };
      res.json(await storage.getMarketplacePacks(filters));
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.get('/api/marketplace/packs/:id', async (req, res) => {
    try {
      const pack = await storage.getPackDetail(parseInt(req.params.id));
      if (!pack || !pack.isAvailable) return res.status(404).json({ message: 'Not found' });
      res.json(pack);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.get('/api/stores/:id/packs', async (req, res) => {
    try {
      const [store] = await db.select().from(supplierStores).where(eq(supplierStores.id, parseInt(req.params.id)));
      if (!store) return res.status(404).json({ message: 'Not found' });
      res.json(await storage.getMarketplacePacks({ supplierId: store.supplierId }));
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // ── Admin Packs management ───────────────────────────────────────────────────

  app.get('/api/admin/packs', requireAdmin, async (req, res) => {
    try { res.json(await storage.getAdminPacks()); }
    catch { res.status(500).json({ message: 'Error' }); }
  });

  app.patch('/api/admin/packs/:id', requireAdmin, async (req, res) => {
    try {
      const packId = parseInt(req.params.id);
      const [existing] = await db.select().from(packs).where(eq(packs.id, packId));
      if (!existing) return res.status(404).json({ message: 'Not found' });
      const body = z.object({
        visibility: z.enum(['VISIBLE', 'HIDDEN']).optional(),
        isArchived: z.boolean().optional(),
      }).parse(req.body);
      const updated = await storage.updatePack(packId, existing.supplierId, body);
      broadcast('pack_updated', { packId, supplierId: existing.supplierId });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: 'Error' });
    }
  });

  app.delete('/api/admin/packs/:id', requireAdmin, async (req, res) => {
    try {
      const packId = parseInt(req.params.id);
      const [existing] = await db.select().from(packs).where(eq(packs.id, packId));
      if (!existing) return res.status(404).json({ message: 'Not found' });
      await storage.deletePack(packId);
      broadcast('pack_updated', { packId, supplierId: existing.supplierId });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // ── Supplier Store (own public store profile) ────────────────────────────────

  app.get('/api/supplier/store', requireApprovedSupplier, async (req: any, res) => {
    try {
      const store = await storage.getSupplierStore(req.session.userId);
      res.json(store ?? null);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.put('/api/supplier/store', requireApprovedSupplier, async (req: any, res) => {
    try {
      const { coverUrl, logoUrl, name, description, isOpen, visibility, mediaType, coverUrls, videoUrl, musicUrl, openingHours } = req.body ?? {};
      if (visibility !== undefined && !['VISIBLE', 'HIDDEN'].includes(visibility)) {
        return res.status(400).json({ message: 'Invalid visibility' });
      }
      if (mediaType !== undefined && !['IMAGE', 'VIDEO'].includes(mediaType)) {
        return res.status(400).json({ message: 'Invalid mediaType' });
      }
      if (coverUrls !== undefined && (!Array.isArray(coverUrls) || coverUrls.length > 5)) {
        return res.status(400).json({ message: 'coverUrls must be an array of up to 5 URLs' });
      }
      const store = await storage.upsertSupplierStore(req.session.userId, {
        coverUrl, logoUrl, name, description, isOpen, visibility,
        mediaType, coverUrls, videoUrl, musicUrl, openingHours,
      } as any);
      broadcast('store_updated', { supplierId: req.session.userId, storeId: store.id });
      res.json(store);
    } catch (e) { console.error(e); res.status(500).json({ message: 'Error' }); }
  });

  // ── Admin Stores management ──────────────────────────────────────────────────

  app.get('/api/admin/stores', requireAdmin, async (req, res) => {
    try {
      res.json(await storage.getAllStoresAdmin());
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.get('/api/admin/stores/:id', requireAdmin, async (req, res) => {
    try {
      const detail = await storage.getStoreDetail(parseInt(req.params.id));
      if (!detail) return res.status(404).json({ message: 'Not found' });
      res.json(detail);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.patch('/api/admin/stores/:id/approve', requireAdmin, async (req, res) => {
    try {
      const store = await storage.setStoreApprovalStatus(parseInt(req.params.id), 'APPROVED');
      if (!store) return res.status(404).json({ message: 'Not found' });
      broadcast('store_approval_changed', { storeId: store.id, supplierId: store.supplierId, status: 'APPROVED' });
      res.json(store);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.patch('/api/admin/stores/:id/reject', requireAdmin, async (req, res) => {
    try {
      const store = await storage.setStoreApprovalStatus(parseInt(req.params.id), 'REJECTED');
      if (!store) return res.status(404).json({ message: 'Not found' });
      broadcast('store_approval_changed', { storeId: store.id, supplierId: store.supplierId, status: 'REJECTED' });
      res.json(store);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.patch('/api/admin/stores/:id/hold', requireAdmin, async (req, res) => {
    try {
      const store = await storage.setStoreApprovalStatus(parseInt(req.params.id), 'ON_HOLD');
      if (!store) return res.status(404).json({ message: 'Not found' });
      broadcast('store_approval_changed', { storeId: store.id, supplierId: store.supplierId, status: 'ON_HOLD' });
      res.json(store);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.delete('/api/admin/stores/:id', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const detail = await storage.getStoreDetail(id);
      await storage.deleteStore(id);
      broadcast('store_approval_changed', { storeId: id, supplierId: detail?.supplierId, status: 'DELETED' });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.patch('/api/admin/stores/:id/order', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const displayOrder = parseInt(req.body?.displayOrder);
      if (isNaN(displayOrder)) return res.status(400).json({ message: 'Invalid displayOrder' });
      const store = await storage.updateStoreDisplayOrder(id, displayOrder);
      if (!store) return res.status(404).json({ message: 'Not found' });
      broadcast('store_updated', { storeId: id, supplierId: store.supplierId });
      res.json(store);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.patch('/api/admin/stores/:id/auto-approve', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const autoApprove = Boolean(req.body?.autoApprove);
      const store = await storage.setStoreAutoApprove(id, autoApprove);
      if (!store) return res.status(404).json({ message: 'Not found' });
      broadcast('store_updated', { storeId: id, supplierId: store.supplierId });
      res.json(store);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.patch('/api/admin/stores/bulk-order', requireAdmin, async (req, res) => {
    try {
      const orders: { id: number; displayOrder: number }[] = req.body?.orders;
      if (!Array.isArray(orders)) return res.status(400).json({ message: 'Invalid payload' });
      await storage.bulkUpdateStoreOrder(orders);
      broadcast('store_updated', { bulk: true });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // ── Stores (coffee owner browsing) ───────────────────────────────────────────

  app.get('/api/stores', async (req, res) => {
    try {
      res.json(await storage.getVisibleStores());
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.get('/api/stores/:id', async (req, res) => {
    try {
      const detail = await storage.getStoreDetail(parseInt(req.params.id), { requireVisible: true });
      if (!detail) return res.status(404).json({ message: 'Not found' });
      res.json(detail);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // ── Marketplace (cafe browsing — admin products with variant pricing) ────────

  app.get("/api/marketplace", async (req, res) => {
    try {
      const filters = {
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
        subCategoryId: req.query.subCategoryId ? parseInt(req.query.subCategoryId as string) : undefined,
        search: req.query.search as string | undefined,
      };
      const products = await storage.getMarketplaceProducts(filters);
      const commercial = await hasCommercialAccess(req);
      res.json(commercial ? products : products.map(stripCommercialData));
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Error" });
    }
  });

  // GET /api/marketplace/promotions?listingIds=1,2,3 — badge info for product cards
  // Must be defined BEFORE /api/marketplace/:productId to avoid the wildcard shadowing it
  app.get('/api/marketplace/promotions', async (req: any, res) => {
    try {
      const rawIds = req.query.listingIds as string;
      if (!rawIds) return res.json([]);
      const listingIds = rawIds.split(',').map(Number).filter(Boolean);
      const cafeId = req.session?.userId ? (await storage.getUser(req.session.userId))?.id : undefined;
      const badges = await storage.getPromotionsForListings(listingIds, cafeId);
      res.json(badges);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.get("/api/marketplace/:productId", async (req, res) => {
    try {
      const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined;
      const product = await storage.getMarketplaceProduct(parseInt(req.params.productId), supplierId);
      if (!product) return res.status(404).json({ message: "Not found" });
      const commercial = await hasCommercialAccess(req);
      res.json(commercial ? product : stripCommercialData(product));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // ── Reviews ─────────────────────────────────────────────────────────────────

  // Supplier reviews — only the supplier themselves or admins can fetch the full list
  app.get("/api/reviews/supplier/:supplierId", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
      const caller = await storage.getUser(req.session.userId);
      if (!caller) return res.status(401).json({ message: "Unauthorized" });
      const supplierId = parseInt(req.params.supplierId);
      const isOwner = caller.id === supplierId;
      const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(caller.role);
      if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });
      res.json(await storage.getReviewsBySupplier(supplierId));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Public supplier reviews — anyone can read SUPPLIER-type reviews for a given supplier
  // (used by the Coffee Owner's Pack "Supplier Reviews" tab). This is intentionally
  // separate from /api/reviews/supplier/:supplierId, which is restricted to the
  // supplier's own dashboard / admins.
  app.get("/api/reviews/supplier-public/:supplierId", async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      const reviews = await storage.getReviewsBySupplier(supplierId);
      res.json(reviews.filter(r => (r as any).reviewType !== 'PRODUCT'));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Product review list — returns individual PRODUCT-type reviews for a product
  app.get("/api/reviews/product/:productId/list", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
      const productId = parseInt(req.params.productId);
      const rows = await db.select().from(supplierProductReviews)
        .where(and(
          eq(supplierProductReviews.productId, productId),
          eq(supplierProductReviews.reviewType, 'PRODUCT')
        ))
        .orderBy(desc(supplierProductReviews.createdAt));
      res.json(rows);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Product review stats — available to approved cafe owners/admins/suppliers
  app.get("/api/reviews/product/:productId", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
      const productId = parseInt(req.params.productId);
      res.json(await storage.getReviewStatsByProduct(productId));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/reviews", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'CAFE_OWNER' || user.status !== 'approved') {
        return res.status(403).json({ message: "Only approved cafe owners can submit reviews" });
      }
      const { supplierId, productId, listingId, rating, comment, productName, reviewType } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "rating (1-5) is required" });
      }
      const isProductReview = reviewType === 'PRODUCT';
      if (isProductReview && !productId) {
        return res.status(400).json({ message: "productId is required for product reviews" });
      }
      if (!isProductReview) {
        if (!supplierId) return res.status(400).json({ message: "supplierId is required for supplier reviews" });
        const targetSupplier = await storage.getUser(Number(supplierId));
        if (!targetSupplier || targetSupplier.role !== 'SUPPLIER') {
          return res.status(400).json({ message: "Invalid supplier" });
        }
        if (listingId) {
          const [listing] = await db.select().from(supplierProductListings)
            .where(eq(supplierProductListings.id, Number(listingId)));
          if (!listing || listing.supplierId !== Number(supplierId)) {
            return res.status(400).json({ message: "Listing does not belong to this supplier" });
          }
          if (productId && listing.productId !== Number(productId)) {
            return res.status(400).json({ message: "Listing does not match this product" });
          }
        }
      }
      // Upsert: update existing review if one exists (allows editing)
      const { review, isUpdate } = await storage.upsertReview({
        supplierId: isProductReview ? null : Number(supplierId),
        reviewType: isProductReview ? 'PRODUCT' : 'SUPPLIER',
        cafeId: user.id,
        productId: productId ? Number(productId) : null,
        listingId: (!isProductReview && listingId) ? Number(listingId) : null,
        rating: Number(rating),
        comment: comment ?? null,
        cafeName: user.name,
        cafeOwnerName: user.name,
        productName: productName ?? null,
      });
      res.status(isUpdate ? 200 : 201).json(review);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Report a review (supplier only)
  app.post("/api/reviews/:id/report", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== 'SUPPLIER') return res.status(403).json({ message: "Only suppliers can report reviews" });
      const reviewId = parseInt(req.params.id);
      const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(req.body);
      await storage.reportReview(reviewId, reason);
      res.json({ message: "Review reported" });
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Error" });
    }
  });

  // Admin: get all reviews
  app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
    try {
      const { reviewType } = req.query as Record<string, string>;
      const reviews = await storage.getAllReviews({ reviewType: reviewType || undefined });
      res.json(reviews);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Admin: delete a review
  app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
    try {
      const reviewType = typeof req.query.reviewType === "string" ? req.query.reviewType : undefined;
      if (reviewType === "MAINTENANCE") {
        const deleted = await storage.deleteMaintenanceReview(parseInt(req.params.id));
        if (!deleted) return res.status(404).json({ message: "Maintenance review not found" });
        broadcast("maintenance_review_updated", { reviewId: parseInt(req.params.id) });
      } else {
        await storage.deleteReview(parseInt(req.params.id));
      }
      res.json({ message: "Deleted" });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Admin: resolve a reported review
  app.patch("/api/admin/reviews/:id/resolve", requireAdmin, async (req, res) => {
    try {
      await storage.resolveReviewReport(parseInt(req.params.id));
      if (req.query.reviewType === "MAINTENANCE") broadcast("maintenance_review_updated", { reviewId: parseInt(req.params.id) });
      res.json({ message: "Resolved" });
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Supplier: get product reviews for own listings
  app.get("/api/supplier/reviews/products", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      res.json(await storage.getProductReviewsBySupplier(user!.id));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Supplier: get supplier-type reviews
  app.get("/api/supplier/reviews/supplier", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      res.json(await storage.getSupplierTypeReviews(user!.id));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Cafe owner: get own existing review for a product
  app.get("/api/reviews/my/product/:productId", requireAuth, async (req, res) => {
    try {
      const review = await storage.getExistingProductReview(parseInt(req.params.productId), req.session.userId!);
      res.json(review ?? null);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Cafe owner: get own existing review for a supplier
  app.get("/api/reviews/my/supplier/:supplierId", requireAuth, async (req, res) => {
    try {
      const review = await storage.getExistingSupplierReview(parseInt(req.params.supplierId), req.session.userId!);
      res.json(review ?? null);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  // Pack reviews — any cafe owner can read; approved cafe owners can submit
  app.get("/api/reviews/pack/:packId", async (req, res) => {
    try {
      const packId = parseInt(req.params.packId);
      res.json(await storage.getPackReviews(packId));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/reviews/pack/:packId", async (req: any, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'CAFE_OWNER' || (user as any).status !== 'approved') {
        return res.status(403).json({ message: "Only approved cafe owners can submit reviews" });
      }
      const packId = parseInt(req.params.packId);
      const [pack] = await db.select().from(packs).where(eq(packs.id, packId));
      if (!pack) return res.status(404).json({ message: "Pack not found" });
      const body = z.object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().optional(),
      }).parse(req.body);
      // One review per cafe per pack
      const [existingPackReview] = await db.select().from(supplierProductReviews)
        .where(and(
          eq((supplierProductReviews as any).packId, packId),
          eq(supplierProductReviews.cafeId, user.id),
          eq(supplierProductReviews.reviewType, 'PACK')
        ));
      if (existingPackReview) return res.status(409).json({ message: "You have already reviewed this pack" });
      const review = await storage.createPackReview({
        packId,
        supplierId: pack.supplierId,
        cafeId: user.id,
        rating: body.rating,
        comment: body.comment ?? null,
        cafeName: user.name,
        cafeOwnerName: user.name,
      });
      res.status(201).json(review);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Error" });
    }
  });

  // ── Supplier Variant Endpoints ─────────────────────────────────────────────

  app.get("/api/supplier/listings/:id/variants", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const listingId = parseInt(req.params.id);
      const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
      if (!listing) return res.status(404).json({ message: "Not found" });
      if (listing.supplierId !== user!.id) return res.status(403).json({ message: "Forbidden" });
      res.json(await storage.getVariantsByListingId(listingId));
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/supplier/listings/:id/variants", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const listingId = parseInt(req.params.id);
      const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
      if (!listing) return res.status(404).json({ message: "Not found" });
      if (listing.supplierId !== user!.id) return res.status(403).json({ message: "Forbidden" });
      const { variants } = z.object({
        variants: z.array(z.object({
          flavorId: z.number().nullable().optional(),
          sizeId: z.number().nullable().optional(),
          price: z.number().min(0),
          quantity: z.number().min(0),
        }))
      }).parse(req.body);
      const updated = await storage.saveVariants(listingId, variants.map(v => ({
        flavorId: v.flavorId ?? null,
        sizeId: v.sizeId ?? null,
        price: Math.round(v.price * 100),
        quantity: v.quantity,
      })));
      broadcast("product_updated", { productId: listing.productId, listingId, supplierId: user!.id });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
      else res.status(500).json({ message: "Error" });
    }
  });

  // ── Prospecting (Admin CRM) ──────────────────────────────────────────────────

  app.get('/api/admin/prospecting/stats', requireAdmin, async (_req, res) => {
    try { res.json(await storage.getProspectStats()); }
    catch { res.status(500).json({ message: 'Error' }); }
  });

  app.get('/api/admin/prospecting', requireAdmin, async (req, res) => {
    try {
      const { search, status, prospectType, city, hasPhone, hasWebsite, hasEmail, page, limit, sortBy, sortOrder } = req.query as Record<string, string>;
      const result = await storage.getProspects({
        search, status, prospectType, city,
        hasPhone: hasPhone === 'true' ? true : hasPhone === 'false' ? false : undefined,
        hasWebsite: hasWebsite === 'true' ? true : hasWebsite === 'false' ? false : undefined,
        hasEmail: hasEmail === 'true' ? true : undefined,
        page: page ? parseInt(page) : 1,
        limit: limit ? Math.min(parseInt(limit), 200) : 50,
        sortBy, sortOrder,
      });
      res.json(result);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.post('/api/admin/prospecting/search', requireAdmin, async (req: any, res) => {
    const MAPS_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!MAPS_KEY) return res.status(400).json({ message: 'Google Maps API key not configured' });

    try {
      const { address, radiusKm = 5, keyword = 'coffee', prospectType, minRating, onlyWithPhone, onlyWithWebsite } = req.body;
      if (!address) return res.status(400).json({ message: 'address is required' });

      const startMs = Date.now();
      const radiusKmNum = parseFloat(String(radiusKm));
      const minRatingNum = minRating ? parseFloat(String(minRating)) : null;

      // ── 1. Geocode address ──────────────────────────────────────────────────
      const coords = await geocodeAddress(address, MAPS_KEY);
      if (!coords) {
        return res.status(400).json({ message: 'Geocoding failed: address not found' });
      }
      const { lat, lng } = coords;

      // ── 2. Generate geographic grid ─────────────────────────────────────────
      const grid = generateGrid(lat, lng, radiusKmNum);
      console.log(`[Prospecting] Starting search — Address: "${address}", Radius: ${radiusKmNum} km, Grid cells: ${grid.length}`);

      // ── 3. Concurrent Nearby Search across all grid cells ───────────────────
      const CELL_CONCURRENCY = 8;
      let nearbyRequests = 0;
      const allPlaces: NearbyPlace[] = [];

      await withConcurrency(
        grid,
        async (point) => {
          const { places, requestCount } = await fetchAllNearbyPages(point, keyword, MAPS_KEY);
          nearbyRequests += requestCount;
          allPlaces.push(...places);
        },
        CELL_CONCURRENCY,
      );

      console.log(`[Prospecting] Nearby requests: ${nearbyRequests}, Raw places found: ${allPlaces.length}`);

      // ── 4. Deduplicate by Google place_id ───────────────────────────────────
      const uniqueMap = new Map<string, NearbyPlace>();
      for (const p of allPlaces) {
        if (!uniqueMap.has(p.place_id)) uniqueMap.set(p.place_id, p);
      }
      const uniquePlaces = Array.from(uniqueMap.values());
      console.log(`[Prospecting] Unique places after deduplication: ${uniquePlaces.length}`);

      // ── 5. Apply rating filter before detail fetching ───────────────────────
      const ratingFiltered = minRatingNum
        ? uniquePlaces.filter(p => (p.rating ?? 0) >= minRatingNum)
        : uniquePlaces;

      // ── 6. DB duplicate check (skip places already saved) ──────────────────
      const DB_CHECK_CONCURRENCY = 20;
      const dupCheckResults = await withConcurrency(
        ratingFiltered,
        async (place) => {
          const existing = await storage.findDuplicateProspect({ googlePlaceId: place.place_id });
          return existing ? null : place;
        },
        DB_CHECK_CONCURRENCY,
      );
      const toFetch    = dupCheckResults.filter((r): r is NearbyPlace => r !== null);
      const duplicates = ratingFiltered.length - toFetch.length;
      console.log(`[Prospecting] To fetch details: ${toFetch.length} (${duplicates} DB duplicates skipped)`);

      // ── 7. Fetch Place Details with concurrency limit ───────────────────────
      const DETAIL_CONCURRENCY = 8;
      const detailResults = await withConcurrency(
        toFetch,
        async (place) => {
          const details = await fetchPlaceDetails(place.place_id, MAPS_KEY);
          return { place, details };
        },
        DETAIL_CONCURRENCY,
      );
      const detailsFetched = detailResults.filter(r => r !== null).length;
      console.log(`[Prospecting] Place details fetched: ${detailsFetched}`);

      // ── 8. Apply filters, score, and save ───────────────────────────────────
      const caller     = await storage.getUser(req.session.userId);
      const callerName = caller?.name ?? 'Admin';
      let saved = 0, skipped = 0;

      for (const item of detailResults) {
        if (!item) { skipped++; continue; }
        const { place, details } = item;

        const phone   = details?.formatted_phone_number ?? null;
        const website = details?.website ?? null;

        if (onlyWithPhone   && !phone)   { skipped++; continue; }
        if (onlyWithWebsite && !website) { skipped++; continue; }

        const { city, country } = extractAddressComponents(details?.address_components);
        const distKm = calculateDistanceKm(lat, lng, place.geometry.location.lat, place.geometry.location.lng);
        const score  = calculateProspectScore(place, details);

        await storage.createProspect({
          googlePlaceId: place.place_id,
          businessName:  place.name,
          businessType:  (place.types ?? []).join(', '),
          prospectType:  prospectType ?? null,
          address:       place.vicinity ?? null,
          latitude:      String(place.geometry.location.lat),
          longitude:     String(place.geometry.location.lng),
          phone,
          website,
          rating:        place.rating != null ? String(place.rating) : null,
          reviewCount:   place.user_ratings_total ?? 0,
          status:        'NEW',
          distanceKm:    distKm.toFixed(2),
          searchCenter:  address,
          searchRadius:  String(radiusKm),
          keyword,
          city:          city ?? null,
          country:       country ?? 'Tunisia',
          prospectScore: score,
          notes:    [],
          timeline: [{
            id:        Date.now().toString(),
            event:     'Created via Google Places grid search',
            detail:    `Grid search: "${keyword}" near ${address} (${radiusKmNum} km, ${grid.length} cells)`,
            createdAt: new Date().toISOString(),
            userName:  callerName,
          }],
          contacts: [],
        } as any);
        saved++;
      }

      const elapsedMs = Date.now() - startMs;

      console.log(
        `[Prospecting] Summary:\n` +
        `  Grid cells generated:          ${grid.length}\n` +
        `  Nearby requests executed:      ${nearbyRequests}\n` +
        `  Google places found:           ${allPlaces.length}\n` +
        `  Unique places after dedup:     ${uniquePlaces.length}\n` +
        `  Place details fetched:         ${detailsFetched}\n` +
        `  Prospects saved:               ${saved}\n` +
        `  Elapsed time:                  ${(elapsedMs / 1000).toFixed(1)}s`,
      );

      res.json({
        searchCenter:     `${lat},${lng}`,
        gridCells:        grid.length,
        nearbyRequests,
        googlePlacesFound: allPlaces.length,
        uniquePlaces:     uniquePlaces.length,
        detailsFetched,
        saved,
        skipped,
        duplicates,
        elapsedMs,
      } satisfies import('./prospecting-engine').ProspectingResult);

    } catch (err: any) {
      console.error('[Prospecting search]', err);
      res.status(500).json({ message: err?.message ?? 'Search failed' });
    }
  });

  app.post('/api/admin/prospecting', requireAdmin, async (req: any, res) => {
    try {
      const caller = await storage.getUser(req.session.userId);
      const data = req.body;
      if (!data.businessName) return res.status(400).json({ message: 'businessName is required' });
      const prospect = await storage.createProspect({
        ...data,
        timeline: [{
          id: Date.now().toString(),
          event: 'Prospect created manually',
          createdAt: new Date().toISOString(),
          userName: caller?.name ?? 'Admin',
        }],
      } as any);
      res.status(201).json(prospect);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.get('/api/admin/prospecting/export', requireAdmin, async (req, res) => {
    try {
      const result = await storage.getProspects({ limit: 10000, page: 1 });
      const headers = ['ID','Business Name','Type','Status','Phone','Website','Email','Address','City','Country','Rating','Reviews','Distance (km)','Score','Assigned To','Created At','Notes'];
      const rows = result.prospects.map(p => [
        p.id, p.businessName, p.prospectType ?? '', p.status, p.phone ?? '', p.website ?? '',
        p.email ?? '', p.address ?? '', p.city ?? '', p.country ?? '', p.rating ?? '',
        p.reviewCount ?? 0, p.distanceKm ?? '', p.prospectScore ?? 0, p.assignedTo ?? '',
        p.createdAt ? new Date(p.createdAt).toISOString() : '',
        ((p.notes as any[]) ?? []).map((n: any) => n.text).join(' | '),
      ]);
      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="prospects.csv"');
      res.send(csv);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.get('/api/admin/prospecting/:id', requireAdmin, async (req, res) => {
    try {
      const p = await storage.getProspect(parseInt(req.params.id));
      if (!p) return res.status(404).json({ message: 'Not found' });
      res.json(p);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.patch('/api/admin/prospecting/:id', requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getProspect(id);
      if (!existing) return res.status(404).json({ message: 'Not found' });
      const caller = await storage.getUser(req.session.userId);
      const data = req.body;

      // Auto-append timeline event on status change
      let timeline = (existing.timeline as any[]) ?? [];
      if (data.status && data.status !== existing.status) {
        timeline = [...timeline, {
          id: Date.now().toString(),
          event: `Status changed: ${existing.status} → ${data.status}`,
          createdAt: new Date().toISOString(),
          userName: caller?.name ?? 'Admin',
        }];
        if (data.status === 'CALLED') data.lastContactDate = new Date().toISOString();
      }
      if (data.assignedTo && data.assignedTo !== existing.assignedTo) {
        const assignee = await storage.getUser(Number(data.assignedTo));
        timeline = [...timeline, {
          id: (Date.now() + 1).toString(),
          event: `Assigned to ${assignee?.name ?? 'user #' + data.assignedTo}`,
          createdAt: new Date().toISOString(),
          userName: caller?.name ?? 'Admin',
        }];
      }

      const updated = await storage.updateProspect(id, { ...data, timeline } as any);
      res.json(updated);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.delete('/api/admin/prospecting/:id', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getProspect(id);
      if (!existing) return res.status(404).json({ message: 'Not found' });
      await storage.softDeleteProspect(id);
      res.json({ ok: true });
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // ── Promotions (Supplier) ──────────────────────────────────────────────────

  const requireSupplier = async (req: any, res: any, next: any) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== 'SUPPLIER') return res.status(403).json({ message: 'Forbidden' });
    (req as any).supplier = user;
    next();
  };

  // GET /api/promotions — supplier's own promotions list
  app.get('/api/promotions', requireSupplier, async (req: any, res) => {
    try {
      const promos = await storage.getPromotions(req.supplier.id);
      res.json(promos);
    } catch { res.status(500).json({ message: 'Error fetching promotions' }); }
  });

  // GET /api/promotions/stats — supplier dashboard stats
  app.get('/api/promotions/stats', requireSupplier, async (req: any, res) => {
    try {
      const stats = await storage.getPromotionStats(req.supplier.id);
      res.json(stats);
    } catch { res.status(500).json({ message: 'Error fetching promotion stats' }); }
  });

  // GET /api/promotions/my-listings — supplier's listings for promotion assignment UI
  app.get('/api/promotions/my-listings', requireSupplier, async (req: any, res) => {
    try {
      const listings = await storage.getSupplierListings(req.supplier.id);
      res.json(
        listings
          .filter(l => !l.onlyForPack)
          .map(l => ({
            listingId: l.id,
            productId: l.product.id,
            productName: l.product.name,
            imageUrl: l.product.imageUrl,
            category: l.product.category,
            categoryId: l.product.categoryId,
            price: l.price,
            stock: l.stock,
          }))
      );
    } catch { res.status(500).json({ message: 'Error fetching listings' }); }
  });

  // GET /api/promotions/my-categories — supplier's categories for promotion assignment UI
  app.get('/api/promotions/my-categories', requireSupplier, async (req: any, res) => {
    try {
      const [listings, allCategories] = await Promise.all([
        storage.getSupplierListings(req.supplier.id),
        storage.getCategories(),
      ]);
      // Build a name→id lookup from the categories table
      const catNameToId = new Map(allCategories.map(c => [c.name.toLowerCase(), c.id]));

      const catMap = new Map<number, { id: number; name: string; productCount: number }>();
      for (const l of listings.filter(l => !l.onlyForPack)) {
        const catName = l.product.category;
        // Use categoryId from product FK, or resolve by name from the categories table
        const catId = l.product.categoryId ?? catNameToId.get(catName?.toLowerCase() ?? '') ?? null;
        if (catId && catName) {
          const ex = catMap.get(catId);
          if (ex) ex.productCount++;
          else catMap.set(catId, { id: catId, name: catName, productCount: 1 });
        }
      }
      res.json(Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch { res.status(500).json({ message: 'Error fetching categories' }); }
  });

  // GET /api/promotions/:id — single promotion
  app.get('/api/promotions/:id', requireSupplier, async (req: any, res) => {
    try {
      const promo = await storage.getPromotion(parseInt(req.params.id), req.supplier.id);
      if (!promo) return res.status(404).json({ message: 'Not found' });
      res.json(promo);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // GET /api/promotions/:id/usage — usage history
  app.get('/api/promotions/:id/usage', requireSupplier, async (req: any, res) => {
    try {
      const promo = await storage.getPromotion(parseInt(req.params.id), req.supplier.id);
      if (!promo) return res.status(404).json({ message: 'Not found' });
      const usage = await storage.getPromotionUsage(promo.id);
      res.json(usage);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // POST /api/promotions — create
  app.post('/api/promotions', requireSupplier, async (req: any, res) => {
    try {
      const body = req.body;
      const promo = await storage.createPromotion({
        ...body,
        supplierId: req.supplier.id,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      });
      broadcast('promotion_updated', { supplierId: req.supplier.id });
      res.status(201).json(promo);
    } catch (err: any) {
      res.status(400).json({ message: err?.message ?? 'Error creating promotion' });
    }
  });

  // PATCH /api/promotions/:id/targets — update only targetListingIds / targetCategoryIds
  // Dedicated lightweight endpoint so assignment saves never touch unrelated fields
  app.patch('/api/promotions/:id/targets', requireSupplier, async (req: any, res) => {
    try {
      const { targetListingIds, targetCategoryIds } = req.body;
      const updates: Record<string, any> = {};
      if (Array.isArray(targetListingIds)) updates.targetListingIds = targetListingIds.map(Number);
      if (Array.isArray(targetCategoryIds)) updates.targetCategoryIds = targetCategoryIds.map(Number);
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'No target fields provided' });
      const updated = await storage.updatePromotion(parseInt(req.params.id), req.supplier.id, updates);
      if (!updated) return res.status(404).json({ message: 'Not found' });
      broadcast('promotion_updated', { supplierId: req.supplier.id, promotionId: updated.id });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err?.message ?? 'Error updating targets' });
    }
  });

  // PUT /api/promotions/:id — update full promotion details
  app.put('/api/promotions/:id', requireSupplier, async (req: any, res) => {
    try {
      const body = req.body;
      // Strip server-managed / read-only fields so Drizzle never tries to cast them
      const { id: _id, supplierId: _s, usageCount: _u, createdAt: _ca, updatedAt: _ua, ...safeBody } = body;
      const updated = await storage.updatePromotion(parseInt(req.params.id), req.supplier.id, {
        ...safeBody,
        startDate: safeBody.startDate ? new Date(safeBody.startDate) : null,
        endDate: safeBody.endDate ? new Date(safeBody.endDate) : null,
      });
      if (!updated) return res.status(404).json({ message: 'Not found' });
      broadcast('promotion_updated', { supplierId: req.supplier.id, promotionId: updated.id });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err?.message ?? 'Error updating promotion' });
    }
  });

  // PATCH /api/promotions/:id/status — quick status change
  app.patch('/api/promotions/:id/status', requireSupplier, async (req: any, res) => {
    try {
      const { status } = req.body;
      if (!['ACTIVE', 'PAUSED', 'SCHEDULED', 'EXPIRED'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      const updated = await storage.updatePromotion(parseInt(req.params.id), req.supplier.id, { status });
      if (!updated) return res.status(404).json({ message: 'Not found' });
      broadcast('promotion_updated', { supplierId: req.supplier.id, promotionId: updated.id });
      res.json(updated);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // POST /api/promotions/:id/duplicate — duplicate
  app.post('/api/promotions/:id/duplicate', requireSupplier, async (req: any, res) => {
    try {
      const dup = await storage.duplicatePromotion(parseInt(req.params.id), req.supplier.id);
      if (!dup) return res.status(404).json({ message: 'Not found' });
      broadcast('promotion_updated', { supplierId: req.supplier.id, promotionId: dup.id });
      res.status(201).json(dup);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // DELETE /api/promotions/:id — delete
  app.delete('/api/promotions/:id', requireSupplier, async (req: any, res) => {
    try {
      await storage.deletePromotion(parseInt(req.params.id), req.supplier.id);
      broadcast('promotion_updated', { supplierId: req.supplier.id, promotionId: parseInt(req.params.id) });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // ── Promotions (Cafe / Marketplace) ──────────────────────────────────────────

  // POST /api/promotions/evaluate — evaluate cart and return discount info
  app.post('/api/promotions/evaluate', requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== 'CAFE_OWNER') return res.status(403).json({ message: 'Forbidden' });

      const { items } = req.body as {
        items: { listingId: number; productId: number; categoryId?: number | null; supplierId: number; quantity: number; unitPrice: number }[];
      };
      if (!Array.isArray(items) || items.length === 0) {
        return res.json({ bySupplier: [], totalOriginal: 0, totalDiscount: 0, totalFinal: 0 });
      }

      const itemsBySupplier = new Map<number, import('./promotions-engine').PromoCartItem[]>();
      for (const item of items) {
        if (!itemsBySupplier.has(item.supplierId)) itemsBySupplier.set(item.supplierId, []);
        itemsBySupplier.get(item.supplierId)!.push({
          listingId: item.listingId,
          productId: item.productId,
          categoryId: item.categoryId ?? null,
          supplierId: item.supplierId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        });
      }

      const result = await storage.evaluateCartPromotions(itemsBySupplier, user.id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? 'Error evaluating promotions' });
    }
  });

  // GET /api/supplier/:supplierId/promotions — public active promotions for a supplier store page
  app.get('/api/supplier/:supplierId/promotions', async (req: any, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      const cafeId = req.session?.userId ? req.session.userId : undefined;
      const promos = await storage.getActivePromotionsForSupplier(supplierId, cafeId);
      // Return only public-safe fields
      res.json(promos.map(p => ({
        id: p.id, name: p.name, description: p.description, type: p.type,
        discountValue: p.discountValue, buyQuantity: p.buyQuantity, getQuantity: p.getQuantity,
        tiers: p.tiers, giftInfo: p.giftInfo, freeShippingMinAmount: p.freeShippingMinAmount,
        minimumOrderValue: p.minimumOrderValue, minimumQuantity: p.minimumQuantity,
        endDate: p.endDate, targetType: p.targetType,
      })));
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.post('/api/admin/prospecting/bulk', requireAdmin, async (req: any, res) => {
    try {
      const { action, ids, data } = req.body;
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids required' });
      const caller = await storage.getUser(req.session.userId);
      if (action === 'delete') {
        await storage.bulkSoftDeleteProspects(ids);
      } else if (action === 'archive') {
        await storage.bulkUpdateProspects(ids, { status: 'ARCHIVED' } as any);
      } else if (action === 'status' && data?.status) {
        await storage.bulkUpdateProspects(ids, { status: data.status } as any);
      } else if (action === 'assign' && data?.assignedTo) {
        await storage.bulkUpdateProspects(ids, { assignedTo: data.assignedTo } as any);
      } else if (action === 'mark_called') {
        await storage.bulkUpdateProspects(ids, { status: 'CALLED', lastContactDate: new Date() } as any);
      } else {
        return res.status(400).json({ message: 'Unknown action' });
      }
      res.json({ ok: true, affected: ids.length });
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // ── Messaging routes ──────────────────────────────────────────────────────

  /** GET /api/messages/conversations — list all visible conversations for the current user */
  app.get("/api/messages/conversations", requireAuth, async (req: any, res) => {
    try {
      const userId: number = req.session.userId;
      const service = typeof req.query.service === "string" ? req.query.service : undefined;
      if (service && !["SHOP", "MAINTENANCE", "BARISTA", "PRINT", "MARKETING"].includes(service)) {
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
    if (typeof service !== "string" || !["SHOP", "MAINTENANCE", "BARISTA", "PRINT", "MARKETING"].includes(service)) {
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
      if (service && !["SHOP", "MAINTENANCE", "BARISTA", "PRINT", "MARKETING"].includes(service)) {
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
      if (service && !["SHOP", "MAINTENANCE", "BARISTA", "PRINT", "MARKETING"].includes(service)) {
        return res.status(400).json({ message: "Invalid service" });
      }
      const conversations = await storage.adminGetAllConversations(service);
      res.json(conversations);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}

