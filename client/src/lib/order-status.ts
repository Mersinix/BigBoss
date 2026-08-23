import type { OrderWithDetails } from "@shared/schema";

// Derives the most meaningful order status from its sub-orders. The DB
// order.status column only advances when ALL sub-orders complete (see
// storage.recomputeOrderAggregateStatus), so it can lag behind individual
// supplier statuses already visible inside the Order Details modal body.
// Using this helper keeps every card/badge in sync with what the modal shows —
// there is a single derivation, not a separate cached state per screen.
//
// Rule: minimum (least-advanced) non-cancelled sub-order status, which
// represents the current bottleneck. Falls back to order.status when there
// are no sub-orders.
const STATUS_RANK: Record<string, number> = {
  PENDING: 0, CONFIRMED: 1, PREPARING: 2,
  READY: 3, IN_DELIVERY: 4, DELIVERED: 5,
};

export function deriveOrderStatus(order: OrderWithDetails): string {
  const subs = (order.subOrders ?? []) as any[];
  if (!subs.length) return order.status;
  const active = subs.filter((s: any) => s.status !== "CANCELLED");
  if (active.length === 0) return "CANCELLED";
  const minRank = active.reduce((min: number, s: any) => {
    const rank = STATUS_RANK[s.status ?? "PENDING"] ?? 0;
    return rank < min ? rank : min;
  }, Infinity);
  return Object.keys(STATUS_RANK).find((k) => STATUS_RANK[k] === minRank) ?? order.status;
}

export type SupplierStatusEntry = { supplierId: number; supplierName: string; status: string };

// A single collapsed badge (deriveOrderStatus above) is only accurate for a one-supplier
// order — for a multi-supplier order it silently hides whichever suppliers are behind the
// most-advanced one. This is the single source of truth every mapped-order card should
// read from: null for a one-supplier (or sub-order-less) order, meaning "keep using the
// existing single-badge display unchanged"; an array of one entry per supplier otherwise,
// straight from each sub-order's own persisted status — no re-aggregation, no second
// status system.
export function getSupplierStatusEntries(order: OrderWithDetails): SupplierStatusEntry[] | null {
  const subs = (order.subOrders ?? []) as any[];
  const uniqueSupplierIds = new Set(subs.map((s) => s.supplierId));
  if (uniqueSupplierIds.size <= 1) return null;
  return subs.map((s) => ({ supplierId: s.supplierId, supplierName: s.supplierName, status: s.status }));
}

// Status-filter predicate every "filter orders by status" UI should use instead of
// comparing against the single order.status column or deriveOrderStatus()'s collapsed
// aggregate — both hide a sub-order whose status differs from whichever one the aggregate
// picked. An order matches a status if AT LEAST ONE of its sub-orders currently has that
// status (falls back to order.status for the rare order with no sub-orders at all).
// A role that only ever sees its own sub-order (e.g. a Supplier, already scoped
// server-side to a single-entry subOrders array) naturally filters on just that one
// sub-order — no role-branching needed here.
export function orderMatchesStatus(order: OrderWithDetails, status: string): boolean {
  if (status === "ALL") return true;
  const subs = (order.subOrders ?? []) as any[];
  if (!subs.length) return order.status === status;
  return subs.some((s) => s.status === status);
}
