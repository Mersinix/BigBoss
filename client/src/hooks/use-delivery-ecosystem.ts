import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Vehicles, delivery pricing config, driver reviews, and Delivery Company
// opportunities — additive to use-deliveries.ts (kept separate rather than
// growing that file further), all built on the SAME deliveries/users model
// use-deliveries.ts already reads. No duplicate delivery/driver system.

export type DeliveryVehicleType = "BICYCLE" | "MOTO" | "CAR" | "VAN" | "TRUCK" | "OTHER";
export const VEHICLE_TYPE_LABELS: Record<DeliveryVehicleType, string> = {
  BICYCLE: "Vélo", MOTO: "Moto", CAR: "Voiture", VAN: "Camionnette", TRUCK: "Camion", OTHER: "Autre",
};

export type Vehicle = {
  id: number;
  ownerType: "DELIVERY_COMPANY" | "SUPPLIER";
  ownerId: number;
  type: DeliveryVehicleType;
  brand: string;
  model: string;
  plateNumber: string;
  hasAirConditioning: boolean;
  isActive: boolean;
  assignedDriverId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type VehicleInput = {
  type?: DeliveryVehicleType;
  brand?: string;
  model?: string;
  plateNumber?: string;
  hasAirConditioning?: boolean;
  isActive?: boolean;
};

export type DeliveryPricingSettings = {
  vehiclePricing: Record<DeliveryVehicleType, { pricePerKmCents: number; minFeeCents: number }>;
  defaultVehicleType: DeliveryVehicleType;
  surgeMultiplierPermille: number;
  surgeLabel: string;
  cafeOwnerSharePercent: number;
};

export type DriverReview = {
  id: number;
  driverId: number;
  deliveryId: number;
  cafeId: number;
  rating: number;
  comment: string | null;
  cafeName: string;
  cafeOwnerName: string;
  createdAt: string;
};

export type DeliveryOpportunity = {
  id: number;
  deliveryCompanyId: number;
  title: string;
  description: string;
  area: string;
  vehicleTypeRequired: DeliveryVehicleType | null;
  startAt: string | null;
  durationHours: number | null;
  compensationCents: number | null;
  status: "OPEN" | "FILLED" | "CLOSED" | "CANCELLED";
  filledByDriverId: number | null;
  filledAt: string | null;
  createdAt: string;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ message: "Request failed" }))).message ?? "Request failed");
  return res.json();
}
async function mutate<T>(method: string, url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ message: "Request failed" }))).message ?? "Request failed");
  return res.json();
}

// ── Vehicles — Delivery Company / Supplier fleet ──

function vehicleOwnerPath(ownerType: "DELIVERY_COMPANY" | "SUPPLIER") {
  return ownerType === "DELIVERY_COMPANY" ? "/api/delivery-company/vehicles" : "/api/supplier/vehicles";
}

export function useVehicles(ownerType: "DELIVERY_COMPANY" | "SUPPLIER", enabled: boolean = true) {
  const path = vehicleOwnerPath(ownerType);
  return useQuery<Vehicle[]>({ queryKey: [path], queryFn: () => getJson(path), enabled });
}
export function useCreateVehicle(ownerType: "DELIVERY_COMPANY" | "SUPPLIER") {
  const path = vehicleOwnerPath(ownerType);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: VehicleInput) => mutate("POST", path, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
}
export function useUpdateVehicle(ownerType: "DELIVERY_COMPANY" | "SUPPLIER") {
  const path = vehicleOwnerPath(ownerType);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: VehicleInput & { id: number }) => mutate("PATCH", `${path}/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
}
export function useDeleteVehicle(ownerType: "DELIVERY_COMPANY" | "SUPPLIER") {
  const path = vehicleOwnerPath(ownerType);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("DELETE", `${path}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
}
export function useAssignVehicle(ownerType: "DELIVERY_COMPANY" | "SUPPLIER") {
  const path = vehicleOwnerPath(ownerType);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, driverId }: { vehicleId: number; driverId: number | null }) => mutate("PATCH", `${path}/${vehicleId}/assign`, { driverId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
}

// ── Driver's own vehicle (Espace Chauffeur → Paramètres) ──

export function useMyVehicle() {
  return useQuery<Vehicle | null>({ queryKey: ["/api/driver/vehicle"], queryFn: () => getJson("/api/driver/vehicle") });
}
export function useCreateMyVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: VehicleInput) => mutate("POST", "/api/driver/vehicle", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/driver/vehicle"] }),
  });
}
export function useUpdateMyVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: VehicleInput) => mutate("PATCH", "/api/driver/vehicle", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/driver/vehicle"] }),
  });
}

// ── Admin delivery pricing config ──

export function useDeliveryPricingSettings() {
  return useQuery<DeliveryPricingSettings>({ queryKey: ["/api/admin/delivery-pricing"], queryFn: () => getJson("/api/admin/delivery-pricing") });
}
export function useUpdateDeliveryPricingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<DeliveryPricingSettings>) => mutate("PATCH", "/api/admin/delivery-pricing", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/delivery-pricing"] }),
  });
}

// ── Driver reviews ──

export function useDriverReviews(driverId: number | null) {
  return useQuery<DriverReview[]>({
    queryKey: ["/api/driver/reviews", driverId],
    queryFn: () => getJson(`/api/driver/reviews/${driverId}`),
    enabled: driverId != null,
  });
}
export function useDriverReviewForDelivery(deliveryId: number | null) {
  return useQuery<DriverReview | null>({
    queryKey: ["/api/driver/reviews/delivery", deliveryId],
    queryFn: () => getJson(`/api/driver/reviews/delivery/${deliveryId}`),
    enabled: deliveryId != null,
  });
}
export function useCreateDriverReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { driverId: number; deliveryId: number; rating: number; comment?: string }) => mutate("POST", "/api/driver/reviews", data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/driver/reviews", vars.driverId] });
      qc.invalidateQueries({ queryKey: ["/api/driver/reviews/delivery", vars.deliveryId] });
      qc.invalidateQueries({ queryKey: ["/api/deliveries"] });
    },
  });
}

// ── Delivery Company opportunities ──

export function useCompanyOpportunities() {
  return useQuery<DeliveryOpportunity[]>({ queryKey: ["/api/delivery-company/opportunities"], queryFn: () => getJson("/api/delivery-company/opportunities") });
}
export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; description?: string; area?: string; vehicleTypeRequired?: DeliveryVehicleType | null; startAt?: string | null; durationHours?: number | null; compensationCents?: number | null }) =>
      mutate("POST", "/api/delivery-company/opportunities", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/delivery-company/opportunities"] }),
  });
}
export function useCloseOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "CLOSED" | "CANCELLED" }) => mutate("PATCH", `/api/delivery-company/opportunities/${id}/close`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/delivery-company/opportunities"] }),
  });
}

// ── Driver opportunities ──

export function useDriverOpportunities() {
  return useQuery<DeliveryOpportunity[]>({ queryKey: ["/api/driver/opportunities"], queryFn: () => getJson("/api/driver/opportunities") });
}
export function useAcceptOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("PATCH", `/api/driver/opportunities/${id}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/driver/opportunities"] }),
  });
}

// ── Delivery reassignment (before pickup) ──

export function useReassignDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deliveryId, driverId }: { deliveryId: number; driverId: number }) => mutate("PATCH", `/api/deliveries/${deliveryId}/reassign`, { driverId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/deliveries"] }),
  });
}
