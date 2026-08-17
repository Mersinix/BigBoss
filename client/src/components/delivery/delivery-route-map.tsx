import { useEffect, useRef, useState } from "react";
import { loadGoogleMapsScript } from "@/components/location-picker-modal";
import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeoLocation } from "@shared/schema";

type Stage = "TO_PICKUP" | "TO_DESTINATION";

type Props = {
  stage: Stage;
  pickup: GeoLocation | null | undefined;
  destination: GeoLocation | null | undefined;
  /** Driver's latest known location (users.locationLat/Lng). Null/undefined if never set. */
  driverLocation?: { lat: string; lng: string } | null;
};

function toLatLng(v?: { lat: string; lng: string } | GeoLocation | null): { lat: number; lng: number } | null {
  if (!v?.lat || !v?.lng) return null;
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

/**
 * Two-stage delivery navigation map. Reuses the same raw Google Maps JS loader already used
 * by location-picker-modal.tsx (loadGoogleMapsScript) — no new map technology introduced.
 *
 * Stage 1 (TO_PICKUP): driver → supplier. Stage 2 (TO_DESTINATION): driver → coffee/cafe.
 * Uses a straight-line connector rather than the Directions API — a real turn-by-turn route
 * isn't part of the existing map infrastructure, and this project explicitly avoids adding a
 * routing API just for this. The "Open in Google Maps" button hands off to the driver's own
 * phone map app for actual turn-by-turn navigation, which is the pragmatic v1 answer.
 */
export default function DeliveryRouteMap({ stage, pickup, destination, driverLocation }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [ready, setReady] = useState(false);

  const activeTarget = stage === "TO_PICKUP" ? pickup : destination;
  const current = toLatLng(driverLocation) ?? toLatLng(pickup); // fall back to pickup as a stand-in center when the driver has no known location yet
  const target = toLatLng(activeTarget);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsScript().then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !mapDivRef.current) return;
    const center = current ?? target ?? { lat: 36.8189, lng: 10.1658 };
    const map = new window.google.maps.Map(mapDivRef.current, {
      center,
      zoom: current && target ? 12 : 14,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;

    const bounds = new window.google.maps.LatLngBounds();

    if (current) {
      new window.google.maps.Marker({
        position: current,
        map,
        title: "Votre position",
        icon: {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="10" fill="#3b82f6" stroke="white" stroke-width="3"/></svg>`,
          ),
          scaledSize: new window.google.maps.Size(28, 28),
          anchor: new window.google.maps.Point(14, 14),
        },
      });
      bounds.extend(current);
    }

    if (target) {
      const color = stage === "TO_PICKUP" ? "#f59e0b" : "#22c55e";
      new window.google.maps.Marker({
        position: target,
        map,
        title: stage === "TO_PICKUP" ? "Fournisseur (collecte)" : "Café (livraison)",
        icon: {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48"><path fill="${color}" d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z"/><circle cx="18" cy="18" r="8" fill="white"/></svg>`,
          ),
          scaledSize: new window.google.maps.Size(36, 48),
          anchor: new window.google.maps.Point(18, 48),
        },
      });
      bounds.extend(target);
    }

    if (current && target) {
      new window.google.maps.Polyline({
        path: [current, target],
        map,
        strokeColor: stage === "TO_PICKUP" ? "#f59e0b" : "#22c55e",
        strokeOpacity: 0.7,
        strokeWeight: 3,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "14px" }],
      });
      map.fitBounds(bounds, 48);
    }

    return () => { mapRef.current = null; };
  }, [ready, current?.lat, current?.lng, target?.lat, target?.lng, stage]);

  const gmapsUrl = target
    ? `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}${current ? `&origin=${current.lat},${current.lng}` : ""}`
    : null;

  return (
    <div className="rounded-2xl overflow-hidden border border-border/50">
      <div className={`px-4 py-2.5 flex items-center gap-2 text-sm font-semibold ${stage === "TO_PICKUP" ? "bg-amber-500/10 text-amber-600" : "bg-green-500/10 text-green-600"}`}>
        <Navigation className="w-4 h-4" />
        {stage === "TO_PICKUP" ? "Étape 1 — Direction : Fournisseur (collecte)" : "Étape 2 — Direction : Café (livraison)"}
      </div>
      <div ref={mapDivRef} className="w-full h-56 bg-muted" />
      <div className="px-4 py-3 flex items-center justify-between gap-3 bg-secondary/30">
        <div className="min-w-0 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="truncate">{activeTarget?.address || "Adresse non renseignée"}</span>
        </div>
        {gmapsUrl && (
          <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <ExternalLink className="w-3 h-3" /> Ouvrir dans Maps
            </Button>
          </a>
        )}
      </div>
      {!current && (
        <p className="px-4 pb-3 text-[11px] text-muted-foreground">
          Votre position n'est pas encore renseignée sur votre compte — la carte affiche uniquement la destination.
        </p>
      )}
    </div>
  );
}
