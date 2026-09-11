import { useState, useMemo, useEffect } from "react";
import printBannerImg from "@assets/1000_F_446608261_m4mqK7D6A8O68SkqWo4ea4VQgrGVbRHY_(1)_1780853922496.jpg";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useThemeStore } from "@/store/theme-store";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Package, Star, Clock, SlidersHorizontal, RotateCcw, Printer, Users, Heart, Zap, Ban, MapPin
} from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useFavorites } from "@/hooks/use-favorites";
import { useHeroActionSettings } from "@/hooks/use-hero-actions";
import type { PrintCatalogCard } from "@shared/schema";
import { printCategoryIcon } from "@/lib/print-category-icons";
import { PrintFastSearch } from "@/components/print/print-fast-search";
import { PrintBlacklistModal } from "@/components/print/print-blacklist-modal";
import { PrintServiceDetailModal } from "@/components/print/print-service-detail-modal";
import { PrintCompanyDetailModal } from "@/components/print/print-company-detail-modal";

// Stable shared references for "data not fetched/disabled yet" useQuery
// defaults — a fresh `[]` literal in a destructuring default is a *different*
// array every render, which breaks the syncPrint effect below whenever its
// query stays disabled (e.g. not-yet-approved viewer, or comingSoon): the
// effect's dependency never stabilizes, so it re-fires every render, calling
// syncPrint (which always returns a new store object, even when empty),
// triggering another render, forever — surfaces as React's "Maximum update
// depth exceeded". One shared reference lets the dependency settle.
const EMPTY_PRINT_CARDS: PrintCatalogCard[] = [];
const EMPTY_IDS: number[] = [];

// ── Production time buckets ─────────────────────────────────────────────────
// The real schema only has a numeric productionTimeDays (no free-text delivery
// string like the old mock data), so the "delivery time" filter buckets by it.

const PRODUCTION_TIME_BUCKETS = [
  { label: "≤ 3 jours", test: (d: number) => d <= 3 },
  { label: "4-7 jours", test: (d: number) => d >= 4 && d <= 7 },
  { label: "8+ jours", test: (d: number) => d >= 8 },
];

function bucketLabelFor(days: number): string {
  return PRODUCTION_TIME_BUCKETS.find((b) => b.test(days))?.label ?? "";
}

// ── Access helper (mirrors barista-page.tsx's own copy) ──────────────────────

type AccessLevel = "visitor" | "pending" | "approved";

function useAccessLevel(): AccessLevel {
  const { user } = useAuth();
  if (!user) return "visitor";
  if (["SUPER_ADMIN", "ADMIN", "SUPPLIER"].includes(user.role)) return "approved";
  if (user.role === "CAFE_OWNER" && (user as any).status === "approved") return "approved";
  return "pending";
}

// ── Theme helper ─────────────────────────────────────────────────────────────

function useTheme(isDark: boolean) {
  return {
    dk: isDark,
    pageBg: isDark ? "bg-gray-900" : "bg-gray-50",
    cardBg: isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    mutedBg: isDark ? "bg-gray-800" : "bg-gray-100",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    // Coffee Owner marketplace UI-consistency pass — category strip / filter
    // bar chrome copied verbatim from Shop's reference implementation
    // (browse-products.tsx's stripBg/switcherBg/switcherActive/switcherInactive
    // and the Select trigger's selectTrigger), so the two pieces of chrome
    // stay pixel-identical across services while each keeps its own data.
    stripBg: isDark ? "bg-gray-900/95 border-gray-800" : "bg-white border-gray-100",
    switcherBg: isDark ? "bg-gray-800" : "bg-gray-100",
    switcherActive: isDark ? "bg-gray-700 text-white shadow-sm" : "bg-white text-blue-600 shadow-sm",
    switcherInactive: isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700",
    selectTrigger: isDark ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700" : "border-gray-200 bg-gray-50",
    selectContent: isDark
      ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white"
      : "bg-white border-gray-200 text-gray-900",
  };
}

// ── Category Strip ────────────────────────────────────────────────────────────

