import { requireAuth, requireAdmin, requireApprovedSupplier, requireApprovedDeliveryCompany, requireDriver } from "./shared/middleware";
import { storage } from "../storage";
import { z } from "zod";
import { db } from "../db";
import { subOrders, type NotificationPriority } from "@shared/schema";
import { eq } from "drizzle-orm";
import { broadcastToUsers, broadcast } from "../ws";
import { notify, notifyMany } from "../notify";
import type { Express } from "express";

// Smart Driver Dispatch System (task: "BigBossCoffee — Smart Driver Dispatch System") —
// shared by the accept-delivery route, the offer-refuse route, and the expiration worker
// below, so "try the next eligible driver" is triggered identically from every one of the
// three places §5/§7 of the audit says it must be: after a company accepts a delivery,
// after a refusal, and after an expiry. Never throws — a dispatch failure must not fail the
// caller's own primary action (accepting/refusing/expiring already succeeded by the time
// this runs).
async function triggerAutomaticDispatch(deliveryId: number): Promise<void> {
  try {
    const { offer, exhausted } = await storage.dispatchNextOffer(deliveryId);
    if (offer) {
      const delivery = await storage.getDelivery(offer.deliveryId);
      broadcastToUsers([offer.driverId], 'dispatch_offer_created', { offerId: offer.id, deliveryId, expiresAt: offer.expiresAt });
      if (delivery?.deliveryCompanyId) {
        broadcastToUsers([delivery.deliveryCompanyId], 'dispatch_status_changed', { deliveryId, state: 'OFFER_PENDING' });
      }
      await notify({
        userId: offer.driverId,
        service: "SHOP", type: "dispatch_offer_created", priority: "WARNING",
        title: "Nouvelle offre de livraison",
        message: delivery ? `Une livraison pour la commande #${delivery.order.id} (${delivery.supplier.name}) vous est proposée.` : "Une nouvelle livraison vous est proposée.",
        entityType: "delivery", entityId: deliveryId,
        prefKey: "shop_delivery",
        dedupeKey: `shop:dispatch_offer_created:${offer.id}`,
      });
    } else if (exhausted) {
      const delivery = await storage.getDelivery(deliveryId);
      if (delivery?.deliveryCompanyId) {
        broadcastToUsers([delivery.deliveryCompanyId], 'dispatch_exhausted', { deliveryId });
        await notify({
          userId: delivery.deliveryCompanyId,
          service: "SHOP", type: "dispatch_exhausted", priority: "WARNING",
          title: "Aucun chauffeur disponible",
          message: `Aucun chauffeur éligible n'a accepté la livraison de la commande #${delivery.order.id}. Une assignation manuelle est nécessaire.`,
          entityType: "delivery", entityId: deliveryId,
          prefKey: "shop_delivery",
          dedupeKey: `shop:dispatch_exhausted:${deliveryId}`,
        });
      }
    }
  } catch {
    // Best-effort — the delivery stays ACCEPTED either way and remains manually assignable;
    // nothing here is a safety invariant (see dispatchNextOffer's own doc comment).
  }
}

