import { db } from "../../db";
import { and, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  deliveries, deliveryPricingSettings, deliveryFinancialLedger, deliveryOpportunities,
  promotions, vehicles, driverProfiles,
  users, products, orders, orderItems, subOrders,
  type Delivery, type DeliveryStatus, type DeliveryMode, type DeliveryWithDetails, type GeoLocation,
  type DeliveryVehicleType, type DeliveryPricingSettings, type DeliveryOpportunity,
  type Vehicle, type InsertVehicle, type DriverProfile, type InsertDriverProfile,
  type FinancialLedgerEntry, type LedgerEntryType, type LedgerActorRole, type LedgerDirection, type LedgerStatus,
  type User, type Product, type Order, type OrderItem, type SubOrder,
} from "@shared/schema";
import type { RedactedDelivery } from "../../storage";
import type { DatabaseStorage } from "../../storage";

// Stage 2 — Batch 41: the complete Delivery operational domain —
// delivery lifecycle (create/dispatch/cancel/assign/reassign/status/
// pickup/tracking/redaction), driver roster management, vehicle fleet
// management, delivery pricing, driver payouts + the delivery financial
// ledger, and delivery opportunities — moved out of server/storage.ts's
// DatabaseStorage class AND consolidated with 4 previously-separate
// specialized files (delivery-pricing.storage.ts [Batch 24],
// vehicles.storage.ts [Batch 25], driver-payout.storage.ts [Batch 26],
// delivery-opportunities.storage.ts [Batch 27]) into this one coherent
// DeliveryStorage class. See server/STORAGE_ARCHITECTURE.md ("Batch 41")
// for the full ownership audit, dependency analysis, and the exact
// consolidation accounting (new extraction vs. file-merge).
//
// Facade dependency — 6 calls into methods that stay resident on
// DatabaseStorage, each for a documented reason:
//  - generateDeliveryConfirmationCode / recomputeOrderAggregateStatus:
//    genuinely SHARED with OrderStorage (Batch 37's own "shared helper
//    stays resident" decision) — not Delivery-exclusive, so not moved.
//  - calculateDeliverySettlement / createCodReconciliationIfApplicable:
//    Settlement/COD Reconciliation Finance infrastructure — explicitly
//    excluded from this batch's scope (task: "do not absorb general
//    financial ledger, settlement, accounting, or payment infrastructure
//    merely because it records delivery-related transactions"). Both
//    were private on DatabaseStorage; made public here (zero behavior
//    change — TypeScript visibility has no runtime effect) so this class
//    can reach them, following the same precedent as every prior
//    private→public visibility change in this refactor.
//  - getUserByEmail / createUser: generic User-domain identity
//    operations (UserStorage, Batch 39), called only by
//    createDriverForOwner's duplicate-email guard and account creation.
//
// Deliberately EXCLUDED from this consolidation (see server/
// STORAGE_ARCHITECTURE.md "Batch 41" §2 for the full reasoning):
//  - The entire "── DELIVERY COMPANY ──" marketplace-profile/card/
//    reports section in server/storage.ts (getDeliveryCompanyProfile,
//    getDeliveryCompanyCard, createDeliveryCompanyReport, etc.) —
//    architecturally parallel to Maintenance/Marketing/Print/Barista/
//    Academy's own un-merged provider-marketplace domains, not the
//    Delivery operational pipeline this batch targets.
//  - getDeliveryCompanyReviews/upsertDeliveryCompanyReview and every
//    other provider's own review methods — part of a separate,
//    not-yet-extracted, cross-cutting Reviews domain spanning every
//    provider type uniformly (same exclusion already applied to
//    Product's reviews in Batch 40).
//  - getSupplierCafes/createCafeForSupplier — Supplier-owned café
//    referral workflow, not Driver/Delivery.
//  - The full Settlement/COD Reconciliation/Refunds/Adjustments/Admin
//    Financial Summary/Payment cluster — general Finance infrastructure,
//    explicitly excluded per the task's own Finance/Settlement boundary.
export class DeliveryStorage {
  constructor(private facade: DatabaseStorage) {}

  /**
   * Idempotently creates the single Delivery for a sub-order once it reaches READY.
   * Returns null (no-op) when: the order is SELF_PICKUP (no courier needed), the sub-order/
   * order can't be found, or a delivery already exists for this sub-order (DB-level
   * ON CONFLICT DO NOTHING against the active-delivery partial unique index — safe against
   * concurrent/duplicate calls without needing an app-level lock).
   */
  async createDeliveryForSubOrder(subOrderId: number, client: any = db): Promise<Delivery | null> {
    const [subOrder] = await client.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!subOrder) return null;
    const [order] = await client.select().from(orders).where(eq(orders.id, subOrder.orderId));
    if (!order) return null;
    if (order.deliveryMethod !== 'DELIVERY_SERVICE') return null;

    const [supplier] = await client.select().from(users).where(eq(users.id, subOrder.supplierId));
    // Snapshot the supplier's current account location as the pickup point — a supplier
    // changing their profile address later must never rewrite an already-created Delivery.
    const pickupAddress: GeoLocation = {
      address: supplier?.locationAddress ?? '',
      lat: supplier?.locationLat ?? '',
      lng: supplier?.locationLng ?? '',
      placeId: supplier?.locationPlaceId ?? '',
      details: (supplier?.locationDetails as GeoLocation['details']) ?? undefined,
    };
    const destinationAddress = (order.deliveryAddress as GeoLocation | null) ?? undefined;

    // Provisional fee estimate — no driver assigned yet, so only the supplier→cafe leg is
    // known. Recomputed (and frozen) with the real driver→supplier leg + real vehicle type
    // at assignDriver() — see the fee engine note there.
    const estimate = await this.computeDeliveryFee({
      supplierId: subOrder.supplierId,
      cafeId: order.cafeId,
      subtotalCents: subOrder.subtotal ?? 0,
      supplierLocation: supplier ? { lat: supplier.locationLat, lng: supplier.locationLng } : null,
      cafeLocation: destinationAddress ? { lat: destinationAddress.lat, lng: destinationAddress.lng, details: destinationAddress.details } : null,
    });

    const [created] = await client.insert(deliveries).values({
      subOrderId,
      orderId: order.id,
      supplierId: subOrder.supplierId,
      cafeId: order.cafeId,
      // Created PENDING — the supplier must dispatch it (choose Delivery Company or its own
      // drivers) before it becomes visible/actionable to anyone else. See dispatchDelivery().
      status: 'PENDING',
      pickupAddress,
      destinationAddress,
      // Real, computed fee (see storage.computeDeliveryFee) — provisional until a driver is
      // assigned. Replaces the old "always snapshot orders.deliveryFee, which is always 0"
      // placeholder now that a real pricing engine exists.
      deliveryFee: estimate.feeCents,
      cafeOwnerFeeShareCents: estimate.cafeOwnerFeeShareCents,
      supplierFeeShareCents: estimate.supplierFeeShareCents,
      freeDeliveryApplied: estimate.freeDeliveryApplied,
      vehicleType: estimate.vehicleType,
      distanceKm: estimate.distanceKm.toFixed(2),
      surgeMultiplierPermille: estimate.surgeMultiplierPermille,
      // Delivery Pricing Factor Pipeline snapshot (Phase 1) — see shared/schema.ts comment.
      pricePerKmCentsUsed: estimate.pricePerKmCentsUsed,
      minFeeCentsUsed: estimate.minFeeCentsUsed,
      baseFeeCents: estimate.baseFeeCents,
      adjustedFeeCents: estimate.adjustedFeeCents,
      weatherMultiplierPermilleUsed: estimate.weatherMultiplierPermilleUsed,
      demandMultiplierPermilleUsed: estimate.demandMultiplierPermilleUsed,
      peakHourMultiplierPermilleUsed: estimate.peakHourMultiplierPermilleUsed,
      zoneMultiplierPermilleUsed: estimate.zoneMultiplierPermilleUsed,
      waitingFeeCentsUsed: estimate.waitingFeeCentsUsed,
      urgencySurchargeCentsUsed: estimate.urgencySurchargeCentsUsed,
      // RouteEngine snapshot (Phase 2) — see shared/schema.ts comment. roadDistanceKm equals
      // distanceKm today (fallback provider only); estimatedDurationMinutes stays null (no
      // invented ETA — see getRoute doc).
      roadDistanceKm: estimate.roadDistanceKm.toFixed(2),
      estimatedDurationMinutes: estimate.estimatedDurationMinutes,
      distanceSource: estimate.distanceSource,
      // Delivery System V2 Phase 4 snapshot — provisional here, re-resolved and re-frozen at
      // assignment exactly like every other pricing field (see assignDriver/reassignDriver).
      weatherConditionUsed: estimate.weatherConditionUsed,
      weatherIncentiveCentsUsed: estimate.weatherIncentiveCentsUsed,
      zoneNameUsed: estimate.zoneNameUsed,
      peakHourLabelUsed: estimate.peakHourLabelUsed,
      peakIncentiveCentsUsed: estimate.peakIncentiveCentsUsed,
      safetyStateUsed: estimate.safetyStateUsed,
      supplierSubsidyCents: estimate.supplierSubsidyCents,
      bigBossSubsidyCents: estimate.bigBossSubsidyCents,
      // Two-way confirmation codes — generated once, never regenerated. See shared/schema.ts
      // deliveries.pickupCode/dropoffCode comment.
      pickupCode: this.facade.generateDeliveryConfirmationCode(),
      dropoffCode: this.facade.generateDeliveryConfirmationCode(),
    }).onConflictDoNothing().returning();

