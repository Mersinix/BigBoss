import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DeliveryWithDetails, DeliveryVehicleType, GeoLocation } from "@shared/schema";

/** Purely visual per-second countdown to an ISO timestamp — never the actual expiry
 *  enforcement (the server-side worker owns that, see server/routes/delivery.routes.ts).
 *  Ticks locally; no network request. Returns 0 once passed, never negative. */
export function useCountdownSeconds(expiresAt: string | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return 0;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
}

// Smart Driver Dispatch System (task: "BigBossCoffee — Smart Driver Dispatch System") —
// client-side entry points for the new offer lifecycle, dispatch status, and dispatch
// statistics. No query here polls on an interval: real-time updates come from WS events
// wired into use-realtime.ts (Phase 8), which invalidate these exact query keys — avoids
// the "excessive polling" the task explicitly warns against. A visible offer/response
// countdown is a local per-second UI tick on the already-fetched `expiresAt`, not a refetch.

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Request failed");
  return res.json();
}

export interface AssignableDriver {
  id: number; name: string; phone: string | null; vehicleType: DeliveryVehicleType | null;
  compatible: boolean; reason?: string; expectedPayoutCents: number; busy: boolean; acceptingNewOffers: boolean;
}

export interface AssignableDriversResult {
  delivery: {
    pickupAddress: GeoLocation; destinationAddress: GeoLocation | null;
    distanceKm: string | null; roadDistanceKm: string | null; estimatedDurationMinutes: number | null;
    requiredVehicleType: DeliveryVehicleType | null;
    totalWeightKg: string | null; totalVolumeL: string | null; numberOfPackages: number | null; numberOfItems: number | null;
    isFragile: boolean; specialHandling: string | null;
  };
  drivers: AssignableDriver[];
}

export function useAssignableDrivers(deliveryId: number | null) {
  return useQuery<AssignableDriversResult>({
    queryKey: ["/api/deliveries", deliveryId, "assignable-drivers"],
    queryFn: () => getJson(`/api/deliveries/${deliveryId}/assignable-drivers`),
    enabled: deliveryId != null,
  });
}

export interface DispatchStatus {
  state: "NONE" | "SEARCHING" | "OFFER_PENDING" | "EXHAUSTED" | "ASSIGNED";
  pendingOffer: { id: number; deliveryId: number; driverId: number; driverName: string; expiresAt: string; attemptNumber: number } | null;
  attemptCount: number;
}

export function useDispatchStatus(deliveryId: number | null) {
  return useQuery<DispatchStatus>({
    queryKey: ["/api/deliveries", deliveryId, "dispatch-status"],
    queryFn: () => getJson(`/api/deliveries/${deliveryId}/dispatch-status`),
    enabled: deliveryId != null,
  });
}

export interface DispatchStats {
  totalOffers: number; accepted: number; refused: number; expired: number; cancelled: number;
  acceptanceRate: number | null; completedDeliveries: number;
}

export function useCompanyDispatchStats(enabled: boolean = true) {
  return useQuery<DispatchStats>({
    queryKey: ["/api/delivery-company/dispatch-stats"],
    queryFn: () => getJson("/api/delivery-company/dispatch-stats"),
    enabled,
  });
}

export function useDriverDispatchStats(driverId: number | null) {
  return useQuery<DispatchStats & { avgRating: number | null; reviewCount: number }>({
    queryKey: ["/api/drivers", driverId, "dispatch-stats"],
    queryFn: () => getJson(`/api/drivers/${driverId}/dispatch-stats`),
    enabled: driverId != null,
  });
}

export interface PendingOffer {
  id: number; deliveryId: number; driverId: number; status: string; attemptNumber: number;
  createdAt: string; respondedAt: string | null; expiresAt: string;
  delivery: DeliveryWithDetails | null;
}

export function useDriverPendingOffers() {
  return useQuery<PendingOffer[]>({
    queryKey: ["/api/driver/offers/pending"],
    queryFn: () => getJson("/api/driver/offers/pending"),
  });
}

// Task: "Update Espace Chauffeur → Business → Planification: Offer Acceptance, Refusal,
// and Delivery Details" — Anciennes' "Annulée" cards. Same row shape as a pending offer.
export function useDriverRefusedOffers() {
  return useQuery<PendingOffer[]>({
    queryKey: ["/api/driver/offers/refused"],
    queryFn: () => getJson("/api/driver/offers/refused"),
  });
}

export function useAcceptOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (offerId: number) => apiRequest("PATCH", `/api/driver/offers/${offerId}/accept`, {}).then((r) => r.json()),
    // onSettled, not onSuccess only (task §6: "If the offer is no longer pending, show an
    // appropriate message and refresh the page data") — a failed accept (lost a race to
    // expiry/another action) just as surely means the cached pending-offers list is stale.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["/api/driver/offers/pending"] });
      qc.invalidateQueries({ queryKey: ["/api/deliveries"] });
    },
  });
}

export function useRetryDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: number) => apiRequest("POST", `/api/deliveries/${deliveryId}/dispatch/retry`, {}).then((r) => r.json()),
    onSuccess: (_data, deliveryId) => qc.invalidateQueries({ queryKey: ["/api/deliveries", deliveryId, "dispatch-status"] }),
  });
}

export function useRefuseOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (offerId: number) => apiRequest("PATCH", `/api/driver/offers/${offerId}/refuse`, {}).then((r) => r.json()),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["/api/driver/offers/pending"] });
      qc.invalidateQueries({ queryKey: ["/api/driver/offers/refused"] });
    },
  });
}
