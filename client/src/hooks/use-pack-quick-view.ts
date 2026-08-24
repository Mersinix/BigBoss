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
  /** Set when the Coffee Owner clicked "Choisir un autre fournisseur" on a Pack line
   * the supplier cancelled — the NEXT Pack added to cart while this is set REPLACES
   * that line instead of adding a new one. Packs are supplier-exclusive (one Pack row
   * belongs to exactly one supplier), so unlike a regular product there is no "same
   * Pack, different supplier" — a replacement is necessarily a different Pack entity,
   * found by browsing normally. Persists across open()/close() of this modal so the
   * Coffee Owner can look at a few candidates before picking one; only cleared once
   * consumed (a Pack is actually added) or explicitly cancelled. */
  replaceTargetPackId: number | null;
  open: (packId: number) => void;
  openForEdit: (cartItem: PackCartItem, onSave?: (updated: PackCartItem) => void) => void;
  armReplace: (oldPackId: number) => void;
  clearReplaceTarget: () => void;
  close: () => void;
}

export const usePackQuickView = create<PackQuickViewStore>((set) => ({
  packId: null,
  editCartItem: null,
  onSave: null,
  replaceTargetPackId: null,
  open: (packId) => set({ packId, editCartItem: null, onSave: null }),
  openForEdit: (cartItem, onSave) => set({ packId: cartItem.packId, editCartItem: cartItem, onSave: onSave ?? null }),
  armReplace: (oldPackId) => set({ packId: null, editCartItem: null, onSave: null, replaceTargetPackId: oldPackId }),
  clearReplaceTarget: () => set({ replaceTargetPackId: null }),
  close: () => set({ packId: null, editCartItem: null, onSave: null }),
}));
