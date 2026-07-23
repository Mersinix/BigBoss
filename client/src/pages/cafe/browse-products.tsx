import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Package, Store, Heart, SlidersHorizontal, RotateCcw, Lock, Navigation,
  Plus, ShoppingBag, Layers, Star, MapPin, Zap, Sun, Moon,
} from "lucide-react";
import type { ListingPromotion } from "@shared/schema";
import { formatCurrency } from "@/lib/format";
import { useFavorites } from "@/hooks/use-favorites";
import { useStoreFavorites } from "@/hooks/use-store-favorites";
import { calculateDistance, formatDistance } from "@/lib/distance";
import { useSearchLocationStore } from "@/store/search-location-store";
import { useQuickView } from "@/hooks/use-quick-view";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import type { MarketplaceProduct, CategoryWithCount, StoreCard, PackDetail } from "@shared/schema";
import { FlashMode } from "@/components/flash-mode";

// ── Access helper ─────────────────────────────────────────────────────────────

function useCommercialAccess() {
  const { user } = useAuth();
  if (!user) return false;
  if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(user.role)) return true;
  return user.role === 'CAFE_OWNER' && (user as any).status === 'approved';
}

// ── Theme tokens helper ───────────────────────────────────────────────────────

function useTheme(isDark: boolean) {
  const dk = isDark;
  return {
    dk,
    pageBg:           dk ? "bg-gray-900"                          : "bg-gray-50",
    cardBg:           dk ? "bg-gray-800 border-gray-700/60"       : "bg-white border-gray-100",
    textPrimary:      dk ? "text-white"                           : "text-gray-900",
    textMuted:        dk ? "text-gray-400"                        : "text-gray-500",
    textPrice:        dk ? "text-blue-400"                        : "text-blue-600",
    switcherBg:       dk ? "bg-gray-800"                          : "bg-gray-100",
    switcherActive:   dk ? "bg-gray-700 text-white shadow-sm"     : "bg-white text-blue-600 shadow-sm",
    switcherInactive: dk ? "text-gray-400 hover:text-gray-200"    : "text-gray-500 hover:text-gray-700",
    stripBg:          dk ? "bg-gray-900/95 border-gray-800"       : "bg-white border-gray-100",
    filterBg:         dk ? "bg-gray-900/95 border-gray-800"       : "bg-white border-gray-100",
    selectTrigger:    dk ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700" : "border-gray-200 bg-gray-50",
    divider:          dk ? "border-gray-800"                      : "border-gray-100",
    sectionBtn:       dk ? "text-blue-400 hover:text-blue-300 hover:bg-gray-800" : "text-blue-600 hover:text-blue-700 hover:bg-blue-50",
    sectionBtnPack:   dk ? "text-amber-400 hover:text-amber-300 hover:bg-gray-800" : "text-amber-600 hover:text-amber-700 hover:bg-amber-50",
    skeletonBg:       dk ? "bg-gray-800" : "bg-gray-100",
    imgBg:            dk ? "bg-gray-700" : "bg-gray-50",
    storeLogo:        dk ? "bg-gray-700 border-gray-800" : "bg-white border-white",
    toggleBtn:        dk ? "bg-gray-800 hover:bg-gray-700 text-amber-400" : "bg-white/90 hover:bg-white text-gray-600 shadow-sm",
    packBadge:        dk ? "bg-amber-500/90 text-white" : "bg-amber-500 text-white",
    imageOverlay:     dk ? "bg-gray-800" : "bg-gray-50",
    priceBorder:      dk ? "border-gray-700" : "border-gray-100",
    emptyIcon:        dk ? "text-gray-700" : "text-gray-200",
    emptyText:        dk ? "text-gray-400" : "text-gray-700",
    emptySubText:     dk ? "text-gray-600" : "text-gray-400",
  };
}

// ── Category Strip ────────────────────────────────────────────────────────────

