import { requireAuth, requireAdmin, requireApprovedSupplier } from "./shared/middleware";
import { storage } from "../storage";
import { broadcast } from "../ws";
import { z } from "zod";
import { db } from "../db";
import { users, supplierProductListings, products, packs, packItems as packItemsTable, supplierStores, type InventoryFilters, type InventorySort } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { notify, notifyMany } from "../notify";
import type { Express } from "express";

export function registerSupplierRoutes(app: Express): void {
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
      isWhatsapp: z.boolean().optional(),
      profileImageUrl: z.string().optional().nullable(),
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

    // ── Cafés — Supplier → Cafes. Real café accounts, either derived from actual orders
    // placed with this supplier or explicitly added via "Add Café" (see storage.getSupplierCafes
    // / createCafeForSupplier). Not a separate café-user system — created accounts are ordinary
    // CAFE_OWNER users, reachable everywhere a café account normally is. ──────────────────────

    const cafeCreateSchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      phone: z.string().optional().nullable(),
      isWhatsapp: z.boolean().optional(),
      profileImageUrl: z.string().optional().nullable(),
    });

    app.get('/api/supplier/cafes', requireApprovedSupplier, async (req, res) => {
      try {
        res.json(await storage.getSupplierCafes(req.session.userId!));
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Error fetching cafes' });
      }
    });

    app.post('/api/supplier/cafes', requireApprovedSupplier, async (req, res) => {
      try {
        const data = cafeCreateSchema.parse(req.body);
        const cafe = await storage.createCafeForSupplier(req.session.userId!, data);
        broadcast('admin_user_directory_changed');
        res.status(201).json(cafe);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Error creating cafe' });
      }
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

    app.patch("/api/supplier/categories/order", requireApprovedSupplier, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        const { categoryIds } = z.object({ categoryIds: z.array(z.number()).min(0) }).parse(req.body);
        await storage.reorderSupplierCategories(user!.id, categoryIds);
        broadcast("supplier_mapping_changed", { supplierId: user!.id, categoryOrder: categoryIds });
        res.json({ success: true });
      } catch { res.status(400).json({ message: "Invalid category order" }); }
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
          // Required with >=1 entry (task: "Fix Invalid Supplier Product
          // Mappings and Empty Products") — a mapping with zero variants is
          // exactly the invalid/orphaned state this task eliminates; the
          // client's own "Add" button has always required this (hasAnyPrice),
          // this just makes the rule authoritative server-side too.
          variants: z.array(z.object({
            flavorId: z.number().nullable().optional(),
            sizeId: z.number().nullable().optional(),
            price: z.number().min(0),
            quantity: z.number().min(0),
          })).min(1, "At least one variant is required"),
        }).refine(
          (b) => b.variants.some((v) => v.price > 0 && v.quantity > 0),
          { message: "At least one variant needs a price and stock greater than zero" },
        ).parse(req.body);

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

        // Listing + variants created atomically (see createSupplierListingWithVariants) —
        // a failure partway through can never leave a listing persisted with zero variants.
        const { listing } = await storage.createSupplierListingWithVariants({
          supplierId: user!.id,
          productId: body.productId,
          price: 0,
          stock: 0,
          availableFlavorIds: null,
          availableSizeIds: null,
          availableBrandIds: null,
          onlyForPack,
          onlyForMyProducts,
        }, body.variants.map(v => ({
          flavorId: v.flavorId ?? null,
          sizeId: v.sizeId ?? null,
          price: Math.round(v.price * 100),
          quantity: v.quantity,
        })));

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
          isIndividuallyVisible: z.boolean().optional(),
          variants: z.array(z.object({
            flavorId: z.number().nullable().optional(),
            sizeId: z.number().nullable().optional(),
            price: z.number().min(0),
            quantity: z.number().min(0),
          })).optional(),
        }).refine(
          // Only checked when the supplier is actually submitting a variants
          // array (task: "Fix Invalid Supplier Product Mappings and Empty
          // Products") — editing variants down to zero would re-create the
          // exact orphaned/invalid-mapping state this task eliminates. A
          // supplier who wants to stop selling a product has Remove for that;
          // Save must always leave >=1 valid variant on an active listing.
          (b) => b.variants === undefined || b.variants.some((v) => v.price > 0 && v.quantity > 0),
          { message: "At least one variant needs a price and stock greater than zero" },
        ).parse(req.body);

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
        // Standalone-listing-only — see schema comment on isIndividuallyVisible.
        // Applied unconditionally (never folded into the removingFromPackProducts
        // short-circuit below, which is specific to the onlyForPack/onlyForMyProducts pair).
        if (body.isIndividuallyVisible !== undefined) listingUpdate.isIndividuallyVisible = body.isIndividuallyVisible;
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
        // Surfaces the specific validation message (e.g. the new "at least one
        // variant needs a price and stock greater than zero" rule) instead of
        // the generic "Invalid" — task: "Fix Invalid Supplier Product
        // Mappings and Empty Products" explicitly asks for an actionable
        // message, not just a rejection.
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
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
      } catch (err: any) {
        if (err?.code === "LISTING_USED_IN_PACK") return res.status(409).json({ message: err.message });
        res.status(500).json({ message: "Error" });
      }
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
          const listingId = parseInt(req.params.listingId);
          broadcast("low_stock_alert", {
            supplierId: user!.id,
            listingId,
            variantId,
            stock: result.variant.quantity,
            minStock: result.variant.minStock,
            status: result.variant.quantity <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
          });
          const outOfStock = result.variant.quantity <= 0;
          const [productRow] = await db.select({ name: products.name })
            .from(supplierProductListings).innerJoin(products, eq(products.id, supplierProductListings.productId))
            .where(eq(supplierProductListings.id, listingId));
          await notify({
            userId: user!.id,
            service: "SHOP", type: outOfStock ? "out_of_stock" : "low_stock", priority: "WARNING",
            title: outOfStock ? "Rupture de stock" : "Stock faible",
            message: outOfStock
              ? `${productRow?.name ?? "Un produit"} est en rupture de stock.`
              : `${productRow?.name ?? "Un produit"} a un stock faible (${result.variant.quantity} restant(s)).`,
            entityType: "listing", entityId: listingId,
            prefKey: "shop_stock",
            dedupeKey: `shop:low_stock:${result.history.id}`,
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

    app.get('/api/stores/:id/packs', async (req, res) => {
      try {
        const [store] = await db.select().from(supplierStores).where(eq(supplierStores.id, parseInt(req.params.id)));
        if (!store) return res.status(404).json({ message: 'Not found' });
        res.json(await storage.getMarketplacePacks({ supplierId: store.supplierId }));
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
        await notify({
          userId: store.supplierId,
          service: "ADMIN", type: "store_approval_changed", priority: "SUCCESS",
          title: "Boutique approuvée",
          message: "Votre boutique a été approuvée et est maintenant visible.",
          entityType: "store", entityId: store.id,
          prefKey: "stores",
          dedupeKey: `admin:store_approval:${store.id}:APPROVED`,
        });
        res.json(store);
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    app.patch('/api/admin/stores/:id/reject', requireAdmin, async (req, res) => {
      try {
        const store = await storage.setStoreApprovalStatus(parseInt(req.params.id), 'REJECTED');
        if (!store) return res.status(404).json({ message: 'Not found' });
        broadcast('store_approval_changed', { storeId: store.id, supplierId: store.supplierId, status: 'REJECTED' });
        await notify({
          userId: store.supplierId,
          service: "ADMIN", type: "store_approval_changed", priority: "WARNING",
          title: "Boutique refusée",
          message: "Votre boutique a été refusée. Contactez l'administration pour plus d'informations.",
          entityType: "store", entityId: store.id,
          prefKey: "stores",
          dedupeKey: `admin:store_approval:${store.id}:REJECTED`,
        });
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

    // Entity-level report — a Coffee Owner flagging a Supplier (via their Shop
    // Store page), mirrors POST /api/maintenance/:userId/report exactly (task:
    // "Extend the Shared Reporting System to Supplier Stores"). Targets the
    // supplier ACCOUNT (supplierId), never a Product or Pack — the submitting
    // page may be showing a specific product/pack, but the report is always
    // about the store/supplier itself.
    app.post("/api/supplier/:userId/report", requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "CAFE_OWNER") return res.status(403).json({ message: "Coffee Owner access required" });
      const supplierId = Number(req.params.userId);
      const target = await storage.getUser(supplierId);
      if (!target || target.role !== "SUPPLIER") return res.status(404).json({ message: "Supplier account not found" });
      try {
        const { reason, rating } = z.object({ reason: z.string().min(1).max(500), rating: z.number().int().min(1).max(5) }).parse(req.body);
        const report = await storage.createSupplierReport(user.id, supplierId, reason, rating);
        broadcast("admin_supplier_report_created", { supplierId });
        const adminIds = await storage.getAdminUserIds();
        await notifyMany({
          userIds: adminIds,
          service: "ADMIN", type: "supplier_report_created", priority: "URGENT",
          title: "Fournisseur signalé",
          message: `${user.name} a signalé ${target.name} (Supplier) : "${reason}".`,
          entityType: "supplier_report", entityId: report.id,
          prefKey: "reports",
          dedupeKeyPrefix: `admin:supplier_report_created:${report.id}`,
        });
        res.status(201).json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid report data" });
      }
    });

    app.get("/api/supplier/reports/published", requireAuth, async (req: any, res) => {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 50);
      res.json(await storage.getPublishedSupplierReports(page, limit));
    });

    app.get("/api/admin/supplier/reports", requireAdmin, async (req: any, res) => {
      const status = typeof req.query.status === "string" ? (req.query.status as "PENDING" | "PUBLISHED" | "REJECTED") : undefined;
      res.json(await storage.getSupplierReports(status));
    });

    app.patch("/api/admin/supplier/reports/:id/resolve", requireAdmin, async (req: any, res) => {
      try {
        const { status, resolutionNote } = z.object({
          status: z.enum(["PUBLISHED", "REJECTED"]),
          resolutionNote: z.string().max(1000).optional(),
        }).parse(req.body);
        if (status === "PUBLISHED") {
          const target = await storage.getSupplierReportById(Number(req.params.id));
          if (!target) return res.status(404).json({ message: "Not found" });
          if (target.rating == null) return res.status(400).json({ message: "Ce signalement n'a pas de note et ne peut pas être publié." });
        }
        const report = await storage.resolveSupplierReport(Number(req.params.id), status, resolutionNote, req.session.userId);
        if (!report) return res.status(404).json({ message: "Not found" });
        broadcast("admin_supplier_report_created", { supplierId: report.supplierId });
        res.json(report);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: "Invalid data" });
      }
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
}
