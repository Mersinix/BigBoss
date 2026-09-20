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
  /** Map div height classes — defaults to the original fixed h-56 everywhere. The Driver's
   *  own full-screen "Livraisons" map workspace overrides this to be viewport-relative on
   *  mobile only, so every other caller (Admin/Delivery Company/Supplier delivery detail
   *  views) keeps its exact existing size. */
  mapHeightClassName?: string;
  /** Shown as a "Partager ma position" action next to the existing "position not set"
   *  notice (Stage 1 only) — omitted by every caller that doesn't need the driver to
   *  provide their own live position (the message stays plain text, exactly as before). */
  onShareLocation?: () => void;
};

type LatLng = { lat: number; lng: number };

function toLatLng(v?: { lat: string; lng: string } | GeoLocation | null): LatLng | null {
  if (!v?.lat || !v?.lng) return null;
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

// Haversine, metres — used only to decide whether the driver's live position has moved far
// enough to justify a fresh Directions request (see ROUTE_REFETCH_THRESHOLD_METERS below),
// never as a substitute for the real road route itself.
function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// A driver's live GPS position jitters by a few metres even standing still; re-requesting a
// full road route on every such tick would recompute constantly for no visible benefit and
// risks exhausting the Directions API quota for no reason (see the effect below — task §6:
// "do not constantly recreate the route unnecessarily").
const ROUTE_REFETCH_THRESHOLD_METERS = 75;

/**
 * Two-stage delivery navigation map. Reuses the same raw Google Maps JS loader already used
 * by location-picker-modal.tsx (loadGoogleMapsScript) — no new map technology introduced.
 *
 * Stage 1 (TO_PICKUP): driver's own live position → supplier. Stage 2 (TO_DESTINATION): once
 * collected, the route no longer depends on the driver's live position — it becomes the fixed
 * supplier → coffee/cafe leg.
 *
 * The route line follows the actual road path via google.maps.DirectionsService — part of the
 * SAME Google Maps JS SDK already loaded here (loadGoogleMapsScript), not a second routing
 * system. If the Directions request fails (no route found, quota, offline, API not enabled for
 * this project's key, etc.) this falls back to the original straight-line connector, clearly
 * labelled as such (never silently presented as if it were the real road route — see
 * routeKind), rather than breaking the map. The "Open in Google Maps" button is unchanged — it
 * always hands off to the driver's own phone map app for actual turn-by-turn navigation.
 *
 * The map instance itself is created ONCE (see the `ready` effect) and reused thereafter — a
 * separate effect only updates markers/route when current/target/stage actually change, and a
 * live driver position only triggers a fresh Directions request once it has moved more than
 * ROUTE_REFETCH_THRESHOLD_METERS from whatever was last fetched (the map still re-centers and
 * the marker still moves on every tick — only the road-route recomputation is throttled).
 */
export default function DeliveryRouteMap({ stage, pickup, destination, driverLocation, mapHeightClassName = "h-56", onShareLocation }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const currentMarkerRef = useRef<google.maps.Marker | null>(null);
  const targetMarkerRef = useRef<google.maps.Marker | null>(null);
  const fallbackLineRef = useRef<google.maps.Polyline | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const lastFetchedOriginRef = useRef<LatLng | null>(null);
  const lastFetchedTargetKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  // Tracks whether the currently-drawn line is a real road route (DirectionsService succeeded)
  // or the straight-line fallback — surfaced to the driver (§11: never silently present a
  // straight line as if it were an actual road route) and logged to the console with the
  // exact Google Maps status, so a failure (e.g. the Directions API not being enabled for the
  // configured key/project — this app has no paid routing provider credentials, see
  // storage.getRoute's own doc) is diagnosable instead of silently invisible.
  const [routeKind, setRouteKind] = useState<"road" | "fallback" | null>(null);

  const activeTarget = stage === "TO_PICKUP" ? pickup : destination;
  // Stage 1 (TO_PICKUP): route starts at the driver's own live position (falling back to the
  // supplier as a stand-in center when it isn't known yet). Stage 2 (TO_DESTINATION): the
  // collection already happened, so the route is the fixed Supplier → Coffee Owner leg — the
  // driver's ever-changing live position must never replace the supplier's address here.
  const current = stage === "TO_PICKUP" ? (toLatLng(driverLocation) ?? toLatLng(pickup)) : toLatLng(pickup);
  const target = toLatLng(activeTarget);
  const showMissingDriverPosition = stage === "TO_PICKUP" && !toLatLng(driverLocation);

  // 1) Load the script once, then create the Map instance exactly once — never recreated on
  // subsequent renders/location ticks (only destroyed on unmount).
  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsScript().then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !mapDivRef.current || mapRef.current) return;
    mapRef.current = new window.google.maps.Map(mapDivRef.current, {
      center: current ?? target ?? { lat: 36.8189, lng: 10.1658 },
      zoom: current && target ? 12 : 14,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    return () => {
      directionsRendererRef.current?.setMap(null);
      fallbackLineRef.current?.setMap(null);
      currentMarkerRef.current?.setMap(null);
      targetMarkerRef.current?.setMap(null);
      mapRef.current = null;
    };
    // Intentionally only depends on `ready` — see the doc above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 2) Markers + route — reruns whenever current/target/stage actually change, but reuses the
  // existing map instance (never tears it down/recreates it) and only re-requests a fresh road
  // route when the origin has moved meaningfully or the target/stage changed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    currentMarkerRef.current?.setMap(null);
    targetMarkerRef.current?.setMap(null);
    currentMarkerRef.current = null;
    targetMarkerRef.current = null;

    const bounds = new window.google.maps.LatLngBounds();

    if (current) {
      currentMarkerRef.current = new window.google.maps.Marker({
        position: current,
        map,
        title: stage === "TO_PICKUP" ? "Votre position" : "Fournisseur (collecte)",
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
      targetMarkerRef.current = new window.google.maps.Marker({
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

    if (!current || !target) {
      directionsRendererRef.current?.setMap(null);
      directionsRendererRef.current = null;
      fallbackLineRef.current?.setMap(null);
      fallbackLineRef.current = null;
      setRouteKind(null);
      if (current) map.setCenter(current);
      return;
    }

    map.fitBounds(bounds, 48);

    const targetKey = `${target.lat},${target.lng}`;
    const originMoved = !lastFetchedOriginRef.current || distanceMeters(lastFetchedOriginRef.current, current) >= ROUTE_REFETCH_THRESHOLD_METERS;
    const targetOrStageChanged = lastFetchedTargetKeyRef.current !== `${stage}:${targetKey}`;

    if (!originMoved && !targetOrStageChanged && (directionsRendererRef.current || fallbackLineRef.current)) {
      // Route already reflects this origin/destination closely enough — just let the marker
      // move (already done above); no need to re-fit/redraw the line itself.
      return;
    }

    // Straight-line fallback — drawn first so the map is never left routeless if the
    // Directions request below fails or is still in flight.
    fallbackLineRef.current?.setMap(null);
    fallbackLineRef.current = new window.google.maps.Polyline({
      path: [current, target],
      map,
      strokeColor: stage === "TO_PICKUP" ? "#f59e0b" : "#22c55e",
      strokeOpacity: 0.7,
      strokeWeight: 3,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "14px" }],
    });
    directionsRendererRef.current?.setMap(null);
    directionsRendererRef.current = null;
    setRouteKind("fallback");

    lastFetchedOriginRef.current = current;
    lastFetchedTargetKeyRef.current = `${stage}:${targetKey}`;

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      { origin: current, destination: target, travelMode: window.google.maps.TravelMode.DRIVING, region: "TN" },
      (result, status) => {
        if (status !== "OK" || !result) {
          // Diagnosable failure — e.g. REQUEST_DENIED means the Directions API itself isn't
          // enabled for the configured Google Maps key/project (this app has no dedicated
          // routing-provider credentials — see storage.getRoute's own doc), ZERO_RESULTS means
          // no drivable route was found between these two points, etc. The straight line stays
          // as a clearly-labelled fallback (see routeKind below), never presented as if it were
          // the real road route.
          console.warn(`[DeliveryRouteMap] Directions request failed (status=${status}) — showing straight-line fallback instead of the real road route.`);
          return;
        }
        if (mapRef.current !== map) return; // map was torn down while this request was in flight
        fallbackLineRef.current?.setMap(null); // real road route found — replace the fallback, never both at once
        fallbackLineRef.current = null;
        directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
          map,
          directions: result,
          suppressMarkers: true, // this component draws its own custom pickup/destination markers above
          polylineOptions: {
            strokeColor: stage === "TO_PICKUP" ? "#f59e0b" : "#22c55e",
            strokeOpacity: 0.85,
            strokeWeight: 4,
          },
        });
        setRouteKind("road");
      },
    );
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
      <div ref={mapDivRef} className={`w-full bg-muted ${mapHeightClassName}`} />
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
      {routeKind === "fallback" && (
        <div className="px-4 pb-3">
          <p className="text-[11px] text-muted-foreground">
            Itinéraire routier indisponible pour le moment — ligne directe affichée à titre indicatif.
          </p>
        </div>
      )}
      {showMissingDriverPosition && (
        <div className="px-4 pb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Votre position n'est pas encore renseignée sur votre compte — la carte affiche uniquement la destination.
          </p>
          {onShareLocation && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0" onClick={onShareLocation} data-testid="button-share-driver-location">
              <Navigation className="w-3 h-3" /> Partager ma position
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
