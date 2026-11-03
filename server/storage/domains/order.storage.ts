import { db } from "../../db";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  orders, orderItems, subOrders, orderReturns, deliveries,
  packs, packItems, products, categories, subCategories, brands, flavors, sizes,
  supplierProductListings, supplierProductVariants, users,
  discountCodes, discountCodeUsage, promotionUsage,
  type OrderWithDetails, type Order, type SubOrder, type OrderReturn, type InsertOrderReturn,
  type CreateOrderItem, type CreateOrderItemInput, type CreatePackOrderItem, type ResolvedPackOrderItem,
  type GeoLocation, type Product,
} from "@shared/schema";
import { buildTaxonomyCache } from "../../storage";
import type { DatabaseStorage } from "../../storage";

// Stage 2 — Batch 37: the complete core Order business domain, extracted
// into one file per the project's permanent "one business domain = one
// storage file" rule. This is the largest extraction in the project so
// far — 18 public methods + 7 private helpers, spanning two PHYSICALLY
// separate locations in the original monolith:
//   (a) the original "── Orders ──" section (lines 679-1564 at the time
//       of extraction) — getOrders/getOrder/canUserAccessOrder,
//       resolveOrderItems/resolvePackOrderItems (+ their shared private
//       resolvePackComponentDeductions helper), updateSubOrderStatus,
//       confirmSelfPickup, the pack-stock restoration helpers
//       (restoreSubOrderPackStock/restorePackComponentStock), the
//       Order Returns CRUD (getReturns/createReturn/updateReturnStatus),
//       and deleteOrder;
//   (b) a SECOND, undocumented block of genuine Order-lifecycle methods
//       physically sitting inside the "── Delivery Opportunities ──"
//       section (no sub-header of its own) — getReorderData, createOrder
//       (the order-creation transaction), updateOrderStatus (+ its
//       private restockOrderInventory/restockSubOrderRegularItems
//       helpers), cancelSubOrderItems (+ its sibling
//       cancelSupplierSubOrderItems and the shared private
//       splitAndCancelOrderItem helper), setOrderFavorite, and
//       getSubOrderItemsForCartRestore. This displacement pre-dates the
//       entire refactoring project — confirmed by reading the whole
//       "Delivery Opportunities" section end-to-end, not assumed from
//       the section header text.
//
// Deliberately EXCLUDED from this extraction, despite being physically
// adjacent in block (a) and genuinely Delivery-domain, not Order-domain
// (confirmed by reading their bodies — they create/dispatch/cancel
// Delivery rows and compute delivery fees/driver-payout ledger entries):
// createDeliveryForSubOrder, dispatchDelivery,
// cancelActiveDeliveryForSubOrder. Also excluded, as a Pack/Catalog
// display helper that never touches orders/subOrders/orderItems:
// getPackComposition (reads only the packs table via buildPackDetails).
// All four remain resident in server/storage.ts.
//
// Three private helpers are SHARED between Orders and Deliveries
// (confirmed via their own doc comments and real multi-domain call
// sites) and were therefore NOT extracted, per the explicit instruction
// to leave shared methods in their current location:
// recomputeOrderAggregateStatus ("Shared by updateSubOrderStatus() and
// updateDeliveryStatus()" — its own doc comment), and
// generateDeliveryConfirmationCode (used by both createOrder's
// selfPickupCode and createDeliveryForSubOrder's pickupCode/dropoffCode).
// Both, plus buildPackDetails (Pack/Catalog domain, private), were given
// a visibility change from private to public (zero behavior change —
// TypeScript's private/public distinction has no runtime effect) since
// each now has a genuine external caller (OrderStorage) in addition to
// its existing internal caller(s) on DatabaseStorage.
//
// Has a facade constructor argument for 8 distinct cross-domain target
// methods, all still resident on DatabaseStorage:
// createDeliveryForSubOrder/cancelActiveDeliveryForSubOrder (Delivery,
// already public), getVariantsByListingId/restockFromOrderCancellation/
// restockVariantFromOrderCancellation (Supplier/Inventory, already
// public), and recomputeOrderAggregateStatus/
// generateDeliveryConfirmationCode/buildPackDetails (the three
// visibility-changed methods above). One call,
// cancelSupplierSubOrderItems -> this.facade.cancelActiveDeliveryForSubOrder,
// propagates a LIVE transaction client (tx) across the facade boundary —
// verified safe per the Batch 26 precedent, since the call happens
// strictly inside OrderStorage's own db.transaction(...) block, the same
// way it did before this method moved.
export class OrderStorage {
  constructor(private facade: DatabaseStorage) {}
  // ── Orders ──────────────────────────────────────────────────────────────────

  async getOrders(filters?: { cafeId?: number; supplierId?: number; driverId?: number; deliveryCompanyId?: number; viewerRole?: string }): Promise<OrderWithDetails[]> {
    const allOrders = await db.select().from(orders);
    const allItems = await db.select().from(orderItems);
    const allProducts = await db.select().from(products);
    const allUsers = await db.select().from(users);
    const allSubOrders = await db.select().from(subOrders);
    const allDeliveries = await db.select().from(deliveries);

    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const deliveriesBySubOrder = new Map<number, typeof allDeliveries>();
    for (const d of allDeliveries) {
      if (!deliveriesBySubOrder.has(d.subOrderId)) deliveriesBySubOrder.set(d.subOrderId, []);
      deliveriesBySubOrder.get(d.subOrderId)!.push(d);
    }
    // The single active (non-CANCELLED) delivery for a sub-order, if any — mirrors the DB's
    // partial unique index (deliveries_sub_order_active_unique in shared/schema.ts).
    const activeDeliveryFor = (subOrderId: number) =>
      (deliveriesBySubOrder.get(subOrderId) ?? []).find((d) => d.status !== 'CANCELLED') ?? null;

    let filtered = allOrders;
    if (filters?.cafeId) filtered = filtered.filter((o) => o.cafeId === filters.cafeId);
    if (filters?.supplierId) {
      const supplierSubOrderIds = allSubOrders.filter((so) => so.supplierId === filters.supplierId).map((so) => so.orderId);
      filtered = filtered.filter((o) => supplierSubOrderIds.includes(o.id) || o.supplierId === filters.supplierId);
    }
    // Delivery-role scoping is driven by real deliveries rows (never by order.status alone —
    // see canUserAccessOrder below for why the previous status-based check was unsafe).
    if (filters?.driverId) {
      const driverOrderIds = new Set(allDeliveries.filter((d) => d.driverId === filters.driverId).map((d) => d.orderId));
      filtered = filtered.filter((o) => driverOrderIds.has(o.id));
    }
    if (filters?.deliveryCompanyId) {
      const companyOrderIds = new Set(allDeliveries.filter((d) => d.deliveryCompanyId === filters.deliveryCompanyId).map((d) => d.orderId));
      filtered = filtered.filter((o) => companyOrderIds.has(o.id));
    }

    return filtered.map((order) => {
      const cafe = userMap.get(order.cafeId);
      const supplier = order.supplierId ? userMap.get(order.supplierId) : null;
      // Legacy/unused column — see shared/schema.ts orders.deliveryId comment. Never written
      // by any code path; kept only so existing consumers of OrderWithDetails.delivery don't break.
      const legacyDeliveryUser = order.deliveryId ? userMap.get(order.deliveryId) : null;

      // Build all subOrders for this order, each with its own scoped items + its own delivery
      let orderSubOrders = allSubOrders.filter((so) => so.orderId === order.id).map((so) => {
        const delivery = activeDeliveryFor(so.id);
        const deliveryCompany = delivery?.deliveryCompanyId ? userMap.get(delivery.deliveryCompanyId) : null;
        const driver = delivery?.driverId ? userMap.get(delivery.driverId) : null;
        return {
          ...so,
          // Self Pickup secret code — same redaction principle as pickupCode/dropoffCode:
          // only the owning Supplier and Admin ever read it back through the API. The Coffee
          // Owner receives it verbally/in person from the supplier and must type it back to
          // confirm (see storage.confirmSelfPickup) — never fetched here.
          selfPickupCode: ['ADMIN', 'SUPER_ADMIN', 'SUPPLIER'].includes(filters?.viewerRole ?? '') ? so.selfPickupCode : null,
          items: allItems.filter((i) => i.subOrderId === so.id).map((i) => ({ ...i, product: (i.productId != null ? productMap.get(i.productId) : undefined) ?? {} as Product })),
          delivery: delivery ? {
            id: delivery.id,
            status: delivery.status,
            deliveryMode: delivery.deliveryMode,
            deliveryCompany: deliveryCompany ? { id: deliveryCompany.id, name: deliveryCompany.name } : null,
            driver: driver ? { id: driver.id, name: driver.name, phone: driver.phone } : null,
            pickedUpAt: delivery.pickedUpAt,
            inTransitAt: delivery.inTransitAt,
            deliveredAt: delivery.deliveredAt,
            // Redacted to the one role that should read each — see storage.redactDeliveryCodes.
            pickupCode: filters?.viewerRole === 'SUPPLIER' || filters?.viewerRole === 'ADMIN' || filters?.viewerRole === 'SUPER_ADMIN' ? delivery.pickupCode : null,
            dropoffCode: filters?.viewerRole === 'CAFE_OWNER' || filters?.viewerRole === 'ADMIN' || filters?.viewerRole === 'SUPER_ADMIN' ? delivery.dropoffCode : null,
            deliveryFee: delivery.deliveryFee,
            cafeOwnerFeeShareCents: delivery.cafeOwnerFeeShareCents,
            // Same redaction principle as pickupCode/dropoffCode just above: only Admin and
            // the owning Supplier ever see what the Supplier itself absorbs for this
            // delivery — never the Coffee Owner or any other role.
            supplierFeeShareCents: ['ADMIN', 'SUPER_ADMIN', 'SUPPLIER'].includes(filters?.viewerRole ?? '') ? delivery.supplierFeeShareCents : null,
            freeDeliveryApplied: delivery.freeDeliveryApplied,
            vehicleType: delivery.vehicleType,
            distanceKm: delivery.distanceKm,
            roadDistanceKm: delivery.roadDistanceKm,
            estimatedDurationMinutes: delivery.estimatedDurationMinutes,
            // Two-Leg Delivery Distance Model — Leg 1 (driver → supplier) is Supplier/Delivery
            // Company/Admin business, never the Coffee Owner's (see storage.redactDeliveryCodes
            // for the same rule applied to the dedicated delivery-detail views). Distance is
            // also useful to whoever operates the delivery; the financial amount follows the
            // same Admin+Supplier-only gate as supplierFeeShareCents above.
            pickupLegDistanceKm: ['ADMIN', 'SUPER_ADMIN', 'SUPPLIER', 'DELIVERY_COMPANY'].includes(filters?.viewerRole ?? '') ? delivery.pickupLegDistanceKm : null,
            pickupLegFeeCents: ['ADMIN', 'SUPER_ADMIN', 'SUPPLIER'].includes(filters?.viewerRole ?? '') ? delivery.pickupLegFeeCents : null,
          } : null,
        };
      });

      // When filtering by supplierId, restrict subOrders to only that supplier's own.
      // This prevents one supplier from seeing another supplier's items or sub-totals.
      if (filters?.supplierId) {
        orderSubOrders = orderSubOrders.filter((so) => so.supplierId === filters.supplierId);
      }

      // Top-level items: scoped to this supplier's subOrders when supplierId filter is active;
      // full order items for cafe owners and admins.
      const supplierSubOrderIds = filters?.supplierId
        ? new Set(orderSubOrders.map((so) => so.id))
        : null;
      const items = allItems
        .filter((i) => i.orderId === order.id && (supplierSubOrderIds == null || (i.subOrderId != null && supplierSubOrderIds.has(i.subOrderId))))
        .map((i) => ({ ...i, product: (i.productId != null ? productMap.get(i.productId) : undefined) ?? {} as Product }));

      return {
        ...order,
        cafe: { id: order.cafeId, name: cafe?.name ?? "Unknown" },
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        delivery: legacyDeliveryUser ? { id: legacyDeliveryUser.id, name: legacyDeliveryUser.name } : undefined,
        items,
        subOrders: orderSubOrders,
      };
    });
  }

