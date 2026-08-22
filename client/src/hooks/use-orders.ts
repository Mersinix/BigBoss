import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, buildUrl } from "@shared/routes";
import { OrderWithDetails, CreateOrderRequest, UpdateOrderStatusRequest } from "@shared/schema";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";

export type MultiOrderRequest = CreateOrderRequest;

export type ReorderData = {
  items: {
    listingId: number;
    productId: number;
    supplierId: number;
    supplierName: string;
    flavorId: number | null;
    sizeId: number | null;
    flavorName: string | null;
    sizeName: string | null;
    quantity: number;
    unitPrice: number;
  }[];
  packItems: { packId: number; supplierId: number; quantity: number }[];
  unavailable: { name: string; reason: string }[];
};

export function useOrders() {
  return useQuery<OrderWithDetails[]>({
    queryKey: [api.orders.list.path],
    queryFn: async () => {
      const res = await fetch(api.orders.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });
}

export function useOrder(id: number) {
  return useQuery<OrderWithDetails>({
    queryKey: [api.orders.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.orders.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) throw new Error("Order not found");
      if (!res.ok) throw new Error("Failed to fetch order");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateOrderRequest) => {
      const res = await fetch(api.orders.create.path, {
        method: api.orders.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create order" }));
        throw new Error(err.message ?? "Failed to create order");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      invalidateMarketplace(queryClient);
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & UpdateOrderStatusRequest) => {
      const url = buildUrl(api.orders.updateStatus.path, { id });
      const res = await fetch(url, {
        method: api.orders.updateStatus.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update order status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
    },
  });
}

export function useUpdateSubOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ subOrderId, status }: { subOrderId: number; status: string }) => {
      const res = await fetch(`/api/suborders/${subOrderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update sub-order status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
    },
  });
}

export function useReorder(orderId: number | null) {
  return useQuery<ReorderData>({
    queryKey: ["/api/orders/reorder", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/reorder`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to prepare reorder");
      return res.json();
    },
    enabled: false, // triggered manually
  });
}

// Shared reorder-to-cart flow — recreates an order's contents in the Cart using CURRENT
// availability/prices via GET /api/orders/:id/reorder (never the stale historical order
// prices), then navigates to /cart. Never creates an order directly and never duplicates the
// original order record; the Coffee Owner still confirms from the Cart like any other order.
// Extracted from order-details-modal.tsx's original inline handleReorder so both the modal's
// "Recommander" button and the Daily tab's card button use the exact same logic.
export function useReorderToCart() {
  const { addItem, addPackItem } = useCart();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isReordering, setIsReordering] = useState(false);

  const reorder = async (orderId: number) => {
    setIsReordering(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/reorder`, { credentials: "include" });
      if (!res.ok) throw new Error("Impossible de préparer la re-commande");
      const data = await res.json() as {
        items: any[];
        packItems: any[];
        unavailable: { name: string; reason: string }[];
      };

      // Append to existing cart (do NOT clear — preserve what's already there)
      for (const item of data.items) {
        addItem({
          listingId: item.listingId,
          productId: item.productId,
          supplierId: item.supplierId,
          supplierName: item.supplierName ?? "",
          flavorId: item.flavorId ?? null,
          sizeId: item.sizeId ?? null,
          flavorName: item.flavorName ?? null,
          sizeName: item.sizeName ?? null,
          brandName: item.brandName ?? null,
          categoryName: item.categoryName ?? item.productCategory ?? null,
          subCategoryName: item.subCategoryName ?? null,
          unitPrice: item.unitPrice,
          productName: item.productName ?? "",
          productImageUrl: item.productImageUrl ?? null,
          productCategory: item.productCategory ?? "",
        }, item.quantity);
      }

      for (const pack of data.packItems) {
        addPackItem({
          packId: pack.packId,
          packName: pack.packName ?? "",
          packImageUrl: pack.packImageUrl ?? null,
          supplierId: pack.supplierId,
          supplierName: pack.supplierName ?? "",
          unitPrice: pack.unitPrice ?? 0,
          includedProducts: (pack.includedProducts ?? []).map((item: any) => ({
            productId: item.productId ?? 0,
            productName: item.productName ?? "",
            productImageUrl: item.productImageUrl ?? null,
            brandName: item.brandName ?? null,
            categoryName: item.categoryName ?? null,
            subCategoryName: item.subCategoryName ?? null,
            flavorName: item.flavorName ?? null,
            sizeName: item.sizeName ?? null,
            quantity: item.quantity ?? 0,
          })),
        }, pack.quantity);
      }

      const addedCount = data.items.length + data.packItems.length;
      const unavailableCount = data.unavailable.length;

      if (addedCount === 0 && unavailableCount > 0) {
        toast({
          title: "Aucun article disponible",
          description: `${unavailableCount} article(s) ne sont plus disponibles.`,
          variant: "destructive",
        });
        return;
      }

      let desc = `${addedCount} article(s) ajouté(s) au panier.`;
      if (unavailableCount > 0) desc += ` ${unavailableCount} article(s) non disponible(s).`;

      toast({ title: "Articles ajoutés au panier", description: desc });
      setLocation("/cart");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsReordering(false);
    }
  };

  return { reorder, isReordering };
}

export function useCancelSubOrderItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ subOrderId, orderItemIds }: { subOrderId: number; orderItemIds: number[] }) => {
      const res = await fetch(`/api/suborders/${subOrderId}/cancel-items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemIds }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to cancel items" }));
        throw new Error(err.message ?? "Failed to cancel items");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
    },
  });
}

export function useSetOrderFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, isFavorite }: { orderId: number; isFavorite: boolean }) => {
      const res = await fetch(`/api/orders/${orderId}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update favorite");
      return res.json();
    },
    onMutate: async ({ orderId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: [api.orders.list.path] });
      const previous = queryClient.getQueryData<OrderWithDetails[]>([api.orders.list.path]);
      queryClient.setQueryData<OrderWithDetails[]>([api.orders.list.path], (old) =>
        old?.map((o) => (o.id === orderId ? { ...o, isFavorite } as OrderWithDetails : o)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.orders.list.path], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
    },
  });
}

// ── Returns ───────────────────────────────────────────────────────────────────

export type OrderReturnRow = {
  id: number;
  orderId: number;
  subOrderId: number | null;
  cafeId: number;
  supplierId: number;
  itemType: "PRODUCT" | "PACK";
  orderItemId: number | null;
  itemName: string;
  quantity: number;
  reason: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "IN_PROGRESS" | "RESOLVED";
  supplierNotes: string | null;
  requestedAt: string;
  processedAt: string | null;
};

export type CreateReturnRequest = {
  orderId: number;
  subOrderId?: number;
  supplierId: number;
  itemType?: "PRODUCT" | "PACK";
  orderItemId?: number;
  itemName: string;
  quantity: number;
  reason: string;
};

export function useReturns() {
  return useQuery<OrderReturnRow[]>({
    queryKey: ["/api/returns"],
    queryFn: async () => {
      const res = await fetch("/api/returns", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch returns");
      return res.json();
    },
  });
}

export function useCreateReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateReturnRequest) => {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create return" }));
        throw new Error(err.message ?? "Failed to create return");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/returns"] });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: number) => {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete order" }));
        throw new Error(err.message ?? "Failed to delete order");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
    },
  });
}

export function useUpdateReturnStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, supplierNotes }: { id: number; status: string; supplierNotes?: string }) => {
      const res = await fetch(`/api/returns/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, supplierNotes }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update return status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/returns"] });
    },
  });
}
