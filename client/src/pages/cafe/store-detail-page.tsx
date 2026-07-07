import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Package, Store, Heart, SlidersHorizontal, RotateCcw, Lock,
  ChevronLeft, MapPin, Plus, Info, Star, Music, Zap, Clock,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useFavorites } from "@/hooks/use-favorites";
import { useStoreFavorites } from "@/hooks/use-store-favorites";
import { calculateDistance, formatDistance } from "@/lib/distance";
import { useSearchLocationStore } from "@/store/search-location-store";
import { useQuickView } from "@/hooks/use-quick-view";
import { FlashMode } from "@/components/flash-mode";
import type { StoreDetail, ProductWithTaxonomy, OpeningHoursMap } from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function useCommercialAccess() {
  const { user } = useAuth();
  if (!user) return false;
  if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(user.role)) return true;
  return user.role === 'CAFE_OWNER' && (user as any).status === 'approved';
}

const DAYS: { key: keyof OpeningHoursMap; label: string }[] = [
  { key: "monday",    label: "Monday" },
  { key: "tuesday",   label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday",  label: "Thursday" },
  { key: "friday",    label: "Friday" },
  { key: "saturday",  label: "Saturday" },
  { key: "sunday",    label: "Sunday" },
];

// ── Slideshow cover ───────────────────────────────────────────────────────────

function CoverSlideshow({ urls, name }: { urls: string[]; name: string }) {
  const [idx, setIdx] = useState(0);
  const active = urls.filter(Boolean);
  useEffect(() => {
    if (active.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % active.length), 3500);
    return () => clearInterval(t);
  }, [active.length]);
  if (!active.length) return <div className="w-full h-full flex items-center justify-center"><Store className="w-14 h-14 text-gray-200" /></div>;
  return (
    <>
      <img key={active[idx]} src={active[idx]} alt={name} className="w-full h-full object-cover object-center transition-opacity duration-500" />
      {active.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
          {active.map((_, i) => (
            <button key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/50"}`} onClick={() => setIdx(i)} />
          ))}
        </div>
      )}
    </>
  );
}

// ── YouTube music player ──────────────────────────────────────────────────────

