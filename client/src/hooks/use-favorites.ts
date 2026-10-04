import { create } from "zustand";
import { apiRequest } from "@/lib/queryClient";
import type { MaintenanceMarketplaceCard, PrintCatalogCard } from "@shared/schema";
import type { BaristaMarketplaceCard } from "@/hooks/use-barista-marketplace";
import type { MarketingMarketplaceCard, MarketingServiceCard } from "@/hooks/use-marketing";
import type { AcademyCourseCard } from "@/hooks/use-barista-academy";

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
  location?: string;
  distanceKm?: number | null;
  rating?: number;
  reviewCount?: number;
  category?: string;
}

// Company-level (printer) favorite — independent of PrintFavItem above
// (docs/coffee_owner_favorites_marketplace_audit.md). Keyed by printerId.
export interface PrintCompanyFavItem {
  id: number;
  name: string;
  initials: string;
  type: string;
  rating: number;
  portfolioImages: string[];
  location?: string;
  available?: boolean;
  profileImageUrl?: string | null;
}

export interface AcademyFavItem {
  id: number;
  title: string;
  provider: string;
  duration: string;
  rating: number;
  price: number;
  level?: string;
  location?: string;
  hasCertification?: boolean;
  // Real formation image (imageUrl) or Academy public photo fallback — without
  // this the Favorites entry had no image to show.
  imageUrl?: string | null;
}

// Company-level (academy organisation) favorite — independent of AcademyFavItem
// above (docs/coffee_owner_favorites_marketplace_audit.md). Keyed by academyUserId.
export interface AcademyOrgFavItem {
  id: number;
  name: string;
  initials: string;
  type: string;
  rating: number;
  portfolioImages: string[];
  location?: string;
  available?: boolean;
  profileImageUrl?: string | null;
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
  location?: string;
  available?: boolean;
  // Real Marketing provider profile picture (users.profileImageUrl) — same fix
  // already applied to Barista/Maintenance Favorites (without it the card always
  // fell back to initials even when a real picture is set).
  profileImageUrl?: string | null;
}

// Service-level (Marketing) favorite — independent of MarketingFavItem (agency)
// above (docs/coffee_owner_favorites_marketplace_audit.md). Keyed by serviceId;
// carries the agency identity alongside since a service always belongs to one.
export interface MarketingServiceFavItem {
  id: number;
  name: string;
  agencyUserId: number;
  agencyName: string;
  rating: number;
  image?: string | null;
  location?: string;
  priceInCents?: number;
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
  // Real Maintenance profile picture (users.profileImageUrl) — without this the
  // Favorites card had no image to show and always fell back to the generic
  // default avatar, even for professionals with a real picture set (same fix
  // already applied to BaristaMktFavItem above).
  profileImageUrl?: string | null;
}

interface FavoritesStore {
  shop: Record<number, ShopFavItem>;
  printProducts: Record<string, PrintFavItem>;
  printCompanies: Record<number, PrintCompanyFavItem>;
  academyCourses: Record<number, AcademyFavItem>;
  academyOrganisations: Record<number, AcademyOrgFavItem>;
  baristaMarket: Record<number, BaristaMktFavItem>;
  marketingAgencies: Record<number, MarketingFavItem>;
  marketingServices: Record<number, MarketingServiceFavItem>;
  maintenance: Record<number, MaintenanceFavItem>;
  pack: Record<number, true>;

  toggleShop: (item: ShopFavItem) => void;
  togglePrintProduct: (item: PrintFavItem) => void;
  togglePrintCompany: (item: PrintCompanyFavItem) => void;
  toggleAcademyCourse: (item: AcademyFavItem) => void;
  toggleAcademyOrganisation: (item: AcademyOrgFavItem) => void;
  toggleBaristaMarket: (item: BaristaMktFavItem) => void;
  toggleMarketingAgency: (item: MarketingFavItem) => void;
  toggleMarketingService: (item: MarketingServiceFavItem) => void;
  toggleMaintenance: (item: MaintenanceFavItem) => void;
  togglePack: (packId: number) => void;

  removeShop: (id: number) => void;
  removePrintProduct: (id: string) => void;
  removePrintCompany: (id: number) => void;
  removeAcademyCourse: (id: number) => void;
  removeAcademyOrganisation: (id: number) => void;
  removeBaristaMarket: (id: number) => void;
  removeMarketingAgency: (id: number) => void;
  removeMarketingService: (id: number) => void;
  removeMaintenance: (id: number) => void;
  removePack: (id: number) => void;

