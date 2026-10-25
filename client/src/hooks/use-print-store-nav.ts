import { create } from "zustand";

interface PrintStoreNavStore {
  // Ordered list of printer (printerId) IDs the Previous/Next Store
  // buttons navigate through — /print's own currently-filtered Imprimeries
  // section list. Same minimal shape as use-store-nav.ts (the Shop's own
  // equivalent), kept as a separate store since printer IDs are a distinct
  // id space from the Shop's supplier store IDs, Marketing's agencyId, and
  // Academy's academyUserId — none of these should ever share navigation
  // state. Null means no navigation context (the Store Page was opened
  // directly, not from /print), so the buttons simply don't render.
  navIds: number[] | null;
  setNavIds: (navIds: number[] | null) => void;
}

export const usePrintStoreNav = create<PrintStoreNavStore>((set) => ({
  navIds: null,
  setNavIds: (navIds) => set({ navIds }),
}));
