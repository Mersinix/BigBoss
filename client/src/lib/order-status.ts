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
