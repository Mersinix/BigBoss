import { requireAuth, requireAdmin, requireApprovedSupplier } from "./shared/middleware";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { broadcast } from "../ws";
import { db } from "../db";
import { packs, orderItems, subOrders, orders, insertCategorySchema, insertSubCategorySchema, insertFlavorSchema, insertSizeSchema, insertBrandSchema, categories, subCategories, brands, flavors, sizes, users } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { notifyMany, notify } from "../notify";
import { hasCommercialAccess, stripCommercialData } from "./shared/helpers";
import type { Express } from "express";

export function registerShopCatalogRoutes(app: Express): void {
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

    // Server-side validation for the admin-set per-image crop percentages
    // (task: "Progressive Image Cropping Controls") — client values are
    // never trusted as-is: non-object input is dropped entirely, each key
    // must be a non-empty string (the image URL) and each value is clamped
    // to an integer 0-100, mirroring the same clamp the client's own slider
    // already enforces (client/src/lib/image-adjustment.ts).
    function sanitizeImageAdjustments(input: unknown): Record<string, number> | null {
      if (!input || typeof input !== "object" || Array.isArray(input)) return null;
      const out: Record<string, number> = {};
      for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
        if (typeof key !== "string" || !key.trim()) continue;
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n)) continue;
        out[key] = Math.max(0, Math.min(100, Math.round(n)));
      }
      return out;
    }

    app.post("/api/admin/products", requireAdmin, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!req.body.name?.trim()) return res.status(400).json({ message: "Name is required" });
        const product = await storage.createProduct({
          name: req.body.name.trim(),
          description: req.body.description?.trim() || null,
          imageUrl: req.body.imageUrl?.trim() || null,
          imageUrls: Array.isArray(req.body.imageUrls) ? req.body.imageUrls.filter((u: string) => u?.trim()) : null,
          imageAdjustments: sanitizeImageAdjustments(req.body.imageAdjustments) ?? {},
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
        if (req.body.imageAdjustments !== undefined) updates.imageAdjustments = sanitizeImageAdjustments(req.body.imageAdjustments) ?? {};
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

    // Single Pack lookup by id, regardless of current visibility/archived/expired/stock
    // state — used by the SHOP cart to revalidate a Pack it already has in a cart line.
    // Unlike GET /api/marketplace/packs/:id (which 404s on an unavailable Pack, since that
    // route is for marketplace browsing), this always returns the Pack when it still exists
    // so the cart can tell "temporarily unavailable" (isAvailable: false) apart from "no
    // longer exists at all" (404) and, once available again, refresh to its latest data.
    // Reuses storage.getPackDetail() — the exact same isAvailable computation already
    // enforced by resolvePackOrderItems() at order-creation time — so there is one
    // authoritative Pack availability source, not a second one.
    app.get('/api/packs/:id', requireAuth, async (req, res) => {
      try {
        const packId = parseInt(req.params.id);
        const pack = await storage.getPackDetail(packId);
        if (!pack) return res.status(404).json({ message: 'Pack not found' });
        res.json(pack);
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Error fetching pack' });
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

    // Registered before /:id (task: "Admin Category Management Redesign" —
    // mirrors /api/admin/stores/bulk-order) so Express doesn't match "bulk-order"
    // against :id first.
    app.patch("/api/categories/bulk-order", requireAdmin, async (req, res) => {
      try {
        const orders: { id: number; displayOrder: number }[] = req.body?.orders;
        if (!Array.isArray(orders)) return res.status(400).json({ message: "Invalid payload" });
        await storage.bulkUpdateCategoryOrder(orders);
        broadcast("taxonomy_updated", {});
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error" }); }
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

    app.patch("/api/subcategories/bulk-order", requireAdmin, async (req, res) => {
      try {
        const orders: { id: number; displayOrder: number }[] = req.body?.orders;
        if (!Array.isArray(orders)) return res.status(400).json({ message: "Invalid payload" });
        await storage.bulkUpdateSubCategoryOrder(orders);
        broadcast("taxonomy_updated", {});
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error" }); }
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

    app.patch("/api/flavors/bulk-order", requireAdmin, async (req, res) => {
      try {
        const orders: { id: number; displayOrder: number }[] = req.body?.orders;
        if (!Array.isArray(orders)) return res.status(400).json({ message: "Invalid payload" });
        await storage.bulkUpdateFlavorOrder(orders);
        broadcast("taxonomy_updated", {});
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error" }); }
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

    app.patch("/api/sizes/bulk-order", requireAdmin, async (req, res) => {
      try {
        const orders: { id: number; displayOrder: number }[] = req.body?.orders;
        if (!Array.isArray(orders)) return res.status(400).json({ message: "Invalid payload" });
        await storage.bulkUpdateSizeOrder(orders);
        broadcast("taxonomy_updated", {});
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error" }); }
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

    app.patch("/api/brands/bulk-order", requireAdmin, async (req, res) => {
      try {
        const orders: { id: number; displayOrder: number }[] = req.body?.orders;
        if (!Array.isArray(orders)) return res.status(400).json({ message: "Invalid payload" });
        await storage.bulkUpdateBrandOrder(orders);
        broadcast("taxonomy_updated", {});
        res.json({ ok: true });
      } catch { res.status(500).json({ message: "Error" }); }
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
        const adminIds = await storage.getAdminUserIds();
        await notifyMany({
          userIds: adminIds,
          service: "ADMIN", type: "catalog_suggestion_created", priority: "INFO",
          title: "Nouvelle suggestion de catalogue",
          message: `${user!.name} propose ${type === 'category' ? 'une nouvelle catégorie' : type === 'subcategory' ? 'une nouvelle sous-catégorie' : `un nouvel élément (${type})`} : "${created.name}".`,
          entityType: "catalog_suggestion", entityId: created.id,
          prefKey: "catalog",
          dedupeKeyPrefix: `admin:catalog_suggestion_created:${type}:${created.id}`,
        });
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
        if (updated.createdByUserId) {
          await notify({
            userId: updated.createdByUserId,
            service: "ADMIN", type: "catalog_suggestion_approved", priority: "SUCCESS",
            title: "Suggestion approuvée",
            message: `Votre suggestion "${updated.name}" a été approuvée.`,
            entityType: "catalog_suggestion", entityId: updated.id,
            prefKey: "catalog",
            dedupeKey: `admin:catalog_suggestion_approved:${type}:${id}`,
          });
        }
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
        if (status === 'REJECTED' && updated.createdByUserId) {
          await notify({
            userId: updated.createdByUserId,
            service: "ADMIN", type: "catalog_suggestion_rejected", priority: "WARNING",
            title: "Suggestion refusée",
            message: `Votre suggestion "${updated.name}" a été refusée.`,
            entityType: "catalog_suggestion", entityId: updated.id,
            prefKey: "catalog",
            dedupeKey: `admin:catalog_suggestion_rejected:${type}:${id}`,
          });
        }
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

    // GET /api/marketplace/promotions/:id?listingId=X&flavorId=Y&sizeId=Z — customer-safe
    // promotion detail for the Coffee Owner's "Promotion Details" modal (clicking a promo
    // badge in the Product Detail Modal). listingId is required: the storage method
    // re-validates that this exact promotion actually applies to this exact listing (same
    // eligibility rules as getPromotionsForListings above), so a Coffee Owner can never
    // fetch an unrelated or another supplier's promotion by guessing an id.
    app.get('/api/marketplace/promotions/:id', async (req: any, res) => {
      try {
        const promotionId = parseInt(req.params.id);
        const listingId = parseInt(req.query.listingId as string);
        if (!promotionId || !listingId) return res.status(400).json({ message: 'listingId is required' });
        const flavorId = req.query.flavorId ? parseInt(req.query.flavorId as string) : null;
        const sizeId = req.query.sizeId ? parseInt(req.query.sizeId as string) : null;
        const cafeId = req.session?.userId ? (await storage.getUser(req.session.userId))?.id : undefined;
        const detail = await storage.getPromotionDetailForListing(promotionId, listingId, { flavorId, sizeId }, cafeId);
        if (!detail) return res.status(404).json({ message: 'Promotion not found' });
        res.json(detail);
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    // GET /api/marketplace/products/image-data?ids=1,2,3 — batched, lightweight
    // image+crop lookup (task: "Synchronize Updated Product and Pack Images in
    // Coffee Owner Cart") so a cart row can re-resolve a fresh image without
    // one request per line. Never price/stock — no stripCommercialData needed.
    // Must be defined BEFORE /api/marketplace/:productId to avoid the wildcard
    // shadowing it (same reason as the /promotions route above).
    app.get('/api/marketplace/products/image-data', async (req, res) => {
      try {
        const rawIds = req.query.ids as string;
        if (!rawIds) return res.json([]);
        const ids = rawIds.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
        const data = await storage.getProductImageData(ids);
        res.json(data);
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

    // ── Promotions (Supplier) ──────────────────────────────────────────────────

    const requireSupplier = async (req: any, res: any, next: any) => {
      if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'SUPPLIER') return res.status(403).json({ message: 'Forbidden' });
      (req as any).supplier = user;
      next();
    };

    // Admin → System Management → Promotion's global toggle (task: "Admin Promotion
    // Management — Supplier Promotions Visibility"). Gates only the Supplier-facing
    // management endpoints below — never /api/promotions/evaluate, /api/marketplace/
    // promotions*, or order creation, which must keep working for Coffee Owners and
    // already-created promotions regardless of this setting (see this file's own
    // "Promotions (Cafe / Marketplace)" section, untouched). Always runs after
    // requireSupplier, so it only ever applies to a confirmed SUPPLIER-role request —
    // never to Admin/SUPER_ADMIN, which requireSupplier already rejects before this
    // middleware would even run.
    const requirePromotionsEnabled = async (req: any, res: any, next: any) => {
      const settings = await storage.getPromotionSettings();
      if (!settings.globalVisible) {
        return res.status(403).json({ message: "Cette fonctionnalité est temporairement indisponible." });
      }
      next();
    };

    // GET /api/promotions — supplier's own promotions list
    app.get('/api/promotions', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
      try {
        const promos = await storage.getPromotions(req.supplier.id);
        res.json(promos);
      } catch { res.status(500).json({ message: 'Error fetching promotions' }); }
    });

    // GET /api/promotions/stats — supplier dashboard stats
    app.get('/api/promotions/stats', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
      try {
        const stats = await storage.getPromotionStats(req.supplier.id);
        res.json(stats);
      } catch { res.status(500).json({ message: 'Error fetching promotion stats' }); }
    });

    // GET /api/promotions/my-listings — supplier's listings for promotion assignment UI
    app.get('/api/promotions/my-listings', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
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
              imageAdjustments: l.product.imageAdjustments ?? {},
              category: l.product.category,
              categoryId: l.product.categoryId,
              price: l.price,
              stock: l.stock,
            }))
        );
      } catch { res.status(500).json({ message: 'Error fetching listings' }); }
    });

    // GET /api/promotions/my-categories — supplier's categories for promotion assignment UI
    app.get('/api/promotions/my-categories', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
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
    app.get('/api/promotions/:id', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
      try {
        const promo = await storage.getPromotion(parseInt(req.params.id), req.supplier.id);
        if (!promo) return res.status(404).json({ message: 'Not found' });
        res.json(promo);
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    // GET /api/promotions/:id/usage — usage history
    app.get('/api/promotions/:id/usage', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
      try {
        const promo = await storage.getPromotion(parseInt(req.params.id), req.supplier.id);
        if (!promo) return res.status(404).json({ message: 'Not found' });
        const usage = await storage.getPromotionUsage(promo.id);
        res.json(usage);
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    // POST /api/promotions — create
    app.post('/api/promotions', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
      try {
        const body = req.body;
        // A disabled type can never be used for a NEW promotion, even via a manipulated
        // frontend request (task: "The backend rejects attempts to create a new
        // promotion using that disabled type"). Never affects existing promotions —
        // this check only runs on creation.
        if (body.type) {
          const typeSettings = await storage.getPromotionTypeSettings();
          if (typeSettings[body.type as import("@shared/schema").PromotionType] === false) {
            return res.status(400).json({ message: "Ce type de promotion n'est pas disponible actuellement." });
          }
        }
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
    app.patch('/api/promotions/:id/targets', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
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
    app.put('/api/promotions/:id', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
      try {
        const body = req.body;
        // Strip server-managed / read-only fields so Drizzle never tries to cast them
        const { id: _id, supplierId: _s, usageCount: _u, createdAt: _ca, updatedAt: _ua, ...safeBody } = body;
        // A disabled type can never be CHANGED TO — but an existing promotion already
        // of that (now-disabled) type must stay editable on every other field without
        // being forced to change its type (task: "unless the existing promotion is
        // being preserved without changing its type").
        if (safeBody.type) {
          const existing = await storage.getPromotion(parseInt(req.params.id), req.supplier.id);
          if (!existing) return res.status(404).json({ message: 'Not found' });
          if (safeBody.type !== existing.type) {
            const typeSettings = await storage.getPromotionTypeSettings();
            if (typeSettings[safeBody.type as import("@shared/schema").PromotionType] === false) {
              return res.status(400).json({ message: "Ce type de promotion n'est pas disponible actuellement." });
            }
          }
        }
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
    app.patch('/api/promotions/:id/status', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
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
    app.post('/api/promotions/:id/duplicate', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
      try {
        // Duplicating a promotion of a disabled type would create a NEW promotion row
        // of that type — exactly what "the backend rejects attempts to create a new
        // promotion using that disabled type" forbids, so this is checked here too,
        // not just on POST /api/promotions.
        const original = await storage.getPromotion(parseInt(req.params.id), req.supplier.id);
        if (!original) return res.status(404).json({ message: 'Not found' });
        const typeSettings = await storage.getPromotionTypeSettings();
        if (typeSettings[original.type as import("@shared/schema").PromotionType] === false) {
          return res.status(400).json({ message: "Ce type de promotion n'est pas disponible actuellement." });
        }
        const dup = await storage.duplicatePromotion(parseInt(req.params.id), req.supplier.id);
        if (!dup) return res.status(404).json({ message: 'Not found' });
        broadcast('promotion_updated', { supplierId: req.supplier.id, promotionId: dup.id });
        res.status(201).json(dup);
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    // DELETE /api/promotions/:id — delete
    app.delete('/api/promotions/:id', requireSupplier, requirePromotionsEnabled, async (req: any, res) => {
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

        const itemsBySupplier = new Map<number, import('../promotions-engine').PromoCartItem[]>();
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

    // ── Discount Codes (Supplier) ──────────────────────────────────────────────
    // Completely separate mechanism from Promotions above — a code the Coffee Owner types
    // in at checkout, rather than an automatically-applied eligibility rule. See the note
    // on shared/schema.ts's discountCodes table.

    // GET /api/discount-codes — supplier's own codes list
    app.get('/api/discount-codes', requireSupplier, async (req: any, res) => {
      try {
        const codes = await storage.getDiscountCodes(req.supplier.id);
        res.json(codes);
      } catch { res.status(500).json({ message: 'Error fetching discount codes' }); }
    });

    // GET /api/discount-codes/stats — supplier dashboard stats
    app.get('/api/discount-codes/stats', requireSupplier, async (req: any, res) => {
      try {
        const stats = await storage.getDiscountCodeStats(req.supplier.id);
        res.json(stats);
      } catch { res.status(500).json({ message: 'Error fetching discount code stats' }); }
    });

    // GET /api/discount-codes/:id/usage — redemption history for one code
    app.get('/api/discount-codes/:id/usage', requireSupplier, async (req: any, res) => {
      try {
        const code = await storage.getDiscountCode(parseInt(req.params.id), req.supplier.id);
        if (!code) return res.status(404).json({ message: 'Not found' });
        const usage = await storage.getDiscountCodeUsageHistory(code.id);
        res.json(usage);
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    // POST /api/discount-codes — create
    app.post('/api/discount-codes', requireSupplier, async (req: any, res) => {
      try {
        const body = z.object({
          code: z.string().trim().min(3).max(40),
          discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
          discountValue: z.number().min(0),
          maxUses: z.number().int().min(1).nullable().optional(),
          minimumOrderAmount: z.number().min(0).nullable().optional(),
          expiresAt: z.string().datetime().nullable().optional(),
          isActive: z.boolean().optional(),
        }).parse(req.body);
        const code = await storage.createDiscountCode({
          ...body,
          supplierId: req.supplier.id,
          maxUses: body.maxUses ?? null,
          minimumOrderAmount: body.minimumOrderAmount ?? null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          isActive: body.isActive ?? true,
        } as any);
        broadcast('discount_code_updated', { supplierId: req.supplier.id, discountCodeId: code.id });
        res.status(201).json(code);
      } catch (err: any) {
        // Unique constraint violation on `code` surfaces as a Postgres error — give a clear message.
        const message = /unique/i.test(err?.message ?? '') ? 'Ce code est déjà utilisé.' : (err?.message ?? 'Error creating discount code');
        res.status(400).json({ message });
      }
    });

    // PUT /api/discount-codes/:id — update
    app.put('/api/discount-codes/:id', requireSupplier, async (req: any, res) => {
      try {
        const body = z.object({
          code: z.string().trim().min(3).max(40).optional(),
          discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
          discountValue: z.number().min(0).optional(),
          maxUses: z.number().int().min(1).nullable().optional(),
          minimumOrderAmount: z.number().min(0).nullable().optional(),
          expiresAt: z.string().datetime().nullable().optional(),
          isActive: z.boolean().optional(),
        }).parse(req.body);
        const updated = await storage.updateDiscountCode(parseInt(req.params.id), req.supplier.id, {
          ...body,
          expiresAt: body.expiresAt !== undefined ? (body.expiresAt ? new Date(body.expiresAt) : null) : undefined,
        } as any);
        if (!updated) return res.status(404).json({ message: 'Not found' });
        broadcast('discount_code_updated', { supplierId: req.supplier.id, discountCodeId: updated.id });
        res.json(updated);
      } catch (err: any) {
        const message = /unique/i.test(err?.message ?? '') ? 'Ce code est déjà utilisé.' : (err?.message ?? 'Error updating discount code');
        res.status(400).json({ message });
      }
    });

    // PATCH /api/discount-codes/:id/status — quick activate/deactivate
    app.patch('/api/discount-codes/:id/status', requireSupplier, async (req: any, res) => {
      try {
        const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
        const updated = await storage.updateDiscountCode(parseInt(req.params.id), req.supplier.id, { isActive } as any);
        if (!updated) return res.status(404).json({ message: 'Not found' });
        broadcast('discount_code_updated', { supplierId: req.supplier.id, discountCodeId: updated.id });
        res.json(updated);
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    // DELETE /api/discount-codes/:id — remove (soft-delete, see isRemoved
    // column comment in shared/schema.ts — never a hard DELETE, so existing
    // discount_code_usage/order history is never orphaned or lost).
    app.delete('/api/discount-codes/:id', requireSupplier, async (req: any, res) => {
      try {
        const updated = await storage.removeDiscountCode(parseInt(req.params.id), req.supplier.id);
        if (!updated) return res.status(404).json({ message: 'Not found' });
        broadcast('discount_code_updated', { supplierId: req.supplier.id, discountCodeId: updated.id });
        res.json({ message: 'Removed' });
      } catch { res.status(500).json({ message: 'Error removing discount code' }); }
    });

    // ── Discount Codes (Cafe / Checkout) ────────────────────────────────────────

    // POST /api/discount-codes/validate — preview validation for the cart page. The Coffee
    // Owner enters a single code with no supplier context, so this resolves which supplier
    // it belongs to itself, then validates only against that supplier's items in the cart —
    // never against another supplier's subtotal, matching the same multi-supplier separation
    // the order-creation route enforces.
    app.post('/api/discount-codes/validate', requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user || user.role !== 'CAFE_OWNER') return res.status(403).json({ message: 'Forbidden' });
        const { code, items } = z.object({
          code: z.string().trim().min(1),
          items: z.array(z.object({ supplierId: z.number(), quantity: z.number().min(1), unitPrice: z.number().min(0) })),
        }).parse(req.body);
        const found = await storage.getDiscountCodeByCode(code);
        if (!found) return res.json({ valid: false, message: "Ce code n'existe pas." });
        const supplierItems = items.filter(i => i.supplierId === found.supplierId);
        if (supplierItems.length === 0) {
          return res.json({ valid: false, message: "Ce code n'est pas applicable aux articles de votre panier." });
        }
        const subtotal = supplierItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        const result = await storage.validateDiscountCode(code, found.supplierId, subtotal);
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ valid: false, message: err?.message ?? 'Error validating code' });
      }
    });
}
