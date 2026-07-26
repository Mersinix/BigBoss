import { create } from 'zustand';

// ── Store to trigger opening the Account panel from anywhere (e.g. cart page)
// MarketplaceLayout watches `shouldOpen` and opens the profile dialog when true.
// AccountPanel watches `orderIdToOpen` to auto-open the Order Details modal.

interface AccountOpenState {
  shouldOpen: boolean;
  orderIdToOpen: number | null;
  openWithOrder: (orderId: number) => void;
  clearOpen: () => void;
}

export const useAccountOpenStore = create<AccountOpenState>()((set) => ({
  shouldOpen: false,
  orderIdToOpen: null,
  openWithOrder: (orderId: number) => set({ shouldOpen: true, orderIdToOpen: orderId }),
  clearOpen: () => set({ shouldOpen: false, orderIdToOpen: null }),
}));