    return created ?? null;
  }

  /**
   * The supplier's dispatch decision — either publish it to the Delivery Company queue (→
   * AVAILABLE, existing accept/assign flow unchanged) or operate it directly with the
   * supplier's own drivers (→ ACCEPTED immediately; no company acceptance step, since the
   * supplier IS the operator — see SHOP_DELIVERY_V2 spec §25). Atomic compare-and-swap on
   * (id, supplierId=caller, status=<the row's own current status>) — reuses the same Delivery
   * row, never creates a second one.
   *
   * Four entry states are supported:
   *  - PENDING → a fresh, first-ever dispatch decision (the only case that existed before this
   *    doc's redispatch extension — completely unchanged in behavior/values).
   *  - AVAILABLE / ACCEPTED, DELIVERY_COMPANY mode only in practice (task: "Update Supplier
   *    Delivery Reassignment Actions" — "Réassigner" for an external delivery company that
   *    hasn't accepted yet, or has accepted but not yet assigned its own driver). No driver has
   *    ever been assigned at this point (assignDriver only runs after ACCEPTED), so nothing is
   *    frozen yet: isRedispatch stays false for these two, exactly like a fresh PENDING
   *    dispatch — no ledger void, no pricing-field reset, because there is nothing to void or
   *    reset.
   *  - ASSIGNED → REDISPATCH (task: "Supplier redispatch before driver confirmation"). The
   *    Supplier can reopen the exact same dispatch decision — Delivery Company / choose a
   *    company / own drivers — while the currently-assigned driver has not yet progressed
   *    past ASSIGNED (i.e. before PICKED_UP; there is no separate "driver confirmed" flag
   *    anywhere in this codebase — ASSIGNED-but-not-yet-PICKED_UP is the only existing state
   *    that represents "assigned but not yet actually collected", and is exactly where
   *    "Réassigner"/"Changer de chauffeur" already render today, so it is reused as-is rather
   *    than inventing a new status). On this path, the previous, now-superseded assignment's
   *    CALCULATED ledger entries are voided (the exact same status-only mechanism
   *    reassignDriver already uses — see updateLedgerEntriesStatus) and its frozen pricing/
   *    payout snapshot is cleared back to its pre-assignment shape, so the next real
   *    assignDriver call recomputes and refreezes everything cleanly — never two active
   *    assignments/ledger sets at once, never a duplicate driver offer or company dispatch.
   *    assignmentSequence is incremented (DB-native atomic increment) so a future assignment's
   *    ledger keys can never collide with the just-voided ones, mirroring the exact reasoning
   *    behind the Phase 5B hardening A→B→A fix.
   */
  // targetDeliveryCompanyId (Part 24) — when given, this delivery is pre-assigned to that
  // one company instead of entering the shared broadcast pool: getDeliveries' DELIVERY_COMPANY
  // branch only surfaces an AVAILABLE delivery to companies where deliveryCompanyId is either
  // null (the existing pool, unchanged) or equal to their own id, and acceptDelivery refuses a
  // different company from taking it — so it can never be "stolen". Leaving it undefined
  // reproduces today's exact broadcast-to-all behavior.
  async dispatchDelivery(deliveryId: number, supplierId: number, mode: DeliveryMode, targetDeliveryCompanyId?: number): Promise<Delivery> {
    const [current] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!current || current.supplierId !== supplierId || !['PENDING', 'AVAILABLE', 'ACCEPTED', 'ASSIGNED'].includes(current.status)) {
      throw new Error('Delivery is not awaiting dispatch, or does not belong to you');
    }
    const isRedispatch = current.status === 'ASSIGNED';

    const updates: any = { deliveryMode: mode };
    if (mode === 'DELIVERY_COMPANY') {
      updates.status = 'AVAILABLE';
      updates.deliveryCompanyId = targetDeliveryCompanyId ?? null;
    } else {
      updates.status = 'ACCEPTED';
      updates.acceptedAt = new Date();
      updates.deliveryCompanyId = null;
    }

    if (isRedispatch) {
      updates.driverId = null;
      updates.vehicleId = null;
      updates.vehicleType = null;
      updates.assignedAt = null;
      updates.feeFinalizedAt = null;
      updates.assignmentSequence = sql`${deliveries.assignmentSequence} + 1`;
      // Reset the frozen fee/payout/route snapshot back to its pre-assignment shape — the
      // next assignDriver call recomputes and refreezes all of this from scratch, exactly as
      // it would for any never-before-assigned delivery. cafeOwnerFeeShareCents/
      // supplierFeeShareCents/deliveryFee are NOT NULL columns (default 0), matching their own
      // schema default; every other snapshot field is nullable and reset to null.
      updates.deliveryFee = 0;
      updates.cafeOwnerFeeShareCents = 0;
      updates.supplierFeeShareCents = 0;
      updates.freeDeliveryApplied = false;
      updates.distanceKm = null;
      updates.surgeMultiplierPermille = null;
      updates.pricePerKmCentsUsed = null;
      updates.minFeeCentsUsed = null;
      updates.baseFeeCents = null;
      updates.adjustedFeeCents = null;
      updates.weatherMultiplierPermilleUsed = null;
      updates.demandMultiplierPermilleUsed = null;
      updates.peakHourMultiplierPermilleUsed = null;
      updates.zoneMultiplierPermilleUsed = null;
      updates.waitingFeeCentsUsed = null;
      updates.urgencySurchargeCentsUsed = null;
      updates.roadDistanceKm = null;
      updates.estimatedDurationMinutes = null;
      updates.distanceSource = null;
      updates.pickupLegDistanceKm = null;
      updates.pickupLegRoadDistanceKm = null;
      updates.pickupLegEstimatedDurationMinutes = null;
      updates.pickupLegDistanceSource = null;
      updates.pickupLegFeeCents = null;
      updates.driverPayoutSharePercentUsed = null;
      updates.driverPayoutCents = null;
      updates.companyPayoutCents = null;
      updates.weatherConditionUsed = null;
      updates.weatherIncentiveCentsUsed = null;
      updates.zoneNameUsed = null;
      updates.peakHourLabelUsed = null;
      updates.peakIncentiveCentsUsed = null;
      updates.safetyStateUsed = null;
      updates.supplierSubsidyCents = null;
      updates.bigBossSubsidyCents = null;
      updates.budgetResultUsed = null;
      updates.budgetDeficitCentsUsed = null;
    }

    return db.transaction(async (tx) => {
      const [updated] = await tx.update(deliveries)
        .set(updates)
        .where(and(eq(deliveries.id, deliveryId), eq(deliveries.supplierId, supplierId), eq(deliveries.status, current.status)))
        .returning();
      if (!updated) throw new Error('Delivery status changed concurrently — please retry');
      if (isRedispatch) {
        await this.updateLedgerEntriesStatus(deliveryId, 'CALCULATED', 'VOID', tx);
      }
      return updated;
    });
  }

  /** Cancels the active (non-terminal) delivery for a sub-order, if one exists. Orphan-delivery guard. */
  async cancelActiveDeliveryForSubOrder(subOrderId: number, client: any = db): Promise<Delivery | null> {
    const [cancelled] = await client.update(deliveries)
      .set({ status: 'CANCELLED', cancelledAt: new Date() })
      .where(and(
        eq(deliveries.subOrderId, subOrderId),
        ne(deliveries.status, 'CANCELLED'),
        ne(deliveries.status, 'DELIVERED'),
      ))
      .returning();
    return cancelled ?? null;
  }

  // ── Deliveries ────────────────────────────────────────────────────────────────
  // One row per sub_order (see shared/schema.ts). Status transitions are validated against
  // DELIVERY_TRANSITIONS below and are applied with an atomic, ownership-scoped
  // UPDATE ... WHERE (compare-and-swap on the current status + owner id) rather than a
  // read-then-write pair, so two concurrent accept/assign/status calls cannot both succeed.

  // PENDING can resolve either to AVAILABLE (dispatched to the Delivery Company queue) or
  // straight to ACCEPTED (dispatched to the supplier's own drivers — no company acceptance
  // step needed since the supplier is the operator). See dispatchDelivery().
  private readonly DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
    PENDING: ['AVAILABLE', 'ACCEPTED', 'CANCELLED'],
    AVAILABLE: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['PICKED_UP', 'CANCELLED'],
    PICKED_UP: ['IN_TRANSIT'],
    IN_TRANSIT: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: [],
  };

  /**
   * Strips confirmation codes the given viewer has no business seeing. The supplier reads
   * pickupCode (to hand to the driver at collection); the cafe owner reads dropoffCode (to
   * hand to the driver at drop-off). The driver never sees either value — only submits an
   * attempt via updateDeliveryStatus. Admin/super-admin keep both for support/dispute
   * resolution; every other role (delivery company) sees neither.
   */
  /**
   * Also redacts the Phase 3 payout snapshot (driverPayoutCents/companyPayoutCents) by role,
   * on top of the pre-existing pickup/dropoff code redaction — same chokepoint, same
   * principle: never expose a financial detail to a role it doesn't belong to (see rules
   * 17-20 of the Phase 3 task). DRIVER sees their own driverPayoutCents only (never
   * companyPayoutCents — a company's own margin isn't the driver's business). SUPPLIER sees
   * driverPayoutCents only for its OWN operated deliveries (SUPPLIER mode — it's effectively
   * their own driver's earnings); for an external Delivery Company's delivery, the supplier
   * sees neither (rule 18: "expose only the information relevant to the supplier's
   * operational/financial relationship"). DELIVERY_COMPANY sees both for its own deliveries
   * (rule 19). CAFE_OWNER sees neither (rule 17). ADMIN sees everything (early return, as
   * before).
   */
  /**
   * Delivery System V2 Phase 4 additions to the existing redaction chokepoint: weather/peak
   * driver incentives and waiting driver compensation follow the exact same visibility rule
   * as driverPayoutCents (they are additive components OF it); supplierSubsidyCents is the
   * Supplier's own contribution, so the Supplier sees it (plus Admin); bigBossSubsidyCents
   * and the DeliveryBudgetEngine's result/deficit are BigBoss-internal margin analysis,
   * Admin-only, never shown to any other role — see rules 17-20 of the Phase 4 spec.
   */
  /**
   * Delivery System V2 Phase 5B (hardening) — extended to also redact cafeOwnerFeeShareCents/
   * supplierFeeShareCents, closing the gap flagged in the Phase 5B report ("redactDeliveryCodes
   * still does not redact some delivery financial fields") and rule 6/7 of the hardening task
   * ("never trust frontend hiding" — deliveryFee/split fields were previously returned
   * unredacted to every role, with only the UI choosing not to LABEL them for some roles).
   *
   * `deliveryFee` (the raw total) is deliberately left UNREDACTED here, including for DRIVER —
   * two reasons: (1) rule 7 of the hardening task names "Coffee Owner contribution"
   * (cafeOwnerFeeShareCents) and "supplier margin" (supplierFeeShareCents) as forbidden for a
   * Driver, but never the aggregate total itself; (2) the shared DeliveryDetails component's
   * existing, tested fallback for pre-Phase-3 deliveries (driverPayoutCents null) shows
   * deliveryFee to the driver as the best available approximation of their own historical
   * earnings (in that era, the full fee WAS the driver's compensation, by definition) — nulling
   * it here would break that already-correct, already-tested fallback. cafeOwnerFeeShareCents
   * (rule 7: "Coffee Owner contribution" — forbidden for Driver) and supplierFeeShareCents
   * ("supplier margin"/"supplier private economics" — forbidden for both Driver and Coffee
   * Owner) ARE now redacted. Confirmed via code search that neither field is read by any
   * Driver- or Coffee-Owner-facing UI today, so this closes a real, previously-unused-but-real
   * data-exposure gap without breaking any existing display.
   */
  redactDeliveryCodes(delivery: Delivery, viewerRole?: string): RedactedDelivery {
    if (viewerRole === 'ADMIN' || viewerRole === 'SUPER_ADMIN') return delivery;
    const showDriverPayout = viewerRole === 'DRIVER'
      || (viewerRole === 'SUPPLIER' && delivery.deliveryMode === 'SUPPLIER')
      || viewerRole === 'DELIVERY_COMPANY';
    const showCompanyPayout = viewerRole === 'DELIVERY_COMPANY';
    const showSupplierSubsidy = viewerRole === 'SUPPLIER';
    // Coffee Owner may see their own contribution (rule 7: "their own customer-facing
    // contribution") but never the Supplier's; Supplier/Delivery Company may see both, since
    // they operate the delivery; Driver sees neither split (only the aggregate, see above).
    const showCafeOwnerShare = viewerRole === 'CAFE_OWNER' || viewerRole === 'SUPPLIER' || viewerRole === 'DELIVERY_COMPANY';
    const showSupplierShare = viewerRole === 'SUPPLIER' || viewerRole === 'DELIVERY_COMPANY';
    // Two-Leg Delivery Distance Model — the pickup leg (driver → supplier) is Supplier/
    // Delivery Company/Driver business, never Coffee Owner business (task: "the Coffee Owner
    // must not be charged for the supplier pickup leg" — and must not even SEE that cost,
    // since it was never part of what they owe). Admin already returns early above.
    const showPickupLeg = viewerRole === 'SUPPLIER' || viewerRole === 'DELIVERY_COMPANY' || viewerRole === 'DRIVER';
    return {
      ...delivery,
      pickupCode: viewerRole === 'SUPPLIER' ? delivery.pickupCode : null,
      dropoffCode: viewerRole === 'CAFE_OWNER' ? delivery.dropoffCode : null,
      cafeOwnerFeeShareCents: showCafeOwnerShare ? delivery.cafeOwnerFeeShareCents : null,
      supplierFeeShareCents: showSupplierShare ? delivery.supplierFeeShareCents : null,
      driverPayoutCents: showDriverPayout ? delivery.driverPayoutCents : null,
      companyPayoutCents: showCompanyPayout ? delivery.companyPayoutCents : null,
      driverPayoutSharePercentUsed: (showDriverPayout || showCompanyPayout) ? delivery.driverPayoutSharePercentUsed : null,
      weatherIncentiveCentsUsed: showDriverPayout ? delivery.weatherIncentiveCentsUsed : null,
      peakIncentiveCentsUsed: showDriverPayout ? delivery.peakIncentiveCentsUsed : null,
      waitingDriverCompensationCentsUsed: showDriverPayout ? delivery.waitingDriverCompensationCentsUsed : null,
      supplierSubsidyCents: showSupplierSubsidy ? delivery.supplierSubsidyCents : null,
      bigBossSubsidyCents: null,
      budgetResultUsed: null,
      budgetDeficitCentsUsed: null,
      pickupLegDistanceKm: showPickupLeg ? delivery.pickupLegDistanceKm : null,
      pickupLegRoadDistanceKm: showPickupLeg ? delivery.pickupLegRoadDistanceKm : null,
      pickupLegEstimatedDurationMinutes: showPickupLeg ? delivery.pickupLegEstimatedDurationMinutes : null,
      pickupLegDistanceSource: showPickupLeg ? delivery.pickupLegDistanceSource : null,
      pickupLegFeeCents: showSupplierShare ? delivery.pickupLegFeeCents : null,
    };
  }

  private toDeliveryWithDetails(row: RedactedDelivery, users_: User[], orders_: Order[], subOrders_: SubOrder[], orderItems_: OrderItem[], products_: Product[]): DeliveryWithDetails {
    const userMap = new Map(users_.map((u) => [u.id, u]));
    const productMap = new Map(products_.map((p) => [p.id, p]));
    const order = orders_.find((o) => o.id === row.orderId);
    const subOrder = subOrders_.find((s) => s.id === row.subOrderId);
    const cafe = userMap.get(row.cafeId);
    const supplier = userMap.get(row.supplierId);
    const company = row.deliveryCompanyId ? userMap.get(row.deliveryCompanyId) : undefined;
    const driver = row.driverId ? userMap.get(row.driverId) : undefined;
    // Same shape as OrderWithDetails.subOrders[].items (see getOrders) — the exact raw,
    // joined order items, including snapshot/packId/productId — so every delivery-detail
    // surface can reuse the exact same groupOrderItemsByProduct/PackCompositionView
    // rendering the Coffee Owner order-details modal already uses, instead of a second,
    // lossy flattened representation.
    const itemsForThisSubOrder = orderItems_
      .filter((i) => i.subOrderId === row.subOrderId)
      .map((i) => ({ ...i, product: (i.productId != null ? productMap.get(i.productId) : undefined) ?? {} as Product }));
    const allItemsForOrder = orderItems_.filter((i) => i.orderId === row.orderId);
    return {
      ...row,
      order: {
        id: order?.id ?? row.orderId,
        status: order?.status ?? '',
        totalAmount: order?.totalAmount ?? 0,
        createdAt: order?.createdAt ?? null,
        itemCount: allItemsForOrder.length,
        priority: (order?.priority ?? 'NORMAL') as string,
        scheduledAt: order?.scheduledAt ?? null,
      },
      subOrder: {
        id: subOrder?.id ?? row.subOrderId, status: subOrder?.status ?? '', supplierName: subOrder?.supplierName ?? supplier?.name ?? 'Unknown', subtotal: subOrder?.subtotal ?? 0,
        requiredVehicleType: subOrder?.requiredVehicleType ?? null,
        totalWeightKg: subOrder?.totalWeightKg ?? null,
        totalVolumeL: subOrder?.totalVolumeL ?? null,
        numberOfPackages: subOrder?.numberOfPackages ?? null,
        numberOfItems: subOrder?.numberOfItems ?? null,
        isFragile: subOrder?.isFragile ?? false,
        specialHandling: subOrder?.specialHandling ?? null,
      },
      cafe: { id: row.cafeId, name: cafe?.name ?? 'Unknown', phone: cafe?.phone ?? null, locationAddress: cafe?.locationAddress ?? null },
      supplier: { id: row.supplierId, name: supplier?.name ?? 'Unknown', phone: supplier?.phone ?? null, locationAddress: supplier?.locationAddress ?? null, locationLat: supplier?.locationLat ?? null, locationLng: supplier?.locationLng ?? null },
      deliveryCompany: company ? { id: company.id, name: company.name } : null,
      driver: driver ? { id: driver.id, name: driver.name, phone: driver.phone, locationLat: driver.locationLat ?? null, locationLng: driver.locationLng ?? null } : null,
      payoutStatus: this.computeDeliveryPayoutStatus(row.status),
      // Delivery System V2 Phase 4 — driverPayoutCents (frozen at assignment) plus any later
      // waitingDriverCompensationCentsUsed (only known at pickup — see schema doc). Derived
      // from the ALREADY-REDACTED row (redactDeliveryCodes runs before this method — see
      // getDeliveries/getDelivery), so an unauthorized viewer who was redacted to
      // driverPayoutCents=null correctly gets totalDriverPayoutCents=null too, never a
      // partial/leaked total.
      totalDriverPayoutCents: row.driverPayoutCents != null ? row.driverPayoutCents + (row.waitingDriverCompensationCentsUsed ?? 0) : null,
      items: itemsForThisSubOrder,
    };
  }

  /**
   * Role-scoped delivery list.
   *   DRIVER            → deliveries assigned to that driver
   *   DELIVERY_COMPANY   → deliveries it owns (accepted/assigned/completed by it) PLUS the
   *                        open AVAILABLE pool it can still accept from (see
   *                        SHOP_DELIVERY_SYNCHRONIZATION_ANALYSIS.md §35 — no zone/territory
   *                        model exists yet, so "eligible" = every approved delivery company;
   *                        this is the documented extension point for future zone dispatch)
   *   SUPPLIER          → its own deliveries (read-only status visibility)
   *   CAFE_OWNER        → deliveries for its own orders (read-only status visibility)
   *   ADMIN/SUPER_ADMIN → all (oversight)
   */
  async getDeliveries(userId: number, role: string): Promise<DeliveryWithDetails[]> {
    let rows: Delivery[];
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      rows = await db.select().from(deliveries);
    } else if (role === 'DRIVER') {
      rows = await db.select().from(deliveries).where(eq(deliveries.driverId, userId));
    } else if (role === 'DELIVERY_COMPANY') {
      // A company always sees its own deliveries (accepted, or specifically targeted at it —
      // see dispatchDelivery's targetDeliveryCompanyId), plus the untargeted broadcast pool
      // (AVAILABLE + deliveryCompanyId still null) exactly as before — never another
      // company's targeted delivery.
      rows = await db.select().from(deliveries).where(or(
        eq(deliveries.deliveryCompanyId, userId),
        and(eq(deliveries.status, 'AVAILABLE'), isNull(deliveries.deliveryCompanyId)),
      ));
    } else if (role === 'SUPPLIER') {
      rows = await db.select().from(deliveries).where(eq(deliveries.supplierId, userId));
    } else if (role === 'CAFE_OWNER') {
      rows = await db.select().from(deliveries).where(eq(deliveries.cafeId, userId));
    } else {
      return [];
    }
    if (rows.length === 0) return [];
    const orderIds = Array.from(new Set(rows.map((r) => r.orderId)));
    const subOrderIds = Array.from(new Set(rows.map((r) => r.subOrderId)));
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeId, r.supplierId, r.deliveryCompanyId, r.driverId].filter((x): x is number => x != null))));
    const [ordersRows, subOrdersRows, usersRows, orderItemsRows] = await Promise.all([
      orderIds.length ? db.select().from(orders).where(inArray(orders.id, orderIds)) : Promise.resolve([]),
      subOrderIds.length ? db.select().from(subOrders).where(inArray(subOrders.id, subOrderIds)) : Promise.resolve([]),
      userIds.length ? db.select().from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
      orderIds.length ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : Promise.resolve([]),
    ]);
    const productIds = Array.from(new Set(orderItemsRows.map((i) => i.productId).filter((x): x is number => x != null)));
    const productsRows = productIds.length ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
    return rows
      .map((r) => this.toDeliveryWithDetails(this.redactDeliveryCodes(r, role), usersRows, ordersRows, subOrdersRows, orderItemsRows, productsRows))
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async getDelivery(id: number, viewerRole?: string): Promise<DeliveryWithDetails | undefined> {
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, id));
    if (!row) return undefined;
    const [[order], [subOrder], usersRows, orderItemsRows] = await Promise.all([
      db.select().from(orders).where(eq(orders.id, row.orderId)),
      db.select().from(subOrders).where(eq(subOrders.id, row.subOrderId)),
      db.select().from(users).where(inArray(users.id, [row.cafeId, row.supplierId, row.deliveryCompanyId, row.driverId].filter((x): x is number => x != null))),
      db.select().from(orderItems).where(eq(orderItems.orderId, row.orderId)),
    ]);
    const productIds = Array.from(new Set(orderItemsRows.map((i) => i.productId).filter((x): x is number => x != null)));
    const productsRows = productIds.length ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
    return this.toDeliveryWithDetails(this.redactDeliveryCodes(row, viewerRole), usersRows, order ? [order] : [], subOrder ? [subOrder] : [], orderItemsRows, productsRows);
  }

  /**
   * Access control for a single delivery. Never uses order status as a proxy for
   * authorization (that was the IDOR identified in the pre-implementation analysis).
   */
  async canUserAccessDelivery(userId: number, role: string, deliveryId: number): Promise<boolean> {
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!row) return false;
    if (role === 'DRIVER') return row.driverId === userId;
    if (role === 'DELIVERY_COMPANY') return row.deliveryCompanyId === userId || row.status === 'AVAILABLE';
    if (role === 'SUPPLIER') return row.supplierId === userId;
    if (role === 'CAFE_OWNER') return row.cafeId === userId;
    return false;
  }

  /** AVAILABLE → ACCEPTED. Atomic compare-and-swap: fails (0 rows) if another company already accepted it. */
  async acceptDelivery(deliveryId: number, deliveryCompanyId: number): Promise<Delivery> {
    // Guards against a targeted delivery (dispatchDelivery's targetDeliveryCompanyId) being
    // accepted by a different company than the one it was sent to — untargeted (null) stays
    // first-come-first-served exactly as before.
    const [updated] = await db.update(deliveries)
      .set({ status: 'ACCEPTED', deliveryCompanyId, acceptedAt: new Date() })
      .where(and(
        eq(deliveries.id, deliveryId),
        eq(deliveries.status, 'AVAILABLE'),
        or(isNull(deliveries.deliveryCompanyId), eq(deliveries.deliveryCompanyId, deliveryCompanyId)),
      ))
      .returning();
    if (!updated) throw new Error('Delivery is no longer available');
    return updated;
  }

  /**
   * ACCEPTED → ASSIGNED. Works for both delivery modes:
   *   deliveryMode = DELIVERY_COMPANY → caller must be the accepting company; driver must
   *     belong to that same company (driver.deliveryCompanyId).
   *   deliveryMode = SUPPLIER → caller must be the owning supplier; driver must belong to
   *     that same supplier (driver.supplierId).
   * Atomic compare-and-swap on (id, status=ACCEPTED, owner-matches-caller) so two concurrent
   * assign calls can't both succeed, and so a caller can never assign a delivery it doesn't
   * own regardless of which mode it's in.
   */
  async assignDriver(deliveryId: number, actingUser: { id: number; role: string }, driverId: number): Promise<Delivery> {
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!delivery) throw new Error('Delivery not found');
    const [driver] = await db.select().from(users).where(eq(users.id, driverId));
    if (!driver || driver.role !== 'DRIVER') throw new Error('Invalid driver');

    let ownerCondition;
    if (delivery.deliveryMode === 'SUPPLIER') {
      if (actingUser.role !== 'SUPPLIER' || delivery.supplierId !== actingUser.id) {
        throw new Error('Only the operating supplier can assign a driver to this delivery');
      }
      if (driver.supplierId !== actingUser.id) {
        throw new Error('Driver does not belong to your supplier account');
      }
      ownerCondition = eq(deliveries.supplierId, actingUser.id);
    } else {
      if (actingUser.role !== 'DELIVERY_COMPANY' || delivery.deliveryCompanyId !== actingUser.id) {
        throw new Error('Only the accepting delivery company can assign a driver to this delivery');
      }
      if (driver.deliveryCompanyId !== actingUser.id) {
        throw new Error('Driver does not belong to your company');
      }
      ownerCondition = eq(deliveries.deliveryCompanyId, actingUser.id);
    }

    // Final fee — real driver→supplier leg now known, plus the driver's actually-assigned
    // vehicle type (falls back to the pricing config's default if the driver has none yet,
    // same as the creation-time estimate). Frozen here: updateDeliveryStatus never touches
    // these fields again, so a later Admin pricing change never rewrites this delivery's
    // already-locked financial value (see shared/schema.ts deliveries.feeFinalizedAt).
    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, delivery.subOrderId));
    const assignedVehicle = await this.getVehicleForDriver(driverId);
    // Vehicle compatibility (Delivery System V2 Phase 1: ordinal type check; Phase 2: + capacity
    // where configured — see checkDeliveryVehicleCompatibility). Never allow assigning a driver
    // whose vehicle can't fulfill this sub-order's declared requirement. No requirement/capacity
    // set → always compatible, so every existing order/vehicle is unaffected.
    const pricingSettingsForAssign = await this.getDeliveryPricingSettings();
    const compatibility = this.checkDeliveryVehicleCompatibility({
      requiredVehicleType: subOrder?.requiredVehicleType as DeliveryVehicleType | null,
      totalWeightKg: subOrder?.totalWeightKg, totalVolumeL: subOrder?.totalVolumeL, numberOfPackages: subOrder?.numberOfPackages,
      vehicleType: assignedVehicle?.type as DeliveryVehicleType | null,
      vehicleCapacity: assignedVehicle?.type ? pricingSettingsForAssign.vehiclePricing?.[assignedVehicle.type as DeliveryVehicleType] : undefined,
    });
    if (!compatibility.compatible) throw new Error(compatibility.reason);
    const finalFee = await this.computeDeliveryFee({
      supplierId: delivery.supplierId,
      cafeId: delivery.cafeId,
      subtotalCents: subOrder?.subtotal ?? 0,
      supplierLocation: { lat: delivery.pickupAddress?.lat, lng: delivery.pickupAddress?.lng },
      cafeLocation: { lat: delivery.destinationAddress?.lat, lng: delivery.destinationAddress?.lng, details: delivery.destinationAddress?.details },
      driverLocation: { lat: driver.locationLat, lng: driver.locationLng },
      vehicleType: assignedVehicle?.type ?? null,
    });
    // Delivery Safety Engine (Phase 4) — never allow a new assignment while the active
    // weather condition has been configured as SUSPEND (all deliveries blocked) or RESTRICT
    // for this specific vehicle type (see resolveWeatherPricing doc). ALLOW/ALLOW_WITH_WARNING
    // never block — the default 'ALLOW' state (no weather condition configured, or 'NORMAL')
    // means this check is a no-op for every existing delivery.
    if (finalFee.safetyStateUsed === 'SUSPEND') {
      throw new Error(`Deliveries are currently suspended due to weather conditions (${finalFee.weatherConditionUsed})`);
    }
    if (finalFee.safetyStateUsed === 'RESTRICT' && finalFee.vehicleType && finalFee.restrictedVehicleTypesUsed.includes(finalFee.vehicleType)) {
      throw new Error(`${finalFee.vehicleType} deliveries are currently restricted due to weather conditions (${finalFee.weatherConditionUsed}) — choose a different vehicle`);
    }
    // Driver Payout Engine (Phase 3, extended Phase 4 with weather/peak incentives) — frozen
    // at the same moment as the fee itself, using the already-fetched pricing settings. See
    // computeDeliveryPayout doc.
    // Two-Leg Delivery Distance Model — the driver physically travels BOTH legs (pickup +
    // delivery), so their payout is computed on the COMBINED value of both, exactly
    // preserving the existing "driver earns pct% of the trip's total value" principle —
    // computeDeliveryPayout itself is unchanged, only fed the correct combined total instead
    // of the (now Leg-2-only) customer-facing feeCents alone.
    const totalTripFeeCents = finalFee.feeCents + (finalFee.pickupLegFeeCents ?? 0);
    const payout = this.computeDeliveryPayout({
      feeCents: totalTripFeeCents, deliveryMode: delivery.deliveryMode, driverPayoutSharePercent: pricingSettingsForAssign.driverPayoutSharePercent,
      weatherIncentiveCents: finalFee.weatherIncentiveCentsUsed, peakIncentiveCents: finalFee.peakIncentiveCentsUsed,
    });
    // Delivery Budget Engine (Phase 4) — purely analytical, never blocks (rule 14 of the
    // Phase 4 spec). supplierFeeShareCents already includes supplierSubsidyCents; the
    // Supplier's pickup-leg contribution is passed separately so it correctly counts as
    // funding (see computeDeliveryBudget's pickupLegFeeCents doc) rather than producing a
    // false DEFICIT purely from the new leg's cost not being counted as funded.
    const budget = this.computeDeliveryBudget({
      cafeOwnerFeeShareCents: finalFee.cafeOwnerFeeShareCents, supplierFeeShareCents: finalFee.supplierFeeShareCents,
      bigBossSubsidyCents: finalFee.bigBossSubsidyCents, driverPayoutCents: payout.driverPayoutCents, companyPayoutCents: payout.companyPayoutCents,
      pickupLegFeeCents: finalFee.pickupLegFeeCents ?? 0,
    });

    // Delivery System V2 Phase 5A — the delivery-row freeze and the ledger entries it produces
    // must succeed or fail TOGETHER (rule 23 of the Phase 5A task: never "delivery assigned but
    // payout ledger entry missing", never the reverse) — wrapped in one DB transaction, the same
    // pattern updateDeliveryStatus already uses.
    const feeFinalizedAt = new Date();
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(deliveries)
        .set({
          status: 'ASSIGNED', driverId, assignedAt: feeFinalizedAt,
          // Delivery System V2 Phase 5B hardening — a DB-native atomic increment (never a
          // client-computed "current value + 1", which could race under true concurrent
          // calls) — see shared/schema.ts assignmentSequence doc.
          assignmentSequence: sql`${deliveries.assignmentSequence} + 1`,
          deliveryFee: finalFee.feeCents,
          cafeOwnerFeeShareCents: finalFee.cafeOwnerFeeShareCents,
          supplierFeeShareCents: finalFee.supplierFeeShareCents,
          freeDeliveryApplied: finalFee.freeDeliveryApplied,
          vehicleId: assignedVehicle?.id ?? null,
          vehicleType: finalFee.vehicleType,
          distanceKm: finalFee.distanceKm.toFixed(2),
          surgeMultiplierPermille: finalFee.surgeMultiplierPermille,
          // Delivery Pricing Factor Pipeline snapshot (Phase 1) — frozen here alongside the
          // rest of the fee, alongside feeFinalizedAt below, exactly like the pre-existing fields.
          pricePerKmCentsUsed: finalFee.pricePerKmCentsUsed,
          minFeeCentsUsed: finalFee.minFeeCentsUsed,
          baseFeeCents: finalFee.baseFeeCents,
          adjustedFeeCents: finalFee.adjustedFeeCents,
          weatherMultiplierPermilleUsed: finalFee.weatherMultiplierPermilleUsed,
          demandMultiplierPermilleUsed: finalFee.demandMultiplierPermilleUsed,
          peakHourMultiplierPermilleUsed: finalFee.peakHourMultiplierPermilleUsed,
          zoneMultiplierPermilleUsed: finalFee.zoneMultiplierPermilleUsed,
          waitingFeeCentsUsed: finalFee.waitingFeeCentsUsed,
          urgencySurchargeCentsUsed: finalFee.urgencySurchargeCentsUsed,
          // RouteEngine snapshot (Phase 2) — frozen here alongside the rest of the fee.
          roadDistanceKm: finalFee.roadDistanceKm.toFixed(2),
          estimatedDurationMinutes: finalFee.estimatedDurationMinutes,
          distanceSource: finalFee.distanceSource,
          // Two-Leg Delivery Distance Model — Leg 1 (driver → supplier) snapshot, frozen here
          // alongside everything else. Null when the driver's position wasn't known (see
          // computeDeliveryFee's driverPos guard) rather than an invented value.
          pickupLegDistanceKm: finalFee.pickupLegDistanceKm != null ? finalFee.pickupLegDistanceKm.toFixed(2) : null,
          pickupLegRoadDistanceKm: finalFee.pickupLegRoadDistanceKm != null ? finalFee.pickupLegRoadDistanceKm.toFixed(2) : null,
          pickupLegEstimatedDurationMinutes: finalFee.pickupLegEstimatedDurationMinutes,
          pickupLegDistanceSource: finalFee.pickupLegDistanceSource,
          pickupLegFeeCents: finalFee.pickupLegFeeCents,
          // Driver Payout Engine snapshot (Phase 3) — frozen here alongside the rest.
          driverPayoutSharePercentUsed: payout.driverPayoutSharePercentUsed,
          driverPayoutCents: payout.driverPayoutCents,
          companyPayoutCents: payout.companyPayoutCents,
          // Delivery System V2 Phase 4 snapshot — frozen here alongside everything else.
          weatherConditionUsed: finalFee.weatherConditionUsed,
          weatherIncentiveCentsUsed: finalFee.weatherIncentiveCentsUsed,
          zoneNameUsed: finalFee.zoneNameUsed,
          peakHourLabelUsed: finalFee.peakHourLabelUsed,
          peakIncentiveCentsUsed: finalFee.peakIncentiveCentsUsed,
          safetyStateUsed: finalFee.safetyStateUsed,
          supplierSubsidyCents: finalFee.supplierSubsidyCents,
          bigBossSubsidyCents: finalFee.bigBossSubsidyCents,
          budgetResultUsed: budget.result,
          budgetDeficitCentsUsed: budget.deficitCents,
          feeFinalizedAt,
        })
        .where(and(eq(deliveries.id, deliveryId), eq(deliveries.status, 'ACCEPTED'), ownerCondition))
        .returning();
      if (!row) throw new Error('Delivery is not assignable (not accepted by you, or already assigned)');

      // Delivery System V2 Phase 5A/5B — Financial Ledger. sourceReference is keyed by
      // row.assignmentSequence (now 1, the first successful assignment — see schema doc),
      // NOT by driverId — this is what lets reassignDriver (Phase 5B hardening) later void
      // this exact set and write a fresh one for assignment #2, #3, ... even when a later
      // reassignment returns to this SAME driver (A→B→A), without any idempotency-key
      // collision. See recordDeliveryFinancialEvents and reassignDriver's own call site.
      await this.recordDeliveryFinancialEvents({
        delivery: row, finalFee, payout, sourceEvent: 'ASSIGN_DRIVER', effectiveAt: feeFinalizedAt,
        sourceReference: `delivery:${row.id}:seq:${row.assignmentSequence}`,
      }, tx);

      return row;
    });
    return updated;
  }

  /**
   * Change the assigned driver before the delivery has physically started — same ownership
   * rules as assignDriver, but for a delivery already in ASSIGNED (has a driver, not yet
   * picked up). Deliberately does NOT touch ASSIGNED deliveries any other way and refuses
   * outright once PICKED_UP/IN_TRANSIT/DELIVERED — reassigning mid-handoff would corrupt the
   * pickup-code flow (the code was already read aloud to the original driver) and the
   * physical chain of custody. See task Part 32/33.
   */
  async reassignDriver(deliveryId: number, actingUser: { id: number; role: string }, newDriverId: number): Promise<Delivery> {
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!delivery) throw new Error('Delivery not found');
    if (delivery.status !== 'ASSIGNED') {
      throw new Error(delivery.status === 'ACCEPTED' ? 'Use the initial driver assignment for this delivery' : 'This delivery can no longer be reassigned — it has already been collected');
    }
    const [driver] = await db.select().from(users).where(eq(users.id, newDriverId));
    if (!driver || driver.role !== 'DRIVER') throw new Error('Invalid driver');

    let ownerCondition;
    if (delivery.deliveryMode === 'SUPPLIER') {
      if (actingUser.role !== 'SUPPLIER' || delivery.supplierId !== actingUser.id) throw new Error('Only the operating supplier can reassign this delivery');
      if (driver.supplierId !== actingUser.id) throw new Error('Driver does not belong to your supplier account');
      ownerCondition = eq(deliveries.supplierId, actingUser.id);
    } else {
      if (actingUser.role !== 'DELIVERY_COMPANY' || delivery.deliveryCompanyId !== actingUser.id) throw new Error('Only the accepting delivery company can reassign this delivery');
      if (driver.deliveryCompanyId !== actingUser.id) throw new Error('Driver does not belong to your company');
      ownerCondition = eq(deliveries.deliveryCompanyId, actingUser.id);
    }

    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, delivery.subOrderId));
    const assignedVehicle = await this.getVehicleForDriver(newDriverId);
    const pricingSettingsForReassign = await this.getDeliveryPricingSettings();
    const reassignCompatibility = this.checkDeliveryVehicleCompatibility({
      requiredVehicleType: subOrder?.requiredVehicleType as DeliveryVehicleType | null,
      totalWeightKg: subOrder?.totalWeightKg, totalVolumeL: subOrder?.totalVolumeL, numberOfPackages: subOrder?.numberOfPackages,
      vehicleType: assignedVehicle?.type as DeliveryVehicleType | null,
      vehicleCapacity: assignedVehicle?.type ? pricingSettingsForReassign.vehiclePricing?.[assignedVehicle.type as DeliveryVehicleType] : undefined,
    });
    if (!reassignCompatibility.compatible) throw new Error(reassignCompatibility.reason);
    const finalFee = await this.computeDeliveryFee({
      supplierId: delivery.supplierId,
      cafeId: delivery.cafeId,
      subtotalCents: subOrder?.subtotal ?? 0,
      supplierLocation: { lat: delivery.pickupAddress?.lat, lng: delivery.pickupAddress?.lng },
      cafeLocation: { lat: delivery.destinationAddress?.lat, lng: delivery.destinationAddress?.lng, details: delivery.destinationAddress?.details },
      driverLocation: { lat: driver.locationLat, lng: driver.locationLng },
      vehicleType: assignedVehicle?.type ?? null,
    });
    // Delivery Safety Engine (Phase 4) — same gate as assignDriver.
    if (finalFee.safetyStateUsed === 'SUSPEND') {
      throw new Error(`Deliveries are currently suspended due to weather conditions (${finalFee.weatherConditionUsed})`);
    }
    if (finalFee.safetyStateUsed === 'RESTRICT' && finalFee.vehicleType && finalFee.restrictedVehicleTypesUsed.includes(finalFee.vehicleType)) {
      throw new Error(`${finalFee.vehicleType} deliveries are currently restricted due to weather conditions (${finalFee.weatherConditionUsed}) — choose a different vehicle`);
    }
    // Two-Leg Delivery Distance Model — same combined-total rule as assignDriver.
    const reassignTotalTripFeeCents = finalFee.feeCents + (finalFee.pickupLegFeeCents ?? 0);
    const reassignPayout = this.computeDeliveryPayout({
      feeCents: reassignTotalTripFeeCents, deliveryMode: delivery.deliveryMode, driverPayoutSharePercent: pricingSettingsForReassign.driverPayoutSharePercent,
      weatherIncentiveCents: finalFee.weatherIncentiveCentsUsed, peakIncentiveCents: finalFee.peakIncentiveCentsUsed,
    });
    const reassignBudget = this.computeDeliveryBudget({
      cafeOwnerFeeShareCents: finalFee.cafeOwnerFeeShareCents, supplierFeeShareCents: finalFee.supplierFeeShareCents,
      bigBossSubsidyCents: finalFee.bigBossSubsidyCents, driverPayoutCents: reassignPayout.driverPayoutCents, companyPayoutCents: reassignPayout.companyPayoutCents,
      pickupLegFeeCents: finalFee.pickupLegFeeCents ?? 0,
    });

    // Delivery System V2 Phase 5B — Reassignment Accounting. previousDriverId is captured
    // BEFORE the update, from the row already read above — this is what makes Case C
    // ("reassigning to the same driver") and Case G ("retry after success") both safe: see
    // the ledger block below. isRealDriverChange gates BOTH the assignmentSequence increment
    // AND the ledger void+rewrite — a same-driver "reassignment" is a true no-op on both
    // (rule 3 Case C of the Phase 5B hardening task: never inflate the sequence for nothing
    // to actually reassign).
    const previousDriverId = delivery.driverId;
    const isRealDriverChange = previousDriverId !== newDriverId;
    const reassignedAt = new Date();
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(deliveries)
        .set({
          driverId: newDriverId, assignedAt: reassignedAt,
          // Delivery System V2 Phase 5B hardening — see shared/schema.ts assignmentSequence
          // doc. Only bumped on a REAL driver change — see isRealDriverChange above.
          ...(isRealDriverChange ? { assignmentSequence: sql`${deliveries.assignmentSequence} + 1` } : {}),
          deliveryFee: finalFee.feeCents,
          cafeOwnerFeeShareCents: finalFee.cafeOwnerFeeShareCents,
          supplierFeeShareCents: finalFee.supplierFeeShareCents,
          freeDeliveryApplied: finalFee.freeDeliveryApplied,
          vehicleId: assignedVehicle?.id ?? null,
          vehicleType: finalFee.vehicleType,
          distanceKm: finalFee.distanceKm.toFixed(2),
          surgeMultiplierPermille: finalFee.surgeMultiplierPermille,
          // Delivery Pricing Factor Pipeline snapshot (Phase 1) — see assignDriver's identical
          // block for the rationale; a reassignment before pickup re-freezes the fee the same way.
          pricePerKmCentsUsed: finalFee.pricePerKmCentsUsed,
          minFeeCentsUsed: finalFee.minFeeCentsUsed,
          baseFeeCents: finalFee.baseFeeCents,
          adjustedFeeCents: finalFee.adjustedFeeCents,
          weatherMultiplierPermilleUsed: finalFee.weatherMultiplierPermilleUsed,
          demandMultiplierPermilleUsed: finalFee.demandMultiplierPermilleUsed,
          peakHourMultiplierPermilleUsed: finalFee.peakHourMultiplierPermilleUsed,
          zoneMultiplierPermilleUsed: finalFee.zoneMultiplierPermilleUsed,
          waitingFeeCentsUsed: finalFee.waitingFeeCentsUsed,
          urgencySurchargeCentsUsed: finalFee.urgencySurchargeCentsUsed,
          // RouteEngine snapshot (Phase 2) — re-frozen here, same as assignDriver.
          roadDistanceKm: finalFee.roadDistanceKm.toFixed(2),
          estimatedDurationMinutes: finalFee.estimatedDurationMinutes,
          distanceSource: finalFee.distanceSource,
          // Two-Leg Delivery Distance Model — Leg 1 re-frozen here, same as assignDriver (the
          // new driver's own current position, since a reassignment changes who's collecting).
          pickupLegDistanceKm: finalFee.pickupLegDistanceKm != null ? finalFee.pickupLegDistanceKm.toFixed(2) : null,
          pickupLegRoadDistanceKm: finalFee.pickupLegRoadDistanceKm != null ? finalFee.pickupLegRoadDistanceKm.toFixed(2) : null,
          pickupLegEstimatedDurationMinutes: finalFee.pickupLegEstimatedDurationMinutes,
          pickupLegDistanceSource: finalFee.pickupLegDistanceSource,
          pickupLegFeeCents: finalFee.pickupLegFeeCents,
          // Driver Payout Engine snapshot (Phase 3) — re-frozen here, same as assignDriver.
          driverPayoutSharePercentUsed: reassignPayout.driverPayoutSharePercentUsed,
          driverPayoutCents: reassignPayout.driverPayoutCents,
          companyPayoutCents: reassignPayout.companyPayoutCents,
          // Delivery System V2 Phase 4 snapshot — re-frozen here, same as assignDriver.
          weatherConditionUsed: finalFee.weatherConditionUsed,
          weatherIncentiveCentsUsed: finalFee.weatherIncentiveCentsUsed,
          zoneNameUsed: finalFee.zoneNameUsed,
          peakHourLabelUsed: finalFee.peakHourLabelUsed,
          peakIncentiveCentsUsed: finalFee.peakIncentiveCentsUsed,
          safetyStateUsed: finalFee.safetyStateUsed,
          supplierSubsidyCents: finalFee.supplierSubsidyCents,
          bigBossSubsidyCents: finalFee.bigBossSubsidyCents,
          budgetResultUsed: reassignBudget.result,
          budgetDeficitCentsUsed: reassignBudget.deficitCents,
          feeFinalizedAt: reassignedAt,
        })
        .where(and(eq(deliveries.id, deliveryId), eq(deliveries.status, 'ASSIGNED'), ownerCondition))
        .returning();
      if (!row) throw new Error('Delivery could not be reassigned — it may have changed state concurrently');

      // Delivery System V2 Phase 5B — Reassignment Accounting (hardened against A→B→A).
      //
      // Case C (reassigning to the SAME driver already assigned) is a deliberate, explicit
      // no-op for the ledger: previousDriverId === newDriverId means no financial
      // responsibility actually changed hands, so nothing is voided and nothing new is
      // written, and assignmentSequence is NOT incremented (rule 3 Case C / rule 6c: "should
      // not generate unnecessary financial entries"). The delivery row above is still
      // re-frozen (unchanged existing behavior — Phase 5B does not alter reassignDriver's own
      // pricing/payout recomputation), but the ledger stays untouched in this specific case.
      //
      // Otherwise: the delivery's entire CURRENT set of CALCULATED ledger entries (written by
      // whichever of assignDriver or a PRIOR reassignDriver produced them — this naturally
      // chains correctly through Driver A → B → C → A, since each step only ever touches
      // whatever is CALCULATED right now) is voided — status-only, via the exact same
      // updateLedgerEntriesStatus method DELIVERED/CANCELLED already use, so the previous
      // driver's original entries are NEVER edited or deleted, only marked VOID. A full new
      // set is then written for the new driver, using the SAME recordDeliveryFinancialEvents
      // function assignDriver itself uses (never a duplicated formula), keyed by
      // row.assignmentSequence — NOT by driverId (the Phase 5B original design, which A→B→A
      // exposed: reassigning back to a driver used earlier in this SAME delivery's history
      // would collide with that driver's own prior, now-VOID entries under a driver-keyed
      // reference). The sequence is a monotonic counter bumped exactly once per REAL
      // transition (see isRealDriverChange above), so assignment #1/#2/#3/... always produce
      // DISTINCT idempotency keys even when the same driver recurs. Retrying the SAME
      // reassignment (Case G) stays idempotent for a different reason: the retry sees
      // newDriverId === the NOW-current driverId (the first attempt already committed), so it
      // falls into the Case C no-op above and never reaches this block at all — the sequence
      // is never double-incremented by a retry.
      if (isRealDriverChange) {
        await this.updateLedgerEntriesStatus(row.id, 'CALCULATED', 'VOID', tx);
        await this.recordDeliveryFinancialEvents({
          delivery: row, finalFee, payout: reassignPayout, sourceEvent: 'REASSIGN_DRIVER', effectiveAt: reassignedAt,
          sourceReference: `delivery:${row.id}:seq:${row.assignmentSequence}`,
        }, tx);
      }

      return row;
    });
    return updated;
  }

  /**
   * Driver-driven PICKED_UP → IN_TRANSIT → DELIVERED, or a CANCELLED intervention by the
   * owning Delivery Company / Admin. Validates the transition graph, role, and ownership,
   * then applies an atomic compare-and-swap. On DELIVERED, propagates the sub-order to
   * DELIVERED and re-runs the existing order aggregation — the fix for the one-way
   * sub-order→order desync (never the reverse) identified in the pre-implementation
   * analysis. On PICKED_UP/IN_TRANSIT, propagates the sub-order to IN_DELIVERY.
   */
  async updateDeliveryStatus(deliveryId: number, actingUser: { id: number; role: string }, newStatus: DeliveryStatus, code?: string): Promise<Delivery> {
    const [current] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!current) throw new Error('Delivery not found');

    const allowed = this.DELIVERY_TRANSITIONS[current.status as DeliveryStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot move a delivery from ${current.status} to ${newStatus}`);
    }

    const isDriverStep = ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(newStatus);
    if (isDriverStep) {
      if (actingUser.role !== 'DRIVER' || current.driverId !== actingUser.id) {
        throw new Error('Only the assigned driver can advance this delivery');
      }
    } else if (newStatus === 'CANCELLED') {
      const isOwningCompany = actingUser.role === 'DELIVERY_COMPANY' && current.deliveryCompanyId === actingUser.id;
      const isOwningSupplier = actingUser.role === 'SUPPLIER' && current.supplierId === actingUser.id;
      const isAdmin = actingUser.role === 'ADMIN' || actingUser.role === 'SUPER_ADMIN';
      if (!isOwningCompany && !isOwningSupplier && !isAdmin) {
        throw new Error('Only the operating supplier/delivery company or an admin can cancel this delivery');
      }
    }

    // Two-way confirmation codes gate the two "physical handoff" transitions. Only enforced
    // when the delivery actually has a code — deliveries created before this feature have
    // pickupCode/dropoffCode = null and remain code-exempt (see shared/schema.ts comment),
    // so an in-flight legacy delivery is never blocked by a code it was never given.
    if (newStatus === 'PICKED_UP' && current.pickupCode) {
      if (!code || code.trim() !== current.pickupCode) {
        throw new Error('Invalid confirmation code');
      }
    }
    if (newStatus === 'DELIVERED' && current.dropoffCode) {
      if (!code || code.trim() !== current.dropoffCode) {
        throw new Error('Invalid confirmation code');
      }
    }

    const timestampField: Partial<Record<DeliveryStatus, string>> = {
      PICKED_UP: 'pickedUpAt', IN_TRANSIT: 'inTransitAt', DELIVERED: 'deliveredAt', CANCELLED: 'cancelledAt',
    };
    const updates: any = { status: newStatus };
    const field = timestampField[newStatus];
    const pickedUpAtForWaiting = new Date();
    if (field) updates[field] = newStatus === 'PICKED_UP' ? pickedUpAtForWaiting : new Date();

    // Delivery System V2 Phase 4 — Waiting Time Pricing Engine, computed and frozen ONCE,
    // right here at the PICKED_UP transition — a separate, later write from the rest of the
    // pricing/payout snapshot (which froze at ASSIGNED, before any real waiting could exist —
    // see shared/schema.ts's arrivedAtPickupAt doc). Only runs when the driver actually used
    // the "arrived at pickup" capture (see recordArrivedAtPickup) — a delivery that never
    // captured an arrival simply never bills waiting, exactly the neutral default rule 2 of
    // the Phase 4 spec requires. deliveryFee/driverPayoutCents/companyPayoutCents/
    // feeFinalizedAt above are NEVER touched by this block.
    if (newStatus === 'PICKED_UP' && current.arrivedAtPickupAt) {
      const waitingMinutes = (pickedUpAtForWaiting.getTime() - new Date(current.arrivedAtPickupAt).getTime()) / 60000;
      const waitingSettings = await this.getDeliveryPricingSettings();
      const waiting = this.computeWaitingFee(waitingMinutes, waitingSettings);
      updates.waitingMinutesBilled = waiting.billableMinutes;
      updates.waitingCustomerFeeCentsUsed = waiting.customerFeeCents;
      updates.waitingDriverCompensationCentsUsed = waiting.driverCompensationCents;
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(deliveries)
        .set(updates)
        .where(and(eq(deliveries.id, deliveryId), eq(deliveries.status, current.status)))
        .returning();
      if (!row) throw new Error('Delivery status changed concurrently — please retry');

      // Delivery status drives the customer-facing sub-order/order status — never the
      // other way around, and never by writing orders.status directly (that recreates the
      // exact desync the pre-implementation analysis found).
      if (newStatus === 'PICKED_UP' || newStatus === 'IN_TRANSIT') {
        await tx.update(subOrders).set({ status: 'IN_DELIVERY' }).where(eq(subOrders.id, row.subOrderId));
        await this.facade.recomputeOrderAggregateStatus(row.orderId, tx);
      } else if (newStatus === 'DELIVERED') {
        await tx.update(subOrders).set({ status: 'DELIVERED' }).where(eq(subOrders.id, row.subOrderId));
        await this.facade.recomputeOrderAggregateStatus(row.orderId, tx);
      }
      // CANCELLED intentionally does NOT touch the sub-order — the supplier's own READY
      // sub-order is unaffected by a courier-side cancellation; a new Delivery can be
      // created for it later (the partial unique index allows this).

      // Delivery System V2 Phase 5A — Financial Ledger.
      if (newStatus === 'PICKED_UP' && row.waitingDriverCompensationCentsUsed && row.waitingDriverCompensationCentsUsed > 0 && row.driverId) {
        // WAITING_COMPENSATION — same counterparty rule as DRIVER_PAYOUT (never BigBoss): the
        // Supplier is responsible, since only supplier-pickup waiting is modeled today (see
        // computeWaitingFee's doc). Written only when a real, non-zero amount was actually
        // billed — matches "only when the existing waiting system actually captures/bills it"
        // (rule 9 of the Phase 5A task).
        await this.createFinancialLedgerEntry({
          orderId: row.orderId, subOrderId: row.subOrderId, deliveryId: row.id,
          entryType: 'WAITING_COMPENSATION', actorRole: 'DRIVER', actorUserId: row.driverId,
          counterpartyRole: row.deliveryMode === 'DELIVERY_COMPANY' ? 'DELIVERY_COMPANY' : 'SUPPLIER',
          counterpartyUserId: row.deliveryMode === 'DELIVERY_COMPANY' ? row.deliveryCompanyId : row.supplierId,
          amountCents: row.waitingDriverCompensationCentsUsed, direction: 'CREDIT',
          description: `Driver waiting compensation — ${row.waitingMinutesBilled ?? 0} billable minute(s)`,
          sourceEvent: 'PICKUP_WAITING', sourceReference: `delivery:${row.id}`, effectiveAt: pickedUpAtForWaiting,
        }, tx);
      } else if (newStatus === 'DELIVERED') {
        // The delivery's economic facts are now confirmed complete — matches the existing
        // derived payoutStatus='EARNED' semantics exactly (Phase 3), now given a real,
        // queryable ledger status. Status-only transition — see updateLedgerEntriesStatus doc.
        await this.updateLedgerEntriesStatus(row.id, 'CALCULATED', 'AUTHORIZED', tx);
        // Delivery System V2 Phase 5C.1 — Settlement Foundation. Same transaction as the
        // AUTHORIZED transition above: settlement calculation reads ONLY entries already at
        // AUTHORIZED (see calculateDeliverySettlement's doc), so it must run after that write,
        // and atomically with it — a settlement can never be calculated from entries that
        // haven't actually been confirmed complete yet.
        await this.facade.calculateDeliverySettlement(row.id, tx);
        // Delivery System V2 Phase 5C.2 — COD Reconciliation. Same transaction, same trigger
        // point as settlement — but structurally independent (a non-COD order's DELIVERED
        // transition simply creates nothing here, per createCodReconciliationIfApplicable's
        // own order.paymentMethod guard).
        await this.facade.createCodReconciliationIfApplicable(row, tx);
      } else if (newStatus === 'CANCELLED') {
        // Matches the existing derived payoutStatus='VOID' semantics exactly (Phase 3) — a
        // cancelled delivery's calculated economics never became real. Status-only transition;
        // the underlying amountCents/direction/actor fields are never touched (see
        // docs/bigboss-delivery-financial-ledger.md — cancellation compensation itself is NOT
        // implemented in Phase 5A, since the current system doesn't calculate it yet — rule 9
        // of the Phase 5A task: "if not yet implemented, do NOT invent it").
        await this.updateLedgerEntriesStatus(row.id, 'CALCULATED', 'VOID', tx);
      }

      return row;
    });

    return updated;
  }

  /**
   * Delivery System V2 Phase 4 — Waiting Time Pricing Engine capture. A minimal, additive
   * timestamp stamp — deliberately NOT a new delivery status/transition (rule: "do not change
   * existing delivery statuses" of the Phase 4 spec) and NOT itself a financial event; the fee
   * is computed later, once, at the PICKED_UP transition (see updateDeliveryStatus). Only the
   * assigned driver may call this, only while the delivery is ASSIGNED (before they've
   * actually collected it), and it is idempotent — calling it again after it's already set
   * does nothing, so a driver double-tapping cannot manipulate the billed waiting window.
   * Only the SUPPLIER-pickup-waiting scenario is modeled today (see schema doc) —
   * customer/dropoff-side waiting is not implemented (see the Phase 4 report).
   */
  async recordArrivedAtPickup(deliveryId: number, actingUser: { id: number; role: string }): Promise<Delivery> {
    const [current] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!current) throw new Error('Delivery not found');
    if (actingUser.role !== 'DRIVER' || current.driverId !== actingUser.id) {
      throw new Error('Only the assigned driver can record arrival at pickup');
    }
    if (current.status !== 'ASSIGNED') {
      throw new Error('Arrival can only be recorded while the delivery is assigned and not yet collected');
    }
    if (current.arrivedAtPickupAt) return current; // idempotent — already recorded, no-op
    const [updated] = await db.update(deliveries)
      .set({ arrivedAtPickupAt: new Date() })
      .where(and(eq(deliveries.id, deliveryId), eq(deliveries.status, 'ASSIGNED'), isNull(deliveries.arrivedAtPickupAt)))
      .returning();
    if (!updated) throw new Error('Delivery state changed concurrently — please retry');
    return updated;
  }

  /**
   * Driver roster for either kind of operator. A DRIVER belongs to exactly one owner
   * (users.deliveryCompanyId XOR users.supplierId, enforced by a DB CHECK constraint — see
   * shared/schema.ts) so this single method serves both the Delivery Company "Drivers" page
   * and the Supplier "Drivers" tab without a second Driver system.
   */
  async getDriversForOwner(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', ownerId: number): Promise<User[]> {
    const ownerCondition = ownerType === 'SUPPLIER' ? eq(users.supplierId, ownerId) : eq(users.deliveryCompanyId, ownerId);
    return db.select().from(users).where(and(eq(users.role, 'DRIVER'), ownerCondition));
  }

  /**
   * Delivery System V2 Phase 3 — combined Delivery Dispatch Engine + Driver Offer Engine.
   *
   * A read-only recommendation/information layer sitting IN FRONT of the existing
   * assignDriver/reassignDriver flow (rule 9 of the Phase 3 task: "do not automatically
   * replace existing assignment... DispatchEngine validation/recommendation, then existing
   * assignment flow"). It never assigns anything itself — it reuses getDriversForOwner (the
   * exact roster query the assignment UI already needs) and annotates each driver with the
   * SAME checkDeliveryVehicleCompatibility result assignDriver itself enforces (rule 10: "do
   * not duplicate compatibility logic"), plus a provisional expected payout so a
   * Supplier/Delivery Company can make an informed choice, and so a driver can eventually be
   * shown the exact same offer information (pickup/destination/distance/vehicle requirement/
   * weight/volume/packages/fragility/special handling/estimated duration/payout — rule 11)
   * before any assignment decision is made (rule 13: payout visible before acceptance).
   *
   * expectedPayoutCents is a PREVIEW only, computed from the delivery's current (possibly
   * still-provisional) deliveryFee — never authoritative. assignDriver/reassignDriver
   * recompute and freeze the real, final payout exactly as before; this method changes
   * nothing about that.
   *
   * Ownership mirrors assignDriver's own checks exactly (same rules, not a second set) — a
   * Supplier can only inspect its own SUPPLIER-mode deliveries, a Delivery Company only its
   * own accepted deliveries, never a delivery belonging to another owner (rule 7/15/16: "a
   * company/supplier must never assign another company's/supplier's driver" — this read-only
   * preview follows the identical boundary).
   */
  async getAssignableDriversForDelivery(deliveryId: number, actingUser: { id: number; role: string }): Promise<{
    delivery: {
      pickupAddress: GeoLocation; destinationAddress: GeoLocation | null;
      distanceKm: string | null; roadDistanceKm: string | null; estimatedDurationMinutes: number | null;
      requiredVehicleType: DeliveryVehicleType | null;
      totalWeightKg: string | null; totalVolumeL: string | null; numberOfPackages: number | null; numberOfItems: number | null;
      isFragile: boolean; specialHandling: string | null;
    };
    drivers: Array<{ id: number; name: string; phone: string | null; vehicleType: DeliveryVehicleType | null; compatible: boolean; reason?: string; expectedPayoutCents: number }>;
  }> {
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!delivery) throw new Error('Delivery not found');
    let ownerType: 'SUPPLIER' | 'DELIVERY_COMPANY';
    let ownerId: number;
    if (delivery.deliveryMode === 'SUPPLIER') {
      if (actingUser.role !== 'SUPPLIER' || delivery.supplierId !== actingUser.id) {
        if (actingUser.role !== 'ADMIN' && actingUser.role !== 'SUPER_ADMIN') throw new Error('Forbidden');
      }
      ownerType = 'SUPPLIER'; ownerId = delivery.supplierId;
    } else if (delivery.deliveryMode === 'DELIVERY_COMPANY') {
      if (actingUser.role !== 'DELIVERY_COMPANY' || delivery.deliveryCompanyId !== actingUser.id) {
        if (actingUser.role !== 'ADMIN' && actingUser.role !== 'SUPER_ADMIN') throw new Error('Forbidden');
      }
      if (!delivery.deliveryCompanyId) throw new Error('This delivery has not been accepted by a delivery company yet');
      ownerType = 'DELIVERY_COMPANY'; ownerId = delivery.deliveryCompanyId;
    } else {
      throw new Error('This delivery has not been dispatched yet');
    }

    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, delivery.subOrderId));
    const settings = await this.getDeliveryPricingSettings();
    const roster = await this.getDriversForOwner(ownerType, ownerId);
    const drivers = await Promise.all(roster.map(async (driver) => {
      const vehicle = await this.getVehicleForDriver(driver.id);
      const compatibility = this.checkDeliveryVehicleCompatibility({
        requiredVehicleType: subOrder?.requiredVehicleType as DeliveryVehicleType | null,
        totalWeightKg: subOrder?.totalWeightKg, totalVolumeL: subOrder?.totalVolumeL, numberOfPackages: subOrder?.numberOfPackages,
        vehicleType: vehicle?.type as DeliveryVehicleType | null,
        vehicleCapacity: vehicle?.type ? settings.vehiclePricing?.[vehicle.type as DeliveryVehicleType] : undefined,
      });
      const payoutPreview = this.computeDeliveryPayout({
        feeCents: delivery.deliveryFee, deliveryMode: delivery.deliveryMode, driverPayoutSharePercent: settings.driverPayoutSharePercent,
      });
      return {
        id: driver.id, name: driver.name, phone: driver.phone,
        vehicleType: (vehicle?.type as DeliveryVehicleType | undefined) ?? null,
        compatible: compatibility.compatible, reason: compatibility.reason,
        expectedPayoutCents: payoutPreview.driverPayoutCents,
      };
    }));

    return {
      delivery: {
        pickupAddress: delivery.pickupAddress, destinationAddress: delivery.destinationAddress ?? null,
        distanceKm: delivery.distanceKm, roadDistanceKm: delivery.roadDistanceKm, estimatedDurationMinutes: delivery.estimatedDurationMinutes,
        requiredVehicleType: (subOrder?.requiredVehicleType as DeliveryVehicleType | null) ?? null,
        totalWeightKg: subOrder?.totalWeightKg ?? null, totalVolumeL: subOrder?.totalVolumeL ?? null,
        numberOfPackages: subOrder?.numberOfPackages ?? null, numberOfItems: subOrder?.numberOfItems ?? null,
        isFragile: subOrder?.isFragile ?? false, specialHandling: subOrder?.specialHandling ?? null,
      },
      drivers,
    };
  }

  /** Same core Driver account information architecture regardless of who creates the
   *  account — Admin's Add User (name/email/password/phone/isWhatsapp/profileImageUrl),
   *  a Delivery Company's Add Driver, or a Supplier's Add Driver all produce the exact same
   *  shape of DRIVER user row. Never a different/inconsistent Driver schema per creator. */
  async createDriverForOwner(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', ownerId: number, data: { name: string; email: string; password: string; phone?: string | null; isWhatsapp?: boolean; profileImageUrl?: string | null }): Promise<User> {
    const existing = await this.facade.getUserByEmail(data.email);
    if (existing) throw new Error('Email already exists');
    return this.facade.createUser({
      name: data.name,
      email: data.email,
      password: data.password,
      role: 'DRIVER',
      status: 'approved', // vetted by the owning operator, not the platform admin
      phone: data.phone ?? null,
      isWhatsapp: !!data.isWhatsapp,
      profileImageUrl: data.profileImageUrl?.trim() || null,
      deliveryCompanyId: ownerType === 'DELIVERY_COMPANY' ? ownerId : null,
      supplierId: ownerType === 'SUPPLIER' ? ownerId : null,
    } as any);
  }

  /** The current active (non-CANCELLED) delivery for a sub-order, if any. Used by route
   * handlers to know whether/what to broadcast right after a status transition. */
  async getActiveDeliveryForSubOrder(subOrderId: number): Promise<Delivery | undefined> {
    const rows = await db.select().from(deliveries).where(eq(deliveries.subOrderId, subOrderId));
    return rows.find((d) => d.status !== 'CANCELLED');
  }

  async getApprovedDeliveryCompanyIds(): Promise<number[]> {
    const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'DELIVERY_COMPANY'), eq(users.status, 'approved')));
    return rows.map((r) => r.id);
  }

  /**
   * Vehicle compatibility (Delivery System V2) — a sub-order's optional supplier-declared
   * requiredVehicleType against a driver's own registered vehicle. Ordinal capacity check
   * (a larger vehicle always satisfies a smaller requirement), not exact match, since a
   * supplier who only says "at least a car" is still well served by a van. OTHER is treated
   * as a wildcard in both directions — an unclassified/custom vehicle is never blocked, and
   * a requirement of OTHER is satisfied by anything — since this project deliberately does
   * not hard-code weight/volume-driven thresholds (see FULL DELIVERY SYSTEM ANALYSIS.md §19).
   * No requirement set (null) always passes — every existing order without this new field
   * keeps working exactly as before.
   */
  private static readonly VEHICLE_CAPACITY_RANK: Record<string, number> = {
    BICYCLE: 1, MOTO: 2, CAR: 3, VAN: 4, TRUCK: 5,
  };
  private isVehicleCompatible(required: DeliveryVehicleType | null | undefined, actual: DeliveryVehicleType | null | undefined): boolean {
    if (!required) return true;
    if (!actual) return false;
    if (required === 'OTHER' || actual === 'OTHER') return true;
    const requiredRank = DeliveryStorage.VEHICLE_CAPACITY_RANK[required] ?? 0;
    const actualRank = DeliveryStorage.VEHICLE_CAPACITY_RANK[actual] ?? 0;
    return actualRank >= requiredRank;
  }

  /**
   * Delivery System V2 Phase 2 — Delivery Requirement Engine.
   *
   * Deterministic, advisory-only helper: given a sub-order's numeric transport requirements
   * and Admin's per-vehicle capacity configuration (deliveryPricingSettings.vehiclePricing[*].
   * maxWeightKg/maxVolumeL/maxPackages), returns the smallest vehicle type (by the existing
   * ordinal VEHICLE_CAPACITY_RANK) whose configured capacity covers every requirement that was
   * actually provided. Deliberately does NOT auto-set subOrders.requiredVehicleType — that
   * field stays 100% supplier-editable, exactly as before this phase (see
   * updateSubOrderTransportRequirements) — a supplier's own judgment about how they'll pack an
   * order is not overridden. This is a pure suggestion a caller MAY surface, never a write.
   *
   * Returns null when: no requirement was provided at all, OR no vehicle type has ANY capacity
   * configured for a dimension that was provided (Admin hasn't set up capacities yet — the
   * neutral "cannot determine" answer, never an invented one; see rule 3/5/28 of the Phase 2
   * task). A vehicle type with some capacity fields set and others unset is only evaluated on
   * the fields it does have configured — an unconfigured dimension never disqualifies it.
   */
  private determineRequiredVehicleType(
    requirements: { totalWeightKg?: string | number | null; totalVolumeL?: string | number | null; numberOfPackages?: number | null },
    vehiclePricing: Record<DeliveryVehicleType, { maxWeightKg?: number; maxVolumeL?: number; maxPackages?: number }>,
  ): DeliveryVehicleType | null {
    const weightKg = requirements.totalWeightKg != null ? Number(requirements.totalWeightKg) : null;
    const volumeL = requirements.totalVolumeL != null ? Number(requirements.totalVolumeL) : null;
    const packages = requirements.numberOfPackages ?? null;
    if (weightKg === null && volumeL === null && packages === null) return null;

    const candidates = (Object.keys(DeliveryStorage.VEHICLE_CAPACITY_RANK) as DeliveryVehicleType[])
      .sort((a, b) => DeliveryStorage.VEHICLE_CAPACITY_RANK[a] - DeliveryStorage.VEHICLE_CAPACITY_RANK[b]);

    let anyCapacityConfigured = false;
    for (const type of candidates) {
      const cap = vehiclePricing?.[type];
      if (!cap) continue;
      if (cap.maxWeightKg === undefined && cap.maxVolumeL === undefined && cap.maxPackages === undefined) continue;
      anyCapacityConfigured = true;
      const weightOk = weightKg === null || cap.maxWeightKg === undefined || weightKg <= cap.maxWeightKg;
      const volumeOk = volumeL === null || cap.maxVolumeL === undefined || volumeL <= cap.maxVolumeL;
      const packagesOk = packages === null || cap.maxPackages === undefined || packages <= cap.maxPackages;
      if (weightOk && volumeOk && packagesOk) return type;
    }
    return anyCapacityConfigured ? 'TRUCK' /* largest existing type — nothing smaller fits, largest is the honest answer */ : null;
  }

  /**
   * Delivery System V2 Phase 2 — Vehicle Compatibility Engine.
   *
   * Extends the pre-existing ordinal isVehicleCompatible() check (unchanged, still the first
   * gate) with an OPTIONAL capacity check: a sub-order's weight/volume/package requirements
   * against the CANDIDATE vehicle's own configured capacity (not the required type's) —
   * matching the task's rule 6 ("driverVehicleType, requiredVehicleType, AND where available
   * weight/volume/packages"). Exactly like isVehicleCompatible, an unset requirement or an
   * unset capacity is always neutral (never blocks) — capacity enforcement only activates once
   * BOTH sides of a specific dimension are configured, so every existing sub-order/vehicle
   * (none of which set these new optional fields) is completely unaffected.
   *
   * Fragility/specialHandling are deliberately NOT enforced here: no per-vehicle
   * fragility/special-handling compatibility flag exists anywhere in this codebase (see
   * delivery-v2-proposal.md §6), and inventing one would be exactly the kind of arbitrary
   * business assumption rule 28 forbids. Both fields remain informational/display-only, same
   * as before this phase — see the Phase 2 final report's "missing business decision" note.
   */
  private checkDeliveryVehicleCompatibility(params: {
    requiredVehicleType: DeliveryVehicleType | null | undefined;
    totalWeightKg?: string | null;
    totalVolumeL?: string | null;
    numberOfPackages?: number | null;
    vehicleType: DeliveryVehicleType | null | undefined;
    vehicleCapacity?: { maxWeightKg?: number; maxVolumeL?: number; maxPackages?: number };
  }): { compatible: boolean; reason?: string } {
    if (!this.isVehicleCompatible(params.requiredVehicleType, params.vehicleType)) {
      return {
        compatible: false,
        reason: `This order requires a ${params.requiredVehicleType} — the selected driver's vehicle (${params.vehicleType ?? 'none registered'}) is not compatible`,
      };
    }
    const weightKg = params.totalWeightKg != null ? Number(params.totalWeightKg) : null;
    const cap = params.vehicleCapacity;
    if (weightKg !== null && cap?.maxWeightKg !== undefined && weightKg > cap.maxWeightKg) {
      return { compatible: false, reason: `This order requires ${weightKg}kg of capacity — the selected vehicle's configured maximum is ${cap.maxWeightKg}kg` };
    }
    const volumeL = params.totalVolumeL != null ? Number(params.totalVolumeL) : null;
    if (volumeL !== null && cap?.maxVolumeL !== undefined && volumeL > cap.maxVolumeL) {
      return { compatible: false, reason: `This order requires ${volumeL}L of capacity — the selected vehicle's configured maximum is ${cap.maxVolumeL}L` };
    }
    if (params.numberOfPackages != null && cap?.maxPackages !== undefined && params.numberOfPackages > cap.maxPackages) {
      return { compatible: false, reason: `This order requires capacity for ${params.numberOfPackages} packages — the selected vehicle's configured maximum is ${cap.maxPackages}` };
    }
    return { compatible: true };
  }

  /**
   * Pre-checkout delivery estimate (Delivery System V2) — the SAME pricing engine used at
   * real delivery creation, just called before an order/sub-order exists yet, with no driver
   * known (identical shape to createDeliveryForSubOrder's own provisional estimate). This is
   * explicitly an ESTIMATE, never persisted: the real, authoritative fee is still computed
   * fresh at READY and frozen at driver assignment, exactly as before — this method changes
   * nothing about that flow. SELF_PICKUP is not this method's concern; callers must not call
   * it for a self-pickup cart (the route enforces this).
   *
   * Delivery System V2 Phase 4 — Weather/Peak/Zone are resolved from the SAME global
   * settings computeDeliveryFee itself reads, so an estimate already reflects them exactly
   * like the real computation (rule 19 of the Phase 4 spec: "must use the same pricing
   * pipeline"). What CANNOT be known yet at estimate time: the driver→supplier leg of the
   * route (no driver assigned), and Waiting (depends on a future pickup event) — both are
   * therefore provisional/absent here exactly as they already were before Phase 4, and this
   * is why an estimate can still differ from the frozen final fee: a real driver's distance
   * leg, and any later-billed waiting time, neither of which existed to estimate.
   */
  async estimateDeliveryFee(params: {
    supplierId: number;
    subtotalCents: number;
    cafeLocation: { lat?: string | null; lng?: string | null; details?: { governorate?: string } | null } | null;
  }): Promise<{ estimatedFeeCents: number; estimatedCafeOwnerCents: number; vehicleType: DeliveryVehicleType; distanceKm: number; freeDeliveryApplied: boolean }> {
    const [supplier] = await db.select().from(users).where(eq(users.id, params.supplierId));
    const estimate = await this.computeDeliveryFee({
      supplierId: params.supplierId,
      cafeId: 0, // no real cafeId yet — resolveSupplierSubsidy's eligibleCafeIds check simply
                 // won't match a promotion scoped to specific cafés, which is the correct
                 // conservative behavior for a not-yet-placed order (never overstate an
                 // estimate as subsidized when eligibility can't yet be confirmed).
      subtotalCents: params.subtotalCents,
      supplierLocation: supplier ? { lat: supplier.locationLat, lng: supplier.locationLng } : null,
      cafeLocation: params.cafeLocation,
      // No driver yet — same provisional (supplier→cafe leg only) shape as delivery creation.
    });
    return {
      estimatedFeeCents: estimate.feeCents,
      estimatedCafeOwnerCents: estimate.cafeOwnerFeeShareCents,
      vehicleType: estimate.vehicleType,
      distanceKm: estimate.distanceKm,
      freeDeliveryApplied: estimate.freeDeliveryApplied,
    };
  }

  /**
   * Supplier-declared transport requirements for their own sub-order (Delivery System V2).
   * Purely informational/compatibility-gating today (see isVehicleCompatible) — never used
   * to auto-derive a vehicle or auto-adjust pricing. Only the owning supplier may set these,
   * and only while their sub-order hasn't finished (no point changing requirements after
   * delivery). Any field omitted (undefined) is left unchanged.
   */
  async updateSubOrderTransportRequirements(subOrderId: number, supplierId: number, updates: {
    requiredVehicleType?: DeliveryVehicleType | null;
    totalWeightKg?: string | null;
    totalVolumeL?: string | null;
    numberOfPackages?: number | null;
    numberOfItems?: number | null;
    isFragile?: boolean;
    specialHandling?: string | null;
  }): Promise<SubOrder> {
    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!subOrder) throw new Error('SubOrder not found');
    if (subOrder.supplierId !== supplierId) throw new Error('Forbidden');
    // Locked once the order reaches "Out for Delivery" (IN_DELIVERY — the exact existing
    // sub_orders.status value set by updateDeliveryStatus at PICKED_UP/IN_TRANSIT, see
    // components/order/order-progress.tsx's ORDER_PROGRESS_STAGES for the same mapping the
    // Supplier's own UI already renders) or later (DELIVERED/CANCELLED) — the driver is
    // already underway with the requirements as they stood at pickup, so a later edit could
    // silently diverge from what the driver/vehicle was actually matched against. Server-side
    // enforcement so the Supplier cannot bypass the UI-only restriction via a direct API call.
    if (['IN_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(subOrder.status)) throw new Error('Transport requirements can no longer be edited once the order is out for delivery');
    const [updated] = await db.update(subOrders).set(updates as any).where(eq(subOrders.id, subOrderId)).returning();
    return updated;
  }

  /**
   * Delivery System V2 Phase 2 — public wrapper around determineRequiredVehicleType, exposed
   * so a caller (e.g. the transport-requirements route) can surface a SUGGESTED vehicle type
   * alongside the supplier's own manually-set requiredVehicleType. Advisory only — see
   * determineRequiredVehicleType's doc for why this never auto-writes anything.
   */
  async suggestRequiredVehicleType(requirements: { totalWeightKg?: string | null; totalVolumeL?: string | null; numberOfPackages?: number | null }): Promise<DeliveryVehicleType | null> {
    const settings = await this.getDeliveryPricingSettings();
    return this.determineRequiredVehicleType(requirements, settings.vehiclePricing);
  }
  // ══════════════════════════════════════════════════════════════════════════════════════
  // Delivery Pricing Engine — consolidated from delivery-pricing.storage.ts (Batch 24).
  // haversineKm/parseLatLng below are duplicated (not shared) with ~30 unrelated
  // marketplace-proximity-sorting methods in other provider domains (Barista/Academy/Print/
  // Maintenance/Marketing) — see that file's original header for why.
  // ══════════════════════════════════════════════════════════════════════════════════════
  // ── Delivery Pricing Settings ────────────────────────────────────────────
  async getDeliveryPricingSettings(): Promise<DeliveryPricingSettings> {
    const [row] = await db.select().from(deliveryPricingSettings).limit(1);
    if (row) return row;
    // Seeded from the exact example figures given when this pricing model was specified
    // (Moto 0.5 DT/km, min 3 DT; Car 1 DT/km, min 5 DT) so the system is immediately
    // functional instead of silently showing 0.00 again — Admin can change every value.
    const seed = {
      BICYCLE: { pricePerKmCents: 30, minFeeCents: 150 },
      MOTO: { pricePerKmCents: 50, minFeeCents: 300 },
      CAR: { pricePerKmCents: 100, minFeeCents: 500 },
      VAN: { pricePerKmCents: 150, minFeeCents: 800 },
      TRUCK: { pricePerKmCents: 250, minFeeCents: 1500 },
      OTHER: { pricePerKmCents: 50, minFeeCents: 300 },
    };
    const [created] = await db.insert(deliveryPricingSettings).values({ vehiclePricing: seed as any }).onConflictDoNothing().returning();
    if (created) return created;
    const [existing] = await db.select().from(deliveryPricingSettings).limit(1);
    return existing!;
  }

  async updateDeliveryPricingSettings(updates: Partial<{
    vehiclePricing: Record<DeliveryVehicleType, { pricePerKmCents: number; minFeeCents: number; maxWeightKg?: number; maxVolumeL?: number; maxPackages?: number }>;
    defaultVehicleType: DeliveryVehicleType;
    surgeMultiplierPermille: number;
    surgeLabel: string;
    cafeOwnerSharePercent: number;
    driverPayoutSharePercent: number;
    // Delivery System V2 Phase 4
    activeWeatherCondition: string;
    weatherConditionConfigs: Record<string, { customerMultiplierPermille?: number; driverIncentiveCents?: number; safetyState?: 'ALLOW' | 'ALLOW_WITH_WARNING' | 'RESTRICT' | 'SUSPEND'; restrictedVehicleTypes?: DeliveryVehicleType[] }>;
    peakHourWindows: Array<{ id: string; label: string; daysOfWeek: number[]; startTime: string; endTime: string; customerMultiplierPermille: number; driverIncentiveCents: number; isActive: boolean }>;
    zones: Array<{ id: string; name: string; governorateMatch: string; multiplierPermille?: number; minFeeOverrideCents?: number; isActive: boolean }>;
    waitingFreeMinutes: number;
    waitingPricePerMinuteCents: number;
    waitingDriverCompensationPerMinuteCents: number;
    waitingMaxChargeCents: number | null;
    maxCombinedMultiplierPermille: number;
  }>): Promise<DeliveryPricingSettings> {
    const current = await this.getDeliveryPricingSettings();
    const next = {
      ...updates,
      cafeOwnerSharePercent: updates.cafeOwnerSharePercent !== undefined
        ? Math.max(0, Math.min(100, Math.round(updates.cafeOwnerSharePercent)))
        : undefined,
      driverPayoutSharePercent: updates.driverPayoutSharePercent !== undefined
        ? Math.max(0, Math.min(100, Math.round(updates.driverPayoutSharePercent)))
        : undefined,
      surgeMultiplierPermille: updates.surgeMultiplierPermille !== undefined
        ? Math.max(0, Math.round(updates.surgeMultiplierPermille))
        : undefined,
      waitingFreeMinutes: updates.waitingFreeMinutes !== undefined ? Math.max(0, Math.round(updates.waitingFreeMinutes)) : undefined,
      waitingPricePerMinuteCents: updates.waitingPricePerMinuteCents !== undefined ? Math.max(0, Math.round(updates.waitingPricePerMinuteCents)) : undefined,
      waitingDriverCompensationPerMinuteCents: updates.waitingDriverCompensationPerMinuteCents !== undefined ? Math.max(0, Math.round(updates.waitingDriverCompensationPerMinuteCents)) : undefined,
      maxCombinedMultiplierPermille: updates.maxCombinedMultiplierPermille !== undefined ? Math.max(1000, Math.round(updates.maxCombinedMultiplierPermille)) : undefined,
    };
    const [updated] = await db.update(deliveryPricingSettings)
      .set({ ...next, updatedAt: new Date() } as any)
      .where(eq(deliveryPricingSettings.id, current.id))
      .returning();
    return updated;
  }

  // ── Shared geo helpers (duplicated, not moved — see file header) ────────
  private haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  private parseLatLng(loc?: { lat?: string | null; lng?: string | null } | null): { lat: number; lng: number } | null {
    if (!loc?.lat || !loc?.lng) return null;
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  }

  /**
   * Delivery System V2 Phase 2 — Route Engine.
   *
   * A provider abstraction over "how far apart are these two points, and how long would it
   * take" (see delivery-v2-proposal.md §3.13/§12-14). The only implementation today is the
   * haversine FALLBACK — no real routing provider (Google Directions / Mapbox / OSRM) is wired
   * up, since that would require API credentials this project does not have, and Phase 2 does
   * not introduce that dependency without an explicit decision to do so (see rule 13/28 of the
   * Phase 2 task and the Phase 2 final report). Every distance this method returns is
   * numerically IDENTICAL to what haversineKm always computed — wiring computeDeliveryFee's
   * distance calculation through this method therefore changes nothing about today's pricing
   * (see the Phase 1 regression suite, re-run and still passing after this change).
   *
   * estimatedDurationMinutes is always null in the fallback: turning a distance into an ETA
   * requires an assumed average speed (per vehicle type — see the proposal's
   * VehicleModel.speedFactor), which is a genuine business decision that does not exist
   * anywhere in this codebase yet. This method deliberately does not invent one — see rule 28
   * ("do not invent a production value"). It stays null until a real provider or an
   * Admin-configured speed model supplies a non-invented value.
   */
  private getRoute(
    a: { lat: number; lng: number } | null,
    b: { lat: number; lng: number } | null,
  ): { distanceKm: number; estimatedDurationMinutes: number | null; source: 'routing_provider' | 'fallback' } {
    if (!a || !b) return { distanceKm: 0, estimatedDurationMinutes: null, source: 'fallback' };
    return { distanceKm: this.haversineKm(a, b), estimatedDurationMinutes: null, source: 'fallback' };
  }

  /**
   * Delivery System V2 Phase 1 — Delivery Pricing Factor Pipeline.
   *
   * Pure internal refactor of computeDeliveryFee's own math into named, independently
   * extensible steps (see delivery-v2-proposal.md §3.1/§5). computeDeliveryFee's public
   * signature/behavior is unchanged — every caller still gets exactly the same feeCents it
   * got before this pipeline existed.
   *
   * Steps 1-3 (base distance/vehicle calc, existing surge multiplier, minimum-fee floor)
   * are the pre-Phase-1 formula, preserved byte-for-byte including its rounding order: the
   * surge multiplier is folded into the SAME `Math.round(distance × rate × surge)` call the
   * old code used, not recomputed as `round(round(distance × rate) × surge)` — reordering
   * rounding operations can silently shift the result by a cent in edge cases, which would
   * fail TEST 3 of the Phase 1 regression suite. Only the minimum-fee floor is applied AFTER
   * the surge multiplier (exactly as before), even though the conceptual pipeline diagram in
   * the proposal shows "base → floor → surge" — the actual pre-existing code applies surge
   * before the floor, and preserving today's real numeric output takes priority over the
   * diagram's simplified ordering.
   *
   * Steps 4-9 (weather/demand/peak-hour/zone multipliers, waiting/urgency additive fees) were
   * Phase 2+ no-op placeholders; Phase 4 activates weather/peak/zone for real (demand and
   * urgency remain explicit no-ops — out of Phase 4 scope, see the Phase 4 report). Step 4.5
   * (combined multiplier cap, rule 8 of the Phase 4 spec) bounds the PRODUCT of all four
   * multipliers together — never the individual multipliers, which are each already
   * independently configurable/capped by Admin at the source (see resolveWeatherPricing/
   * resolvePeakHourPricing/resolveZonePricing) — so a misconfiguration or coincidental
   * stacking of several simultaneously-active factors can never compound into an uncontrolled
   * price explosion (rule 7 of the approved business model). maxCombinedMultiplierPermille
   * defaults to 100000 (×100), large enough that the cap can never bind against any Phase-4
   * default configuration — see deliveryPricingSettings.maxCombinedMultiplierPermille doc —
   * so this step is provably inert (byte-identical to the pre-Phase-4 formula) until Admin
   * both activates a dynamic factor AND sets a real cap.
   */
  private runDeliveryPricingPipeline(ctx: {
    distanceKm: number;
    pricePerKmCents: number;
    minFeeCents: number;
    existingSurgeMultiplierPermille: number;
    weatherMultiplierPermille: number;
    demandMultiplierPermille: number;
    peakHourMultiplierPermille: number;
    zoneMultiplierPermille: number;
    waitingFeeCents: number;
    urgencySurchargeCents: number;
    maxCombinedMultiplierPermille: number;
  }): { baseFeeCents: number; adjustedFeeCents: number; feeCents: number; combinedMultiplierPermille: number; combinedMultiplierCapped: boolean } {
    // Step 1 — Base Distance/Vehicle Calculation: pure distance × rate, no surge, no floor.
    // Informational/snapshot only — not itself an input to any later step.
    const baseFeeCents = Math.round(ctx.distanceKm * ctx.pricePerKmCents);

    // Step 2 — Existing Surge Multiplier (single combined rounding, matches pre-Phase-1 code).
    const surgedFeeCents = Math.round(ctx.distanceKm * ctx.pricePerKmCents * (ctx.existingSurgeMultiplierPermille / 1000));

    // Step 3 — Minimum Fee floor, applied to the surged amount, exactly as today.
    const flooredFeeCents = Math.max(0, Math.max(surgedFeeCents, ctx.minFeeCents));

    // Step 4 — Weather/Demand/Peak-Hour/Zone multipliers, combined multiplicatively (each
    // factor answers an independent question — see the approved business model §6).
    const rawCombinedMultiplierPermille = Math.round(
      (ctx.weatherMultiplierPermille / 1000)
      * (ctx.demandMultiplierPermille / 1000)
      * (ctx.peakHourMultiplierPermille / 1000)
      * (ctx.zoneMultiplierPermille / 1000)
      * 1000,
    );
    // Step 4.5 — Combined multiplier cap (rule 8) — see method doc above.
    const combinedMultiplierPermille = Math.min(rawCombinedMultiplierPermille, ctx.maxCombinedMultiplierPermille);
    const combinedMultiplierCapped = combinedMultiplierPermille < rawCombinedMultiplierPermille;

    // Steps 5-9 — Waiting/Urgency additive fees, applied AFTER the capped multiplier (an
    // event-based cost like waiting should never itself be inflated by an unrelated
    // multiplier, nor suppressed by the cap meant for multiplicative factors).
    const adjustedFeeCents = Math.round(flooredFeeCents * (combinedMultiplierPermille / 1000)) + ctx.waitingFeeCents + ctx.urgencySurchargeCents;

    return { baseFeeCents, adjustedFeeCents, feeCents: adjustedFeeCents, combinedMultiplierPermille, combinedMultiplierCapped };
  }

  /**
   * Delivery System V2 Phase 4 — Weather Pricing Engine + Delivery Safety Engine (combined,
   * since a weather condition is the sole input to both today — see the Phase 4 report).
   *
   * 'NORMAL' is ALWAYS hardcoded-neutral — it never reads weatherConditionConfigs, by
   * definition (a "normal" condition cannot itself be a business decision). For the other
   * four conditions, every field is read from Admin config and defaults to neutral/ALLOW
   * when that specific condition is active but not yet configured — never an invented
   * production value (rule 30 of the Phase 4 spec).
   */
  private resolveWeatherPricing(settings: DeliveryPricingSettings): {
    condition: string; customerMultiplierPermille: number; driverIncentiveCents: number;
    safetyState: 'ALLOW' | 'ALLOW_WITH_WARNING' | 'RESTRICT' | 'SUSPEND';
    restrictedVehicleTypes: DeliveryVehicleType[];
  } {
    const condition = settings.activeWeatherCondition ?? 'NORMAL';
    if (condition === 'NORMAL') {
      return { condition, customerMultiplierPermille: 1000, driverIncentiveCents: 0, safetyState: 'ALLOW', restrictedVehicleTypes: [] };
    }
    const cfg = (settings.weatherConditionConfigs as any)?.[condition] ?? {};
    return {
      condition,
      customerMultiplierPermille: cfg.customerMultiplierPermille ?? 1000,
      driverIncentiveCents: cfg.driverIncentiveCents ?? 0,
      safetyState: cfg.safetyState ?? 'ALLOW',
      restrictedVehicleTypes: cfg.restrictedVehicleTypes ?? [],
    };
  }

  /**
   * Delivery System V2 Phase 4 — Peak Hour Engine. No hard-coded Tunisian business hours —
   * every window is Admin-defined (see deliveryPricingSettings.peakHourWindows doc). When
   * multiple active windows overlap, the one with the HIGHEST customer multiplier wins
   * (never multiplied together — two overlapping peak declarations both represent the SAME
   * underlying "time-based demand" phenomenon, and multiplying them would double-count it;
   * see the approved business model §21 for this reasoning). Empty/no match → neutral.
   */
  private resolvePeakHourPricing(peakHourWindows: unknown, now: Date): { multiplierPermille: number; driverIncentiveCents: number; label: string | null } {
    const windows = Array.isArray(peakHourWindows) ? peakHourWindows as Array<{
      label: string; daysOfWeek: number[]; startTime: string; endTime: string;
      customerMultiplierPermille: number; driverIncentiveCents: number; isActive: boolean;
    }> : [];
    const day = now.getDay();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const toMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
      return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    };
    const active = windows.filter((w) => {
      if (!w?.isActive) return false;
      if (!Array.isArray(w.daysOfWeek) || !w.daysOfWeek.includes(day)) return false;
      const start = toMinutes(w.startTime), end = toMinutes(w.endTime);
      return start <= end ? (nowMinutes >= start && nowMinutes < end) : (nowMinutes >= start || nowMinutes < end); // supports an overnight window
    });
    if (active.length === 0) return { multiplierPermille: 1000, driverIncentiveCents: 0, label: null };
    const winner = active.reduce((best, w) => (w.customerMultiplierPermille ?? 1000) > (best.customerMultiplierPermille ?? 1000) ? w : best);
    return { multiplierPermille: winner.customerMultiplierPermille ?? 1000, driverIncentiveCents: winner.driverIncentiveCents ?? 0, label: winner.label ?? null };
  }

  /**
   * Delivery System V2 Phase 4 — Zone Pricing Engine. Matches the delivery's DESTINATION
   * (café) governorate against each configured zone's governorateMatch, case-insensitively
   * — kept deliberately simple (governorate-name matching, not real polygon geofencing),
   * exactly the "cheapest possible v1" already recommended in delivery-v2-proposal.md §3.17.
   * minFeeOverrideCents can only RAISE the vehicle's own minimum (never lower it — see
   * computeDeliveryFee's effectiveMinFeeCents), avoiding any double-charge-distance exploit.
   * No governorate on the destination, or no matching zone → neutral, never blocks pricing.
   */
  private resolveZonePricing(zones: unknown, destinationGovernorate: string | null | undefined): { multiplierPermille: number; minFeeOverrideCents: number | null; zoneName: string | null } {
    if (!destinationGovernorate) return { multiplierPermille: 1000, minFeeOverrideCents: null, zoneName: null };
    const list = Array.isArray(zones) ? zones as Array<{
      name: string; governorateMatch: string; multiplierPermille?: number; minFeeOverrideCents?: number; isActive: boolean;
    }> : [];
    const match = list.find((z) => z?.isActive && z.governorateMatch && z.governorateMatch.trim().toLowerCase() === destinationGovernorate.trim().toLowerCase());
    if (!match) return { multiplierPermille: 1000, minFeeOverrideCents: null, zoneName: null };
    return { multiplierPermille: match.multiplierPermille ?? 1000, minFeeOverrideCents: match.minFeeOverrideCents ?? null, zoneName: match.name };
  }

  /**
   * Delivery System V2 Phase 4 — Supplier Subsidy Engine. Generalizes the pre-Phase-4 binary
   * FREE_SHIPPING promotion (0% or 100% supplier-funded) into a graduated percentage, while
   * remaining byte-identical for every existing promotion: `deliverySubsidyPercent` is null
   * on every FREE_SHIPPING promotion created before this phase, and null is treated as 100 —
   * the exact pre-existing meaning of "free shipping". When multiple active promotions could
   * apply, the one yielding the LOWEST resulting Coffee Owner contribution wins (rule 12 of
   * the Phase 4 spec — "verify the correct hierarchy"; see the approved business model §15:
   * "most generous to the Coffee Owner wins", the standard discount-stacking convention).
   */
  private async resolveSupplierSubsidy(supplierId: number, cafeId: number, subtotalCents: number): Promise<{ subsidyPercent: number; promotionId: number | null }> {
    const now = new Date();
    const rows = await db.select().from(promotions).where(and(
      eq(promotions.supplierId, supplierId),
      eq(promotions.type, 'FREE_SHIPPING' as any),
      eq(promotions.status, 'ACTIVE' as any),
    ));
    const applicable = rows.filter((p) => {
      if (p.startDate && new Date(p.startDate) > now) return false;
      if (p.endDate && new Date(p.endDate) < now) return false;
      if (p.eligibleCafeIds && p.eligibleCafeIds.length > 0 && !p.eligibleCafeIds.includes(cafeId)) return false;
      const minAmount = p.freeShippingMinAmount ?? 0;
      return subtotalCents >= minAmount;
    });
    if (applicable.length === 0) return { subsidyPercent: 0, promotionId: null };
    const best = applicable.reduce((best, p) => {
      const pct = p.deliverySubsidyPercent ?? 100;
      const bestPct = best.deliverySubsidyPercent ?? 100;
      return pct > bestPct ? p : best;
    });
    return { subsidyPercent: Math.max(0, Math.min(100, best.deliverySubsidyPercent ?? 100)), promotionId: best.id };
  }

  /**
   * Delivery System V2 Phase 4 — Waiting Time Pricing Engine. Pure function — no DB access,
   * so it is independently unit-testable. Only the SUPPLIER-pickup-waiting scenario is wired
   * up today (see deliveries.arrivedAtPickupAt doc) — customer/dropoff-side waiting is not
   * implemented (see the Phase 4 report). Free minutes/price/compensation/cap all default to
   * 0/0/0/null (see deliveryPricingSettings doc) — waiting is always billed at 0 DT until
   * Admin configures a real rate, exactly matching rule 2 of the Phase 4 spec.
   *
   * Was `private` on DatabaseStorage; now `public` here — called from `updateDeliveryStatus`,
   * which remains on DatabaseStorage and reaches this via the facade (see file header).
   */
  computeWaitingFee(waitingMinutes: number, settings: {
    waitingFreeMinutes: number; waitingPricePerMinuteCents: number;
    waitingDriverCompensationPerMinuteCents: number; waitingMaxChargeCents: number | null;
  }): { billableMinutes: number; customerFeeCents: number; driverCompensationCents: number } {
    const billableMinutes = Math.max(0, Math.round(waitingMinutes) - Math.max(0, settings.waitingFreeMinutes));
    let customerFeeCents = billableMinutes * Math.max(0, settings.waitingPricePerMinuteCents);
    let driverCompensationCents = billableMinutes * Math.max(0, settings.waitingDriverCompensationPerMinuteCents);
    if (settings.waitingMaxChargeCents != null) {
      customerFeeCents = Math.min(customerFeeCents, settings.waitingMaxChargeCents);
      driverCompensationCents = Math.min(driverCompensationCents, settings.waitingMaxChargeCents);
    }
    return { billableMinutes, customerFeeCents, driverCompensationCents };
  }

  /**
   * Delivery System V2 Phase 4 — Delivery Budget Engine. Purely analytical/informational —
   * NEVER blocks a delivery from being created, dispatched, or assigned (rule 14 of the
   * Phase 4 spec: "the first implementation should be primarily analytical/validation").
   * supplierFeeShareCents already INCLUDES supplierSubsidyCents (see computeDeliveryFee's
   * split formula), so it is not added a second time here.
   *
   * Was `private` on DatabaseStorage; now `public` here — called from `assignDriver` and
   * `reassignDriver`, which remain on DatabaseStorage and reach this via the facade (see
   * file header). Both calls happen before those methods' transaction blocks open.
   */
  computeDeliveryBudget(params: {
    cafeOwnerFeeShareCents: number; supplierFeeShareCents: number; bigBossSubsidyCents: number;
    driverPayoutCents: number; companyPayoutCents: number;
    // Two-Leg Delivery Distance Model — the Supplier's pickup-leg contribution is a genuine
    // additional funding source (it funds the portion of driverPayoutCents earned for Leg 1),
    // so it must count toward totalFunding exactly like cafeOwnerFeeShareCents/
    // supplierFeeShareCents/bigBossSubsidyCents already do — otherwise every two-leg delivery
    // would show a false DEFICIT purely because this leg's funding wasn't counted, not because
    // of any real shortfall. Defaults to 0 so every pre-this-model call site (none currently
    // exist, but keeps the signature safe) behaves exactly as before.
    pickupLegFeeCents?: number;
  }): { result: 'FUNDED' | 'BREAK_EVEN' | 'DEFICIT'; deficitCents: number } {
    const totalFunding = params.cafeOwnerFeeShareCents + params.supplierFeeShareCents + params.bigBossSubsidyCents + (params.pickupLegFeeCents ?? 0);
    const totalCost = params.driverPayoutCents + params.companyPayoutCents;
    const deficitCents = totalCost - totalFunding;
    return { result: deficitCents > 0 ? 'DEFICIT' : deficitCents < 0 ? 'FUNDED' : 'BREAK_EVEN', deficitCents };
  }

  /**
   * The delivery pricing engine. Distance = driver→supplier (only known once a driver is
   * assigned — 0 before that) + supplier→cafe (known from creation). Missing coordinates
   * safely fall back to 0 for that leg rather than fabricating a distance — the resulting
   * fee is then whatever the minimum for the vehicle type covers, never negative, never
   * blocked. Free-delivery: driver/company compensation (feeCents) is never reduced; only
   * the responsibility split changes (cafeOwnerShareCents → 0, supplierShareCents → feeCents).
   *
   * Delivery System V2 Phase 1: internally delegates to runDeliveryPricingPipeline (all
   * future factors passed as explicit no-ops) and additionally returns the pipeline's
   * snapshot fields so callers can persist a fully self-explaining historical record — see
   * shared/schema.ts deliveries.pricePerKmCentsUsed and neighboring fields. feeCents/
   * distanceKm/vehicleType/surgeMultiplierPermille/cafeOwnerFeeShareCents/
   * supplierFeeShareCents/freeDeliveryApplied are UNCHANGED in value and meaning from before
   * this phase.
   *
   * Was `private` on DatabaseStorage; now `public` here — called from
   * `createDeliveryForSubOrder`, `assignDriver`, `reassignDriver`, and `estimateDeliveryFee`,
   * all of which remain on DatabaseStorage and reach this via the facade (see file header).
   */
  async computeDeliveryFee(params: {
    supplierId: number;
    cafeId: number;
    subtotalCents: number;
    supplierLocation: { lat?: string | null; lng?: string | null } | null;
    cafeLocation: { lat?: string | null; lng?: string | null; details?: { governorate?: string } | null } | null;
    driverLocation?: { lat?: string | null; lng?: string | null } | null;
    vehicleType?: DeliveryVehicleType | null;
  }): Promise<{
    feeCents: number; distanceKm: number; vehicleType: DeliveryVehicleType;
    surgeMultiplierPermille: number; cafeOwnerFeeShareCents: number; supplierFeeShareCents: number; freeDeliveryApplied: boolean;
    pricePerKmCentsUsed: number; minFeeCentsUsed: number; baseFeeCents: number; adjustedFeeCents: number;
    weatherMultiplierPermilleUsed: number; demandMultiplierPermilleUsed: number;
    peakHourMultiplierPermilleUsed: number; zoneMultiplierPermilleUsed: number;
    waitingFeeCentsUsed: number; urgencySurchargeCentsUsed: number;
    roadDistanceKm: number; estimatedDurationMinutes: number | null; distanceSource: 'routing_provider' | 'fallback';
    weatherConditionUsed: string; weatherIncentiveCentsUsed: number; safetyStateUsed: 'ALLOW' | 'ALLOW_WITH_WARNING' | 'RESTRICT' | 'SUSPEND';
    restrictedVehicleTypesUsed: DeliveryVehicleType[];
    zoneNameUsed: string | null; peakHourLabelUsed: string | null; peakIncentiveCentsUsed: number;
    supplierSubsidyCents: number; bigBossSubsidyCents: number;
    pickupLegDistanceKm: number | null; pickupLegRoadDistanceKm: number | null;
    pickupLegEstimatedDurationMinutes: number | null; pickupLegDistanceSource: 'routing_provider' | 'fallback' | null;
    pickupLegFeeCents: number | null;
  }> {
    const settings = await this.getDeliveryPricingSettings();
    const vehicleType = params.vehicleType ?? settings.defaultVehicleType;
    const pricing = settings.vehiclePricing?.[vehicleType] ?? { pricePerKmCents: 0, minFeeCents: 0 };

    const supplierPos = this.parseLatLng(params.supplierLocation);
    const cafePos = this.parseLatLng(params.cafeLocation);
    const driverPos = params.driverLocation ? this.parseLatLng(params.driverLocation) : null;

    // Two-Leg Delivery Distance Model — LEG 2 (Supplier → Coffee Owner, the customer
    // delivery leg) is the ONLY distance that feeds the customer-facing fee/pricing pipeline
    // below, exactly as before this model existed. LEG 1 (driver's current position →
    // Supplier, the pickup/collection leg) is now tracked and priced SEPARATELY — see the
    // pickupLeg* block further down — and is NEVER added into distanceKm/feeCents/
    // cafeOwnerFeeShareCents/supplierFeeShareCents. Previously these two legs were summed
    // into one combined distanceKm, which silently made the Coffee Owner's delivery share
    // include the cost of the driver travelling to the Supplier — a real bug, now fixed by
    // this separation (see docs/bigboss-delivery-two-leg-distance-model.md).
    const supplierToCafeRoute = this.getRoute(supplierPos, cafePos);
    const driverToSupplierRoute = this.getRoute(driverPos, supplierPos);
    const distanceKm = supplierToCafeRoute.distanceKm;
    const distanceSource: 'routing_provider' | 'fallback' = supplierToCafeRoute.source;
    const estimatedDurationMinutes = supplierToCafeRoute.estimatedDurationMinutes;

    // Delivery System V2 Phase 4 — Weather/Peak/Zone resolution. All knowable ahead of driver
    // assignment (unlike waiting, which depends on a future pickup event — see
    // updateDeliveryStatus's PICKED_UP branch), so all three are resolved and frozen here,
    // exactly like the base fee itself.
    const weather = this.resolveWeatherPricing(settings);
    const peak = this.resolvePeakHourPricing(settings.peakHourWindows, new Date());
    const zone = this.resolveZonePricing(settings.zones, params.cafeLocation?.details?.governorate ?? null);

    // Zone's minFeeOverrideCents can only RAISE the vehicle's own minimum, never lower it —
    // see resolveZonePricing doc.
    const effectiveMinFeeCents = Math.max(pricing.minFeeCents, zone.minFeeOverrideCents ?? 0);

    const weatherMultiplierPermilleUsed = weather.customerMultiplierPermille;
    const demandMultiplierPermilleUsed = 1000; // DemandPricingEngine explicitly out of Phase 4 scope
    const peakHourMultiplierPermilleUsed = peak.multiplierPermille;
    const zoneMultiplierPermilleUsed = zone.multiplierPermille;
    const waitingFeeCentsUsed = 0; // resolved later, at PICKED_UP — see schema doc
    const urgencySurchargeCentsUsed = 0; // no UrgencyEngine — out of scope, no business rule exists
    const pipeline = this.runDeliveryPricingPipeline({
      distanceKm,
      pricePerKmCents: pricing.pricePerKmCents,
      minFeeCents: effectiveMinFeeCents,
      existingSurgeMultiplierPermille: settings.surgeMultiplierPermille,
      weatherMultiplierPermille: weatherMultiplierPermilleUsed,
      demandMultiplierPermille: demandMultiplierPermilleUsed,
      peakHourMultiplierPermille: peakHourMultiplierPermilleUsed,
      zoneMultiplierPermille: zoneMultiplierPermilleUsed,
      waitingFeeCents: waitingFeeCentsUsed,
      urgencySurchargeCents: urgencySurchargeCentsUsed,
      maxCombinedMultiplierPermille: settings.maxCombinedMultiplierPermille,
    });
    const feeCents = pipeline.feeCents;

    // Delivery System V2 Phase 4 — Contribution/Subsidy split. Generalizes the pre-Phase-4
    // freeDeliveryApplied boolean into a graduated supplierSubsidyCents amount (see
    // resolveSupplierSubsidy doc — byte-identical for every existing FREE_SHIPPING
    // promotion). bigBossSubsidyCents is always 0 today — no campaign engine exists yet (see
    // the Phase 4 report) — but the field is always explicit, never an implicit zero.
    const subsidy = await this.resolveSupplierSubsidy(params.supplierId, params.cafeId, params.subtotalCents);
    const bigBossSubsidyCents = 0;
    const supplierSubsidyCents = Math.round(feeCents * (subsidy.subsidyPercent / 100));
    const remainingAfterSubsidies = feeCents - supplierSubsidyCents - bigBossSubsidyCents;
    const freeDeliveryApplied = subsidy.subsidyPercent >= 100;
    const cafeOwnerFeeShareCents = Math.round(remainingAfterSubsidies * (settings.cafeOwnerSharePercent / 100));
    const supplierFeeShareCents = remainingAfterSubsidies - cafeOwnerFeeShareCents + supplierSubsidyCents;

    // Two-Leg Delivery Distance Model — LEG 1 (driver's current position → Supplier). Priced
    // via the SAME pricing pipeline, vehicle rate, and global surge/weather/peak settings as
    // Leg 2 above — no new rate or percentage is invented. The zone multiplier is
    // deliberately excluded (neutral 1000): it is resolved from the COFFEE OWNER's own
    // governorate (see resolveZonePricing), which has no bearing on a leg that never involves
    // the Coffee Owner at all. Uses the vehicle's own base minFeeCents (not the zone-adjusted
    // effectiveMinFeeCents above, for the same reason). Only computed when the driver's
    // position is genuinely known — see driverPos above; when it isn't (e.g. the provisional
    // creation-time estimate, before a driver exists), every pickupLeg* value stays null
    // rather than inventing a phantom minimum-fee cost from an unknown position.
    let pickupLegFeeCents: number | null = null;
    if (driverPos) {
      const pickupPipeline = this.runDeliveryPricingPipeline({
        distanceKm: driverToSupplierRoute.distanceKm,
        pricePerKmCents: pricing.pricePerKmCents,
        minFeeCents: pricing.minFeeCents,
        existingSurgeMultiplierPermille: settings.surgeMultiplierPermille,
        weatherMultiplierPermille: weatherMultiplierPermilleUsed,
        demandMultiplierPermille: demandMultiplierPermilleUsed,
        peakHourMultiplierPermille: peakHourMultiplierPermilleUsed,
        zoneMultiplierPermille: 1000,
        waitingFeeCents: 0,
        urgencySurchargeCents: 0,
        maxCombinedMultiplierPermille: settings.maxCombinedMultiplierPermille,
      });
      pickupLegFeeCents = pickupPipeline.feeCents;
    }

    return {
      feeCents, distanceKm, vehicleType,
      surgeMultiplierPermille: settings.surgeMultiplierPermille,
      cafeOwnerFeeShareCents, supplierFeeShareCents, freeDeliveryApplied,
      pricePerKmCentsUsed: pricing.pricePerKmCents, minFeeCentsUsed: effectiveMinFeeCents,
      baseFeeCents: pipeline.baseFeeCents, adjustedFeeCents: pipeline.adjustedFeeCents,
      weatherMultiplierPermilleUsed, demandMultiplierPermilleUsed,
      peakHourMultiplierPermilleUsed, zoneMultiplierPermilleUsed,
      waitingFeeCentsUsed, urgencySurchargeCentsUsed,
      roadDistanceKm: distanceKm, estimatedDurationMinutes, distanceSource,
      weatherConditionUsed: weather.condition, weatherIncentiveCentsUsed: weather.driverIncentiveCents,
      safetyStateUsed: weather.safetyState, restrictedVehicleTypesUsed: weather.restrictedVehicleTypes,
      zoneNameUsed: zone.zoneName, peakHourLabelUsed: peak.label, peakIncentiveCentsUsed: peak.driverIncentiveCents,
      supplierSubsidyCents, bigBossSubsidyCents,
      pickupLegDistanceKm: driverPos ? driverToSupplierRoute.distanceKm : null,
      pickupLegRoadDistanceKm: driverPos ? driverToSupplierRoute.distanceKm : null,
      pickupLegEstimatedDurationMinutes: driverPos ? driverToSupplierRoute.estimatedDurationMinutes : null,
      pickupLegDistanceSource: driverPos ? driverToSupplierRoute.source : null,
      pickupLegFeeCents,
    };
  }
  // ══════════════════════════════════════════════════════════════════════════════════════
  // Vehicles + Driver Profile — consolidated from vehicles.storage.ts (Batch 25).
  // ══════════════════════════════════════════════════════════════════════════════════════
  // ── Vehicles ──────────────────────────────────────────────────────────────
  // One vehicle belongs to exactly one operator (Delivery Company or Supplier — same
  // owner-kind concept as deliveries.deliveryMode) and may be assigned to at most one of
  // that operator's own drivers at a time (DB partial-unique-index enforced).

  async getVehiclesForOwner(ownerType: DeliveryMode, ownerId: number): Promise<Vehicle[]> {
    return db.select().from(vehicles).where(and(eq(vehicles.ownerType, ownerType), eq(vehicles.ownerId, ownerId))).orderBy(desc(vehicles.createdAt));
  }

  async getVehicleForDriver(driverId: number): Promise<Vehicle | undefined> {
    const [row] = await db.select().from(vehicles).where(eq(vehicles.assignedDriverId, driverId));
    return row;
  }

  // Driver's own editable profile extension (bio/experience/certifications/availability) —
  // same getOrCreate-on-read pattern as getMaintenanceProfile/getDeliveryCompanyProfile.
  async getDriverProfile(userId: number): Promise<DriverProfile> {
    const [profile] = await db.select().from(driverProfiles).where(eq(driverProfiles.userId, userId));
    if (profile) return profile;
    const [created] = await db.insert(driverProfiles).values({ userId }).returning();
    return created;
  }

  async upsertDriverProfile(userId: number, updates: Partial<InsertDriverProfile>): Promise<DriverProfile> {
    const current = await this.getDriverProfile(userId);
    const [updated] = await db.update(driverProfiles)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(driverProfiles.id, current.id))
      .returning();
    return updated;
  }

  async createVehicle(ownerType: DeliveryMode, ownerId: number, data: Partial<InsertVehicle>): Promise<Vehicle> {
    const { ownerType: _o, ownerId: _i, id: _id, assignedDriverId: _a, ...safe } = data as any;
    const [created] = await db.insert(vehicles).values({ ...safe, ownerType, ownerId }).returning();
    return created;
  }

  async updateVehicle(id: number, ownerType: DeliveryMode, ownerId: number, data: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const { ownerType: _o, ownerId: _i, id: _id, ...safe } = data as any;
    const [updated] = await db.update(vehicles)
      .set({ ...safe, updatedAt: new Date() })
      .where(and(eq(vehicles.id, id), eq(vehicles.ownerType, ownerType), eq(vehicles.ownerId, ownerId)))
      .returning();
    return updated;
  }

  async deleteVehicle(id: number, ownerType: DeliveryMode, ownerId: number): Promise<void> {
    await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.ownerType, ownerType), eq(vehicles.ownerId, ownerId)));
  }

  /** Assigns a vehicle to one of the operator's own drivers — unassigns it from whoever had
   *  it first (a vehicle can only be actively assigned to one driver; DB partial unique index
   *  is the hard guarantee, this is the friendly path that avoids hitting it). */
  async assignVehicleToDriver(vehicleId: number, ownerType: DeliveryMode, ownerId: number, driverId: number | null): Promise<Vehicle> {
    const [vehicle] = await db.select().from(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerType, ownerType), eq(vehicles.ownerId, ownerId)));
    if (!vehicle) throw new Error('Vehicle not found');
    if (driverId != null) {
      const [driver] = await db.select().from(users).where(eq(users.id, driverId));
      const belongsToOwner = ownerType === 'SUPPLIER' ? driver?.supplierId === ownerId : driver?.deliveryCompanyId === ownerId;
      if (!driver || driver.role !== 'DRIVER' || !belongsToOwner) throw new Error('Driver does not belong to this operator');
      // Free the driver's previous vehicle, if any, before assigning the new one.
      await db.update(vehicles).set({ assignedDriverId: null, updatedAt: new Date() }).where(eq(vehicles.assignedDriverId, driverId));
    }
    const [updated] = await db.update(vehicles).set({ assignedDriverId: driverId, updatedAt: new Date() }).where(eq(vehicles.id, vehicleId)).returning();
    return updated;
  }
  // ══════════════════════════════════════════════════════════════════════════════════════
  // Driver Payout Engine + Financial Ledger Foundation — consolidated from
  // driver-payout.storage.ts (Batch 26).
  // ══════════════════════════════════════════════════════════════════════════════════════
  // ── Driver Payout Engine (Phase 3) ───────────────────────────────────────
  /**
   * Delivery System V2 Phase 3 — Driver Payout Engine.
   *
   * Customer delivery fee (computeDeliveryFee/runDeliveryPricingPipeline) and driver/operator
   * compensation are now explicitly separate concepts (see delivery-v2-proposal.md §3.4 and
   * rule 2 of the Phase 3 task) — this function is the ONLY place driverPayoutCents/
   * companyPayoutCents are computed, and neither figure is ever derived ad-hoc elsewhere
   * (e.g. delivery-details.tsx previously assumed driverPayout === deliveryFee inline; that
   * assumption now lives here, as an explicit, configurable, non-hardcoded default instead).
   *
   * driverPayoutSharePercent defaults to 100 (see deliveryPricingSettings.driverPayoutSharePercent
   * doc) — this reproduces the EXACT behavior every delivery already had before this phase, so
   * wiring this into assignDriver/reassignDriver does not change any existing delivery's
   * effective driver compensation until Admin explicitly changes the percentage.
   *
   * companyPayoutCents only exists in DELIVERY_COMPANY mode (see rule 7 of the Phase 3 task —
   * "Case A: Supplier Own Delivery... no external delivery company payout"): in SUPPLIER mode
   * there is no company in the relationship, so companyPayoutCents is always 0, not merely
   * "whatever's left over" the way it would be for an actual company. In DELIVERY_COMPANY
   * mode, companyPayoutCents = feeCents − driverPayoutCents by construction (the two must
   * always sum back to the customer fee — see rule 22 "money safety"/consistency) — there is
   * no separate company-commission percentage today because none exists as a defined business
   * rule yet (see the Phase 3 final report's "business decisions required" section); this is
   * the honest, non-invented default, not a placeholder value pretending to be final.
   *
   * A minimum driver guarantee, cancellation compensation, and driver bonuses are
   * DELIBERATELY NOT implemented here — see rule 4/36 of the Phase 3 task ("do not invent a
   * production business rule") and the final report.
   *
   * Was `private` on DatabaseStorage; now `public` here — called from `assignDriver`,
   * `reassignDriver`, and `getAssignableDriversForDelivery`, all of which remain on
   * DatabaseStorage and reach this via the facade (see file header).
   */
  computeDeliveryPayout(params: {
    feeCents: number;
    deliveryMode: DeliveryMode | null | undefined;
    driverPayoutSharePercent: number;
    // Delivery System V2 Phase 4 — weather/peak driver incentives (see rule 16 of the Phase 4
    // spec: "extend the existing DriverPayoutEngine carefully... base driver payout + weather
    // incentive + waiting compensation"). Both default to 0 (see resolveWeatherPricing/
    // resolvePeakHourPricing), so driverPayoutCents is BYTE-IDENTICAL to its pre-Phase-4
    // value whenever neither factor is active — the base percentage-of-fee computation below
    // is completely unchanged.
    weatherIncentiveCents?: number;
    peakIncentiveCents?: number;
  }): { driverPayoutCents: number; companyPayoutCents: number; driverPayoutSharePercentUsed: number } {
    const pct = Math.max(0, Math.min(100, params.driverPayoutSharePercent));
    const baseDriverShareCents = Math.round(params.feeCents * (pct / 100));
    // companyPayoutCents is deliberately based on the BASE share only, never the incentives —
    // weather/peak incentives are extra compensation earned by whoever actually does the
    // work (the driver), not something a Delivery Company's own cut grows from (see the
    // approved business model §19: driver incentives must not be diluted by unrelated
    // customer-side math, and symmetrically must not inflate the company's own margin either).
    const companyPayoutCents = params.deliveryMode === 'DELIVERY_COMPANY' ? params.feeCents - baseDriverShareCents : 0;
    const driverPayoutCents = baseDriverShareCents + Math.max(0, params.weatherIncentiveCents ?? 0) + Math.max(0, params.peakIncentiveCents ?? 0);
    return { driverPayoutCents, companyPayoutCents, driverPayoutSharePercentUsed: pct };
  }

  /**
   * Delivery System V2 Phase 3 — derives the read-only payoutStatus surfaced on
   * DeliveryWithDetails (see shared/schema.ts doc). Pure function of the delivery's CURRENT
   * status; never persisted, never influences the frozen driverPayoutCents/companyPayoutCents
   * numbers themselves. See rule 24 ("cancelled delivery ≠ completed driver payout") and rule
   * 25 ("historical financial values must not be recalculated later") of the Phase 3 task —
   * this satisfies both without altering the frozen cents or inventing a compensation amount.
   *
   * Was `private` on DatabaseStorage; now `public` here — called from `toDeliveryWithDetails`
   * and `getDeliveryFinancialSummary`, both of which remain on DatabaseStorage and reach this
   * via the facade (see file header).
   */
  computeDeliveryPayoutStatus(status: DeliveryStatus): 'PENDING' | 'EARNED' | 'VOID' {
    if (status === 'DELIVERED') return 'EARNED';
    if (status === 'CANCELLED') return 'VOID';
    return 'PENDING';
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Delivery System V2 Phase 5A — Financial Ledger Foundation
  // See docs/bigboss-delivery-financial-ledger.md for the full design. This block is the
  // SINGLE controlled entry point for writing ledger rows — no other code anywhere should
  // INSERT into deliveryFinancialLedger directly (rule from the Phase 5A task: "do not
  // scatter raw ledger INSERT statements throughout unrelated routes").
  // ══════════════════════════════════════════════════════════════════════════════════════

  /**
   * The ONLY function that ever writes a row to deliveryFinancialLedger. Idempotent: the
   * unique (sourceEvent, sourceReference, entryType) triple — encoded as idempotencyKey —
   * guarantees the SAME real-world event can never produce two rows, even under retry or
   * concurrent execution (`ON CONFLICT DO NOTHING`, then read back whichever row actually
   * exists — the same pattern already used by createDeliveryForSubOrder for delivery
   * creation itself). Every entry is written at status='CALCULATED' (the DB column default)
   * — see updateLedgerEntriesStatus for the only other way a row's status may ever change.
   * amountCents must be a non-negative integer; a genuinely zero-value economic fact (e.g. a
   * fully-supplier-subsidized delivery's customer charge) is still written — it is callers'
   * responsibility to skip calling this at all for factors that are simply INACTIVE (e.g. no
   * weather incentive today), rather than this function silently discarding zero amounts,
   * so "the factor was inactive" and "the factor was active but genuinely computed to zero"
   * remain distinguishable by whether a row exists at all.
   *
   * Was `private` on DatabaseStorage; now `public` here — called directly from
   * `updateDeliveryStatus` (the WAITING_COMPENSATION entry) in addition to intra-class calls
   * from recordDeliveryFinancialEvents below. `updateDeliveryStatus` remains on
   * DatabaseStorage and reaches this via the facade (see file header), passing its own live
   * transaction client through unchanged.
   */
  async createFinancialLedgerEntry(entry: {
    orderId: number; subOrderId: number; deliveryId: number;
    entryType: LedgerEntryType;
    actorRole: LedgerActorRole; actorUserId: number | null;
    counterpartyRole?: LedgerActorRole | null; counterpartyUserId?: number | null;
    amountCents: number; direction: LedgerDirection;
    description?: string;
    sourceEvent: string; sourceReference: string;
    effectiveAt: Date;
  }, client: any = db): Promise<FinancialLedgerEntry> {
    if (entry.amountCents < 0) throw new Error('Ledger entry amountCents must be non-negative — direction carries the sign/meaning');
    const idempotencyKey = `${entry.sourceEvent}:${entry.sourceReference}:${entry.entryType}`;
    const [inserted] = await client.insert(deliveryFinancialLedger).values({
      orderId: entry.orderId, subOrderId: entry.subOrderId, deliveryId: entry.deliveryId,
      entryType: entry.entryType, actorRole: entry.actorRole, actorUserId: entry.actorUserId,
      counterpartyRole: entry.counterpartyRole ?? null, counterpartyUserId: entry.counterpartyUserId ?? null,
      amountCents: entry.amountCents, direction: entry.direction,
      description: entry.description ?? null,
      sourceEvent: entry.sourceEvent, sourceReference: entry.sourceReference, idempotencyKey,
      effectiveAt: entry.effectiveAt,
    }).onConflictDoNothing({ target: deliveryFinancialLedger.idempotencyKey }).returning();
    if (inserted) return inserted;
    // Conflict — this exact event already wrote this exact entry. Idempotent no-op: return
    // the existing row rather than erroring, so a caller can safely retry without special-casing.
    const [existing] = await client.select().from(deliveryFinancialLedger).where(eq(deliveryFinancialLedger.idempotencyKey, idempotencyKey));
    return existing;
  }

  /**
   * The ONLY way a ledger entry's status may change after creation — and it never touches
   * amountCents/direction/actorUserId/entryType/anything else, preserving immutability of the
   * actual economic fact while still letting the STATUS reflect the delivery's real lifecycle
   * (CALCULATED → AUTHORIZED at DELIVERED, CALCULATED → VOID at CANCELLED — see
   * updateDeliveryStatus). Scoped by (deliveryId, fromStatus) so it can never accidentally
   * regress an entry that's already progressed further (e.g. a future OWED/PAID entry is
   * never silently reset to AUTHORIZED by this method).
   *
   * Was `private` on DatabaseStorage; now `public` here — called from `dispatchDelivery`,
   * `assignDriver` (via recordDeliveryFinancialEvents only — see below), `reassignDriver`,
   * and `updateDeliveryStatus`, all of which remain on DatabaseStorage and reach this via the
   * facade, passing their own live transaction client through unchanged.
   */
  async updateLedgerEntriesStatus(deliveryId: number, fromStatus: LedgerStatus, toStatus: LedgerStatus, client: any = db): Promise<void> {
    await client.update(deliveryFinancialLedger)
      .set({ status: toStatus })
      .where(and(eq(deliveryFinancialLedger.deliveryId, deliveryId), eq(deliveryFinancialLedger.status, fromStatus)));
  }

  /**
   * Writes the full set of economic-event ledger entries for a delivery at the moment its
   * pricing/payout is FROZEN (feeFinalizedAt — i.e. inside assignDriver, immediately after the
   * delivery row itself is updated, in the SAME transaction — see assignDriver). Reads ONLY
   * the already-computed, already-frozen values passed in (finalFee/payout/budget) — never
   * recalculates pricing itself (rule: "the ledger must use the frozen financial values from
   * the delivery... Phase 1-4 snapshots remain the authoritative source").
   *
   * Deliberately scoped to the FIRST assignment only — see assignDriver's call site comment
   * for why reassignDriver does not (yet) call this. This is a documented Phase 5A limitation,
   * not an oversight — see docs/bigboss-delivery-financial-ledger.md "current limitations".
   *
   * CRITICAL distinction this function encodes directly in its counterparty assignment (per
   * rule 3/8 of the Phase 5A task — "calculated payout ≠ BigBoss owes payout"): DRIVER_PAYOUT's
   * counterparty is ALWAYS the Supplier (SUPPLIER mode) or the Delivery Company (DELIVERY_COMPANY
   * mode) — NEVER BigBoss. No entry anywhere in this function sets actorRole/counterpartyRole
   * to 'BIGBOSS' unless bigBossSubsidyCents is genuinely > 0 (never true in Phase 5A, since no
   * subsidy campaign engine exists — see rule 26 of the Phase 5A task).
   *
   * Was `private` on DatabaseStorage; now `public` here — called from `assignDriver` and
   * `reassignDriver`, both of which remain on DatabaseStorage and reach this via the facade,
   * passing their own live transaction client through unchanged.
   */
  async recordDeliveryFinancialEvents(params: {
    delivery: Delivery;
    finalFee: {
      cafeOwnerFeeShareCents: number; supplierFeeShareCents: number; supplierSubsidyCents: number; bigBossSubsidyCents: number;
      weatherIncentiveCentsUsed: number; peakIncentiveCentsUsed: number;
      // Two-Leg Delivery Distance Model — the Supplier's own pickup-leg cost (driver's
      // position → Supplier), null/0 when the driver's position wasn't known at pricing time.
      pickupLegFeeCents?: number | null;
    };
    payout: { driverPayoutCents: number; companyPayoutCents: number };
    sourceEvent: string;
    effectiveAt: Date;
    // Delivery System V2 Phase 5B — optional override, used ONLY by reassignDriver. Defaults
    // to the exact Phase 5A reference (`delivery:${id}`) so assignDriver's own call site and
    // idempotency behavior are completely unchanged. See reassignDriver's call site doc for
    // why reassignment needs a driver-scoped reference instead.
    sourceReference?: string;
  }, client: any = db): Promise<void> {
    const { delivery, finalFee, payout, sourceEvent, effectiveAt } = params;
    const sourceReference = params.sourceReference ?? `delivery:${delivery.id}`;
    const common = { orderId: delivery.orderId, subOrderId: delivery.subOrderId, deliveryId: delivery.id, sourceEvent, sourceReference, effectiveAt };

    // Who is economically responsible for paying the driver — NEVER BigBoss (see doc above).
    const driverCounterpartyRole: LedgerActorRole = delivery.deliveryMode === 'DELIVERY_COMPANY' ? 'DELIVERY_COMPANY' : 'SUPPLIER';
    const driverCounterpartyUserId = delivery.deliveryMode === 'DELIVERY_COMPANY' ? delivery.deliveryCompanyId : delivery.supplierId;

    // DELIVERY_CHARGE — the Coffee Owner's own delivery contribution. Written even if 0 (a
    // fully-subsidized delivery is still a meaningful, distinguishable economic fact — see
    // createFinancialLedgerEntry's doc on zero amounts). Direction DEBIT: the Coffee Owner is
    // the one charged/responsible for this amount. Counterparty left null — who ultimately
    // COLLECTS this is exactly the still-undecided Model A/B question (see
    // docs/bigboss-delivery-business-rules-money-flow.md §5-6); never guessed here.
    await this.createFinancialLedgerEntry({
      ...common, entryType: 'DELIVERY_CHARGE', actorRole: 'CAFE_OWNER', actorUserId: delivery.cafeId,
      amountCents: finalFee.cafeOwnerFeeShareCents, direction: 'DEBIT',
      description: 'Coffee Owner delivery contribution',
    }, client);

    // SUPPLIER_CONTRIBUTION — the Supplier's own contribution (already includes any
    // SupplierSubsidyEngine subsidy amount — see computeDeliveryFee's split formula, Phase 4).
    await this.createFinancialLedgerEntry({
      ...common, entryType: 'SUPPLIER_CONTRIBUTION', actorRole: 'SUPPLIER', actorUserId: delivery.supplierId,
      amountCents: finalFee.supplierFeeShareCents, direction: 'DEBIT',
      description: finalFee.supplierSubsidyCents > 0 ? `Supplier delivery contribution (includes ${finalFee.supplierSubsidyCents} cents subsidy)` : 'Supplier delivery contribution',
    }, client);

    // SUPPLIER_PICKUP_LEG — Two-Leg Delivery Distance Model. The Supplier's own responsibility
    // for the driver's travel TO the Supplier (Leg 1) — kept entirely separate from
    // SUPPLIER_CONTRIBUTION above (which represents Leg 2/delivery economics only, unchanged
    // in meaning). Only written when genuinely known and > 0 (never invented when the driver's
    // position wasn't available at pricing time — see computeDeliveryFee's driverPos guard).
    // DEBIT direction: the Supplier is charged/responsible, exactly like every other DEBIT
    // entry in this function — never a settlement recipient (settlement only ever groups
    // CREDIT entries — see calculateDeliverySettlement), so this never produces a Supplier
    // "payout", only a queryable, auditable obligation.
    if (finalFee.pickupLegFeeCents != null && finalFee.pickupLegFeeCents > 0) {
      await this.createFinancialLedgerEntry({
        ...common, entryType: 'SUPPLIER_PICKUP_LEG', actorRole: 'SUPPLIER', actorUserId: delivery.supplierId,
        amountCents: finalFee.pickupLegFeeCents, direction: 'DEBIT',
        description: 'Supplier pickup-leg contribution (driver → supplier collection distance)',
      }, client);
    }

    // BIGBOSS_SUBSIDY — only written when genuinely > 0. Always 0 in Phase 5A (no campaign
    // engine exists — rule 26 of the Phase 5A task: "do not manufacture a fake subsidy
    // transaction"). This branch exists so the architecture needs no change once one does.
    if (finalFee.bigBossSubsidyCents > 0) {
      await this.createFinancialLedgerEntry({
        ...common, entryType: 'BIGBOSS_SUBSIDY', actorRole: 'BIGBOSS', actorUserId: null,
        amountCents: finalFee.bigBossSubsidyCents, direction: 'DEBIT',
        description: 'BigBoss-funded delivery subsidy',
      }, client);
    }

    // DRIVER_PAYOUT — what the driver has ECONOMICALLY EARNED (CREDIT — they are entitled to
    // receive it). Counterparty is the Supplier or Delivery Company, per the rule above —
    // this is the exact "driver earned ≠ BigBoss owes driver" distinction the Phase 5A task
    // requires (rule 3/8). Includes the base %-of-fee share only; weather/peak incentives are
    // recorded as their OWN separate entries below (never blended into one opaque number).
    if (delivery.driverId) {
      const baseDriverPayoutCents = payout.driverPayoutCents - finalFee.weatherIncentiveCentsUsed - finalFee.peakIncentiveCentsUsed;
      await this.createFinancialLedgerEntry({
        ...common, entryType: 'DRIVER_PAYOUT', actorRole: 'DRIVER', actorUserId: delivery.driverId,
        counterpartyRole: driverCounterpartyRole, counterpartyUserId: driverCounterpartyUserId,
        amountCents: Math.max(0, baseDriverPayoutCents), direction: 'CREDIT',
        description: `Driver payout — ${driverCounterpartyRole === 'SUPPLIER' ? 'owed by the operating Supplier' : 'owed by the Delivery Company'}, never BigBoss`,
      }, client);
    }

    // DELIVERY_COMPANY_PAYOUT — only in DELIVERY_COMPANY mode (structurally: there is no
    // company in a SUPPLIER-mode relationship — see companyPayoutCents' own doc, Phase 3).
    // Written even if 0 (a real, if currently-zero, contract fact under today's default
    // 100% driverPayoutSharePercent — see docs/bigboss-delivery-business-rules-money-flow.md §15).
    if (delivery.deliveryMode === 'DELIVERY_COMPANY' && delivery.deliveryCompanyId) {
      await this.createFinancialLedgerEntry({
        ...common, entryType: 'DELIVERY_COMPANY_PAYOUT', actorRole: 'DELIVERY_COMPANY', actorUserId: delivery.deliveryCompanyId,
        amountCents: payout.companyPayoutCents, direction: 'CREDIT',
        description: 'Delivery Company retained amount',
      }, client);
    }

    // WEATHER_INCENTIVE / PEAK_INCENTIVE — only written when genuinely active (> 0). Same
    // counterparty as DRIVER_PAYOUT (never BigBoss) — these are additive driver compensation,
    // not a separate financial relationship.
    if (finalFee.weatherIncentiveCentsUsed > 0 && delivery.driverId) {
      await this.createFinancialLedgerEntry({
        ...common, entryType: 'WEATHER_INCENTIVE', actorRole: 'DRIVER', actorUserId: delivery.driverId,
        counterpartyRole: driverCounterpartyRole, counterpartyUserId: driverCounterpartyUserId,
        amountCents: finalFee.weatherIncentiveCentsUsed, direction: 'CREDIT',
        description: 'Weather-condition driver incentive',
      }, client);
    }
    if (finalFee.peakIncentiveCentsUsed > 0 && delivery.driverId) {
      await this.createFinancialLedgerEntry({
        ...common, entryType: 'PEAK_INCENTIVE', actorRole: 'DRIVER', actorUserId: delivery.driverId,
        counterpartyRole: driverCounterpartyRole, counterpartyUserId: driverCounterpartyUserId,
        amountCents: finalFee.peakIncentiveCentsUsed, direction: 'CREDIT',
        description: 'Peak-hour driver incentive',
      }, client);
    }
  }

  /**
   * Admin-only ledger query (Phase 5A rule 20: "make the ledger auditable", not a full
   * dashboard — that is Phase 5B). Filters are all optional and combine with AND. Ordered
   * newest-first, matching every other list method's existing convention in this file.
   */
  async getFinancialLedgerEntries(filters?: {
    deliveryId?: number; orderId?: number; subOrderId?: number;
    entryType?: string; actorRole?: string; actorUserId?: number; status?: string;
    fromDate?: Date; toDate?: Date;
    page?: number; limit?: number;
  }): Promise<{ entries: FinancialLedgerEntry[]; total: number; page: number; limit: number }> {
    const conditions = [];
    if (filters?.deliveryId != null) conditions.push(eq(deliveryFinancialLedger.deliveryId, filters.deliveryId));
    if (filters?.orderId != null) conditions.push(eq(deliveryFinancialLedger.orderId, filters.orderId));
    if (filters?.subOrderId != null) conditions.push(eq(deliveryFinancialLedger.subOrderId, filters.subOrderId));
    if (filters?.entryType) conditions.push(eq(deliveryFinancialLedger.entryType, filters.entryType));
    if (filters?.actorRole) conditions.push(eq(deliveryFinancialLedger.actorRole, filters.actorRole));
    // actorUserId — an Admin filter for "show me everything concerning this specific
    // supplier/driver/company", regardless of whether they're the entry's actor or
    // counterparty (e.g. filtering by a supplierId should surface both its own
    // SUPPLIER_CONTRIBUTION entries AND its own driver's DRIVER_PAYOUT entries, where the
    // supplier appears as counterparty — same scoping logic as getActorFinancialHistory).
    if (filters?.actorUserId != null) {
      conditions.push(or(
        eq(deliveryFinancialLedger.actorUserId, filters.actorUserId),
        eq(deliveryFinancialLedger.counterpartyUserId, filters.actorUserId),
      ));
    }
    if (filters?.status) conditions.push(eq(deliveryFinancialLedger.status, filters.status));
    if (filters?.fromDate) conditions.push(gte(deliveryFinancialLedger.effectiveAt, filters.fromDate));
    if (filters?.toDate) conditions.push(lte(deliveryFinancialLedger.effectiveAt, filters.toDate));
    const where = conditions.length ? and(...conditions) : undefined;
    // Performance (rule 22 of the Phase 5B task) — paginated, never an unbounded scan; the
    // existing indexes on deliveryId/orderId/subOrderId/actorRole/status/effectiveAt (Phase
    // 5A) already cover every filter above.
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(Math.max(1, filters?.limit ?? 50), 200);
    const [entries, [{ count }]] = await Promise.all([
      db.select().from(deliveryFinancialLedger).where(where)
        .orderBy(desc(deliveryFinancialLedger.effectiveAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(deliveryFinancialLedger).where(where),
    ]);
    return { entries, total: count, page, limit };
  }

  /**
   * Delivery System V2 Phase 5B — self-service financial history for a Coffee Owner, Supplier,
   * Driver, or Delivery Company (rule 19: "getActorFinancialHistory(actingUser, filters)").
   * `actingUser` is ALWAYS the authenticated caller — there is no `actorId` parameter an
   * end-user could tamper with to view someone else's history (rule 20 TEST7/26: "changing IDs
   * in API requests cannot bypass authorization"); the route layer passes only
   * `req.session.userId`'s own resolved role/id, never a client-supplied id.
   *
   * SUPPLIER/DELIVERY_COMPANY additionally see entries where they are the COUNTERPARTY (e.g. a
   * Supplier's own driver's DRIVER_PAYOUT entry has actorRole=DRIVER but
   * counterpartyRole=SUPPLIER) — this is what lets a Supplier "understand what delivery cost
   * them AND what their driver earned" (rule 10) from ONE history view. DRIVER/CAFE_OWNER see
   * only entries where THEY are the actor — never another driver's earnings, never another
   * café's charges (rules 9/11/13).
   */
  async getActorFinancialHistory(actingUser: { id: number; role: string }, filters?: {
    entryType?: string; status?: string; fromDate?: Date; toDate?: Date; page?: number; limit?: number;
  }): Promise<{ entries: FinancialLedgerEntry[]; total: number; page: number; limit: number }> {
    const role = actingUser.role;
    if (!['CAFE_OWNER', 'SUPPLIER', 'DRIVER', 'DELIVERY_COMPANY'].includes(role)) {
      throw new Error('This role has no self-service financial history');
    }
    const scopeCondition = (role === 'SUPPLIER' || role === 'DELIVERY_COMPANY')
      ? or(
          and(eq(deliveryFinancialLedger.actorRole, role), eq(deliveryFinancialLedger.actorUserId, actingUser.id)),
          and(eq(deliveryFinancialLedger.counterpartyRole, role), eq(deliveryFinancialLedger.counterpartyUserId, actingUser.id)),
        )
      : and(eq(deliveryFinancialLedger.actorRole, role), eq(deliveryFinancialLedger.actorUserId, actingUser.id));

    const conditions = [scopeCondition];
    if (filters?.entryType) conditions.push(eq(deliveryFinancialLedger.entryType, filters.entryType));
    if (filters?.status) conditions.push(eq(deliveryFinancialLedger.status, filters.status));
    if (filters?.fromDate) conditions.push(gte(deliveryFinancialLedger.effectiveAt, filters.fromDate));
    if (filters?.toDate) conditions.push(lte(deliveryFinancialLedger.effectiveAt, filters.toDate));
    const where = and(...conditions);
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(Math.max(1, filters?.limit ?? 25), 100);
    const [entries, [{ count }]] = await Promise.all([
      db.select().from(deliveryFinancialLedger).where(where)
        .orderBy(desc(deliveryFinancialLedger.effectiveAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(deliveryFinancialLedger).where(where),
    ]);
    return { entries, total: count, page, limit };
  }
  // ══════════════════════════════════════════════════════════════════════════════════════
  // Delivery Opportunities — consolidated from delivery-opportunities.storage.ts (Batch 27).
  // ══════════════════════════════════════════════════════════════════════════════════════
  async getOpportunitiesForCompany(deliveryCompanyId: number): Promise<DeliveryOpportunity[]> {
    return db.select().from(deliveryOpportunities).where(eq(deliveryOpportunities.deliveryCompanyId, deliveryCompanyId)).orderBy(desc(deliveryOpportunities.createdAt));
  }

  /** Eligible = OPEN opportunities from the driver's own delivery company (a driver working
   *  under a Supplier has no delivery-company opportunities to see). */
  async getOpportunitiesForDriver(driverId: number): Promise<DeliveryOpportunity[]> {
    const [driver] = await db.select().from(users).where(eq(users.id, driverId));
    if (!driver?.deliveryCompanyId) return [];
    return db.select().from(deliveryOpportunities)
      .where(and(eq(deliveryOpportunities.deliveryCompanyId, driver.deliveryCompanyId), eq(deliveryOpportunities.status, 'OPEN')))
      .orderBy(desc(deliveryOpportunities.createdAt));
  }

  async createOpportunity(deliveryCompanyId: number, data: { title: string; description?: string; area?: string; vehicleTypeRequired?: DeliveryVehicleType | null; startAt?: Date | null; durationHours?: number | null; compensationCents?: number | null }): Promise<DeliveryOpportunity> {
    const [created] = await db.insert(deliveryOpportunities).values({ ...data, deliveryCompanyId, status: 'OPEN' } as any).returning();
    return created;
  }

  async closeOpportunity(id: number, deliveryCompanyId: number, status: 'CLOSED' | 'CANCELLED'): Promise<DeliveryOpportunity> {
    const [updated] = await db.update(deliveryOpportunities)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(deliveryOpportunities.id, id), eq(deliveryOpportunities.deliveryCompanyId, deliveryCompanyId), eq(deliveryOpportunities.status, 'OPEN')))
      .returning();
    if (!updated) throw new Error('Opportunity not found or already closed');
    return updated;
  }

  /** Atomic — first eligible driver to accept fills it (compare-and-swap on status=OPEN). */
  async acceptOpportunity(id: number, driverId: number): Promise<DeliveryOpportunity> {
    const [driver] = await db.select().from(users).where(eq(users.id, driverId));
    if (!driver?.deliveryCompanyId) throw new Error('Only drivers belonging to a delivery company can accept opportunities');
    const [updated] = await db.update(deliveryOpportunities)
      .set({ status: 'FILLED', filledByDriverId: driverId, filledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(deliveryOpportunities.id, id), eq(deliveryOpportunities.deliveryCompanyId, driver.deliveryCompanyId), eq(deliveryOpportunities.status, 'OPEN')))
      .returning();
    if (!updated) throw new Error('This opportunity is no longer available');
    return updated;
  }}