function CategoryStrip({
  categories, selected, onSelect, visibleCategoryIds, isDark,
}: {
  categories: CategoryWithCount[];
  selected: string;
  onSelect: (id: string) => void;
  visibleCategoryIds: Set<number>;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const active = categories.filter((c) => visibleCategoryIds.has(c.id));
  if (!active.length) return null;
  return (
    <div className={`border-b ${t.stripBg}`}>
      <div className="max-w-7xl mx-auto px-4">
        <div
          className="flex gap-1.5 overflow-x-auto py-3"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {/* Pill wrapper — Favorites-style */}
          <div className={`flex gap-1 rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
            <button
              onClick={() => onSelect("")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 transition-all text-[11px] font-semibold ${selected === "" ? t.switcherActive : t.switcherInactive}`}
              data-testid="button-cat-all"
            >
              <span className="text-base leading-none">🛍️</span>
              <span>All</span>
            </button>
          </div>
          {active.map((cat) => (
            <div key={cat.id} className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
              <button
                onClick={() => onSelect(selected === String(cat.id) ? "" : String(cat.id))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${selected === String(cat.id) ? t.switcherActive : t.switcherInactive}`}
                data-testid={`button-cat-${cat.id}`}
              >
                <span className="text-base leading-none">{cat.icon || "📦"}</span>
                <span className="max-w-[72px] truncate">{cat.name}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Supplier Logo Strip ───────────────────────────────────────────────────────

const MAX_LOGOS = 5;

function SupplierLogoStrip({
  listings, count, isDark,
}: {
  listings: { supplierId: number; storeLogoUrl: string | null }[];
  count: number;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const withLogos = listings.filter((l) => l.storeLogoUrl);
  const shown = withLogos.slice(0, MAX_LOGOS);
  const overflow = count - MAX_LOGOS;
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {shown.length > 0 ? (
          shown.map((l, i) => (
            <div
              key={l.supplierId}
              className={`w-4 h-4 rounded-full overflow-hidden border flex items-center justify-center shrink-0 ${t.storeLogo}`}
              style={{ marginLeft: i > 0 ? -4 : 0 }}
            >
              <img src={l.storeLogoUrl!} alt="" className="w-full h-full object-cover" />
            </div>
          ))
        ) : (
          <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${t.imgBg}`}>
            <Store className={`w-2.5 h-2.5 ${t.textMuted}`} />
          </div>
        )}
      </div>
      <span className={`text-[11px] ${t.textMuted}`}>
        {overflow > 0 ? `+${overflow}` : ""}
      </span>
    </div>
  );
}

// ── Listing promotions hook ───────────────────────────────────────────────────

function useListingPromotions(listingIds: number[]) {
  const { data } = useQuery<ListingPromotion[]>({
    queryKey: ["/api/marketplace/promotions", listingIds.sort().join(",")],
    queryFn: async () => {
      if (!listingIds.length) return [];
      const res = await fetch(`/api/marketplace/promotions?listingIds=${listingIds.join(",")}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: listingIds.length > 0,
    staleTime: 60_000,
  });
  return data ?? [];
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({
  product, hasCommercialAccess, promotions, isDark,
}: {
  product: MarketplaceProduct;
  hasCommercialAccess: boolean;
  promotions: ListingPromotion[];
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const faved = useFavorites((s) => !!s.shop[product.id]);
  const toggleShop = useFavorites((s) => s.toggleShop);
  const openQuickView = useQuickView((s) => s.open);
  const searchLocation = useSearchLocationStore((s) => s.searchLocation);

  const listingIds = product.listings.map(l => l.id);

  const promoForProduct = useMemo(() => {
    const matches = promotions.filter(p => listingIds.includes(p.listingId));
    if (!matches.length) return null;
    const pct = matches.filter(p => ['PERCENTAGE', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER'].includes(p.type));
    if (pct.length) return pct.reduce((best, p) => p.discountValue > best.discountValue ? p : best, pct[0]);
    return matches[0];
  }, [promotions, listingIds.join(',')]);

  const promoDiscountedPrice = useMemo(() => {
    if (!promoForProduct || product.bestPrice == null) return null;
    if (['PERCENTAGE', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER'].includes(promoForProduct.type)) {
      return Math.max(0, Math.round(product.bestPrice * (1 - promoForProduct.discountValue / 10000)));
    }
    return null;
  }, [promoForProduct, product.bestPrice]);

  const distanceKm = useMemo(() => {
    if (!searchLocation) return null;
    const sLat = parseFloat(searchLocation.lat);
    const sLng = parseFloat(searchLocation.lng);
    if (Number.isNaN(sLat) || Number.isNaN(sLng)) return null;
    let nearest: number | null = null;
    for (const l of product.listings) {
      if (!l.supplierLat || !l.supplierLng) continue;
      const lat = parseFloat(l.supplierLat);
      const lng = parseFloat(l.supplierLng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
      const d = calculateDistance(sLat, sLng, lat, lng);
      if (nearest === null || d < nearest) nearest = d;
    }
    return nearest;
  }, [searchLocation, product.listings]);

  const hasReviews = product.reviewCount > 0;

  return (
    <div
      data-testid={`card-product-${product.id}`}
      className={`group border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-xl hover:-translate-y-0.5 ${t.cardBg}`}
      onClick={() => openQuickView(product.id)}
    >
      {/* Image */}
      <div className={`relative aspect-[4/3] overflow-hidden shrink-0 ${t.imageOverlay}`}>
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className={`w-10 h-10 ${t.emptyIcon}`} />
          </div>
        )}
        {/* Category badge */}
        {product.category && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-black/50 text-white backdrop-blur-sm text-[10px] font-semibold shadow-sm border-0 px-2">
              {product.category}
            </Badge>
          </div>
        )}
        {/* Review overlay */}
        {hasCommercialAccess && hasReviews && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="text-[10px] font-medium text-white">{product.avgRating.toFixed(1)}</span>
            <span className="text-[10px] text-white/70">({product.reviewCount})</span>
          </div>
        )}
        {/* Favorite button */}
        {hasCommercialAccess && (
          <button
            className="absolute top-2 right-2 w-7 h-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              toggleShop({
                id: product.id,
                name: product.name,
                supplier: product.category ?? "",
                price: product.bestPrice ?? 0,
                image: product.imageUrl ?? "",
              });
            }}
            data-testid={`button-fav-${product.id}`}
          >
            <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white/80"}`} />
          </button>
        )}
        {/* Quick view button */}
        <button
          className="absolute bottom-2 right-2 w-7 h-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          onClick={(e) => { e.stopPropagation(); openQuickView(product.id); }}
          data-testid={`button-quick-view-${product.id}`}
        >
          <Plus className="w-3.5 h-3.5 text-white/80" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight truncate transition-colors group-hover:${t.dk ? "text-blue-400" : "text-blue-600"} ${t.textPrimary}`}>
          {product.name}
        </h3>
        <div className="flex items-center gap-1.5">
          <SupplierLogoStrip listings={product.listings} count={product.supplierCount} isDark={isDark} />
          {distanceKm !== null && (
            <span className={`text-[11px] flex items-center gap-0.5 ml-auto ${t.textMuted}`}>
              <MapPin className="w-2.5 h-2.5 shrink-0" />{formatDistance(distanceKm)}
            </span>
          )}
        </div>

        <div className={`mt-auto pt-1.5 border-t ${t.priceBorder}`}>
          {hasCommercialAccess ? (
            <div>
              {promoForProduct && (
                <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5">
                  <Zap className="w-2.5 h-2.5" />{promoForProduct.label}
                </span>
              )}
              <p className={`text-[10px] ${t.textMuted}`}>From</p>
              {promoDiscountedPrice != null ? (
                <div className="flex items-baseline gap-1.5">
                  <p className={`font-bold text-sm ${t.textPrice}`}>{formatCurrency(promoDiscountedPrice)}</p>
                  <p className={`text-[10px] line-through ${t.textMuted}`}>{formatCurrency(product.bestPrice)}</p>
                </div>
              ) : (
                <p className={`font-bold text-sm ${t.textPrice}`}>
                  {product.bestPrice != null ? formatCurrency(product.bestPrice) : "—"}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className={`flex items-center gap-1 text-[11px] font-medium ${t.dk ? "text-amber-400" : "text-blue-700"}`}>
                <Lock className="w-3 h-3 shrink-0" />
                <span>Price for approved owners</span>
              </div>
              <Link href="/login" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-6 text-[11px] w-full px-2 ${t.dk ? "border-gray-700 text-gray-300 hover:bg-gray-700" : "border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-400"}`}
                  data-testid={`button-login-price-${product.id}`}
                >
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

// ── Store Card ────────────────────────────────────────────────────────────────

function StoreCardTile({
  store, onClick, searchLat, searchLng, hasSearchLocation, isDark,
}: {
  store: StoreCard;
  onClick: () => void;
  searchLat: number | null;
  searchLng: number | null;
  hasSearchLocation: boolean;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const faved = useStoreFavorites((s) => !!s.stores[store.id]);
  const toggleStore = useStoreFavorites((s) => s.toggleStore);

  const distance = useMemo(() => {
    if (!hasSearchLocation || !store.supplierLat || !store.supplierLng) return null;
    const lat = parseFloat(store.supplierLat);
    const lng = parseFloat(store.supplierLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return calculateDistance(searchLat!, searchLng!, lat, lng);
  }, [store.supplierLat, store.supplierLng, searchLat, searchLng, hasSearchLocation]);

  return (
    <div
      data-testid={`card-store-${store.id}`}
      className={`group cursor-pointer border rounded-2xl overflow-hidden flex flex-col transition-all hover:shadow-xl hover:-translate-y-0.5 ${t.cardBg}`}
      onClick={onClick}
    >
      {/* Cover image */}
      <div className={`relative aspect-[16/9] overflow-hidden ${t.imageOverlay}`}>
        {store.coverUrl ? (
          <img
            src={store.coverUrl}
            alt={store.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Store className={`w-10 h-10 ${t.emptyIcon}`} />
          </div>
        )}
        {!store.isOpen && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-black/70 text-white border-0 text-[10px] font-semibold shadow-sm">Closed</Badge>
          </div>
        )}
        <button
          className="absolute top-2 right-2 w-7 h-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          onClick={(e) => { e.stopPropagation(); toggleStore(store.id); }}
          data-testid={`button-fav-store-${store.id}`}
        >
          <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white/80"}`} />
        </button>
      </div>

      {/* Body */}
      <div className="p-3 flex gap-3 relative z-20">
        {/* Logo — overlapping cover */}
        <div className={`w-11 h-11 rounded-xl border-2 -mt-8 overflow-hidden shrink-0 flex items-center justify-center ${t.dk ? "bg-gray-700 border-gray-800" : "bg-white border-white shadow-sm"}`}>
          {store.logoUrl ? (
            <img src={store.logoUrl} alt={store.name} className="w-full h-full object-cover" />
          ) : (
            <Store className={`w-4 h-4 ${t.textMuted}`} />
          )}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h3 className={`font-bold text-sm leading-tight truncate ${t.textPrimary}`}>
            {store.name}
          </h3>
          {store.description && (
            <p className={`text-xs line-clamp-1 mt-0.5 ${t.textMuted}`}>{store.description}</p>
          )}
          <div className={`flex items-center gap-3 text-[11px] mt-1.5 ${t.dk ? "text-amber-400" : "text-amber-600"}`}>
            <span className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              {store.productCount} product{store.productCount !== 1 ? "s" : ""}
            </span>
            {distance != null && <span>{formatDistance(distance)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StoresSection({
  stores, categoryId, filters, onSelect, searchLat, searchLng, hasSearchLocation, isDark,
}: {
  stores: StoreCard[];
  categoryId: string;
  filters: FilterState;
  onSelect: (storeId: number) => void;
  searchLat: number | null;
  searchLng: number | null;
  hasSearchLocation: boolean;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const [expanded, setExpanded] = useState(false);
  const INITIAL_LIMIT = 5;

  const filteredStores = useMemo(() => {
    let list = stores.filter((s) => s.productCount > 0);
    if (categoryId) list = list.filter((s) => s.categoryIds.includes(Number(categoryId)));
    if (filters.subCategoryId) list = list.filter((s) => s.subCategoryIds.includes(Number(filters.subCategoryId)));
    if (filters.brandId) list = list.filter((s) => s.brandIds.includes(Number(filters.brandId)));
    return list;
  }, [stores, categoryId, filters.subCategoryId, filters.brandId]);

  if (!filteredStores.length) return null;

  const showToggle = filteredStores.length > INITIAL_LIMIT;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className={`font-bold text-lg ${t.textPrimary}`}>Marques populaires</h2>
          <p className={`text-xs mt-0.5 ${t.textMuted}`}>
            {filteredStores.length} store{filteredStores.length !== 1 ? "s" : ""}
          </p>
        </div>
        {showToggle && (
          <Button
            variant="ghost"
            size="sm"
            className={`text-xs font-semibold h-8 px-3 ${t.sectionBtn}`}
            onClick={() => setExpanded((e) => !e)}
            data-testid="button-toggle-stores"
          >
            {expanded ? "Show Less" : `See More (${filteredStores.length - INITIAL_LIMIT}+)`}
          </Button>
        )}
      </div>

      {expanded ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredStores.map((store) => (
            <StoreCardTile
              key={store.id}
              store={store}
              onClick={() => onSelect(store.id)}
              searchLat={searchLat}
              searchLng={searchLng}
              hasSearchLocation={hasSearchLocation}
              isDark={isDark}
            />
          ))}
        </div>
      ) : (
        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          {filteredStores.map((store) => (
            <div key={store.id} className="shrink-0 w-52 sm:w-60">
              <StoreCardTile
                store={store}
                onClick={() => onSelect(store.id)}
                searchLat={searchLat}
                searchLng={searchLng}
                hasSearchLocation={hasSearchLocation}
                isDark={isDark}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pack Card ─────────────────────────────────────────────────────────────────

function StarRating({ rating, count, isDark }: { rating: number; count: number; isDark: boolean }) {
  const t = useTheme(isDark);
  if (!count) return null;
  return (
    <div className="flex items-center gap-1">
      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
      <span className={`text-[11px] font-medium ${t.textPrimary}`}>{rating.toFixed(1)}</span>
      <span className={`text-[10px] ${t.textMuted}`}>({count})</span>
    </div>
  );
}

function PackCardTile({
  pack, hasCommercialAccess, isDark,
}: {
  pack: PackDetail;
  hasCommercialAccess: boolean;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const faved = useFavorites((s) => !!s.pack[pack.id]);
  const togglePack = useFavorites((s) => s.togglePack);
  const openPackQuickView = usePackQuickView((s) => s.open);
  const searchLocation = useSearchLocationStore((s) => s.searchLocation);
  const maxQty = Math.min(pack.quantityAvailable, pack.maxBuildable);

  const individualTotal = pack.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const distance = useMemo(() => {
    if (!searchLocation || !(pack as any).supplierLat || !(pack as any).supplierLng) return null;
    const lat = parseFloat((pack as any).supplierLat);
    const lng = parseFloat((pack as any).supplierLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return calculateDistance(parseFloat(searchLocation.lat), parseFloat(searchLocation.lng), lat, lng);
  }, [(pack as any).supplierLat, (pack as any).supplierLng, searchLocation]);

  return (
    <div
      data-testid={`card-pack-${pack.id}`}
      className={`group border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-xl hover:-translate-y-0.5 ${t.dk ? "bg-gray-800 border-amber-900/40" : "bg-white border-amber-100"}`}
      onClick={() => openPackQuickView(pack.id)}
    >
      {/* Image */}
      <div className={`relative aspect-[4/3] overflow-hidden ${t.dk ? "bg-amber-900/20" : "bg-amber-50"}`}>
        {pack.imageUrl ? (
          <img
            src={pack.imageUrl}
            alt={pack.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Layers className={`w-10 h-10 ${t.dk ? "text-amber-800/60" : "text-amber-200"}`} />
          </div>
        )}
        {/* Pack badge */}
        <div className="absolute top-2 left-2">
          <Badge className="bg-amber-500/90 text-white text-[10px] font-semibold shadow-sm border-0 px-2 backdrop-blur-sm">
            <Layers className="w-3 h-3 mr-1 inline" />Pack
          </Badge>
        </div>
        {/* Expiration badge */}
        {pack.expirationDate && (
          <div className="absolute bottom-2 right-2">
            <Badge className="bg-orange-500/90 text-white text-[10px] font-semibold shadow-sm border-0 px-2 backdrop-blur-sm">
              Exp. {new Date(pack.expirationDate).toLocaleDateString()}
            </Badge>
          </div>
        )}
        {/* Favorite button */}
        {hasCommercialAccess && (
          <button
            className="absolute top-2 right-2 w-7 h-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
            onClick={(e) => { e.stopPropagation(); togglePack(pack.id); }}
            data-testid={`button-fav-pack-${pack.id}`}
          >
            <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white/80"}`} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight line-clamp-2 transition-colors ${t.dk ? "text-white group-hover:text-amber-400" : "text-gray-900 group-hover:text-amber-600"}`}>
          {pack.name}
        </h3>
        {pack.description && (
          <p className={`text-xs line-clamp-1 ${t.textMuted}`}>{pack.description}</p>
        )}

        {/* Brands */}
        {pack.brandLabels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pack.brandLabels.slice(0, 2).map(b => (
              <Badge
                key={b.id}
                className={`text-[10px] px-1.5 py-0 border ${t.dk ? "bg-amber-900/40 text-amber-400 border-amber-800/60" : "bg-amber-50 text-amber-700 border-amber-200"}`}
              >
                {b.name}
              </Badge>
            ))}
            {pack.brandLabels.length > 2 && (
              <span className={`text-[10px] ${t.textMuted}`}>+{pack.brandLabels.length - 2}</span>
            )}
          </div>
        )}

        {/* Categories */}
        {pack.categoryLabels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pack.categoryLabels.slice(0, 2).map(c => (
              <Badge
                key={c.id}
                className={`text-[10px] px-1.5 py-0 border ${t.dk ? "bg-gray-700 text-gray-300 border-gray-600" : "bg-gray-100 text-gray-600 border-gray-200"}`}
              >
                {c.name}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-0.5">
          <StarRating rating={pack.packAvgRating} count={pack.packReviewCount} isDark={isDark} />
          <div className={`flex items-center gap-2 text-[10px] ${t.textMuted}`}>
            {distance != null && <span>{formatDistance(distance)}</span>}
            <span>{maxQty} dispo.</span>
          </div>
        </div>

        <div className={`mt-auto pt-2 border-t ${t.priceBorder}`}>
          {hasCommercialAccess ? (
            <div className="flex items-baseline gap-2">
              <p className={`font-bold text-sm ${t.dk ? "text-amber-400" : "text-amber-600"}`}>
                {formatCurrency(pack.price)}
              </p>
              {individualTotal > pack.price && (
                <p className={`text-xs line-through ${t.textMuted}`}>{formatCurrency(individualTotal)}</p>
              )}
            </div>
          ) : (
            <div className={`flex items-center gap-1 text-[11px] font-medium ${t.dk ? "text-amber-400" : "text-amber-700"}`}>
              <Lock className="w-3 h-3 shrink-0" />
              <span>Price for approved owners</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PacksSection({
  packs, categoryId, filters, isDark,
}: {
  packs: PackDetail[];
  categoryId: string;
  filters: FilterState;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const [expanded, setExpanded] = useState(false);
  const hasCommercialAccess = useCommercialAccess();
  const INITIAL_LIMIT = 5;

  const filteredPacks = useMemo(() => {
    let list = packs;
    if (categoryId) list = list.filter((p) => p.categoryIds.includes(Number(categoryId)));
    if (filters.subCategoryId) list = list.filter((p) => p.subCategoryIds.includes(Number(filters.subCategoryId)));
    if (filters.brandId) list = list.filter((p) => p.brandIds.includes(Number(filters.brandId)));
    return list;
  }, [packs, categoryId, filters.subCategoryId, filters.brandId]);

  if (!filteredPacks.length) return null;
  const showToggle = filteredPacks.length > INITIAL_LIMIT;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className={`font-bold text-lg flex items-center gap-1.5 ${t.textPrimary}`}>
            <Layers className={`w-4 h-4 ${t.dk ? "text-amber-400" : "text-amber-500"}`} />Packs
          </h2>
          <p className={`text-xs mt-0.5 ${t.textMuted}`}>
            {filteredPacks.length} pack{filteredPacks.length !== 1 ? "s" : ""}
          </p>
        </div>
        {showToggle && (
          <Button
            variant="ghost"
            size="sm"
            className={`text-xs font-semibold h-8 px-3 ${t.sectionBtnPack}`}
            onClick={() => setExpanded((e) => !e)}
            data-testid="button-toggle-packs"
          >
            {expanded ? "Show Less" : `See More (${filteredPacks.length - INITIAL_LIMIT}+)`}
          </Button>
        )}
      </div>
      {expanded ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredPacks.map((pack) => (
            <PackCardTile key={pack.id} pack={pack} hasCommercialAccess={hasCommercialAccess} isDark={isDark} />
          ))}
        </div>
      ) : (
        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          {filteredPacks.map((pack) => (
            <div key={pack.id} className="shrink-0 w-48 sm:w-56">
              <PackCardTile pack={pack} hasCommercialAccess={hasCommercialAccess} isDark={isDark} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

interface FilterState { subCategoryId: string; brandId: string; flavorId: string; sizeId: string; sortBy: string; }

function FilterBar({
  categoryProducts, filters, onChange, onReset, hasSearchLocation, isDark,
}: {
  categoryProducts: MarketplaceProduct[];
  filters: FilterState;
  onChange: (key: keyof FilterState, val: string) => void;
  onReset: () => void;
  hasSearchLocation: boolean;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const hasActive = Object.values(filters).some(Boolean);

  const subCategories = useMemo(() => {
    const map = new Map<string, string>();
    categoryProducts.forEach((p) => {
      if (p.subCategoryLabel?.id && p.subCategoryLabel?.name)
        map.set(String(p.subCategoryLabel.id), p.subCategoryLabel.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [categoryProducts]);

  const brands = useMemo(() => {
    const map = new Map<string, string>();
    categoryProducts.forEach((p) => {
      if (p.brandLabel?.id && p.brandLabel?.name)
        map.set(String(p.brandLabel.id), p.brandLabel.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [categoryProducts]);

  const flavors = useMemo(() => {
    const map = new Map<string, string>();
    categoryProducts.forEach((p) => {
      (p.flavorLabels ?? []).forEach((fl) => {
        if (fl.id && fl.name) map.set(String(fl.id), fl.name);
      });
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [categoryProducts]);

  const sizes = useMemo(() => {
    const map = new Map<string, string>();
    categoryProducts.forEach((p) => {
      (p.sizeLabels ?? []).forEach((sl) => {
        if (sl.id && sl.name) map.set(String(sl.id), sl.name);
      });
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [categoryProducts]);

  if (!subCategories.length && !brands.length && !flavors.length && !sizes.length) return null;

  return (
    <div className={`border-b ${t.filterBg} py-2 px-4`}>
      <div className="max-w-7xl mx-auto flex items-center gap-2 flex-wrap">
        <SlidersHorizontal className={`w-3.5 h-3.5 shrink-0 ${t.textMuted}`} />
        {subCategories.length > 0 && (
          <Select value={filters.subCategoryId || "__all__"} onValueChange={(v) => onChange("subCategoryId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] ${t.selectTrigger}`}>
              <SelectValue placeholder="Sub-Category" />
            </SelectTrigger>
            <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
              <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>All Sub-Categories</SelectItem>
              {subCategories.map((sc) => <SelectItem key={sc.id} value={sc.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{sc.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {brands.length > 0 && (
          <Select value={filters.brandId || "__all__"} onValueChange={(v) => onChange("brandId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[100px] ${t.selectTrigger}`}>
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
              <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>All Brands</SelectItem>
              {brands.map((b) => <SelectItem key={b.id} value={b.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {flavors.length > 0 && (
          <Select value={filters.flavorId || "__all__"} onValueChange={(v) => onChange("flavorId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[100px] ${t.selectTrigger}`}>
              <SelectValue placeholder="Flavor" />
            </SelectTrigger>
            <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
              <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>All Flavors</SelectItem>
              {flavors.map((f) => <SelectItem key={f.id} value={f.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {sizes.length > 0 && (
          <Select value={filters.sizeId || "__all__"} onValueChange={(v) => onChange("sizeId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[100px] ${t.selectTrigger}`}>
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
              <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>All Sizes</SelectItem>
              {sizes.map((s) => <SelectItem key={s.id} value={s.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filters.sortBy || "recommended"} onValueChange={(v) => onChange("sortBy", v === "recommended" ? "" : v)}>
          <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] ${t.selectTrigger}`}>
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
            <SelectItem value="recommended" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Recommended</SelectItem>
            <SelectItem value="price_asc" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Price: Low to High</SelectItem>
            <SelectItem value="price_desc" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Price: High to Low</SelectItem>
            <SelectItem value="suppliers" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Most Suppliers</SelectItem>
            {hasSearchLocation && (
              <SelectItem value="nearest" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>
                <span className="flex items-center gap-1"><Navigation className="w-3 h-3 inline" /> Nearest First</span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {hasActive && (
          <button
            onClick={onReset}
            className={`flex items-center gap-1 text-xs transition-colors ml-1 ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BrowseProducts() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const hasCommercialAccess = useCommercialAccess();
  const searchLocation = useSearchLocationStore((s) => s.searchLocation);
  const searchLat = searchLocation?.lat ? parseFloat(searchLocation.lat) : null;
  const searchLng = searchLocation?.lng ? parseFloat(searchLocation.lng) : null;
  const hasSearchLocation = searchLat !== null && searchLng !== null && !Number.isNaN(searchLat) && !Number.isNaN(searchLng);

  // ── Dark / light mode (dark by default — matches Favorites modal) ──────────
  const [isDark, setIsDark] = useState(true);
  const t = useTheme(isDark);

  const [flashOpen, setFlashOpen] = useState(false);

  const urlParams = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const initialSearch = urlParams.get("q") ?? "";
  const initialCategory = urlParams.get("categoryId") ?? "";

  const [search, setSearch] = useState(initialSearch);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [filters, setFilters] = useState<FilterState>({ subCategoryId: "", brandId: "", flavorId: "", sizeId: "", sortBy: "" });

  useEffect(() => {
    const q = urlParams.get("q") ?? "";
    const cat = urlParams.get("categoryId") ?? "";
    setSearch(q);
    setCategoryId(cat);
  }, [searchStr]);

  const { data: allProducts = [], isLoading } = useQuery<MarketplaceProduct[]>({
    queryKey: ["/api/marketplace"],
    queryFn: async () => {
      const res = await fetch("/api/marketplace");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
  });

  const allListingIds = useMemo(() => allProducts.flatMap(p => p.listings.map(l => l.id)), [allProducts]);
  const listingPromotions = useListingPromotions(allListingIds);

  const { data: categories = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });

  const { data: stores = [] } = useQuery<StoreCard[]>({
    queryKey: ["/api/stores"],
    queryFn: async () => {
      const res = await fetch("/api/stores");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: packs = [] } = useQuery<PackDetail[]>({
    queryKey: ["/api/marketplace/packs"],
    queryFn: async () => {
      const res = await fetch("/api/marketplace/packs");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
  });

  const visibleCategoryIds = useMemo(() => {
    const ids = new Set<number>();
    allProducts.forEach((p) => { if (p.categoryId != null) ids.add(p.categoryId); });
    packs.forEach((p) => { p.categoryIds.forEach((id) => ids.add(id)); });
    return ids;
  }, [allProducts, packs]);

  const categoryFiltered = useMemo(() => {
    let list = allProducts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q));
    }
    if (categoryId) list = list.filter((p) => String(p.categoryId) === categoryId);
    return list;
  }, [allProducts, search, categoryId]);

  const filtered = useMemo(() => {
    let list = categoryFiltered;
    if (filters.subCategoryId) list = list.filter((p) => String(p.subCategoryId) === filters.subCategoryId);
    if (filters.brandId) list = list.filter((p) => p.brandLabel && String(p.brandLabel.id) === filters.brandId);
    if (filters.flavorId) list = list.filter((p) => (p.flavorLabels ?? []).some((fl) => String(fl.id) === filters.flavorId));
    if (filters.sizeId) list = list.filter((p) => (p.sizeLabels ?? []).some((sl) => String(sl.id) === filters.sizeId));
    if (filters.sortBy === "price_asc") list = [...list].sort((a, b) => (a.bestPrice ?? Infinity) - (b.bestPrice ?? Infinity));
    if (filters.sortBy === "price_desc") list = [...list].sort((a, b) => (b.bestPrice ?? 0) - (a.bestPrice ?? 0));
    if (filters.sortBy === "suppliers") list = [...list].sort((a, b) => b.supplierCount - a.supplierCount);
    if (filters.sortBy === "nearest" && hasSearchLocation) {
      list = [...list].sort((a, b) => {
        const aLat = (a as any).supplierLat ? parseFloat((a as any).supplierLat) : null;
        const aLng = (a as any).supplierLng ? parseFloat((a as any).supplierLng) : null;
        const bLat = (b as any).supplierLat ? parseFloat((b as any).supplierLat) : null;
        const bLng = (b as any).supplierLng ? parseFloat((b as any).supplierLng) : null;
        const distA = aLat && aLng ? calculateDistance(searchLat!, searchLng!, aLat, aLng) : Infinity;
        const distB = bLat && bLng ? calculateDistance(searchLat!, searchLng!, bLat, bLng) : Infinity;
        return distA - distB;
      });
    }
    return list;
  }, [categoryFiltered, filters, hasSearchLocation, searchLat, searchLng]);

  // ── Flash products — all marketplace products with hasPromo derived from promotions ──
  const flashProducts = useMemo(() => {
    const promoListingIds = new Set(listingPromotions.map((lp) => lp.listingId));
    return allProducts.map((p) => ({
      ...p,
      hasPromo: p.listings.some((l) => promoListingIds.has(l.id)),
      bestPrice: p.bestPrice ?? 0,
    }));
  }, [allProducts, listingPromotions]);

  const updateFilter = (key: keyof FilterState, val: string) => setFilters((p) => ({ ...p, [key]: val }));
  const resetFilters = () => setFilters({ subCategoryId: "", brandId: "", flavorId: "", sizeId: "", sortBy: "" });
  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search ? 1 : 0) + (categoryId ? 1 : 0);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (categoryId) params.set("categoryId", categoryId);
    navigate(`/products${params.toString() ? "?" + params.toString() : ""}`);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-10 pb-12 px-4 overflow-hidden">
        {/* Background — dark: subtle amber glow | light: amber gradient */}
        {t.dk ? (
          <>
            <div className="absolute inset-0 bg-gray-900" />
            <div className="absolute inset-0 bg-gradient-to-br from-amber-900/25 via-gray-900 to-gray-900" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600" />
            <div className="absolute inset-0 bg-black/10" />
          </>
        )}

        {/* Top-right controls: Flash + Dark/Light toggle */}
        <div className="relative flex justify-end items-center gap-2 mb-4">
          {(allProducts.length > 0 || packs.length > 0) && (
            <button
              onClick={() => setFlashOpen(true)}
              aria-label="Flash Mode"
              data-testid="button-flash-mode"
              title="Flash Mode — browse products"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${t.dk ? "bg-gray-800 hover:bg-gray-700" : "bg-white/20 hover:bg-white/30"}`}
            >
              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
            </button>
          )}
          <button
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle theme"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${t.dk ? "bg-gray-800 hover:bg-gray-700 text-amber-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
          >
            {t.dk
              ? <Sun className="w-4 h-4" />
              : <Moon className="w-4 h-4" />
            }
          </button>
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-5 backdrop-blur-sm ${t.dk ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}>
            <ShoppingBag className={`w-8 h-8 ${t.dk ? "text-amber-400" : "text-white"}`} />
          </div>
          <h1 className={`text-3xl md:text-4xl font-extrabold mb-2 ${t.dk ? "text-white" : "text-white"}`}>
            BigBoss <span className={t.dk ? "text-amber-400" : "text-amber-200"}>SHOP</span>
          </h1>
          <p className={`text-base mb-0 max-w-xl mx-auto ${t.dk ? "text-gray-400" : "text-amber-100"}`}>
            Commandez vos produits professionnels directement auprès de fournisseurs vérifiés.
          </p>
        </div>
      </section>

      {/* ── Sticky: Category strip + Filter bar ──────────────────────────── */}
      <div className="sticky top-14 z-30">
        <CategoryStrip
          categories={categories}
          selected={categoryId}
          visibleCategoryIds={visibleCategoryIds}
          isDark={isDark}
          onSelect={(id) => {
            setCategoryId(id);
            resetFilters();
            const params = new URLSearchParams();
            if (search.trim()) params.set("q", search.trim());
            if (id) params.set("categoryId", id);
            navigate(`/products${params.toString() ? "?" + params.toString() : ""}`);
          }}
        />
        <FilterBar
          categoryProducts={categoryFiltered}
          filters={filters}
          onChange={updateFilter}
          onReset={resetFilters}
          hasSearchLocation={hasSearchLocation}
          isDark={isDark}
        />
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Stores */}
        {!search.trim() && (
          <StoresSection
            stores={stores}
            categoryId={categoryId}
            filters={filters}
            onSelect={(storeId) => navigate(`/stores/${storeId}`)}
            searchLat={searchLat}
            searchLng={searchLng}
            hasSearchLocation={hasSearchLocation}
            isDark={isDark}
          />
        )}

        {/* Packs */}
        {!search.trim() && (
          <PacksSection packs={packs} categoryId={categoryId} filters={filters} isDark={isDark} />
        )}

        {/* Products header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            {categoryId ? (
              <h1 className={`font-bold text-lg ${t.textPrimary}`}>
                {categories.find((c) => String(c.id) === categoryId)?.name ?? "Products"}
              </h1>
            ) : (
              <h1 className={`font-bold text-lg ${t.textPrimary}`}>All Products</h1>
            )}
            {!isLoading && (
              <p className={`text-sm mt-0.5 ${t.textMuted}`}>
                {filtered.length} product{filtered.length !== 1 ? "s" : ""} available
              </p>
            )}
          </div>
        </div>

        {/* Product grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className={`h-56 rounded-2xl animate-pulse ${t.skeletonBg}`} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Package className={`w-14 h-14 ${t.emptyIcon}`} />
            <div>
              <p className={`font-semibold ${t.emptyText}`}>No products found</p>
              <p className={`text-sm mt-1 ${t.emptySubText}`}>
                {activeFilterCount > 0 ? "Try adjusting your filters." : "Suppliers haven't listed any products yet."}
              </p>
            </div>
            {activeFilterCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className={t.dk ? "border-gray-700 text-gray-300 hover:bg-gray-800" : ""}
                onClick={() => { setSearch(""); setCategoryId(""); resetFilters(); navigate("/products"); }}
              >
                Clear all filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                hasCommercialAccess={hasCommercialAccess}
                promotions={listingPromotions}
                isDark={isDark}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Flash mode ─────────────────────────────────────────────────────── */}
      <FlashMode
        open={flashOpen}
        onClose={() => setFlashOpen(false)}
        products={flashProducts as any[]}
        packs={packs}
        storeName="BigBoss SHOP"
      />
    </div>
  );
}
