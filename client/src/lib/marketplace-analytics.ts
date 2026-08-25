import type { OrderWithDetails } from "@shared/schema";

/**
 * Shared analytics derivation layer for the Admin Dashboard/Analytics/Earnings, Supplier
 * Dashboard/Analytics/Earnings, and Coffee Owner Dashboard tab.
 *
 * There is no separate analytics/stats table anywhere in the schema — orders and sub_orders
 * (one per supplier within a multi-supplier order, see shared/schema.ts) are the only source
 * of truth. Every number here is derived live from GET /api/orders (already role-scoped
 * server-side — a Supplier's response already contains only their own sub-orders/items), so
 * it inherits realtime for free: use-realtime.ts already invalidates ["/api/orders"] on every
 * order/sub-order/delivery status change.
 *
 * All six dashboards call the SAME functions here so the same business event (e.g. an order
 * being delivered) is guaranteed to move every dashboard's numbers in the same direction by
 * the same amount — no page recomputes revenue/commission with its own slightly different
 * formula (this was the actual bug in the pre-existing admin/earnings-page.tsx and
 * supplier/finance-analytics-page.tsx, which used order.totalAmount/order.status directly and
 * silently dropped a multi-supplier order's already-delivered supplier portion whenever a
 * sibling supplier on the same order hadn't delivered yet).
 */

export const PLATFORM_COMMISSION_RATE = 0.05;

export type FlatLine = {
  orderId: number;
  subOrderId: number | null;
  supplierId: number;
  supplierName: string;
  cafeId: number;
  cafeName: string;
  createdAt: string | Date | null;
  /** The line's own status — sub-order status when available, else the parent order status
   * (legacy orders with no sub-order rows). This is what "delivered"/"cancelled" means here. */
  status: string;
  /** This item's own price (for product/pack/supplier/customer rankings — never summed as a
   * revenue total, since it does not net out the parent sub-order's discount). */
  amount: number;
  /** Unique key for the sub-order (or legacy order) this line belongs to — every line sharing
   * the same key shares the same groupAmount, so revenue totals dedupe on this instead of
   * summing amount, and can never double-count or drift from the discount-adjusted subtotal
   * (see lib/financial-rows.ts's buildFinancialRows, which uses the exact same subOrder.subtotal
   * for Payouts/Invoices — this keeps the two derivations in agreement). */
  groupKey: string;
  /** The sub-order's (or legacy order's) real, discount-adjusted subtotal. */
  groupAmount: number;
  isPack: boolean;
  productId: number | null;
  productName: string | null;
  packId: number | null;
  packName: string | null;
  quantity: number;
};

/** Flattens every order into one row per (supplier sub-order), or one row per legacy order
 * when it predates the sub-order structure — the same fallback OrderDetailsModal/
 * OrderInvoiceModal already use. This is the single base dataset every metric below reduces
 * over, so "one order counted twice because it has two suppliers" can't happen by construction. */
export function flattenOrders(orders: OrderWithDetails[]): FlatLine[] {
  const lines: FlatLine[] = [];
  for (const order of orders) {
    const subOrders = order.subOrders ?? [];
    if (subOrders.length > 0) {
      for (const so of subOrders) {
        const groupKey = `so-${so.id}`;
        for (const item of so.items ?? []) {
          if ((item as any).status === "CANCELLED") continue;
          lines.push({
            orderId: order.id,
            subOrderId: so.id,
            supplierId: so.supplierId,
            supplierName: so.supplierName || "—",
            cafeId: order.cafeId,
            cafeName: order.cafe?.name ?? "—",
            createdAt: so.createdAt ?? order.createdAt ?? null,
            status: so.status,
            amount: item.totalPrice ?? (item.unitPrice ?? 0) * (item.quantity ?? 0),
            groupKey,
            groupAmount: so.subtotal ?? 0,
            isPack: !!item.packId,
            productId: item.productId ?? null,
            productName: item.packId ? null : ((item as any).product?.name ?? (item.snapshot as any)?.productName ?? "Produit"),
            packId: item.packId ?? null,
            packName: item.packId ? (item.packName ?? (item.snapshot as any)?.packName ?? "Pack") : null,
            quantity: item.quantity ?? 0,
          });
        }
      }
    } else {
      // Legacy order with no sub-order rows: one supplier, order.supplier/order.supplierId.
      // No discount is tracked at the order level for these, so groupAmount is the sum of
      // this order's own (uncancelled) item totals — there is nothing else to net out against.
      const legacyItems = (order.items ?? []).filter((item: any) => item.status !== "CANCELLED");
      const groupKey = `o-${order.id}`;
      const groupAmount = legacyItems.reduce((s, item) => s + (item.totalPrice ?? (item.unitPrice ?? 0) * (item.quantity ?? 0)), 0);
      for (const item of legacyItems) {
        lines.push({
          orderId: order.id,
          subOrderId: null,
          supplierId: order.supplierId ?? 0,
          supplierName: order.supplier?.name ?? "—",
          cafeId: order.cafeId,
          cafeName: order.cafe?.name ?? "—",
          createdAt: order.createdAt ?? null,
          status: order.status,
          amount: item.totalPrice ?? (item.unitPrice ?? 0) * (item.quantity ?? 0),
          groupKey,
          groupAmount,
          isPack: !!item.packId,
          productId: item.productId ?? null,
          productName: item.packId ? null : ((item as any).product?.name ?? (item.snapshot as any)?.productName ?? "Produit"),
          packId: item.packId ?? null,
          packName: item.packId ? (item.packName ?? (item.snapshot as any)?.packName ?? "Pack") : null,
          quantity: item.quantity ?? 0,
        });
      }
    }
  }
  return lines;
}

