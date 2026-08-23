import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { groupPackIncludedProducts } from "@/lib/pack-grouping";

// Single shared pack-composition renderer for every Order Details surface
// (Coffee Owner modal, Supplier modal). Previously each modal had its own
// copy; the Supplier one never read the order's historical snapshot and
// always re-fetched the pack's *current* live composition, which could
// silently diverge from what was actually purchased and from what the
// Coffee Owner modal showed for the exact same order. This is now the one
// place that decides "what did this pack actually contain at checkout".

type PackCompositionItem = {
  listingId: number;
  variantId: number | null;
  productName: string;
  flavorName: string | null;
  sizeName: string | null;
  quantity: number;
};

function usePackComposition(packId: number | null) {
  return useQuery<PackCompositionItem[]>({
    queryKey: ["/api/packs", packId, "composition"],
    queryFn: async () => {
      const res = await fetch(`/api/packs/${packId}/composition`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pack composition");
      return res.json();
    },
    enabled: packId != null,
    staleTime: 5 * 60 * 1000,
  });
}

export type PackCompositionTheme = {
  dk: boolean;
  innerCard: string;
  textSubtle: string;
  textPrimary: string;
  textMuted: string;
};

export function PackCompositionView({
  packId,
  quantity,
  snapshot,
  t,
}: {
  packId: number;
  quantity: number;
  /** The order item's stored snapshot (item.snapshot when kind === "PACK").
   * When present, its includedProducts is the exact historical composition
   * captured at checkout and is used as-is. Only orders created before this
   * snapshot existed fall back to the pack's current live composition. */
  snapshot?: any;
  t: PackCompositionTheme;
}) {
  const historicalComposition = Array.isArray(snapshot?.includedProducts) ? snapshot.includedProducts : null;
  const { data: composition, isLoading } = usePackComposition(historicalComposition ? null : packId);

  if (!historicalComposition && isLoading) {
    return (
      <div className="mt-2 space-y-1.5">
        {[1, 2].map(i => (
          <div key={i} className={`h-4 rounded animate-pulse ${t.dk ? "bg-gray-700" : "bg-gray-200"}`} />
        ))}
      </div>
    );
  }

  const rows = historicalComposition ?? composition ?? [];
  if (!rows.length) return null;

  // Stored order snapshots already contain the exact included quantity captured at
  // checkout (already resolved to the total across every pack purchased — see
  // PackCartItemProduct/cart-page.tsx). Legacy orders (created before that snapshot field
  // existed) fall back to live composition rows, where quantity is per-one-pack and must
  // still be multiplied by the ordered pack quantity.
  const multiplier = historicalComposition ? 1 : quantity;
  const groups = groupPackIncludedProducts(rows, multiplier);

  // Rendered directly on the parent card's own background — no inner container/border/bg,
  // so this reads as a section of the Produits card, not a card nested inside a card.
  return (
    <div className="mt-2">
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${t.textPrimary}`}>
        Composition du pack × {quantity}
      </p>
      <div className="space-y-2.5">
        {groups.map((group) => (
          <div key={group.productId} className={`flex items-start gap-2 text-xs ${t.textPrimary}`}>
            <ChevronRight className={`w-3 h-3 mt-0.5 shrink-0 ${t.textSubtle}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                {group.productImageUrl && (
                  <img
                    src={group.productImageUrl}
                    alt=""
                    className="w-7 h-7 rounded-lg object-cover shrink-0"
                  />
                )}
                <span className={`font-medium ${t.textPrimary}`}>{group.productName}</span>
              </div>
              {(group.brandName || group.categoryName || group.subCategoryName) && (
                <p className={`mt-1 text-[10px] ${t.textPrimary}`}>
                  {[group.brandName, group.categoryName, group.subCategoryName].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-1 space-y-0.5">
                {group.distributions.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className={t.textPrimary}>
                      {d.flavorName && <span>Saveur: <b>{d.flavorName}</b></span>}
                      {d.flavorName && d.sizeName && <span className="mx-1">·</span>}
                      {d.sizeName && <span>Taille: <b>{d.sizeName}</b></span>}
                    </span>
                    <span className={`font-bold shrink-0 ${t.textPrimary}`}>×{d.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
