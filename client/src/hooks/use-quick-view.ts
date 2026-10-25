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
  // Ordered list of product IDs the Previous/Next Product buttons navigate
  // through — the Shop page's own currently-filtered product list (task:
  // "Navigate Between Mapped Products and Packs Without Closing the Detail
  // Modal"). Null means no navigation context (every caller other than the
  // Shop page omits it on open(), so this stays null and the nav buttons
  // simply don't render there — unchanged behavior for Store Detail Page,
  // Cart Page, Flash Mode, etc.). The Shop page also keeps this in sync via
  // setNavIds() whenever its own filtered list changes while the modal is
  // open, so navigation never uses a stale list.
  navIds: number[] | null;
  open: (productId: number, supplierId?: number, navIds?: number[] | null) => void;
  /** Opens the product for browsing (no fixed supplier, so every supplier's listing is
   * visible) and arms replace mode for the given cancelled cart line. */
  openForReplace: (productId: number, target: ProductReplaceTarget) => void;
  /** Clears just the armed replacement, without closing the modal — called once the
   * replacement has been applied. */
  clearReplaceTarget: () => void;
  close: () => void;
  /** Switches the displayed product without touching supplierId/replaceTarget/navIds
   * or replaying the open/close animation — used only by the Previous/Next Product
   * buttons, which must keep browsing the same navIds list. */
  navigateTo: (productId: number) => void;
  /** Keeps navIds in sync with the Shop's own filtered list reactively (e.g. the
   * Coffee Owner changes a filter while the modal is still open). */
  setNavIds: (navIds: number[] | null) => void;
}

export const useQuickView = create<QuickViewStore>((set) => ({
  productId: null,
  supplierId: null,
  replaceTarget: null,
  navIds: null,
  open: (productId, supplierId, navIds) => set({ productId, supplierId: supplierId ?? null, replaceTarget: null, navIds: navIds ?? null }),
  openForReplace: (productId, target) => set({ productId, supplierId: null, replaceTarget: target, navIds: null }),
  clearReplaceTarget: () => set({ replaceTarget: null }),
  close: () => set({ productId: null, supplierId: null, replaceTarget: null, navIds: null }),
  navigateTo: (productId) => set({ productId }),
  setNavIds: (navIds) => set({ navIds }),
}));
