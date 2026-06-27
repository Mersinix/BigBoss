import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GeoLocation } from "@shared/schema";

/** Session-only search location — never synced to user profile. */
interface SearchLocationState {
  searchLocation: GeoLocation | null;
  setSearchLocation: (loc: GeoLocation) => void;
  clearSearchLocation: () => void;
}

export const useSearchLocationStore = create<SearchLocationState>()(
  persist(
    (set) => ({
      searchLocation: null,
      setSearchLocation: (loc) => set({ searchLocation: loc }),
      clearSearchLocation: () => set({ searchLocation: null }),
    }),
    {
      name: "bigboss_search_location",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

export function formatLocationLabel(address: string): string {
  const parts = address.split(",");
  return parts[0]?.trim() ?? address;
}

export function userToAccountAddress(user: {
  locationAddress?: string | null;
  locationLat?: string | null;
  locationLng?: string | null;
  locationPlaceId?: string | null;
  locationDetails?: GeoLocation["details"] | null;
} | null | undefined): GeoLocation | null {
  if (!user?.locationAddress || !user.locationLat || !user.locationLng) return null;
  return {
    address: user.locationAddress,
    lat: user.locationLat,
    lng: user.locationLng,
    placeId: user.locationPlaceId ?? "",
    details: (user.locationDetails as GeoLocation["details"]) ?? undefined,
  };
}

export function pickedToGeoLocation(loc: {
  address: string;
  lat: string;
  lng: string;
  placeId: string;
  details?: GeoLocation["details"];
}): GeoLocation {
  return {
    address: loc.address,
    lat: loc.lat,
    lng: loc.lng,
    placeId: loc.placeId,
    details: loc.details,
  };
}
