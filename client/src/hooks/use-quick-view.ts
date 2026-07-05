import { create } from "zustand";

interface QuickViewStore {
  productId: number | null;
  open: (productId: number) => void;
  close: () => void;
}

export const useQuickView = create<QuickViewStore>((set) => ({
  productId: null,
  open: (productId) => set({ productId }),
  close: () => set({ productId: null }),
}));
