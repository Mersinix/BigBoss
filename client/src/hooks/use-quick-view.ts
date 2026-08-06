import { create } from "zustand";

interface QuickViewStore {
  productId: number | null;
  supplierId: number | null;
  open: (productId: number, supplierId?: number) => void;
  close: () => void;
}

export const useQuickView = create<QuickViewStore>((set) => ({
  productId: null,
  supplierId: null,
  open: (productId, supplierId) => set({ productId, supplierId: supplierId ?? null }),
  close: () => set({ productId: null, supplierId: null }),
}));
