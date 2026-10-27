import { useState, useMemo, useEffect, useRef } from "react";
import { useThemeStore } from "@/store/theme-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewModal } from "@/components/review-modal";
import { AvailabilityModal } from "@/components/shared/availability-modal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Package, Store, Heart, SlidersHorizontal, RotateCcw, Lock,
  ChevronLeft, MapPin, Plus, Info, Star, Music, Zap, Layers,
  Search,
} from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useFavorites } from "@/hooks/use-favorites";
import { useStoreFavorites } from "@/hooks/use-store-favorites";
import { calculateDistance, formatDistance } from "@/lib/distance";
import { useCoverZoomStyle, getAdjustmentFor } from "@/lib/image-adjustment";
import { useSearchLocationStore } from "@/store/search-location-store";
import { useQuickView } from "@/hooks/use-quick-view";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import { useStoreNav } from "@/hooks/use-store-nav";
import { useItemNav } from "@/hooks/use-item-nav";
import { ItemNavButtons } from "@/components/shared/item-nav-buttons";
import { FlashMode } from "@/components/flash-mode";
import { PackCardTile } from "@/pages/cafe/browse-products";
import type { StoreDetail, ProductWithTaxonomy, OpeningHoursMap, PackDetail, CategoryWithCount, ListingPromotion, SubCategoryWithDetails, BrandWithCount, FlavorWithCount, SizeWithCount, SupplierProductReview } from "@shared/schema";

