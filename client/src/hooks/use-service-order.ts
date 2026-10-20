import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_SERVICE_ORDER,
  type MarketplaceServiceId,
} from "@shared/schema";

export type { MarketplaceServiceId };

function normalizeServiceOrder(value: unknown): MarketplaceServiceId[] {
  const configured = Array.isArray(value) ? value : [];
  const valid = configured.filter((id): id is MarketplaceServiceId =>
    (DEFAULT_SERVICE_ORDER as readonly string[]).includes(id),
  );
  const uniqueValid = Array.from(new Set(valid));
  return [...uniqueValid, ...DEFAULT_SERVICE_ORDER.filter((id) => !uniqueValid.includes(id))];
}

export function sortServiceIds<T extends string | { id: string }>(ids: T[], order: MarketplaceServiceId[]): T[] {
  const indexes = new Map(order.map((id, index) => [id, index]));
  return [...ids].sort((a, b) =>
    (indexes.get((typeof a === "string" ? a : a.id).toUpperCase() as MarketplaceServiceId) ?? Number.MAX_SAFE_INTEGER)
    - (indexes.get((typeof b === "string" ? b : b.id).toUpperCase() as MarketplaceServiceId) ?? Number.MAX_SAFE_INTEGER),
  );
}

// Messages (ServiceId, marketplace-layout.tsx) and Notifications
// (NotificationService, shared/schema.ts) both identify services with their
// own shorter id scheme — "BARISTA"/"ACADEMY" instead of the admin order's
// "BARISTA_MARKETPLACE"/"BARISTA_ACADEMY" — so `sortServiceIds` alone never
// matched them (task: "Apply Admin Service Ordering to Coffee Owner
// Notifications and Messages Modals"). This maps a short id to its real
// MarketplaceServiceId before applying the exact same configured order — a
// short id with no mapping (e.g. Notifications' own "ADMIN") sorts last,
// same "unknown stays at the end" fallback `sortServiceIds` already uses.
const SHORT_TO_MARKETPLACE_SERVICE_ID: Record<string, MarketplaceServiceId> = {
  SHOP: "SHOP",
  MAINTENANCE: "MAINTENANCE",
  PRINT: "PRINT",
  BARISTA: "BARISTA_MARKETPLACE",
  ACADEMY: "BARISTA_ACADEMY",
  MARKETING: "MARKETING",
};

export function sortShortServiceIds<T extends string | { id: string }>(ids: T[], order: MarketplaceServiceId[]): T[] {
  const indexes = new Map(order.map((id, index) => [id, index]));
  const rank = (value: T): number => {
    const shortId = (typeof value === "string" ? value : value.id).toUpperCase();
    const longId = SHORT_TO_MARKETPLACE_SERVICE_ID[shortId];
    return longId ? indexes.get(longId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

export function useServiceOrder() {
  const { data, isLoading } = useQuery<MarketplaceServiceId[]>({
    queryKey: ["/api/system-service-order"],
  });
  return { order: normalizeServiceOrder(data), isLoading };
}