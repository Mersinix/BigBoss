import { useState, useMemo, useEffect, useRef } from "react";
import { useThemeStore } from "@/store/theme-store";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
 Gift, Package, Store, Heart, SlidersHorizontal, RotateCcw, Lock, Navigation,
  Plus, ShoppingBag, Layers, Star, MapPin, Zap, Search,
} from "lucide-react";
import type { ListingPromotion } from "@shared/schema";
import { useCurrency } from "@/hooks/use-currency";
import { useFavorites } from "@/hooks/use-favorites";
import { useStoreFavorites } from "@/hooks/use-store-favorites";
import { calculateDistance, formatDistance } from "@/lib/distance";
import { useSearchLocationStore } from "@/store/search-location-store";
import { useQuickView } from "@/hooks/use-quick-view";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import type { MarketplaceProduct, CategoryWithCount, StoreCard, PackDetail, TaxonomyLabel, SubCategoryWithDetails, BrandWithCount, FlavorWithCount, SizeWithCount } from "@shared/schema";
import { FlashMode } from "@/components/flash-mode";
import { useServiceHeroConfig } from "@/hooks/use-service-hero-config";
import { ServiceHeroShell, H_ALIGN_ICON_MX, H_ALIGN_ROW_JUSTIFY, getHeroSubtitleColorStyle } from "@/components/shared/service-hero";
import { useCoverZoomStyle, getAdjustmentFor } from "@/lib/image-adjustment";

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
    // Move SHOP Search Input into the Products Filter Section — same token
    // (identical values) as /academy, /print, /maintenance, /marketing and
    // /barista's own `inputBg`, used for the new inline search field below.
    inputBg:          dk ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
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
              <span>Tout</span>
            </button>
          </div>
          {active.map((cat) => (
            <div key={cat.id} className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
              <button
                onClick={() => onSelect(selected === String(cat.id) ? "" : String(cat.id))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${selected === String(cat.id) ? t.switcherActive : t.switcherInactive}`}
                data-testid={`button-cat-${cat.id}`}
              >
                <span className="text-base leading-none shrink-0">{cat.icon || "📦"}</span>
                {/* Full name, task "Display Complete Category Names" — allow wrapping
                    onto up to 2 lines instead of the previous single-line truncate, so
                    long names (incl. Arabic/longer English) stay fully readable. */}
                <span className="max-w-[110px] whitespace-normal break-words leading-tight text-left">{cat.name}</span>
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

  // True when at least one supplier has an active promotion for this product
  const hasPromo = useMemo(
    () => promotions.some(p => listingIds.includes(p.listingId)),
    [promotions, listingIds.join(',')],
  );

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
  const categoryName = product.categoryLabel?.name ?? product.category ?? null;
  const brandName = product.brandLabel?.name ?? null;
  const adjustPct = getAdjustmentFor(product.imageAdjustments, product.imageUrl);
  const { wrapperStyle: cropWrapperStyle } = useCoverZoomStyle(adjustPct);

  return (
    <div
      data-testid={`card-product-${product.id}`}
      className={`group border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all shadow-xl hover:-translate-y-0.5 ${t.cardBg}`}
      onClick={() => openQuickView(product.id)}
    >
      {/* Image */}
      <div className={`relative aspect-[4/3] overflow-hidden shrink-0 ${t.imageOverlay}`}>
        {product.imageUrl ? (
          <div style={cropWrapperStyle}>
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className={`w-10 h-10 ${t.emptyIcon}`} />
          </div>
        )}

        {/* "On Sale" badge — top-left, shown when ≥1 supplier has an active promotion */}
        {hasPromo && (
          <div className="absolute top-2 left-2">
            <span className="bg-rose-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Zap className="w-2.5 h-2.5" />On Sale
            </span>
          </div>
        )}

        {/* Favorite button — top-right */}
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

        {/* Quick view button — bottom-right */}
        <button
          className="absolute bottom-2 right-2 w-7 h-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          onClick={(e) => { e.stopPropagation(); openQuickView(product.id); }}
          data-testid={`button-quick-view-${product.id}`}
        >
          <Plus className="w-3.5 h-3.5 text-white/80" />
        </button>

        {/* Rating — bottom-left image overlay */}
        {hasCommercialAccess && hasReviews && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-1.5 py-0.5 shadow-sm">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="text-[10px] font-medium text-white">{product.avgRating.toFixed(1)}</span>
            <span className="text-[10px] text-white/80">({product.reviewCount})</span>
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight truncate transition-colors group-hover:${t.dk ? "text-blue-400" : "text-blue-600"} ${t.textPrimary}`}>
          {product.name}
        </h3>

        {/* Supplier logos + distance */}
        <div className="flex items-center gap-1.5">
          <SupplierLogoStrip listings={product.listings} count={product.supplierCount} isDark={isDark} />
          {distanceKm !== null && (
            <span className={`text-[11px] flex items-center gap-0.5 ml-auto ${t.textMuted}`}>
              <MapPin className="w-2.5 h-2.5 shrink-0" />{formatDistance(distanceKm)}
            </span>
          )}
        </div>

        {/* Bottom row: full-width Category • Brand badge */}
        <div className={`mt-auto pt-1.5 border-t flex items-center gap-2 ${t.priceBorder}`}>
          {/* Category • Brand */}
          {categoryName ? (
            <Badge
              className={`w-full min-w-0 text-[10px] px-1.5 py-0 border ${
                t.dk
                  ? "bg-gray-700 text-rose-500 border-gray-600"
                  : "bg-gray-100 text-rose-500 border-gray-600/30"
              }`}
            >
              <span className="block min-w-0 truncate">
                {categoryName && (
                  <span className={`mr-0.5 ${t.textPrimary}`}>
                    {categoryName} •
                  </span>
                )}
                {brandName}
              </span>
            </Badge>
          ) : (
            <span />
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
      className={`group cursor-pointer border rounded-2xl overflow-hidden flex flex-col transition-all shadow-xl hover:-translate-y-0.5 ${t.cardBg}`}
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
  stores, categoryId, filters, search, onSelect, searchLat, searchLng, hasSearchLocation, isDark,
}: {
  stores: StoreCard[];
  categoryId: string;
  filters: FilterState;
  // Extend SHOP Search to Products, Stores, and Packs — same query, same
  // normalization (.trim().toLowerCase().includes()) as the products match
  // below, applied here against this store's own name/description. Combines
  // with the existing category/sub-category/brand filters via plain AND,
  // same as every other condition in this list.
  search: string;
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
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [stores, categoryId, filters.subCategoryId, filters.brandId, search]);

  if (!filteredStores.length) return null;

  const showToggle = filteredStores.length > INITIAL_LIMIT;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          {/* <h2 className={`font-bold text-lg ${t.textPrimary}`}>MARQUES & FOURNISSEURS</h2> */}
          <h2 className={`font-bold text-lg flex items-center gap-1.5 ${t.textPrimary}`}>
          <Store className={`w-4 h-4 ${t.dk ? "text-amber-400" : "text-amber-500"}`} />
              MARQUES & FOURNISSEURS
          </h2>
          <p className={`text-xs mt-0.5 ${t.textMuted}`}>
            {filteredStores.length} store{filteredStores.length !== 1 ? "s" : ""}
          </p>
        </div>
        {showToggle && (
          <Button
            variant="outline"
            size="sm"
            className={`text-xs font-semibold h-8 px-3 ${t.sectionBtn}`}
            onClick={() => setExpanded((e) => !e)}
            data-testid="button-toggle-stores"
          >
            {expanded ? "Afficher Moins" : `Voir Plus (${filteredStores.length - INITIAL_LIMIT}+)`}
          </Button>
        )}
      </div>

      {expanded ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-3">
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

export function StarRating({ rating, count, isDark }: { rating: number; count: number; isDark: boolean }) {
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

export function PackCardTile({
  pack, hasCommercialAccess, isDark,
}: {
  pack: PackDetail;
  hasCommercialAccess: boolean;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const symbol = useCurrency(); // use global currency symbol
  // Format cents as "65.00 DT" (currency symbol on the right)
  const fmtRight = (cents: number) => `${(cents / 100).toFixed(2)} ${symbol}`;

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

  // Build correct category → brands map from items (each item carries its own categoryId + brandId)
  const catBrandMap = useMemo(() => {
    const map = new Map<number, TaxonomyLabel[]>();
    for (const item of pack.items) {
      if (!item.categoryId) continue;
      const brandLabel = item.brandId ? pack.brandLabels.find((b) => b.id === item.brandId) : null;
      if (!map.has(item.categoryId)) map.set(item.categoryId, []);
      if (brandLabel && !map.get(item.categoryId)!.find((b) => b.id === brandLabel.id)) {
        map.get(item.categoryId)!.push(brandLabel);
      }
    }
    return map;
  }, [pack.items, pack.brandLabels]);

  // Categories row: up to 2 chips, each showing its own correct brands, +N overflow
  const MAX_CAT = 2;
  const visibleCats = pack.categoryLabels.slice(0, MAX_CAT);
  const hiddenCatCount = Math.max(0, pack.categoryLabels.length - MAX_CAT);

  // Amber price color class (reused for quantity and expiration)
  const priceColor = t.dk ? "text-amber-400" : "text-amber-600";

  // Format expiration date as "15 Sep 2026"
  const expiryLabel = pack.expirationDate
    ? new Date(pack.expirationDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div
      data-testid={`card-pack-${pack.id}`}
      className={`group border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all shadow-xl hover:-translate-y-0.5 ${t.dk ? "bg-gray-800 border-amber-900/40" : "bg-white border-amber-100"}`}
      onClick={() => openPackQuickView(pack.id)}
    >
      {/* Image — aspect-[4/3], identical across all cards */}
      <div className={`relative aspect-[4/3] overflow-hidden shrink-0 ${t.dk ? "bg-amber-900/20" : "bg-amber-50"}`}>
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
          <Badge className="bg-amber-500/90 text-white text-[10px] border-gray-600/30 font-semibold shadow-sm border-0 px-2 backdrop-blur-sm">
            <Layers className="w-3 h-3 mr-1 inline" />Pack
          </Badge>
        </div>
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

      {/* Body — fixed height so all cards are identical */}
      <div className="p-3 flex flex-col gap-0" style={{ height: 164 }}>
        {/* Row 1: Name — 1 line */}
        <h3 className={`font-bold text-sm leading-tight line-clamp-1 transition-colors ${t.dk ? "text-white group-hover:text-amber-400" : "text-gray-900 group-hover:text-amber-600"}`}>
          {pack.name}
        </h3>

        {/* Row 2: Description — always 1 line, truncated with ellipsis */}
        <p className={`text-xs line-clamp-1 truncate mt-1 min-h-[16px] ${t.textMuted}`}>
          {pack.description || "\u00A0"}
        </p>

{/* Row 4: Categories — single line, each chip shows only its own correct brands */}
        <div className="flex items-center gap-1 mt-1.5 flex-nowrap overflow-hidden min-h-[20px]">
          {visibleCats.map((c) => {
            const brands = catBrandMap.get(c.id) ?? [];
            return (
              <Badge
                key={c.id}
                className={`text-[10px] px-1.5 py-0 border shrink-0 ${t.dk ? "bg-gray-700 text-gray-300 border-gray-600" : "bg-gray-100 text-gray-600 border-gray-600"}`}
              >
                {c.name}{brands.map((b) => (
                  <span key={b.id} className={`ml-0.5 ${priceColor}`}> • {b.name}</span>
                ))}
              </Badge>
            );
          })}
          {hiddenCatCount > 0 && (
            <span className={`text-[10px] shrink-0 ${t.textMuted}`}>+{hiddenCatCount}</span>
          )}
        </div>
        
         {/* Row 4b: Supplier name (left) + supplier rating (right) */}
        {pack.supplierName && (
          <div className="flex items-center gap-1 mt-1 min-w-0">
            
            <span className={`text-[10px] truncate flex-1 font-bold text-sm leading-tight line-clamp-1 transition-colors ${t.textMuted} ${t.dk ? "text-white" : "text-gray-900"}`}>{pack.supplierName}</span>
            {pack.supplierReviewCount > 0 && (
              <span className="flex items-center gap-0.5 shrink-0">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                <span className={`text-[10px] font-medium ${t.textPrimary}`}>{pack.supplierAvgRating.toFixed(1)}</span>
              </span>
            )}
          </div>
        )}

        {/* Row 3: Price (right-of-symbol) / old price / 📦 quantity — single line */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-nowrap overflow-hidden">
        
            <>
              <span className={`font-bold text-sm shrink-0 ${priceColor}`}>
                {fmtRight(pack.price)}
              </span>
              {individualTotal > pack.price && (
                <span className={`text-xs line-through shrink-0 ${t.textMuted}`}>{fmtRight(individualTotal)}</span>
              )}
              {/* 📦 quantity — amber, aligned right */}
              <span className={`flex items-center gap-0.5 ml-auto shrink-0 text-[11px] font-medium ${priceColor}`}>
                <Package className="w-3 h-3" />{maxQty}
              </span>
            </>
         
        </div>

        

       

        {/* Row 5 (bottom): Expiry left · Distance center · Rating right */}
        <div className={`flex items-center justify-between gap-1 mt-auto pt-1.5 border-t ${t.priceBorder}`}>
          <span className={`text-[10px] truncate shrink-0 ${expiryLabel ? priceColor : t.textMuted}`}>
            {expiryLabel ? `Exp: ${expiryLabel}` : "\u00A0"}
          </span>
          {distance != null ? (
            <span className={`flex items-center gap-0.5 text-[10px] shrink-0 ${t.textMuted}`}>
              <MapPin className="w-2.5 h-2.5 shrink-0" />{formatDistance(distance)}
            </span>
          ) : <span />}
          <StarRating rating={pack.packAvgRating} count={pack.packReviewCount} isDark={isDark} />
        </div>
      </div>
    </div>
  );
}

function PacksSection({
  packs, categoryId, filters, search, isDark,
}: {
  packs: PackDetail[];
  categoryId: string;
  filters: FilterState;
  // Extend SHOP Search to Products, Stores, and Packs — same query/normalization
  // as Products/Stores, matched against this pack's own name/description/
  // supplier name, plus the name of any product included in it.
  search: string;
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
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        p.items.some((item) => item.productName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [packs, categoryId, filters.subCategoryId, filters.brandId, search]);

  if (!filteredPacks.length) return null;
  const showToggle = filteredPacks.length > INITIAL_LIMIT;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className={`font-bold text-lg flex items-center gap-1.5 ${t.textPrimary}`}>
            <Gift  className={`w-4 h-4 ${t.dk ? "text-amber-400" : "text-amber-500"}`} />PROMO PACK
          </h2>
          <p className={`text-xs mt-0.5 ${t.textMuted}`}>
            {filteredPacks.length} pack{filteredPacks.length !== 1 ? "s" : ""}
          </p>
        </div>
        {showToggle && (
          <Button
            variant="outline"
            size="sm"
            className={`text-xs font-semibold h-8 px-3 ${t.sectionBtnPack}`}
            onClick={() => setExpanded((e) => !e)}
            data-testid="button-toggle-packs"
          >
            {expanded ? "Afficher Moins" : `Voir Plus (${filteredPacks.length - INITIAL_LIMIT}+)`}
          </Button>
        )}
      </div>
      {expanded ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-3">
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
            <div key={pack.id} className="shrink-0 w-52 sm:w-60">
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
  categoryProducts, filters, onChange, onReset, hasSearchLocation, isDark, search, onSearchChange, subCategoryIconMap,
  subCategoryOrderIndex, brandOrderIndex, flavorOrderIndex, sizeOrderIndex,
}: {
  categoryProducts: MarketplaceProduct[];
  filters: FilterState;
  onChange: (key: keyof FilterState, val: string) => void;
  onReset: () => void;
  hasSearchLocation: boolean;
  isDark: boolean;
  // Move SHOP Search Input into the Products Filter Section — same split as
  // /print's PrintFilterBar: value/onChange live here as a controlled prop
  // (the actual match/filter logic stays in the parent, same as every other
  // filter here), while the mobile open/closed toggle stays local, exactly
  // like /academy's own trainingSearchOpen.
  search: string;
  onSearchChange: (value: string) => void;
  // Admin-configured per-subcategory icon (id → emoji/icon string), resolved
  // from the full /api/subcategories records in the parent — see that
  // query's own comment for why this can't come from categoryProducts alone.
  subCategoryIconMap: Map<number, string>;
  // Admin-configured ordering (task: "Synchronize Category, Subcategory,
  // Flavor, Size, and Brand Ordering Across the Coffee Owner Shop") — id →
  // rank in Admin's own configured order, used to sort each dropdown's
  // eligible options; eligibility itself still comes from categoryProducts,
  // unchanged.
  subCategoryOrderIndex: Map<number, number>;
  brandOrderIndex: Map<number, number>;
  flavorOrderIndex: Map<number, number>;
  sizeOrderIndex: Map<number, number>;
}) {
  const t = useTheme(isDark);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hasActive = Object.values(filters).some(Boolean) || !!search;

  // Cross-filter-aware option derivation (task: "Coffee Owner Shop:
  // Synchronize All Product Filters") — each dropdown's options come from
  // categoryProducts narrowed by every OTHER active secondary filter, but
  // never by its own, so the currently selected value can never disappear
  // from its own list while still correctly narrowing in response to its
  // siblings (Phase 8's explicit warning against deriving a dropdown solely
  // from a list already filtered by that same dropdown).
  const withoutSelf = (excludeKey: keyof FilterState) => {
    let list = categoryProducts;
    if (excludeKey !== "subCategoryId" && filters.subCategoryId) list = list.filter((p) => String(p.subCategoryId) === filters.subCategoryId);
    if (excludeKey !== "brandId" && filters.brandId) list = list.filter((p) => p.brandLabel && String(p.brandLabel.id) === filters.brandId);
    if (excludeKey !== "flavorId" && filters.flavorId) list = list.filter((p) => (p.flavorLabels ?? []).some((fl) => String(fl.id) === filters.flavorId));
    if (excludeKey !== "sizeId" && filters.sizeId) list = list.filter((p) => (p.sizeLabels ?? []).some((sl) => String(sl.id) === filters.sizeId));
    return list;
  };

  // Rank by the real Admin-configured order; an id with no explicit entry
  // (never persisted a displayOrder, or deleted/renamed since) falls to the
  // end, deterministically, without disturbing the relative order of every
  // explicitly-ordered option (task's own required fallback rule).
  const rankOf = (orderIndex: Map<number, number>, id: string): number => orderIndex.get(Number(id)) ?? Number.MAX_SAFE_INTEGER;

  const subCategories = useMemo(() => {
    const map = new Map<string, string>();
    withoutSelf("subCategoryId").forEach((p) => {
      if (p.subCategoryLabel?.id && p.subCategoryLabel?.name)
        map.set(String(p.subCategoryLabel.id), p.subCategoryLabel.name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name, icon: subCategoryIconMap.get(Number(id)) ?? null }))
      .sort((a, b) => rankOf(subCategoryOrderIndex, a.id) - rankOf(subCategoryOrderIndex, b.id));
  }, [categoryProducts, filters.brandId, filters.flavorId, filters.sizeId, subCategoryIconMap, subCategoryOrderIndex]);

  const brands = useMemo(() => {
    const map = new Map<string, string>();
    withoutSelf("brandId").forEach((p) => {
      if (p.brandLabel?.id && p.brandLabel?.name)
        map.set(String(p.brandLabel.id), p.brandLabel.name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => rankOf(brandOrderIndex, a.id) - rankOf(brandOrderIndex, b.id));
  }, [categoryProducts, filters.subCategoryId, filters.flavorId, filters.sizeId, brandOrderIndex]);

  const flavors = useMemo(() => {
    const map = new Map<string, string>();
    withoutSelf("flavorId").forEach((p) => {
      (p.flavorLabels ?? []).forEach((fl) => {
        if (fl.id && fl.name) map.set(String(fl.id), fl.name);
      });
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => rankOf(flavorOrderIndex, a.id) - rankOf(flavorOrderIndex, b.id));
  }, [categoryProducts, filters.subCategoryId, filters.brandId, filters.sizeId, flavorOrderIndex]);

  const sizes = useMemo(() => {
    const map = new Map<string, string>();
    withoutSelf("sizeId").forEach((p) => {
      (p.sizeLabels ?? []).forEach((sl) => {
        if (sl.id && sl.name) map.set(String(sl.id), sl.name);
      });
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => rankOf(sizeOrderIndex, a.id) - rankOf(sizeOrderIndex, b.id));
  }, [categoryProducts, filters.subCategoryId, filters.brandId, filters.flavorId, sizeOrderIndex]);

  // Previously hid the whole bar (search included) whenever there were no
  // facets to filter by — now only hides it when there's nothing to search
  // either, so the search input stays available as long as any product exists.
  if (!categoryProducts.length) return null;

  return (
    <div className={`border-b ${t.filterBg} py-2 px-4`}>
      <div
        className="max-w-7xl mx-auto flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        <SlidersHorizontal className={`w-3.5 h-3.5 shrink-0 ${t.textMuted}`} />
        <div className="relative shrink-0 sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
          {!searchOpen && (
            <button
              type="button"
              className={`sm:hidden h-7 w-7 rounded-full border flex items-center justify-center shrink-0 ${t.inputBg}`}
              onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
              aria-label="Rechercher"
              data-testid="button-open-products-search"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          )}
          <div className={`${searchOpen ? "flex" : "hidden"} sm:flex items-center relative w-44 sm:w-full`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onBlur={() => { if (!search) setSearchOpen(false); }}
              placeholder="Rechercher des produits…"
              className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
              data-testid="input-products-search"
            />
          </div>
        </div>
        {subCategories.length > 0 && (
          <Select value={filters.subCategoryId || "__all__"} onValueChange={(v) => onChange("subCategoryId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`}>
              <SelectValue placeholder="Sous-catégorie" />
            </SelectTrigger>
            <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
              <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Sous-catégories</SelectItem>
              {subCategories.map((sc) => (
                <SelectItem key={sc.id} value={sc.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>
                  {/* Fallback "📦" only when the subcategory has no admin-configured icon
                      yet — same generic fallback already used by CategoryStrip above. */}
                  <span className="mr-1.5">{sc.icon || "📦"}</span>{sc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {brands.length > 0 && (
          <Select value={filters.brandId || "__all__"} onValueChange={(v) => onChange("brandId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[100px] shrink-0 ${t.selectTrigger}`}>
              <SelectValue placeholder="Marque" />
            </SelectTrigger>
            <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
              <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Marques</SelectItem>
              {brands.map((b) => <SelectItem key={b.id} value={b.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {flavors.length > 0 && (
          <Select value={filters.flavorId || "__all__"} onValueChange={(v) => onChange("flavorId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[100px] shrink-0 ${t.selectTrigger}`}>
              <SelectValue placeholder="Saveur" />
            </SelectTrigger>
            <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
              <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Saveurs</SelectItem>
              {flavors.map((f) => <SelectItem key={f.id} value={f.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {sizes.length > 0 && (
          <Select value={filters.sizeId || "__all__"} onValueChange={(v) => onChange("sizeId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[100px] shrink-0 ${t.selectTrigger}`}>
              <SelectValue placeholder="Taille" />
            </SelectTrigger>
            <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
              <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Tailles</SelectItem>
              {sizes.map((s) => <SelectItem key={s.id} value={s.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filters.sortBy || "recommended"} onValueChange={(v) => onChange("sortBy", v === "recommended" ? "" : v)}>
          <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`}>
            <SelectValue placeholder="Trier par" />
          </SelectTrigger>
          <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
            <SelectItem value="recommended" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Recommandé</SelectItem>
            <SelectItem value="price_asc" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Prix croissant</SelectItem>
            <SelectItem value="price_desc" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Prix décroissant</SelectItem>
            <SelectItem value="suppliers" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Plus de fournisseurs</SelectItem>
            {hasSearchLocation && (
              <SelectItem value="nearest" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>
                <span className="flex items-center gap-1"><Navigation className="w-3 h-3 inline" /> Les plus proches</span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {hasActive && (
          <button
            onClick={onReset}
            className={`flex items-center gap-1 text-xs transition-colors ml-1 shrink-0 whitespace-nowrap ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}
          >
            <RotateCcw className="w-3 h-3" /> Réinitialiser
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
  const isDark = useThemeStore((s) => s.isDark);
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

  const { config: heroConfig } = useServiceHeroConfig("SHOP");

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

  // Subcategory icons (task: "Correctly Map Subcategory Icons") — /api/marketplace's own
  // product.subCategoryLabel only carries {id, name} (icon stripped server-side in
  // enrichProduct), so the icon is fetched the same way store-detail-page.tsx already
  // resolves its OWN category icons: a separate query for the full admin-managed records,
  // reduced to an id→icon map. Reused by FilterBar below instead of a second/conflicting
  // icon source.
  const { data: allSubCategories = [] } = useQuery<SubCategoryWithDetails[]>({ queryKey: ["/api/subcategories"] });
  const subCategoryIconMap = useMemo(() => {
    const map = new Map<number, string>();
    allSubCategories.forEach((sc) => { if (sc.icon) map.set(sc.id, sc.icon); });
    return map;
  }, [allSubCategories]);

  // Admin-configured ordering (task: "Synchronize Category, Subcategory,
  // Flavor, Size, and Brand Ordering Across the Coffee Owner Shop") — Sous-
  // catégories/Marques/Saveurs/Tailles were previously ordered by whatever
  // order products happened to appear in (a Map built by iterating
  // categoryProducts), never by Admin → Categories → Category Management's
  // own configured displayOrder. These 3 queries mirror allSubCategories
  // above exactly: the full admin-managed list (already sorted server-side
  // by displayOrder, see server/storage.ts getFlavors/getSizes/getBrands),
  // reduced here to an id→rank map so FilterBar can sort its ELIGIBLE
  // options (still derived from categoryProducts, unchanged) by that real
  // order instead of insertion/Map order.
  const { data: allBrands = [] } = useQuery<BrandWithCount[]>({ queryKey: ["/api/brands"] });
  const { data: allFlavors = [] } = useQuery<FlavorWithCount[]>({ queryKey: ["/api/flavors"] });
  const { data: allSizes = [] } = useQuery<SizeWithCount[]>({ queryKey: ["/api/sizes"] });
  const subCategoryOrderIndex = useMemo(() => new Map(allSubCategories.map((s, i) => [s.id, i])), [allSubCategories]);
  const brandOrderIndex = useMemo(() => new Map(allBrands.map((b, i) => [b.id, i])), [allBrands]);
  const flavorOrderIndex = useMemo(() => new Map(allFlavors.map((f, i) => [f.id, i])), [allFlavors]);
  const sizeOrderIndex = useMemo(() => new Map(allSizes.map((s, i) => [s.id, i])), [allSizes]);

  const { data: stores = [], isLoading: storesLoading } = useQuery<StoreCard[]>({
    queryKey: ["/api/stores"],
    queryFn: async () => {
      const res = await fetch("/api/stores");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: packs = [], isLoading: packsLoading } = useQuery<PackDetail[]>({
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

  // Filter synchronization (task: "Coffee Owner Shop: Synchronize All Product
  // Filters") — selecting a Sub-category/Brand/Flavor/Size directly used to
  // only ever touch `filters`, never `categoryId`, and FilterBar's own option
  // lists (see below) were derived purely from category+search, blind to the
  // other active secondary filters. Root cause confirmed by reading both: no
  // code path resolved a parent category from a sub-category/brand/flavor/size
  // selection, and no dropdown excluded its own dimension while deriving its
  // options from the others.
  const SECONDARY_FILTER_DIMS: (keyof FilterState)[] = ["subCategoryId", "brandId", "flavorId", "sizeId"];
  const matchesFilterDim = (p: MarketplaceProduct, key: keyof FilterState, val: string): boolean => {
    if (key === "subCategoryId") return String(p.subCategoryId) === val;
    if (key === "brandId") return !!p.brandLabel && String(p.brandLabel.id) === val;
    if (key === "flavorId") return (p.flavorLabels ?? []).some((fl) => String(fl.id) === val);
    if (key === "sizeId") return (p.sizeLabels ?? []).some((sl) => String(sl.id) === val);
    return true;
  };

  const updateFilter = (key: keyof FilterState, val: string) => {
    // Sorting never touches category or the other filters (Phase 7G).
    if (key === "sortBy" || !val || !SECONDARY_FILTER_DIMS.includes(key)) {
      setFilters((p) => ({ ...p, [key]: val }));
      return;
    }

    const searchFiltered = search.trim()
      ? allProducts.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()) || (p.description ?? "").toLowerCase().includes(search.trim().toLowerCase()))
      : allProducts;

    // Resolve the parent category. Sub-category has one real, unambiguous
    // parent (the actual taxonomy relationship, never assumed/hardcoded —
    // Phase 3) so it always wins outright. Brand/Flavor/Size can legitimately
    // span several categories, so the category is only auto-selected when the
    // matching products identify exactly one (Phases 4-6); otherwise the
    // current category is kept if still compatible, or cleared if the new
    // selection makes it contradictory (Phase 7D) — never arbitrarily forced.
    let resolvedCategoryId = categoryId;
    if (key === "subCategoryId") {
      const sub = allSubCategories.find((s) => String(s.id) === val);
      if (sub) resolvedCategoryId = String(sub.categoryId);
    } else {
      const matches = searchFiltered.filter((p) => matchesFilterDim(p, key, val));
      const distinctCats = new Set(matches.map((p) => p.categoryId).filter((id): id is number => id != null));
      if (distinctCats.size === 1) resolvedCategoryId = String(Array.from(distinctCats)[0]);
      else if (categoryId && !distinctCats.has(Number(categoryId))) resolvedCategoryId = "";
    }
    if (resolvedCategoryId !== categoryId) setCategoryId(resolvedCategoryId);

    setFilters((prev) => {
      const next = { ...prev, [key]: val };
      // Reconcile the other active secondary filters against the new
      // selection + resolved category — clear only the ones that no longer
      // have any matching product, leaving unrelated valid selections alone.
      const categoryScoped = resolvedCategoryId
        ? searchFiltered.filter((p) => String(p.categoryId) === resolvedCategoryId)
        : searchFiltered;
      for (const otherKey of SECONDARY_FILTER_DIMS) {
        if (otherKey === key) continue;
        const otherVal = next[otherKey];
        if (!otherVal) continue;
        const stillCompatible = categoryScoped.some((p) => matchesFilterDim(p, key, val) && matchesFilterDim(p, otherKey, otherVal));
        if (!stillCompatible) next[otherKey] = "";
      }
      return next;
    });
  };
  // Resets only the facet filters — kept separate from search on purpose: the
  // category strip's own onSelect calls this while deliberately carrying the
  // current search text over into the new category (see its own call site
  // below), so resetFilters must never clear it.
  const resetFilters = () => setFilters({ subCategoryId: "", brandId: "", flavorId: "", sizeId: "", sortBy: "" });
  // The Reset button (FilterBar) clears everything, including search and the
  // selected category — same "Reset clears search too" behavior as
  // /academy's own Reset. Category was missing here (task: "Coffee Owner
  // Shop: Fix Réinitialiser to Reset All Filters") — resetFilters() alone
  // only clears the FilterBar's own facets, never categoryId, since
  // resetFilters is also reused by the category strip's own onSelect (which
  // must NOT touch categoryId, it just set it) — so the category clear
  // belongs here, not inside resetFilters itself.
  const resetAll = () => { resetFilters(); setSearch(""); setCategoryId(""); };
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
      <ServiceHeroShell
        config={heroConfig}
        defaultBackground={
          /* Background — dark: subtle amber glow | light: amber gradient */
          t.dk ? (
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
          )
        }
        controlsRow={
          /* Top-right controls: Flash Mode only — the duplicated Dark/Light
              toggle is gone, the global navbar theme control is now the single
              source for this page too (still driven by the same isDark below). */
          <div className="relative flex justify-end items-center gap-2 mb-9">
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
          </div>
        }
      >
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-5 backdrop-blur-sm ${H_ALIGN_ICON_MX[heroConfig.horizontalAlign]} ${t.dk ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}>
          <ShoppingBag className={`w-8 h-8 ${t.dk ? "text-amber-400" : "text-white"}`} />
        </div>
        <h1 className={`text-3xl md:text-4xl font-extrabold mb-2 ${t.dk ? "text-white" : "text-white"}`}>
          BigBoss <span className={t.dk ? "text-amber-400" : "text-amber-200"}>SHOP</span>
        </h1>
        {heroConfig.subtitleEnabled && (
          <p className={`text-base mb-4 max-w-xl ${H_ALIGN_ICON_MX[heroConfig.horizontalAlign]} ${t.dk ? "text-white" : "text-amber-100"}`} style={getHeroSubtitleColorStyle(heroConfig, t.dk)}>
            {heroConfig.subtitle ?? "Commandez vos produits professionnels directement auprès de fournisseurs vérifiés."}
          </p>
        )}
        {/* SHOP stats row (Stores/Packs/Products currently available) — same
            "Ligne d'info" toggle as every other service (previously this row
            always rendered unconditionally, ignoring heroConfig.infoRowEnabled —
            fixed so Admin's toggle now actually controls it here too). The
            row's own data/icons are untouched by the toggle, only its
            visibility is. */}
        {heroConfig.infoRowEnabled && (
          <div className={`flex items-center gap-6 flex-wrap text-sm ${H_ALIGN_ROW_JUSTIFY[heroConfig.horizontalAlign]} ${t.dk ? "text-white" : "text-amber-100"}`}>
            <span className="flex items-center gap-1.5" data-testid="text-shop-stat-stores"><Store className="w-4 h-4" />{storesLoading ? "…" : stores.length} magasins</span>
            <span className="flex items-center gap-1.5" data-testid="text-shop-stat-packs"><Package className="w-4 h-4" />{packsLoading ? "…" : packs.length} packs</span>
            <span className="flex items-center gap-1.5" data-testid="text-shop-stat-products"><ShoppingBag className="w-4 h-4" />{isLoading ? "…" : allProducts.length} produits</span>
          </div>
        )}
      </ServiceHeroShell>

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
          onReset={resetAll}
          hasSearchLocation={hasSearchLocation}
          isDark={isDark}
          search={search}
          onSearchChange={setSearch}
          subCategoryIconMap={subCategoryIconMap}
          subCategoryOrderIndex={subCategoryOrderIndex}
          brandOrderIndex={brandOrderIndex}
          flavorOrderIndex={flavorOrderIndex}
          sizeOrderIndex={sizeOrderIndex}
        />
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Stores — Extend SHOP Search to Products, Stores, and Packs: no longer
            hidden while searching; it now self-filters by the same query (see
            its own filteredStores above) and simply renders nothing (existing
            `if (!filteredStores.length) return null`) when nothing matches. */}
        <StoresSection
          stores={stores}
          categoryId={categoryId}
          filters={filters}
          search={search}
          onSelect={(storeId) => navigate(`/stores/${storeId}`)}
          searchLat={searchLat}
          searchLng={searchLng}
          hasSearchLocation={hasSearchLocation}
          isDark={isDark}
        />

        {/* Packs — same change as Stores above. */}
        <PacksSection packs={packs} categoryId={categoryId} filters={filters} search={search} isDark={isDark} />

        {/* Products header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            {categoryId ? (
              <h1 className={`font-bold text-lg ${t.textPrimary}`}>
                {categories.find((c) => String(c.id) === categoryId)?.name ?? "Produits"}
              </h1>
            ) : (
              <h1 className={`font-bold text-lg flex items-center gap-1.5 ${t.textPrimary}`}>
                <ShoppingBag className={`w-4 h-4 ${t.dk ? "text-amber-400" : "text-amber-500"}`} />
                  TOUS LES PRODUITS
              </h1>            )}
            {!isLoading && (
              <p className={`text-sm mt-0.5 ${t.textMuted}`}>
                {filtered.length} produit{filtered.length !== 1 ? "s" : ""} 
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
              <p className={`font-semibold ${t.emptyText}`}>Aucun produit trouvé</p>
              <p className={`text-sm mt-1 ${t.emptySubText}`}>
                {activeFilterCount > 0 ? "Essayez d'ajuster vos filtres." : "Aucun fournisseur n'a encore publié de produits."}
              </p>
            </div>
            {activeFilterCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className={t.dk ? "border-gray-700 text-gray-300 hover:bg-gray-800" : ""}
                onClick={() => { setSearch(""); setCategoryId(""); resetFilters(); navigate("/products"); }}
              >
                Effacer tous les filtres
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
        storeName="BigBossCoffee"
      />
    </div>
  );
}
