import { create } from "zustand";

interface MarketingStoreNavStore {
  // Ordered list of agency (marketingUserId) IDs the Previous/Next Store
  // buttons navigate through — /marketing's own currently-filtered Agences
  // section list. Same minimal shape as use-store-nav.ts (the Shop's own
  // equivalent), kept as a separate store since agency IDs are a distinct
  // id space from the Shop's supplier store IDs, Academy's academyUserId,
  // and Print's printerId — none of these should ever share navigation
  // state. Null means no navigation context (the Store Page was opened
  // directly, not from /marketing), so the buttons simply don't render.
  navIds: number[] | null;
  setNavIds: (navIds: number[] | null) => void;
}

export const useMarketingStoreNav = create<MarketingStoreNavStore>((set) => ({
  navIds: null,
  setNavIds: (navIds) => set({ navIds }),
}));
