import { create } from "zustand";

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
  setIsDark: (v: boolean) => void;
}

/**
 * Single global theme store for the entire Coffee Owner application.
 * All dark-mode toggles (navbar, panels, modals, pages) share this one state
 * so switching from any surface immediately updates every other surface.
 *
 * Default: dark (matches the previous per-component default of useState(true)).
 * The value lives in memory for the session; it resets to dark on page refresh,
 * matching the previous per-component behaviour.
 */
export const useThemeStore = create<ThemeState>((set) => ({
  isDark: true,
  toggle: () => set((s) => ({ isDark: !s.isDark })),
  setIsDark: (v) => set({ isDark: v }),
}));
