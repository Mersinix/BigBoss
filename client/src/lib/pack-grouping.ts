// Groups a Pack's flat included-products list (one row per selected flavor/size
// distribution) into one entry per underlying product, each carrying its own list of
// distributions. Used everywhere a Pack's composition is displayed (cart, checkout
// summary, order details) so the product name/brand/category is shown once, not once per
// flavor row — grouping is keyed by productId (the actual variant identity), never by
// productName, since a Pack can legitimately contain two differently-sized/branded
// products that happen to share a name fragment.

export type PackDistributionRow = {
  flavorName: string | null;
  sizeName: string | null;
  /** Quantity for this single distribution, already resolved to whatever unit the caller wants displayed (see multiplier param below). */
  quantity: number;
};

export type GroupedPackProduct = {
  productId: number;
  productName: string;
  productImageUrl: string | null;
  brandName: string | null;
  categoryName: string | null;
  subCategoryName: string | null;
  distributions: PackDistributionRow[];
};

type IncludedProductLike = {
  productId: number;
  productName: string;
  productImageUrl?: string | null;
  brandName?: string | null;
  categoryName?: string | null;
  subCategoryName?: string | null;
  flavorName: string | null;
  sizeName: string | null;
  quantity: number;
};

/**
 * @param items Flat per-distribution rows (e.g. PackCartItem.includedProducts).
 * @param multiplier Applied to each row's quantity — pass the Pack's own cart/order
 *   quantity so the base per-one-pack amount stored on each row becomes the correct
 *   displayed/total quantity (base × packQuantity). Pass 1 when `items` already holds
 *   final totals (e.g. a historical order snapshot).
 */
export function groupPackIncludedProducts(
  items: IncludedProductLike[] | null | undefined,
  multiplier: number = 1,
): GroupedPackProduct[] {
  const groups: GroupedPackProduct[] = [];
  const indexByProductId = new Map<number, number>();

  for (const item of items ?? []) {
    let idx = indexByProductId.get(item.productId);
    if (idx === undefined) {
      idx = groups.length;
      indexByProductId.set(item.productId, idx);
      groups.push({
        productId: item.productId,
        productName: item.productName,
        productImageUrl: item.productImageUrl ?? null,
        brandName: item.brandName ?? null,
        categoryName: item.categoryName ?? null,
        subCategoryName: item.subCategoryName ?? null,
        distributions: [],
      });
    }
    groups[idx].distributions.push({
      flavorName: item.flavorName,
      sizeName: item.sizeName,
      quantity: item.quantity * multiplier,
    });
  }

  return groups;
}
