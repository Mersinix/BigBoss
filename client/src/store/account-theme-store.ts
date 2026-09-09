import { create } from "zustand";

interface AccountThemeState {
  isDark: boolean;
  toggle: () => void;
  setIsDark: (v: boolean) => void;
}

// Separate, session-only theme store for the 7 non-Coffee-Owner service
// accounts (Barista Academy, Barista Marketplace, Delivery Company, Driver,
// Printer, Maintenance, Marketing). Deliberately NOT the same store instance
// as client/src/store/theme-store.ts (Coffee Owner's, which defaults to
// dark) — these accounts' existing design is light-only today, so this
// store defaults to light, preserving their current appearance for anyone
// who never touches the new dark-mode toggle. Same shape/behavior as the
// Coffee Owner store otherwise, so components can reuse the exact same
// ternary styling pattern already established there.
export const useAccountThemeStore = create<AccountThemeState>((set) => ({
  isDark: false,
  toggle: () => set((s) => ({ isDark: !s.isDark })),
  setIsDark: (v) => set({ isDark: v }),
}));