  hydrateShop: (items: ShopFavItem[]) => void;
  hydratePack: (ids: number[]) => void;
  hydratePrintProduct: (ids: number[]) => void;
  syncPrintProduct: (ids: number[], cards: PrintCatalogCard[]) => void;
  hydratePrintCompany: (ids: number[]) => void;
  syncPrintCompany: (ids: number[], cards: PrintCatalogCard[]) => void;
  hydrateMaintenance: (ids: number[]) => void;
  syncMaintenance: (ids: number[], profiles: MaintenanceMarketplaceCard[]) => void;
  hydrateBaristaMarket: (ids: number[]) => void;
  syncBaristaMarket: (ids: number[], profiles: BaristaMarketplaceCard[]) => void;
  hydrateMarketingAgency: (ids: number[]) => void;
  syncMarketingAgency: (ids: number[], profiles: MarketingMarketplaceCard[]) => void;
  hydrateMarketingService: (ids: number[]) => void;
  syncMarketingService: (ids: number[], services: MarketingServiceCard[]) => void;
  hydrateAcademyCourse: (ids: number[]) => void;
  syncAcademyCourse: (ids: number[], courses: AcademyCourseCard[]) => void;
  hydrateAcademyOrganisation: (ids: number[]) => void;
  syncAcademyOrganisation: (ids: number[], courses: AcademyCourseCard[]) => void;
}

