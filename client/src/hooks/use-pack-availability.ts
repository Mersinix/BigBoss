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

export function usePackAvailability(packIds: number[]) {
  const uniqueIds = Array.from(new Set(packIds)).sort((a, b) => a - b);

  return useQuery<Record<number, PackDetail | null>>({
    queryKey: [PACK_AVAILABILITY_KEY, uniqueIds],
    queryFn: async () => {
      const entries = await Promise.all(uniqueIds.map(async (id) => {
        try {
          const res = await fetch(`/api/packs/${id}`, { credentials: "include" });
          if (!res.ok) return [id, null] as const;
          return [id, await res.json() as PackDetail] as const;
        } catch {
          return [id, null] as const;
        }
      }));
      return Object.fromEntries(entries);
    },
    enabled: uniqueIds.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** true only once the check has actually resolved and found the Pack unavailable/gone —
 * never while the query is still loading, so a normal available Pack never flashes
 * "unavailable" for an instant on page load. */
export function isPackFrozen(detail: PackDetail | null | undefined): boolean {
  if (detail === undefined) return false;
  return detail === null || !detail.isAvailable;
}