// ── Supplier Reviews modal — renders the shared Avis modal
// (client/src/components/review-modal.tsx, task: "Extend the Shared Avis
// Modal Across Store, Barista, and Maintenance") instead of ReviewsModal +
// a local form. Reuses the exact same /api/reviews/supplier-public/:supplierId
// query and POST /api/reviews (reviewType: SUPPLIER) mutation as before — no
// new endpoint, no new data source, only the presentation shell changed.
function SupplierReviewsModal({ open, onClose, supplierId, supplierName, isDark }: {
  open: boolean;
  onClose: () => void;
  supplierId: number;
  supplierName: string;
  isDark: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const canReview = user?.role === "CAFE_OWNER" && (user as any).status === "approved";

  const { data: reviews = [] } = useQuery<SupplierProductReview[]>({
    queryKey: ["/api/reviews/supplier-public", supplierId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/supplier-public/${supplierId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open && !!supplierId,
  });

  const myReview = user ? reviews.find(r => r.cafeId === user.id) : undefined;

  const submit = useMutation({
    mutationFn: ({ rating, comment }: { rating: number; comment: string }) =>
      apiRequest("POST", "/api/reviews", { reviewType: "SUPPLIER", supplierId, rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/reviews/supplier-public", supplierId] });
    },
  });

  const reviewRows = useMemo(() => reviews.map(r => ({
    id: r.id,
    cafeId: r.cafeId,
    cafeOwnerName: r.cafeOwnerName,
    cafeName: r.cafeName,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
  })), [reviews]);

  return (
    <ReviewModal
      open={open}
      onClose={onClose}
      targetName={supplierName}
      reviewTypeLabel="Avis sur le fournisseur"
      existingReviews={reviewRows}
      myReview={myReview ? { rating: myReview.rating, comment: myReview.comment } : null}
      onSubmit={async (rating, comment) => { await submit.mutateAsync({ rating, comment }); }}
      isSubmitting={submit.isPending}
      canReview={canReview}
    />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useCommercialAccess() {
  const { user } = useAuth();
  if (!user) return false;
  if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(user.role)) return true;
  return user.role === 'CAFE_OWNER' && (user as any).status === 'approved';
}

// ── Theme tokens helper (identical to browse-products) ────────────────────────

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
    headerCard:       dk ? "bg-gray-900/80 border-gray-800"       : "bg-white/90 border-gray-100",
    metaAccent:       dk ? "text-amber-400"                       : "text-amber-600",
    // Add Product and Pack Search to Individual Store Pages — same token
    // (identical values) as /products' own `inputBg`.
    inputBg:          dk ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
  };
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

export function CoverSlideshow({ urls, name }: { urls: string[]; name: string }) {
  const [idx, setIdx] = useState(0);
  const active = urls.filter(Boolean);
  useEffect(() => {
    if (active.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % active.length), 3500);
    return () => clearInterval(t);
  }, [active.length]);
  if (!active.length) return <div className="w-full h-full flex items-center justify-center"><Store className="w-14 h-14 text-gray-400" /></div>;
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

export function MusicPlayer({ musicUrl }: { musicUrl: string }) {
  const embedUrl = useMemo(() => {
    if (!musicUrl) return null;
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

export function InfoModal({ open, onClose, openingHours, storeName }: {
  open: boolean;
  onClose: () => void;
  openingHours: OpeningHoursMap | null;
  storeName: string;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);

  // Now the shared Disponibilité modal (reference: client/src/components/
  // marketing/marketing-detail-modal.tsx's MarketingAvailabilityModal,
  // extracted to client/src/components/shared/availability-modal.tsx), kept
  // under this name/signature so the call site below needs no changes.
  // This page is English throughout (unlike the other sections' French
  // copy), so its existing English day list/labels are passed explicitly
  // rather than the shared component's French defaults. The dark/light
  // toggle previously built into this modal's header is preserved via
  // onToggleTheme — the one functional (not just visual) capability this
  // modal has that the other sections' availability modals don't.
  return (
    <AvailabilityModal
      open={open}
      onClose={onClose}
      targetName={storeName}
      weeklyHours={openingHours}
      isDark={isDark}
      onToggleTheme={toggle}
      dayDefs={DAYS}
      subtitleLabel="Opening Hours"
      todayLabel="Today"
      closedLabel="Closed"
      noScheduleTitle="No schedule set"
      noScheduleHint="This store hasn't configured opening hours yet."
    />
  );
}

function StorePacksSection({ filteredPacks: filtered, hasCommercialAccess, isDark }: {
  // Already filtered by the caller (StoreDetailPage) — sub-category, brand,
  // and search, exactly as this component computed internally before
  // (logic moved verbatim, not duplicated) — lifted up so StoreDetailPage
  // can also feed the same list into usePackQuickView's navIds (task: "Fix
  // Product Navigation Flicker and Add Filter-Aware Navigation to Store
  // Detail Modals").
  filteredPacks: PackDetail[];
  hasCommercialAccess: boolean;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const [expanded, setExpanded] = useState(false);
  const INITIAL_LIMIT = 5;
  const navIds = useMemo(() => filtered.map((p) => p.id), [filtered]);

  if (!filtered.length) return null;
  const showToggle = filtered.length > INITIAL_LIMIT;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className={`font-bold text-lg flex items-center gap-1.5 ${t.textPrimary}`}>
            <Layers className={`w-4 h-4 ${t.dk ? "text-amber-400" : "text-amber-500"}`} />Packs
          </h2>
          <p className={`text-xs mt-0.5 ${t.textMuted}`}>
            {filtered.length} pack{filtered.length !== 1 ? "s" : ""} available
          </p>
        </div>
        {showToggle && (
          <Button
            variant="outline"
            size="sm"
            className={`text-xs font-semibold h-8 px-3 ${t.sectionBtnPack}`}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Afficher Moins" : `Voir Plus (${filtered.length - INITIAL_LIMIT}+)`}
          </Button>
        )}
      </div>
      {expanded ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((pack) => (
            <PackCardTile key={pack.id} pack={pack} hasCommercialAccess={hasCommercialAccess} isDark={isDark} navIds={navIds} />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}>
          {filtered.map((pack) => (
            <div key={pack.id} className="shrink-0 w-52 sm:w-60">
              <PackCardTile pack={pack} hasCommercialAccess={hasCommercialAccess} isDark={isDark} navIds={navIds} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Supplier logo strip (single-store context) ────────────────────────────────

function SingleStoreLogoStrip({ logoUrl, name, isDark }: { logoUrl: string | null; name: string; isDark: boolean }) {
  const t = useTheme(isDark);
  return (
    <div className="flex items-center gap-1">
      <div className={`w-4 h-4 rounded-full overflow-hidden border flex items-center justify-center shrink-0 ${t.storeLogo}`}>
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <Store className={`w-2.5 h-2.5 ${t.textMuted}`} />
        )}
      </div>
      <span className={`text-[11px] ${t.textMuted}`}>1</span>
    </div>
  );
}

// ── Promo price helpers (store context) ───────────────────────────────────────

const STORE_PRICE_PROMO_TYPES = new Set([
  'PERCENTAGE', 'FIXED_AMOUNT', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER',
]);

function calcStorePromoPrice(basePrice: number, promo: { type: string; discountValue: number }): number | null {
  if (['PERCENTAGE', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER'].includes(promo.type)) {
    return Math.max(0, Math.round(basePrice * (1 - promo.discountValue / 10000)));
  }
  if (promo.type === 'FIXED_AMOUNT') {
    return Math.max(0, basePrice - Math.round(promo.discountValue / 10));
  }
  return null;
}

function bestStorePromoPrice(basePrice: number, promos: { type: string; discountValue: number }[]): number | null {
  const eligible = promos.filter(p => STORE_PRICE_PROMO_TYPES.has(p.type));
  if (!eligible.length) return null;
  const pct = eligible.filter(p => ['PERCENTAGE', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER'].includes(p.type));
  const best = pct.length
    ? pct.reduce((b, p) => p.discountValue > b.discountValue ? p : b, pct[0])
    : eligible.reduce((b, p) => p.discountValue > b.discountValue ? p : b, eligible[0]);
  return calcStorePromoPrice(basePrice, best);
}

// ── Product card (store context) ──────────────────────────────────────────────

type StoreProduct = ProductWithTaxonomy & {
  bestPrice?: number;
  avgRating?: number;
  reviewCount?: number;
  hasPromo?: boolean;
  listingPromotions?: { type: string; discountValue: number }[];
};

function StoreProductCard({
  product,
  hasCommercialAccess,
  storeLogoUrl,
  storeName,
  supplierId,
  distanceKm,
  isDark,
  navIds,
}: {
  product: StoreProduct;
  hasCommercialAccess: boolean;
  storeLogoUrl: string | null;
  storeName: string;
  supplierId: number;
  distanceKm: number | null;
  isDark: boolean;
  // The store page's own current filtered product-ID list (task: "Fix
  // Product Navigation Flicker and Add Filter-Aware Navigation to Store
  // Detail Modals") — passed straight through to the quick-view store on
  // open so Previous/Next stays within this store, respecting active
  // filters, exactly like the Shop page.
  navIds: number[];
}) {
  const t = useTheme(isDark);
  const fmt = useFormatCurrency();
  const faved = useFavorites((s) => !!s.shop[product.id]);
  const toggleShop = useFavorites((s) => s.toggleShop);
  const openQuickView = useQuickView((s) => s.open);

  const avgRating = product.avgRating ?? 0;
  const reviewCount = product.reviewCount ?? 0;
  const hasReviews = hasCommercialAccess && reviewCount > 0;
  const adjustPct = getAdjustmentFor(product.imageAdjustments, product.imageUrl);
  const { wrapperStyle: cropWrapperStyle } = useCoverZoomStyle(adjustPct);

  return (
    <div
      data-testid={`card-product-${product.id}`}
      className={`group border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-xl hover:-translate-y-0.5 ${t.cardBg}`}
      onClick={() => openQuickView(product.id, supplierId, navIds)}
    >
      {/* Image */}
      <div className={`relative aspect-[4/3] overflow-hidden shrink-0 ${t.imageOverlay}`}>
        {product.imageUrl ? (
          <div style={cropWrapperStyle}>
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className={`w-10 h-10 ${t.emptyIcon}`} />
          </div>
        )}
        {/* On Sale badge — same placement and treatment as the Shop card */}
        {product.hasPromo && (
          <div className="absolute top-2 left-2">
            <span className="bg-rose-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Zap className="w-2.5 h-2.5" />On Sale
            </span>
          </div>
        )}
        {/* Rating — bottom-left image overlay, as in Shop */}
        {hasReviews && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-1.5 py-0.5 shadow-sm">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="text-[10px] font-medium text-white">{avgRating.toFixed(1)}</span>
            <span className="text-[10px] text-white/80">({reviewCount})</span>
          </div>
        )}
        {/* Favorite button — top-right, as in Shop */}
        {hasCommercialAccess && (
          <button
            className="absolute top-2 right-2 w-7 h-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              toggleShop({
                id: product.id,
                name: product.name,
                supplier: storeName,
                price: product.bestPrice ?? 0,
                image: product.imageUrl ?? "",
              });
            }}
            data-testid={`button-fav-${product.id}`}
          >
            <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white/80"}`} />
          </button>
        )}
        {/* Quick-add button — bottom-right, as in Shop */}
        <button
          className="absolute bottom-2 right-2 w-7 h-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            openQuickView(product.id, supplierId, navIds);
          }}
          data-testid={`button-quick-view-${product.id}`}
        >
          <Plus className="w-3.5 h-3.5 text-white/80" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight truncate transition-colors ${t.dk ? "text-white group-hover:text-blue-400" : "text-gray-900 group-hover:text-blue-600"}`}>
          {product.name}
        </h3>
        
        {/* Category • Brand badge — same design and truncation as Shop */}
        {(product.categoryLabel?.name || product.brandLabel?.name) && (
          <Badge
            className={`w-full min-w-0 text-[10px] px-1.5 py-0 border ${
              t.dk
                ? "bg-gray-700 text-rose-500 border-gray-600"
                : "bg-gray-100 text-gray-600 border-gray-200"
            }`}
          >
            <span className="block min-w-0 truncate">
              {product.categoryLabel?.name && (
                <span className={`mr-0.5 ${t.textPrimary}`}>
                  {product.categoryLabel.name} •
                </span>
              )}
              {product.brandLabel?.name}
            </span>
          </Badge>
        )}
        <div className={`mt-auto pt-1.5 border-t ${t.priceBorder}`}>
  <div className="flex items-center justify-between gap-2">
    {/* Price */}
    {(() => {
      const discounted = product.bestPrice != null && (product.listingPromotions?.length ?? 0) > 0
        ? bestStorePromoPrice(product.bestPrice, product.listingPromotions ?? [])
        : null;
      return (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`font-bold text-sm ${t.textPrice}`}>
            {discounted != null ? fmt(discounted) : product.bestPrice != null ? fmt(product.bestPrice) : "—"}
          </span>
          {discounted != null && discounted < product.bestPrice! && (
            <span className={`text-xs line-through whitespace-nowrap ${t.textMuted}`}>
              {fmt(product.bestPrice!)}
            </span>
          )}
        </div>
      );
    })()}

    {/* Distance */}
    {distanceKm !== null && (
      <span
        className={`text-[11px] flex items-center gap-0.5 shrink-0 ${t.textMuted}`}
      >
        <MapPin className="w-2.5 h-2.5" />
        {formatDistance(distanceKm)}
      </span>
    )}
  </div>
</div>
      </div>
    </div>
  );
}

// ── Filter state ──────────────────────────────────────────────────────────────

interface FilterState { subCategoryId: string; brandId: string; flavorId: string; sizeId: string; sortBy: string; }

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

  // Previous/Next Store navigation — browses the Shop's own currently
  // filtered Stores list (navIds), kept live-synced by browse-products.tsx
  // (task: "Synchronize Detail Modal Image Carousels and Add Filter-Aware
  // Store Navigation"). Null when the Store Page was opened directly, not
  // from the Shop — both buttons simply stay hidden rather than guessing,
  // same convention as the Pack/Product nav buttons. Navigating to another
  // store is a real route change (this page is a real route, not a global
  // singleton modal), using the exact same navigate() the Shop's own Store
  // card click already uses.
  const storeNavIds = useStoreNav((s) => s.navIds);
  const { prevId: prevStoreId, nextId: nextStoreId, hasNav: hasStoreNav } = useItemNav(
    storeId ? Number(storeId) : null,
    storeNavIds ?? [],
  );

  // ── Dark / light mode (dark by default — matches Favorites modal + /products page) ──
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);

  const [categoryId, setCategoryId] = useState("");
  const [filters, setFilters] = useState<FilterState>({ subCategoryId: "", brandId: "", flavorId: "", sizeId: "", sortBy: "" });
  // Add Product and Pack Search to Individual Store Pages — same pattern as
  // /products' own `search` state, scoped here to this store's own products/
  // packs (store?.products / storePacks below are already fetched for just
  // this storeId, so no extra scoping is needed for the match itself).
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [supplierReviewsOpen, setSupplierReviewsOpen] = useState(false);
  const [flashOpen, setFlashOpen] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(true);

  // Scroll to top whenever a store is opened
  useEffect(() => { window.scrollTo(0, 0); }, [storeId]);

  const { data: store, isLoading } = useQuery<StoreDetail>({
    queryKey: ["/api/stores", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/stores/${storeId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!storeId,
  });

  const { data: storePacks = [] } = useQuery<PackDetail[]>({
    queryKey: ["/api/stores", storeId, "packs"],
    queryFn: async () => {
      const res = await fetch(`/api/stores/${storeId}/packs`);
      if (!res.ok) return [];
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

  const listingIds = useMemo(
    () => products.map((product) => (product as any).listingId).filter((id): id is number => typeof id === "number"),
    [products],
  );
  const { data: listingPromotions = [] } = useQuery<ListingPromotion[]>({
    queryKey: ["/api/marketplace/promotions", listingIds.join(",")],
    queryFn: async () => {
      if (!listingIds.length) return [];
      const res = await fetch(`/api/marketplace/promotions?listingIds=${listingIds.join(",")}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: listingIds.length > 0,
  });
  const flashProducts = useMemo(() => {
    const promotedListings = new Set(listingPromotions.map((promo) => promo.listingId));
    return products.map((product) => ({
      ...product,
      hasPromo: typeof (product as any).listingId === "number"
        ? promotedListings.has((product as any).listingId)
        : false,
    }));
  }, [products, listingPromotions]);

  const { data: allCategories = [] } = useQuery<CategoryWithCount[]>({
    queryKey: ["/api/categories"],
  });

  const categoryIconMap = useMemo(() => {
    const map = new Map<number, string>();
    allCategories.forEach((c) => { if (c.icon) map.set(c.id, c.icon); });
    return map;
  }, [allCategories]);

  // Admin-configured ordering (task: "Synchronize Category, Subcategory,
  // Flavor, Size, and Brand Ordering Across the Coffee Owner Shop") — id →
  // rank in Admin's own configured order (allCategories/allSubCategories are
  // already sorted server-side by displayOrder, see
  // server/storage.ts getCategories/getSubCategories/getFlavors/getSizes/
  // getBrands). An id with no entry (no persisted order, or deleted/renamed
  // since) falls to the end, deterministically, without disturbing the
  // relative order of every explicitly-ordered option.
  const categoryOrderIndex = useMemo(() => new Map(allCategories.map((c, i) => [c.id, i])), [allCategories]);
  const rankOf = (orderIndex: Map<number, number>, id: string): number => orderIndex.get(Number(id)) ?? Number.MAX_SAFE_INTEGER;

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.categoryLabel?.id && p.categoryLabel?.name) map.set(String(p.categoryLabel.id), p.categoryLabel.name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({
        id,
        name,
        icon: categoryIconMap.get(Number(id)) ?? null,
      }))
      .sort((a, b) => rankOf(categoryOrderIndex, a.id) - rankOf(categoryOrderIndex, b.id));
  }, [products, categoryIconMap, categoryOrderIndex]);

  const categoryFiltered = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q));
    }
    if (categoryId) list = list.filter((p) => String(p.categoryId) === categoryId);
    return list;
  }, [products, search, categoryId]);

  // Subcategory icons (task: "Match Shop Store Subcategory Icons With the
  // Products Page") — p.subCategoryLabel only carries {id, name} (icon
  // stripped server-side), so the icon is resolved the same way /products
  // (browse-products.tsx) already does: a separate query for the full
  // admin-managed records, reduced to an id→icon map. Reused here instead of
  // a second/conflicting icon source.
  const { data: allSubCategories = [] } = useQuery<SubCategoryWithDetails[]>({ queryKey: ["/api/subcategories"] });
  const subCategoryIconMap = useMemo(() => {
    const map = new Map<number, string>();
    allSubCategories.forEach((sc) => { if (sc.icon) map.set(sc.id, sc.icon); });
    return map;
  }, [allSubCategories]);
  const subCategoryOrderIndex = useMemo(() => new Map(allSubCategories.map((s, i) => [s.id, i])), [allSubCategories]);

  // Same ordering fix as subcategories above, for Marques/Saveurs/Tailles —
  // these 3 weren't previously fetched at all (brand/flavor/size names came
  // purely from product iteration), so one lightweight query per entity is
  // added here, same public/already-admin-sorted endpoints /products itself
  // now also reads from.
  const { data: allBrands = [] } = useQuery<BrandWithCount[]>({ queryKey: ["/api/brands"] });
  const { data: allFlavors = [] } = useQuery<FlavorWithCount[]>({ queryKey: ["/api/flavors"] });
  const { data: allSizes = [] } = useQuery<SizeWithCount[]>({ queryKey: ["/api/sizes"] });
  const brandOrderIndex = useMemo(() => new Map(allBrands.map((b, i) => [b.id, i])), [allBrands]);
  const flavorOrderIndex = useMemo(() => new Map(allFlavors.map((f, i) => [f.id, i])), [allFlavors]);
  const sizeOrderIndex = useMemo(() => new Map(allSizes.map((s, i) => [s.id, i])), [allSizes]);

  const subCategories = useMemo(() => {
    const map = new Map<string, string>();
    categoryFiltered.forEach((p) => {
      if (p.subCategoryLabel?.id && p.subCategoryLabel?.name) map.set(String(p.subCategoryLabel.id), p.subCategoryLabel.name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name, icon: subCategoryIconMap.get(Number(id)) ?? null }))
      .sort((a, b) => rankOf(subCategoryOrderIndex, a.id) - rankOf(subCategoryOrderIndex, b.id));
  }, [categoryFiltered, subCategoryIconMap, subCategoryOrderIndex]);

  const brands = useMemo(() => {
    const map = new Map<string, string>();
    categoryFiltered.forEach((p) => {
      if (p.brandLabel?.id && p.brandLabel?.name) map.set(String(p.brandLabel.id), p.brandLabel.name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => rankOf(brandOrderIndex, a.id) - rankOf(brandOrderIndex, b.id));
  }, [categoryFiltered, brandOrderIndex]);

  // Flavor/size filters (task: "Complete Store Page Filters") — same derivation
  // pattern as subCategories/brands above, from the same real flavorLabels/
  // sizeLabels fields the reference /products FilterBar already uses.
  const flavors = useMemo(() => {
    const map = new Map<string, string>();
    categoryFiltered.forEach((p) => {
      (p.flavorLabels ?? []).forEach((fl) => { if (fl.id && fl.name) map.set(String(fl.id), fl.name); });
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => rankOf(flavorOrderIndex, a.id) - rankOf(flavorOrderIndex, b.id));
  }, [categoryFiltered, flavorOrderIndex]);

  const sizes = useMemo(() => {
    const map = new Map<string, string>();
    categoryFiltered.forEach((p) => {
      (p.sizeLabels ?? []).forEach((sl) => { if (sl.id && sl.name) map.set(String(sl.id), sl.name); });
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => rankOf(sizeOrderIndex, a.id) - rankOf(sizeOrderIndex, b.id));
  }, [categoryFiltered, sizeOrderIndex]);

  const filtered = useMemo(() => {
    let list = categoryFiltered;
    if (filters.subCategoryId) list = list.filter((p) => String(p.subCategoryId) === filters.subCategoryId);
    if (filters.brandId) list = list.filter((p) => p.brandLabel && String(p.brandLabel.id) === filters.brandId);
    if (filters.flavorId) list = list.filter((p) => (p.flavorLabels ?? []).some((fl) => String(fl.id) === filters.flavorId));
    if (filters.sizeId) list = list.filter((p) => (p.sizeLabels ?? []).some((sl) => String(sl.id) === filters.sizeId));
    // Single-store page — "most suppliers"/"nearest" sort options from the
    // multi-supplier reference page don't apply here (every item belongs to
    // this same store), so only price sort is offered, same bestPrice field.
    if (filters.sortBy === "price_asc") list = [...list].sort((a, b) => ((a as any).bestPrice ?? Infinity) - ((b as any).bestPrice ?? Infinity));
    if (filters.sortBy === "price_desc") list = [...list].sort((a, b) => ((b as any).bestPrice ?? 0) - ((a as any).bestPrice ?? 0));
    return list;
  }, [categoryFiltered, filters]);

  // ── Filtered packs — same filter logic StorePacksSection used to compute
  // internally, lifted up verbatim (not duplicated) so this page can also
  // feed the same ordered ID list into usePackQuickView's navIds (task:
  // "Fix Product Navigation Flicker and Add Filter-Aware Navigation to
  // Store Detail Modals"). Packs have no sortBy dimension on this page —
  // unchanged, they never did.
  const filteredPacks = useMemo(() => {
    let list = storePacks;
    // Packs carry a plural categoryIds array (a pack can bundle products
    // from more than one category), unlike a product's singular
    // categoryId used by categoryFiltered above — this check was missing
    // entirely here, so selecting a category never affected the displayed
    // packs (task: "Fix Store-Page Pack Category Filtering"). Same
    // convention already used by the Shop's own pack filter
    // (browse-products.tsx).
    if (categoryId) list = list.filter((p) => p.categoryIds.includes(Number(categoryId)));
    if (filters.subCategoryId) list = list.filter((p) => p.subCategoryIds.includes(Number(filters.subCategoryId)));
    if (filters.brandId) list = list.filter((p) => p.brandIds.includes(Number(filters.brandId)));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.items.some((item) => item.productName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [storePacks, categoryId, filters.subCategoryId, filters.brandId, search]);

  // ── Previous/Next Product navigation — keep both quick-view stores'
  // navIds in sync with this store page's own live-filtered lists, so
  // changing a filter while a detail modal is open updates the navigation
  // dataset instead of leaving it stale, exactly like the Shop page (task:
  // "Fix Product Navigation Flicker and Add Filter-Aware Navigation to
  // Store Detail Modals"). Products/packs here are already scoped to this
  // store server-side, so navigation never crosses into another store.
  const productNavIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const packNavIds = useMemo(() => filteredPacks.map((p) => p.id), [filteredPacks]);
  const setProductNavIds = useQuickView((s) => s.setNavIds);
  const setPackNavIds = usePackQuickView((s) => s.setNavIds);
  useEffect(() => { setProductNavIds(productNavIds); }, [productNavIds, setProductNavIds]);
  useEffect(() => { setPackNavIds(packNavIds); }, [packNavIds, setPackNavIds]);

  const updateFilter = (key: keyof FilterState, val: string) => setFilters((p) => ({ ...p, [key]: val }));
  // No category-switch handler on this page preserves search across a
  // reset the way /products'/print's do (the category chips here just call
  // setCategoryId directly), so Reset can safely clear search too — matching
  // the one existing resetFilters used by both the filter bar's own Reset and
  // the empty-state "reset" button.
  const resetFilters = () => { setFilters({ subCategoryId: "", brandId: "", flavorId: "", sizeId: "", sortBy: "" }); setCategoryId(""); setSearch(""); };
  const hasActive = !!categoryId || !!search || Object.values(filters).some(Boolean);

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

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
        <div className={`h-64 w-full animate-pulse ${t.skeletonBg}`} />
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className={`h-56 rounded-2xl animate-pulse ${t.skeletonBg}`} />
          ))}
        </div>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (!store) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${t.pageBg} flex flex-col items-center justify-center py-24 gap-4 text-center`}>
        <Store className={`w-14 h-14 ${t.emptyIcon}`} />
        <div>
          <p className={`font-semibold ${t.emptyText}`}>Store not found</p>
          <p className={`text-sm mt-1 ${t.emptySubText}`}>This store may no longer be available.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className={t.dk ? "border-gray-700 text-gray-300 hover:bg-gray-800" : ""}
          onClick={() => navigate("/products")}
        >
          Back to Marketplace
        </Button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      {/* Background music — unmount iframe to stop playback when muted */}
      {musicUrl && isMusicPlaying && <MusicPlayer musicUrl={musicUrl} />}

      {/* ── Cover media ──────────────────────────────────────────────────── */}
      <div className="relative h-64 sm:h-72 lg:h-80 overflow-hidden bg-gray-900">
        {mediaType === "VIDEO" && videoUrl ? (
          <video src={videoUrl} className="w-full h-full object-cover object-center" autoPlay muted loop playsInline />
        ) : (
          <CoverSlideshow urls={coverUrls} name={store.name} />
        )}

        {/* Subtle dark gradient overlay at the bottom for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

        {/* Back button — top left */}
        <button
          className="absolute top-4 left-4 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform z-10"
          onClick={() => navigate("/products")}
          data-testid="button-back-marketplace"
        >
          <ChevronLeft className="w-4.5 h-4.5 text-white" />
        </button>

         {/* Top-right cluster: Flash + Favorite (task: "Hero Theme Toggle Cleanup" —
             the redundant Dark/Light toggle that used to be here was removed; the
             navbar's own toggle, calling the same useThemeStore, remains the single
             theme control for this page). */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => toggleStore(store.id)}
            data-testid="button-fav-store"
          >
            <Heart className={`w-4 h-4 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white/80"}`} />
          </button>
          {(products.length > 0 || storePacks.length > 0) && (
            <button
              className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
              onClick={() => setFlashOpen(true)}
              data-testid="button-flash-mode"
              title="Flash Mode — browse products"
            >
              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
            </button>
          )}
        </div>

        {/* Reviews + Info — bottom right */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
          {reviewCount > 0 && (
            <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="text-xs font-bold text-white">{avgRating.toFixed(1)}</span>
              <span className="text-[10px] text-white/70">({reviewCount})</span>
            </div>
          )}
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setSupplierReviewsOpen(true)}
            data-testid="button-store-reviews"
            title="Supplier reviews"
          >
            <Star className="w-4 h-4 text-white/80" />
          </button>
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setInfoOpen(true)}
            data-testid="button-store-info"
            title="Store information & opening hours"
          >
            <Info className="w-4 h-4 text-white/80" />
          </button>
        </div>

        {/* Closed badge */}
        {!store.isOpen && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <Badge className="bg-gray-900/80 text-white border-0 text-xs font-semibold shadow-sm">Closed</Badge>
          </div>
        )}
      </div>

      {/* ── Store header info ─────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 relative z-20">
        {/* Logo card — overlapping the cover */}
        <div className="flex items-end gap-4 -mt-8">
          <div className={`w-16 h-16 rounded-2xl border-4 shadow-lg overflow-hidden shrink-0 flex items-center justify-center transition-colors ${t.dk ? "border-gray-900 bg-gray-800" : "border-gray-50 bg-white"}`}>
            {store.logoUrl ? (
              <img src={store.logoUrl} alt={store.name} className="w-full h-full object-cover" />
            ) : (
              <Store className={`w-7 h-7 ${t.textMuted}`} />
            )}
          </div>
          <div className="relative top-4 min-w-0 flex-1 mt-2">
            <div className="flex items-start justify-between gap-x-3 gap-y-1 mt-4">
              <h1
                className={`font-extrabold text-xl leading-tight break-words min-w-0 ${t.textPrimary}`}
                data-testid="text-store-name"
              >
                {store.name}
              </h1>
              {hasStoreNav && (
                <ItemNavButtons
                  isDark={isDark}
                  canPrev={prevStoreId != null}
                  canNext={nextStoreId != null}
                  onPrev={() => prevStoreId != null && navigate(`/stores/${prevStoreId}`)}
                  onNext={() => nextStoreId != null && navigate(`/stores/${nextStoreId}`)}
                  prevLabel="Store précédent"
                  nextLabel="Store suivant"
                  prevTestId="button-store-nav-prev"
                  nextTestId="button-store-nav-next"
                />
              )}
            </div>
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 ${t.metaAccent}`}>
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />{store.productCount} products
              </span>
              {distance != null && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{formatDistance(distance)}
                </span>
              )}
              {musicUrl && (
                <button
                  onClick={() => setIsMusicPlaying((p) => !p)}
                  className={`flex items-center gap-1 rounded-full transition-opacity hover:opacity-80 ${t.dk ? "text-indigo-400" : "text-indigo-500"}`}
                  title={isMusicPlaying ? "Mute music" : "Play music"}
                  data-testid="button-music-toggle"
                >
                  <Music className={`w-3 h-3 ${isMusicPlaying ? "" : "opacity-40"}`} />
                  <span>{isMusicPlaying ? "Music" : "Muted"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
        {store.description && (
  <p
    className={`text-sm mt-6 ml-20 line-clamp-1 break-words ${t.textMuted}`}
  >
    {store.description}
  </p>
)}
      </div>

      {/* ── Category + Filter bar — sticky ──────────────────────────────── */}
      {/* Add Product and Pack Search to Individual Store Pages — also shows
          whenever there's at least one product to search, even if this store
          happens to have no category/sub-category/brand taxonomy at all. */}
      {(categories.length > 0 || subCategories.length > 0 || brands.length > 0 || products.length > 0) && (
        <div className={`sticky top-14 z-30 border-b mt-4 transition-colors ${t.filterBg}`}>
          <div className="max-w-7xl mx-auto px-4">

            {/* Category pills — Favorites-style switcher */}
            {categories.length > 0 && (
              <div
                className="flex gap-1.5 overflow-x-auto py-3"
                style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
              >
                {/* "Tout" pill */}
                <div className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                  <button
                    onClick={() => { setCategoryId(""); setFilters({ subCategoryId: "", brandId: "", flavorId: "", sizeId: "", sortBy: "" }); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 transition-all text-[11px] font-semibold ${categoryId === "" ? t.switcherActive : t.switcherInactive}`}
                    data-testid="button-cat-all"
                  >
                    <span className="text-base leading-none">🛍️</span>
                    <span>Tout</span>
                  </button>
                </div>
                {categories.map((cat) => (
                  <div key={cat.id} className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                    <button
                      onClick={() => { setCategoryId(categoryId === cat.id ? "" : cat.id); setFilters({ subCategoryId: "", brandId: "", flavorId: "", sizeId: "", sortBy: "" }); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${categoryId === cat.id ? t.switcherActive : t.switcherInactive}`}
                      data-testid={`button-cat-${cat.id}`}
                    >
                      {cat.icon && <span className="text-base leading-none">{cat.icon}</span>}
                      <span className="max-w-[110px] whitespace-normal break-words leading-tight text-left">{cat.name}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Sub-category + brand filters + search — always rendered now
                (was gated on subCategories/brands existing) so the search
                input stays available even when neither taxonomy has
                entries. Search input placed first, same position/design as
                /products' own FilterBar. */}
            {/* Task: "Standardize Store Page Filter Scrolling Behavior" — same
                responsive scroll/wrap pattern as /products' own FilterBar:
                horizontal scroll with a hidden scrollbar on mobile
                (flex-nowrap overflow-x-auto), wraps to multiple lines with no
                scroll on sm:+ (sm:flex-wrap sm:overflow-x-visible). */}
            <div
              className="flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden py-2"
              style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
            >
              <SlidersHorizontal className={`w-3.5 h-3.5 shrink-0 ${t.textMuted}`} />
              <div className="relative shrink-0 sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
                {!searchOpen && (
                  <button
                    type="button"
                    className={`sm:hidden h-7 w-7 rounded-full border flex items-center justify-center shrink-0 ${t.inputBg}`}
                    onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
                    aria-label="Rechercher"
                    data-testid="button-open-store-search"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className={`${searchOpen ? "flex" : "hidden"} sm:flex items-center relative w-44 sm:w-full`}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => { if (!search) setSearchOpen(false); }}
                    placeholder="Rechercher des produits…"
                    className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
                    data-testid="input-store-search"
                  />
                </div>
              </div>
              {subCategories.length > 0 && (
                <Select value={filters.subCategoryId || "__all__"} onValueChange={(v) => updateFilter("subCategoryId", v === "__all__" ? "" : v)}>
                  <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] ${t.selectTrigger}`}>
                    <SelectValue placeholder="Sous-catégorie" />
                  </SelectTrigger>
                  <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                    <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Sous-catégories</SelectItem>
                    {subCategories.map((sc) => (
                      <SelectItem key={sc.id} value={sc.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>
                        {/* Same fallback "📦" as /products when no admin-configured icon exists yet. */}
                        <span className="mr-1.5">{sc.icon || "📦"}</span>{sc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {brands.length > 0 && (
                <Select value={filters.brandId || "__all__"} onValueChange={(v) => updateFilter("brandId", v === "__all__" ? "" : v)}>
                  <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[100px] ${t.selectTrigger}`}>
                    <SelectValue placeholder="Marque" />
                  </SelectTrigger>
                  <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                    <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Marques</SelectItem>
                    {brands.map((b) => <SelectItem key={b.id} value={b.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {flavors.length > 0 && (
                <Select value={filters.flavorId || "__all__"} onValueChange={(v) => updateFilter("flavorId", v === "__all__" ? "" : v)}>
                  <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[100px] ${t.selectTrigger}`}>
                    <SelectValue placeholder="Saveur" />
                  </SelectTrigger>
                  <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                    <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Saveurs</SelectItem>
                    {flavors.map((f) => <SelectItem key={f.id} value={f.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {sizes.length > 0 && (
                <Select value={filters.sizeId || "__all__"} onValueChange={(v) => updateFilter("sizeId", v === "__all__" ? "" : v)}>
                  <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[100px] ${t.selectTrigger}`}>
                    <SelectValue placeholder="Taille" />
                  </SelectTrigger>
                  <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                    <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Tailles</SelectItem>
                    {sizes.map((s) => <SelectItem key={s.id} value={s.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {/* Sort — "Plus de fournisseurs"/"Les plus proches" from the
                  multi-supplier reference page are omitted here: every item on
                  this page already belongs to the same single store, so
                  supplier-count/distance sorting wouldn't distinguish anything. */}
              <Select value={filters.sortBy || "recommended"} onValueChange={(v) => updateFilter("sortBy", v === "recommended" ? "" : v)}>
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`}>
                  <SelectValue placeholder="Trier par" />
                </SelectTrigger>
                <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                  <SelectItem value="recommended" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Recommandé</SelectItem>
                  <SelectItem value="price_asc" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Prix croissant</SelectItem>
                  <SelectItem value="price_desc" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Prix décroissant</SelectItem>
                </SelectContent>
              </Select>
              {hasActive && (
                <button
                  onClick={resetFilters}
                  className={`flex items-center gap-1 text-xs transition-colors ml-1 ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}
                >
                  <RotateCcw className="w-3 h-3" /> Réinitialiser
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Pack section ─────────────────────────────────────────────────── */}
      {storePacks.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pt-6">
          <StorePacksSection
            filteredPacks={filteredPacks}
            hasCommercialAccess={hasCommercialAccess}
            isDark={isDark}
          />
        </div>
      )}

      {/* ── Products grid ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h2 className={`font-bold text-lg ${t.textPrimary}`}>Produits</h2>
          <p className={`text-sm mt-0.5 ${t.textMuted}`}>
            {filtered.length} produit{filtered.length !== 1 ? "s" : ""} disponible{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Package className={`w-14 h-14 ${t.emptyIcon}`} />
            <div>
              <p className={`font-semibold ${t.emptyText}`}>Aucun produit trouvé</p>
              <p className={`text-sm mt-1 ${t.emptySubText}`}>
                {hasActive ? "Essayez d'ajuster vos filtres." : "Ce magasin n'a pas encore publié de produits."}
              </p>
            </div>
            {hasActive && (
              <Button
                size="sm"
                variant="outline"
                className={t.dk ? "border-gray-700 text-gray-300 hover:bg-gray-800" : ""}
                onClick={resetFilters}
              >
                Effacer tous les filtres
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((product) => (
              <StoreProductCard
                key={product.id}
                product={product as StoreProduct}
                hasCommercialAccess={hasCommercialAccess}
                storeLogoUrl={store.logoUrl ?? null}
                storeName={store.name}
                supplierId={store.supplierId}
                distanceKm={distance}
                isDark={isDark}
                navIds={productNavIds}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Info modal ─────────────────────────────────────────────────────── */}
      <InfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        openingHours={openingHours}
        storeName={store.name}
      />

      {/* ── Supplier reviews modal ────────────────────────────────────────── */}
      <SupplierReviewsModal
        open={supplierReviewsOpen}
        onClose={() => setSupplierReviewsOpen(false)}
        supplierId={store.supplierId}
        supplierName={store.name}
        isDark={isDark}
      />

      {/* ── Flash mode ─────────────────────────────────────────────────────── */}
      <FlashMode
        open={flashOpen}
        onClose={() => setFlashOpen(false)}
        products={flashProducts as any[]}
        packs={storePacks}
        storeName={store.name}
      />
    </div>
  );
}
