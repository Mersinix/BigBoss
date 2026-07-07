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
  supplierProductReviews,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

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

      const { items, deliveryAddress, courierInstructions } = z.object({
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
        })),
        deliveryAddress: deliveryAddressSchema,
        courierInstructions: z.string().max(500).optional(),
      }).parse(req.body);

      const validatedItems = await storage.resolveOrderItems(items);
      const normalizedDelivery = deliveryAddress ? {
        ...deliveryAddress,
        placeId: deliveryAddress.placeId ?? "",
      } : undefined;
      const order = await storage.createOrder(req.session.userId!, validatedItems, {
        deliveryAddress: normalizedDelivery,
        courierInstructions,
      });
      res.status(201).json(order);
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

      const listing = await storage.createSupplierListing({
        supplierId: user!.id,
        productId: body.productId,
        price: 0,
        stock: 0,
        availableFlavorIds: null,
        availableSizeIds: null,
        availableBrandIds: null,
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
        variants: z.array(z.object({
          flavorId: z.number().nullable().optional(),
          sizeId: z.number().nullable().optional(),
          price: z.number().min(0),
          quantity: z.number().min(0),
        })).optional(),
      }).parse(req.body);

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

  // ── Supplier Store (own public store profile) ────────────────────────────────

  app.get('/api/supplier/store', requireApprovedSupplier, async (req: any, res) => {
    try {
      const store = await storage.getSupplierStore(req.session.userId);
      res.json(store ?? null);
    } catch { res.status(500).json({ message: 'Error' }); }
  });

  app.put('/api/supplier/store', requireApprovedSupplier, async (req: any, res) => {
    try {
      const { coverUrl, logoUrl, name, description, isOpen, visibility } = req.body ?? {};
      if (visibility !== undefined && !['VISIBLE', 'HIDDEN'].includes(visibility)) {
        return res.status(400).json({ message: 'Invalid visibility' });
      }
      const store = await storage.upsertSupplierStore(req.session.userId, {
        coverUrl, logoUrl, name, description, isOpen, visibility,
      });
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

  // Seed on startup (with delay to wait for DB pool to stabilise)
  setTimeout(() => seedDatabase().catch(console.error), 3000);

  return httpServer;
}

async function seedAdminProducts(catList: any[]) {
  // Fetch all existing taxonomy by name
  const [subsList, flavorsList, sizesList, brandsList] = await Promise.all([
    db.select().from(subCategories),
    db.select().from(flavors),
    db.select().from(sizes),
    db.select().from(brands),
  ]);

  const cat = (name: string) => catList.find(c => c.name === name)?.id ?? null;
  const sub = (name: string) => subsList.find(s => s.name === name)?.id ?? null;
  const flav = (name: string) => flavorsList.find(f => f.name === name)?.id ?? null;
  const sz = (name: string) => sizesList.find(s => s.name === name)?.id ?? null;
  const br = (name: string) => brandsList.find(b => b.name === name)?.id ?? null;

  const adminProds = [
    { name: "Lavazza Super Crema Espresso 1kg", description: "Velvety smooth espresso blend with notes of hazelnut and brown sugar", imageUrl: "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Arabica Beans"), flavorId: flav("Hazelnut"), sizeId: sz("1kg Bag"), brandId: br("Lavazza"), category: "Coffee Beans" },
    { name: "Lavazza Qualità Rossa Ground 500g", description: "Balanced medium roast, perfect for espresso machines", imageUrl: "https://images.unsplash.com/photo-1507133750040-4a8f57021571?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Ground Coffee"), flavorId: flav("Caramel"), sizeId: sz("500g Bag"), brandId: br("Lavazza"), category: "Coffee Beans" },
    { name: "Illy Classico Arabica Beans 500g", description: "9 arabica varieties blended for a consistently rich espresso", imageUrl: "https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Arabica Beans"), flavorId: flav("Unflavored"), sizeId: sz("500g Bag"), brandId: br("Illy"), category: "Coffee Beans" },
    { name: "Nespresso Original Capsules x10", description: "Intense espresso with a rich crema — Ristretto blend", imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Capsules & Pods"), flavorId: flav("Chocolate"), sizeId: sz("Espresso Shot"), brandId: br("Nespresso"), category: "Coffee Beans" },
    { name: "Cold Brew Coarse Grind Bag 250g", description: "Specially coarse-ground Ethiopian Sidamo for 18hr cold brew", imageUrl: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Cold Brew Bags"), flavorId: flav("Vanilla"), sizeId: sz("250g Bag"), brandId: br("Illy"), category: "Coffee Beans" },
    { name: "Robusta Dark Roast Beans 1kg", description: "High-caffeine Vietnamese robusta, bold and full-bodied", imageUrl: "https://images.unsplash.com/photo-1481833761820-0509d3217039?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Robusta Beans"), flavorId: flav("Unflavored"), sizeId: sz("1kg Bag"), brandId: br("Lavazza"), category: "Coffee Beans" },
    { name: "Oatly Barista Edition 1L", description: "The original barista oat milk — steams to silky perfection", imageUrl: "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=500&q=80", categoryId: cat("Dairy & Alternatives"), subCategoryId: sub("Oat Milk"), flavorId: flav("Unflavored"), sizeId: sz("1L Carton"), brandId: br("Oatly"), category: "Dairy & Alternatives" },
    { name: "Oatly Barista 6x1L Pack", description: "Case of 6 Oatly Barista — perfect for busy cafes", imageUrl: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=500&q=80", categoryId: cat("Dairy & Alternatives"), subCategoryId: sub("Oat Milk"), flavorId: flav("Unflavored"), sizeId: sz("6-Pack"), brandId: br("Oatly"), category: "Dairy & Alternatives" },
    { name: "Alpro Almond Barista 1L", description: "Light nutty almond milk with excellent foam quality", imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&q=80", categoryId: cat("Dairy & Alternatives"), subCategoryId: sub("Almond Milk"), flavorId: flav("Almond"), sizeId: sz("1L Carton"), brandId: br("Alpro"), category: "Dairy & Alternatives" },
    { name: "UHT Whole Milk 6x1L", description: "Long-life full-fat milk for consistent café use", imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&q=80", categoryId: cat("Dairy & Alternatives"), subCategoryId: sub("Whole Milk"), flavorId: flav("Unflavored"), sizeId: sz("6-Pack"), brandId: br("Alpro"), category: "Dairy & Alternatives" },
    { name: "Monin Vanilla Syrup 700ml", description: "Classic Madagascar bourbon vanilla — the café staple", imageUrl: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=500&q=80", categoryId: cat("Syrups & Flavors"), subCategoryId: sub("Classic Syrups"), flavorId: flav("Vanilla"), sizeId: sz("Medium"), brandId: br("Monin"), category: "Syrups & Flavors" },
    { name: "Monin Caramel Syrup 700ml", description: "Buttery caramel for lattes and frappés", imageUrl: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&q=80", categoryId: cat("Syrups & Flavors"), subCategoryId: sub("Classic Syrups"), flavorId: flav("Caramel"), sizeId: sz("Medium"), brandId: br("Monin"), category: "Syrups & Flavors" },
    { name: "Monin Hazelnut Sugar-Free 700ml", description: "Zero-sugar hazelnut syrup — guilt-free indulgence", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&q=80", categoryId: cat("Syrups & Flavors"), subCategoryId: sub("Sugar-Free Syrups"), flavorId: flav("Hazelnut"), sizeId: sz("Medium"), brandId: br("Monin"), category: "Syrups & Flavors" },
    { name: "Monin Coconut Syrup 700ml", description: "Tropical coconut for iced drinks and smoothies", imageUrl: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500&q=80", categoryId: cat("Syrups & Flavors"), subCategoryId: sub("Classic Syrups"), flavorId: flav("Coconut"), sizeId: sz("Medium"), brandId: br("Monin"), category: "Syrups & Flavors" },
    { name: "DeLonghi Dedica Espresso Machine", description: "Slim 15-bar pump espresso machine for specialty cafés", imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&q=80", categoryId: cat("Equipment & Supplies"), subCategoryId: sub("Espresso Machines"), flavorId: flav("Unflavored"), sizeId: sz("Large"), brandId: br("DeLonghi"), category: "Equipment & Supplies" },
    { name: "Rancilio Silvia Pro Espresso", description: "Dual boiler prosumer machine for high-volume use", imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&q=80", categoryId: cat("Equipment & Supplies"), subCategoryId: sub("Espresso Machines"), flavorId: flav("Unflavored"), sizeId: sz("Large"), brandId: br("Rancilio"), category: "Equipment & Supplies" },
    { name: "80mm Biodegradable Coffee Cups x500", description: "Single-wall compostable cups with lids — café-ready", imageUrl: "https://images.unsplash.com/photo-1506619216599-9d16d0903dfd?w=500&q=80", categoryId: cat("Equipment & Supplies"), subCategoryId: sub("Cups & Packaging"), flavorId: flav("Unflavored"), sizeId: sz("Small"), brandId: br("DeLonghi"), category: "Equipment & Supplies" },
    { name: "English Breakfast Tea Bags x100", description: "Robust black tea blend — classic breakfast companion", imageUrl: "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=500&q=80", categoryId: cat("Tea & Herbal"), subCategoryId: sub("Black Tea"), flavorId: flav("Unflavored"), sizeId: sz("Large"), brandId: br("Alpro"), category: "Tea & Herbal" },
    { name: "Ceremonial Grade Matcha 100g", description: "Vibrant green ceremonial matcha from Uji, Japan", imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&q=80", categoryId: cat("Tea & Herbal"), subCategoryId: sub("Green Tea"), flavorId: flav("Mint"), sizeId: sz("250g Bag"), brandId: br("Alpro"), category: "Tea & Herbal" },
    { name: "Chamomile Herbal Infusion x50", description: "Calming chamomile flowers — naturally caffeine-free", imageUrl: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&q=80", categoryId: cat("Tea & Herbal"), subCategoryId: sub("Herbal Infusions"), flavorId: flav("Unflavored"), sizeId: sz("Medium"), brandId: br("Alpro"), category: "Tea & Herbal" },
    { name: "Butter Croissants x12", description: "All-butter pre-baked croissants — just thaw and serve", imageUrl: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&q=80", categoryId: cat("Snacks & Food"), subCategoryId: sub("Pastries"), flavorId: flav("Unflavored"), sizeId: sz("Large"), brandId: br("Lavazza"), category: "Snacks & Food" },
    { name: "Cantuccini Biscotti 500g", description: "Crunchy almond biscotti — perfect with espresso", imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&q=80", categoryId: cat("Snacks & Food"), subCategoryId: sub("Biscuits & Cookies"), flavorId: flav("Almond"), sizeId: sz("500g Bag"), brandId: br("Illy"), category: "Snacks & Food" },
  ];

  for (const p of adminProds) {
    await storage.createProduct({ ...p, price: 0, stock: 0, supplierId: null, isAdminProduct: true });
  }
  console.log("✅ Admin products seeded from existing taxonomy");
}

async function seedDatabase() {
  const usersList = await db.select().from(users);
  if (usersList.length === 0) {
    await storage.createUser({ email: "admin@bigbosscoffee.com", password: "password", name: "Super Admin", role: "SUPER_ADMIN" });
    const supplier = await storage.createUser({ email: "supplier@beans.com", password: "password", name: "Premium Beans Co", role: "SUPPLIER" });
    await storage.createUser({ email: "owner@cafe.com", password: "password", name: "Central Perk", role: "CAFE_OWNER" });
    await storage.createUser({ email: "driver@fast.com", password: "password", name: "Fast Delivery", role: "DRIVER" });

    // Legacy supplier-owned products for cafe browsing
    await storage.createProduct({ supplierId: supplier.id, name: "Espresso Roast 1kg", description: "Dark espresso blend", price: 2500, stock: 100, category: "Coffee Beans", imageUrl: "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=500&q=80", isAdminProduct: false });
    await storage.createProduct({ supplierId: supplier.id, name: "Oat Milk 1L x 6", description: "Barista standard oat milk", price: 1800, stock: 50, category: "Dairy Alternatives", imageUrl: "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=500&q=80", isAdminProduct: false });
  }

  const adminProductsList = await db.select().from(products).where(eq(products.isAdminProduct, true));
  const catList = await db.select().from(categories);

  // If taxonomy is seeded but admin products are missing, seed them using existing IDs
  if (catList.length > 0 && adminProductsList.length === 0) {
    await seedAdminProducts(catList);
    return;
  }

  if (catList.length === 0) {
    const coffeeBeans = await storage.createCategory({ name: "Coffee Beans", icon: "☕", description: "Whole bean and ground coffee blends", createdBy: "System" });
    const dairy = await storage.createCategory({ name: "Dairy & Alternatives", icon: "🥛", description: "Milk, cream, oat and soy alternatives", createdBy: "System" });
    const equipment = await storage.createCategory({ name: "Equipment & Supplies", icon: "⚙️", description: "Machines, filters, cups and accessories", createdBy: "System" });
    const syrups = await storage.createCategory({ name: "Syrups & Flavors", icon: "🍯", description: "Coffee syrups, sweeteners and flavor shots", createdBy: "System" });
    const tea = await storage.createCategory({ name: "Tea & Herbal", icon: "🍵", description: "Loose leaf, herbal blends and infusions", createdBy: "System" });
    const snacks = await storage.createCategory({ name: "Snacks & Food", icon: "🥐", description: "Pastries, biscuits and café snacks", createdBy: "System" });

    const arabica = await storage.createSubCategory({ name: "Arabica Beans", categoryId: coffeeBeans.id, description: "Single-origin and blended arabica", createdBy: "System" });
    const robusta = await storage.createSubCategory({ name: "Robusta Beans", categoryId: coffeeBeans.id, description: "High-caffeine robust blends", createdBy: "System" });
    const capsules = await storage.createSubCategory({ name: "Capsules & Pods", categoryId: coffeeBeans.id, description: "Compatible with Nespresso, Dolce Gusto", createdBy: "System" });
    const ground = await storage.createSubCategory({ name: "Ground Coffee", categoryId: coffeeBeans.id, description: "Pre-ground for espresso and filter", createdBy: "System" });
    const coldBrew = await storage.createSubCategory({ name: "Cold Brew Bags", categoryId: coffeeBeans.id, description: "Coarse grind cold brew packs", createdBy: "System" });

    const oatMilk = await storage.createSubCategory({ name: "Oat Milk", categoryId: dairy.id, description: "Barista-grade oat milk", createdBy: "System" });
    const almondMilk = await storage.createSubCategory({ name: "Almond Milk", categoryId: dairy.id, description: "Unsweetened almond milk", createdBy: "System" });
    const wholeMilk = await storage.createSubCategory({ name: "Whole Milk", categoryId: dairy.id, description: "Fresh and UHT whole milk", createdBy: "System" });

    const machines = await storage.createSubCategory({ name: "Espresso Machines", categoryId: equipment.id, description: "Commercial and semi-commercial", createdBy: "System" });
    const cups = await storage.createSubCategory({ name: "Cups & Packaging", categoryId: equipment.id, description: "Paper cups, lids and sleeves", createdBy: "System" });

    const classicSyr = await storage.createSubCategory({ name: "Classic Syrups", categoryId: syrups.id, description: "Vanilla, caramel, hazelnut", createdBy: "System" });
    const sfSyr = await storage.createSubCategory({ name: "Sugar-Free Syrups", categoryId: syrups.id, description: "Zero-calorie flavoring options", createdBy: "System" });

    const blackTea = await storage.createSubCategory({ name: "Black Tea", categoryId: tea.id, description: "English breakfast, Earl Grey", createdBy: "System" });
    const greenTea = await storage.createSubCategory({ name: "Green Tea", categoryId: tea.id, description: "Matcha, sencha, jasmine green", createdBy: "System" });
    const herbal = await storage.createSubCategory({ name: "Herbal Infusions", categoryId: tea.id, description: "Chamomile, peppermint, hibiscus", createdBy: "System" });

    const pastries = await storage.createSubCategory({ name: "Pastries", categoryId: snacks.id, description: "Croissants, muffins, danishes", createdBy: "System" });
    const biscuits = await storage.createSubCategory({ name: "Biscuits & Cookies", categoryId: snacks.id, description: "Biscotti, shortbread, wafers", createdBy: "System" });

    const vanilla = await storage.createFlavor({ name: "Vanilla", description: "Classic sweet vanilla", createdBy: "System" });
    const caramel = await storage.createFlavor({ name: "Caramel", description: "Rich buttery caramel", createdBy: "System" });
    const hazelnut = await storage.createFlavor({ name: "Hazelnut", description: "Roasted hazelnut", createdBy: "System" });
    const chocolate = await storage.createFlavor({ name: "Chocolate", description: "Dark and milk chocolate", createdBy: "System" });
    const coconut = await storage.createFlavor({ name: "Coconut", description: "Tropical coconut", createdBy: "System" });
    const almond = await storage.createFlavor({ name: "Almond", description: "Toasted almond", createdBy: "System" });
    const mint = await storage.createFlavor({ name: "Mint", description: "Fresh peppermint", createdBy: "System" });
    const unflavored = await storage.createFlavor({ name: "Unflavored", description: "Natural, no added flavor", createdBy: "System" });

    const shot = await storage.createSize({ name: "Espresso Shot", value: "30ml", createdBy: "System" });
    const small = await storage.createSize({ name: "Small", value: "250ml", createdBy: "System" });
    const medium = await storage.createSize({ name: "Medium", value: "350ml", createdBy: "System" });
    const large = await storage.createSize({ name: "Large", value: "500ml", createdBy: "System" });
    const bag250 = await storage.createSize({ name: "250g Bag", value: "250g", createdBy: "System" });
    const bag500 = await storage.createSize({ name: "500g Bag", value: "500g", createdBy: "System" });
    const bag1kg = await storage.createSize({ name: "1kg Bag", value: "1kg", createdBy: "System" });
    const liter = await storage.createSize({ name: "1L Carton", value: "1L", createdBy: "System" });
    const sixPack = await storage.createSize({ name: "6-Pack", value: "6x1L", createdBy: "System" });

    const lavazza = await storage.createBrand({ name: "Lavazza", description: "Italian coffee brand", createdBy: "System" });
    const nespresso = await storage.createBrand({ name: "Nespresso", description: "Premium capsule systems", createdBy: "System" });
    const illy = await storage.createBrand({ name: "Illy", description: "Specialty Italian coffee", createdBy: "System" });
    const monin = await storage.createBrand({ name: "Monin", description: "Premium flavoring syrups", createdBy: "System" });
    const oatly = await storage.createBrand({ name: "Oatly", description: "Leading oat milk brand", createdBy: "System" });
    const alpro = await storage.createBrand({ name: "Alpro", description: "Plant-based drinks", createdBy: "System" });
    const delonghi = await storage.createBrand({ name: "DeLonghi", description: "Espresso machines", createdBy: "System" });
    const rancilio = await storage.createBrand({ name: "Rancilio", description: "Commercial coffee equipment", createdBy: "System" });

    // Admin product catalog
    const adminProds = [
      { name: "Lavazza Super Crema Espresso 1kg", description: "Velvety smooth espresso blend with notes of hazelnut and brown sugar", imageUrl: "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=500&q=80", categoryId: coffeeBeans.id, subCategoryId: arabica.id, flavorId: hazelnut.id, sizeId: bag1kg.id, brandId: lavazza.id, category: "Coffee Beans" },
      { name: "Lavazza Qualità Rossa Ground 500g", description: "Balanced medium roast, perfect for espresso machines", imageUrl: "https://images.unsplash.com/photo-1507133750040-4a8f57021571?w=500&q=80", categoryId: coffeeBeans.id, subCategoryId: ground.id, flavorId: caramel.id, sizeId: bag500.id, brandId: lavazza.id, category: "Coffee Beans" },
      { name: "Illy Classico Arabica Beans 500g", description: "9 arabica varieties blended for a consistently rich espresso", imageUrl: "https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=500&q=80", categoryId: coffeeBeans.id, subCategoryId: arabica.id, flavorId: unflavored.id, sizeId: bag500.id, brandId: illy.id, category: "Coffee Beans" },
      { name: "Nespresso Original Capsules x10", description: "Intense espresso with a rich crema — Ristretto blend", imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&q=80", categoryId: coffeeBeans.id, subCategoryId: capsules.id, flavorId: chocolate.id, sizeId: shot.id, brandId: nespresso.id, category: "Coffee Beans" },
      { name: "Cold Brew Coarse Grind Bag 250g", description: "Specially coarse-ground Ethiopian Sidamo for 18hr cold brew", imageUrl: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500&q=80", categoryId: coffeeBeans.id, subCategoryId: coldBrew.id, flavorId: vanilla.id, sizeId: bag250.id, brandId: illy.id, category: "Coffee Beans" },
      { name: "Robusta Dark Roast Beans 1kg", description: "High-caffeine Vietnamese robusta, bold and full-bodied", imageUrl: "https://images.unsplash.com/photo-1481833761820-0509d3217039?w=500&q=80", categoryId: coffeeBeans.id, subCategoryId: robusta.id, flavorId: unflavored.id, sizeId: bag1kg.id, brandId: lavazza.id, category: "Coffee Beans" },
      { name: "Oatly Barista Edition 1L", description: "The original barista oat milk — steams to silky perfection", imageUrl: "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=500&q=80", categoryId: dairy.id, subCategoryId: oatMilk.id, flavorId: unflavored.id, sizeId: liter.id, brandId: oatly.id, category: "Dairy & Alternatives" },
      { name: "Oatly Barista 6x1L Pack", description: "Case of 6 Oatly Barista — perfect for busy cafes", imageUrl: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=500&q=80", categoryId: dairy.id, subCategoryId: oatMilk.id, flavorId: unflavored.id, sizeId: sixPack.id, brandId: oatly.id, category: "Dairy & Alternatives" },
      { name: "Alpro Almond Barista 1L", description: "Light nutty almond milk with excellent foam quality", imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&q=80", categoryId: dairy.id, subCategoryId: almondMilk.id, flavorId: almond.id, sizeId: liter.id, brandId: alpro.id, category: "Dairy & Alternatives" },
      { name: "UHT Whole Milk 6x1L", description: "Long-life full-fat milk for consistent café use", imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&q=80", categoryId: dairy.id, subCategoryId: wholeMilk.id, flavorId: unflavored.id, sizeId: sixPack.id, brandId: alpro.id, category: "Dairy & Alternatives" },
      { name: "Monin Vanilla Syrup 700ml", description: "Classic Madagascar bourbon vanilla — the café staple", imageUrl: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=500&q=80", categoryId: syrups.id, subCategoryId: classicSyr.id, flavorId: vanilla.id, sizeId: medium.id, brandId: monin.id, category: "Syrups & Flavors" },
      { name: "Monin Caramel Syrup 700ml", description: "Buttery caramel for lattes and frappés", imageUrl: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&q=80", categoryId: syrups.id, subCategoryId: classicSyr.id, flavorId: caramel.id, sizeId: medium.id, brandId: monin.id, category: "Syrups & Flavors" },
      { name: "Monin Hazelnut Sugar-Free 700ml", description: "Zero-sugar hazelnut syrup — guilt-free indulgence", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&q=80", categoryId: syrups.id, subCategoryId: sfSyr.id, flavorId: hazelnut.id, sizeId: medium.id, brandId: monin.id, category: "Syrups & Flavors" },
      { name: "Monin Coconut Syrup 700ml", description: "Tropical coconut for iced drinks and smoothies", imageUrl: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500&q=80", categoryId: syrups.id, subCategoryId: classicSyr.id, flavorId: coconut.id, sizeId: medium.id, brandId: monin.id, category: "Syrups & Flavors" },
      { name: "DeLonghi Dedica Espresso Machine", description: "Slim 15-bar pump espresso machine for specialty cafés", imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&q=80", categoryId: equipment.id, subCategoryId: machines.id, flavorId: unflavored.id, sizeId: large.id, brandId: delonghi.id, category: "Equipment & Supplies" },
      { name: "Rancilio Silvia Pro Espresso", description: "Dual boiler prosumer machine for high-volume use", imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&q=80", categoryId: equipment.id, subCategoryId: machines.id, flavorId: unflavored.id, sizeId: large.id, brandId: rancilio.id, category: "Equipment & Supplies" },
      { name: "80mm Biodegradable Coffee Cups x500", description: "Single-wall compostable cups with lids — café-ready", imageUrl: "https://images.unsplash.com/photo-1506619216599-9d16d0903dfd?w=500&q=80", categoryId: equipment.id, subCategoryId: cups.id, flavorId: unflavored.id, sizeId: small.id, brandId: delonghi.id, category: "Equipment & Supplies" },
      { name: "English Breakfast Tea Bags x100", description: "Robust black tea blend — classic breakfast companion", imageUrl: "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=500&q=80", categoryId: tea.id, subCategoryId: blackTea.id, flavorId: unflavored.id, sizeId: large.id, brandId: alpro.id, category: "Tea & Herbal" },
      { name: "Ceremonial Grade Matcha 100g", description: "Vibrant green ceremonial matcha from Uji, Japan", imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&q=80", categoryId: tea.id, subCategoryId: greenTea.id, flavorId: mint.id, sizeId: bag250.id, brandId: alpro.id, category: "Tea & Herbal" },
      { name: "Chamomile Herbal Infusion x50", description: "Calming chamomile flowers — naturally caffeine-free", imageUrl: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&q=80", categoryId: tea.id, subCategoryId: herbal.id, flavorId: unflavored.id, sizeId: medium.id, brandId: alpro.id, category: "Tea & Herbal" },
      { name: "Butter Croissants x12", description: "All-butter pre-baked croissants — just thaw and serve", imageUrl: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&q=80", categoryId: snacks.id, subCategoryId: pastries.id, flavorId: unflavored.id, sizeId: large.id, brandId: lavazza.id, category: "Snacks & Food" },
      { name: "Cantuccini Biscotti 500g", description: "Crunchy almond biscotti — perfect with espresso", imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&q=80", categoryId: snacks.id, subCategoryId: biscuits.id, flavorId: almond.id, sizeId: bag500.id, brandId: illy.id, category: "Snacks & Food" },
    ];

    for (const p of adminProds) {
      await storage.createProduct({ ...p, price: 0, stock: 0, supplierId: null, isAdminProduct: true });
    }
    console.log("✅ Database seeded successfully");
  }
}
