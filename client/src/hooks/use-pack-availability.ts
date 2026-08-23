import { useQuery } from "@tanstack/react-query";
import type { PackDetail } from "@shared/schema";

// Revalidates the current backend state of every Pack currently sitting in the
// SHOP cart, against the single authoritative source of truth (GET /api/packs/:id,
// which wraps storage.getPackDetail() — the same isAvailable computation
// resolvePackOrderItems() enforces at order-creation time). The cart never persists
// a "frozen" flag of its own: freeze/unfreeze is derived fresh from this query's
// result every time it runs, so a Pack that becomes available again (or whose
// price/name/image/composition changed) is picked up automatically on the next
// fetch — no manual unfreeze, nothing to get permanently stuck.
export const PACK_AVAILABILITY_KEY = "/api/packs/availability";

// Three distinct outcomes — deliberately NOT collapsed into a boolean. A prior
// version treated "the request failed" (401 session hiccup, 5xx, a proxy blip,
// a network error — all of which are more likely in a real deployment than on a
// zero-latency localhost loopback) exactly the same as "the backend confirmed
// this Pack is gone", which froze every Pack in the cart the moment any such
// transient failure occurred, in any environment where that's not rare (see the
// production Pack-freeze investigation this fixes). Only `unavailable` may ever
// freeze a Pack — `unknown` must not, and gets retried instead of cached as a
// false negative for the query's staleTime.
export type PackAvailabilityResult =
  | { status: "available"; detail: PackDetail }
  | { status: "unavailable"; detail: PackDetail | null }
  | { status: "unknown" };

export function usePackAvailability(packIds: number[]) {
  const uniqueIds = Array.from(new Set(packIds)).sort((a, b) => a - b);

  return useQuery<Record<number, PackAvailabilityResult>>({
    queryKey: [PACK_AVAILABILITY_KEY, uniqueIds],
    queryFn: async () => {
      const entries = await Promise.all(uniqueIds.map(async (id): Promise<readonly [number, PackAvailabilityResult]> => {
        try {
          const res = await fetch(`/api/packs/${id}`, { credentials: "include" });

          // Confirmed by the backend: this Pack no longer exists at all.
          if (res.status === 404) {
            console.warn("[PACK AVAILABILITY] Pack not found (confirmed unavailable)", { packId: id, status: res.status });
            return [id, { status: "unavailable", detail: null }];
          }

          // Any other non-2xx (401 session hiccup, 403, 500, a proxy/edge error
          // page, ...) means we could NOT verify — never treat this as "gone".
          if (!res.ok) {
            console.warn("[PACK AVAILABILITY] Request failed, keeping last-known state (not freezing)", { packId: id, status: res.status });
            return [id, { status: "unknown" }];
          }

          const detail = await res.json() as PackDetail;
          console.debug("[PACK AVAILABILITY] Resolved", { packId: id, isAvailable: detail.isAvailable, price: detail.price, name: detail.name });
          return [id, detail.isAvailable ? { status: "available", detail } : { status: "unavailable", detail }];
        } catch (err) {
          // Network error, timeout, JSON parse failure, etc. — same rule as above.
          console.warn("[PACK AVAILABILITY] Network/parse error, keeping last-known state (not freezing)", { packId: id, error: err instanceof Error ? err.message : String(err) });
          return [id, { status: "unknown" }];
        }
      }));
      return Object.fromEntries(entries);
    },
    enabled: uniqueIds.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // Transient failures (the "unknown" case above) get a few automatic retries
    // before the query settles, instead of the cart having to wait out the full
    // staleTime or a window-focus event to self-correct.
    retry: 2,
  });
}

/** true only once the backend has actually CONFIRMED the Pack is unavailable/gone —
 * never while the query is still loading, and never when the check merely failed to
 * complete (network/auth/server hiccup) instead of returning a real answer. */
export function isPackFrozen(result: PackAvailabilityResult | undefined): boolean {
  if (!result) return false;
  return result.status === "unavailable";
}
