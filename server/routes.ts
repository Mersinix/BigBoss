import type { Express } from "express";
import { createServer, type Server } from "http";
import { broadcast } from "./ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import MemoryStore from "memorystore";
import { db } from "./db";
import {
  users, categories, subCategories, flavors, sizes, brands, products, supplierProductListings, supplierCategories, supplierSubCategories,
  insertCategorySchema, insertSubCategorySchema, insertFlavorSchema,
  insertSizeSchema, insertBrandSchema,
  type MarketplaceProduct,
  supplierProductReviews, supplierStores, packs, packItems as packItemsTable,
  supplierProductVariants,
  type InventoryFilters, type InventorySort,
} from "@shared/schema";
import { eq, and, inArray, desc } from "drizzle-orm";

declare module "express-session" {
  interface SessionData { userId: number; }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const SessionStore = MemoryStore(session);
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new SessionStore({ checkPeriod: 86400000 }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
    },
  }));

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

  function canUpdateOrderStatus(user: { id: number; role: string }, order: any, newStatus: string): boolean {
    if (['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return true;
    if (user.role === 'CAFE_OWNER') {
      return order.cafeId === user.id && newStatus === 'CANCELLED' && order.status === 'PENDING';
    }
    if (user.role === 'SUPPLIER') {
      const involved = order.supplierId === user.id || order.subOrders?.some((so: any) => so.supplierId === user.id);
      if (!involved) return false;
      return ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'CANCELLED'].includes(newStatus);
    }
    if (user.role === 'DRIVER' || user.role === 'DELIVERY_COMPANY') {
      return ['READY', 'IN_DELIVERY', 'DELIVERED'].includes(newStatus)
        && ['READY', 'IN_DELIVERY'].includes(order.status);
    }
    return false;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  const registerBodySchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum(['CAFE_OWNER', 'SUPPLIER', 'DELIVERY_COMPANY', 'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE']).optional(),
    phone: z.string().optional().nullable(),
    governorates: z.array(z.string()).optional().nullable(),
    printCategories: z.array(z.string()).optional().nullable(),
    marketingCategories: z.array(z.string()).optional().nullable(),
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
      const PENDING_ROLES = ['CAFE_OWNER', 'SUPPLIER', 'DELIVERY_COMPANY', 'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE'];
      const LOCATION_REQUIRED_ROLES = ['CAFE_OWNER', 'SUPPLIER', 'PRINTER', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE'];
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
      const VALID_SERVICES = ['PRINTING', 'MARKETING', 'BARISTA'];
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
      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ message: "Error" });
    }
  });

  app.put(api.products.update.path, requireAdmin, async (req, res) => {
    try {
      const product = await storage.updateProduct(parseInt(req.params.id), req.body);
      res.json(product);
    } catch (err) {
      res.status(400).json({ message: "Invalid" });
    }
  });

  app.delete(api.products.delete.path, requireAdmin, async (req, res) => {
    try {
      await storage.deleteProduct(parseInt(req.params.id));
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
      res.json(await storage.updateProduct(parseInt(req.params.id), updates));
    } catch (err) {
      res.status(400).json({ message: "Invalid" });
    }
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteProduct(parseInt(req.params.id));
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
      res.json(await storage.updateProduct(parseInt(req.params.id), updates));
    } catch { res.status(400).json({ message: "Invalid" }); }
  });

  app.delete("/api/admin/supplier-products/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteProduct(parseInt(req.params.id));
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
      if (user?.role === 'DRIVER') filters.deliveryId = user.id;
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

      const { items, packItems, deliveryAddress, courierInstructions } = z.object({
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
        })).optional(),
        deliveryAddress: deliveryAddressSchema,
        courierInstructions: z.string().max(500).optional(),
      }).parse(req.body);

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
        courierInstructions,
        packItems: validatedPackItems,
        promotionResults: promoEval.bySupplier,
      });

      // Record promotion usage for each applied promotion
      for (const result of promoEval.bySupplier) {
        if (result.promotionId && result.discountAmount > 0) {
          await storage.recordPromotionUsage(result.promotionId, cafeId, order.id, result.discountAmount);
        }
      }

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
      if (order.status !== 'CANCELLED' && input.status === 'CANCELLED') {
        broadcast("inventory_updated", { orderId });
      }
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Invalid request" });
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
      const { name, email, password, role, phone, governorates, printCategories, marketingCategories, categories } = req.body;
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
        categories: categories ?? null,
      } as any);
      res.status(201).json(user);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, email, phone, governorates, printCategories, marketingCategories, categories, locationAddress } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (governorates !== undefined) updates.governorates = governorates;
      if (printCategories !== undefined) updates.printCategories = printCategories;
      if (marketingCategories !== undefined) updates.marketingCategories = marketingCategories;
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
      const { categories, printCategories, marketingCategories } = req.body;
      const updateData: any = {};
      if (categories !== undefined) updateData.categories = categories;
      if (printCategories !== undefined) updateData.printCategories = printCategories;
      if (marketingCategories !== undefined) updateData.marketingCategories = marketingCategories;
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
      res.json([
        ...cats.map(c => ({ ...c, type: 'category' })),
        ...subs.map(s => ({ ...s, type: 'subcategory' })),
        ...flvs.map(f => ({ ...f, type: 'flavor' })),
        ...szs.map(s => ({ ...s, type: 'size' })),
        ...brds.map(b => ({ ...b, type: 'brand' })),
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
      const enrich = (items: any[], type: string) => items.map(item => ({
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
      if (status !== undefined) updates.status = status;
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
      res.json(updated);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.delete("/api/supplier/created-products/:id", requireApprovedSupplier, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const deleted = await storage.deleteSupplierProduct(parseInt(req.params.id), user!.id);
      if (!deleted) return res.status(403).json({ message: "Cannot delete this product" });
      res.json({ message: "Deleted" });
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
      if (body.onlyForPack !== undefined) listingUpdate.onlyForPack = body.onlyForPack;
      if (body.onlyForMyProducts !== undefined) listingUpdate.onlyForMyProducts = body.onlyForMyProducts;
      if (Object.keys(listingUpdate).length) {
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
      await storage.deleteSupplierListing(listingId);
      res.json({ message: "Removed" });
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
    quantity: z.number().min(1),
    packVariantPrice: z.number().min(0).optional(),
  });
  const packBodySchema = z.object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
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
      for (const item of body.items) {
        const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, item.listingId));
        if (!listing || listing.supplierId !== req.session.userId) return res.status(403).json({ message: 'One of the selected products is not yours' });
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
        for (const item of body.items) {
          const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, item.listingId));
          if (!listing || listing.supplierId !== req.session.userId) return res.status(403).json({ message: 'One of the selected products is not yours' });
        }
      }
      if (body.expirationDate !== undefined) {
        const expirationError = validatePackExpiration(body.expirationDate);
        if (expirationError) return res.status(400).json({ message: expirationError });
      }
      // Price validation: needs the item list — use the incoming items if provided,
      // otherwise fall back to the pack's existing items.
      let priceCheckItems: { listingId: number; variantId?: number | null; quantity: number }[] | undefined = body.items as any;
      if (!priceCheckItems && body.price !== undefined) {
        const existingItems = await db.select().from(packItemsTable).where(eq(packItemsTable.packId, packId));
        priceCheckItems = existingItems.map(i => ({ listingId: i.listingId, variantId: i.variantId, quantity: i.quantity }));
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
      const product = await storage.getMarketplaceProduct(parseInt(req.params.productId));
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
      if (isProductReview) {
        if (!productId) return res.status(400).json({ message: "productId is required for product reviews" });
        const [existingProductReview] = await db.select().from(supplierProductReviews)
          .where(and(
            eq(supplierProductReviews.productId, Number(productId)),
            eq(supplierProductReviews.cafeId, user.id),
            eq(supplierProductReviews.reviewType, 'PRODUCT')
          ));
        if (existingProductReview) return res.status(409).json({ message: "You have already reviewed this product" });
      }
      if (!isProductReview) {
        // Supplier review — supplierId required
        if (!supplierId) return res.status(400).json({ message: "supplierId is required for supplier reviews" });
        const targetSupplier = await storage.getUser(Number(supplierId));
        if (!targetSupplier || targetSupplier.role !== 'SUPPLIER') {
          return res.status(400).json({ message: "Invalid supplier" });
        }
        // If listingId provided, verify it belongs to supplierId and productId
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
        // One supplier review per cafe per supplier
        const [existingSupplierReview] = await db.select().from(supplierProductReviews)
          .where(and(
            eq(supplierProductReviews.supplierId, Number(supplierId)),
            eq(supplierProductReviews.cafeId, user.id),
            eq(supplierProductReviews.reviewType, 'SUPPLIER')
          ));
        if (existingSupplierReview) return res.status(409).json({ message: "You have already reviewed this supplier" });
      }
      const review = await storage.createReview({
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
      res.status(201).json(review);
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
      res.json(await storage.saveVariants(listingId, variants.map(v => ({
        flavorId: v.flavorId ?? null,
        sizeId: v.sizeId ?? null,
        price: Math.round(v.price * 100),
        quantity: v.quantity,
      }))));
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

      // 1. Geocode address → lat/lng
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${MAPS_KEY}`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json() as any;
      if (geoData.status !== 'OK' || !geoData.results?.[0]) {
        return res.status(400).json({ message: `Geocoding failed: ${geoData.status}` });
      }
      const { lat, lng } = geoData.results[0].geometry.location;
      const radiusMeters = parseFloat(String(radiusKm)) * 1000;

      // 2. Call Nearby Search with pagination (up to 3 pages)
      let places: any[] = [];
      let nextPageToken: string | null = null;
      const pages: string[] = [];

      for (let page = 1; page <= 3; page++) {
        let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=${encodeURIComponent(keyword)}&key=${MAPS_KEY}`;
        if (nextPageToken) url += `&pagetoken=${nextPageToken}`;

        const searchRes = await fetch(url);
        const data = await searchRes.json() as any;
        pages.push(`Page ${page}: ${(data.results ?? []).length} results`);

        if (data.results) places.push(...data.results);
        nextPageToken = data.next_page_token ?? null;
        if (!nextPageToken) break;
        // Google requires 2-second delay before using next_page_token
        if (page < 3) await new Promise(r => setTimeout(r, 2000));
      }

      // 3. Apply filters (minRating, onlyWithPhone)
      if (minRating) places = places.filter((p: any) => (p.rating ?? 0) >= parseFloat(String(minRating)));

      // 4. Get details (phone, website) and save each place
      let saved = 0, skipped = 0;
      const caller = await storage.getUser(req.session.userId);
      const callerName = caller?.name ?? 'Admin';

      for (const place of places) {
        // Duplicate detection
        const existing = await storage.findDuplicateProspect({ googlePlaceId: place.place_id });
        if (existing) { skipped++; continue; }

        // Fetch Place Details for phone + website
        let phone: string | null = null, website: string | null = null;
        try {
          const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=formatted_phone_number,website,opening_hours&key=${MAPS_KEY}`;
          const detailRes = await fetch(detailUrl);
          const detail = await detailRes.json() as any;
          phone = detail.result?.formatted_phone_number ?? null;
          website = detail.result?.website ?? null;
        } catch { /* ignore detail fetch errors */ }

        if (onlyWithPhone && !phone) { skipped++; continue; }
        if (onlyWithWebsite && !website) { skipped++; continue; }

        // Calculate distance from search center
        const placeLat = place.geometry?.location?.lat ?? 0;
        const placeLng = place.geometry?.location?.lng ?? 0;
        const distKm = Math.sqrt(Math.pow((placeLat - lat) * 111, 2) + Math.pow((placeLng - lng) * 111 * Math.cos((lat * Math.PI) / 180), 2));

        // Extract city from vicinity or address_components
        const city = place.vicinity?.split(',').pop()?.trim() ?? null;

        // Prospect score
        let score = 0;
        if (phone) score += 20;
        if (website) score += 15;
        if ((place.rating ?? 0) >= 4.5) score += 20;
        if ((place.user_ratings_total ?? 0) >= 100) score += 15;

        await storage.createProspect({
          googlePlaceId: place.place_id,
          businessName: place.name,
          businessType: (place.types ?? []).join(', '),
          prospectType: prospectType ?? null,
          address: place.vicinity ?? place.formatted_address ?? null,
          latitude: String(placeLat),
          longitude: String(placeLng),
          phone,
          website,
          rating: place.rating != null ? String(place.rating) : null,
          reviewCount: place.user_ratings_total ?? 0,
          status: 'NEW',
          distanceKm: distKm.toFixed(2),
          searchCenter: address,
          searchRadius: String(radiusKm),
          keyword,
          city,
          country: 'Tunisia',
          prospectScore: score,
          notes: [],
          timeline: [{
            id: Date.now().toString(),
            event: 'Created via Google Places search',
            detail: `Search: "${keyword}" near ${address} (${radiusKm} km)`,
            createdAt: new Date().toISOString(),
            userName: callerName,
          }],
          contacts: [],
        } as any);
        saved++;
      }

      res.json({ saved, skipped, total: places.length, pages, searchCenter: `${lat},${lng}`, radiusKm });
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
      res.status(201).json(promo);
    } catch (err: any) {
      res.status(400).json({ message: err?.message ?? 'Error creating promotion' });
    }
  });

  // PUT /api/promotions/:id — update
  app.put('/api/promotions/:id', requireSupplier, async (req: any, res) => {
    try {
      const body = req.body;
      const updated = await storage.updatePromotion(parseInt(req.params.id), req.supplier.id, {
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      });
      if (!updated) return res.status(404).json({ message: 'Not found' });
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
      res.json(updated);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // POST /api/promotions/:id/duplicate — duplicate
  app.post('/api/promotions/:id/duplicate', requireSupplier, async (req: any, res) => {
    try {
      const dup = await storage.duplicatePromotion(parseInt(req.params.id), req.supplier.id);
      if (!dup) return res.status(404).json({ message: 'Not found' });
      res.status(201).json(dup);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  // DELETE /api/promotions/:id — delete
  app.delete('/api/promotions/:id', requireSupplier, async (req: any, res) => {
    try {
      await storage.deletePromotion(parseInt(req.params.id), req.supplier.id);
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

  return httpServer;
}