function PrintCategoryStrip({ categories, loading, selected, onSelect, isDark }: {
  categories: string[];
  loading: boolean;
  selected: string;
  onSelect: (id: string) => void;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  return (
    <div className={`border-b ${t.stripBg}`}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1.5 overflow-x-auto py-3" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          <div className={`flex gap-1 rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
            <button
              onClick={() => onSelect("")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 transition-all text-[11px] font-semibold ${selected === "" ? t.switcherActive : t.switcherInactive}`}
              data-testid="button-print-cat-all"
            >
              <span className="text-base leading-none"><Printer className="w-4 h-4" /></span>
              <span>Tout</span>
            </button>
          </div>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[30px] w-[76px] rounded-2xl shrink-0" />
            ))
          ) : (
            categories.map((cat) => (
              <div key={cat} className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                <button
                  onClick={() => onSelect(selected === cat ? "" : cat)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${selected === cat ? t.switcherActive : t.switcherInactive}`}
                  data-testid={`button-print-cat-${cat}`}
                >
                  <span className="text-base leading-none">{printCategoryIcon(cat)}</span>
                  <span className="max-w-[72px] truncate">{cat}</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Rating Stars ──────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <span key={s} className={`text-[11px] ${s <= Math.round(rating) ? "text-amber-400" : "text-gray-200"}`}>★</span>
      ))}
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

