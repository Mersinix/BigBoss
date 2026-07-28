import { create } from 'zustand';

// ── Store to trigger opening the Account panel or Chat from anywhere ──────────
// MarketplaceLayout watches `shouldOpen`/`shouldOpenChat` and opens the
// corresponding dialog when true.  AccountPanel watches `orderIdToOpen`
// and `initialTab` to auto-navigate to the right tab / order.

interface AccountOpenState {
  shouldOpen: boolean;
  orderIdToOpen: number | null;
  initialTab: "orders" | "dashboard" | "settings" | null;
  shouldOpenChat: boolean;
  openWithOrder: (orderId: number) => void;
  openWithTab: (tab: "orders" | "dashboard" | "settings") => void;
  openChat: () => void;
  clearOpen: () => void;
}

export const useAccountOpenStore = create<AccountOpenState>()((set) => ({
  shouldOpen: false,
  orderIdToOpen: null,
  initialTab: null,
  shouldOpenChat: false,
  openWithOrder: (orderId: number) => set({ shouldOpen: true, orderIdToOpen: orderId, initialTab: null }),
  openWithTab: (tab: "orders" | "dashboard" | "settings") => set({ shouldOpen: true, initialTab: tab, orderIdToOpen: null }),
  openChat: () => set({ shouldOpenChat: true }),
  clearOpen: () => set({ shouldOpen: false, orderIdToOpen: null, initialTab: null, shouldOpenChat: false }),
}));