export function registerDeliveryRoutes(app: Express): void {
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
        const delivery = await storage.getDelivery(deliveryId, user.role);
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

    // Supplier's dispatch decision — a PENDING delivery's first-ever dispatch, OR (task:
    // "Supplier redispatch before driver confirmation") an ASSIGNED-but-not-yet-picked-up
    // delivery being redispatched, OR (task: "Update Supplier Delivery Reassignment Actions") an
    // AVAILABLE/ACCEPTED external-delivery-company delivery being reassigned before it has a
    // driver — all via the exact same "Comment livrer cette commande ?" choice. See
    // storage.dispatchDelivery().
    app.patch('/api/deliveries/:id/dispatch', requireApprovedSupplier, async (req: any, res) => {
      try {
        const deliveryId = parseInt(req.params.id);
        const supplier = req.session.userId!;
        const { mode, deliveryCompanyId } = z.object({
          mode: z.enum(['DELIVERY_COMPANY', 'SUPPLIER']),
          // Optional targeted dispatch (Part 24) — Supplier picked one specific company from the
          // real mapped cards instead of broadcasting to every partner. Validated below.
          deliveryCompanyId: z.number().int().positive().optional(),
        }).parse(req.body);
        if (deliveryCompanyId != null) {
          const target = await storage.getUser(deliveryCompanyId);
          if (!target || target.role !== 'DELIVERY_COMPANY' || target.status !== 'approved') {
            return res.status(400).json({ message: 'Invalid delivery company' });
          }
        }
        // Captured BEFORE the dispatch call so a redispatch can notify whoever was previously,
        // unconfirmed-ly assigned — same "previous" pattern the existing /reassign route uses.
        const previous = await storage.getDelivery(deliveryId);
        const updated = await storage.dispatchDelivery(deliveryId, supplier, mode, deliveryCompanyId);
        const delivery = await storage.getDelivery(deliveryId);
        if (mode === 'DELIVERY_COMPANY') {
          // Targeted → only that one company is notified; untargeted → every partner, unchanged.
          const companyIds = deliveryCompanyId != null ? [deliveryCompanyId] : await storage.getApprovedDeliveryCompanyIds();
          broadcastToUsers(companyIds, 'delivery_created', { deliveryId, status: updated.status });
        }
        if (delivery) {
          broadcastToUsers([delivery.cafeId, delivery.supplierId], 'delivery_status_changed', {
            deliveryId, status: updated.status, orderId: delivery.orderId, subOrderId: delivery.subOrderId,
          });
        }
        broadcast('delivery_status_changed', { deliveryId, status: updated.status });
        // Redispatch — notify whoever was previously assigned (driver and/or delivery company)
        // that this delivery is no longer theirs, mirroring the existing /reassign route's own
        // "delivery_reassigned_away" notification exactly (same type, same dedupe convention).
        if (previous?.status === 'ASSIGNED') {
          if (previous.driver) {
            broadcastToUsers([previous.driver.id], 'delivery_assigned', { deliveryId, status: updated.status });
            await notify({
              userId: previous.driver.id,
              service: "SHOP", type: "delivery_reassigned_away", priority: "INFO",
              title: "Livraison réattribuée",
              message: `La livraison de la commande #${previous.orderId} a été réattribuée.`,
              entityType: "delivery", entityId: deliveryId,
              prefKey: "shop_delivery",
              dedupeKey: `shop:delivery_redispatched_away:${deliveryId}:${previous.driver.id}`,
            });
          }
          if (previous.deliveryCompany) {
            broadcastToUsers([previous.deliveryCompany.id], 'delivery_status_changed', { deliveryId, status: updated.status });
          }
        }
        res.json(storage.redactDeliveryCodes(updated, 'SUPPLIER'));
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
        res.json(storage.redactDeliveryCodes(updated, 'DELIVERY_COMPANY'));
        // Smart Driver Dispatch System — fired after the response is already sent: accepting
        // the delivery is the request's own primary action and must succeed/fail on its own
        // merits; automatic dispatch is a best-effort follow-on (see triggerAutomaticDispatch).
        void triggerAutomaticDispatch(deliveryId);
      } catch (err: any) {
        res.status(409).json({ message: err.message ?? 'Unable to accept delivery' });
      }
    });

    // Delivery System V2 Phase 3 — Dispatch/Offer recommendation layer (rule 8-11): the owner's
    // own driver roster, each annotated with vehicle compatibility and an expected (provisional,
    // non-authoritative) payout preview, so the caller can make an informed choice BEFORE calling
    // the existing /assign endpoint below — never a replacement for it. Ownership is re-verified
    // server-side inside storage.getAssignableDriversForDelivery, exactly like /assign.
    app.get('/api/deliveries/:id/assignable-drivers', requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const deliveryId = parseInt(req.params.id);
        const result = await storage.getAssignableDriversForDelivery(deliveryId, { id: user.id, role: user.role });
        res.json(result);
      } catch (err: any) {
        res.status(403).json({ message: err.message ?? 'Unable to list assignable drivers' });
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
        // Smart Driver Dispatch System — a manual assignment is an explicit company decision
        // that must win over any automatic offer still outstanding for this delivery (audit
        // §8/§10: "company manually assigns while automatic dispatch has a pending offer").
        // assignDriver's own CAS already guarantees the delivery itself can't be double-
        // assigned; this only prevents a now-stale offer from later being accepted too.
        await storage.cancelPendingOfferForDelivery(deliveryId);
        const delivery = await storage.getDelivery(deliveryId);
        broadcastToUsers([driverId, user.id], 'delivery_assigned', { deliveryId, status: updated.status, driverId });
        broadcast('delivery_status_changed', { deliveryId, status: updated.status });
        if (delivery) {
          broadcastToUsers([delivery.cafeId, delivery.supplierId], 'delivery_status_changed', {
            deliveryId, status: updated.status, orderId: delivery.orderId, subOrderId: delivery.subOrderId,
          });
          await notify({
            userId: driverId,
            service: "SHOP", type: "delivery_assigned", priority: "WARNING",
            title: "Nouvelle livraison assignée",
            message: `Une livraison vous a été assignée pour la commande #${delivery.order.id} (${delivery.supplier.name}).`,
            entityType: "delivery", entityId: deliveryId,
            prefKey: "shop_delivery",
            dedupeKey: `shop:delivery_assigned:${deliveryId}:${driverId}`,
          });
          await notify({
            userId: delivery.cafeId,
            service: "SHOP", type: "delivery_assigned", priority: "INFO",
            title: "Livreur assigné",
            message: `${delivery.driver?.name ?? "Un livreur"} a été assigné à votre commande #${delivery.order.id}.`,
            entityType: "order", entityId: delivery.order.id,
            prefKey: "shop_delivery",
            dedupeKey: `shop:delivery_assigned_owner:${deliveryId}:${driverId}`,
          });
        }
        res.json(storage.redactDeliveryCodes(updated, user.role));
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(409).json({ message: err.message ?? 'Unable to assign driver' });
      }
    });

    // ── Smart Driver Dispatch System (task: "BigBossCoffee — Smart Driver Dispatch
    // System") — offer lifecycle, dispatch status, and dispatch statistics. ────────────────

    // Driver's own incoming offers ("Nouvelles demandes") — session-only identity, exactly
    // like every other /api/driver/* route; never a driverId the client supplies.
    app.get('/api/driver/offers/pending', requireDriver, async (req: any, res) => {
      try {
        res.json(await storage.getDriverPendingOffers(req.driver.id));
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Unable to load pending offers' });
      }
    });

    // Task: "Update Espace Chauffeur → Business → Planification: Offer Acceptance,
    // Refusal, and Delivery Details" §4 — the driver's own refused-offer history, rendered
    // as "Annulée" in Anciennes. Session-only identity, same as every other /api/driver/*
    // route.
    app.get('/api/driver/offers/refused', requireDriver, async (req: any, res) => {
      try {
        res.json(await storage.getDriverRefusedOffers(req.driver.id));
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Unable to load refused offers' });
      }
    });

    app.patch('/api/driver/offers/:id/accept', requireDriver, async (req: any, res) => {
      try {
        const offerId = parseInt(req.params.id);
        const updated = await storage.acceptDriverOffer(offerId, { id: req.driver.id });
        const delivery = await storage.getDelivery(updated.id);
        broadcast('delivery_status_changed', { deliveryId: updated.id, status: updated.status });
        broadcastToUsers([req.driver.id], 'dispatch_offer_accepted', { offerId, deliveryId: updated.id });
        if (delivery) {
          broadcastToUsers([delivery.cafeId, delivery.supplierId, delivery.deliveryCompanyId].filter((x): x is number => x != null), 'delivery_status_changed', {
            deliveryId: updated.id, status: updated.status, orderId: delivery.orderId, subOrderId: delivery.subOrderId,
          });
          if (delivery.deliveryCompanyId) {
            await notify({
              userId: delivery.deliveryCompanyId,
              service: "SHOP", type: "dispatch_offer_accepted", priority: "SUCCESS",
              title: "Offre acceptée",
              message: `${req.driver.name} a accepté la livraison de la commande #${delivery.order.id}.`,
              entityType: "delivery", entityId: updated.id,
              prefKey: "shop_delivery",
              dedupeKey: `shop:dispatch_offer_accepted:${offerId}`,
            });
          }
        }
        res.json(storage.redactDeliveryCodes(updated, 'DRIVER'));
      } catch (err: any) {
        res.status(409).json({ message: err.message ?? 'Unable to accept offer' });
      }
    });

    app.patch('/api/driver/offers/:id/refuse', requireDriver, async (req: any, res) => {
      try {
        const offerId = parseInt(req.params.id);
        const offer = await storage.refuseDriverOffer(offerId, { id: req.driver.id });
        const delivery = await storage.getDelivery(offer.deliveryId);
        if (delivery?.deliveryCompanyId) {
          broadcastToUsers([delivery.deliveryCompanyId], 'dispatch_offer_refused', { offerId, deliveryId: offer.deliveryId });
        }
        res.json(offer);
        // Continue automatic dispatch immediately (audit §7 "Retry behavior") — after the
        // response is already sent, for the same reason as the /accept route's own call.
        void triggerAutomaticDispatch(offer.deliveryId);
      } catch (err: any) {
        res.status(409).json({ message: err.message ?? 'Unable to refuse offer' });
      }
    });

    // Manual retry after automatic dispatch reported EXHAUSTED (audit §9's "Automatic
    // dispatch action/retry where appropriate") — e.g. the company just enabled another
    // driver's availability. Ownership re-verified the same way every other Delivery
    // Company delivery route already does; dispatchNextOffer itself re-checks the
    // delivery's own status/mode, so this is a safe no-op if nothing has actually changed.
    app.post('/api/deliveries/:id/dispatch/retry', requireApprovedDeliveryCompany, async (req: any, res) => {
      try {
        const deliveryId = parseInt(req.params.id);
        const delivery = await storage.getDelivery(deliveryId);
        if (!delivery || delivery.deliveryCompanyId !== req.deliveryCompany.id) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        await triggerAutomaticDispatch(deliveryId);
        res.json(await storage.getDispatchStatusForDelivery(deliveryId));
      } catch (err: any) {
        res.status(409).json({ message: err.message ?? 'Unable to retry dispatch' });
      }
    });

    // Mes livraisons' dispatch-status pill — any of the three roles that can legitimately see
    // this delivery at all (reuses canUserAccessDelivery's exact existing boundary).
    app.get('/api/deliveries/:id/dispatch-status', requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const deliveryId = parseInt(req.params.id);
        const canAccess = await storage.canUserAccessDelivery(user.id, user.role, deliveryId);
        if (!canAccess) return res.status(403).json({ message: 'Forbidden' });
        res.json(await storage.getDispatchStatusForDelivery(deliveryId));
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Unable to load dispatch status' });
      }
    });

    app.get('/api/delivery-company/dispatch-stats', requireApprovedDeliveryCompany, async (req: any, res) => {
      try {
        res.json(await storage.getCompanyDispatchStats(req.deliveryCompany.id));
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Unable to load dispatch statistics' });
      }
    });

    // Same permission boundary as GET /api/drivers/:driverId/details (self / admin / own
    // operator) — never a second, looser check for the same underlying driver's data.
    app.get('/api/drivers/:driverId/dispatch-stats', requireAuth, async (req: any, res) => {
      try {
        const viewer = await storage.getUser(req.session.userId);
        if (!viewer) return res.status(401).json({ message: 'Unauthorized' });
        const driverId = parseInt(req.params.driverId);
        const target = await storage.getUser(driverId);
        if (!target || target.role !== 'DRIVER') return res.status(404).json({ message: 'Driver not found' });
        const isSelf = viewer.id === driverId;
        const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(viewer.role);
        const isOwnOperator =
          (viewer.role === 'SUPPLIER' && target.supplierId === viewer.id) ||
          (viewer.role === 'DELIVERY_COMPANY' && target.deliveryCompanyId === viewer.id);
        if (!isSelf && !isAdmin && !isOwnOperator) return res.status(403).json({ message: 'Forbidden' });
        res.json(await storage.getDriverDispatchStats(driverId));
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Unable to load driver dispatch statistics' });
      }
    });

    // Change the assigned driver before pickup (Part 32/33) — reuses the delivery status
    // machine as-is; storage.reassignDriver refuses once PICKED_UP or later.
    app.patch('/api/deliveries/:id/reassign', requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        if (!['DELIVERY_COMPANY', 'SUPPLIER'].includes(user.role)) return res.status(403).json({ message: 'Forbidden' });
        const deliveryId = parseInt(req.params.id);
        const { driverId } = z.object({ driverId: z.number() }).parse(req.body);
        const previous = await storage.getDelivery(deliveryId);
        const updated = await storage.reassignDriver(deliveryId, { id: user.id, role: user.role }, driverId);
        const recipients = [driverId, user.id, ...(previous?.driver ? [previous.driver.id] : [])];
        broadcastToUsers(recipients, 'delivery_assigned', { deliveryId, status: updated.status, driverId });
        broadcast('delivery_status_changed', { deliveryId, status: updated.status });
        if (previous) {
          broadcastToUsers([previous.cafeId, previous.supplierId], 'delivery_status_changed', {
            deliveryId, status: updated.status, orderId: previous.orderId, subOrderId: previous.subOrderId,
          });
          const newDriver = await storage.getUser(driverId);
          await notify({
            userId: driverId,
            service: "SHOP", type: "delivery_assigned", priority: "WARNING",
            title: "Nouvelle livraison assignée",
            message: `Une livraison vous a été assignée pour la commande #${previous.order.id} (${previous.supplier.name}).`,
            entityType: "delivery", entityId: deliveryId,
            prefKey: "shop_delivery",
            dedupeKey: `shop:delivery_reassigned:${deliveryId}:${driverId}`,
          });
          if (previous.driver && previous.driver.id !== driverId) {
            await notify({
              userId: previous.driver.id,
              service: "SHOP", type: "delivery_reassigned_away", priority: "INFO",
              title: "Livraison réattribuée",
              message: `La livraison de la commande #${previous.order.id} a été confiée à un autre livreur.`,
              entityType: "delivery", entityId: deliveryId,
              prefKey: "shop_delivery",
              dedupeKey: `shop:delivery_reassigned_away:${deliveryId}:${previous.driver.id}`,
            });
          }
          await notify({
            userId: previous.cafeId,
            service: "SHOP", type: "delivery_assigned", priority: "INFO",
            title: "Livreur mis à jour",
            message: `${newDriver?.name ?? "Un nouveau livreur"} a été assigné à votre commande #${previous.order.id}.`,
            entityType: "order", entityId: previous.order.id,
            prefKey: "shop_delivery",
            dedupeKey: `shop:delivery_reassigned_owner:${deliveryId}:${driverId}`,
          });
        }
        res.json(storage.redactDeliveryCodes(updated, user.role));
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(409).json({ message: err.message ?? 'Unable to reassign driver' });
      }
    });

    // Delivery System V2 Phase 4 — WaitingTimePricingEngine capture. Minimal, additive: does
    // NOT change the delivery's status (still ASSIGNED afterward) — see
    // storage.recordArrivedAtPickup doc. The actual waiting fee is computed later, once, at the
    // PICKED_UP transition above.
    app.patch('/api/deliveries/:id/arrived-at-pickup', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const deliveryId = parseInt(req.params.id);
        const updated = await storage.recordArrivedAtPickup(deliveryId, { id: user.id, role: user.role });
        res.json(storage.redactDeliveryCodes(updated, user.role));
      } catch (err: any) {
        res.status(403).json({ message: err.message ?? 'Unable to record arrival' });
      }
    });

    app.patch('/api/deliveries/:id/status', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const deliveryId = parseInt(req.params.id);
        const { status, code } = z.object({
          status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
          code: z.string().trim().max(32).optional(),
        }).parse(req.body);
        const updated = await storage.updateDeliveryStatus(deliveryId, { id: user.id, role: user.role }, status, code);
        // Smart Driver Dispatch System — a cancelled delivery can never be accepted via a
        // still-PENDING offer afterward (audit §8/§10: "cancellation during dispatch").
        if (status === 'CANCELLED') await storage.cancelPendingOfferForDelivery(deliveryId);
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
          const STATUS_META: Partial<Record<string, { title: string; priority: NotificationPriority; cafeText: string; opsText: string }>> = {
            PICKED_UP: {
              title: "Commande récupérée", priority: "INFO",
              cafeText: `${delivery.driver?.name ?? "Le livreur"} a récupéré votre commande chez ${delivery.supplier.name}.`,
              opsText: `${delivery.driver?.name ?? "Le livreur"} a récupéré la commande #${delivery.order.id} chez ${delivery.supplier.name}.`,
            },
            IN_TRANSIT: {
              title: "Livraison en cours", priority: "INFO",
              cafeText: `Votre commande #${delivery.order.id} est en cours de livraison.`,
              opsText: `La commande #${delivery.order.id} est en cours de livraison.`,
            },
            DELIVERED: {
              title: "Commande livrée", priority: "SUCCESS",
              cafeText: `Votre commande #${delivery.order.id} a été livrée avec succès.`,
              opsText: `La commande #${delivery.order.id} a été livrée avec succès.`,
            },
            CANCELLED: {
              title: "Livraison annulée", priority: "WARNING",
              cafeText: `La livraison de votre commande #${delivery.order.id} a été annulée.`,
              opsText: `La livraison de la commande #${delivery.order.id} a été annulée.`,
            },
          };
          const meta = STATUS_META[status];
          if (meta) {
            await notify({
              userId: delivery.cafeId,
              service: "SHOP", type: `delivery_${status.toLowerCase()}`, priority: meta.priority,
              title: meta.title, message: meta.cafeText,
              entityType: "delivery", entityId: deliveryId,
              prefKey: "shop_delivery",
              dedupeKey: `shop:delivery_status:${deliveryId}:${status}:cafe`,
            });
            const opsRecipients = [delivery.supplierId, delivery.deliveryCompanyId].filter((x): x is number => x != null);
            await notifyMany({
              userIds: opsRecipients,
              service: "SHOP", type: `delivery_${status.toLowerCase()}`, priority: "INFO",
              title: meta.title, message: meta.opsText,
              entityType: "delivery", entityId: deliveryId,
              prefKey: "shop_delivery",
              dedupeKeyPrefix: `shop:delivery_status:${deliveryId}:${status}:ops`,
            });
          }
        }
        res.json(storage.redactDeliveryCodes(updated, user.role));
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        const message = err?.message ?? 'Unable to update delivery status';
        res.status(message === 'Invalid confirmation code' ? 400 : 409).json({ message });
      }
    });

    const driverRosterSchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      phone: z.string().optional().nullable(),
      isWhatsapp: z.boolean().optional(),
      profileImageUrl: z.string().optional().nullable(),
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
        // So the Supplier-facing details modal's Chauffeurs section (never a duplicate driver
        // list — see getDeliveryCompanyDriverCards) reflects a new driver without a refresh.
        broadcast('delivery_company_profile_updated', { userId: req.deliveryCompany.id });
        res.status(201).json(driver);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Error creating driver' });
      }
    });

    // ── Vehicles — Delivery Company / Supplier fleet, and Driver self-service. One model,
    // reused by every owner kind (see shared/schema.ts vehicles). ──────────────────────────

    const vehicleInputSchema = z.object({
      type: z.enum(['BICYCLE', 'MOTO', 'CAR', 'VAN', 'TRUCK', 'OTHER']).optional(),
      brand: z.string().max(80).optional(),
      model: z.string().max(80).optional(),
      plateNumber: z.string().max(40).optional(),
      hasAirConditioning: z.boolean().optional(),
      isActive: z.boolean().optional(),
    });

    function vehicleOwnerRoutes(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', requireOwner: any) {
      app.get(`/api/${ownerType === 'DELIVERY_COMPANY' ? 'delivery-company' : 'supplier'}/vehicles`, requireOwner, async (req: any, res) => {
        try {
          const ownerId = ownerType === 'DELIVERY_COMPANY' ? req.deliveryCompany.id : req.session.userId;
          res.json(await storage.getVehiclesForOwner(ownerType, ownerId));
        } catch (err: any) { res.status(500).json({ message: err.message ?? 'Error fetching vehicles' }); }
      });

      app.post(`/api/${ownerType === 'DELIVERY_COMPANY' ? 'delivery-company' : 'supplier'}/vehicles`, requireOwner, async (req: any, res) => {
        try {
          const ownerId = ownerType === 'DELIVERY_COMPANY' ? req.deliveryCompany.id : req.session.userId;
          const data = vehicleInputSchema.parse(req.body);
          const vehicle = await storage.createVehicle(ownerType, ownerId, data as any);
          broadcast('vehicle_updated', { ownerType, ownerId, vehicleId: vehicle.id, kind: 'created' });
          res.status(201).json(vehicle);
        } catch (err: any) {
          if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
          res.status(400).json({ message: err.message ?? 'Error creating vehicle' });
        }
      });

      app.patch(`/api/${ownerType === 'DELIVERY_COMPANY' ? 'delivery-company' : 'supplier'}/vehicles/:id`, requireOwner, async (req: any, res) => {
        try {
          const ownerId = ownerType === 'DELIVERY_COMPANY' ? req.deliveryCompany.id : req.session.userId;
          const data = vehicleInputSchema.parse(req.body);
          const vehicle = await storage.updateVehicle(Number(req.params.id), ownerType, ownerId, data as any);
          if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
          broadcast('vehicle_updated', { ownerType, ownerId, vehicleId: vehicle.id, kind: 'updated' });
          res.json(vehicle);
        } catch (err: any) {
          if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
          res.status(400).json({ message: err.message ?? 'Error updating vehicle' });
        }
      });

      app.delete(`/api/${ownerType === 'DELIVERY_COMPANY' ? 'delivery-company' : 'supplier'}/vehicles/:id`, requireOwner, async (req: any, res) => {
        try {
          const ownerId = ownerType === 'DELIVERY_COMPANY' ? req.deliveryCompany.id : req.session.userId;
          await storage.deleteVehicle(Number(req.params.id), ownerType, ownerId);
          broadcast('vehicle_updated', { ownerType, ownerId, vehicleId: Number(req.params.id), kind: 'deleted' });
          res.json({ ok: true });
        } catch (err: any) { res.status(500).json({ message: err.message ?? 'Error deleting vehicle' }); }
      });

      app.patch(`/api/${ownerType === 'DELIVERY_COMPANY' ? 'delivery-company' : 'supplier'}/vehicles/:id/assign`, requireOwner, async (req: any, res) => {
        try {
          const ownerId = ownerType === 'DELIVERY_COMPANY' ? req.deliveryCompany.id : req.session.userId;
          const { driverId } = z.object({ driverId: z.number().int().positive().nullable() }).parse(req.body);
          const vehicle = await storage.assignVehicleToDriver(Number(req.params.id), ownerType, ownerId, driverId);
          broadcastToUsers(driverId ? [driverId] : [], 'vehicle_updated', { ownerType, ownerId, vehicleId: vehicle.id, kind: 'assigned' });
          broadcast('vehicle_updated', { ownerType, ownerId, vehicleId: vehicle.id, kind: 'assigned' });
          res.json(vehicle);
        } catch (err: any) {
          res.status(400).json({ message: err.message ?? 'Error assigning vehicle' });
        }
      });
    }

    vehicleOwnerRoutes('DELIVERY_COMPANY', requireApprovedDeliveryCompany);

    vehicleOwnerRoutes('SUPPLIER', requireApprovedSupplier);

    // Driver self-service: read their own assigned vehicle, or self-register one under their
    // own operator if none is assigned yet (Espace Chauffeur → Paramètres — see task Part 11).
    // Vehicle ownership/provider identification (task: "Driver Profile — Vehicle Owner
    // Identification"). A driver's vehicle is ALWAYS created under the driver's own operator
    // account (see POST /api/driver/vehicle below — ownerType is derived from
    // user.deliveryCompanyId/supplierId, never a free choice), so "who provides this vehicle" is
    // always correctly either the Supplier or the Delivery Company the driver belongs to —
    // there is no existing data path for a driver-owned vehicle, so none is fabricated here.
    async function withVehicleOwnerName(vehicle: any) {
      if (!vehicle) return vehicle;
      const owner = await storage.getUser(vehicle.ownerId);
      return { ...vehicle, ownerName: owner?.name ?? null };
    }

    app.get('/api/driver/vehicle', requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'DRIVER') return res.status(403).json({ message: 'Driver access required' });
      try { res.json(await withVehicleOwnerName(await storage.getVehicleForDriver(user.id))); }
      catch { res.status(500).json({ message: 'Failed to load vehicle' }); }
    });

    app.post('/api/driver/vehicle', requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'DRIVER') return res.status(403).json({ message: 'Driver access required' });
      if (!user.deliveryCompanyId && !user.supplierId) return res.status(400).json({ message: 'Driver has no operator account to register a vehicle under' });
      try {
        const existing = await storage.getVehicleForDriver(user.id);
        if (existing) return res.status(400).json({ message: 'You already have a vehicle — edit it instead of creating a new one' });
        const data = vehicleInputSchema.parse(req.body);
        const ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER' = user.deliveryCompanyId ? 'DELIVERY_COMPANY' : 'SUPPLIER';
        const ownerId = user.deliveryCompanyId ?? user.supplierId!;
        const vehicle = await storage.createVehicle(ownerType, ownerId, data as any);
        const assigned = await storage.assignVehicleToDriver(vehicle.id, ownerType, ownerId, user.id);
        broadcast('vehicle_updated', { ownerType, ownerId, vehicleId: vehicle.id, kind: 'created' });
        res.status(201).json(await withVehicleOwnerName(assigned));
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Error registering vehicle' });
      }
    });

    app.patch('/api/driver/vehicle', requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'DRIVER') return res.status(403).json({ message: 'Driver access required' });
      try {
        const existing = await storage.getVehicleForDriver(user.id);
        if (!existing) return res.status(404).json({ message: 'No vehicle to update' });
        const data = vehicleInputSchema.parse(req.body);
        const vehicle = await storage.updateVehicle(existing.id, existing.ownerType, existing.ownerId, data as any);
        broadcast('vehicle_updated', { ownerType: existing.ownerType, ownerId: existing.ownerId, vehicleId: existing.id, kind: 'updated' });
        res.json(await withVehicleOwnerName(vehicle));
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Error updating vehicle' });
      }
    });

    // ── DRIVER profile + shared Chauffeur details ────────────────────────────────
    // Espace Chauffeur → Business → Profil (self-editable: bio/experience/
    // certifications/availability — vehicle stays on the existing /api/driver/
    // vehicle self-service routes above, never duplicated). The one shared GET
    // below powers the SAME DriverDetailModal wherever a driver is displayed
    // (Supplier → Drivers, Espace Livraison → Chauffeurs, Admin → Chauffeurs,
    // and the Driver's own Eye preview) — permission-checked per viewer instead
    // of a public route, since unlike Barista/Maintenance/Delivery Company a
    // Driver is never independently browsed by the public.

    app.patch('/api/driver/profile', requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'DRIVER') return res.status(403).json({ message: 'Driver access required' });
      try {
        const body = z.object({
          bio: z.string().optional(),
          experienceYears: z.number().int().min(0).optional(),
          certifications: z.array(z.string()).optional(),
          isOnVacation: z.boolean().optional(),
          // Smart Driver Dispatch System — dispatch preference only, never a replacement
          // for isOnVacation above (see driverProfiles' own schema comment).
          acceptingNewOffers: z.boolean().optional(),
          portfolioImages: z.array(z.string()).max(4, "4 photos maximum").optional(),
          weeklyHours: z.object({
            monday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
            tuesday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
            wednesday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
            thursday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
            friday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
            saturday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
            sunday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
          }).optional(),
        }).parse(req.body);
        const profile = await storage.upsertDriverProfile(user.id, body);
        broadcast('driver_profile_updated', { userId: user.id });
        if (body.acceptingNewOffers !== undefined) {
          broadcastToUsers([user.id], 'driver_availability_changed', { driverId: user.id, acceptingNewOffers: profile.acceptingNewOffers });
        }
        res.json(profile);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Error updating profile' });
      }
    });

    // GO Live (Phase 5) — see /api/maintenance/profile/go-live for the full rationale
    // comment. Driver has no public marketplace listing today (no Coffee Owner ever
    // browses drivers directly — see driverProfiles' own schema comment), so approval
    // here has no visible marketplace effect yet; it still exists so all 7 account
    // types consistently support the same submit → admin-review workflow.
    app.post('/api/driver/profile/go-live', requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'DRIVER') return res.status(403).json({ message: 'Driver access required' });
      const profile = await storage.getDriverProfile(user.id);
      if (profile.publicationStatus === 'PENDING') return res.status(400).json({ message: 'Une demande est déjà en attente d\'approbation.' });
      if (!profile.bio?.trim()) return res.status(400).json({ message: 'Complétez votre biographie avant de soumettre votre profil.' });
      const updated = await storage.upsertDriverProfile(user.id, {
        publicationStatus: 'PENDING', publicationSubmittedAt: new Date(), publicationRejectionReason: null,
      });
      broadcast('driver_profile_updated', { userId: user.id, kind: 'publication' });
      res.json(updated);
    });

    app.patch('/api/admin/driver/accounts/:userId/publication', requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== 'DRIVER') return res.status(404).json({ message: 'Driver account not found' });
        const { decision, rejectionReason } = z.object({
          decision: z.enum(['APPROVED', 'REJECTED']),
          rejectionReason: z.string().trim().max(1000).optional(),
        }).parse(req.body);
        const profile = await storage.upsertDriverProfile(userId, {
          publicationStatus: decision, publicationReviewedAt: new Date(),
          publicationRejectionReason: decision === 'REJECTED' ? (rejectionReason?.trim() || 'Non précisé') : null,
        } as any);
        broadcast('driver_profile_updated', { userId, kind: 'publication' });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: 'Invalid request' });
      }
    });

    app.get('/api/drivers/:driverId/details', requireAuth, async (req: any, res) => {
      const viewer = await storage.getUser(req.session.userId);
      if (!viewer) return res.status(401).json({ message: 'Unauthorized' });
      const driverId = Number(req.params.driverId);
      const target = await storage.getUser(driverId);
      if (!target || target.role !== 'DRIVER') return res.status(404).json({ message: 'Driver not found' });
      const isSelf = viewer.id === driverId;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(viewer.role);
      const isOwnOperator =
        (viewer.role === 'SUPPLIER' && target.supplierId === viewer.id) ||
        (viewer.role === 'DELIVERY_COMPANY' && target.deliveryCompanyId === viewer.id);
      if (!isSelf && !isAdmin && !isOwnOperator) return res.status(403).json({ message: 'Forbidden' });
      const [profile, vehicle] = await Promise.all([
        storage.getDriverProfile(driverId),
        storage.getVehicleForDriver(driverId),
      ]);
      // Real driver/company relationship (Part 17) — resolved from the actual
      // users.deliveryCompanyId/supplierId column, never invented.
      let operator: { type: 'DELIVERY_COMPANY' | 'SUPPLIER'; name: string } | null = null;
      if (target.deliveryCompanyId) {
        const company = await storage.getUser(target.deliveryCompanyId);
        if (company) operator = { type: 'DELIVERY_COMPANY', name: company.name };
      } else if (target.supplierId) {
        const supplier = await storage.getUser(target.supplierId);
        if (supplier) operator = { type: 'SUPPLIER', name: supplier.name };
      }
      // flashImageUrl (Settings → Compte's "Flash (URL)", stored on the users row)
      // — surfaced here so DriverDetailModal's Flash icon reads one reliable
      // source regardless of which caller's `driver` User object it was handed
      // (some callers' user lists may be trimmed/stale).
      res.json({ profile, vehicle: vehicle ?? null, operator, flashImageUrl: target.flashImageUrl ?? null });
    });

    // ── DELIVERY COMPANY marketplace/profile ─────────────────────────────────────
    // Mirrors the Maintenance marketplace routes structurally (public browsing
    // endpoint, self-management endpoint ownership-enforced server-side, reviews
    // on the shared supplierProductReviews table) — see shared/schema.ts
    // deliveryCompanyProfiles and server/storage.ts's DELIVERY COMPANY section.
    // The reviewer/reporter here is a Supplier (not a Cafe Owner) since Suppliers
    // are the ones who actually deal with Delivery Companies via Order Delivery.

    app.get('/api/delivery-company/profiles', async (req: any, res) => {
      try {
        let viewerLocation: { lat: string | null; lng: string | null } | null = null;
        if (req.session?.userId) {
          const viewer = await storage.getUser(req.session.userId);
          if (viewer) viewerLocation = { lat: viewer.locationLat, lng: viewer.locationLng };
        }
        res.json(await storage.getDeliveryCompanyProfiles({
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          available: req.query.available === undefined ? undefined : req.query.available === 'true',
          location: typeof req.query.location === 'string' ? req.query.location : undefined,
          viewerLocation,
        }));
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Error fetching delivery companies' });
      }
    });

    app.get('/api/delivery-company/profile/:userId', requireAuth, async (req: any, res) => {
      const targetUserId = Number(req.params.userId);
      const viewer = await storage.getUser(req.session.userId);
      const isSelfOrAdmin = viewer && (viewer.id === targetUserId || ['ADMIN', 'SUPER_ADMIN'].includes(viewer.role));
      const isSupplier = viewer?.role === 'SUPPLIER';
      if (!viewer || (!isSelfOrAdmin && !isSupplier)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const target = await storage.getUser(targetUserId);
      if (!target || target.role !== 'DELIVERY_COMPANY') return res.status(404).json({ message: 'Not found' });
      const [card, drivers, vehicleList] = await Promise.all([
        storage.getDeliveryCompanyCard(targetUserId, { lat: viewer.locationLat, lng: viewer.locationLng }),
        storage.getDeliveryCompanyDrivers(targetUserId),
        storage.getDeliveryCompanyVehicles(targetUserId),
      ]);
      // A Supplier only ever sees the sanitized public `card`/drivers/vehicles — never the raw
      // user row (password hash, email, etc.), same convention as every other service. Drivers/
      // vehicles are the exact same rosters Business → Chauffeurs/Véhicules use, never a copy.
      if (!isSelfOrAdmin) return res.json({ card, drivers, vehicles: vehicleList });
      res.json({ user: target, profile: await storage.getDeliveryCompanyProfile(targetUserId), card, drivers, vehicles: vehicleList });
    });

    app.patch('/api/delivery-company/profile', requireApprovedDeliveryCompany, async (req: any, res) => {
      const body = z.object({
        companyType: z.string().optional(),
        description: z.string().optional(),
        deliveryZones: z.string().optional(),
        dailyRateInCents: z.number().int().min(0).optional(),
        responseTime: z.string().optional(),
        experienceYears: z.number().int().min(0).optional(),
        certifications: z.array(z.string()).optional(),
        portfolioImages: z.array(z.string()).max(4, "4 photos maximum").optional(),
        marketplaceVisible: z.boolean().optional(),
        isOnVacation: z.boolean().optional(),
        weeklyHours: z.object({
          monday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
          tuesday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
          wednesday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
          thursday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
          friday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
          saturday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
          sunday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
        }).optional(),
      }).parse(req.body);
      const profile = await storage.upsertDeliveryCompanyProfile(req.deliveryCompany.id, body);
      broadcast('delivery_company_profile_updated', { userId: req.deliveryCompany.id });
      res.json(profile);
    });

    // GO Live (Phase 5) — see /api/maintenance/profile/go-live for the full rationale comment.
    app.post('/api/delivery-company/profile/go-live', requireApprovedDeliveryCompany, async (req: any, res) => {
      const profile = await storage.getDeliveryCompanyProfile(req.deliveryCompany.id);
      if (profile.publicationStatus === 'PENDING') return res.status(400).json({ message: 'Une demande est déjà en attente d\'approbation.' });
      if (!profile.description?.trim()) return res.status(400).json({ message: 'Complétez votre description avant de soumettre votre profil.' });
      const updated = await storage.upsertDeliveryCompanyProfile(req.deliveryCompany.id, {
        publicationStatus: 'PENDING', publicationSubmittedAt: new Date(), publicationRejectionReason: null,
      });
      broadcast('delivery_company_profile_updated', { userId: req.deliveryCompany.id, kind: 'publication' });
      res.json(updated);
    });

    app.patch('/api/admin/delivery-company/accounts/:userId/publication', requireAdmin, async (req, res) => {
      try {
        const userId = Number(req.params.userId);
        const target = await storage.getUser(userId);
        if (!target || target.role !== 'DELIVERY_COMPANY') return res.status(404).json({ message: 'Delivery Company account not found' });
        const { decision, rejectionReason } = z.object({
          decision: z.enum(['APPROVED', 'REJECTED']),
          rejectionReason: z.string().trim().max(1000).optional(),
        }).parse(req.body);
        const profile = await storage.upsertDeliveryCompanyProfile(userId, {
          publicationStatus: decision, publicationReviewedAt: new Date(),
          publicationRejectionReason: decision === 'REJECTED' ? (rejectionReason?.trim() || 'Non précisé') : null,
        });
        broadcast('delivery_company_profile_updated', { userId, kind: 'publication' });
        res.json(profile);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: 'Invalid request' });
      }
    });

    app.get('/api/delivery-company/reviews/:userId', async (req, res) => {
      try { res.json(await storage.getDeliveryCompanyReviews(Number(req.params.userId))); }
      catch { res.status(500).json({ message: 'Failed to load Delivery Company reviews' }); }
    });

    // Driver Reviews & Performance Dashboard (task: "Delivery Company — Driver Reviews &
    // Performance Dashboard") — authenticated, company-scoped. Unlike the public route just
    // above (which powers the marketplace rating card and is untouched), this one never
    // accepts a company id from the client at all: requireApprovedDeliveryCompany resolves
    // it purely from the session (req.deliveryCompany.id).
    app.get('/api/delivery-company/driver-reviews', requireApprovedDeliveryCompany, async (req: any, res) => {
      try { res.json(await storage.getDeliveryCompanyDriverReviews(req.deliveryCompany.id)); }
      catch { res.status(500).json({ message: 'Failed to load driver reviews' }); }
    });

    // Fix Delivery Company Avis — Include Coffee Owner Reviews of Its Drivers — a
    // deliberately separate endpoint from the one above: reviewType='DRIVER', reviewer=Cafe
    // Owner, scoped via deliveries.deliveryCompanyId (never users.deliveryCompanyId). Same
    // session-only identity rule as every other Delivery Company route.
    app.get('/api/delivery-company/driver-performance-reviews', requireApprovedDeliveryCompany, async (req: any, res) => {
      try { res.json(await storage.getDriverReviewsForDeliveryCompany(req.deliveryCompany.id)); }
      catch { res.status(500).json({ message: 'Failed to load driver performance reviews' }); }
    });

    app.post('/api/delivery-company/reviews', requireApprovedSupplier, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      try {
        const body = z.object({
          deliveryCompanyUserId: z.number().int().positive(),
          deliveryId: z.number().int().positive(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().max(2000).optional(),
        }).parse(req.body);
        const delivery = await storage.getDelivery(body.deliveryId, 'ADMIN');
        if (!delivery || delivery.supplierId !== user.id || delivery.deliveryCompanyId !== body.deliveryCompanyUserId || delivery.status !== 'DELIVERED') {
          return res.status(400).json({ message: 'Reviews are only available after a completed delivery' });
        }
        const result = await storage.upsertDeliveryCompanyReview({ ...body, supplierId: user.id, supplierName: user.name });
        broadcast('delivery_company_review_updated', { deliveryCompanyUserId: body.deliveryCompanyUserId, deliveryId: body.deliveryId });
        if (!result.isUpdate) {
          await notify({
            userId: body.deliveryCompanyUserId,
            service: 'SHOP', type: 'delivery_company_review_created', priority: 'INFO',
            title: 'Nouvel avis reçu',
            message: `${user.name} vous a laissé un avis (${body.rating}/5).`,
            entityType: 'delivery', entityId: body.deliveryId,
            prefKey: 'reviews',
          });
        }
        res.status(result.isUpdate ? 200 : 201).json(result.review);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Invalid review data' });
      }
    });

    app.post('/api/delivery-company/:userId/report', requireApprovedSupplier, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const deliveryCompanyUserId = Number(req.params.userId);
      const target = await storage.getUser(deliveryCompanyUserId);
      if (!target || target.role !== 'DELIVERY_COMPANY') return res.status(404).json({ message: 'Delivery company not found' });
      try {
        const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(req.body);
        const report = await storage.createDeliveryCompanyReport(user.id, deliveryCompanyUserId, reason);
        broadcast('admin_delivery_company_report_created', { deliveryCompanyUserId });
        const adminIds = await storage.getAdminUserIds();
        await notifyMany({
          userIds: adminIds,
          service: 'ADMIN', type: 'delivery_company_report_created', priority: 'URGENT',
          title: 'Entreprise de livraison signalée',
          message: `${user.name} a signalé ${target.name} (Livraison) : "${reason}".`,
          entityType: 'delivery_company_report', entityId: report.id,
          prefKey: 'reports',
          dedupeKeyPrefix: `admin:delivery_company_report_created:${report.id}`,
        });
        res.status(201).json(report);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: 'Invalid report data' });
      }
    });

    app.get('/api/delivery-company/reports/mine', requireApprovedSupplier, async (req: any, res) => {
      res.json(await storage.getDeliveryCompanyReportsBySupplier(req.session.userId!));
    });

    app.get('/api/admin/delivery-company/reports', requireAdmin, async (req, res) => {
      const status = typeof req.query.status === 'string' ? (req.query.status as 'PENDING' | 'RESOLVED' | 'DISMISSED') : undefined;
      res.json(await storage.getDeliveryCompanyReports(status));
    });

    app.patch('/api/admin/delivery-company/reports/:id/resolve', requireAdmin, async (req, res) => {
      try {
        const { status, resolutionNote } = z.object({
          status: z.enum(['RESOLVED', 'DISMISSED']),
          resolutionNote: z.string().max(1000).optional(),
        }).parse(req.body);
        const updated = await storage.resolveDeliveryCompanyReport(Number(req.params.id), status, resolutionNote);
        if (!updated) return res.status(404).json({ message: 'Report not found' });
        res.json(updated);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: 'Failed to resolve report' });
      }
    });

    // ── Admin — Delivery Pricing configuration (System Management) ──────────────────────

    app.get('/api/admin/delivery-pricing', requireAdmin, async (_req, res) => {
      try { res.json(await storage.getDeliveryPricingSettings()); }
      catch { res.status(500).json({ message: 'Failed to load delivery pricing settings' }); }
    });

    app.patch('/api/admin/delivery-pricing', requireAdmin, async (req, res) => {
      try {
        const body = z.object({
          vehiclePricing: z.record(z.string(), z.object({
            pricePerKmCents: z.number().int().min(0), minFeeCents: z.number().int().min(0),
            // Delivery System V2 Phase 2 — optional per-vehicle capacity. Omitted/undefined =
            // no capacity constraint enforced (see storage.checkDeliveryVehicleCompatibility).
            maxWeightKg: z.number().min(0).optional(),
            maxVolumeL: z.number().min(0).optional(),
            maxPackages: z.number().int().min(0).optional(),
          })).optional(),
          defaultVehicleType: z.enum(['BICYCLE', 'MOTO', 'CAR', 'VAN', 'TRUCK', 'OTHER']).optional(),
          surgeMultiplierPermille: z.number().int().min(0).max(10000).optional(),
          surgeLabel: z.string().max(200).optional(),
          cafeOwnerSharePercent: z.number().int().min(0).max(100).optional(),
          // Delivery System V2 Phase 3 — DriverPayoutEngine config. Default 100 (see schema doc).
          driverPayoutSharePercent: z.number().int().min(0).max(100).optional(),
          // Delivery System V2 Phase 4 — WeatherPricingEngine + DeliverySafetyEngine.
          activeWeatherCondition: z.enum(['NORMAL', 'RAIN', 'HEAVY_RAIN', 'STORM', 'EXTREME']).optional(),
          weatherConditionConfigs: z.record(z.string(), z.object({
            customerMultiplierPermille: z.number().int().min(0).optional(),
            driverIncentiveCents: z.number().int().min(0).optional(),
            safetyState: z.enum(['ALLOW', 'ALLOW_WITH_WARNING', 'RESTRICT', 'SUSPEND']).optional(),
            restrictedVehicleTypes: z.array(z.enum(['BICYCLE', 'MOTO', 'CAR', 'VAN', 'TRUCK', 'OTHER'])).optional(),
          })).optional(),
          // PeakHourEngine — no hard-coded windows; Admin defines them.
          peakHourWindows: z.array(z.object({
            id: z.string(), label: z.string().max(100), daysOfWeek: z.array(z.number().int().min(0).max(6)),
            startTime: z.string().max(5), endTime: z.string().max(5),
            customerMultiplierPermille: z.number().int().min(0), driverIncentiveCents: z.number().int().min(0), isActive: z.boolean(),
          })).optional(),
          // ZonePricingEngine — governorate-match v1, matches destination.
          zones: z.array(z.object({
            id: z.string(), name: z.string().max(100), governorateMatch: z.string().max(100),
            multiplierPermille: z.number().int().min(0).optional(), minFeeOverrideCents: z.number().int().min(0).optional(), isActive: z.boolean(),
          })).optional(),
          // WaitingTimePricingEngine — defaults to fully neutral (0 DT/min both sides).
          waitingFreeMinutes: z.number().int().min(0).optional(),
          waitingPricePerMinuteCents: z.number().int().min(0).optional(),
          waitingDriverCompensationPerMinuteCents: z.number().int().min(0).optional(),
          waitingMaxChargeCents: z.number().int().min(0).nullable().optional(),
          // Multiplier Safety (rule 8) — the hard ceiling on the combined weather×peak×zone
          // multiplier. Minimum 1000 (×1.0) enforced in storage.updateDeliveryPricingSettings.
          maxCombinedMultiplierPermille: z.number().int().min(1000).optional(),
        }).parse(req.body);
        const settings = await storage.updateDeliveryPricingSettings(body as any);
        broadcast('delivery_pricing_updated', {});
        res.json(settings);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: 'Failed to update delivery pricing settings' });
      }
    });

    // ── Delivery System V2 Phase 5A — Financial Ledger (Admin-only auditability, not a
    // dashboard — see docs/bigboss-delivery-financial-ledger.md). Every entry is a CALCULATED
    // economic fact, never evidence that money physically moved — see the doc's "economic event
    // vs obligation" section before reading amounts here as anything more than that.
    app.get('/api/admin/delivery-financial-ledger', requireAdmin, async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const result = await storage.getFinancialLedgerEntries({
          deliveryId: q.deliveryId ? parseInt(q.deliveryId) : undefined,
          orderId: q.orderId ? parseInt(q.orderId) : undefined,
          subOrderId: q.subOrderId ? parseInt(q.subOrderId) : undefined,
          entryType: q.entryType || undefined,
          actorRole: q.actorRole || undefined,
          // Delivery System V2 Phase 5B — filter by any actor (Supplier/Driver/Company) the
          // entry concerns, as either actor or counterparty (rule 14 filters: Supplier/Driver/
          // Delivery Company). Admin-only route, so a raw user id is safe to accept directly.
          actorUserId: q.actorUserId ? parseInt(q.actorUserId) : undefined,
          status: q.status || undefined,
          fromDate: q.fromDate ? new Date(q.fromDate) : undefined,
          toDate: q.toDate ? new Date(q.toDate) : undefined,
          page: q.page ? parseInt(q.page) : undefined,
          limit: q.limit ? parseInt(q.limit) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Failed to load financial ledger' });
      }
    });

    // Delivery System V2 Phase 5B — self-service financial views (rule 19). Every one of these
    // derives its scope EXCLUSIVELY from the authenticated session — never from a client-
    // supplied actor id (rule 20 TEST7/26: "changing IDs in API requests cannot bypass
    // authorization").
    app.get('/api/deliveries/:id/financial-summary', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const summary = await storage.getDeliveryFinancialSummary(parseInt(req.params.id), { id: user.id, role: user.role });
        res.json(summary);
      } catch (err: any) {
        res.status(err.message === 'Forbidden' ? 403 : err.message === 'Delivery not found' ? 404 : 400).json({ message: err.message ?? 'Unable to load financial summary' });
      }
    });

    // ── Delivery System V2 Phase 5C.1 — Settlement Foundation ───────────────────────────
    // FINANCIAL LEDGER → SETTLEMENT only. No payment endpoint exists here or anywhere in this
    // phase — see docs/bigboss-delivery-settlement-architecture.md §4/§29. Settlements are
    // NEVER created via an API call — they are calculated automatically, server-side, the
    // moment a delivery reaches DELIVERED (see storage.updateDeliveryStatus). Every read below
    // derives its scope EXCLUSIVELY from the authenticated session, exactly like the Phase 5B
    // financial-visibility endpoints above — no endpoint accepts a client-supplied actor id.

    app.get('/api/deliveries/:id/settlements', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const result = await storage.getDeliverySettlements(parseInt(req.params.id), { id: user.id, role: user.role });
        res.json(result);
      } catch (err: any) {
        res.status(err.message === 'Forbidden' ? 403 : 400).json({ message: err.message ?? 'Unable to load settlements' });
      }
    });

    // Admin-only — inspection, not a payment dashboard (rule 26 of the Phase 5C.1 task).
    app.get('/api/admin/settlements', requireAdmin, async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const result = await storage.getAllSettlements({
          deliveryId: q.deliveryId ? parseInt(q.deliveryId) : undefined,
          orderId: q.orderId ? parseInt(q.orderId) : undefined,
          actorRole: q.actorRole || undefined,
          actorUserId: q.actorUserId ? parseInt(q.actorUserId) : undefined,
          status: q.status || undefined,
          page: q.page ? parseInt(q.page) : undefined,
          limit: q.limit ? parseInt(q.limit) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Failed to load settlements' });
      }
    });

    app.get('/api/admin/settlements/:id/items', requireAdmin, async (req, res) => {
      try {
        res.json(await storage.getSettlementItems(parseInt(req.params.id)));
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Failed to load settlement items' });
      }
    });

    app.post('/api/admin/settlements/:id/approve', requireAdmin, async (req: any, res) => {
      try {
        const settlement = await storage.approveSettlement(parseInt(req.params.id), req.session.userId!);
        res.json(settlement);
      } catch (err: any) {
        res.status(err.message?.includes('not found') ? 404 : 400).json({ message: err.message ?? 'Unable to approve settlement' });
      }
    });

    app.post('/api/admin/settlements/:id/void', requireAdmin, async (req, res) => {
      try {
        const settlement = await storage.voidSettlement(parseInt(req.params.id));
        res.json(settlement);
      } catch (err: any) {
        res.status(err.message?.includes('not found') ? 404 : 400).json({ message: err.message ?? 'Unable to void settlement' });
      }
    });

    // ── Delivery System V2 Phase 5C.2 — Payment Layer, COD, Refunds, Adjustments ─────────
    // SETTLEMENT → PAYMENT step + COD/REFUND/ADJUSTMENT satellites. No external payment
    // provider anywhere — internal record-keeping only. Every mutation below except the two
    // COD driver/supplier-company actions is Admin-only (rule: "Do NOT expand financial write
    // authority to suppliers, drivers or coffee owners").

    app.get('/api/admin/payments', requireAdmin, async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const result = await storage.getAllPayments({
          settlementId: q.settlementId ? parseInt(q.settlementId) : undefined,
          status: q.status || undefined, method: q.method || undefined,
          page: q.page ? parseInt(q.page) : undefined, limit: q.limit ? parseInt(q.limit) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Failed to load payments' });
      }
    });

    app.get('/api/admin/settlements/:id/payments', requireAdmin, async (req, res) => {
      try {
        res.json(await storage.getPaymentsForSettlement(parseInt(req.params.id)));
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Failed to load payments' });
      }
    });

    app.post('/api/admin/settlements/:id/payments', requireAdmin, async (req: any, res) => {
      try {
        const body = z.object({
          amountCents: z.number().int().positive(),
          method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'WALLET', 'OTHER']),
          provider: z.string().optional().nullable(),
          providerReference: z.string().optional().nullable(),
          idempotencyKey: z.string().min(1),
        }).parse(req.body);
        const payment = await storage.createPayment(parseInt(req.params.id), body, req.session.userId!);
        res.json(payment);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(err.message?.includes('not found') ? 404 : 400).json({ message: err.message ?? 'Unable to record payment' });
      }
    });

    app.post('/api/admin/payments/:id/confirm', requireAdmin, async (req: any, res) => {
      try {
        res.json(await storage.confirmPayment(parseInt(req.params.id), req.session.userId!));
      } catch (err: any) {
        res.status(err.message?.includes('not found') ? 404 : 400).json({ message: err.message ?? 'Unable to confirm payment' });
      }
    });

    app.post('/api/admin/payments/:id/fail', requireAdmin, async (req: any, res) => {
      try {
        res.json(await storage.failPayment(parseInt(req.params.id), req.session.userId!));
      } catch (err: any) {
        res.status(err.message?.includes('not found') ? 404 : 400).json({ message: err.message ?? 'Unable to fail payment' });
      }
    });

    app.post('/api/admin/payments/:id/reverse', requireAdmin, async (req: any, res) => {
      try {
        res.json(await storage.reversePayment(parseInt(req.params.id), req.session.userId!));
      } catch (err: any) {
        res.status(err.message?.includes('not found') ? 404 : 400).json({ message: err.message ?? 'Unable to reverse payment' });
      }
    });

    // ── COD Reconciliation ──────────────────────────────────────────────────────────────
    // Driver records own collection; Supplier/Delivery Company records own remittance —
    // authorization is enforced entirely server-side inside storage.recordCashCollected/
    // recordCashRemitted (reusing canUserAccessDelivery — never a duplicated rule), never from
    // a client-supplied role/id.

    app.get('/api/deliveries/:id/cod', requireAuth, async (req, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const cod = await storage.getCodReconciliation(parseInt(req.params.id), { id: user.id, role: user.role });
        if (!cod) return res.status(404).json({ message: 'No COD reconciliation for this delivery' });
        res.json(cod);
      } catch (err: any) {
        res.status(err.message === 'Forbidden' ? 403 : 400).json({ message: err.message ?? 'Unable to load COD reconciliation' });
      }
    });

    app.post('/api/deliveries/:id/cod/collect', requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const body = z.object({ collectedAmountCents: z.number().int().nonnegative() }).parse(req.body);
        const cod = await storage.recordCashCollected(parseInt(req.params.id), { id: user.id, role: user.role }, body.collectedAmountCents);
        res.json(cod);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(err.message === 'Forbidden' ? 403 : 400).json({ message: err.message ?? 'Unable to record cash collection' });
      }
    });

    app.post('/api/deliveries/:id/cod/remit', requireAuth, async (req: any, res) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const body = z.object({ remittedAmountCents: z.number().int().nonnegative() }).parse(req.body);
        const cod = await storage.recordCashRemitted(parseInt(req.params.id), { id: user.id, role: user.role }, body.remittedAmountCents);
        res.json(cod);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(err.message === 'Forbidden' ? 403 : 400).json({ message: err.message ?? 'Unable to record cash remittance' });
      }
    });

    app.post('/api/admin/deliveries/:id/cod/reconcile', requireAdmin, async (req: any, res) => {
      try {
        const body = z.object({ notes: z.string().optional() }).parse(req.body);
        const cod = await storage.reconcileCod(parseInt(req.params.id), req.session.userId!, body.notes);
        res.json(cod);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Unable to reconcile COD' });
      }
    });

    app.get('/api/admin/cod-reconciliations', requireAdmin, async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const result = await storage.getAllCodReconciliations({
          status: q.status || undefined, deliveryId: q.deliveryId ? parseInt(q.deliveryId) : undefined,
          page: q.page ? parseInt(q.page) : undefined, limit: q.limit ? parseInt(q.limit) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Failed to load COD reconciliations' });
      }
    });

    // ── Refunds (Admin-only) ─────────────────────────────────────────────────────────────

    app.get('/api/admin/refunds', requireAdmin, async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const result = await storage.getAllRefunds({
          paymentId: q.paymentId ? parseInt(q.paymentId) : undefined, settlementId: q.settlementId ? parseInt(q.settlementId) : undefined,
          status: q.status || undefined, page: q.page ? parseInt(q.page) : undefined, limit: q.limit ? parseInt(q.limit) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Failed to load refunds' });
      }
    });

    app.post('/api/admin/refunds', requireAdmin, async (req: any, res) => {
      try {
        const body = z.object({
          paymentId: z.number().int().optional().nullable(),
          settlementId: z.number().int().optional().nullable(),
          amountCents: z.number().int().positive(),
          reason: z.string().min(1),
        }).parse(req.body);
        const refund = await storage.requestRefund(body, req.session.userId!);
        res.json(refund);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Unable to request refund' });
      }
    });

    app.post('/api/admin/refunds/:id/confirm', requireAdmin, async (req: any, res) => {
      try {
        res.json(await storage.confirmRefund(parseInt(req.params.id), req.session.userId!));
      } catch (err: any) {
        res.status(err.message?.includes('not found') ? 404 : 400).json({ message: err.message ?? 'Unable to confirm refund' });
      }
    });

    app.post('/api/admin/refunds/:id/fail', requireAdmin, async (req: any, res) => {
      try {
        res.json(await storage.failRefund(parseInt(req.params.id), req.session.userId!));
      } catch (err: any) {
        res.status(err.message?.includes('not found') ? 404 : 400).json({ message: err.message ?? 'Unable to fail refund' });
      }
    });

    app.post('/api/admin/refunds/:id/cancel', requireAdmin, async (req: any, res) => {
      try {
        res.json(await storage.cancelRefund(parseInt(req.params.id), req.session.userId!));
      } catch (err: any) {
        res.status(err.message?.includes('not found') ? 404 : 400).json({ message: err.message ?? 'Unable to cancel refund' });
      }
    });

    // ── Adjustments (Admin-only) ─────────────────────────────────────────────────────────

    app.get('/api/admin/adjustments', requireAdmin, async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const result = await storage.getAllAdjustments({
          ledgerEntryId: q.ledgerEntryId ? parseInt(q.ledgerEntryId) : undefined, settlementId: q.settlementId ? parseInt(q.settlementId) : undefined,
          page: q.page ? parseInt(q.page) : undefined, limit: q.limit ? parseInt(q.limit) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Failed to load adjustments' });
      }
    });

    app.post('/api/admin/adjustments', requireAdmin, async (req: any, res) => {
      try {
        const body = z.object({
          ledgerEntryId: z.number().int().optional().nullable(),
          settlementId: z.number().int().optional().nullable(),
          amountCents: z.number().int().positive(),
          direction: z.enum(['CREDIT', 'DEBIT']),
          reason: z.string().min(1),
        }).parse(req.body);
        const adjustment = await storage.createAdjustment(body, req.session.userId!);
        res.json(adjustment);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Unable to create adjustment' });
      }
    });

    // ── Financial Summary (Admin full view + self-service actor summary) ────────────────

    app.get('/api/admin/financial-summary', requireAdmin, async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const result = await storage.getAdminFinancialSummary({
          fromDate: q.fromDate ? new Date(q.fromDate) : undefined, toDate: q.toDate ? new Date(q.toDate) : undefined,
          actorUserId: q.actorUserId ? parseInt(q.actorUserId) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ message: err.message ?? 'Failed to load financial summary' });
      }
    });

    // ── Driver reviews (reuses supplierProductReviews, reviewType='DRIVER') ─────────────

    app.get('/api/driver/reviews/:driverId', async (req, res) => {
      try { res.json(await storage.getDriverReviews(Number(req.params.driverId))); }
      catch { res.status(500).json({ message: 'Failed to load driver reviews' }); }
    });

    app.get('/api/driver/reviews/delivery/:deliveryId', requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const delivery = await storage.getDelivery(Number(req.params.deliveryId), user.role);
      if (!delivery) return res.status(404).json({ message: 'Delivery not found' });
      if (user.role !== 'CAFE_OWNER' || delivery.cafeId !== user.id) return res.status(403).json({ message: 'Forbidden' });
      res.json((await storage.getDriverReviewForDelivery(delivery.id, user.id)) ?? null);
    });

    app.post('/api/driver/reviews', requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'CAFE_OWNER' || user.status !== 'approved') {
        return res.status(403).json({ message: 'Only approved Coffee Owners can submit reviews' });
      }
      try {
        const body = z.object({
          driverId: z.number().int().positive(),
          deliveryId: z.number().int().positive(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().max(2000).optional(),
        }).parse(req.body);
        const delivery = await storage.getDelivery(body.deliveryId, 'ADMIN');
        if (!delivery || delivery.cafeId !== user.id || delivery.driverId !== body.driverId || delivery.status !== 'DELIVERED') {
          return res.status(400).json({ message: 'Reviews are only available after a completed delivery' });
        }
        const result = await storage.upsertDriverReview({ ...body, cafeId: user.id, cafeName: user.name, cafeOwnerName: user.name });
        broadcast('driver_review_created', { driverId: body.driverId, deliveryId: body.deliveryId });
        if (!result.isUpdate) {
          await notify({
            userId: body.driverId,
            service: "SHOP", type: "driver_review_created", priority: "INFO",
            title: "Nouvel avis reçu",
            message: `${user.name} vous a laissé un avis (${body.rating}/5).`,
            entityType: "delivery", entityId: body.deliveryId,
            prefKey: "reviews",
            dedupeKey: `shop:driver_review_created:${body.deliveryId}`,
          });
        }
        res.status(result.isUpdate ? 200 : 201).json(result.review);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Unable to submit review' });
      }
    });

    // ── Delivery Opportunities — Delivery Company publishes, eligible Drivers apply ────────

    app.get('/api/delivery-company/opportunities', requireApprovedDeliveryCompany, async (req: any, res) => {
      try { res.json(await storage.getOpportunitiesForCompany(req.deliveryCompany.id)); }
      catch { res.status(500).json({ message: 'Failed to load opportunities' }); }
    });

    app.post('/api/delivery-company/opportunities', requireApprovedDeliveryCompany, async (req: any, res) => {
      try {
        const body = z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(2000).optional(),
          area: z.string().max(200).optional(),
          vehicleTypeRequired: z.enum(['BICYCLE', 'MOTO', 'CAR', 'VAN', 'TRUCK', 'OTHER']).optional().nullable(),
          startAt: z.string().optional().nullable(),
          durationHours: z.number().int().min(1).max(999).optional().nullable(),
          compensationCents: z.number().int().min(0).optional().nullable(),
        }).parse(req.body);
        const opportunity = await storage.createOpportunity(req.deliveryCompany.id, {
          ...body,
          startAt: body.startAt ? new Date(body.startAt) : null,
        } as any);
        broadcast('delivery_opportunity_updated', { deliveryCompanyId: req.deliveryCompany.id, kind: 'created' });
        const roster = await storage.getDriversForOwner('DELIVERY_COMPANY', req.deliveryCompany.id);
        await notifyMany({
          userIds: roster.map((d) => d.id),
          service: "SHOP", type: "delivery_opportunity_created", priority: "INFO",
          title: "Nouvelle opportunité disponible",
          message: `${req.deliveryCompany.name} propose une nouvelle opportunité : "${opportunity.title}".`,
          entityType: "delivery_opportunity", entityId: opportunity.id,
          prefKey: "delivery_opportunities",
          dedupeKeyPrefix: `shop:opportunity_created:${opportunity.id}`,
        });
        res.status(201).json(opportunity);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Error creating opportunity' });
      }
    });

    app.patch('/api/delivery-company/opportunities/:id/close', requireApprovedDeliveryCompany, async (req: any, res) => {
      try {
        const { status } = z.object({ status: z.enum(['CLOSED', 'CANCELLED']) }).parse(req.body);
        const opportunity = await storage.closeOpportunity(Number(req.params.id), req.deliveryCompany.id, status);
        broadcast('delivery_opportunity_updated', { deliveryCompanyId: req.deliveryCompany.id, kind: 'closed' });
        res.json(opportunity);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err.message ?? 'Error closing opportunity' });
      }
    });

    app.get('/api/driver/opportunities', requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'DRIVER') return res.status(403).json({ message: 'Driver access required' });
      try { res.json(await storage.getOpportunitiesForDriver(user.id)); }
      catch { res.status(500).json({ message: 'Failed to load opportunities' }); }
    });

    app.patch('/api/driver/opportunities/:id/accept', requireAuth, async (req: any, res) => {
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== 'DRIVER') return res.status(403).json({ message: 'Driver access required' });
      try {
        const opportunity = await storage.acceptOpportunity(Number(req.params.id), user.id);
        broadcast('delivery_opportunity_updated', { deliveryCompanyId: opportunity.deliveryCompanyId, kind: 'filled' });
        await notify({
          userId: opportunity.deliveryCompanyId,
          service: "SHOP", type: "delivery_opportunity_filled", priority: "INFO",
          title: "Opportunité pourvue",
          message: `${user.name} a accepté l'opportunité "${opportunity.title}".`,
          entityType: "delivery_opportunity", entityId: opportunity.id,
          prefKey: "delivery_opportunities",
          dedupeKey: `shop:opportunity_filled:${opportunity.id}`,
        });
        res.json(opportunity);
      } catch (err: any) {
        res.status(409).json({ message: err.message ?? 'Unable to accept opportunity' });
      }
    });

    // ── Smart Driver Dispatch System — expiration worker (SMART_DRIVER_DISPATCH_AUDIT.md
    // §5/§10: "no existing scheduler... implement a lightweight server-side worker within
    // the existing application process"). A single setInterval sweep is safe across
    // multiple app instances — expireOverduePendingOffers' own conditional UPDATE is the
    // real safety net (see its doc comment), not this timer — and correctly catches up
    // after a restart: the sweep reads the database's own clock, not an in-memory timer, so
    // the very first tick after a cold start re-evaluates every already-overdue row exactly
    // as if the process had never stopped.
    const DISPATCH_OFFER_WORKER_INTERVAL_MS = 15_000;
    setInterval(async () => {
      try {
        const expired = await storage.expireOverduePendingOffers();
        for (const offer of expired) {
          broadcastToUsers([offer.driverId], 'dispatch_offer_expired', { offerId: offer.id, deliveryId: offer.deliveryId });
          void triggerAutomaticDispatch(offer.deliveryId);
        }
      } catch {
        // A transient DB hiccup must not crash the process — the next tick retries.
      }
    }, DISPATCH_OFFER_WORKER_INTERVAL_MS);
}
