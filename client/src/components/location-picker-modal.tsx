import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Search, Navigation, ChevronLeft, CheckCircle, Loader2, X, Sun, Moon } from "lucide-react";
import type { AddressDetails } from "@shared/schema";

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

declare global {
  interface Window {
    google: typeof google;
    __gmapsLoaded?: boolean;
    __gmapsCallbacks?: (() => void)[];
  }
}

function loadGoogleMapsScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.__gmapsLoaded) { resolve(); return; }
    if (!window.__gmapsCallbacks) window.__gmapsCallbacks = [];
    window.__gmapsCallbacks.push(resolve);
    if (document.getElementById("gmaps-script")) return;
    (window as any).__gmapsInit = () => {
      window.__gmapsLoaded = true;
      (window.__gmapsCallbacks ?? []).forEach((cb) => cb());
      window.__gmapsCallbacks = [];
    };
    const s = document.createElement("script");
    s.id = "gmaps-script";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places&callback=__gmapsInit`;
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  });
}

export type LocationPickerMode = "account" | "search" | "delivery";

export interface PickedLocation {
  address: string;
  lat: string;
  lng: string;
  placeId: string;
  details?: AddressDetails;
  radius?: number | null; // km; null = no filter (only when showRadius=true)
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (loc: PickedLocation) => void;
  title?: string;
  required?: boolean;
  mode?: LocationPickerMode;
  initialAddress?: string;
  initialDetails?: AddressDetails;
  showRadius?: boolean; // adds radius slider in step 2
}

interface Suggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

const DEFAULT_CENTER = { lat: 36.8189, lng: 10.1658 };

const EMPTY_DETAILS: AddressDetails = {
  street: "",
  buildingNumber: "",
  postalCode: "",
  governorate: "",
  municipality: "",
  buildingType: "",
  apartment: "",
  floor: "",
  door: "",
  additionalNotes: "",
};

const RADIUS_OPTIONS = [
  { label: "Pas de limite", value: null },
  { label: "5 km", value: 5 },
  { label: "10 km", value: 10 },
  { label: "25 km", value: 25 },
  { label: "50 km", value: 50 },
  { label: "100 km", value: 100 },
];

export default function LocationPickerModal({
  open,
  onClose,
  onConfirm,
  title = "Où se trouve votre établissement ?",
  required = false,
  mode = "account",
  initialAddress,
  initialDetails,
  showRadius = false,
}: Props) {
  const hasDetailsStep = mode !== "search";
  const totalSteps = hasDetailsStep ? 3 : 2;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mapsReady, setMapsReady] = useState(false);
  const [search, setSearch] = useState(initialAddress ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(DEFAULT_CENTER);
  const [placeId, setPlaceId] = useState("");
  const [details, setDetails] = useState<AddressDetails>({ ...EMPTY_DETAILS, ...initialDetails });
  const [saving, setSaving] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [isDark, setIsDark] = useState(true);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      loadGoogleMapsScript().then(() => {
        setMapsReady(true);
        autocompleteRef.current = new window.google.maps.places.AutocompleteService();
        geocoderRef.current = new window.google.maps.Geocoder();
      });
    }
  }, [open]);

  useEffect(() => {
    if (step === 2 && mapsReady && mapDivRef.current && !mapRef.current) {
      const map = new window.google.maps.Map(mapDivRef.current, {
        center: coords,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      const marker = new window.google.maps.Marker({
        position: coords,
        map,
        draggable: true,
        animation: window.google.maps.Animation.DROP,
        icon: {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48"><path fill="#f59e0b" d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z"/><circle cx="18" cy="18" r="8" fill="white"/></svg>`),
          scaledSize: new window.google.maps.Size(36, 48),
          anchor: new window.google.maps.Point(18, 48),
        },
      });
      marker.addListener("dragend", () => {
        const pos = marker.getPosition();
        if (!pos) return;
        geocoderRef.current?.geocode({ location: { lat: pos.lat(), lng: pos.lng() } }, (results, status) => {
          if (status === "OK" && results?.[0]) {
            setSelectedAddress(results[0].formatted_address);
            setCoords({ lat: pos.lat(), lng: pos.lng() });
            setPlaceId(results[0].place_id ?? "");
          }
        });
      });
      mapRef.current = map;
      markerRef.current = marker;
    }
    if (step !== 2) {
      mapRef.current = null;
      markerRef.current = null;
    }
  }, [step, mapsReady]);

  useEffect(() => {
    if (step === 2 && mapRef.current && markerRef.current) {
      mapRef.current.setCenter(coords);
      markerRef.current.setPosition(coords);
    }
  }, [coords, step]);

  const handleSearch = useCallback((q: string) => {
    setSearch(q);
    clearTimeout(searchTimeout.current);
    if (!q.trim() || !autocompleteRef.current) { setSuggestions([]); return; }
    searchTimeout.current = setTimeout(() => {
      autocompleteRef.current!.getPlacePredictions(
        { input: q, componentRestrictions: { country: "tn" }, types: ["geocode", "establishment"] },
        (preds, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && preds) {
            setSuggestions(preds.map((p) => ({
              placeId: p.place_id,
              description: p.description,
              mainText: p.structured_formatting.main_text,
              secondaryText: p.structured_formatting.secondary_text ?? "",
            })));
          } else {
            setSuggestions([]);
          }
        }
      );
    }, 300);
  }, []);

  const pickSuggestion = useCallback((sug: Suggestion) => {
    setSuggestions([]);
    setSearch(sug.description);
    geocoderRef.current?.geocode({ placeId: sug.placeId }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const loc = results[0].geometry.location;
        setCoords({ lat: loc.lat(), lng: loc.lng() });
        setSelectedAddress(results[0].formatted_address);
        setPlaceId(sug.placeId);
        if (!details.street) setDetails((d) => ({ ...d, street: results[0].formatted_address }));
        setStep(2);
      }
    });
  }, [details.street]);

  const useMyPosition = useCallback(() => {
    if (!navigator.geolocation) return;
    setLoadingGeo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        geocoderRef.current?.geocode({ location: { lat, lng } }, (results, status) => {
          setLoadingGeo(false);
          if (status === "OK" && results?.[0]) {
            setCoords({ lat, lng });
            setSelectedAddress(results[0].formatted_address);
            setSearch(results[0].formatted_address);
            setPlaceId(results[0].place_id ?? "");
            if (!details.street) setDetails((d) => ({ ...d, street: results[0].formatted_address }));
            setStep(2);
          }
        });
      },
      () => setLoadingGeo(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [details.street]);

  const handleConfirm = useCallback(() => {
    setSaving(true);
    const cleaned: AddressDetails = {};
    (Object.keys(details) as (keyof AddressDetails)[]).forEach((k) => {
      const v = details[k]?.trim();
      if (v) cleaned[k] = v;
    });
    onConfirm({
      address: selectedAddress,
      lat: String(coords.lat),
      lng: String(coords.lng),
      placeId,
      details: Object.keys(cleaned).length ? cleaned : undefined,
      ...(showRadius ? { radius: radiusKm } : {}),
    });
  }, [selectedAddress, coords, placeId, details, onConfirm, showRadius, radiusKm]);

  const reset = () => {
    setStep(1);
    setSearch(initialAddress ?? "");
    setSuggestions([]);
    setSelectedAddress("");
    setCoords(DEFAULT_CENTER);
    setPlaceId("");
    setDetails({ ...EMPTY_DETAILS, ...initialDetails });
    setSaving(false);
    setRadiusKm(null);
    mapRef.current = null;
    markerRef.current = null;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const confirmMapStep = () => {
    if (hasDetailsStep) {
      if (!details.street) setDetails((d) => ({ ...d, street: selectedAddress }));
      setStep(3);
    } else {
      handleConfirm();
    }
  };

  const setDetail = (key: keyof AddressDetails, value: string) => {
    setDetails((d) => ({ ...d, [key]: value }));
  };

  // ── Theme tokens ────────────────────────────────────────────────────────────
  const dk = isDark;
  const bg          = dk ? "bg-gray-900"                    : "bg-white";
  const textPrimary = dk ? "text-white"                     : "text-gray-900";
  const textMuted   = dk ? "text-gray-400"                  : "text-gray-500";
  const divider     = dk ? "bg-gray-800"                    : "bg-gray-100";
  const iconBtn     = dk
    ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
    : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800";
  const inputCls    = dk
    ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-xl text-sm focus-visible:border-amber-500 focus-visible:ring-amber-500/20"
    : "border-gray-200 rounded-xl text-sm focus-visible:border-amber-500 focus-visible:ring-amber-500/20";
  const labelCls    = dk ? "text-xs font-medium text-gray-300" : "text-xs font-medium text-gray-700";
  const sugBox      = dk ? "bg-gray-800 border-gray-700/60 shadow-xl" : "border-gray-100 shadow-sm";
  const sugRow      = dk ? "hover:bg-gray-700/60 border-gray-700/40" : "hover:bg-amber-50 border-gray-50";
  const addrCard    = dk ? "bg-gray-800/60 border-gray-700/40" : "bg-gray-50 border-gray-100";
  const geoCard     = dk ? "bg-amber-500/10 border-amber-500/25" : "bg-amber-50 border-amber-100";
  const radioPill   = (active: boolean) => active
    ? "bg-amber-500 text-white border-amber-500"
    : dk ? "bg-gray-800 text-gray-300 border-gray-700 hover:border-amber-500/60" : "bg-white text-gray-700 border-gray-200 hover:border-amber-300";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Sélectionner une adresse</DialogTitle></VisuallyHidden>
        <div className={`flex flex-col max-h-[92vh] overflow-hidden transition-colors duration-200 ${bg}`}>

          {/* ── Fixed header ── */}
          <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
            <div className="flex items-center justify-between mb-4">
              {/* Back or dummy spacer */}
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                  aria-label="Back"
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              ) : (
                <div className="w-8" />
              )}

              {/* Centered title + step */}
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight ${textPrimary}`}>
                  {step === 1 && title}
                  {step === 2 && "Confirmer la position"}
                  {step === 3 && "Détails de l'adresse"}
                </span>
                <span className={`text-[10px] font-medium ${textMuted}`}>
                  Étape {step} sur {totalSteps}
                </span>
              </div>

              {/* Right: sun/moon + close */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsDark((d) => !d)}
                  aria-label="Toggle theme"
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
                >
                  {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Progress dots */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all ${s <= step ? "bg-amber-500 w-8" : (dk ? "bg-gray-700 w-4" : "bg-gray-200 w-4")}`}
                />
              ))}
            </div>

            {/* Divider */}
            <div className={`mt-4 h-px w-full ${divider}`} />
          </div>

          {/* ── Step content (scrollable) ── */}
          <div
            className="flex-1 min-h-0 overflow-y-auto
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-gray-700
              hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
            style={{ WebkitOverflowScrolling: "touch" }}
          >

            {/* ── Step 1: Search ── */}
            {step === 1 && (
              <div className="px-5 py-4 flex flex-col gap-4 pb-6">
                {!mapsReady ? (
                  <div className={`flex items-center justify-center py-10 gap-2 ${textMuted}`}>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Chargement de la carte…</span>
                  </div>
                ) : (
                  <>
                    {/* Search input */}
                    <div className="relative">
                      <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
                      <Input
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Rechercher une adresse…"
                        className={`pl-9 ${inputCls}`}
                        autoFocus
                        data-testid="input-location-search"
                      />
                      {search && (
                        <button type="button" onClick={() => { setSearch(""); setSuggestions([]); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                          <X className={`w-4 h-4 ${textMuted}`} />
                        </button>
                      )}
                    </div>

                    {/* Suggestions */}
                    {suggestions.length > 0 && (
                      <div className={`border rounded-2xl overflow-hidden ${sugBox}`}>
                        {suggestions.map((sug) => (
                          <button
                            key={sug.placeId}
                            type="button"
                            onClick={() => pickSuggestion(sug)}
                            className={`w-full flex items-start gap-3 px-4 py-3 transition-colors border-b last:border-0 text-left ${sugRow}`}
                            data-testid={`button-suggestion-${sug.placeId}`}
                          >
                            <MapPin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold truncate ${textPrimary}`}>{sug.mainText}</p>
                              <p className={`text-xs truncate ${textMuted}`}>{sug.secondaryText}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Current location card */}
                    <div className={`border rounded-2xl p-4 ${geoCard}`}>
                      <p className="text-xs font-semibold text-amber-500 mb-1.5">Recommandé</p>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <Navigation className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <div>
                            <p className={`text-sm font-semibold ${textPrimary}`}>Partagez votre position actuelle</p>
                            <p className={`text-xs ${textMuted}`}>Le moyen le plus rapide de trouver votre secteur</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          type="button"
                          onClick={useMyPosition}
                          disabled={loadingGeo}
                          className="shrink-0 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs px-4"
                          data-testid="button-use-position"
                        >
                          {loadingGeo ? <Loader2 className="w-3 h-3 animate-spin" /> : "Partager"}
                        </Button>
                      </div>
                    </div>

                    {required && (
                      <p className="text-xs text-amber-500 text-center">
                        ⚠️ La localisation est requise pour les fournisseurs
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Step 2: Map confirm ── */}
            {step === 2 && (
              <div className="flex flex-col">
                <div ref={mapDivRef} className={`w-full h-64 ${dk ? "bg-gray-800" : "bg-gray-100"}`} />
                <div className="px-5 py-4 flex flex-col gap-4 pb-6">
                  <div className={`flex items-start gap-3 p-3 border rounded-2xl ${addrCard}`}>
                    <MapPin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs mb-0.5 ${textMuted}`}>Adresse sélectionnée</p>
                      <p className={`text-sm font-semibold leading-snug ${textPrimary}`}>{selectedAddress}</p>
                    </div>
                  </div>
                  <p className={`text-xs text-center ${textMuted}`}>
                    Faites glisser le repère pour ajuster précisément votre position
                  </p>
                  {showRadius && (
                    <div className="space-y-2">
                      <p className={`text-xs font-semibold ${textPrimary}`}>Rayon de recherche</p>
                      <div className="flex flex-wrap gap-2">
                        {RADIUS_OPTIONS.map((opt) => (
                          <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => setRadiusKm(opt.value)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${radioPill(radiusKm === opt.value)}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    type="button"
                    onClick={confirmMapStep}
                    disabled={saving}
                    className="w-full rounded-2xl bg-amber-500 hover:bg-amber-600 text-white py-5"
                    data-testid="button-confirm-map"
                  >
                    {hasDetailsStep ? "Confirmer cette position" : (
                      saving ? (
                        <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</span>
                      ) : (
                        <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Confirmer la zone de recherche</span>
                      )
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 3: Address details ── */}
            {step === 3 && hasDetailsStep && (
              <div className="px-5 py-4 flex flex-col gap-4 pb-6">
                <div className={`flex items-start gap-3 p-3 border rounded-2xl ${dk ? "bg-amber-500/10 border-amber-500/25" : "bg-amber-50 border-amber-100"}`}>
                  <CheckCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className={`text-sm font-medium leading-snug ${dk ? "text-amber-300" : "text-amber-800"}`}>{selectedAddress}</p>
                </div>

                <div className="space-y-1.5">
                  <Label className={labelCls}>Adresse (optionnel)</Label>
                  <Input value={details.street ?? ""} onChange={(e) => setDetail("street", e.target.value)} placeholder="Rue, avenue…" className={inputCls} data-testid="input-street" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className={labelCls}>N° bâtiment (optionnel)</Label>
                    <Input value={details.buildingNumber ?? ""} onChange={(e) => setDetail("buildingNumber", e.target.value)} placeholder="Ex: 12" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Code postal (optionnel)</Label>
                    <Input value={details.postalCode ?? ""} onChange={(e) => setDetail("postalCode", e.target.value)} placeholder="Ex: 1000" className={inputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Gouvernorat (optionnel)</Label>
                    <Input value={details.governorate ?? ""} onChange={(e) => setDetail("governorate", e.target.value)} placeholder="Ex: Tunis" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Municipalité (optionnel)</Label>
                    <Input value={details.municipality ?? ""} onChange={(e) => setDetail("municipality", e.target.value)} placeholder="Ex: La Marsa" className={inputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Type de bâtiment (optionnel)</Label>
                    <Input value={details.buildingType ?? ""} onChange={(e) => setDetail("buildingType", e.target.value)} placeholder="Ex: Immeuble" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Appartement (optionnel)</Label>
                    <Input value={details.apartment ?? ""} onChange={(e) => setDetail("apartment", e.target.value)} placeholder="Ex: 4B" className={inputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Étage (optionnel)</Label>
                    <Input value={details.floor ?? ""} onChange={(e) => setDetail("floor", e.target.value)} placeholder="Ex: 2" className={inputCls} data-testid="input-floor" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={labelCls}>Porte (optionnel)</Label>
                    <Input value={details.door ?? ""} onChange={(e) => setDetail("door", e.target.value)} placeholder="Ex: A" className={inputCls} data-testid="input-door" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className={labelCls}>Notes complémentaires (optionnel)</Label>
                  <Input
                    value={details.additionalNotes ?? ""}
                    onChange={(e) => setDetail("additionalNotes", e.target.value)}
                    placeholder="Ex: Entrée côté parking"
                    className={inputCls}
                    data-testid="input-notes"
                  />
                </div>

                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={saving}
                  className="w-full rounded-2xl bg-amber-500 hover:bg-amber-600 text-white py-5 mt-2"
                  data-testid="button-confirm-location"
                >
                  {saving ? (
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</span>
                  ) : (
                    <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Confirmer l'adresse</span>
                  )}
                </Button>
              </div>
            )}

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