export type DateRangePreset = "today" | "7d" | "30d" | "month" | "lastMonth" | "year" | "all" | "custom";

export function resolveDateRange(preset: DateRangePreset, custom?: { from: string; to: string }): { from: Date | null; to: Date | null } {
  const now = new Date();
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  switch (preset) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "7d": { const f = new Date(now); f.setDate(f.getDate() - 6); return { from: startOfDay(f), to: endOfDay(now) }; }
    case "30d": { const f = new Date(now); f.setDate(f.getDate() - 29); return { from: startOfDay(f), to: endOfDay(now) }; }
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case "lastMonth": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: f, to: t };
    }
    case "year": return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    case "custom":
      return { from: custom?.from ? startOfDay(new Date(custom.from)) : null, to: custom?.to ? endOfDay(new Date(custom.to)) : null };
    case "all":
    default:
      return { from: null, to: null };
  }
}

export function filterLinesByDate(lines: FlatLine[], range: { from: Date | null; to: Date | null }): FlatLine[] {
  if (!range.from && !range.to) return lines;
  return lines.filter((l) => {
    if (!l.createdAt) return false;
    const d = new Date(l.createdAt as any);
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });
}

export const DELIVERED = "DELIVERED";
export const CANCELLED = "CANCELLED";
const ACTIVE_NONFINAL = new Set(["PENDING", "CONFIRMED", "PREPARING", "READY", "IN_DELIVERY"]);

/** Sums groupAmount once per distinct sub-order/legacy-order (never per item line) — the
 * same discount-adjusted figure lib/financial-rows.ts's Payouts/Invoices already use for the
 * same sub-order, so this can never disagree with those pages for the same period. */
function sumRevenue(lines: FlatLine[]): number {
  const seen = new Map<string, number>();
  for (const l of lines) if (!seen.has(l.groupKey)) seen.set(l.groupKey, l.groupAmount);
  let total = 0;
  for (const v of Array.from(seen.values())) total += v;
  return total;
}

export function summarize(lines: FlatLine[]) {
  const delivered = lines.filter((l) => l.status === DELIVERED);
  const cancelled = lines.filter((l) => l.status === CANCELLED);
  const active = lines.filter((l) => ACTIVE_NONFINAL.has(l.status));

  const deliveredRevenue = sumRevenue(delivered);
  const pendingRevenue = sumRevenue(active);
  const cancelledRevenue = sumRevenue(cancelled);
  const grossRevenue = deliveredRevenue + pendingRevenue; // excludes cancelled, always

  const orderIds = new Set(lines.map((l) => l.orderId));
  const deliveredOrderIds = new Set(delivered.map((l) => l.orderId));
  const cancelledOrderIds = new Set(cancelled.map((l) => l.orderId));

  const statusCounts: Record<string, number> = {};
  for (const l of lines) statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;

  const commission = Math.round(deliveredRevenue * PLATFORM_COMMISSION_RATE);
  const supplierNet = deliveredRevenue - commission;

  return {
    lineCount: lines.length,
    orderCount: orderIds.size,
    deliveredCount: delivered.length,
    cancelledCount: cancelled.length,
    activeCount: active.length,
    deliveredOrderCount: deliveredOrderIds.size,
    cancelledOrderCount: cancelledOrderIds.size,
    deliveredRevenue,
    pendingRevenue,
    cancelledRevenue,
    grossRevenue,
    commission,
    supplierNet,
    averageOrderValue: deliveredOrderIds.size > 0 ? Math.round(deliveredRevenue / deliveredOrderIds.size) : 0,
    cancellationRate: lines.length > 0 ? cancelled.length / lines.length : 0,
    statusCounts,
  };
}

