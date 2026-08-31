import { create } from "zustand";
import { apiRequest } from "@/lib/queryClient";
import type { MaintenanceMarketplaceCard } from "@shared/schema";
import type { BaristaMarketplaceCard } from "@/hooks/use-barista-marketplace";

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
  // Real Barista profile picture (users.profileImageUrl) — without this the
  // Favorites card had no image to show and always fell back to the generic
  // default avatar, even for Baristas with a real picture set.
  profileImageUrl?: string | null;
}

export interface MarketingFavItem {
  id: number;
  name: string;
  initials: string;
  type: string;
  rating: number;
  portfolioImages: string[];
}

export interface MaintenanceFavItem {
  id: number;
  name: string;
  initials: string;
  specialty: string;
  categories: string[];
  skills: string[];
  location: string;
  rating: number;
  available: boolean;
}

interface FavoritesStore {
  shop: Record<number, ShopFavItem>;
  print: Record<string, PrintFavItem>;
  academy: Record<number, AcademyFavItem>;
  baristaMarket: Record<number, BaristaMktFavItem>;
  marketing: Record<number, MarketingFavItem>;
  maintenance: Record<number, MaintenanceFavItem>;
  pack: Record<number, true>;

  toggleShop: (item: ShopFavItem) => void;
  togglePrint: (item: PrintFavItem) => void;
  toggleAcademy: (item: AcademyFavItem) => void;
  toggleBaristaMarket: (item: BaristaMktFavItem) => void;
  toggleMarketing: (item: MarketingFavItem) => void;
  toggleMaintenance: (item: MaintenanceFavItem) => void;
  togglePack: (packId: number) => void;

  removeShop: (id: number) => void;
  removePrint: (id: string) => void;
  removeAcademy: (id: number) => void;
  removeBaristaMarket: (id: number) => void;
  removeMarketing: (id: number) => void;
  removeMaintenance: (id: number) => void;
  removePack: (id: number) => void;

  hydrateShop: (items: ShopFavItem[]) => void;
  hydratePack: (ids: number[]) => void;
  hydrateMaintenance: (ids: number[]) => void;
  syncMaintenance: (ids: number[], profiles: MaintenanceMarketplaceCard[]) => void;
  hydrateBaristaMarket: (ids: number[]) => void;
  syncBaristaMarket: (ids: number[], profiles: BaristaMarketplaceCard[]) => void;
}

export const useFavorites = create<FavoritesStore>((set, get) => ({
  shop: {},
  print: {},
  academy: {},
  baristaMarket: {},
  marketing: {},
  maintenance: {},
  pack: {},

  togglePack: (packId) => {
    const wasFav = !!get().pack[packId];
    set((s) => {
      const next = { ...s.pack };
      if (wasFav) delete next[packId];
      else next[packId] = true;
      return { pack: next };
    });
    if (wasFav) {
      apiRequest("DELETE", `/api/pack-favorites/${packId}`).catch(() => {});
    } else {
      apiRequest("POST", "/api/pack-favorites", { packId }).catch(() => {});
    }
  },

  removePack: (id) => {
    set((s) => { const next = { ...s.pack }; delete next[id]; return { pack: next }; });
    apiRequest("DELETE", `/api/pack-favorites/${id}`).catch(() => {});
  },

  hydratePack: (ids) =>
    set(() => {
      const next: Record<number, true> = {};
      for (const id of ids) next[id] = true;
      return { pack: next };
    }),

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
    (() => {
      const wasFav = !!get().baristaMarket[item.id];
      set((s) => {
        const next = { ...s.baristaMarket };
        if (wasFav) delete next[item.id];
        else next[item.id] = item;
        return { baristaMarket: next };
      });
      if (wasFav) {
        apiRequest("DELETE", `/api/barista-favorites/${item.id}`).catch(() => {});
      } else {
        apiRequest("POST", "/api/barista-favorites", { baristaUserId: item.id }).catch(() => {});
      }
    })(),

  toggleMarketing: (item) =>
    set((s) => {
      const next = { ...s.marketing };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return { marketing: next };
    }),

  toggleMaintenance: (item) =>
    (() => {
      const wasFav = !!get().maintenance[item.id];
      set((s) => {
        const next = { ...s.maintenance };
        if (wasFav) delete next[item.id];
        else next[item.id] = item;
        return { maintenance: next };
      });
      if (wasFav) {
        apiRequest("DELETE", `/api/maintenance-favorites/${item.id}`).catch(() => {});
      } else {
        apiRequest("POST", "/api/maintenance-favorites", { maintenanceUserId: item.id }).catch(() => {});
      }
    })(),

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
    (() => {
      set((s) => { const next = { ...s.baristaMarket }; delete next[id]; return { baristaMarket: next }; });
      apiRequest("DELETE", `/api/barista-favorites/${id}`).catch(() => {});
    })(),

  removeMarketing: (id) =>
    set((s) => { const next = { ...s.marketing }; delete next[id]; return { marketing: next }; }),

  removeMaintenance: (id) =>
    (() => {
      set((s) => { const next = { ...s.maintenance }; delete next[id]; return { maintenance: next }; });
      apiRequest("DELETE", `/api/maintenance-favorites/${id}`).catch(() => {});
    })(),

  hydrateMaintenance: (ids) =>
    set((s) => {
      const next = { ...s.maintenance };
      for (const id of ids) {
        if (!next[id]) {
          next[id] = {
            id,
            name: "Maintenance",
            initials: "M",
            specialty: "Maintenance",
            categories: [],
             skills: [],
            location: "",
            rating: 0,
            available: true,
          };
        }
      }
      return { maintenance: next };
    }),

  syncMaintenance: (ids, profiles) =>
    set(() => {
      const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
      const next: Record<number, MaintenanceFavItem> = {};
      for (const id of ids) {
        const profile = profileMap.get(id);
        if (!profile) continue;
        next[id] = {
          id: profile.userId,
          name: profile.name,
          initials: profile.initials,
          specialty: profile.specialty,
          categories: profile.categories,
           skills: profile.skills,
          location: profile.location,
          rating: profile.rating / 10,
          available: profile.available,
        };
      }
      return { maintenance: next };
    }),

  hydrateBaristaMarket: (ids) =>
    set((s) => {
      const next = { ...s.baristaMarket };
      for (const id of ids) {
        if (!next[id]) {
          next[id] = {
            id,
            name: "Barista",
            initials: "B",
            skills: [],
            location: "",
            rating: 0,
            available: true,
          };
        }
      }
      return { baristaMarket: next };
    }),

  syncBaristaMarket: (ids, profiles) =>
    set(() => {
      const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
      const next: Record<number, BaristaMktFavItem> = {};
      for (const id of ids) {
        const profile = profileMap.get(id);
        if (!profile) continue;
        next[id] = {
          id: profile.userId,
          name: profile.name,
          initials: profile.initials,
          skills: profile.skills,
          location: profile.location,
          rating: profile.rating / 10,
          available: profile.available,
          profileImageUrl: profile.profileImageUrl,
        };
      }
      return { baristaMarket: next };
    }),
}));

export const selectTotalFavCount = (s: FavoritesStore) =>
  Object.keys(s.shop).length +
  Object.keys(s.print).length +
  Object.keys(s.academy).length +
  Object.keys(s.baristaMarket).length +
  Object.keys(s.marketing).length +
  Object.keys(s.maintenance).length +
  Object.keys(s.pack).length;
