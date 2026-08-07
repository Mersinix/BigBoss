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
  return [...new Set(valid), ...DEFAULT_SERVICE_ORDER.filter((id) => !valid.includes(id))];
}

export function sortServiceIds<T extends string>(ids: T[], order: MarketplaceServiceId[]): T[] {
  const indexes = new Map(order.map((id, index) => [id, index]));
  return [...ids].sort((a, b) =>
    (indexes.get(a.toUpperCase() as MarketplaceServiceId) ?? Number.MAX_SAFE_INTEGER)
    - (indexes.get(b.toUpperCase() as MarketplaceServiceId) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function useServiceOrder() {
  const { data, isLoading } = useQuery<MarketplaceServiceId[]>({
    queryKey: ["/api/system-service-order"],
  });
  return { order: normalizeServiceOrder(data), isLoading };
}