  async getOrder(id: number): Promise<OrderWithDetails | undefined> {
    const all = await this.getOrders();
    return all.find((o) => o.id === id);
  }

  async canUserAccessOrder(userId: number, userRole: string, orderId: number): Promise<boolean> {
    const order = await this.getOrder(orderId);
    if (!order) return false;
    if (['SUPER_ADMIN', 'ADMIN'].includes(userRole)) return true;
    if (userRole === 'CAFE_OWNER') return order.cafeId === userId;
    if (userRole === 'SUPPLIER') {
      return order.supplierId === userId || (order.subOrders ?? []).some((so) => so.supplierId === userId);
    }
    // Delivery Company / Driver: access is based on an actual delivery relationship to this
    // order (a delivery row they own/are assigned to), never on order.status alone. The
    // previous implementation granted access to ANY order in READY/IN_DELIVERY/DELIVERED —
    // a cross-tenant data leak. "Available" (unclaimed) deliveries are visible through
    // GET /api/deliveries instead, which exposes only delivery-scoped fields, not the full
    // order (cafe identity, all items across every supplier).
    if (userRole === 'DRIVER' || userRole === 'DELIVERY_COMPANY') {
      const [row] = await db.select({ id: deliveries.id }).from(deliveries).where(and(
        eq(deliveries.orderId, orderId),
        userRole === 'DRIVER' ? eq(deliveries.driverId, userId) : eq(deliveries.deliveryCompanyId, userId),
      )).limit(1);
      return !!row;
    }
    return false;
  }

  async resolveOrderItems(items: CreateOrderItemInput[]): Promise<CreateOrderItem[]> {
    const resolved: CreateOrderItem[] = [];

    for (const item of items) {
      const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, item.listingId));
      if (!listing) throw new Error(`Listing ${item.listingId} not found`);
      if (listing.supplierId !== item.supplierId) throw new Error('Supplier mismatch for listing');
      if (listing.productId !== item.productId) throw new Error('Product mismatch for listing');
      // Standalone purchase entry point — this is never reached for pack
      // items (resolvePackOrderItems is a separate function), so a hidden
      // individual listing can't be bought directly even if a stale client
      // still has it in cart, while packs referencing it stay purchasable.
      if (!listing.isIndividuallyVisible) throw new Error(`${item.productName ?? 'Product'} is no longer available`);

      const [product] = await db.select().from(products).where(eq(products.id, item.productId));
      if (!product?.isAdminProduct) throw new Error('Product is not available in marketplace');
      const [category] = product.categoryId
        ? await db.select().from(categories).where(eq(categories.id, product.categoryId))
        : [];
      const [subCategory] = product.subCategoryId
        ? await db.select().from(subCategories).where(eq(subCategories.id, product.subCategoryId))
        : [];
      const [brand] = product.brandId
        ? await db.select().from(brands).where(eq(brands.id, product.brandId))
        : [];

