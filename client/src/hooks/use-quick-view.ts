import { create } from "zustand";

// When set, the next "Add to Cart" click inside the product modal replaces this
// cart line instead of adding/merging a new one — used by the Cart page's
// "Choisir un autre fournisseur" action on a line the supplier cancelled (see
// pages/cafe/cart-page.tsx and components/product-detail-content.tsx's VariantRow).
// Carries the ORIGINAL requested configuration so the modal can default the
// quantity and highlight the matching flavor/size across every supplier's listing.
export interface ProductReplaceTarget {
  listingId: number;
  flavorId: number | null;
  sizeId: number | null;
  flavorName: string | null;
  sizeName: string | null;
  quantity: number;
}

interface QuickViewStore {
  productId: number | null;
  supplierId: number | null;
  replaceTarget: ProductReplaceTarget | null;
  open: (productId: number, supplierId?: number) => void;
  /** Opens the product for browsing (no fixed supplier, so every supplier's listing is
   * visible) and arms replace mode for the given cancelled cart line. */
  openForReplace: (productId: number, target: ProductReplaceTarget) => void;
  /** Clears just the armed replacement, without closing the modal — called once the
   * replacement has been applied. */
  clearReplaceTarget: () => void;
  close: () => void;
}

export const useQuickView = create<QuickViewStore>((set) => ({
  productId: null,
  supplierId: null,
  replaceTarget: null,
  open: (productId, supplierId) => set({ productId, supplierId: supplierId ?? null, replaceTarget: null }),
  openForReplace: (productId, target) => set({ productId, supplierId: null, replaceTarget: target }),
  clearReplaceTarget: () => set({ replaceTarget: null }),
  close: () => set({ productId: null, supplierId: null, replaceTarget: null }),
}));
