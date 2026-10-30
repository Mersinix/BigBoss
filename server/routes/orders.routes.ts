import { api } from "@shared/routes";
import { requireAuth, requireApprovedCafeOwner, requireApprovedSupplier, requireAdmin } from "./shared/middleware";
import { storage } from "../storage";
import { z } from "zod";
import { broadcast, broadcastToUsers } from "../ws";
import { notifyMany, notify } from "../notify";
import { canUpdateOrderStatus } from "./shared/helpers";
import { db } from "../db";
import { subOrders } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Express } from "express";

export function registerOrdersRoutes(app: Express): void {
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
        filters.viewerRole = user?.role;
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

        const { items, packItems, deliveryAddress, deliveryMethod, paymentMethod, courierInstructions, priority, scheduledAt, discountCode } = z.object({
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
          discountCode: z.string().trim().min(1).max(40).optional(),
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
        const itemsBySupplier = new Map<number, import('../promotions-engine').PromoCartItem[]>();
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

        // ── Discount Code validation (separate mechanism from Promotions) ─────
        // Always re-validated here server-side (never trusted from an earlier /validate
        // preview call) so a code that expired/got deactivated/hit its limit between the
        // preview and checkout can never slip through.
        let discountCodeResult: (import("@shared/schema").DiscountCodeValidationResult & { supplierId: number }) | undefined;
        if (discountCode) {
          const found = await storage.getDiscountCodeByCode(discountCode);
          const supplierItems = found ? itemsBySupplier.get(found.supplierId) : undefined;
          if (!found || !supplierItems) {
            return res.status(400).json({ message: "Ce code n'est pas applicable aux articles de votre panier." });
          }
          const supplierSubtotal = supplierItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
          const validation = await storage.validateDiscountCode(discountCode, found.supplierId, supplierSubtotal);
          if (!validation.valid) {
            return res.status(400).json({ message: validation.message ?? "Code promo invalide." });
          }
          discountCodeResult = { ...validation, supplierId: found.supplierId };
        }

        const order = await storage.createOrder(cafeId, validatedItems, {
          deliveryAddress: normalizedDelivery,
          deliveryMethod,
          paymentMethod,
          courierInstructions,
          packItems: validatedPackItems,
          promotionResults: promoEval.bySupplier,
          discountCodeResult,
          priority: priority ?? 'NORMAL',
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        });

        // Record promotion usage for each applied promotion
        for (const result of promoEval.bySupplier) {
          if (result.promotionId && result.discountAmount > 0) {
            await storage.recordPromotionUsage(result.promotionId, cafeId, order.id, result.discountAmount);
            // Usage count/savings just changed — let the owning supplier's Promotions page
            // (list + stats) refresh in real time, same broadcast used by every other
            // promotion mutation below.
            broadcast('promotion_updated', { supplierId: result.supplierId, promotionId: result.promotionId });
          }
        }

        // Discount code usage was already recorded inside storage.createOrder's own
        // transaction — just let the owning supplier's Discount Codes page know to refresh.
        if (discountCodeResult?.discountCodeId) {
          broadcast('discount_code_updated', { supplierId: discountCodeResult.supplierId, discountCodeId: discountCodeResult.discountCodeId });
        }

        // Notify all involved suppliers about the new order
        const involvedSupplierIds = Array.from(new Set([...validatedItems.map(i => i.supplierId), ...(validatedPackItems ?? []).map(i => i.supplierId)]));
        await storage.refreshOrderMessagingState(order.id);
        broadcastToUsers(involvedSupplierIds, 'order_created', { orderId: order.id, cafeId });
        broadcastToUsers([cafeId, ...involvedSupplierIds], 'conversation_updated', { orderId: order.id, service: "SHOP" });
        broadcast('inventory_updated', { orderId: order.id });

        const cafeUser = await storage.getUser(cafeId);
        await notifyMany({
          userIds: involvedSupplierIds,
          service: "SHOP", type: "order_created", priority: "URGENT",
          title: "Nouvelle commande reçue",
          message: `${cafeUser?.name ?? "Un café"} a passé une nouvelle commande #${order.id}.`,
          entityType: "order", entityId: order.id,
          prefKey: "shop_orders",
          dedupeKeyPrefix: `shop:order_created:${order.id}`,
        });
        await notify({
          userId: cafeId,
          service: "SHOP", type: "order_created", priority: "INFO",
          title: "Commande créée",
          message: `Votre commande #${order.id} a été transmise avec succès.`,
          entityType: "order", entityId: order.id,
          prefKey: "shop_orders",
          dedupeKey: `shop:order_created_confirm:${order.id}:${cafeId}`,
        });

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
        if (input.status === 'CANCELLED') {
          await notify({
            userId: order.cafeId,
            service: "SHOP", type: "order_cancelled", priority: "WARNING",
            title: "Commande annulée",
            message: `Votre commande #${orderId} a été annulée.`,
            entityType: "order", entityId: orderId,
            prefKey: "shop_orders",
            dedupeKey: `shop:order_status:${orderId}:${input.status}`,
          });
        }
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
          // Sub-order-level notification — a multi-supplier order must never produce a
          // misleading whole-order "confirmed"/"ready" notification when only ONE supplier's
          // sub-order actually changed (see spec Part 28). CANCELLED is handled separately
          // below via the suborder_rejected cart-recovery notification, which carries the
          // richer "items returned to your cart" context — skipped here to avoid a duplicate.
          const STATUS_LABELS_FR: Record<string, string> = {
            CONFIRMED: `a confirmé votre commande #${subOrder.orderId}`,
            PREPARING: `prépare votre commande #${subOrder.orderId}`,
            READY: `a terminé de préparer votre commande #${subOrder.orderId} — prête`,
          };
          if (STATUS_LABELS_FR[status]) {
            await notify({
              userId: order.cafeId,
              service: "SHOP", type: "suborder_status_changed", priority: status === 'READY' ? "SUCCESS" : "INFO",
              title: "Mise à jour de commande",
              message: `${subOrder.supplierName || "Le fournisseur"} ${STATUS_LABELS_FR[status]}.`,
              entityType: "suborder", entityId: subOrderId,
              prefKey: "shop_orders",
              dedupeKey: `shop:suborder_status:${subOrderId}:${status}`,
            });
          }
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
          await notify({
            userId: order.cafeId,
            service: "SHOP", type: "suborder_rejected", priority: "WARNING",
            title: "Commande annulée par le fournisseur",
            message: `${subOrder.supplierName || "Le fournisseur"} a annulé votre commande #${subOrder.orderId}. Les articles ont été replacés dans votre panier et doivent être mis à jour avant une nouvelle commande.`,
            entityType: "order", entityId: subOrder.orderId,
            prefKey: "shop_orders",
            dedupeKey: `shop:suborder_rejected:${subOrderId}`,
          });
        }
        res.json(updated);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Invalid request' });
      }
    });

    // ── Self Pickup confirmation (Coffee Owner) — Delivery System V2 ────────────
    // The Coffee Owner types back the 6-digit code the Supplier gave them in person. Every
    // check (ownership, fulfillment type, sub-order status, code match, single-use) happens
    // server-side in storage.confirmSelfPickup — the frontend value is never trusted alone.

    app.patch('/api/suborders/:id/confirm-self-pickup', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        if (user.role !== 'CAFE_OWNER') return res.status(403).json({ message: 'Forbidden' });
        const subOrderId = parseInt(req.params.id);
        const { code } = z.object({ code: z.string().trim().min(1).max(20) }).parse(req.body);
        const updated = await storage.confirmSelfPickup(subOrderId, user.id, code);
        const order = await storage.getOrder(updated.orderId);
        broadcastToUsers([user.id, updated.supplierId], 'suborder_status_changed', {
          orderId: updated.orderId, subOrderId, status: updated.status,
        });
        broadcast('suborder_status_changed', { orderId: updated.orderId, subOrderId, status: updated.status });
        if (order) {
          await notify({
            userId: updated.supplierId,
            service: "SHOP", type: "self_pickup_confirmed", priority: "SUCCESS",
            title: "Retrait confirmé",
            message: `Le café a confirmé le retrait de la commande #${updated.orderId}.`,
            entityType: "suborder", entityId: subOrderId,
            prefKey: "shop_orders",
            dedupeKey: `shop:self_pickup_confirmed:${subOrderId}`,
          });
        }
        res.json(updated);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Unable to confirm pickup' });
      }
    });

    // ── Transport requirements (Supplier) — Delivery System V2 ──────────────────
    // Purely informational + vehicle-compatibility-gating (see storage.isVehicleCompatible).
    // Never touches pricing. Only the owning supplier may set these for their own sub-order.

    app.patch('/api/suborders/:id/transport-requirements', requireApprovedSupplier, async (req, res) => {
      try {
        const subOrderId = parseInt(req.params.id);
        const body = z.object({
          requiredVehicleType: z.enum(['BICYCLE', 'MOTO', 'CAR', 'VAN', 'TRUCK', 'OTHER']).nullable().optional(),
          totalWeightKg: z.string().max(20).nullable().optional(),
          totalVolumeL: z.string().max(20).nullable().optional(),
          numberOfPackages: z.number().int().min(0).nullable().optional(),
          numberOfItems: z.number().int().min(0).nullable().optional(),
          isFragile: z.boolean().optional(),
          specialHandling: z.string().max(500).nullable().optional(),
        }).parse(req.body);
        const updated = await storage.updateSubOrderTransportRequirements(subOrderId, req.session.userId!, body);
        // Dedicated event (distinct from 'suborder_status_changed', which this field group isn't
        // part of) so every already-open consumer — Supplier/Coffee Owner/Admin order views
        // (GET /api/orders) and Espace Livraison/Chauffeur/Admin delivery views
        // (GET /api/deliveries) — refetches the one authoritative sub_orders row (see
        // storage.updateSubOrderTransportRequirements) without a page refresh. Global broadcast,
        // same convention as every other order/delivery event in this app: the payload here is
        // only ids + the updated requirement fields (no pricing/personal data), and each
        // consumer's subsequent GET is independently re-scoped server-side, so this never leaks
        // another user's data — see use-realtime.ts's handling of this event.
        broadcast('suborder_transport_requirements_updated', {
          orderId: updated.orderId,
          subOrderId,
          requiredVehicleType: updated.requiredVehicleType,
          totalWeightKg: updated.totalWeightKg,
          totalVolumeL: updated.totalVolumeL,
          numberOfPackages: updated.numberOfPackages,
          numberOfItems: updated.numberOfItems,
          isFragile: updated.isFragile,
          specialHandling: updated.specialHandling,
        });
        // Delivery System V2 Phase 2 — advisory suggestion only, never overrides the supplier's
        // own requiredVehicleType above. See storage.suggestRequiredVehicleType.
        const suggestedVehicleType = await storage.suggestRequiredVehicleType(updated);
        res.json({ ...updated, suggestedVehicleType });
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Unable to update transport requirements' });
      }
    });

    // ── Pre-checkout delivery estimate (Coffee Owner) — Delivery System V2 ──────
    // Explicitly an ESTIMATE: reuses the exact same computeDeliveryFee engine, but the real,
    // authoritative fee is still (re)computed fresh at READY / driver assignment — this never
    // replaces or shortcuts that. Self Pickup carts should never call this (fee is always 0
    // and there is no delivery to estimate) — the route refuses it defensively.

    app.post('/api/orders/estimate-delivery', requireApprovedCafeOwner, async (req, res) => {
      try {
        const body = z.object({
          deliveryMethod: z.enum(['SELF_PICKUP', 'DELIVERY_SERVICE']),
          // Delivery System V2 Phase 4 — `details.governorate` (already present on the client's
          // full GeoLocation object, previously silently stripped here) lets ZonePricingEngine
          // resolve a real zone for the estimate instead of always falling back to neutral —
          // see storage.resolveZonePricing. Everything else about this contract is unchanged.
          deliveryAddress: z.object({ lat: z.string(), lng: z.string(), details: z.object({ governorate: z.string().optional() }).optional() }).optional(),
          items: z.array(z.object({ supplierId: z.number(), subtotalCents: z.number().min(0) })),
        }).parse(req.body);
        if (body.deliveryMethod === 'SELF_PICKUP' || !body.deliveryAddress) {
          return res.json({ bySupplier: [], totalEstimatedCafeOwnerCents: 0 });
        }
        const bySupplier = await Promise.all(body.items.map(async (item) => {
          const est = await storage.estimateDeliveryFee({
            supplierId: item.supplierId,
            subtotalCents: item.subtotalCents,
            cafeLocation: body.deliveryAddress!,
          });
          return { supplierId: item.supplierId, ...est };
        }));
        const totalEstimatedCafeOwnerCents = bySupplier.reduce((s, r) => s + r.estimatedCafeOwnerCents, 0);
        res.json({ bySupplier, totalEstimatedCafeOwnerCents });
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Unable to estimate delivery fee' });
      }
    });

    // ── Per-supplier-order item cancellation (Coffee Owner) ─────────────────────
    // Distinct from PATCH /api/orders/:id/status (whole-order cancel) and
    // PATCH /api/suborders/:id/status (Supplier/Admin lifecycle) — this lets a Coffee
    // Owner cancel specific products/variants/packs within one still-PENDING supplier
    // order without touching the rest of the order. See storage.cancelSubOrderItems for
    // ownership/eligibility validation and totals recomputation (never trusts the client).
    app.patch('/api/suborders/:id/cancel-items', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        if (user.role !== 'CAFE_OWNER') return res.status(403).json({ message: 'Forbidden' });
        const subOrderId = parseInt(req.params.id);
        const { orderItemIds } = z.object({
          orderItemIds: z.array(z.number().int().positive()).min(1),
        }).parse(req.body);

        const result = await storage.cancelSubOrderItems(subOrderId, user.id, orderItemIds);

        broadcastToUsers([result.order.cafeId, result.subOrder.supplierId], 'suborder_items_cancelled', {
          orderId: result.order.id, subOrderId, orderItemIds, subOrderStatus: result.subOrder.status,
        });
        broadcast('suborder_items_cancelled', { orderId: result.order.id, subOrderId });
        if (result.subOrder.status === 'CANCELLED') {
          broadcast('inventory_updated', { subOrderId, orderId: result.order.id });
        }
        await notify({
          userId: result.subOrder.supplierId,
          service: "SHOP", type: "suborder_items_cancelled_by_owner", priority: "INFO",
          title: "Articles annulés par le client",
          message: `Le client a annulé ${orderItemIds.length} article(s) de la commande #${result.order.id}.`,
          entityType: "suborder", entityId: subOrderId,
          prefKey: "shop_orders",
          dedupeKey: `shop:suborder_items_cancelled_by_owner:${subOrderId}:${orderItemIds.sort().join(",")}`,
        });

        res.json(result);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        const message = err?.message ?? 'Unable to cancel items';
        const status = message === 'Forbidden' ? 403 : message.includes('not found') ? 404
          : message.includes('no longer be cancelled') || message.includes('already cancelled') ? 409
          : 400;
        res.status(status).json({ message });
      }
    });

    // ── Granular per-item/variant/quantity/Pack cancellation (Supplier) ─────────
    // Lets a Supplier cancel exactly what they cannot fulfill from their OWN sub-order —
    // a whole Pack, a single product, one variant, or part of a line's quantity — instead of
    // only being able to reject the entire sub-order (PATCH /api/suborders/:id/status still
    // does that, unchanged). See storage.cancelSupplierSubOrderItems for ownership/eligibility
    // validation, quantity-level row splitting, and stock restoration.
    app.patch('/api/suborders/:id/supplier-cancel-items', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        if (user.role !== 'SUPPLIER') return res.status(403).json({ message: 'Forbidden' });
        const subOrderId = parseInt(req.params.id);
        const { items } = z.object({
          items: z.array(z.object({
            orderItemId: z.number().int().positive(),
            quantity: z.number().int().positive(),
          })).min(1),
        }).parse(req.body);

        const result = await storage.cancelSupplierSubOrderItems(subOrderId, user.id, items);

        // Reuses the exact same event the whole-sub-order reject path already emits, carrying
        // only the just-cancelled rows (see getSubOrderItemsForCartRestore's itemIds filter) —
        // the existing use-realtime.ts 'suborder_rejected' handler already restores these into
        // the Coffee Owner's cart with the cancelledBySupplier marker, unchanged, whether the
        // rest of the sub-order is still active or not.
        const cartItems = await storage.getSubOrderItemsForCartRestore(subOrderId, result.cancelledItemIds);
        broadcastToUsers([result.order.cafeId], 'suborder_rejected', {
          orderId: result.order.id,
          subOrderId,
          supplierName: result.subOrder.supplierName,
          regularItems: cartItems.regularItems,
          packItems: cartItems.packItems,
        });
        // Order-list/details refresh for the Coffee Owner, this Supplier, and every other
        // connected client (Admin, other tabs) — same event ORDER_EVENTS already invalidates
        // ["/api/orders"] on.
        broadcastToUsers([result.order.cafeId, result.subOrder.supplierId], 'suborder_items_cancelled', {
          orderId: result.order.id, subOrderId, subOrderStatus: result.subOrder.status,
        });
        broadcast('suborder_items_cancelled', { orderId: result.order.id, subOrderId });
        // Stock was restored regardless of whether the whole sub-order ended up cancelled —
        // unlike the Coffee-Owner-initiated cancel-items route above, always notify so any other
        // Coffee Owner viewing this product/Pack sees the restored quantity without refreshing.
        broadcast('inventory_updated', { subOrderId, orderId: result.order.id });

        // Reflect exactly what was cancelled (Pack vs product/variant vs both) rather than a
        // generic "order cancelled" — see spec Part 29 (never send a generic cancellation notice
        // when only one item type was cancelled).
        const packCount = cartItems.packItems.length;
        const regularCount = cartItems.regularItems.length;
        let cancelledWhat: string;
        if (packCount > 0 && regularCount === 0) cancelledWhat = packCount === 1 ? "un pack" : `${packCount} packs`;
        else if (regularCount > 0 && packCount === 0) cancelledWhat = regularCount === 1 ? "un article" : `${regularCount} articles`;
        else cancelledWhat = "des articles";
        await notify({
          userId: result.order.cafeId,
          service: "SHOP", type: "suborder_items_cancelled_by_supplier", priority: "WARNING",
          title: "Articles annulés par le fournisseur",
          message: `${result.subOrder.supplierName || "Le fournisseur"} a annulé ${cancelledWhat} de votre commande #${result.order.id}. Ils ont été replacés dans votre panier.`,
          entityType: "order", entityId: result.order.id,
          prefKey: "shop_orders",
          dedupeKey: `shop:suborder_items_cancelled_by_supplier:${subOrderId}:${result.cancelledItemIds.sort().join(",")}`,
        });

        res.json(result);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        const message = err?.message ?? 'Unable to cancel items';
        const status = message === 'Forbidden' ? 403 : message.includes('not found') ? 404
          : message.includes('no longer be modified') || message.includes('already cancelled') ? 409
          : 400;
        res.status(status).json({ message });
      }
    });

    // ── Order favorite ("Daily") — Coffee Owner only, own orders ─────────────────
    app.patch('/api/orders/:id/favorite', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const orderId = parseInt(req.params.id);
        const { isFavorite } = z.object({ isFavorite: z.boolean() }).parse(req.body);
        const updated = await storage.setOrderFavorite(orderId, user.id, isFavorite);
        res.json(updated);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        const message = err?.message ?? 'Unable to update favorite';
        res.status(message === 'Forbidden' ? 403 : message.includes('not found') ? 404 : 400).json({ message });
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
}