function MusicPlayer({ musicUrl }: { musicUrl: string }) {
  const embedUrl = useMemo(() => {
    if (!musicUrl) return null;
    // Convert watch URL → embed URL with autoplay
    try {
      const url = new URL(musicUrl);
      let videoId = url.searchParams.get("v");
      if (!videoId && url.hostname === "youtu.be") {
        videoId = url.pathname.replace("/", "");
      }
      if (!videoId) return null;
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&controls=0&fs=0&modestbranding=1&mute=0`;
    } catch { return null; }
  }, [musicUrl]);
  if (!embedUrl) return null;
  return (
    <iframe
      src={embedUrl}
      className="absolute w-0 h-0 opacity-0 pointer-events-none"
      allow="autoplay"
      title="background-music"
    />
  );
}

// ── Opening hours modal ───────────────────────────────────────────────────────

function InfoModal({ open, onClose, openingHours, storeName }: {
  open: boolean;
  onClose: () => void;
  openingHours: OpeningHoursMap | null;
  storeName: string;
}) {
  const todayKey = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1].key;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            {storeName} — Opening Hours
          </DialogTitle>
        </DialogHeader>
        {openingHours ? (
          <div className="space-y-2 mt-1">
            {DAYS.map(({ key, label }) => {
              const day = openingHours[key];
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${isToday ? "bg-primary/10 font-semibold" : "bg-muted/40"}`}
                >
                  <span className={`text-sm ${isToday ? "text-primary" : "text-foreground"}`}>
                    {label}{isToday && <span className="ml-1.5 text-[10px] font-normal bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">Today</span>}
                  </span>
                  {day?.closed ? (
                    <span className="text-sm text-red-500">Closed</span>
                  ) : day ? (
                    <span className="text-sm">{day.open} – {day.close}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">Opening hours not configured by this store.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Product card (store context) ──────────────────────────────────────────────

function StoreProductCard({ product, hasCommercialAccess }: {
  product: ProductWithTaxonomy & { bestPrice?: number };
  hasCommercialAccess: boolean;
}) {
  const faved = useFavorites((s) => !!s.shop[product.id]);
  const toggleShop = useFavorites((s) => s.toggleShop);
  const openQuickView = useQuickView((s) => s.open);

  return (
    <div
      data-testid={`card-product-${product.id}`}
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
    >
      <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-200" /></div>
        )}
        {product.categoryLabel?.name && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-white/90 text-gray-700 backdrop-blur-sm text-[10px] font-semibold shadow-sm border-0 px-2">{product.categoryLabel.name}</Badge>
          </div>
        )}
        {hasCommercialAccess && (
          <button
            className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              toggleShop({
                id: product.id,
                name: product.name,
                supplier: product.categoryLabel?.name ?? "",
                price: (product as any).bestPrice ?? 0,
                image: product.imageUrl ?? "",
              });
            }}
            data-testid={`button-fav-${product.id}`}
          >
            <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
          </button>
        )}
        <button
          className="absolute bottom-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            openQuickView(product.id);
          }}
          data-testid={`button-quick-view-${product.id}`}
        >
          <Plus className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <h3 className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors">{product.name}</h3>
        {product.description && <p className="text-xs text-gray-400 line-clamp-1">{product.description}</p>}
        <div className="mt-auto pt-2 border-t border-gray-50">
          {hasCommercialAccess ? (
            <p className="font-bold text-sm text-blue-600">{(product as any).bestPrice != null ? formatCurrency((product as any).bestPrice) : "—"}</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[11px] text-blue-700 font-medium">
                <Lock className="w-3 h-3 shrink-0" />
                <span>Price for approved owners</span>
              </div>
              <Link href="/login" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="h-6 text-[11px] w-full border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-400 px-2" data-testid={`button-login-price-${product.id}`}>
                  Connexion to view prices
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filter state ──────────────────────────────────────────────────────────────

interface FilterState { subCategoryId: string; brandId: string; }

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StoreDetailPage() {
  const [, params] = useRoute("/stores/:storeId");
  const [, navigate] = useLocation();
  const hasCommercialAccess = useCommercialAccess();
  const searchLocation = useSearchLocationStore((s) => s.searchLocation);
  const searchLat = searchLocation?.lat ? parseFloat(searchLocation.lat) : null;
  const searchLng = searchLocation?.lng ? parseFloat(searchLocation.lng) : null;
  const hasSearchLocation = searchLat !== null && searchLng !== null && !Number.isNaN(searchLat) && !Number.isNaN(searchLng);

  const storeId = params?.storeId;
  const faved = useStoreFavorites((s) => (storeId ? !!s.stores[Number(storeId)] : false));
  const toggleStore = useStoreFavorites((s) => s.toggleStore);

  const [categoryId, setCategoryId] = useState("");
  const [filters, setFilters] = useState<FilterState>({ subCategoryId: "", brandId: "" });
  const [infoOpen, setInfoOpen] = useState(false);
  const [flashOpen, setFlashOpen] = useState(false);

  const { data: store, isLoading } = useQuery<StoreDetail>({
    queryKey: ["/api/stores", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/stores/${storeId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!storeId,
  });

  const distance = useMemo(() => {
    if (!store || !hasSearchLocation || !store.supplierLat || !store.supplierLng) return null;
    const lat = parseFloat(store.supplierLat);
    const lng = parseFloat(store.supplierLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return calculateDistance(searchLat!, searchLng!, lat, lng);
  }, [store, searchLat, searchLng, hasSearchLocation]);

  const products = store?.products ?? [];

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.categoryLabel?.id && p.categoryLabel?.name) map.set(String(p.categoryLabel.id), p.categoryLabel.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const categoryFiltered = useMemo(() => {
    if (!categoryId) return products;
    return products.filter((p) => String(p.categoryId) === categoryId);
  }, [products, categoryId]);

  const subCategories = useMemo(() => {
    const map = new Map<string, string>();
    categoryFiltered.forEach((p) => {
      if (p.subCategoryLabel?.id && p.subCategoryLabel?.name) map.set(String(p.subCategoryLabel.id), p.subCategoryLabel.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [categoryFiltered]);

  const brands = useMemo(() => {
    const map = new Map<string, string>();
    categoryFiltered.forEach((p) => {
      if (p.brandLabel?.id && p.brandLabel?.name) map.set(String(p.brandLabel.id), p.brandLabel.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [categoryFiltered]);

  const filtered = useMemo(() => {
    let list = categoryFiltered;
    if (filters.subCategoryId) list = list.filter((p) => String(p.subCategoryId) === filters.subCategoryId);
    if (filters.brandId) list = list.filter((p) => p.brandLabel && String(p.brandLabel.id) === filters.brandId);
    return list;
  }, [categoryFiltered, filters]);

  const updateFilter = (key: keyof FilterState, val: string) => setFilters((p) => ({ ...p, [key]: val }));
  const resetFilters = () => { setFilters({ subCategoryId: "", brandId: "" }); setCategoryId(""); };
  const hasActive = !!categoryId || Object.values(filters).some(Boolean);

  // Derived media fields (with backward-compat for old coverUrl)
  const storeAny = store as any;
  const mediaType: 'IMAGE' | 'VIDEO' = storeAny?.mediaType ?? 'IMAGE';
  const coverUrls: string[] = Array.isArray(storeAny?.coverUrls) && storeAny.coverUrls.length > 0
    ? storeAny.coverUrls
    : store?.coverUrl ? [store.coverUrl] : [];
  const videoUrl: string | null = storeAny?.videoUrl ?? null;
  const musicUrl: string | null = storeAny?.musicUrl ?? null;
  const openingHours: OpeningHoursMap | null = storeAny?.openingHours ?? null;
  const avgRating: number = storeAny?.avgRating ?? 0;
  const reviewCount: number = storeAny?.reviewCount ?? 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Skeleton className="h-56 w-full" />
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-24 gap-4 text-center">
        <Store className="w-14 h-14 text-gray-200" />
        <div><p className="font-semibold text-gray-700">Store not found</p><p className="text-sm text-gray-400 mt-1">This store may no longer be available.</p></div>
        <Button size="sm" variant="outline" onClick={() => navigate("/products")}>Back to Marketplace</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen h-96 bg-gray-50">
      {/* Background music — hidden YouTube iframe, autoplays */}
      {musicUrl && <MusicPlayer musicUrl={musicUrl} />}

      {/* Cover media */}
      <div className="relative h-96 lg:h-[330px] sm:h-56 bg-gray-100 overflow-hidden">
        {mediaType === "VIDEO" && videoUrl ? (
          <video src={videoUrl} className="w-full h-full object-cover object-center" autoPlay muted loop playsInline />
        ) : (
          <CoverSlideshow urls={coverUrls} name={store.name} />
        )}

        {/* Back button — top left */}
        <button
          className="absolute top-4 left-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform z-10"
          onClick={() => navigate("/products")}
          data-testid="button-back-marketplace"
        >
          <ChevronLeft className="w-4.5 h-4.5 text-gray-700" />
        </button>

        {/* Favorite button — top right */}
        <button
          className="absolute top-4 right-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform z-10"
          onClick={() => toggleStore(store.id)}
          data-testid="button-fav-store"
        >
          <Heart className={`w-4 h-4 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>

        {/* Flash button — bottom left */}
        {products.length > 0 && (
          <button
            className="absolute bottom-4 left-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform z-10"
            onClick={() => setFlashOpen(true)}
            data-testid="button-flash-mode"
            title="Flash Mode — browse products"
          >
            <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
          </button>
        )}

        {/* Reviews + Info — bottom right */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
          {reviewCount > 0 && (
            <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="text-xs font-bold text-gray-800">{avgRating.toFixed(1)}</span>
              <span className="text-[10px] text-gray-500">({reviewCount})</span>
            </div>
          )}
          <button
            className="w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setInfoOpen(true)}
            data-testid="button-store-info"
            title="Store information & opening hours"
          >
            <Info className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {!store.isOpen && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <Badge className="bg-gray-900/80 text-white border-0 text-xs font-semibold shadow-sm">Closed</Badge>
          </div>
        )}
      </div>

      {/* Store header info */}
      <div className="max-w-7xl mx-auto px-4 pt-3 relative z-20">
        <div className="flex items-end gap-4 -mt-8">
          <div className="w-16 h-16 rounded-2xl border-4 border-gray-50 bg-white shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
            {store.logoUrl ? (
              <img src={store.logoUrl} alt={store.name} className="w-full h-full object-cover" />
            ) : (
              <Store className="w-7 h-7 text-gray-300" />
            )}
          </div>
          <div className="relative top-2 min-w-0">
            <h1 className="font-bold text-xl text-gray-900 truncate" data-testid="text-store-name">{store.name}</h1>
            <div className="flex items-center gap-3 text-xs text-amber-600 mt-1">
              <span className="flex items-center gap-1"><Package className="w-3 h-3" />{store.productCount} products</span>
              {distance != null && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{formatDistance(distance)}</span>}
              {musicUrl && <span className="flex items-center gap-1 text-indigo-500"><Music className="w-3 h-3" />Music</span>}
            </div>
          </div>
        </div>
        {store.description && <p className="text-sm text-gray-500 mt-3 mx-auto text-center line-clamp-2">{store.description}</p>}
      </div>

      {/* Filters */}
      {(categories.length > 0 || subCategories.length > 0 || brands.length > 0) && (
        <div className="sticky top-14 z-30 bg-white border-b border-gray-100 mt-4">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            {categories.length > 0 && (
              <Select value={categoryId || "__all__"} onValueChange={(v) => { setCategoryId(v === "__all__" ? "" : v); setFilters({ subCategoryId: "", brandId: "" }); }}>
                <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent><SelectItem value="__all__">All Categories</SelectItem>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {subCategories.length > 0 && (
              <Select value={filters.subCategoryId || "__all__"} onValueChange={(v) => updateFilter("subCategoryId", v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]"><SelectValue placeholder="Sub-Category" /></SelectTrigger>
                <SelectContent><SelectItem value="__all__">All Sub-Categories</SelectItem>{subCategories.map((sc) => <SelectItem key={sc.id} value={sc.id}>{sc.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {brands.length > 0 && (
              <Select value={filters.brandId || "__all__"} onValueChange={(v) => updateFilter("brandId", v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[100px]"><SelectValue placeholder="Brand" /></SelectTrigger>
                <SelectContent><SelectItem value="__all__">All Brands</SelectItem>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {hasActive && <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors ml-1"><RotateCcw className="w-3 h-3" /> Reset</button>}
          </div>
        </div>
      )}

      {/* Products grid */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-400 mb-4">{filtered.length} product{filtered.length !== 1 ? "s" : ""} available</p>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Package className="w-14 h-14 text-gray-200" />
            <div><p className="font-semibold text-gray-700">No products found</p><p className="text-sm text-gray-400 mt-1">{hasActive ? "Try adjusting your filters." : "This store hasn't listed any products yet."}</p></div>
            {hasActive && <Button size="sm" variant="outline" onClick={resetFilters}>Clear all filters</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((product) => (
              <StoreProductCard
                key={product.id}
                product={product}
                hasCommercialAccess={hasCommercialAccess}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info modal */}
      <InfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        openingHours={openingHours}
        storeName={store.name}
      />

      {/* Flash mode */}
      <FlashMode
        open={flashOpen}
        onClose={() => setFlashOpen(false)}
        products={products as any[]}
        storeName={store.name}
      />
    </div>
  );
}
