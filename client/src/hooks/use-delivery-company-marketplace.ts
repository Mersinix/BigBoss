import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DeliveryCompanyMarketplaceCard, SupplierProductReview, Vehicle } from "@shared/schema";

export type DeliveryCompanyDriverCard = { id: number; name: string; profileImageUrl: string | null; busy: boolean };

// Mirrors use-barista-marketplace.ts / the Maintenance equivalents structurally
// (same query-key/mutation shape) — the single client-side entry point for the
// new Delivery Company marketplace data. No profile is fetched/cached twice:
// the self-editor (profile.tsx), the Eye preview, and the Supplier-facing
// card/modal all key off the exact same queries below.

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Request failed");
  return res.json();
}
async function mutate<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiRequest(method as any, url, body);
  return res.json();
}

export function useDeliveryCompanyProfiles(filters?: { search?: string; available?: boolean; location?: string }) {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.available !== undefined) params.set("available", String(filters.available));
  if (filters?.location) params.set("location", filters.location);
  const qs = params.toString();
  const path = `/api/delivery-company/profiles${qs ? `?${qs}` : ""}`;
  return useQuery<DeliveryCompanyMarketplaceCard[]>({
    queryKey: ["/api/delivery-company/profiles", filters ?? {}],
    queryFn: () => getJson(path),
  });
}

// Self-view (Business → Profil) and admin view both return { user, profile, card };
// a Supplier or any other non-self viewer gets { card } only (server-sanitized).
export function useDeliveryCompanyProfileDetail(userId: number | null) {
  return useQuery<{
    card?: DeliveryCompanyMarketplaceCard; user?: any; profile?: any;
    drivers: DeliveryCompanyDriverCard[]; vehicles: Vehicle[];
  }>({
    queryKey: ["/api/delivery-company/profile", userId],
    queryFn: () => getJson(`/api/delivery-company/profile/${userId}`),
    enabled: userId != null,
  });
}

export function useUpdateDeliveryCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Record<string, unknown>) => mutate("PATCH", "/api/delivery-company/profile", updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/delivery-company/profile"] }),
  });
}

export function useDeliveryCompanyReviews(deliveryCompanyUserId: number | null) {
  return useQuery<SupplierProductReview[]>({
    queryKey: ["/api/delivery-company/reviews", deliveryCompanyUserId],
    queryFn: () => getJson(`/api/delivery-company/reviews/${deliveryCompanyUserId}`),
    enabled: deliveryCompanyUserId != null,
  });
}

export function useCreateDeliveryCompanyReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { deliveryCompanyUserId: number; deliveryId: number; rating: number; comment?: string }) =>
      mutate("POST", "/api/delivery-company/reviews", data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/delivery-company/reviews", vars.deliveryCompanyUserId] });
      qc.invalidateQueries({ queryKey: ["/api/delivery-company/profiles"] });
      qc.invalidateQueries({ queryKey: ["/api/deliveries"] });
    },
  });
}

export function useReportDeliveryCompany() {
  return useMutation({
    mutationFn: ({ deliveryCompanyUserId, reason }: { deliveryCompanyUserId: number; reason: string }) =>
      mutate("POST", `/api/delivery-company/${deliveryCompanyUserId}/report`, { reason }),
  });
}

export type MyDeliveryCompanyReport = {
  id: number;
  deliveryCompanyUserId: number;
  companyName: string;
  reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
};
export function useMyDeliveryCompanyReports() {
  return useQuery<MyDeliveryCompanyReport[]>({ queryKey: ["/api/delivery-company/reports/mine"] });
}
