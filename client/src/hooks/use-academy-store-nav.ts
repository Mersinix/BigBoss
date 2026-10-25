import { create } from "zustand";

interface AcademyStoreNavStore {
  // Ordered list of academy (academyUserId) IDs the Previous/Next Store
  // buttons navigate through — /academy's own currently-filtered Académies
  // section list. Same minimal shape as use-store-nav.ts (the Shop's own
  // equivalent), kept as a separate store since academy IDs are a distinct
  // id space from the Shop's supplier store IDs, Marketing's agencyId, and
  // Print's printerId — none of these should ever share navigation state.
  // Null means no navigation context (the Store Page was opened directly,
  // not from /academy), so the buttons simply don't render.
  navIds: number[] | null;
  setNavIds: (navIds: number[] | null) => void;
}

export const useAcademyStoreNav = create<AcademyStoreNavStore>((set) => ({
  navIds: null,
  setNavIds: (navIds) => set({ navIds }),
}));
