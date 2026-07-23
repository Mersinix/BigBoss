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
  ChevronLeft, MapPin, Plus, Info, Star, Music, Zap, Clock, Layers,
  Sun, Moon, X,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useFavorites } from "@/hooks/use-favorites";
import { useStoreFavorites } from "@/hooks/use-store-favorites";
import { calculateDistance, formatDistance } from "@/lib/distance";
import { useSearchLocationStore } from "@/store/search-location-store";
import { useQuickView } from "@/hooks/use-quick-view";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import { FlashMode } from "@/components/flash-mode";
import type { StoreDetail, ProductWithTaxonomy, OpeningHoursMap, PackDetail } from "@shared/schema";

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

function CoverSlideshow({ urls, name }: { urls: string[]; name: string }) {
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

function MusicPlayer({ musicUrl }: { musicUrl: string }) {
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

function InfoModal({ open, onClose, openingHours, storeName }: {
  open: boolean;
  onClose: () => void;
  openingHours: OpeningHoursMap | null;
  storeName: string;
}) {
  const todayKey = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1].key;
  const [isDark, setIsDark] = useState(true);

  const dk = isDark;
  const bg          = dk ? "bg-gray-900"                    : "bg-white";
  const textPrimary = dk ? "text-white"                     : "text-gray-900";
  const textMuted   = dk ? "text-gray-400"                  : "text-gray-500";
  const divider     = dk ? "bg-gray-800"                    : "bg-gray-100";
  const rowBg       = dk ? "bg-gray-800 border-gray-700/60" : "bg-gray-50 border-gray-100";
  const rowToday    = dk ? "bg-amber-500/15 border-amber-500/30" : "bg-amber-50 border-amber-200";
  const timeColor   = dk ? "text-gray-300"                  : "text-gray-700";
  const closedColor = dk ? "text-red-400"                   : "text-red-500";
  const iconBtn     = dk
    ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
    : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
        <div className={`flex flex-col max-h-[88vh] overflow-hidden transition-colors duration-200 ${bg}`}>

          {/* ── Fixed header ── */}
          <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
            {/* Title row */}
            <div className="flex items-center justify-between mb-4">
              {/* Close */}
              <button
                onClick={onClose}
                aria-label="Close"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                <X className="w-4 h-4" />
              </button>

              {/* Centered title */}
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight leading-tight ${textPrimary}`}>
                  {storeName}
                </span>
                <span className={`text-[11px] font-medium ${textMuted}`}>Opening Hours</span>
              </div>

              {/* Dark / light toggle */}
              <button
                onClick={() => setIsDark((d) => !d)}
                aria-label="Toggle theme"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                {dk
                  ? <Sun className="w-4 h-4 text-amber-400" />
                  : <Moon className="w-4 h-4 text-gray-500" />
                }
              </button>
            </div>

            {/* Divider */}
            <div className={`h-px w-full ${divider}`} />
          </div>

          {/* ── Scrollable content ── */}
          <div
            className="flex-1 min-h-0 overflow-y-auto px-5 pb-6
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-gray-700
              hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {openingHours ? (
              <div className="space-y-2 pb-2">
                {DAYS.map(({ key, label }) => {
                  const day = openingHours[key];
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between border rounded-2xl px-4 py-3 transition-colors ${isToday ? rowToday : rowBg}`}
                    >
                      {/* Day label + Today badge */}
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-medium ${isToday ? (dk ? "text-amber-400" : "text-amber-600") : textPrimary}`}>
                          {label}
                        </span>
                        {isToday && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${dk ? "bg-amber-500/30 text-amber-300" : "bg-amber-100 text-amber-700"}`}>
                            Today
                          </span>
                        )}
                      </div>

                      {/* Time or Closed */}
                      {day?.closed ? (
                        <span className={`text-[12px] font-semibold ${closedColor}`}>Closed</span>
                      ) : day ? (
                        <span className={`text-[13px] font-medium tabular-nums ${isToday ? (dk ? "text-amber-300" : "text-amber-700") : timeColor}`}>
                          {day.open}&thinsp;–&thinsp;{day.close}
                        </span>
                      ) : (
                        <span className={`text-[12px] ${textMuted}`}>—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`text-center py-12 ${textMuted}`}>
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className={`text-sm font-medium ${textPrimary}`}>No schedule set</p>
                <p className="text-xs mt-1 opacity-50">This store hasn't configured opening hours yet.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pack card (store context) ─────────────────────────────────────────────────

function StorePackCard({ pack, hasCommercialAccess, supplierLat, supplierLng, isDark }: {
  pack: PackDetail;
  hasCommercialAccess: boolean;
  supplierLat?: string | null;
  supplierLng?: string | null;
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
    const lat = supplierLat ?? (pack as any).supplierLat;
    const lng = supplierLng ?? (pack as any).supplierLng;
    if (!searchLocation || !lat || !lng) return null;
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (Number.isNaN(latN) || Number.isNaN(lngN)) return null;
    return calculateDistance(parseFloat(searchLocation.lat), parseFloat(searchLocation.lng), latN, lngN);
  }, [supplierLat, supplierLng, (pack as any).supplierLat, (pack as any).supplierLng, searchLocation]);

  return (
    <div
      data-testid={`card-pack-${pack.id}`}
      className={`group border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-xl hover:-translate-y-0.5 ${t.dk ? "bg-gray-800 border-amber-900/40" : "bg-white border-amber-100"}`}
      onClick={() => openPackQuickView(pack.id)}
    >
      {/* Image */}
      <div className={`relative aspect-[4/3] overflow-hidden ${t.dk ? "bg-amber-900/20" : "bg-amber-50"}`}>
        {pack.imageUrl ? (
          <img src={pack.imageUrl} alt={pack.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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

        {/* Rating + stock + distance */}
        <div className="flex items-center justify-between mt-0.5">
          {pack.packReviewCount > 0 ? (
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className={`text-[11px] font-medium ${t.textPrimary}`}>{pack.packAvgRating.toFixed(1)}</span>
              <span className={`text-[10px] ${t.textMuted}`}>({pack.packReviewCount})</span>
            </div>
          ) : <span />}
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

function StorePacksSection({ packs, filters, hasCommercialAccess, isDark }: {
  packs: PackDetail[];
  filters: { subCategoryId: string; brandId: string };
  hasCommercialAccess: boolean;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const [expanded, setExpanded] = useState(false);
  const INITIAL_LIMIT = 5;

  const filtered = useMemo(() => {
    let list = packs;
    if (filters.subCategoryId) list = list.filter((p) => p.subCategoryIds.includes(Number(filters.subCategoryId)));
    if (filters.brandId) list = list.filter((p) => p.brandIds.includes(Number(filters.brandId)));
    return list;
  }, [packs, filters.subCategoryId, filters.brandId]);

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
            variant="ghost"
            size="sm"
            className={`text-xs font-semibold h-8 px-3 ${t.sectionBtnPack}`}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Show Less" : `See More (${filtered.length - INITIAL_LIMIT}+)`}
          </Button>
        )}
      </div>
      {expanded ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((pack) => (
            <StorePackCard key={pack.id} pack={pack} hasCommercialAccess={hasCommercialAccess} isDark={isDark} />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}>
          {filtered.map((pack) => (
            <div key={pack.id} className="shrink-0 w-48 sm:w-56">
              <StorePackCard pack={pack} hasCommercialAccess={hasCommercialAccess} isDark={isDark} />
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

// ── Product card (store context) ──────────────────────────────────────────────

type StoreProduct = ProductWithTaxonomy & { bestPrice?: number; avgRating?: number; reviewCount?: number };

function StoreProductCard({
  product,
  hasCommercialAccess,
  storeLogoUrl,
  storeName,
  distanceKm,
  isDark,
}: {
  product: StoreProduct;
  hasCommercialAccess: boolean;
  storeLogoUrl: string | null;
  storeName: string;
  distanceKm: number | null;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const faved = useFavorites((s) => !!s.shop[product.id]);
  const toggleShop = useFavorites((s) => s.toggleShop);
  const openQuickView = useQuickView((s) => s.open);

  const avgRating = product.avgRating ?? 0;
  const reviewCount = product.reviewCount ?? 0;
  const hasReviews = hasCommercialAccess && reviewCount > 0;

  return (
    <div
      data-testid={`card-product-${product.id}`}
      className={`group border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-xl hover:-translate-y-0.5 ${t.cardBg}`}
      onClick={() => openQuickView(product.id)}
    >
      {/* Image */}
      <div className={`relative aspect-[4/3] overflow-hidden shrink-0 ${t.imageOverlay}`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className={`w-10 h-10 ${t.emptyIcon}`} />
          </div>
        )}
        {/* Category badge */}
        {product.categoryLabel?.name && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-black/50 text-white backdrop-blur-sm text-[10px] font-semibold shadow-sm border-0 px-2">
              {product.categoryLabel.name}
            </Badge>
          </div>
        )}
        {/* Review overlay */}
        {hasReviews && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="text-[10px] font-medium text-white">{avgRating.toFixed(1)}</span>
            <span className="text-[10px] text-white/70">({reviewCount})</span>
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
                supplier: product.categoryLabel?.name ?? "",
                price: product.bestPrice ?? 0,
                image: product.imageUrl ?? "",
              });
            }}
            data-testid={`button-fav-${product.id}`}
          >
            <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white/80"}`} />
          </button>
        )}
        {/* Quick-view button */}
        <button
          className="absolute bottom-2 right-2 w-7 h-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            openQuickView(product.id);
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
        <div className="flex items-center gap-1.5">
          <SingleStoreLogoStrip logoUrl={storeLogoUrl} name={storeName} isDark={isDark} />
          {distanceKm !== null && (
            <span className={`text-[11px] flex items-center gap-0.5 ml-auto ${t.textMuted}`}>
              <MapPin className="w-2.5 h-2.5 shrink-0" />{formatDistance(distanceKm)}
            </span>
          )}
        </div>
        <div className={`mt-auto pt-1.5 border-t ${t.priceBorder}`}>
          {hasCommercialAccess ? (
            <div>
              <p className={`text-[10px] ${t.textMuted}`}>From</p>
              <p className={`font-bold text-sm ${t.textPrice}`}>
                {product.bestPrice != null ? formatCurrency(product.bestPrice) : "—"}
              </p>
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

  // ── Dark / light mode (dark by default — matches Favorites modal + /products page) ──
  const [isDark, setIsDark] = useState(true);
  const t = useTheme(isDark);

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
      {/* Background music */}
      {musicUrl && <MusicPlayer musicUrl={musicUrl} />}

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

        {/* Top-right cluster: Dark/Light toggle + Flash + Favorite */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle theme"
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center hover:scale-105 transition-transform"
          >
            {isDark
              ? <Sun className="w-4 h-4 text-amber-400" />
              : <Moon className="w-4 h-4 text-white" />
            }
          </button>
          
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
          <div className="relative top-4 min-w-0 flex-1">
            <h1
              className={`font-extrabold text-xl leading-tight truncate ${t.textPrimary}`}
              data-testid="text-store-name"
            >
              {store.name}
            </h1>
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
                <span className={`flex items-center gap-1 ${t.dk ? "text-indigo-400" : "text-indigo-500"}`}>
                  <Music className="w-3 h-3" />Music
                </span>
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
      {(categories.length > 0 || subCategories.length > 0 || brands.length > 0) && (
        <div className={`sticky top-14 z-30 border-b mt-4 transition-colors ${t.filterBg}`}>
          <div className="max-w-7xl mx-auto px-4">

            {/* Category pills — Favorites-style switcher */}
            {categories.length > 0 && (
              <div
                className="flex gap-1.5 overflow-x-auto py-3"
                style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
              >
                {/* "All" pill */}
                <div className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                  <button
                    onClick={() => { setCategoryId(""); setFilters({ subCategoryId: "", brandId: "" }); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 transition-all text-[11px] font-semibold ${categoryId === "" ? t.switcherActive : t.switcherInactive}`}
                    data-testid="button-cat-all"
                  >
                    <span className="text-base leading-none">🛍️</span>
                    <span>All</span>
                  </button>
                </div>
                {categories.map((cat) => (
                  <div key={cat.id} className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                    <button
                      onClick={() => { setCategoryId(categoryId === cat.id ? "" : cat.id); setFilters({ subCategoryId: "", brandId: "" }); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${categoryId === cat.id ? t.switcherActive : t.switcherInactive}`}
                      data-testid={`button-cat-${cat.id}`}
                    >
                      <span className="max-w-[72px] truncate">{cat.name}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Sub-category + brand filters */}
            {(subCategories.length > 0 || brands.length > 0) && (
              <div className="flex items-center gap-2 flex-wrap py-2">
                <SlidersHorizontal className={`w-3.5 h-3.5 shrink-0 ${t.textMuted}`} />
                {subCategories.length > 0 && (
                  <Select value={filters.subCategoryId || "__all__"} onValueChange={(v) => updateFilter("subCategoryId", v === "__all__" ? "" : v)}>
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
                  <Select value={filters.brandId || "__all__"} onValueChange={(v) => updateFilter("brandId", v === "__all__" ? "" : v)}>
                    <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[100px] ${t.selectTrigger}`}>
                      <SelectValue placeholder="Brand" />
                    </SelectTrigger>
                    <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                      <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>All Brands</SelectItem>
                      {brands.map((b) => <SelectItem key={b.id} value={b.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {hasActive && (
                  <button
                    onClick={resetFilters}
                    className={`flex items-center gap-1 text-xs transition-colors ml-1 ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pack section ─────────────────────────────────────────────────── */}
      {storePacks.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pt-6">
          <StorePacksSection
            packs={storePacks}
            filters={filters}
            hasCommercialAccess={hasCommercialAccess}
            isDark={isDark}
          />
        </div>
      )}

      {/* ── Products grid ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h2 className={`font-bold text-lg ${t.textPrimary}`}>Products</h2>
          <p className={`text-sm mt-0.5 ${t.textMuted}`}>
            {filtered.length} product{filtered.length !== 1 ? "s" : ""} available
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Package className={`w-14 h-14 ${t.emptyIcon}`} />
            <div>
              <p className={`font-semibold ${t.emptyText}`}>No products found</p>
              <p className={`text-sm mt-1 ${t.emptySubText}`}>
                {hasActive ? "Try adjusting your filters." : "This store hasn't listed any products yet."}
              </p>
            </div>
            {hasActive && (
              <Button
                size="sm"
                variant="outline"
                className={t.dk ? "border-gray-700 text-gray-300 hover:bg-gray-800" : ""}
                onClick={resetFilters}
              >
                Clear all filters
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
                distanceKm={distance}
                isDark={isDark}
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

      {/* ── Flash mode ─────────────────────────────────────────────────────── */}
      <FlashMode
        open={flashOpen}
        onClose={() => setFlashOpen(false)}
        products={products as any[]}
        packs={storePacks}
        storeName={store.name}
      />
    </div>
  );
}
