import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DriverProfile, Vehicle } from "@shared/schema";

// The single reusable "Chauffeur details" data source — same query powers the
// Driver's own Eye preview, Supplier → Drivers, Espace Livraison → Chauffeurs,
// and Admin → Chauffeurs (see GET /api/drivers/:driverId/details, permission-
// checked per viewer server-side). Vehicle/reviews are never duplicated: the
// vehicle comes straight from the real vehicles row, reviews stay on the
// existing useDriverReviews (use-delivery-ecosystem.ts).

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Request failed");
  return res.json();
}

export function useDriverDetails(driverId: number | null) {
  return useQuery<{ profile: DriverProfile; vehicle: Vehicle | null; operator: { type: "DELIVERY_COMPANY" | "SUPPLIER"; name: string } | null }>({
    queryKey: ["/api/drivers", driverId, "details"],
    queryFn: () => getJson(`/api/drivers/${driverId}/details`),
    enabled: driverId != null,
  });
}

export function useUpdateDriverProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      apiRequest("PATCH", "/api/driver/profile", updates).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/drivers/") }),
  });
}
