import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AccountThemeState {
  isDark: boolean;
  toggle: () => void;
  setIsDark: (v: boolean) => void;
}

// Separate theme store for the 7 non-Coffee-Owner service accounts (Barista
// Academy, Barista Marketplace, Delivery Company, Driver, Printer,
// Maintenance, Marketing). Deliberately NOT the same store instance as
// client/src/store/theme-store.ts (Coffee Owner's) — these are a different
// set of accounts with their own admin-configurable theme policy (System
// Management → Mode sombre: BOTH/DARK_ONLY/LIGHT_ONLY per account, see
// use-account-dark-mode.ts). Defaults to dark (isDark: true) per that
// policy's "BOTH" default, and persisted to localStorage so an owner's
// manual light/dark choice survives a real page refresh, not just SPA
// navigation — unlike Coffee Owner's session-only store, this one is asked
// to persist across reloads. Under an admin-forced DARK_ONLY/LIGHT_ONLY
// policy this raw value is overridden by useEffectiveAccountDarkMode and
// never surfaced directly.
export const useAccountThemeStore = create<AccountThemeState>()(
  persist(
    (set) => ({
      isDark: true,
      toggle: () => set((s) => ({ isDark: !s.isDark })),
      setIsDark: (v) => set({ isDark: v }),
    }),
    { name: "bbc-account-theme" },
  ),
);