function PrintProductCard({ card, onClick, isDark }: { card: PrintCatalogCard; onClick: () => void; isDark: boolean }) {
  const faved = useFavorites((s) => !!s.print[String(card.id)]);
  const togglePrint = useFavorites((s) => s.togglePrint);
  const fmt = useFormatCurrency();
  const t = useTheme(isDark);
  const starRating = card.rating / 10;

  return (
    <div
      data-testid={`card-print-${card.id}`}
      className={`group cursor-pointer rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col ${t.cardBg}`}
      onClick={onClick}
    >
      <div className={`relative aspect-[4/3] overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package className={`w-10 h-10 ${t.textSubtle}`} /></div>
        )}
        {card.category && (
          <div className="absolute top-2 left-2">
            <Badge className={`${isDark ? "bg-gray-800/90 text-gray-200" : "bg-white/90 text-gray-700"} backdrop-blur-sm text-[10px] font-semibold shadow-sm border-0 px-2`}>
              {printCategoryIcon(card.category)} {card.category}
            </Badge>
          </div>
        )}
        <button
          className={`absolute top-2 right-2 w-7 h-7 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform ${isDark ? "bg-gray-800/90" : "bg-white/90"}`}
          onClick={(e) => {
            e.stopPropagation();
            togglePrint({
              id: String(card.id),
              name: card.name,
              brand: card.printerName,
              price: card.priceInCents,
              priceUnit: card.unit,
              image: card.imageUrl ?? "",
              location: card.printerLocation,
              distanceKm: card.distanceKm,
              rating: card.rating / 10,
              reviewCount: card.reviewCount,
              category: card.category,
            });
          }}
          data-testid={`button-fav-print-${card.id}`}
        >
          <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <h3 className={`font-bold text-sm leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors ${t.textPrimary}`}>{card.name}</h3>
        {card.printerName && <p className={`text-xs font-medium ${t.textMuted}`}>{card.printerName}</p>}
        {card.printerLocation && (
          <span className={`flex items-center gap-0.5 text-[11px] ${t.textSubtle}`}>
            <MapPin className="w-2.5 h-2.5" />
            {card.printerLocation}
            {card.distanceKm != null && <> · {card.distanceKm} km</>}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          {card.reviewCount > 0 ? (
            <>
              <StarRating rating={starRating} />
              <span className={`text-[11px] ${t.textSubtle}`}>({card.reviewCount})</span>
            </>
          ) : (
            <span className={`text-[11px] ${t.textSubtle}`}>Aucun avis</span>
          )}
        </div>
        <div className={`mt-auto pt-2 border-t ${t.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-[10px] ${t.textSubtle}`}>À partir de</p>
              <p className="font-bold text-sm text-blue-600">{fmt(card.priceInCents)}<span className={`text-[10px] font-normal ${t.textSubtle}`}>/{card.unit}</span></p>
            </div>
              <div className={`flex items-center gap-1 text-[11px] ${t.textSubtle}`}>
              <Clock className="w-3 h-3" />
              <span>{card.productionTimeDays}j</span>
            </div>
          </div>
          {card.minQuantity > 1 && (
            <p className={`text-[10px] mt-1 ${t.textSubtle}`}>Min. {card.minQuantity} {card.unit}s</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton Card ─────────────────────────────────────────────────────────────

function PrintProductCardSkeleton({ isDark }: { isDark: boolean }) {
  const t = useTheme(isDark);
  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden flex flex-col ${t.cardBg}`}>
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="p-3 flex-1 flex flex-col gap-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-1/3" />
        <div className={`mt-auto pt-2 border-t ${t.border}`}>
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

interface PrintFilters {
  subCategoryId: string;
  brandId: string;
  material: string;
  deliveryTime: string;
}

function PrintFilterBar({ cards, filters, onChange, onReset, categoryId, isDark }: {
  cards: PrintCatalogCard[];
  filters: PrintFilters;
  onChange: (key: keyof PrintFilters, val: string) => void;
  onReset: () => void;
  categoryId: string;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const hasActive = Object.values(filters).some(Boolean);

  const subCategories = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.subCategory && (!categoryId || c.category === categoryId)) set.add(c.subCategory);
    });
    return Array.from(set);
  }, [cards, categoryId]);

  const printers = useMemo(() => {
    const map = new Map<string, string>();
    cards.forEach((c) => map.set(String(c.printerId), c.printerName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [cards]);

  const materials = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => c.materials.forEach((m) => set.add(m)));
    return Array.from(set);
  }, [cards]);

  const deliveryBuckets = useMemo(() => {
    const set = new Set(cards.map((c) => bucketLabelFor(c.productionTimeDays)));
    return PRODUCTION_TIME_BUCKETS.map((b) => b.label).filter((l) => set.has(l));
  }, [cards]);

  if (!subCategories.length && !printers.length && !materials.length) return null;

  return (
    <div className={`border-b py-2 px-4 ${t.stripBg}`}>
      <div className="max-w-7xl mx-auto flex items-center gap-2 flex-wrap">
            <SlidersHorizontal className={`w-3.5 h-3.5 ${t.textSubtle} shrink-0`} />
        {subCategories.length > 0 && (
          <Select value={filters.subCategoryId || "__all__"} onValueChange={(v) => onChange("subCategoryId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] ${t.selectTrigger}`}><SelectValue placeholder="Sous-catégorie" /></SelectTrigger>
            <SelectContent className={t.selectContent}>
              <SelectItem value="__all__">Toutes sous-catégories</SelectItem>
              {subCategories.map((sc) => <SelectItem key={sc} value={sc}>{sc}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {printers.length > 0 && (
          <Select value={filters.brandId || "__all__"} onValueChange={(v) => onChange("brandId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] ${t.selectTrigger}`}><SelectValue placeholder="Société d'impression" /></SelectTrigger>
            <SelectContent className={t.selectContent}>
              <SelectItem value="__all__">Toutes sociétés</SelectItem>
              {printers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {materials.length > 0 && (
          <Select value={filters.material || "__all__"} onValueChange={(v) => onChange("material", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] ${t.selectTrigger}`}><SelectValue placeholder="Matière" /></SelectTrigger>
            <SelectContent className={t.selectContent}>
              <SelectItem value="__all__">Toutes matières</SelectItem>
              {materials.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {deliveryBuckets.length > 0 && (
          <Select value={filters.deliveryTime || "__all__"} onValueChange={(v) => onChange("deliveryTime", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] ${t.selectTrigger}`}><SelectValue placeholder="Livraison" /></SelectTrigger>
            <SelectContent className={t.selectContent}>
              <SelectItem value="__all__">Toutes livraisons</SelectItem>
              {deliveryBuckets.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {hasActive && (
          <button onClick={onReset} className={`flex items-center gap-1 text-xs transition-colors ml-1 ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}>
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PrintPage({ comingSoon = false }: { comingSoon?: boolean }) {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const accessLevel = useAccessLevel();
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);
  const { settings: heroActions } = useHeroActionSettings();
  const [fastSearchOpen, setFastSearchOpen] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [previewServiceId, setPreviewServiceId] = useState<number | null>(null);
  const [previewCompanyId, setPreviewCompanyId] = useState<number | null>(null);

  const { data: cards = EMPTY_PRINT_CARDS, isLoading: cardsLoading } = useQuery<PrintCatalogCard[]>({
    queryKey: ["/api/print/marketplace"],
    enabled: !comingSoon,
  });
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<string[]>({
    queryKey: ["/api/print/categories"],
    enabled: !comingSoon,
  });

  const urlParams = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const initialSearch = urlParams.get("q") ?? "";
  const initialCategory = urlParams.get("categoryId") ?? "";

  const [categoryId, setCategoryId] = useState(initialCategory);
  const [filters, setFilters] = useState<PrintFilters>({ subCategoryId: "", brandId: "", material: "", deliveryTime: "" });

  useEffect(() => {
    setCategoryId(urlParams.get("categoryId") ?? "");
  }, [searchStr]);

  const searchQuery = initialSearch.toLowerCase();

  const filtered = useMemo(() => {
    let list = cards;

    if (searchQuery) {
      list = list.filter((c) =>
        c.name.toLowerCase().includes(searchQuery) ||
        c.description.toLowerCase().includes(searchQuery) ||
        c.category.toLowerCase().includes(searchQuery) ||
        c.subCategory.toLowerCase().includes(searchQuery) ||
        c.printerName.toLowerCase().includes(searchQuery)
      );
    }
    if (categoryId) list = list.filter((c) => c.category === categoryId);
    if (filters.subCategoryId) list = list.filter((c) => c.subCategory === filters.subCategoryId);
    if (filters.brandId) list = list.filter((c) => String(c.printerId) === filters.brandId);
    if (filters.material) list = list.filter((c) => c.materials.includes(filters.material));
    if (filters.deliveryTime) list = list.filter((c) => bucketLabelFor(c.productionTimeDays) === filters.deliveryTime);

    return list;
  }, [cards, searchQuery, categoryId, filters]);

  const updateFilter = (key: keyof PrintFilters, val: string) => setFilters((p) => ({ ...p, [key]: val }));
  const resetFilters = () => setFilters({ subCategoryId: "", brandId: "", material: "", deliveryTime: "" });

  const isLoading = cardsLoading || categoriesLoading;
  const distinctPrinterCount = useMemo(() => new Set(cards.map((c) => c.printerId)).size, [cards]);
  const distinctPrinters = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of cards) if (!map.has(c.printerId)) map.set(c.printerId, c.printerName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [cards]);
  const { user } = useAuth();
  const canAct = !!user && user.role === "CAFE_OWNER" && accessLevel === "approved";

  // Favorites persist as Print catalog item IDs (Part 25) — resolve them
  // against the already-loaded cards so heart state is correct on first
  // render, mirroring the Maintenance/Barista/Marketing/Academy pages.
  const { data: printFavoriteIds = EMPTY_IDS } = useQuery<number[]>({
    queryKey: ["/api/print-favorites"],
    enabled: !!user && accessLevel === "approved",
  });
  const syncPrint = useFavorites((s) => s.syncPrint);
  useEffect(() => {
    syncPrint(printFavoriteIds, cards);
  }, [printFavoriteIds, cards, syncPrint]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-5 pb-12 px-5 overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80"
          style={{ backgroundImage: `url('${printBannerImg}')` }}
        />
        {/* Dark overlay */}
        <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-blue-950/90" : "bg-gradient-to-br from-blue-600/90 via-blue-700/85 to-indigo-700/90"}`} />
        {/* Content */}
        <div className="relative">
          {/* "Mes commandes" removed — Print orders stay reachable from My
              Account → Réservations (unchanged). The global navbar theme
              control is the single Dark/Light toggle now, so the duplicated
              hero one is gone too; Fast Search/Report (Admin-toggleable per
              service — see /api/hero-actions) follow the exact /barista
              hero pattern. */}
          <div className="flex justify-end items-center gap-2 mb-9">
            {!comingSoon && canAct && heroActions.PRINT.reportEnabled && (
              <button
                onClick={() => setBlacklistOpen(true)}
                aria-label="Imprimeurs signalés"
                title="Imprimeurs signalés"
                data-testid="button-open-blacklist"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-red-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Ban className="w-4 h-4" />
              </button>
            )}
            {!comingSoon && canAct && heroActions.PRINT.fastSearchEnabled && (
              <button
                onClick={() => setFastSearchOpen(true)}
                aria-label="Fast Search"
                title="Fast Search — parcourir les services PRINT"
                data-testid="button-open-fast-search"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-blue-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Zap className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="max-w-3xl mx-auto text-center">
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-5 backdrop-blur-sm ${isDark ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}>
            <Printer className={`w-8 h-8 ${isDark ? "text-amber-400" : "text-white"}`} />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
            BigBoss <span className={isDark ? "text-amber-400" : "text-amber-200"}>PRINT</span>
          </h1>
          <p className={`text-base mb-4 max-w-xl mx-auto ${isDark ? "text-gray-400" : "text-blue-100"}`}>
            Commandez vos supports imprimés professionnels directement depuis la plateforme.
          </p>
          <div className={`flex items-center justify-center gap-6 flex-wrap text-sm ${isDark ? "text-gray-400" : "text-blue-100"}`}>
            <span className="flex items-center gap-1.5">
              <Package className="w-4 h-4" />
              {isLoading ? "…" : cards.length} produits disponibles
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {isLoading ? "…" : distinctPrinterCount} sociétés d'impression
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="w-4 h-4 fill-blue-200" />
              {isLoading ? "…" : categories.length} catégories
            </span>
          </div>
          </div>
        </div>
      </section>

      {comingSoon ? (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${t.mutedBg}`}>
            <Clock className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${t.textPrimary}`} data-testid="text-coming-soon-title">
            Bientôt disponible
          </h2>
          <p className={`text-sm max-w-md mx-auto ${t.textMuted}`}>
            Ce service est en cours de préparation. Revenez bientôt pour le découvrir.
          </p>
        </div>
      ) : (
      <>
      <div className="sticky top-14 z-30">
        <PrintCategoryStrip
          categories={categories}
          loading={categoriesLoading}
          selected={categoryId}
          isDark={isDark}
          onSelect={(id) => {
            setCategoryId(id);
            resetFilters();
            const params = new URLSearchParams();
            if (searchQuery) params.set("q", searchQuery);
            if (id) params.set("categoryId", id);
            navigate(`/print${params.toString() ? "?" + params.toString() : ""}`);
          }}
        />

        <PrintFilterBar
          cards={cards}
          filters={filters}
          onChange={updateFilter}
          onReset={resetFilters}
           categoryId={categoryId}
           isDark={isDark}
        />
      </div>

       <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-4">
           <h1 className={`font-bold text-lg ${t.textPrimary}`}>
            {categoryId || "Services d'impression"}
          </h1>
           <p className={`text-sm mt-0.5 ${t.textSubtle}`}>{isLoading ? "…" : `${filtered.length} service${filtered.length !== 1 ? "s" : ""} disponible${filtered.length !== 1 ? "s" : ""}`}</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <PrintProductCardSkeleton key={i} isDark={isDark} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
             <Printer className={`w-14 h-14 ${t.textSubtle}`} />
            <div>
               <p className={`font-semibold ${t.textPrimary}`}>Aucun service trouvé</p>
               <p className={`text-sm mt-1 ${t.textMuted}`}>Essayez d'ajuster vos filtres.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { resetFilters(); setCategoryId(""); navigate("/print"); }}>
              Effacer les filtres
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((card) => (
              <PrintProductCard
                key={card.id}
                card={card}
                 onClick={() => setPreviewServiceId(card.id)}
                 isDark={isDark}
              />
            ))}
          </div>
        )}
      </div>
      </>
      )}

      <PrintFastSearch
        open={fastSearchOpen}
        onClose={() => setFastSearchOpen(false)}
        cards={cards}
        onOpenDetail={(card) => { setFastSearchOpen(false); setPreviewServiceId(card.id); }}
      />
      <PrintBlacklistModal open={blacklistOpen} onClose={() => setBlacklistOpen(false)} isDark={isDark} printers={distinctPrinters} />

      {/* Service / Company details modals — replaces the old direct navigation to the
          full-page item detail for a quick preview; the full page (with its file-upload/
          material/quantity/cart customization) stays fully intact, one click away via
          the modal's own "Commander" button. */}
      <PrintServiceDetailModal
        serviceId={previewServiceId}
        open={previewServiceId != null}
        onClose={() => setPreviewServiceId(null)}
        onOpenCompany={(printerId) => { setPreviewServiceId(null); setPreviewCompanyId(printerId); }}
      />
      <PrintCompanyDetailModal
        printerUserId={previewCompanyId}
        open={previewCompanyId != null}
        onClose={() => setPreviewCompanyId(null)}
        onOpenService={(serviceId) => { setPreviewCompanyId(null); setPreviewServiceId(serviceId); }}
      />
    </div>
  );
}
