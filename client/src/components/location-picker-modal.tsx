import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Search, Navigation, ChevronLeft, CheckCircle, Loader2, X } from "lucide-react";
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 rounded-3xl overflow-hidden shadow-2xl" hideClose>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <div className="flex-1">
              <DialogTitle className="text-lg font-bold text-gray-900">
                {step === 1 && title}
                {step === 2 && "Confirmer la position"}
                {step === 3 && "Détails de l'adresse"}
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Étape {step} sur {totalSteps}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${s <= step ? "bg-amber-500 w-8" : "bg-gray-200 w-4"}`}
              />
            ))}
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="px-6 py-5 flex flex-col gap-4">
            {!mapsReady ? (
              <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Chargement de la carte…</span>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Rechercher une adresse…"
                    className="pl-9 rounded-xl border-gray-200 focus-visible:border-amber-500 focus-visible:ring-amber-500/20"
                    autoFocus
                    data-testid="input-location-search"
                  />
                  {search && (
                    <button type="button" onClick={() => { setSearch(""); setSuggestions([]); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                </div>

                {suggestions.length > 0 && (
                  <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                    {suggestions.map((sug) => (
                      <button
                        key={sug.placeId}
                        type="button"
                        onClick={() => pickSuggestion(sug)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-amber-50 transition-colors border-b border-gray-50 last:border-0 text-left"
                        data-testid={`button-suggestion-${sug.placeId}`}
                      >
                        <MapPin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{sug.mainText}</p>
                          <p className="text-xs text-gray-500 truncate">{sug.secondaryText}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="border border-amber-100 bg-amber-50 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Recommandé</p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <Navigation className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Partagez votre position actuelle</p>
                        <p className="text-xs text-gray-500">Le moyen le plus rapide de trouver votre secteur</p>
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
                  <p className="text-xs text-amber-600 text-center">
                    ⚠️ La localisation est requise pour les fournisseurs
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col">
            <div ref={mapDivRef} className="w-full h-64 bg-gray-100" />
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-2xl">
                <MapPin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 mb-0.5">Adresse sélectionnée</p>
                  <p className="text-sm font-semibold text-gray-800 leading-snug">{selectedAddress}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center">
                Faites glisser le repère pour ajuster précisément votre position
              </p>
              {showRadius && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-700">Rayon de recherche</p>
                  <div className="flex flex-wrap gap-2">
                    {RADIUS_OPTIONS.map((opt) => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setRadiusKm(opt.value)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                          radiusKm === opt.value
                            ? "bg-amber-500 text-white border-amber-500"
                            : "bg-white text-gray-700 border-gray-200 hover:border-amber-300"
                        }`}
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
                className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white py-5"
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

        {step === 3 && hasDetailsStep && (
          <div className="px-6 py-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-2xl">
              <CheckCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm font-medium text-amber-800 leading-snug">{selectedAddress}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-700">Adresse (optionnel)</Label>
              <Input value={details.street ?? ""} onChange={(e) => setDetail("street", e.target.value)} placeholder="Rue, avenue…" className="rounded-xl border-gray-200 text-sm" data-testid="input-street" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">N° bâtiment (optionnel)</Label>
                <Input value={details.buildingNumber ?? ""} onChange={(e) => setDetail("buildingNumber", e.target.value)} placeholder="Ex: 12" className="rounded-xl border-gray-200 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Code postal (optionnel)</Label>
                <Input value={details.postalCode ?? ""} onChange={(e) => setDetail("postalCode", e.target.value)} placeholder="Ex: 1000" className="rounded-xl border-gray-200 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Gouvernorat (optionnel)</Label>
                <Input value={details.governorate ?? ""} onChange={(e) => setDetail("governorate", e.target.value)} placeholder="Ex: Tunis" className="rounded-xl border-gray-200 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Municipalité (optionnel)</Label>
                <Input value={details.municipality ?? ""} onChange={(e) => setDetail("municipality", e.target.value)} placeholder="Ex: La Marsa" className="rounded-xl border-gray-200 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Type de bâtiment (optionnel)</Label>
                <Input value={details.buildingType ?? ""} onChange={(e) => setDetail("buildingType", e.target.value)} placeholder="Ex: Immeuble" className="rounded-xl border-gray-200 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Appartement (optionnel)</Label>
                <Input value={details.apartment ?? ""} onChange={(e) => setDetail("apartment", e.target.value)} placeholder="Ex: 4B" className="rounded-xl border-gray-200 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Étage (optionnel)</Label>
                <Input value={details.floor ?? ""} onChange={(e) => setDetail("floor", e.target.value)} placeholder="Ex: 2" className="rounded-xl border-gray-200 text-sm" data-testid="input-floor" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-700">Porte (optionnel)</Label>
                <Input value={details.door ?? ""} onChange={(e) => setDetail("door", e.target.value)} placeholder="Ex: A" className="rounded-xl border-gray-200 text-sm" data-testid="input-door" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-700">Notes complémentaires (optionnel)</Label>
              <Input
                value={details.additionalNotes ?? ""}
                onChange={(e) => setDetail("additionalNotes", e.target.value)}
                placeholder="Ex: Entrée côté parking"
                className="rounded-xl border-gray-200 text-sm"
                data-testid="input-notes"
              />
            </div>

            <Button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white py-5 mt-2"
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
      </DialogContent>
    </Dialog>
  );
}
