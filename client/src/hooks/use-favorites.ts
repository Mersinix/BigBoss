import { create } from "zustand";
import { apiRequest } from "@/lib/queryClient";

export interface ShopFavItem {
  id: number;
  name: string;
  supplier: string;
  price: number;
  image: string;
}

export interface PrintFavItem {
  id: string;
  name: string;
  brand: string;
  price: number;
  priceUnit: string;
  image: string;
}

export interface AcademyFavItem {
  id: number;
  title: string;
  provider: string;
  duration: string;
  rating: number;
  price: number;
}

export interface BaristaMktFavItem {
  id: number;
  name: string;
  initials: string;
  skills: string[];
  location: string;
  rating: number;
  available: boolean;
}

export interface MarketingFavItem {
  id: number;
  name: string;
  initials: string;
  type: string;
  rating: number;
  portfolioImages: string[];
}

interface FavoritesStore {
  shop: Record<number, ShopFavItem>;
  print: Record<string, PrintFavItem>;
  academy: Record<number, AcademyFavItem>;
  baristaMarket: Record<number, BaristaMktFavItem>;
  marketing: Record<number, MarketingFavItem>;

  toggleShop: (item: ShopFavItem) => void;
  togglePrint: (item: PrintFavItem) => void;
  toggleAcademy: (item: AcademyFavItem) => void;
  toggleBaristaMarket: (item: BaristaMktFavItem) => void;
  toggleMarketing: (item: MarketingFavItem) => void;

  removeShop: (id: number) => void;
  removePrint: (id: string) => void;
  removeAcademy: (id: number) => void;
  removeBaristaMarket: (id: number) => void;
  removeMarketing: (id: number) => void;

  hydrateShop: (items: ShopFavItem[]) => void;
}

export const useFavorites = create<FavoritesStore>((set, get) => ({
  shop: {},
  print: {},
  academy: {},
  baristaMarket: {},
  marketing: {},

  toggleShop: (item) => {
    const wasFav = !!get().shop[item.id];
    set((s) => {
      const next = { ...s.shop };
      if (wasFav) delete next[item.id];
      else next[item.id] = item;
      return { shop: next };
    });
    if (wasFav) {
      apiRequest("DELETE", `/api/favorites/${item.id}`).catch(() => {});
    } else {
      apiRequest("POST", "/api/favorites", { productId: item.id }).catch(() => {});
    }
  },

  togglePrint: (item) =>
    set((s) => {
      const next = { ...s.print };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return { print: next };
    }),

  toggleAcademy: (item) =>
    set((s) => {
      const next = { ...s.academy };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return { academy: next };
    }),

  toggleBaristaMarket: (item) =>
    set((s) => {
      const next = { ...s.baristaMarket };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return { baristaMarket: next };
    }),

  toggleMarketing: (item) =>
    set((s) => {
      const next = { ...s.marketing };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return { marketing: next };
    }),

  removeShop: (id) => {
    set((s) => { const next = { ...s.shop }; delete next[id]; return { shop: next }; });
    apiRequest("DELETE", `/api/favorites/${id}`).catch(() => {});
  },

  hydrateShop: (items) =>
    set(() => {
      const next: Record<number, ShopFavItem> = {};
      for (const item of items) next[item.id] = item;
      return { shop: next };
    }),

  removePrint: (id) =>
    set((s) => { const next = { ...s.print }; delete next[id]; return { print: next }; }),

  removeAcademy: (id) =>
    set((s) => { const next = { ...s.academy }; delete next[id]; return { academy: next }; }),

  removeBaristaMarket: (id) =>
    set((s) => { const next = { ...s.baristaMarket }; delete next[id]; return { baristaMarket: next }; }),

  removeMarketing: (id) =>
    set((s) => { const next = { ...s.marketing }; delete next[id]; return { marketing: next }; }),
}));

export const selectTotalFavCount = (s: FavoritesStore) =>
  Object.keys(s.shop).length +
  Object.keys(s.print).length +
  Object.keys(s.academy).length +
  Object.keys(s.baristaMarket).length +
  Object.keys(s.marketing).length;
