/**
 * Evaluates active promotions for the current cart items.
 * Calls POST /api/promotions/evaluate server-side so results match
 * what will be applied at checkout.
 */
import { useQuery } from "@tanstack/react-query";
import { useCart, type CartItem } from "./use-cart";
import type { CartPromotionEvaluation } from "@shared/schema";

async function evaluatePromotions(
  items: { listingId: number; productId: number; categoryId?: number | null; supplierId: number; quantity: number; unitPrice: number }[],
): Promise<CartPromotionEvaluation> {
  if (items.length === 0) {
    return { bySupplier: [], totalOriginal: 0, totalDiscount: 0, totalFinal: 0 };
  }
  const res = await fetch("/api/promotions/evaluate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) return { bySupplier: [], totalOriginal: 0, totalDiscount: 0, totalFinal: 0 };
  return res.json();
}

// itemsOverride lets a caller evaluate promotions against only its orderable items —
// e.g. the Cart page excludes lines a supplier cancelled (cancelledBySupplier) from this
// evaluation, the same way they're excluded from checkout/totals, so a promotion like
// "free shipping over X" is never triggered/withheld based on a line that can't actually
// be ordered. Defaults to the full live cart when omitted (previous behavior).
export function usePromotionEvaluation(itemsOverride?: CartItem[]) {
  const { items: cartStoreItems } = useCart();
  const items = itemsOverride ?? cartStoreItems;

  const cartItems = items.map(i => ({
    listingId: i.listingId,
    productId: i.productId,
    categoryId: null,
    supplierId: i.supplierId,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
  }));

  // Stable query key: sort + stringify so it only refetches when cart actually changes
  const queryKey = [
    "/api/promotions/evaluate",
    cartItems.map(i => `${i.listingId}:${i.quantity}`).sort().join(","),
  ];

  const { data, isLoading } = useQuery<CartPromotionEvaluation>({
    queryKey,
    queryFn: () => evaluatePromotions(cartItems),
    enabled: cartItems.length > 0,
    staleTime: 30_000,
    retry: false,
  });

  return {
    evaluation: data ?? { bySupplier: [], totalOriginal: 0, totalDiscount: 0, totalFinal: 0 },
    isLoading,
    totalDiscount: data?.totalDiscount ?? 0,
    hasDiscount: (data?.totalDiscount ?? 0) > 0,
  };
}
