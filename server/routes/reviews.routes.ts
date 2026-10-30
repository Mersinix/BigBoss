import { storage } from "../storage";
import { db } from "../db";
import { supplierProductReviews, supplierProductListings, packs } from "@shared/schema";
import { and, eq, desc } from "drizzle-orm";
import { notify } from "../notify";
import { requireAuth, requireAdmin } from "./shared/middleware";
import { z } from "zod";
import { broadcast } from "../ws";
import type { Express } from "express";

export function registerReviewsRoutes(app: Express): void {
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
        if (!isUpdate && !isProductReview) {
          await notify({
            userId: Number(supplierId),
            service: "SHOP", type: "supplier_review_created", priority: "INFO",
            title: "Nouvel avis reçu",
            message: `${user.name} vous a laissé un avis (${rating}/5).`,
            entityType: "review", entityId: review.id,
            prefKey: "reviews",
            dedupeKey: `shop:supplier_review_created:${review.id}`,
          });
        }
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
        await notify({
          userId: pack.supplierId,
          service: "SHOP", type: "pack_review_created", priority: "INFO",
          title: "Nouvel avis reçu",
          message: `${user.name} vous a laissé un avis (${body.rating}/5) sur "${pack.name}".`,
          entityType: "review", entityId: review.id,
          prefKey: "reviews",
          dedupeKey: `shop:pack_review_created:${review.id}`,
        });
        res.status(201).json(review);
      } catch (err) {
        if (err instanceof z.ZodError) res.status(400).json({ message: err.errors[0].message });
        else res.status(500).json({ message: "Error" });
      }
    });
}
