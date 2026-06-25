import type { QueryClient } from "@tanstack/react-query";

/** Invalidate café marketplace caches after supplier/admin product changes. */
export function invalidateMarketplace(qc: QueryClient, productId?: number) {
  qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
  if (productId != null) {
    qc.invalidateQueries({ queryKey: ["/api/marketplace", productId] });
  }
}