export const useFavorites = create<FavoritesStore>((set, get) => ({
  shop: {},
  printProducts: {},
  printCompanies: {},
  academyCourses: {},
  academyOrganisations: {},
  baristaMarket: {},
  marketingAgencies: {},
  marketingServices: {},
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

  togglePrintProduct: (item) =>
    (() => {
      const wasFav = !!get().printProducts[item.id];
      set((s) => {
        const next = { ...s.printProducts };
        if (wasFav) delete next[item.id];
        else next[item.id] = item;
        return { printProducts: next };
      });
      if (wasFav) {
        apiRequest("DELETE", `/api/print-favorites/${item.id}`).catch(() => {});
      } else {
        apiRequest("POST", "/api/print-favorites", { printItemId: Number(item.id) }).catch(() => {});
      }
    })(),

  togglePrintCompany: (item) =>
    (() => {
      const wasFav = !!get().printCompanies[item.id];
      set((s) => {
        const next = { ...s.printCompanies };
        if (wasFav) delete next[item.id];
        else next[item.id] = item;
        return { printCompanies: next };
      });
      if (wasFav) {
        apiRequest("DELETE", `/api/print-favorites/companies/${item.id}`).catch(() => {});
      } else {
        apiRequest("POST", "/api/print-favorites/companies", { printerId: item.id }).catch(() => {});
      }
    })(),

  toggleAcademyCourse: (item) =>
    (() => {
      const wasFav = !!get().academyCourses[item.id];
      set((s) => {
        const next = { ...s.academyCourses };
        if (wasFav) delete next[item.id];
        else next[item.id] = item;
        return { academyCourses: next };
      });
      if (wasFav) {
        apiRequest("DELETE", `/api/academy-favorites/${item.id}`).catch(() => {});
      } else {
        apiRequest("POST", "/api/academy-favorites", { courseId: item.id }).catch(() => {});
      }
    })(),

  toggleAcademyOrganisation: (item) =>
    (() => {
      const wasFav = !!get().academyOrganisations[item.id];
      set((s) => {
        const next = { ...s.academyOrganisations };
        if (wasFav) delete next[item.id];
        else next[item.id] = item;
        return { academyOrganisations: next };
      });
      if (wasFav) {
        apiRequest("DELETE", `/api/academy-favorites/organisations/${item.id}`).catch(() => {});
      } else {
        apiRequest("POST", "/api/academy-favorites/organisations", { academyUserId: item.id }).catch(() => {});
      }
    })(),

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

  toggleMarketingAgency: (item) =>
    (() => {
      const wasFav = !!get().marketingAgencies[item.id];
      set((s) => {
        const next = { ...s.marketingAgencies };
        if (wasFav) delete next[item.id];
        else next[item.id] = item;
        return { marketingAgencies: next };
      });
      if (wasFav) {
        apiRequest("DELETE", `/api/marketing-favorites/${item.id}`).catch(() => {});
      } else {
        apiRequest("POST", "/api/marketing-favorites", { marketingUserId: item.id }).catch(() => {});
      }
    })(),

  toggleMarketingService: (item) =>
    (() => {
      const wasFav = !!get().marketingServices[item.id];
      set((s) => {
        const next = { ...s.marketingServices };
        if (wasFav) delete next[item.id];
        else next[item.id] = item;
        return { marketingServices: next };
      });
      if (wasFav) {
        apiRequest("DELETE", `/api/marketing-favorites/services/${item.id}`).catch(() => {});
      } else {
        apiRequest("POST", "/api/marketing-favorites/services", { marketingUserId: item.agencyUserId, serviceId: item.id }).catch(() => {});
      }
    })(),

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

  removePrintProduct: (id) =>
    (() => {
      set((s) => { const next = { ...s.printProducts }; delete next[id]; return { printProducts: next }; });
      apiRequest("DELETE", `/api/print-favorites/${id}`).catch(() => {});
    })(),

  removePrintCompany: (id) =>
    (() => {
      set((s) => { const next = { ...s.printCompanies }; delete next[id]; return { printCompanies: next }; });
      apiRequest("DELETE", `/api/print-favorites/companies/${id}`).catch(() => {});
    })(),

  hydratePrintProduct: (ids) =>
    set((s) => {
      const next = { ...s.printProducts };
      for (const id of ids) {
        const key = String(id);
        if (!next[key]) {
          next[key] = { id: key, name: "Print", brand: "Imprimerie", price: 0, priceUnit: "unité", image: "" };
        }
      }
      return { printProducts: next };
    }),

  syncPrintProduct: (ids, cards) =>
    set(() => {
      const cardMap = new Map(cards.map((card) => [card.id, card]));
      const next: Record<string, PrintFavItem> = {};
      for (const id of ids) {
        const card = cardMap.get(id);
        if (!card) continue;
        next[String(card.id)] = {
          id: String(card.id),
          name: card.name,
          brand: card.printerName,
          price: card.priceInCents,
          priceUnit: card.unit,
          image: card.imageUrl ?? "",
          location: card.printerLocation,
          distanceKm: card.distanceKm,
          rating: card.rating / 10,
          reviewCount: card.reviewCount,
          category: card.category,
        };
      }
      return { printProducts: next };
    }),

  hydratePrintCompany: (ids) =>
    set((s) => {
      const next = { ...s.printCompanies };
      for (const id of ids) {
        if (!next[id]) {
          next[id] = { id, name: "Imprimerie", initials: "I", type: "Imprimerie", rating: 0, portfolioImages: [] };
        }
      }
      return { printCompanies: next };
    }),

  // Derived from the already-fetched Print catalog cards (one row per unique
  // printerId) — no separate "all printing companies" listing endpoint exists,
  // same reasoning as syncAcademyOrganisation below.
  syncPrintCompany: (ids, cards) =>
    set(() => {
      const byPrinter = new Map<number, PrintCatalogCard>();
      for (const card of cards) if (!byPrinter.has(card.printerId)) byPrinter.set(card.printerId, card);
      const next: Record<number, PrintCompanyFavItem> = {};
      for (const id of ids) {
        const card = byPrinter.get(id);
        if (!card) continue;
        next[id] = {
          id,
          name: card.printerName,
          initials: card.printerName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
          type: "Imprimerie",
          rating: card.rating / 10,
          portfolioImages: [],
          location: card.printerLocation,
          profileImageUrl: card.printerImageUrl,
        };
      }
      return { printCompanies: next };
    }),

  removeAcademyCourse: (id) =>
    (() => {
      set((s) => { const next = { ...s.academyCourses }; delete next[id]; return { academyCourses: next }; });
      apiRequest("DELETE", `/api/academy-favorites/${id}`).catch(() => {});
    })(),

  removeAcademyOrganisation: (id) =>
    (() => {
      set((s) => { const next = { ...s.academyOrganisations }; delete next[id]; return { academyOrganisations: next }; });
      apiRequest("DELETE", `/api/academy-favorites/organisations/${id}`).catch(() => {});
    })(),

  removeBaristaMarket: (id) =>
    (() => {
      set((s) => { const next = { ...s.baristaMarket }; delete next[id]; return { baristaMarket: next }; });
      apiRequest("DELETE", `/api/barista-favorites/${id}`).catch(() => {});
    })(),

  removeMarketingAgency: (id) =>
    (() => {
      set((s) => { const next = { ...s.marketingAgencies }; delete next[id]; return { marketingAgencies: next }; });
      apiRequest("DELETE", `/api/marketing-favorites/${id}`).catch(() => {});
    })(),

  removeMarketingService: (id) =>
    (() => {
      set((s) => { const next = { ...s.marketingServices }; delete next[id]; return { marketingServices: next }; });
      apiRequest("DELETE", `/api/marketing-favorites/services/${id}`).catch(() => {});
    })(),

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
          profileImageUrl: profile.profileImageUrl,
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

  hydrateMarketingAgency: (ids) =>
    set((s) => {
      const next = { ...s.marketingAgencies };
      for (const id of ids) {
        if (!next[id]) {
          next[id] = { id, name: "Marketing", initials: "M", type: "Agency", rating: 0, portfolioImages: [] };
        }
      }
      return { marketingAgencies: next };
    }),

  syncMarketingAgency: (ids, profiles) =>
    set(() => {
      const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
      const next: Record<number, MarketingFavItem> = {};
      for (const id of ids) {
        const profile = profileMap.get(id);
        if (!profile) continue;
        next[id] = {
          id: profile.userId,
          name: profile.name,
          initials: profile.initials,
          type: profile.profileType,
          rating: profile.rating / 10,
          portfolioImages: profile.portfolioImages,
          location: profile.location,
          available: profile.isAvailable,
          profileImageUrl: profile.profileImageUrl,
        };
      }
      return { marketingAgencies: next };
    }),

  hydrateMarketingService: (ids) =>
    set((s) => {
      const next = { ...s.marketingServices };
      for (const id of ids) {
        if (!next[id]) {
          next[id] = { id, name: "Service", agencyUserId: 0, agencyName: "Agency", rating: 0 };
        }
      }
      return { marketingServices: next };
    }),

  syncMarketingService: (ids, services) =>
    set(() => {
      const serviceMap = new Map(services.map((service) => [service.id, service]));
      const next: Record<number, MarketingServiceFavItem> = {};
      for (const id of ids) {
        const service = serviceMap.get(id);
        if (!service) continue;
        next[id] = {
          id: service.id,
          name: service.category,
          agencyUserId: service.marketingUserId,
          agencyName: service.agencyName,
          rating: service.rating / 10,
          image: service.imageUrl ?? service.agencyProfileImageUrl,
          location: service.agencyLocation,
          priceInCents: service.startingPriceInCents,
        };
      }
      return { marketingServices: next };
    }),

  hydrateAcademyCourse: (ids) =>
    set((s) => {
      const next = { ...s.academyCourses };
      for (const id of ids) {
        if (!next[id]) {
          next[id] = { id, title: "Formation", provider: "Academy", duration: "", rating: 0, price: 0 };
        }
      }
      return { academyCourses: next };
    }),

  syncAcademyCourse: (ids, courses) =>
    set(() => {
      const courseMap = new Map(courses.map((course) => [course.id, course]));
      const next: Record<number, AcademyFavItem> = {};
      for (const id of ids) {
        const course = courseMap.get(id);
        if (!course) continue;
        next[id] = {
          id: course.id,
          title: course.title,
          provider: course.academyName,
          duration: course.duration,
          rating: course.rating / 10,
          price: course.priceInCents,
          level: course.level,
          location: course.location || course.academyLocation,
          hasCertification: course.hasCertification,
          imageUrl: course.imageUrl ?? course.academyProfileImageUrl,
        };
      }
      return { academyCourses: next };
    }),

  hydrateAcademyOrganisation: (ids) =>
    set((s) => {
      const next = { ...s.academyOrganisations };
      for (const id of ids) {
        if (!next[id]) {
          next[id] = { id, name: "Académie", initials: "A", type: "Académie", rating: 0, portfolioImages: [] };
        }
      }
      return { academyOrganisations: next };
    }),

  // Derived from the already-fetched Academy course cards (one row per unique
  // academyUserId) — no separate "all academies" listing endpoint exists, the
  // Academy marketplace browses by course, not by organisation.
  syncAcademyOrganisation: (ids, courses) =>
    set(() => {
      const byAcademy = new Map<number, AcademyCourseCard>();
      for (const course of courses) if (!byAcademy.has(course.academyUserId)) byAcademy.set(course.academyUserId, course);
      const next: Record<number, AcademyOrgFavItem> = {};
      for (const id of ids) {
        const course = byAcademy.get(id);
        if (!course) continue;
        next[id] = {
          id,
          name: course.academyName,
          initials: course.academyName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
          type: "Académie",
          rating: course.rating / 10,
          portfolioImages: [],
          location: course.academyLocation,
          profileImageUrl: course.academyProfileImageUrl,
        };
      }
      return { academyOrganisations: next };
    }),
}));

export const selectTotalFavCount = (s: FavoritesStore) =>
  Object.keys(s.shop).length +
  Object.keys(s.printProducts).length +
  Object.keys(s.printCompanies).length +
  Object.keys(s.academyCourses).length +
  Object.keys(s.academyOrganisations).length +
  Object.keys(s.baristaMarket).length +
  Object.keys(s.marketingAgencies).length +
  Object.keys(s.marketingServices).length +
  Object.keys(s.maintenance).length +
  Object.keys(s.pack).length;
