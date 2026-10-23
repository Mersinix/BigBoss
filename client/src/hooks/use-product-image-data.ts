import { useQuery } from "@tanstack/react-query";

// Batched, lightweight re-resolution of a product's CURRENT image + saved
// progressive crop, keyed by productId (task: "Synchronize Updated Product
// and Pack Images in Coffee Owner Cart"). Cart lines persist a one-time
// snapshot (CartItem.productImageUrl) that never updates after an Admin
// edits the product's image or crop — this hook is the live counterpart,
// mirroring the exact pattern already established by use-pack-availability.ts
// (same staleTime/refetchOnWindowFocus, no new polling/real-time infra).
//
// The query key is deliberately nested under "/api/marketplace" so it is
// already caught by the existing invalidateMarketplace(qc) helper that every
// Admin/Supplier product-save mutation already calls — no new invalidation
// wiring needed on the write side.
export type ProductImageData = {
  id: number;
  imageUrl: string | null;
  imageUrls: string[] | null;
  imageAdjustments: Record<string, number>;
};

export function useProductImageData(productIds: number[]) {
  const uniqueIds = Array.from(
    new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))
  ).sort((a, b) => a - b);

  return useQuery<Record<number, ProductImageData>>({
    queryKey: ["/api/marketplace", "product-image-data", uniqueIds],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/products/image-data?ids=${uniqueIds.join(",")}`, {
        credentials: "include",
      });
      if (!res.ok) return {};
      const rows: ProductImageData[] = await res.json();
      return Object.fromEntries(rows.map((r) => [r.id, r]));
    },
    enabled: uniqueIds.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