export function monthlySeries(lines: FlatLine[], months = 12): { key: string; label: string; revenue: number; orders: number }[] {
  const now = new Date();
  const buckets: { key: string; label: string; revenue: number; orders: number }[] = [];
  const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: monthNames[d.getMonth()], revenue: 0, orders: 0 });
  }
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));
  const seenOrdersPerBucket = new Map<string, Set<number>>();
  const seenGroupsPerBucket = new Map<string, Set<string>>();
  for (const l of lines) {
    if (l.status !== DELIVERED || !l.createdAt) continue;
    const d = new Date(l.createdAt as any);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const idx = bucketIndex.get(key);
    if (idx == null) continue;
    if (!seenGroupsPerBucket.has(key)) seenGroupsPerBucket.set(key, new Set());
    const groupsSeen = seenGroupsPerBucket.get(key)!;
    if (!groupsSeen.has(l.groupKey)) {
      groupsSeen.add(l.groupKey);
      buckets[idx].revenue += l.groupAmount;
    }
    if (!seenOrdersPerBucket.has(key)) seenOrdersPerBucket.set(key, new Set());
    seenOrdersPerBucket.get(key)!.add(l.orderId);
  }
  for (const b of buckets) b.orders = seenOrdersPerBucket.get(b.key)?.size ?? 0;
  return buckets;
}

export type RankedEntry = { id: number; name: string; orders: number; revenue: number; quantity: number };

// Rankings intentionally sum the per-item `amount`, not the deduped `groupAmount` sumRevenue()
// uses — a supplier/customer/product ranking is about each entity's own share of what was
// sold, which is inherently item-level (a discount is applied to the whole sub-order, not
// attributable to one specific product), and these numbers are never added together into a
// single "total revenue" figure the way summarize()/monthlySeries() are, so there is nothing
// to double-count.
function rankBy(lines: FlatLine[], keyOf: (l: FlatLine) => { id: number; name: string } | null, top = 5): RankedEntry[] {
  const map = new Map<number, RankedEntry>();
  const ordersByKey = new Map<number, Set<number>>();
  for (const l of lines) {
    if (l.status === CANCELLED) continue;
    const k = keyOf(l);
    if (!k) continue;
    if (!map.has(k.id)) map.set(k.id, { id: k.id, name: k.name, orders: 0, revenue: 0, quantity: 0 });
    const e = map.get(k.id)!;
    e.revenue += l.amount;
    e.quantity += l.quantity;
    if (!ordersByKey.has(k.id)) ordersByKey.set(k.id, new Set());
    ordersByKey.get(k.id)!.add(l.orderId);
  }
  for (const e of Array.from(map.values())) e.orders = ordersByKey.get(e.id)?.size ?? 0;
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, top);
}

export const topSuppliers = (lines: FlatLine[], top = 5) =>
  rankBy(lines, (l) => (l.supplierId ? { id: l.supplierId, name: l.supplierName } : null), top);

export const topCustomers = (lines: FlatLine[], top = 5) =>
  rankBy(lines, (l) => ({ id: l.cafeId, name: l.cafeName }), top);

export const topProducts = (lines: FlatLine[], top = 5) =>
  rankBy(lines, (l) => (!l.isPack && l.productId ? { id: l.productId, name: l.productName ?? "Produit" } : null), top);

export const topPacks = (lines: FlatLine[], top = 5) =>
  rankBy(lines, (l) => (l.isPack && l.packId ? { id: l.packId, name: l.packName ?? "Pack" } : null), top);

export const FR_STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  PREPARING: "En préparation",
  READY: "Prête",
  IN_DELIVERY: "En livraison",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
};
