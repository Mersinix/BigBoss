import type { CartItem } from "@/hooks/use-cart";

// Groups cart line items (one per listing/flavor/size variant) under their
// shared base product, keyed strictly by productId — the same identity the
// rest of the app uses for a "product". Different products are never merged
// just because they share a similar name. Used by both the Cart page and the
// Order Summary modal so both surfaces render the exact same product ->
// variants structure.
export function groupCartProducts(items: CartItem[]) {
  const groups: Array<{ product: CartItem; variants: CartItem[] }> = [];
  const byProduct = new Map<number, number>();
  for (const item of items) {
    const existingIndex = byProduct.get(item.productId);
    if (existingIndex === undefined) {
      byProduct.set(item.productId, groups.length);
      groups.push({ product: item, variants: [item] });
    } else {
      groups[existingIndex].variants.push(item);
    }
  }
  return groups;
}
