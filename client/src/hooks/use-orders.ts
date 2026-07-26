import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { OrderWithDetails, CreateOrderRequest, UpdateOrderStatusRequest } from "@shared/schema";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";

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
