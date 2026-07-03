import { create } from "zustand";
import { apiRequest } from "@/lib/queryClient";

export interface StoreFavItem {
  id: number;
}

interface StoreFavoritesStore {
  stores: Record<number, StoreFavItem>;
  toggleStore: (storeId: number) => void;
  hydrateStores: (ids: number[]) => void;
}

export const useStoreFavorites = create<StoreFavoritesStore>((set, get) => ({
  stores: {},

  toggleStore: (storeId) => {
    const wasFav = !!get().stores[storeId];
    set((s) => {
      const next = { ...s.stores };
      if (wasFav) delete next[storeId];
      else next[storeId] = { id: storeId };
      return { stores: next };
    });
    if (wasFav) {
      apiRequest("DELETE", `/api/store-favorites/${storeId}`).catch(() => {});
    } else {
      apiRequest("POST", "/api/store-favorites", { storeId }).catch(() => {});
    }
  },

  hydrateStores: (ids) =>
    set(() => {
      const next: Record<number, StoreFavItem> = {};
      for (const id of ids) next[id] = { id };
      return { stores: next };
    }),
}));

export const selectStoreFavCount = (s: StoreFavoritesStore) => Object.keys(s.stores).length;