      const variants = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, item.listingId));
      let unitPrice: number;

      if (variants.length > 0) {
        const variant = variants.find(
          (v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null),
        );
        if (!variant) throw new Error('Selected variant not found');
        if (variant.quantity < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
        unitPrice = variant.price;
      } else {
        if (listing.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
        unitPrice = listing.price;
      }

      const [supplier] = await db.select().from(users).where(eq(users.id, listing.supplierId));
      resolved.push({
        listingId: item.listingId,
        productId: item.productId,
        supplierId: item.supplierId,
        supplierName: supplier?.name ?? item.supplierName ?? 'Unknown',
        productName: product.name,
        productImageUrl: product.imageUrl ?? null,
        productCategory: product.category ?? '',
        flavorId: item.flavorId ?? null,
        sizeId: item.sizeId ?? null,
        flavorName: item.flavorId != null
          ? ((await db.select().from(flavors).where(eq(flavors.id, item.flavorId)))[0]?.name ?? item.flavorName ?? null)
          : null,
        sizeName: item.sizeId != null
          ? ((await db.select().from(sizes).where(eq(sizes.id, item.sizeId)))[0]?.name ?? item.sizeName ?? null)
          : null,
        brandName: brand?.name ?? null,
        categoryName: category?.name ?? product.category ?? null,
        subCategoryName: subCategory?.name ?? null,
        quantity: item.quantity,
        unitPrice,
      });
    }

    return resolved;
  }

  /**
   * Maps the Coffee Owner's actual per-order Pack selection (captured as
   * includedProducts — the same data orderItems.snapshot already stores and the order's
   * product display already reads) to the real supplierProductVariants/listing rows it
   * consumes, with the exact quantity against each. This is the single place that decides
   * "which inventory row does this selection refer to" — reused by the order-creation-time
   * stock check (resolvePackOrderItems), the confirmation-time deduction
   * (deductPackComponentStock), and the cancellation-time restoration
   * (restorePackComponentStock), so none of the three can ever disagree about which
   * variant a selection means.
   *
   * A Pack can include the same base product more than once across different size groups
   * (e.g. one component slot sized "Stika", a separate slot sized "1L") — size is what
   * disambiguates which slot a selected flavor belongs to. Falls back to the Pack's own
   * default/representative variant (the pre-existing behavior) whenever a selection can't
   * be matched — e.g. a legacy order placed before this fix, whose stored selection lacks
   * enough detail to match precisely.
   *
   * NOTE: deductPackComponentStock now runs at order CREATION time (not confirmation) so
   * Pack components reserve stock immediately, the same way regular items already do — see
   * createOrder.
   */
  private async resolvePackComponentDeductions(
    packId: number,
    orderQty: number,
    includedProducts: Array<{ productId?: number; flavorName?: string | null; sizeName?: string | null; quantity: number }>,
    client: any = db,
  ): Promise<{ variants: Map<number, number>; listings: Map<number, number>; affectedListingIds: Set<number> }> {
    const variants = new Map<number, number>();
    const listings = new Map<number, number>();
    const affectedListingIds = new Set<number>();

    const components = await client.select().from(packItems).where(eq(packItems.packId, packId));
    if (!components.length) return { variants, listings, affectedListingIds };

    const listingIds: number[] = Array.from(new Set(components.map((c: any) => c.listingId as number)));
    const listingRows = listingIds.length
      ? await client.select().from(supplierProductListings).where(inArray(supplierProductListings.id, listingIds))
      : [];
    const listingProductId = new Map(listingRows.map((l: any) => [l.id, l.productId]));

    const { flvMap, szMap } = await buildTaxonomyCache();
    const flavorIdByName = new Map<string, number>();
    for (const f of Array.from(flvMap.values())) flavorIdByName.set(f.name, f.id);

    for (const comp of components) {
      affectedListingIds.add(comp.listingId);
      const defaultQty = comp.quantity * orderQty;

      if (comp.variantId == null) {
        // No flavor/size distribution exists for this component — quantity is scoped to
        // the listing itself, so the Pack's own defined per-pack quantity is authoritative.
        listings.set(comp.listingId, (listings.get(comp.listingId) ?? 0) + defaultQty);
        continue;
      }

      const [representative] = await client.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, comp.variantId));
      if (!representative) continue;
      const repSizeId = representative.sizeId ?? null;
      const repSizeName = repSizeId != null ? (szMap.get(repSizeId)?.name ?? null) : null;
      const compProductId = listingProductId.get(comp.listingId);

      const matching = includedProducts.filter((s) =>
        (compProductId == null || s.productId == null || s.productId === compProductId) &&
        (s.sizeName ?? null) === repSizeName,
      );

      if (!matching.length) {
        variants.set(representative.id, (variants.get(representative.id) ?? 0) + defaultQty);
        continue;
      }

      const groupVariants = await client.select().from(supplierProductVariants).where(and(
        eq(supplierProductVariants.listingId, comp.listingId),
        repSizeId == null ? isNull(supplierProductVariants.sizeId) : eq(supplierProductVariants.sizeId, repSizeId),
      ));

      for (const sel of matching) {
        let target = representative;
        if (sel.flavorName) {
          const flavorId = flavorIdByName.get(sel.flavorName);
          const variantForFlavor = flavorId != null ? groupVariants.find((v: any) => v.flavorId === flavorId) : undefined;
          if (variantForFlavor) target = variantForFlavor;
        }
        variants.set(target.id, (variants.get(target.id) ?? 0) + sel.quantity);
      }
    }

    return { variants, listings, affectedListingIds };
  }

  async resolvePackOrderItems(items: CreatePackOrderItem[]): Promise<ResolvedPackOrderItem[]> {
    const resolved: ResolvedPackOrderItem[] = [];
    for (const item of items) {
      const [pack] = await db.select().from(packs).where(eq(packs.id, item.packId));
      if (!pack) throw new Error(`Pack ${item.packId} not found`);
      if (pack.supplierId !== item.supplierId) throw new Error('Supplier mismatch for pack');
      const [detail] = await this.facade.buildPackDetails([pack]);
      if (!detail || !detail.isAvailable) throw new Error(`Pack ${pack.name} is not available`);
      if (item.quantity > Math.min(pack.quantityAvailable, detail.maxBuildable)) {
        throw new Error(`Insufficient stock for pack ${pack.name}`);
      }
      // The check above only verifies stock at the flavor-GROUP level (e.g. "enough
      // combined stock across every flavor of this size"). It can pass while the ONE
      // exact flavor/size the Coffee Owner actually selected is low or fully out — verify
      // that specifically before accepting the order.
      if (item.includedProducts?.length) {
        const { variants, listings } = await this.resolvePackComponentDeductions(item.packId, item.quantity, item.includedProducts);
        if (variants.size) {
          const variantIds = Array.from(variants.keys());
          const variantRows = await db.select().from(supplierProductVariants).where(inArray(supplierProductVariants.id, variantIds));
          const variantById = new Map(variantRows.map((v) => [v.id, v]));
          for (const [variantId, needed] of Array.from(variants)) {
            const row = variantById.get(variantId);
            if (!row || row.quantity < needed) {
              throw new Error(`Insufficient stock for pack ${pack.name}`);
            }
          }
        }
        if (listings.size) {
          const listingIds = Array.from(listings.keys());
          const listingRows = await db.select().from(supplierProductListings).where(inArray(supplierProductListings.id, listingIds));
          const listingById = new Map(listingRows.map((l) => [l.id, l]));
          for (const [listingId, needed] of Array.from(listings)) {
            const row = listingById.get(listingId);
            if (!row || row.stock < needed) {
              throw new Error(`Insufficient stock for pack ${pack.name}`);
            }
          }
        }
      }
      const [supplier] = await db.select().from(users).where(eq(users.id, pack.supplierId));
      const includedProducts = item.includedProducts?.length
        ? item.includedProducts.map((included) => ({ ...included }))
        : detail.items.flatMap((included) => [{
            productId: included.productId,
            productName: included.productName,
            productImageUrl: included.productImageUrl,
            brandName: included.brandName ?? null,
            categoryName: included.categoryName ?? null,
            subCategoryName: included.subCategoryName ?? null,
            flavorName: included.flavorName,
            sizeName: included.sizeName,
            quantity: included.quantity,
          }]);
      resolved.push({
        packId: pack.id,
        packName: pack.name,
        supplierId: pack.supplierId,
        supplierName: supplier?.name ?? 'Unknown',
        quantity: item.quantity,
        unitPrice: pack.price,
        packImageUrl: pack.imageUrl ?? null,
        includedProducts,
      });
    }
    return resolved;
  }

  /**
   * Validate a previous order's items against the current marketplace state.
   * Returns which items can be re-added as-is, which need attention, and resolved pack items.
   */
  async getReorderData(orderId: number, cafeId: number): Promise<{
    items: import("@shared/schema").CreateOrderItem[];
    packItems: import("@shared/schema").CreatePackOrderItem[];
    unavailable: { name: string; reason: string }[];
  }> {
    const order = await this.getOrder(orderId);
    if (!order || order.cafeId !== cafeId) throw new Error('Order not found');

    const items: import("@shared/schema").CreateOrderItem[] = [];
    const packItems: import("@shared/schema").CreatePackOrderItem[] = [];
    const unavailable: { name: string; reason: string }[] = [];

    for (const item of order.items) {
      if (item.packId) {
        const [pack] = await db.select().from(packs).where(eq(packs.id, item.packId));
        if (!pack || pack.isArchived || pack.visibility !== 'VISIBLE') {
          unavailable.push({ name: item.packName ?? `Pack #${item.packId}`, reason: 'Pack no longer available' });
          continue;
        }
        const [detail] = await this.facade.buildPackDetails([pack]);
        const available = Math.min(pack.quantityAvailable, detail?.maxBuildable ?? 0);
        if (available < item.quantity) {
          unavailable.push({ name: pack.name, reason: available === 0 ? 'Out of stock' : `Only ${available} available` });
          continue;
        }
        packItems.push({
          packId: pack.id,
          supplierId: pack.supplierId,
          quantity: item.quantity,
          packName: pack.name,
          packImageUrl: pack.imageUrl ?? null,
          supplierName: detail?.supplierName ?? '',
          includedProducts: (item.snapshot as any)?.kind === "PACK" && Array.isArray((item.snapshot as any).includedProducts)
            // The stored snapshot holds the FINAL distribution for all packs in this
            // historical order. The cart also stores the current total distribution,
            // so restore the snapshot unchanged.
            ? (item.snapshot as any).includedProducts.map((included: any) => ({
                ...included,
                quantity: Math.max(1, included.quantity ?? 1),
              }))
            : (detail?.items ?? []).map((pi: any) => ({
                productId: pi.productId ?? 0,
                productName: pi.productName ?? pi.product?.name ?? '',
                productImageUrl: pi.productImageUrl ?? null,
                brandName: pi.brandName ?? null,
                categoryName: pi.categoryName ?? null,
                subCategoryName: pi.subCategoryName ?? null,
                flavorName: pi.flavorName ?? null,
                sizeName: pi.sizeName ?? null,
                quantity: (pi.quantity ?? 1) * item.quantity,
              })),
          unitPrice: pack.price ?? 0,
        } as any);
        continue;
      }

      if (!item.productId) continue;
      // Find listing: use stored listingId or look up by productId+supplierId from subOrder
      const subOrder = (order.subOrders ?? []).find(so => so.items.some(i => i.id === item.id));
      const supplierId = subOrder?.supplierId;
      let listingId: number | null = (item as any).listingId ?? null;
      if (!listingId && supplierId) {
        const [listing] = await db.select().from(supplierProductListings)
          .where(and(eq(supplierProductListings.productId, item.productId), eq(supplierProductListings.supplierId, supplierId)));
        listingId = listing?.id ?? null;
      }
      if (!listingId) { unavailable.push({ name: item.product?.name ?? `Product #${item.productId}`, reason: 'No longer offered by supplier' }); continue; }

      const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
      if (!listing || listing.visibility !== 'VISIBLE' || !listing.isIndividuallyVisible) { unavailable.push({ name: item.product?.name ?? '', reason: 'No longer available' }); continue; }

      const [product] = await db.select().from(products).where(eq(products.id, item.productId));
      if (!product?.isAdminProduct || product.status !== 'ACTIVE') { unavailable.push({ name: product?.name ?? '', reason: 'Product no longer available' }); continue; }
      const [category] = product.categoryId ? await db.select().from(categories).where(eq(categories.id, product.categoryId)) : [];
      const [subCategory] = product.subCategoryId ? await db.select().from(subCategories).where(eq(subCategories.id, product.subCategoryId)) : [];
      const [brand] = product.brandId ? await db.select().from(brands).where(eq(brands.id, product.brandId)) : [];
      const snapshot = item.snapshot as any;
      const baseItem = {
        productName: product.name,
        productImageUrl: product.imageUrl ?? null,
        productCategory: product.category ?? '',
        brandName: snapshot?.brandName ?? brand?.name ?? null,
        categoryName: snapshot?.categoryName ?? category?.name ?? product.category ?? null,
        subCategoryName: snapshot?.subCategoryName ?? subCategory?.name ?? null,
        flavorName: snapshot?.flavorName ?? (item as any).flavorName ?? null,
        sizeName: snapshot?.sizeName ?? (item as any).sizeName ?? null,
      };

      const [supplier] = await db.select().from(users).where(eq(users.id, listing.supplierId));
      const variants = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, listingId));

      if (variants.length > 0) {
        const variant = variants.find(v => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (!variant) { unavailable.push({ name: product.name, reason: 'Selected variant no longer available' }); continue; }
        if (variant.quantity < item.quantity) {
          if (variant.quantity === 0) { unavailable.push({ name: product.name, reason: 'Out of stock' }); continue; }
          unavailable.push({ name: product.name, reason: `Only ${variant.quantity} available` });
          // Add with reduced quantity
          items.push({ listingId, productId: item.productId, supplierId: listing.supplierId, supplierName: supplier?.name ?? '', flavorId: item.flavorId, sizeId: item.sizeId, ...baseItem, quantity: variant.quantity, unitPrice: variant.price } as any);
          continue;
        }
        items.push({ listingId, productId: item.productId, supplierId: listing.supplierId, supplierName: supplier?.name ?? '', flavorId: item.flavorId, sizeId: item.sizeId, ...baseItem, quantity: item.quantity, unitPrice: variant.price } as any);
      } else {
        if (listing.stock < item.quantity) {
          if (listing.stock === 0) { unavailable.push({ name: product.name, reason: 'Out of stock' }); continue; }
          unavailable.push({ name: product.name, reason: `Only ${listing.stock} available` });
          items.push({ listingId, productId: item.productId, supplierId: listing.supplierId, supplierName: supplier?.name ?? '', flavorId: null, sizeId: null, ...baseItem, quantity: listing.stock, unitPrice: listing.price } as any);
          continue;
        }
        items.push({ listingId, productId: item.productId, supplierId: listing.supplierId, supplierName: supplier?.name ?? '', flavorId: null, sizeId: null, ...baseItem, quantity: item.quantity, unitPrice: listing.price } as any);
      }
    }

    return { items, packItems, unavailable };
  }

  async createOrder(
    cafeId: number,
    cartItems: CreateOrderItem[],
    opts?: {
      deliveryAddress?: import("@shared/schema").GeoLocation;
      deliveryMethod?: 'SELF_PICKUP' | 'DELIVERY_SERVICE';
      deliveryFee?: number;
      paymentMethod?: string;
      courierInstructions?: string;
      packItems?: ResolvedPackOrderItem[];
      promotionResults?: import("@shared/schema").SupplierPromotionResult[];
      // At most one applied Discount Code — it belongs to exactly one supplier (see
      // shared/schema.ts note), so it only ever affects that supplier's own sub-order.
      discountCodeResult?: import("@shared/schema").DiscountCodeValidationResult & { supplierId: number };
      priority?: string;
      scheduledAt?: Date;
    },
  ): Promise<Order> {
    const packOrderItems = opts?.packItems ?? [];
    const promoResults = opts?.promotionResults ?? [];
    // Build a discount map by supplierId for fast lookup
    const discountBySupplierId = new Map<number, import("@shared/schema").SupplierPromotionResult>();
    for (const r of promoResults) discountBySupplierId.set(r.supplierId, r);
    const discountCodeResult = opts?.discountCodeResult?.valid ? opts.discountCodeResult : undefined;

    const rawTotal = cartItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
      + packOrderItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const totalDiscount = promoResults.reduce((s, r) => s + r.discountAmount, 0) + (discountCodeResult?.discountAmount ?? 0);
    const totalAmount = Math.max(0, rawTotal - totalDiscount);
    const supplierIds = Array.from(new Set([...cartItems.map((i) => i.supplierId), ...packOrderItems.map((i) => i.supplierId)]));
    const primarySupplierId = supplierIds.length === 1 ? supplierIds[0] : null;

    // The whole order — including every stock reservation it makes — is one atomic
    // transaction. Each deduction below is a conditional UPDATE ... WHERE quantity >= needed
    // RETURNING; if the row isn't returned, stock was insufficient (possibly because a
    // concurrent order just consumed it) and we throw, which rolls back everything written
    // so far in this order — no partial order, no oversold/negative stock, no phantom
    // reservation. This replaces the previous read-then-write check (racy under concurrent
    // requests — two orders could both read "enough stock" before either wrote its
    // decrement) with a single atomic statement per row.
    const order = await db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({
        cafeId,
        supplierId: primarySupplierId,
        status: 'PENDING',
        totalAmount,
        deliveryAddress: opts?.deliveryAddress ?? null,
        deliveryMethod: opts?.deliveryMethod ?? 'DELIVERY_SERVICE',
        deliveryFee: opts?.deliveryFee ?? 0,
        courierInstructions: opts?.courierInstructions?.trim() || null,
        paymentMethod: opts?.paymentMethod ?? 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        priority: (opts?.priority ?? 'NORMAL') as any,
        scheduledAt: opts?.scheduledAt ?? null,
      }).returning();

      for (const item of cartItems) {
        const variants = await tx.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, item.listingId));
        if (variants.length > 0) {
          const variant = variants.find(
            (v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null),
          );
          if (variant) {
            const [decremented] = await tx.update(supplierProductVariants)
              .set({ quantity: sql`${supplierProductVariants.quantity} - ${item.quantity}` })
              .where(and(eq(supplierProductVariants.id, variant.id), gte(supplierProductVariants.quantity, item.quantity)))
              .returning();
            if (!decremented) throw new Error(`Insufficient stock for ${item.productName ?? 'this item'}`);
          }
        } else {
          const [decremented] = await tx.update(supplierProductListings)
            .set({ stock: sql`${supplierProductListings.stock} - ${item.quantity}` })
            .where(and(eq(supplierProductListings.id, item.listingId), gte(supplierProductListings.stock, item.quantity)))
            .returning();
          if (!decremented) throw new Error(`Insufficient stock for ${item.productName ?? 'this item'}`);
        }

        // Recompute this listing's aggregate stock/price from its own variants — inline via
        // tx (not this.getVariantsByListingId, which reads through a separate connection and
        // would not see the decrement just written above within this same transaction).
        const listingVariants = await tx.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, item.listingId));
        const aggStock = listingVariants.reduce((s, v) => s + v.quantity, 0);
        const aggPrice = listingVariants.length ? Math.min(...listingVariants.map((v) => v.price)) : 0;
        await tx.update(supplierProductListings)
          .set({ stock: aggStock, price: aggPrice })
          .where(eq(supplierProductListings.id, item.listingId));
      }

      for (const item of packOrderItems) {
        const [decremented] = await tx.update(packs)
          .set({ quantityAvailable: sql`${packs.quantityAvailable} - ${item.quantity}` })
          .where(and(eq(packs.id, item.packId), gte(packs.quantityAvailable, item.quantity)))
          .returning();
        if (!decremented) throw new Error(`Insufficient stock for pack ${item.packName ?? ''}`);
      }

      // Always create sub-orders (even for single supplier) to store promotion snapshots
      const allSupplierIds = [...supplierIds]; // already built above
      if (allSupplierIds.length > 0) {
        for (const sid of allSupplierIds) {
          const supplierItems = cartItems.filter((i) => i.supplierId === sid);
          const supplierPackItems = packOrderItems.filter((i) => i.supplierId === sid);
          const rawSubtotal = supplierItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
            + supplierPackItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
          const promoResult = discountBySupplierId.get(sid);
          const discountAmount = promoResult?.discountAmount ?? 0;
          // A Discount Code only ever targets one supplier — apply it exclusively to that
          // supplier's own sub-order, on top of any promotion discount already computed above.
          const codeForThisSupplier = discountCodeResult?.supplierId === sid ? discountCodeResult : undefined;
          const discountCodeAmount = codeForThisSupplier?.discountAmount ?? 0;
          const subtotal = Math.max(0, rawSubtotal - discountAmount - discountCodeAmount);
          const supplierName = supplierItems[0]?.supplierName ?? supplierPackItems[0]?.supplierName ?? 'Unknown';
          const subOrderData: any = {
            orderId: order.id,
            supplierId: sid,
            supplierName,
            subtotal,
            discountAmount,
            freeShipping: promoResult?.freeShipping ?? false,
            giftInfo: promoResult?.giftInfo ?? null,
            discountCodeAmount,
            // Self Pickup (Delivery System V2) — generated once at order creation, same
            // 6-digit confirmation-code convention as deliveries.pickupCode/dropoffCode
            // (see generateDeliveryConfirmationCode). Every supplier in a self-pickup order
            // gets its own independent code, matching the existing "one sub-order = one
            // independent fulfillment" principle already used for normal deliveries.
            selfPickupCode: opts?.deliveryMethod === 'SELF_PICKUP' ? this.facade.generateDeliveryConfirmationCode() : null,
          };
          if (opts?.deliveryMethod === 'SELF_PICKUP') {
            // Snapshot the supplier's CURRENT pickup location — same principle as
            // createDeliveryForSubOrder's pickupAddress snapshot for normal deliveries: a
            // supplier changing their profile address later must never rewrite an
            // already-placed order's pickup point.
            const [supplierUser] = await tx.select().from(users).where(eq(users.id, sid));
            subOrderData.selfPickupAddress = {
              address: supplierUser?.locationAddress ?? '',
              lat: supplierUser?.locationLat ?? '',
              lng: supplierUser?.locationLng ?? '',
              placeId: supplierUser?.locationPlaceId ?? '',
              details: supplierUser?.locationDetails ?? undefined,
            };
          }
          if (promoResult?.promotionId) {
            subOrderData.promotionId = promoResult.promotionId;
            subOrderData.promotionName = promoResult.promotionName;
            subOrderData.promotionType = promoResult.promotionType;
          }
          if (codeForThisSupplier?.discountCodeId) {
            subOrderData.discountCodeId = codeForThisSupplier.discountCodeId;
            subOrderData.discountCodeSnapshot = codeForThisSupplier.code;
          }
          if (promoResult?.promotionId || codeForThisSupplier?.discountCodeId) {
            subOrderData.originalSubtotal = rawSubtotal;
          }
          const [so] = await tx.insert(subOrders).values(subOrderData).returning();
          if (codeForThisSupplier?.discountCodeId && discountCodeAmount > 0) {
            await tx.insert(discountCodeUsage).values({
              discountCodeId: codeForThisSupplier.discountCodeId,
              cafeId,
              orderId: order.id,
              subOrderId: so.id,
              discountAmount: discountCodeAmount,
            });
            await tx.update(discountCodes)
              .set({ usageCount: sql`${discountCodes.usageCount} + 1` })
              .where(eq(discountCodes.id, codeForThisSupplier.discountCodeId));
          }
          for (const item of supplierItems) {
            await tx.insert(orderItems).values({
              orderId: order.id,
              subOrderId: so.id,
              productId: item.productId,
              listingId: item.listingId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice * item.quantity,
              flavorId: item.flavorId ?? null,
              sizeId: item.sizeId ?? null,
              snapshot: {
                kind: "PRODUCT",
                productId: item.productId,
                productName: item.productName,
                productImageUrl: (item as any).productImageUrl ?? null,
                supplierName: item.supplierName,
                brandName: item.brandName ?? null,
                categoryName: item.categoryName ?? null,
                subCategoryName: item.subCategoryName ?? null,
                flavorName: item.flavorName ?? null,
                sizeName: item.sizeName ?? null,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.unitPrice * item.quantity,
              },
            });
          }
          for (const item of supplierPackItems) {
            await tx.insert(orderItems).values({
              orderId: order.id,
              subOrderId: so.id,
              packId: item.packId,
              packName: item.packName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice * item.quantity,
              snapshot: {
                kind: "PACK",
                packId: item.packId,
                packName: item.packName,
                packImageUrl: item.packImageUrl,
                supplierName: item.supplierName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.unitPrice * item.quantity,
                includedProducts: item.includedProducts,
              },
            });
          }
          // Reserve Pack component variant/listing stock immediately at order creation —
          // mirrors regular items (deducted above, unconditionally, at creation) rather than
          // waiting for supplier confirmation. Runs after this sub-order's pack order items
          // are inserted so deductPackComponentStock (which reads them back by subOrderId)
          // sees the exact selection just written. Passed this same tx so its guarded
          // decrements participate in the same atomic transaction. See updateSubOrderStatus,
          // which no longer deducts on confirmation to avoid double-deducting the same stock.
          if (supplierPackItems.length > 0) {
            await this.deductPackComponentStock(so.id, tx);
          }
        }
      }
      return order;
    });
    return order;
  }

  async updateSubOrderStatus(subOrderId: number, status: string): Promise<SubOrder> {
    // Read existing status so we can detect status transitions
    const [existing] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!existing) throw new Error('SubOrder not found');

    // ── Atomic: sub-order status write + Delivery creation/cancellation + order
    // aggregation. Wrapped in one transaction so "sub-order is READY but no Delivery
    // exists" (or "order aggregate didn't advance") can never be observed by a concurrent
    // reader — see shared/schema.ts "Deliveries" section and the sync spec's transaction
    // requirement.
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(subOrders).set({ status }).where(eq(subOrders.id, subOrderId)).returning();
      if (!row) throw new Error('SubOrder not found');

      // Shop → Delivery hand-off: a sub-order reaching READY creates exactly one Delivery.
      // createDeliveryForSubOrder is idempotent (DB-level ON CONFLICT DO NOTHING against the
      // active-delivery partial unique index), so firing this twice — e.g. a duplicate
      // client retry — can never create a second Delivery for the same sub-order.
      if (existing.status !== 'READY' && status === 'READY') {
        await this.facade.createDeliveryForSubOrder(subOrderId, tx);
      }
      // A supplier rejecting/cancelling a sub-order that already has an active (unclaimed or
      // in-progress-but-not-yet-picked-up) Delivery must not leave that Delivery dangling
      // against a cancelled order (orphan-delivery prevention).
      if (status === 'CANCELLED') {
        await this.facade.cancelActiveDeliveryForSubOrder(subOrderId, tx);
      }

      await this.facade.recomputeOrderAggregateStatus(existing.orderId, tx);
      return row;
    });

    // Stock adjustments intentionally run outside the transaction above — unrelated to
    // Delivery sync. Both regular items AND pack components are now reserved unconditionally
    // at order CREATION time (see createOrder), so confirmation never deducts anything —
    // it only advances status. Restore both whenever this sub-order transitions to CANCELLED
    // for the first time, regardless of whether it ever reached CONFIRMED (the common
    // Supplier "Demandes de commandes" reject-a-still-PENDING-request path).
    if (existing.status !== 'CANCELLED' && status === 'CANCELLED') {
      await this.restoreSubOrderPackStock(subOrderId);
      await this.restockSubOrderRegularItems(subOrderId, existing.orderId);
    }

    return updated;
  }

  /**
   * Self Pickup confirmation (Delivery System V2) — the Coffee Owner types back the 6-digit
   * code the Supplier gave them in person. Mirrors the normal-delivery dropoffCode check in
   * updateDeliveryStatus (same "never trust the frontend, verify server-side" rule), but for
   * a sub-order that never gets a Delivery row at all (createDeliveryForSubOrder already
   * refuses to run for SELF_PICKUP orders). Confirming goes straight PENDING-chain → READY →
   * DELIVERED: once the Coffee Owner has physically collected the order there is no further
   * courier handoff to track, so "Picked Up" and "Completed" are the same real-world moment —
   * see the Self-Pickup progress stepper on the client, which reads this as one immediate
   * transition rather than two separately-timed statuses.
   */
  async confirmSelfPickup(subOrderId: number, cafeOwnerId: number, code: string): Promise<SubOrder> {
    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!subOrder) throw new Error('SubOrder not found');
    const [order] = await db.select().from(orders).where(eq(orders.id, subOrder.orderId));
    if (!order) throw new Error('Order not found');
    if (order.cafeId !== cafeOwnerId) throw new Error('Forbidden');
    if (order.deliveryMethod !== 'SELF_PICKUP') throw new Error('This order is not Self Pickup');
    if (subOrder.status !== 'READY') throw new Error('This order is not ready for pickup yet');
    if (!subOrder.selfPickupCode) throw new Error('No pickup code exists for this order');
    if (subOrder.selfPickupCodeConfirmedAt) throw new Error('This pickup code has already been used');
    if (subOrder.selfPickupCode !== code.trim()) throw new Error('Incorrect pickup code');

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(subOrders)
        .set({ status: 'DELIVERED', selfPickupCodeConfirmedAt: new Date(), selfPickupConfirmedByUserId: cafeOwnerId })
        .where(and(eq(subOrders.id, subOrderId), isNull(subOrders.selfPickupCodeConfirmedAt)))
        .returning();
      if (!row) throw new Error('This pickup code has already been used');
      await this.facade.recomputeOrderAggregateStatus(subOrder.orderId, tx);
      return row;
    });
    return updated;
  }

  async updateOrderStatus(id: number, status: typeof orders.$inferSelect.status, deliveryId?: number) {
    const [existing] = await db.select().from(orders).where(eq(orders.id, id));
    const updates: any = { status };
    if (deliveryId) updates.deliveryId = deliveryId;
    const [updated] = await db.update(orders).set(updates).where(eq(orders.id, id)).returning();

    // Restock inventory when an order is cancelled (covers cancellation and refund flows,
    // since this schema has no separate REFUNDED status — refunds are modeled as cancellations).
    if (existing && existing.status !== 'CANCELLED' && status === 'CANCELLED') {
      await this.restockOrderInventory(id);
    }
    return updated;
  }

  /** Restores stock for every item in an order back to the suppliers' listings/variants. Used on order cancellation. */
  private async restockOrderInventory(orderId: number) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      if (item.packId) {
        // If the sub-order was already cancelled (supplier rejected), its own cancellation
        // path (updateSubOrderStatus -> restoreSubOrderPackStock) already restored both
        // pack-level and component stock — skip to avoid double-restock.
        if (item.subOrderId) {
          const [so] = await db.select().from(subOrders).where(eq(subOrders.id, item.subOrderId));
          if (so?.status === 'CANCELLED') {
            continue;
          }
        }
        // Pack component stock is reserved unconditionally at order creation (see
        // createOrder), so it must always be restored here too — regardless of whether the
        // sub-order ever reached CONFIRMED.
        await db.update(packs).set({ quantityAvailable: sql`${packs.quantityAvailable} + ${item.quantity}` }).where(eq(packs.id, item.packId));
        const snapshot = (item.snapshot ?? {}) as any;
        const includedProducts = Array.isArray(snapshot.includedProducts) ? snapshot.includedProducts : [];
        await this.restorePackComponentStock(item.packId, item.quantity, includedProducts);
        continue;
      }
      if (!item.productId) continue;

      // Prefer the stored listingId — this is the most accurate source for multi-supplier orders
      // because each item knows exactly which listing it came from.
      let listingId: number | null = item.listingId ?? null;

      if (!listingId) {
        // Fallback: look up by product + suborder supplier
        let supplierId: number | null = null;
        if (item.subOrderId) {
          const [so] = await db.select().from(subOrders).where(eq(subOrders.id, item.subOrderId));
          supplierId = so?.supplierId ?? null;
        }
        if (!supplierId) {
          const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
          supplierId = order?.supplierId ?? null;
        }
        const candidateListings = supplierId
          ? await db.select().from(supplierProductListings).where(and(eq(supplierProductListings.productId, item.productId), eq(supplierProductListings.supplierId, supplierId)))
          : await db.select().from(supplierProductListings).where(eq(supplierProductListings.productId, item.productId));
        listingId = candidateListings[0]?.id ?? null;
      }

      if (!listingId) continue;

      if (item.flavorId != null || item.sizeId != null) {
        const variants = await this.facade.getVariantsByListingId(listingId);
        const variant = variants.find((v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (variant) {
          await this.facade.restockVariantFromOrderCancellation(variant.id, item.quantity, `Order #${orderId} cancelled`);
          continue;
        }
      }
      await this.facade.restockFromOrderCancellation(listingId, item.quantity, `Order #${orderId} cancelled`);
    }
  }

  /**
   * Restores stock for every still-ACTIVE regular (non-Pack) item in ONE sub-order — used
   * when a Supplier rejects/cancels that specific sub-order (see updateSubOrderStatus).
   * Regular item stock (like Pack component stock — see deductPackComponentStock) is
   * deducted at order CREATION time, so it must be restored here regardless of whether this
   * sub-order had ever reached CONFIRMED. Skips items
   * already marked CANCELLED (e.g. individually cancelled earlier via
   * cancelSubOrderItems, which already restocked them) so nothing is ever restocked twice.
   * Reuses the exact same restockVariantFromOrderCancellation/restockFromOrderCancellation
   * primitives restockOrderInventory and cancelSubOrderItems already use — one inventory
   * restoration mechanism, not a parallel one.
   */
  private async restockSubOrderRegularItems(subOrderId: number, orderId: number): Promise<void> {
    const items = await db.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    for (const item of items) {
      if (item.packId) continue; // Pack components are handled separately (see restoreSubOrderPackStock).
      if (item.status === 'CANCELLED') continue;
      if (!item.productId || !item.listingId) continue;

      if (item.flavorId != null || item.sizeId != null) {
        const variants = await this.facade.getVariantsByListingId(item.listingId);
        const variant = variants.find((v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (variant) {
          await this.facade.restockVariantFromOrderCancellation(variant.id, item.quantity, `Order #${orderId} sub-order rejected`);
          continue;
        }
      }
      await this.facade.restockFromOrderCancellation(item.listingId, item.quantity, `Order #${orderId} sub-order rejected`);
    }
  }

  /**
   * Deducts variant/flavor stock for every pack item in a sub-order at order creation.
   * Accepts an optional transaction client (see createOrder, which always passes its own
   * tx) so its guarded decrements participate in the caller's atomic transaction rather than
   * running as separate, non-atomic statements.
   */
  private async deductPackComponentStock(subOrderId: number, client: any = db): Promise<void> {
    const items = await client.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    const packOrderItems = items.filter((i: any) => i.packId != null);
    if (!packOrderItems.length) return;

    // Accumulate across every Pack line in this sub-order before writing — if the SAME
    // variant is consumed by more than one Pack purchased in the same order (e.g. Pack A
    // and Pack B both include Boga/Citron/Stika), the quantities are summed into one final
    // decrement per variant, never applied as separate partial writes.
    const variantTotals = new Map<number, number>();
    const listingTotals = new Map<number, number>();
    const affectedListingIds = new Set<number>();

    for (const orderItem of packOrderItems) {
      const snapshot = (orderItem.snapshot ?? {}) as any;
      const includedProducts = Array.isArray(snapshot.includedProducts) ? snapshot.includedProducts : [];
      const { variants, listings, affectedListingIds: compListings } =
        await this.resolvePackComponentDeductions(orderItem.packId!, orderItem.quantity, includedProducts, client);
      for (const [variantId, qty] of Array.from(variants)) variantTotals.set(variantId, (variantTotals.get(variantId) ?? 0) + qty);
      for (const [listingId, qty] of Array.from(listings)) listingTotals.set(listingId, (listingTotals.get(listingId) ?? 0) + qty);
      for (const id of Array.from(compListings)) affectedListingIds.add(id);
    }

    // Guarded conditional decrements (WHERE quantity >= needed RETURNING) — same atomicity
    // guarantee as the regular-item decrement in createOrder: if the exact selected
    // flavor/size doesn't have enough stock (e.g. a concurrent order just consumed it), throw
    // and let the caller's transaction roll back, instead of silently clamping to 0 (which
    // would create phantom stock on restoration — the restore always adds back the full
    // nominal quantity, so a clamped/truncated deduction would over-restore later).
    for (const [variantId, qty] of Array.from(variantTotals)) {
      if (qty <= 0) continue;
      const [decremented] = await client.update(supplierProductVariants)
        .set({ quantity: sql`${supplierProductVariants.quantity} - ${qty}` })
        .where(and(eq(supplierProductVariants.id, variantId), gte(supplierProductVariants.quantity, qty)))
        .returning();
      if (!decremented) throw new Error('Insufficient stock for pack');
    }
    for (const [listingId, qty] of Array.from(listingTotals)) {
      if (qty <= 0) continue;
      const [decremented] = await client.update(supplierProductListings)
        .set({ stock: sql`${supplierProductListings.stock} - ${qty}` })
        .where(and(eq(supplierProductListings.id, listingId), gte(supplierProductListings.stock, qty)))
        .returning();
      if (!decremented) throw new Error('Insufficient stock for pack');
    }

    // Refresh aggregate listing stock for every affected listing — read via the same client
    // so it sees the decrements just written above within this transaction.
    for (const listingId of Array.from(affectedListingIds)) {
      const listingVariants = await client.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, listingId));
      const aggStock = listingVariants.reduce((s: number, v: any) => s + v.quantity, 0);
      await client.update(supplierProductListings)
        .set({ stock: aggStock })
        .where(eq(supplierProductListings.id, listingId));
    }
  }

  /**
   * Restores packs.quantityAvailable and component variant/listing stock for all pack
   * items in a sub-order. Called whenever a sub-order is cancelled — both are reserved
   * unconditionally at order creation now, so restoration no longer depends on whether the
   * sub-order ever reached CONFIRMED. Idempotent: each pack item is only restored once.
   */
  private async restoreSubOrderPackStock(subOrderId: number): Promise<void> {
    const items = await db.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    const packOrderItems = items.filter((i) => i.packId != null);
    if (!packOrderItems.length) return;

    for (const orderItem of packOrderItems) {
      const packId = orderItem.packId!;
      const orderQty = orderItem.quantity;

      // Restore pack-level availability
      await db.update(packs)
        .set({ quantityAvailable: sql`${packs.quantityAvailable} + ${orderQty}` })
        .where(eq(packs.id, packId));

      // Restore component variant/listing stock — using this exact order item's own
      // selected distribution, the same one that was actually deducted at confirmation.
      const snapshot = (orderItem.snapshot ?? {}) as any;
      const includedProducts = Array.isArray(snapshot.includedProducts) ? snapshot.includedProducts : [];
      await this.restorePackComponentStock(packId, orderQty, includedProducts);
    }
  }

  /**
   * Restores variant/flavor stock for every pack item — used on order cancellation.
   * Restores to the SAME exact variant(s) resolvePackComponentDeductions would deduct
   * for this selection, so cancelling never gives stock back to the wrong flavor/size
   * (which would otherwise permanently drift the representative variant's stock up while
   * leaving the actually-sold flavor's stock never replenished).
   */
  private async restorePackComponentStock(
    packId: number,
    orderQty: number,
    includedProducts: Array<{ productId?: number; flavorName?: string | null; sizeName?: string | null; quantity: number }> = [],
  ): Promise<void> {
    const { variants, listings, affectedListingIds } = await this.resolvePackComponentDeductions(packId, orderQty, includedProducts);

    for (const [variantId, qty] of Array.from(variants)) {
      if (qty <= 0) continue;
      await db.update(supplierProductVariants)
        .set({ quantity: sql`${supplierProductVariants.quantity} + ${qty}` })
        .where(eq(supplierProductVariants.id, variantId));
    }
    for (const [listingId, qty] of Array.from(listings)) {
      if (qty <= 0) continue;
      await db.update(supplierProductListings)
        .set({ stock: sql`${supplierProductListings.stock} + ${qty}` })
        .where(eq(supplierProductListings.id, listingId));
    }

    for (const listingId of Array.from(affectedListingIds)) {
      const listingVariants = await this.facade.getVariantsByListingId(listingId);
      const aggStock = listingVariants.reduce((s, v) => s + v.quantity, 0);
      await db.update(supplierProductListings)
        .set({ stock: aggStock })
        .where(eq(supplierProductListings.id, listingId));
    }
  }

  /**
   * Coffee-Owner-initiated, per-item cancellation within a single still-PENDING sub-order.
   * Mirrors the whole-order cancel path (updateOrderStatus -> restockOrderInventory) for
   * stock restoration, but scoped to only the selected items, and recomputes the sub-order's
   * subtotal and the parent order's total from the persisted order_items — never trusts a
   * client-supplied total. Reuses recomputeOrderAggregateStatus (the single writer of
   * orders.status) so a sub-order that becomes fully cancelled here stays consistent with
   * every other status-changing path.
   */
  async cancelSubOrderItems(subOrderId: number, cafeOwnerId: number, orderItemIds: number[]): Promise<{ subOrder: SubOrder; order: Order }> {
    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!subOrder) throw new Error("Sub-order not found");
    const [order] = await db.select().from(orders).where(eq(orders.id, subOrder.orderId));
    if (!order) throw new Error("Order not found");
    if (order.cafeId !== cafeOwnerId) throw new Error("Forbidden");
    if (subOrder.status !== "PENDING") throw new Error("This supplier order can no longer be cancelled");

    const items = await db.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    const requestedIds = new Set(orderItemIds);
    const targets = items.filter((item) => requestedIds.has(item.id));
    if (targets.length !== orderItemIds.length) throw new Error("One or more items do not belong to this supplier order");
    if (targets.some((item) => item.status === "CANCELLED")) throw new Error("One or more items are already cancelled");

    // Restock exactly the items being cancelled — same restoration primitives the whole-order
    // cancel path already uses (restockVariantFromOrderCancellation / restockFromOrderCancellation),
    // so a Coffee Owner cancelling one variant here behaves identically to cancelling the whole
    // pending order, just scoped down. Pack items restore both pack-level availability and
    // component variant/listing stock, since both are reserved unconditionally at order
    // creation (see createOrder / deductPackComponentStock).
    for (const item of targets) {
      if (item.packId) {
        await db.update(packs).set({ quantityAvailable: sql`${packs.quantityAvailable} + ${item.quantity}` }).where(eq(packs.id, item.packId));
        const snapshot = (item.snapshot ?? {}) as any;
        const includedProducts = Array.isArray(snapshot.includedProducts) ? snapshot.includedProducts : [];
        await this.restorePackComponentStock(item.packId, item.quantity, includedProducts);
        continue;
      }
      if (!item.productId || !item.listingId) continue;
      if (item.flavorId != null || item.sizeId != null) {
        const variants = await this.facade.getVariantsByListingId(item.listingId);
        const variant = variants.find((v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (variant) {
          await this.facade.restockVariantFromOrderCancellation(variant.id, item.quantity, `Order #${order.id} item cancelled`);
          continue;
        }
      }
      await this.facade.restockFromOrderCancellation(item.listingId, item.quantity, `Order #${order.id} item cancelled`);
    }

    const result = await db.transaction(async (tx) => {
      await tx.update(orderItems).set({ status: "CANCELLED" }).where(inArray(orderItems.id, orderItemIds));

      const refreshedItems = await tx.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
      const activeItems = refreshedItems.filter((item) => item.status !== "CANCELLED");
      const activeRawSum = activeItems.reduce((sum, item) => sum + (item.totalPrice ?? item.unitPrice * item.quantity), 0);
      const newSubtotal = Math.max(0, activeRawSum - (subOrder.discountAmount ?? 0));
      const allCancelled = activeItems.length === 0;

      const [updatedSubOrder] = await tx.update(subOrders)
        .set({ subtotal: newSubtotal, status: allCancelled ? "CANCELLED" : subOrder.status })
        .where(eq(subOrders.id, subOrderId))
        .returning();

      // Recompute the parent order's total from every sub-order (not just this one) — the
      // source of truth for orders.totalAmount is always the persisted sub-order subtotals.
      const siblingSubOrders = await tx.select().from(subOrders).where(eq(subOrders.orderId, subOrder.orderId));
      const newOrderTotal = siblingSubOrders.reduce(
        (sum, so) => sum + (so.id === subOrderId ? newSubtotal : so.subtotal),
        0,
      );
      await tx.update(orders).set({ totalAmount: newOrderTotal }).where(eq(orders.id, subOrder.orderId));

      if (allCancelled) {
        await this.facade.recomputeOrderAggregateStatus(subOrder.orderId, tx);
      }
      const [updatedOrder] = await tx.select().from(orders).where(eq(orders.id, subOrder.orderId));
      return { subOrder: updatedSubOrder, order: updatedOrder };
    });

    return result;
  }

  /**
   * Cancels part or all of one order item's quantity. When cancelQty covers the item's
   * entire remaining quantity, the row is simply marked CANCELLED in place (identical to the
   * existing cancelSubOrderItems behavior). When cancelQty is less than the item's quantity,
   * the row is split: the original row keeps the remaining ACTIVE quantity, and a new sibling
   * row (same order/sub-order/product/listing/flavor/size/pack, cloned snapshot) is inserted
   * with exactly the cancelled quantity and status CANCELLED. Every existing consumer that
   * renders order items (groupOrderItemsByProduct, the pack-item maps in the Coffee
   * Owner/Supplier/Admin order modals) already iterates every row in a sub-order and renders
   * cancelled ones with strikethrough — so a split pair renders correctly with zero display
   * changes, exactly like two naturally distinct line items.
   *
   * For a Pack row, the snapshot's includedProducts quantities (the Coffee Owner's actual
   * selected flavor/size distribution — see resolvePackComponentDeductions) are scaled down
   * proportionally between the two halves, so neither the remaining nor the cancelled slice
   * ever loses or duplicates the original exact selection.
   */
  private async splitAndCancelOrderItem(
    tx: any,
    item: typeof orderItems.$inferSelect,
    cancelQty: number,
  ): Promise<{ cancelledItemId: number; cancelledQty: number }> {
    if (cancelQty >= item.quantity) {
      await tx.update(orderItems).set({ status: 'CANCELLED' }).where(eq(orderItems.id, item.id));
      return { cancelledItemId: item.id, cancelledQty: item.quantity };
    }

    const remainingQty = item.quantity - cancelQty;
    const originalSnapshot = (item.snapshot ?? {}) as any;
    const scaleSnapshot = (qty: number) => {
      if (!originalSnapshot || typeof originalSnapshot !== 'object') return originalSnapshot;
      const scaled: any = { ...originalSnapshot, quantity: qty, totalPrice: item.unitPrice * qty };
      if (originalSnapshot.kind === 'PACK' && Array.isArray(originalSnapshot.includedProducts)) {
        scaled.includedProducts = originalSnapshot.includedProducts.map((p: any) => ({
          ...p,
          quantity: Math.round((p.quantity * qty) / item.quantity),
        }));
      }
      return scaled;
    };

    await tx.update(orderItems).set({
      quantity: remainingQty,
      totalPrice: item.unitPrice * remainingQty,
      snapshot: scaleSnapshot(remainingQty),
    }).where(eq(orderItems.id, item.id));

    const [inserted] = await tx.insert(orderItems).values({
      orderId: item.orderId,
      subOrderId: item.subOrderId,
      productId: item.productId,
      listingId: item.listingId,
      packId: item.packId,
      packName: item.packName,
      quantity: cancelQty,
      unitPrice: item.unitPrice,
      totalPrice: item.unitPrice * cancelQty,
      flavorId: item.flavorId,
      sizeId: item.sizeId,
      snapshot: scaleSnapshot(cancelQty),
      status: 'CANCELLED',
    }).returning();

    return { cancelledItemId: inserted.id, cancelledQty: cancelQty };
  }

  /**
   * Supplier-initiated granular cancellation: lets a Supplier cancel exactly the
   * products/variants/Packs/quantities they cannot fulfill from their OWN sub-order, instead
   * of only being able to reject the whole sub-order (see updateSubOrderStatus's CANCELLED
   * transition, which remains unchanged and still available as the "cancel entire order"
   * fast path). Authorized to the sub-order's own supplier only — never another supplier's
   * sub-order within the same multi-supplier order. Allowed while the sub-order is still
   * PENDING, CONFIRMED, or PREPARING — the same boundary the existing status picklist already
   * enforces (SUPPLIER_NEXT_STATUSES never offers CANCELLED past PREPARING, since READY hands
   * the sub-order off to the Delivery lifecycle).
   *
   * Stock is restored for exactly the cancelled quantity via the same restock primitives
   * (restockVariantFromOrderCancellation / restockFromOrderCancellation /
   * restorePackComponentStock) every other cancellation path already uses — never a second
   * inventory mechanism. If every item ends up cancelled, the sub-order itself becomes
   * CANCELLED (mirroring cancelSubOrderItems), otherwise its existing status is preserved.
   */
  async cancelSupplierSubOrderItems(
    subOrderId: number,
    supplierId: number,
    targets: Array<{ orderItemId: number; quantity: number }>,
  ): Promise<{ subOrder: SubOrder; order: Order; cancelledItemIds: number[] }> {
    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!subOrder) throw new Error('Sub-order not found');
    if (subOrder.supplierId !== supplierId) throw new Error('Forbidden');
    const CANCELLABLE_STATUSES = new Set(['PENDING', 'CONFIRMED', 'PREPARING']);
    if (!CANCELLABLE_STATUSES.has(subOrder.status ?? '')) {
      throw new Error('This supplier order can no longer be modified');
    }
    const [order] = await db.select().from(orders).where(eq(orders.id, subOrder.orderId));
    if (!order) throw new Error('Order not found');
    if (!targets.length) throw new Error('No items specified');

    const items = await db.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Merge duplicate targets for the same order item (defensive — the client should never
    // send the same id twice, but never silently double-cancel if it does).
    const mergedTargets = new Map<number, number>();
    for (const t of targets) {
      if (!Number.isInteger(t.quantity) || t.quantity <= 0) throw new Error('Invalid cancellation quantity');
      mergedTargets.set(t.orderItemId, (mergedTargets.get(t.orderItemId) ?? 0) + t.quantity);
    }
    for (const [orderItemId, qty] of Array.from(mergedTargets)) {
      const item = itemMap.get(orderItemId);
      if (!item) throw new Error('One or more items do not belong to this supplier order');
      if (item.status === 'CANCELLED') throw new Error('One or more items are already cancelled');
      if (qty > item.quantity) throw new Error('Cannot cancel more than the ordered quantity');
    }

    // Restock exactly the cancelled quantity per item — same primitives every other
    // cancellation path already uses (see cancelSubOrderItems / restockOrderInventory).
    for (const [orderItemId, qty] of Array.from(mergedTargets)) {
      const item = itemMap.get(orderItemId)!;
      if (item.packId) {
        await db.update(packs).set({ quantityAvailable: sql`${packs.quantityAvailable} + ${qty}` }).where(eq(packs.id, item.packId));
        const snapshot = (item.snapshot ?? {}) as any;
        const includedProducts = Array.isArray(snapshot.includedProducts) ? snapshot.includedProducts : [];
        // Scale the actual purchased selection down to exactly the cancelled portion of this
        // line — never restore the full line's components when only part of its quantity was
        // cancelled (see splitAndCancelOrderItem's identical scaling for the stored snapshot).
        const scaledIncluded = includedProducts.map((p: any) => ({
          ...p,
          quantity: Math.round((p.quantity * qty) / item.quantity),
        }));
        await this.restorePackComponentStock(item.packId, qty, scaledIncluded);
        continue;
      }
      if (!item.productId || !item.listingId) continue;
      if (item.flavorId != null || item.sizeId != null) {
        const variants = await this.facade.getVariantsByListingId(item.listingId);
        const variant = variants.find((v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (variant) {
          await this.facade.restockVariantFromOrderCancellation(variant.id, qty, `Order #${order.id} item cancelled by supplier`);
          continue;
        }
      }
      await this.facade.restockFromOrderCancellation(item.listingId, qty, `Order #${order.id} item cancelled by supplier`);
    }

    const cancelledItemIds: number[] = [];
    const result = await db.transaction(async (tx) => {
      for (const [orderItemId, qty] of Array.from(mergedTargets)) {
        const item = itemMap.get(orderItemId)!;
        const { cancelledItemId } = await this.splitAndCancelOrderItem(tx, item, qty);
        cancelledItemIds.push(cancelledItemId);
      }

      const refreshedItems = await tx.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
      const activeItems = refreshedItems.filter((i: any) => i.status !== 'CANCELLED');
      const activeRawSum = activeItems.reduce((sum: number, i: any) => sum + (i.totalPrice ?? i.unitPrice * i.quantity), 0);
      const newSubtotal = Math.max(0, activeRawSum - (subOrder.discountAmount ?? 0));
      const allCancelled = activeItems.length === 0;

      const [updatedSubOrder] = await tx.update(subOrders)
        .set({ subtotal: newSubtotal, status: allCancelled ? 'CANCELLED' : subOrder.status })
        .where(eq(subOrders.id, subOrderId))
        .returning();

      const siblingSubOrders = await tx.select().from(subOrders).where(eq(subOrders.orderId, subOrder.orderId));
      const newOrderTotal = siblingSubOrders.reduce(
        (sum, so) => sum + (so.id === subOrderId ? newSubtotal : so.subtotal),
        0,
      );
      await tx.update(orders).set({ totalAmount: newOrderTotal }).where(eq(orders.id, subOrder.orderId));

      if (allCancelled) {
        await this.facade.cancelActiveDeliveryForSubOrder(subOrderId, tx);
        await this.facade.recomputeOrderAggregateStatus(subOrder.orderId, tx);
      }
      const [updatedOrder] = await tx.select().from(orders).where(eq(orders.id, subOrder.orderId));
      return { subOrder: updatedSubOrder, order: updatedOrder };
    });

    return { ...result, cancelledItemIds };
  }

  /** Coffee Owner's "Daily" star — a persisted favorite flag on the order, scoped to its owner. */
  async setOrderFavorite(orderId: number, cafeOwnerId: number, isFavorite: boolean): Promise<Order> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw new Error("Order not found");
    if (order.cafeId !== cafeOwnerId) throw new Error("Forbidden");
    const [updated] = await db.update(orders).set({ isFavorite }).where(eq(orders.id, orderId)).returning();
    return updated;
  }

  /**
   * Collects items from a sub-order with all the data needed to restore them to the cafe
   * owner's cart (used when a supplier rejects/cancels their sub-order, in full or in part).
   * Pass itemIds to scope this to only the specific order_items rows that were just
   * cancelled (partial cancellation — see cancelSupplierSubOrderItems); omit it for the
   * existing whole-sub-order-rejected path, which restores every item in the sub-order.
   */
  async getSubOrderItemsForCartRestore(subOrderId: number, itemIds?: number[]): Promise<{
    regularItems: Array<{
      listingId: number;
      productId: number;
      productName: string;
      productImageUrl: string | null;
      productCategory: string;
      supplierId: number;
      supplierName: string;
      flavorId: number | null;
      sizeId: number | null;
      flavorName: string | null;
      sizeName: string | null;
      unitPrice: number;
      quantity: number;
    }>;
    packItems: Array<{
      packId: number;
      packName: string;
      packImageUrl: string | null;
      supplierId: number;
      supplierName: string;
      unitPrice: number;
      quantity: number;
      includedProducts: Array<{
        productId: number;
        productName: string;
        productImageUrl: string | null;
        brandName: string | null;
        categoryName: string | null;
        subCategoryName: string | null;
        flavorName: string | null;
        sizeName: string | null;
        quantity: number;
      }>;
    }>;
  }> {
    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!subOrder) return { regularItems: [], packItems: [] };

    const [supplier] = await db.select().from(users).where(eq(users.id, subOrder.supplierId));
    const supplierName = supplier?.name ?? subOrder.supplierName;

    const allItems = await db.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    const items = itemIds ? allItems.filter((i) => itemIds.includes(i.id)) : allItems;
    const tx = await buildTaxonomyCache();

    const regularItems: any[] = [];
    const packItemsResult: any[] = [];

    for (const item of items) {
      if (item.packId) {
        const [pack] = await db.select().from(packs).where(eq(packs.id, item.packId));
        if (!pack) continue;
        // Prefer the Coffee Owner's actual captured selection (orderItems.snapshot,
        // written at checkout — see resolvePackOrderItems) over the Pack's current
        // generic default composition. Restoring from the default would silently
        // discard exactly which flavor/size the Coffee Owner had chosen (e.g. Ananas
        // instead of the pack's representative Citron) — the cart must show back what
        // they actually selected, not a re-derived guess. Only a legacy order placed
        // before this snapshot field existed falls back to the live default.
        const snapshot = (item.snapshot ?? {}) as any;
        const snapshotIncluded = snapshot.kind === "PACK" && Array.isArray(snapshot.includedProducts)
          ? snapshot.includedProducts
          : null;
        let includedProducts: Array<{ productId: number; productName: string; productImageUrl: string | null; brandName: string | null; categoryName: string | null; subCategoryName: string | null; flavorName: string | null; sizeName: string | null; quantity: number }>;
        if (snapshotIncluded) {
          includedProducts = snapshotIncluded.map((pi: any) => ({
            productId: pi.productId ?? 0,
            productName: pi.productName ?? "Produit",
            productImageUrl: pi.productImageUrl ?? null,
            brandName: pi.brandName ?? null,
            categoryName: pi.categoryName ?? null,
            subCategoryName: pi.subCategoryName ?? null,
            flavorName: pi.flavorName ?? null,
            sizeName: pi.sizeName ?? null,
            quantity: pi.quantity,
          }));
        } else {
          const [packDetail] = await this.facade.buildPackDetails([pack]);
          includedProducts = (packDetail?.items ?? []).map((pi) => ({
            productId: pi.productId,
            productName: pi.productName,
            productImageUrl: pi.productImageUrl ?? null,
            brandName: pi.brandName ?? null,
            categoryName: pi.categoryName ?? null,
            subCategoryName: pi.subCategoryName ?? null,
            flavorName: pi.flavorName ?? null,
            sizeName: pi.sizeName ?? null,
            quantity: pi.quantity,
          }));
        }
        packItemsResult.push({
          packId: item.packId,
          packName: item.packName ?? pack.name,
          packImageUrl: pack.imageUrl ?? null,
          supplierId: subOrder.supplierId,
          supplierName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          includedProducts,
        });
      } else if (item.productId && item.listingId) {
        const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, item.listingId));
        if (!listing) continue;
        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        if (!product) continue;
        regularItems.push({
          listingId: item.listingId,
          productId: item.productId,
          productName: product.name,
          productImageUrl: product.imageUrl ?? null,
          productCategory: product.category ?? '',
          supplierId: subOrder.supplierId,
          supplierName,
          flavorId: item.flavorId ?? null,
          sizeId: item.sizeId ?? null,
          flavorName: item.flavorId ? (tx.flvMap.get(item.flavorId)?.name ?? null) : null,
          sizeName: item.sizeId ? (tx.szMap.get(item.sizeId)?.name ?? null) : null,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        });
      }
    }

    return { regularItems, packItems: packItemsResult };
  }

  async getReturns(filters?: { cafeId?: number; supplierId?: number }): Promise<OrderReturn[]> {
    const conditions: any[] = [];
    if (filters?.cafeId) conditions.push(eq(orderReturns.cafeId, filters.cafeId));
    if (filters?.supplierId) conditions.push(eq(orderReturns.supplierId, filters.supplierId));
    const query = conditions.length
      ? db.select().from(orderReturns).where(and(...conditions))
      : db.select().from(orderReturns);
    return query.orderBy(desc(orderReturns.requestedAt));
  }

  async createReturn(data: InsertOrderReturn): Promise<OrderReturn> {
    const [created] = await db.insert(orderReturns).values(data).returning();
    return created;
  }

  async updateReturnStatus(id: number, status: string, supplierNotes?: string): Promise<OrderReturn> {
    const updates: Record<string, any> = { status };
    if (status !== 'PENDING_REVIEW') updates.processedAt = new Date();
    if (supplierNotes !== undefined) updates.supplierNotes = supplierNotes;
    const [updated] = await db.update(orderReturns).set(updates).where(eq(orderReturns.id, id)).returning();
    if (!updated) throw new Error('Return not found');
    return updated;
  }

  /**
   * Cascade-delete an order and all dependent records:
   * promotionUsage → orderReturns → deliveries → orderItems → subOrders → orders
   */
  async deleteOrder(orderId: number): Promise<void> {
    await db.delete(promotionUsage).where(eq(promotionUsage.orderId, orderId));
    await db.delete(orderReturns).where(eq(orderReturns.orderId, orderId));
    await db.delete(deliveries).where(eq(deliveries.orderId, orderId)); // orphan-delivery guard
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(subOrders).where(eq(subOrders.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
  }
}
