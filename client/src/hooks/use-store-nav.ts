import { create } from "zustand";

interface StoreNavStore {
  // Ordered list of store IDs the Previous/Next Store buttons navigate
  // through — the Shop page's own currently-filtered Stores section list.
  // Null means no navigation context (the Store Page was opened directly,
  // not from the Shop), so the buttons simply don't render there. Unlike
  // useQuickView/usePackQuickView, there is no navigateTo/open/close here:
  // the Store Page is a real route (/stores/:storeId), so navigating
  // between stores is a real wouter navigate() call, not an in-place id
  // swap on a global singleton modal.
  navIds: number[] | null;
  setNavIds: (navIds: number[] | null) => void;
}

export const useStoreNav = create<StoreNavStore>((set) => ({
  navIds: null,
  setNavIds: (navIds) => set({ navIds }),
}));
