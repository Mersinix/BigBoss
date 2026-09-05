import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { DeliveryWithDetails, DeliveryStatus, User } from "@shared/schema";

const DELIVERIES_KEY = [api.deliveries.list.path];
const DRIVERS_KEY = [api.deliveryCompanyDrivers.list.path];

export function useDeliveries() {
  return useQuery<DeliveryWithDetails[]>({
    queryKey: DELIVERIES_KEY,
    queryFn: async () => {
      const res = await fetch(api.deliveries.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deliveries");
      return res.json();
    },
  });
}

export function useDelivery(id: number | null) {
  return useQuery<DeliveryWithDetails>({
    queryKey: [api.deliveries.get.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.deliveries.get.path, { id: id! }), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch delivery");
      return res.json();
    },
    enabled: id != null,
  });
}

export function useDispatchDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryId, mode, deliveryCompanyId }: { deliveryId: number; mode: "DELIVERY_COMPANY" | "SUPPLIER"; deliveryCompanyId?: number }) => {
      const res = await fetch(buildUrl(api.deliveries.dispatch.path, { id: deliveryId }), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deliveryCompanyId != null ? { mode, deliveryCompanyId } : { mode }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to dispatch delivery" }));
        throw new Error(err.message ?? "Failed to dispatch delivery");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DELIVERIES_KEY }),
  });
}

export function useAcceptDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: number) => {
      const res = await fetch(buildUrl(api.deliveries.accept.path, { id: deliveryId }), {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to accept delivery" }));
        throw new Error(err.message ?? "Failed to accept delivery");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DELIVERIES_KEY }),
  });
}

export function useAssignDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryId, driverId }: { deliveryId: number; driverId: number }) => {
      const res = await fetch(buildUrl(api.deliveries.assign.path, { id: deliveryId }), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to assign driver" }));
        throw new Error(err.message ?? "Failed to assign driver");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DELIVERIES_KEY }),
  });
}

export function useUpdateDeliveryStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryId, status, code }: { deliveryId: number; status: DeliveryStatus; code?: string }) => {
      const res = await fetch(buildUrl(api.deliveries.updateStatus.path, { id: deliveryId }), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(code ? { status, code } : { status }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update delivery status" }));
        throw new Error(err.message ?? "Failed to update delivery status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DELIVERIES_KEY });
      // Delivery status changes propagate into sub-order/order aggregates — keep the Shop
      // order views (Coffee Owner, Supplier, Admin) in sync too.
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
    },
  });
}

// Driver rosters — a Driver belongs to exactly one operator (Delivery Company XOR Supplier,
// enforced server-side). Both operator UIs share this same hook implementation, pointed at
// their own endpoint, rather than maintaining two parallel driver-roster hook files.
function makeDriverRosterHooks(listPath: string, createPath: string, queryKey: string[]) {
  function useDrivers() {
    return useQuery<User[]>({
      queryKey,
      queryFn: async () => {
        const res = await fetch(listPath, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch drivers");
        return res.json();
      },
    });
  }
  function useCreateDriverMutation() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (data: { name: string; email: string; password: string; phone?: string | null }) => {
        const res = await fetch(createPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Failed to create driver" }));
          throw new Error(err.message ?? "Failed to create driver");
        }
        return res.json();
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });
  }
  return { useDrivers, useCreateDriverMutation };
}

const deliveryCompanyDriverHooks = makeDriverRosterHooks(
  api.deliveryCompanyDrivers.list.path, api.deliveryCompanyDrivers.create.path, DRIVERS_KEY,
);
export const useDeliveryCompanyDrivers = deliveryCompanyDriverHooks.useDrivers;
export const useCreateDriver = deliveryCompanyDriverHooks.useCreateDriverMutation;

const SUPPLIER_DRIVERS_KEY = [api.supplierDrivers.list.path];
const supplierDriverHooks = makeDriverRosterHooks(
  api.supplierDrivers.list.path, api.supplierDrivers.create.path, SUPPLIER_DRIVERS_KEY,
);
export const useSupplierDrivers = supplierDriverHooks.useDrivers;
export const useCreateSupplierDriver = supplierDriverHooks.useCreateDriverMutation;
