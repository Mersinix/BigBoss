import { create } from "zustand";
import type { PackCartItem } from "@/hooks/use-cart";

interface PackQuickViewStore {
  packId: number | null;
  /** Set when the modal was opened via an "Edit" button — the modal should
   * prepopulate from this line and update it in place instead of adding a
   * new one. Null means the normal "view/add to cart" flow. */
  editCartItem: PackCartItem | null;
  /** Where an edit's "Update" click writes the result. When null (the Cart
   * page's Edit button), the modal falls back to updating the real cart
   * directly via useCart().setPackItem. When set (e.g. the Order Summary's
   * Edit button), the modal calls this instead — so an edit started from an
   * order draft only ever mutates that draft, never the live Cart. */
  onSave: ((updated: PackCartItem) => void) | null;
  open: (packId: number) => void;
  openForEdit: (cartItem: PackCartItem, onSave?: (updated: PackCartItem) => void) => void;
  close: () => void;
}

export const usePackQuickView = create<PackQuickViewStore>((set) => ({
  packId: null,
  editCartItem: null,
  onSave: null,
  open: (packId) => set({ packId, editCartItem: null, onSave: null }),
  openForEdit: (cartItem, onSave) => set({ packId: cartItem.packId, editCartItem: cartItem, onSave: onSave ?? null }),
  close: () => set({ packId: null, editCartItem: null, onSave: null }),
}));
