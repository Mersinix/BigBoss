import { useAuth } from "@/hooks/use-auth";
import { useSearchLocationStore, userToAccountAddress } from "@/store/search-location-store";

export interface EffectiveLocation {
  lat: number;
  lng: number;
}

/**
 * The Shop's single reference point for distance mapping (Stores/Packs/Products):
 * an explicitly-selected search location takes priority; otherwise falls back to
 * the account's own saved profile address, so distances are available without the
 * Coffee Owner ever having to share GPS. Returns null when neither resolves to
 * valid coordinates — callers must treat that as "distance unavailable", never
 * substitute a default/fabricated location.
 */
export function useEffectiveLocation(): EffectiveLocation | null {
  const searchLocation = useSearchLocationStore((s) => s.searchLocation);
  const { user } = useAuth();
  const loc = searchLocation ?? userToAccountAddress(user as any);
  if (!loc) return null;
  const lat = parseFloat(loc.lat);
  const lng = parseFloat(loc.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}
