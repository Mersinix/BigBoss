import { useMemo } from "react";
import { useOrders, useSetOrderFavorite, useReorderToCart } from "@/hooks/use-orders";
import { getPrimaryOrderCategory, type PrimaryOrderCategory } from "@/lib/order-date";
import { Box, Truck, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";

// Single source of truth for the Coffee Owner Today/Planifiées/Daily/Anciennes
// order organization. Consumed by both the standalone Orders page
// (pages/cafe/orders-page.tsx) and the My Account modal's Orders tab
// (components/cafe/marketplace-layout.tsx) so neither screen keeps its own
// copy of the categorization, favorite-toggle, or reorder logic. Both read
// the same react-query cache (useOrders -> ["/api/orders"]), so starring an
// order in either surface is reflected in the other immediately.

export const CAFE_ORDER_STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: "En attente", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  CONFIRMED: { label: "Confirmée", color: "bg-blue-100 text-blue-800 border-blue-200", icon: CheckCircle2 },
  PREPARING: { label: "En préparation", color: "bg-orange-100 text-orange-800 border-orange-200", icon: Box },
  READY: { label: "Prête", color: "bg-teal-100 text-teal-800 border-teal-200", icon: Box },
  IN_DELIVERY: { label: "En livraison", color: "bg-purple-100 text-purple-800 border-purple-200", icon: Truck },
  DELIVERED: { label: "Livrée", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  CANCELLED: { label: "Annulée", color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle },
};

export const CAFE_ORDER_STATUS_FILTER_OPTS = [
  { value: "ALL", label: "Tous" },
  { value: "PENDING", label: "En attente" },
  { value: "CONFIRMED", label: "Confirmée" },
  { value: "PREPARING", label: "En préparation" },
  { value: "READY", label: "Prête" },
  { value: "IN_DELIVERY", label: "En livraison" },
  { value: "DELIVERED", label: "Livrée" },
  { value: "CANCELLED", label: "Annulée" },
];

export type CafeOrderTabId = "today" | "planned" | "daily" | "old";

export function useCafeOrders() {
  const { data: apiOrders = [], isLoading } = useOrders();
  const setFavorite = useSetOrderFavorite();
  const { reorder, isReordering } = useReorderToCart();

  const now = new Date();

  const sorted = useMemo(
    () => [...apiOrders].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()),
    [apiOrders],
  );

  const byCategory = useMemo(() => {
    const groups: Record<PrimaryOrderCategory, OrderWithDetails[]> = { PLANIFIEE: [], TODAY: [], ANCIENNE: [] };
    for (const order of sorted) groups[getPrimaryOrderCategory(order, now)].push(order);
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted]);

  // Daily is a reusable-template collection, not a date bucket — a starred
  // order stays in Daily regardless of its primary category/age.
  const daily = useMemo(() => sorted.filter((o: any) => o.isFavorite), [sorted]);

  const toggleFavorite = (order: OrderWithDetails) => {
    setFavorite.mutate({ orderId: order.id, isFavorite: !(order as any).isFavorite });
  };

  const listForTab = (tab: CafeOrderTabId): OrderWithDetails[] =>
    tab === "today" ? byCategory.TODAY
      : tab === "planned" ? byCategory.PLANIFIEE
      : tab === "daily" ? daily
      : byCategory.ANCIENNE;

  return {
    isLoading,
    sorted,
    byCategory,
    daily,
    listForTab,
    toggleFavorite,
    isTogglingFavorite: setFavorite.isPending,
    reorder,
    isReordering,
  };
}
