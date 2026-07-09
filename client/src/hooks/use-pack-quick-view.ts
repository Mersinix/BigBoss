import { create } from "zustand";

interface PackQuickViewStore {
  packId: number | null;
  open: (packId: number) => void;
  close: () => void;
}

export const usePackQuickView = create<PackQuickViewStore>((set) => ({
  packId: null,
  open: (packId) => set({ packId }),
  close: () => set({ packId: null }),
}));
