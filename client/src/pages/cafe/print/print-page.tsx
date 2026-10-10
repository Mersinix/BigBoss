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
import type { PrintCatalogCard, PrintCompanyListCard } from "@shared/schema";
import { printCategoryIcon } from "@/lib/print-category-icons";
import { useFallbackImage } from "@/hooks/use-fallback-image";
import { PrintFastSearch } from "@/components/print/print-fast-search";
import { PrintBlacklistModal } from "@/components/print/print-blacklist-modal";
import { PrintServiceDetailModal } from "@/components/print/print-service-detail-modal";
import { PrintCompanyDetailModal } from "@/components/print/print-company-detail-modal";
import { PrintMappedServiceCard } from "@/components/print/print-mapped-service-card";
import { formatDistance } from "@/lib/distance";

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
const EMPTY_PRINT_COMPANIES: PrintCompanyListCard[] = [];

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

function PrintCategoryStrip({ categories, loading, selected, onSelect, isDark, categoryIconByName }: {
  categories: string[];
  loading: boolean;
  selected: string;
  onSelect: (id: string) => void;
  isDark: boolean;
  categoryIconByName: Map<string, string>;
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
                  <span className="text-base leading-none">{printCategoryIcon(cat, categoryIconByName.get(cat))}</span>
                  <span className="whitespace-nowrap">{cat}</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Print Store card/section ──────────────────────────────────────────────────
// Mirrors browse-products.tsx's StoreCardTile/StoresSection (the Coffee Owner
// /products reference) — same card shape/positioning, adapted to the real
// Print provider data (GET /api/print/companies, docs/print_store_mapping_audit.md).
// Selecting a card navigates to a dedicated Print Store page
// (/print/stores/:printerId, print-store-detail-page.tsx) — the /print
// equivalent of /products' own /stores/:storeId navigation
// (docs/print_store_details_page_audit.md).

function PrintStoreCardTile({ company, onClick, isDark }: {
  company: PrintCompanyListCard;
  onClick: () => void;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const faved = useFavorites((s) => !!s.printCompanies[company.userId]);
  const togglePrintCompany = useFavorites((s) => s.togglePrintCompany);
  // Photo de profil is the card's primary image; Cover then Flash are tried in
  // order if it's missing or fails to load (analyse.md image-mapping task).
  const cardImage = useFallbackImage([company.profileImageUrl, company.coverImageUrl, company.flashImageUrl], company.userId);

  return (
    <div
      data-testid={`card-print-store-${company.userId}`}
      className={`group cursor-pointer border rounded-2xl overflow-hidden flex flex-col transition-all hover:shadow-xl hover:-translate-y-0.5 ${t.cardBg}`}
      onClick={onClick}
    >
      {/* Image area — same ~1.5× scale/visual language as Marketing's agency card
          (MarketingStoreCardTile), grid/scroll-item sizing handled by the parent
          PrintStoresSection — docs/print_marketing_design_synchronization_audit.md. */}
      <div className={`relative aspect-[16/9] overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
        {cardImage.src ? (
          <img src={cardImage.src} onError={cardImage.onError} alt={company.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Printer className={`w-14 h-14 ${t.textSubtle}`} /></div>
        )}

        {/* Imprimerie type — top-left badge over the image. Print has no per-account
            "type" field (confirmed via schema audit); "Imprimerie" is the same fixed,
            real descriptor already used by this exact card's own favorite-toggle call
            below, not a fabricated per-record value. */}
        <span className="absolute top-3 left-3 bg-black/55 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
          Imprimerie
        </span>

        <button
          className="absolute top-3 right-3 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            togglePrintCompany({
              id: company.userId, name: company.name, initials: company.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
              type: "Imprimerie", rating: company.rating / 10, portfolioImages: company.portfolioImages, location: company.location,
              available: !company.isOnVacation, profileImageUrl: company.profileImageUrl,
            });
          }}
          data-testid={`button-fav-print-store-${company.userId}`}
        >
          <Heart className={`w-4 h-4 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white/80"}`} />
        </button>

        {/* Avis — bottom-right overlay, real rating/reviewCount, same reviewCount>0 gate used everywhere else */}
        {company.reviewCount > 0 && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/55 backdrop-blur-sm rounded-full px-2.5 py-1">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-bold text-white">{(company.rating / 10).toFixed(1)}</span>
            <span className="text-[11px] text-white/70">({company.reviewCount} avis)</span>
          </div>
        )}
      </div>
      <div className="p-4 flex gap-4 relative z-20">
        <div className={`w-16 h-16 rounded-xl border-2 -mt-12 overflow-hidden shrink-0 flex items-center justify-center ${isDark ? "bg-gray-700 border-gray-800" : "bg-white border-white shadow-sm"}`}>
          {company.profileImageUrl ? (
            <img src={company.profileImageUrl} alt={company.name} className="w-full h-full object-cover" />
          ) : (
            <Printer className={`w-6 h-6 ${t.textMuted}`} />
          )}
        </div>
        <div className="flex-1 min-w-0 pt-1.5">
          <h3 className={`font-bold text-base leading-tight truncate ${t.textPrimary}`}>{company.name}</h3>
          {company.description && <p className={`text-sm line-clamp-1 mt-1 ${t.textMuted}`}>{company.description}</p>}
          <div className={`flex items-center gap-3 text-xs mt-2 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
            <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" />{company.serviceCount} service{company.serviceCount !== 1 ? "s" : ""}</span>
            {company.distanceKm != null && <span className="flex items-center gap-1 text-current"><MapPin className="w-3.5 h-3.5" />{formatDistance(company.distanceKm)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintStoresSection({ companies, categoryId, onSelect, isDark }: {
  companies: PrintCompanyListCard[];
  categoryId: string;
  onSelect: (printerId: number) => void;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const [expanded, setExpanded] = useState(false);
  const INITIAL_LIMIT = 5;

  const filtered = useMemo(() => {
    if (!categoryId) return companies;
    return companies.filter((c) => c.categories.some((cat) => cat.toLowerCase() === categoryId.toLowerCase()));
  }, [companies, categoryId]);

  if (!filtered.length) return null;
  const showToggle = filtered.length > INITIAL_LIMIT;
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_LIMIT);

  const renderTile = (company: PrintCompanyListCard) => (
    <PrintStoreCardTile
      key={company.userId}
      company={company}
      onClick={() => onSelect(company.userId)}
      isDark={isDark}
    />
  );

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className={`font-bold text-lg ${t.textPrimary}`}>Imprimeries</h2>
          <p className={`text-xs mt-0.5 ${t.textMuted}`}>{filtered.length} imprimerie{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        {showToggle && (
          <Button
            variant="ghost"
            size="sm"
            className={`text-xs font-semibold h-8 px-3 ${isDark ? "text-gray-300 hover:text-white hover:bg-gray-800" : "text-gray-600 hover:text-gray-900"}`}
            onClick={() => setExpanded((e) => !e)}
            data-testid="button-toggle-print-stores"
          >
            {expanded ? "Voir moins" : `Voir plus (${filtered.length - INITIAL_LIMIT}+)`}
          </Button>
        )}
      </div>
      {/* Same grid/breakpoints as the Services d'impression grid below, mirroring
          Marketing's Agency-card/Service-card grid unification (same column width,
          no separate horizontal-scroll/fixed-width mode) —
          docs/print_marketing_design_synchronization_audit.md. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {visible.map(renderTile)}
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

function PrintProductCard({ card, onClick, isDark, categoryIconByName }: { card: PrintCatalogCard; onClick: () => void; isDark: boolean; categoryIconByName: Map<string, string> }) {
  const faved = useFavorites((s) => !!s.printProducts[String(card.id)]);
  const togglePrint = useFavorites((s) => s.togglePrintProduct);

  return (
    <PrintMappedServiceCard
      id={card.id}
      name={card.name}
      category={card.category}
      description={card.description}
      imageUrl={card.imageUrl}
      priceInCents={card.priceInCents}
      unit={card.unit}
      minQuantity={card.minQuantity}
      productionTimeDays={card.productionTimeDays}
      printerName={card.printerName}
      printerImageUrl={card.printerImageUrl}
      printerIsAvailable={card.printerIsAvailable}
      rating={card.rating}
      reviewCount={card.reviewCount}
      categoryIcon={printCategoryIcon(card.category, categoryIconByName.get(card.category))}
      isFavorited={faved}
      onToggleFavorite={() => togglePrint({
        id: String(card.id), name: card.name, brand: card.printerName, price: card.priceInCents, priceUnit: card.unit,
        image: card.imageUrl ?? "", location: card.printerLocation, distanceKm: card.distanceKm,
        rating: card.rating / 10, reviewCount: card.reviewCount, category: card.category,
      })}
      onClick={onClick}
      isDark={isDark}
    />
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

function PrintFilterBar({ cards, filters, onChange, onReset, categoryId, isDark, subcategoryIconByName }: {
  cards: PrintCatalogCard[];
  filters: PrintFilters;
  onChange: (key: keyof PrintFilters, val: string) => void;
  onReset: () => void;
  categoryId: string;
  isDark: boolean;
  subcategoryIconByName: Map<string, string>;
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
      <div
        className="max-w-7xl mx-auto flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
            <SlidersHorizontal className={`w-3.5 h-3.5 ${t.textSubtle} shrink-0`} />
        {subCategories.length > 0 && (
          <Select value={filters.subCategoryId || "__all__"} onValueChange={(v) => onChange("subCategoryId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] shrink-0 ${t.selectTrigger}`}><SelectValue placeholder="Sous-catégorie" /></SelectTrigger>
            <SelectContent className={t.selectContent}>
              <SelectItem value="__all__">Toutes sous-catégories</SelectItem>
              {subCategories.map((sc) => {
                const icon = subcategoryIconByName.get(sc);
                return <SelectItem key={sc} value={sc}>{icon ? `${icon} ${sc}` : sc}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        )}
        {printers.length > 0 && (
          <Select value={filters.brandId || "__all__"} onValueChange={(v) => onChange("brandId", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`}><SelectValue placeholder="Société d'impression" /></SelectTrigger>
            <SelectContent className={t.selectContent}>
              <SelectItem value="__all__">Toutes sociétés</SelectItem>
              {printers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {materials.length > 0 && (
          <Select value={filters.material || "__all__"} onValueChange={(v) => onChange("material", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] shrink-0 ${t.selectTrigger}`}><SelectValue placeholder="Matière" /></SelectTrigger>
            <SelectContent className={t.selectContent}>
              <SelectItem value="__all__">Toutes matières</SelectItem>
              {materials.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {deliveryBuckets.length > 0 && (
          <Select value={filters.deliveryTime || "__all__"} onValueChange={(v) => onChange("deliveryTime", v === "__all__" ? "" : v)}>
            <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] shrink-0 ${t.selectTrigger}`}><SelectValue placeholder="Livraison" /></SelectTrigger>
            <SelectContent className={t.selectContent}>
              <SelectItem value="__all__">Toutes livraisons</SelectItem>
              {deliveryBuckets.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {hasActive && (
          <button onClick={onReset} className={`flex items-center gap-1 text-xs transition-colors ml-1 shrink-0 whitespace-nowrap ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}>
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
  const { data: printCompanies = EMPTY_PRINT_COMPANIES, isLoading: printCompaniesLoading } = useQuery<PrintCompanyListCard[]>({
    queryKey: ["/api/print/companies"],
    enabled: !comingSoon,
  });
  // Admin-created category/subcategory icons — real source of truth
  // (printCategoryTaxonomy.icon / printSubCategoryTaxonomy.icon), matched by
  // name since the catalog's category/subCategory fields are plain text with
  // no FK (docs/print_marketing_ui_synchronization_audit.md Section 1/11).
  const { data: taxonomy } = useQuery<{ categories: { name: string; icon: string | null }[]; subcategories: { name: string; icon: string | null }[] }>({
    queryKey: ["/api/print/taxonomy"],
    enabled: !comingSoon,
  });
  const categoryIconByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of taxonomy?.categories ?? []) if (row.icon) map.set(row.name, row.icon);
    return map;
  }, [taxonomy?.categories]);
  const subcategoryIconByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of taxonomy?.subcategories ?? []) if (row.icon && !map.has(row.name)) map.set(row.name, row.icon);
    return map;
  }, [taxonomy?.subcategories]);

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
  const syncPrintProduct = useFavorites((s) => s.syncPrintProduct);
  useEffect(() => {
    syncPrintProduct(printFavoriteIds, cards);
  }, [printFavoriteIds, cards, syncPrintProduct]);

  // Company (printer) favorites — independent of the product favorites above
  // (docs/coffee_owner_favorites_marketplace_audit.md); derived from the same
  // already-fetched catalog cards.
  const { data: printCompanyFavoriteIds = EMPTY_IDS } = useQuery<number[]>({
    queryKey: ["/api/print-favorites/companies"],
    enabled: !!user && accessLevel === "approved",
  });
  const syncPrintCompany = useFavorites((s) => s.syncPrintCompany);
  useEffect(() => {
    syncPrintCompany(printCompanyFavoriteIds, cards);
  }, [printCompanyFavoriteIds, cards, syncPrintCompany]);

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
          categoryIconByName={categoryIconByName}
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
           subcategoryIconByName={subcategoryIconByName}
        />
      </div>

       <div className="max-w-7xl mx-auto px-4 py-8">
        {!printCompaniesLoading && (
          <PrintStoresSection
            companies={printCompanies}
            categoryId={categoryId}
            onSelect={(printerId) => navigate(`/print/stores/${printerId}`)}
            isDark={isDark}
          />
        )}
        <div className="mb-4">
           <h1 className={`font-bold text-lg ${t.textPrimary}`}>
            {categoryId || "Services d'impression"}
          </h1>
           <p className={`text-sm mt-0.5 ${t.textSubtle}`}>{isLoading ? "…" : `${filtered.length} service${filtered.length !== 1 ? "s" : ""} disponible${filtered.length !== 1 ? "s" : ""}`}</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((card) => (
              <PrintProductCard
                key={card.id}
                card={card}
                 onClick={() => setPreviewServiceId(card.id)}
                 isDark={isDark}
                 categoryIconByName={categoryIconByName}
              />
            ))}
          </div>
        )}
      </div>
      </>
      )}

      {/* Rendered before the Service/Company detail modals below
          (docs/maintenance_print_nested_modal_audit.md) — so when "Info/
          Détails" opens one of them, the detail dialog (mounted later in
          the DOM) stacks visually above this one, and Fast Search stays
          open underneath rather than being closed when Details opens. */}
      <PrintFastSearch
        open={fastSearchOpen}
        onClose={() => setFastSearchOpen(false)}
        cards={cards}
        onOpenDetail={(card) => setPreviewServiceId(card.id)}
      />
      <PrintBlacklistModal open={blacklistOpen} onClose={() => setBlacklistOpen(false)} isDark={isDark} printers={distinctPrinters} />

      {/* Service / Company details modals — replaces the old direct navigation to the
          full-page item detail for a quick preview; the full page (with its file-upload/
          material/quantity/cart customization) stays fully intact, one click away via
          the modal's own "Commander" button. */}
      {/* True nested-modal stacking (docs/print_marketing_ui_synchronization_audit.md
          Section 3/4): opening the Company modal from inside the Service modal (or vice
          versa) no longer nulls out the other's id — both stay mounted/open
          simultaneously, so closing the nested one reveals the still-open parent with
          its scroll position/selection/review state intact, instead of the old
          close-then-reopen ping-pong. */}
      <PrintServiceDetailModal
        serviceId={previewServiceId}
        open={previewServiceId != null}
        onClose={() => setPreviewServiceId(null)}
        onOpenCompany={(printerId) => setPreviewCompanyId(printerId)}
      />
      <PrintCompanyDetailModal
        printerUserId={previewCompanyId}
        open={previewCompanyId != null}
        onClose={() => setPreviewCompanyId(null)}
        onOpenService={(serviceId) => setPreviewServiceId(serviceId)}
      />
    </div>
  );
}
