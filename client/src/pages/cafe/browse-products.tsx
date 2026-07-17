import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Package, Store, Heart, SlidersHorizontal, RotateCcw, Lock, Navigation, Plus, ShoppingBag, Users, Tag, Layers, Star, MapPin
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useFavorites } from "@/hooks/use-favorites";
import { useStoreFavorites } from "@/hooks/use-store-favorites";
import { calculateDistance, formatDistance } from "@/lib/distance";
import { useSearchLocationStore } from "@/store/search-location-store";
import { useQuickView } from "@/hooks/use-quick-view";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import type { MarketplaceProduct, CategoryWithCount, StoreCard, PackDetail } from "@shared/schema";

// ── Access helper ─────────────────────────────────────────────────────────────

function useCommercialAccess() {
  const { user } = useAuth();
  if (!user) return false;
  if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(user.role)) return true;
  return user.role === 'CAFE_OWNER' && (user as any).status === 'approved';
}

// ── Category Strip ────────────────────────────────────────────────────────────

function CategoryStrip({
  categories,
  selected,
  onSelect,
  visibleCategoryIds,
}: {
  categories: CategoryWithCount[];
  selected: string;
  onSelect: (id: string) => void;
  visibleCategoryIds: Set<number>;
}) {
  // Only show categories that have at least one visible marketplace product
  // (accounts for frozen supplier categories, out-of-stock listings, etc.)
  const active = categories.filter((c) => visibleCategoryIds.has(c.id));
  if (!active.length) return null;
  return (
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1 overflow-x-auto py-3" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => onSelect("")} className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl shrink-0 transition-all text-center min-w-[64px] ${selected === "" ? "bg-blue-600 text-white shadow-sm" : "hover:bg-gray-100 text-gray-600"}`} data-testid="button-cat-all">
            <span className="text-lg">🛍️</span>
            <span className="text-[11px] font-semibold leading-tight">All</span>
          </button>
          {active.map((cat) => (
            <button key={cat.id} onClick={() => onSelect(selected === String(cat.id) ? "" : String(cat.id))} className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl shrink-0 transition-all text-center min-w-[64px] ${selected === String(cat.id) ? "bg-blue-600 text-white shadow-sm" : "hover:bg-gray-100 text-gray-600"}`} data-testid={`button-cat-${cat.id}`}>
              <span className="text-lg">{cat.icon || "📦"}</span>
              <span className="text-[11px] font-semibold leading-tight line-clamp-1 max-w-[60px]">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Supplier Logo Strip ───────────────────────────────────────────────────────

const MAX_LOGOS = 3;

function SupplierLogoStrip({ listings, count }: { listings: { supplierId: number; storeLogoUrl: string | null }[]; count: number }) {
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
              className="w-4 h-4 rounded-full overflow-hidden bg-gray-100 border border-white flex items-center justify-center shrink-0"
              style={{ marginLeft: i > 0 ? -4 : 0 }}
            >
              <img src={l.storeLogoUrl!} alt="" className="w-full h-full object-cover" />
            </div>
          ))
        ) : (
          <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <Store className="w-2.5 h-2.5 text-gray-400" />
          </div>
        )}
      </div>
      <span className="text-[11px] text-gray-400">
        {overflow > 0 ? `+${overflow}` : ""} {count}
      </span>
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product, hasCommercialAccess }: { product: MarketplaceProduct; hasCommercialAccess: boolean }) {
  const faved = useFavorites((s) => !!s.shop[product.id]);
  const toggleShop = useFavorites((s) => s.toggleShop);
  const openQuickView = useQuickView((s) => s.open);
  const searchLocation = useSearchLocationStore((s) => s.searchLocation);

  // Distance from search location to nearest supplier for this product
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
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col cursor-pointer"
      onClick={() => openQuickView(product.id)}
    >
      <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden shrink-0">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-200" /></div>
        )}
        {product.category && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-white/90 text-gray-700 backdrop-blur-sm text-[10px] font-semibold shadow-sm border-0 px-2">{product.category}</Badge>
          </div>
        )}
        {/* Review overlay — bottom left of image */}
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
            className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
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
            <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
          </button>
        )}
        {/* Quick view button */}
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
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        {/* Product name — single line with truncation */}
        <h3 className="font-bold text-sm leading-tight truncate group-hover:text-blue-600 transition-colors">{product.name}</h3>
        {/* Supplier info: multi-logo strip + count + distance */}
        <div className="flex items-center gap-1.5">
          <SupplierLogoStrip listings={product.listings} count={product.supplierCount} />
          {distanceKm !== null && (
            <span className="text-[11px] text-gray-400 flex items-center gap-0.5 ml-auto">
              <MapPin className="w-2.5 h-2.5 shrink-0" />{formatDistance(distanceKm)}
            </span>
          )}
        </div>
        {/* Price section — close to supplier info, no large gap */}
        <div className="mt-auto pt-1.5 border-t border-gray-50">
          {hasCommercialAccess ? (
            <div>
              <p className="text-[10px] text-gray-400">From</p>
              <p className="font-bold text-sm text-blue-600">{product.bestPrice != null ? formatCurrency(product.bestPrice) : "—"}</p>
            </div>
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

// ── Store Card ────────────────────────────────────────────────────────────────

function StoreCardTile({ store, onClick, searchLat, searchLng, hasSearchLocation }: {
  store: StoreCard;
  onClick: () => void;
  searchLat: number | null;
  searchLng: number | null;
  hasSearchLocation: boolean;
}) {
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
      className="group cursor-pointer bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
      onClick={onClick}
    >
      <div className="relative aspect-[16/9] bg-gray-50 overflow-hidden">
        {store.coverUrl ? (
          <img src={store.coverUrl} alt={store.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Store className="w-10 h-10 text-gray-200" /></div>
        )}
        {!store.isOpen && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-gray-900/80 text-white border-0 text-[10px] font-semibold shadow-sm">Closed</Badge>
          </div>
        )}
        <button
          className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            toggleStore(store.id);
          }}
          data-testid={`button-fav-store-${store.id}`}
        >
          <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>
      </div>
      <div className="p-3 flex gap-3 relative z-20">
        <div className="w-11 h-11 rounded-full border-2 border-white -mt-8 bg-white shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
          {store.logoUrl ? (
            <img src={store.logoUrl} alt={store.name} className="w-full h-full object-cover" />
          ) : (
            <Store className="w-4 h-4 text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h3 className="font-bold text-sm leading-tight truncate group-hover:text-blue-600 transition-colors">{store.name}</h3>
          {store.description && <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{store.description}</p>}
          <div className="flex items-center gap-3 text-[11px] text-amber-600 mt-1.5">
            <span className="flex items-center gap-1"><Package className="w-3 h-3" />{store.productCount} product{store.productCount !== 1 ? "s" : ""}</span>
            {distance != null && <span>{formatDistance(distance)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StoresSection({ stores, categoryId, filters, onSelect, searchLat, searchLng, hasSearchLocation }: {
  stores: StoreCard[];
  categoryId: string;
  filters: FilterState;
  onSelect: (storeId: number) => void;
  searchLat: number | null;
  searchLng: number | null;
  hasSearchLocation: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const INITIAL_LIMIT = 5;

  const filteredStores = useMemo(() => {
    // Extra safety: never show stores with no products (server already does this)
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
      {/* Title row with See More / Show Less inline */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-bold text-lg text-gray-900">Marques populaires</h2>
          <p className="text-xs text-gray-400 mt-0.5">{filteredStores.length} store{filteredStores.length !== 1 ? "s" : ""}</p>
        </div>
        {showToggle && (
          <Button
            variant="ghost"
            size="sm"
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-semibold h-8 px-3"
            onClick={() => setExpanded((e) => !e)}
            data-testid="button-toggle-stores"
          >
            {expanded ? "Show Less" : `See More (${filteredStores.length - INITIAL_LIMIT}+)`}
          </Button>
        )}
      </div>

      {expanded ? (
        /* Expanded grid — shows all stores */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredStores.map((store) => (
            <StoreCardTile
              key={store.id}
              store={store}
              onClick={() => onSelect(store.id)}
              searchLat={searchLat}
              searchLng={searchLng}
              hasSearchLocation={hasSearchLocation}
            />
          ))}
        </div>
      ) : (
        /* Collapsed carousel — horizontal scroll */
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
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pack Card ─────────────────────────────────────────────────────────────────

function StarRating({ rating, count }: { rating: number; count: number }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-1">
      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
      <span className="text-[11px] font-medium text-gray-700">{rating.toFixed(1)}</span>
      <span className="text-[10px] text-gray-400">({count})</span>
    </div>
  );
}

function PackCardTile({ pack, hasCommercialAccess }: { pack: PackDetail; hasCommercialAccess: boolean }) {
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
      className="group bg-white rounded-2xl border border-amber-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col cursor-pointer"
      onClick={() => openPackQuickView(pack.id)}
    >
      <div className="relative aspect-[4/3] bg-amber-50 overflow-hidden">
        {pack.imageUrl ? (
          <img src={pack.imageUrl} alt={pack.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Layers className="w-10 h-10 text-amber-200" /></div>
        )}
        {/* Pack badge — top left */}
        <div className="absolute top-2 left-2">
          <Badge className="bg-amber-500 text-white text-[10px] font-semibold shadow-sm border-0 px-2"><Layers className="w-3 h-3 mr-1 inline" />Pack</Badge>
        </div>
        {/* Expiration badge — bottom right, no longer conflicts with favorite */}
        {pack.expirationDate && (
          <div className="absolute bottom-2 right-2">
            <Badge className="bg-orange-500 text-white text-[10px] font-semibold shadow-sm border-0 px-2">
              Exp. {new Date(pack.expirationDate).toLocaleDateString()}
            </Badge>
          </div>
        )}
        {hasCommercialAccess && (
          <button
            className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
            onClick={(e) => { e.stopPropagation(); togglePack(pack.id); }}
            data-testid={`button-fav-pack-${pack.id}`}
          >
            <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
          </button>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-amber-600 transition-colors">{pack.name}</h3>
        {pack.description && <p className="text-xs text-gray-500 line-clamp-1">{pack.description}</p>}

        {/* Brands */}
        {pack.brandLabels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pack.brandLabels.slice(0, 2).map(b => (
              <Badge key={b.id} className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 px-1.5 py-0">{b.name}</Badge>
            ))}
            {pack.brandLabels.length > 2 && <span className="text-[10px] text-gray-400">+{pack.brandLabels.length - 2}</span>}
          </div>
        )}

        {/* Categories */}
        {pack.categoryLabels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pack.categoryLabels.slice(0, 2).map(c => (
              <Badge key={c.id} variant="secondary" className="text-[10px] px-1.5 py-0">{c.name}</Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-0.5">
          <StarRating rating={pack.packAvgRating} count={pack.packReviewCount} />
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            {distance != null && <span>{formatDistance(distance)}</span>}
            <span>{maxQty} dispo.</span>
          </div>
        </div>

        <div className="mt-auto pt-2 border-t border-gray-50">
          {hasCommercialAccess ? (
            <div className="flex items-baseline gap-2">
              <p className="font-bold text-sm text-amber-600">{formatCurrency(pack.price)}</p>
              {individualTotal > pack.price && (
                <p className="text-xs text-gray-400 line-through">{formatCurrency(individualTotal)}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-amber-700 font-medium">
              <Lock className="w-3 h-3 shrink-0" />
              <span>Price for approved owners</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PacksSection({ packs, categoryId, filters }: {
  packs: PackDetail[];
  categoryId: string;
  filters: FilterState;
}) {
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
          <h2 className="font-bold text-lg text-gray-900 flex items-center gap-1.5"><Layers className="w-4 h-4 text-amber-500" />Packs</h2>
          <p className="text-xs text-gray-400 mt-0.5">{filteredPacks.length} pack{filteredPacks.length !== 1 ? "s" : ""}</p>
        </div>
        {showToggle && (
          <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 text-xs font-semibold h-8 px-3" onClick={() => setExpanded((e) => !e)} data-testid="button-toggle-packs">
            {expanded ? "Show Less" : `See More (${filteredPacks.length - INITIAL_LIMIT}+)`}
          </Button>
        )}
      </div>
      {expanded ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredPacks.map((pack) => <PackCardTile key={pack.id} pack={pack} hasCommercialAccess={hasCommercialAccess} />)}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}>
          {filteredPacks.map((pack) => (
            <div key={pack.id} className="shrink-0 w-48 sm:w-56">
              <PackCardTile pack={pack} hasCommercialAccess={hasCommercialAccess} />
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
  categoryProducts,
  filters,
  onChange,
  onReset,
  hasSearchLocation,
}: {
  // Products scoped only to the selected category (not to other active filters).
  // This keeps option lists stable — selecting Brand=X won't remove Brand=Y from the dropdown.
  categoryProducts: MarketplaceProduct[];
  filters: FilterState;
  onChange: (key: keyof FilterState, val: string) => void;
  onReset: () => void;
  hasSearchLocation: boolean;
}) {
  const hasActive = Object.values(filters).some(Boolean);

  // Compute options from category-scoped products so that picking one filter
  // value never collapses the other options in that same filter.
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
    <div className="bg-white border-b border-gray-100 py-2 px-4">
      <div className="max-w-7xl mx-auto flex items-center gap-2 flex-wrap">
        <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        {subCategories.length > 0 && (
          <Select value={filters.subCategoryId || "__all__"} onValueChange={(v) => onChange("subCategoryId", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]"><SelectValue placeholder="Sub-Category" /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">All Sub-Categories</SelectItem>{subCategories.map((sc) => <SelectItem key={sc.id} value={sc.id}>{sc.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {brands.length > 0 && (
          <Select value={filters.brandId || "__all__"} onValueChange={(v) => onChange("brandId", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[100px]"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">All Brands</SelectItem>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {flavors.length > 0 && (
          <Select value={filters.flavorId || "__all__"} onValueChange={(v) => onChange("flavorId", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[100px]"><SelectValue placeholder="Flavor" /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">All Flavors</SelectItem>{flavors.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {sizes.length > 0 && (
          <Select value={filters.sizeId || "__all__"} onValueChange={(v) => onChange("sizeId", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[100px]"><SelectValue placeholder="Size" /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">All Sizes</SelectItem>{sizes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Select value={filters.sortBy || "recommended"} onValueChange={(v) => onChange("sortBy", v === "recommended" ? "" : v)}>
          <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recommended">Recommended</SelectItem>
            <SelectItem value="price_asc">Price: Low to High</SelectItem>
            <SelectItem value="price_desc">Price: High to Low</SelectItem>
            <SelectItem value="suppliers">Most Suppliers</SelectItem>
            {hasSearchLocation && <SelectItem value="nearest"><span className="flex items-center gap-1"><Navigation className="w-3 h-3 inline" /> Nearest First</span></SelectItem>}
          </SelectContent>
        </Select>
        {hasActive && <button onClick={onReset} className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors ml-1"><RotateCcw className="w-3 h-3" /> Reset</button>}
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

  // Derive which category IDs currently have at least one visible marketplace
  // product OR active pack. This accounts for frozen supplier categories,
  // out-of-stock listings, and "Only for Pack" products whose category should
  // still appear whenever a Pack in that category is available.
  const visibleCategoryIds = useMemo(() => {
    const ids = new Set<number>();
    allProducts.forEach((p) => {
      if (p.categoryId != null) ids.add(p.categoryId);
    });
    // Also include categories that have available packs, so "Only for Pack"
    // products don't cause their category to disappear from the strip.
    packs.forEach((p) => {
      p.categoryIds.forEach((id) => ids.add(id));
    });
    return ids;
  }, [allProducts, packs]);

  // Products scoped to the selected category (and text search) but NOT filtered
  // by brand/subcategory/flavor/size. These are used to build the filter option
  // lists so that selecting one filter value never removes other options from
  // that same filter.
  const categoryFiltered = useMemo(() => {
    let list = allProducts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q));
    }
    if (categoryId) list = list.filter((p) => String(p.categoryId) === categoryId);
    return list;
  }, [allProducts, search, categoryId]);

  // Fully filtered product list used for the product grid.
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
    <div className="min-h-screen bg-gray-50">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-16 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600" />
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
            <ShoppingBag className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
            BigBoss <span className="text-amber-200">SHOP</span>
          </h1>
          <p className="text-amber-100 text-lg mb-2 max-w-xl mx-auto">
            Commandez vos produits professionnels directement auprès de fournisseurs vérifiés.
          </p>
        </div>
      </section>

      <div className="sticky top-14 z-30">
        <CategoryStrip
          categories={categories}
          selected={categoryId}
          visibleCategoryIds={visibleCategoryIds}
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
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {!search.trim() && (
          <StoresSection
            stores={stores}
            categoryId={categoryId}
            filters={filters}
            onSelect={(storeId) => navigate(`/stores/${storeId}`)}
            searchLat={searchLat}
            searchLng={searchLng}
            hasSearchLocation={hasSearchLocation}
          />
        )}

        {!search.trim() && (
          <PacksSection packs={packs} categoryId={categoryId} filters={filters} />
        )}

        <div className="flex items-center justify-between mb-4">
          <div>
            {categoryId ? (
              <h1 className="font-bold text-lg text-gray-900">{categories.find((c) => String(c.id) === categoryId)?.name ?? "Products"}</h1>
            ) : (
              <h1 className="font-bold text-lg text-gray-900">All Products</h1>
            )}
            {!isLoading && <p className="text-sm text-gray-400 mt-0.5">{filtered.length} product{filtered.length !== 1 ? "s" : ""} available</p>}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Package className="w-14 h-14 text-gray-200" />
            <div><p className="font-semibold text-gray-700">No products found</p><p className="text-sm text-gray-400 mt-1">{activeFilterCount > 0 ? "Try adjusting your filters." : "Suppliers haven't listed any products yet."}</p></div>
            {activeFilterCount > 0 && <Button size="sm" variant="outline" onClick={() => { setSearch(""); setCategoryId(""); resetFilters(); navigate("/products"); }}>Clear all filters</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                hasCommercialAccess={hasCommercialAccess}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
