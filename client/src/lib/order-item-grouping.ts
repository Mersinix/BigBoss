// Groups an order's regular (non-pack) order items by their base product —
// the same conceptual grouping the Cart page and Order Summary use for cart
// items (see cart-grouping.ts) — so every Order Details surface (Coffee
// Owner modal, Supplier modal, or any future one) renders the exact same
// "Product -> Variants" structure from the exact same order data.
//
// Product identity is the order item's actual productId (from the historical
// snapshot when present, else the live FK) — never the product name — so two
// different products that happen to share a name are never merged.
//
// Historical accuracy: every display field prefers the item's stored
// `snapshot` (captured at checkout — see server/storage.ts createOrder)
// over any live-joined data, so what the customer sees always matches what
// they actually purchased, even if the product/pack has since changed.
// Legacy orders created before the snapshot field existed fall back to the
// live-joined `item.product` for the name/image only, matching what was
// already displayed for those orders before this change.

export type NormalizedOrderVariant = {
  key: string;
  flavorName: string | null;
  sizeName: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type NormalizedOrderProductGroup = {
  productId: number;
  productName: string;
  productImageUrl: string | null;
  brandName: string | null;
  categoryName: string | null;
  subCategoryName: string | null;
  variants: NormalizedOrderVariant[];
  subtotal: number;
};

export function groupOrderItemsByProduct(items: any[]): NormalizedOrderProductGroup[] {
  const groups: NormalizedOrderProductGroup[] = [];
  const indexByProductId = new Map<number, number>();

  for (const item of items ?? []) {
    if (item.packId) continue; // packs are handled separately, never as a "product"

    const snapshot = item.snapshot?.kind === "PRODUCT" ? item.snapshot : null;
    const productId = snapshot?.productId ?? item.productId;
    if (productId == null) continue;

    const productName = snapshot?.productName ?? item.product?.name ?? "Produit";
    const productImageUrl = snapshot?.productImageUrl ?? item.product?.imageUrl ?? null;
    const brandName = snapshot?.brandName ?? null;
    const categoryName = snapshot?.categoryName ?? null;
    const subCategoryName = snapshot?.subCategoryName ?? null;
    const flavorName = snapshot?.flavorName ?? item.flavorName ?? null;
    const sizeName = snapshot?.sizeName ?? item.sizeName ?? null;
    const quantity = item.quantity ?? 0;
    const unitPrice = snapshot?.unitPrice ?? item.unitPrice ?? 0;
    const totalPrice = snapshot?.totalPrice ?? item.totalPrice ?? unitPrice * quantity;

    let index = indexByProductId.get(productId);
    if (index === undefined) {
      index = groups.length;
      indexByProductId.set(productId, index);
      groups.push({
        productId, productName, productImageUrl, brandName, categoryName, subCategoryName,
        variants: [], subtotal: 0,
      });
    }
    groups[index].variants.push({
      key: `${item.id ?? item.listingId ?? productId}-${item.flavorId ?? 0}-${item.sizeId ?? 0}`,
      flavorName, sizeName, quantity, unitPrice, totalPrice,
    });
    groups[index].subtotal += totalPrice;
  }

  return groups;
}
