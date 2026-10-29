import { useState, useMemo, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useThemeStore } from "@/store/theme-store";
import { useFavorites } from "@/hooks/use-favorites";
import { useToast } from "@/hooks/use-toast";
import {
  useMarketingProfileDetail, useMarketingReviews, useCreateMarketingReview,
  useMarketingProjects, useMarketingTaxonomy, useMarketingSubCategoryTaxonomy,
} from "@/hooks/use-marketing";
import { useSubmitMarketingReport } from "@/hooks/use-marketing-reports";
import { ReportModal } from "@/components/report-modal";
import { MarketingMappedServiceCard } from "@/components/marketing/marketing-mapped-service-card";
import { resolveMarketingCategoryIcon, resolveMarketingSubCategoryIcon } from "@/lib/marketing-category-icon";
import { MarketingAvailabilityModal } from "@/components/marketing/marketing-detail-modal";
import { MarketingServiceDetailModal } from "@/components/marketing/marketing-service-detail-modal";
import { ReviewModal } from "@/components/review-modal";
import { QuoteRequestDialog } from "@/pages/cafe/marketing/marketing-page";
import { useMarketingStoreNav } from "@/hooks/use-marketing-store-nav";
import { useCircularItemNav } from "@/hooks/use-circular-item-nav";
import { ItemNavButtons } from "@/components/shared/item-nav-buttons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import {
  Megaphone, ChevronLeft, Heart, Star, MapPin, Users, Clock, Flag, Search, SlidersHorizontal,
} from "lucide-react";
import type { MarketingMarketplaceCard } from "@/hooks/use-marketing";
import { formatDistance } from "@/lib/distance";

// Coffee Owner /marketing's dedicated Store page — the /marketing equivalent
// of /stores/:storeId and /print/stores/:printerId
// (docs/marketing_store_mapping_audit.md). Same Store-page experience/visual
// language as the Print reference (cover + overlapping logo + name/meta,
// sticky category pills, service grid, Info/hours modal, favorite, back
// navigation), fed entirely by the existing, real GET /api/marketing/profile/:userId
// (via useMarketingProfileDetail — the exact same data/cache
// MarketingDetailModal's "Agence" section already uses) — no second data
// source, no new backend. Clicking a service opens the existing
// MarketingServiceDetailModal; the existing Details-modal path from a Service
// card is untouched, both continue to exist.

function useTheme(isDark: boolean) {
  return {
    dk: isDark,
    pageBg: isDark ? "bg-gray-900" : "bg-gray-50",
    cardBg: isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    switcherBg: isDark ? "bg-gray-800" : "bg-gray-100",
    switcherActive: isDark ? "bg-gray-700 text-white shadow-sm" : "bg-white text-purple-600 shadow-sm",
    switcherInactive: isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700",
    stripBg: isDark ? "bg-gray-900/95 border-gray-800" : "bg-white border-gray-100",
    skeletonBg: isDark ? "bg-gray-800" : "bg-gray-100",
    emptyIcon: isDark ? "text-gray-700" : "text-gray-200",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    selectTrigger: isDark ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700" : "border-gray-200 bg-gray-50",
    // Same token as /marketing's own main page (t.selectContent) — fixes the
    // Sous-catégories dropdown's dark-mode contrast bug (it previously had no
    // text-color override, falling back to an unreadable default) and keeps
    // every select/dropdown panel on this page legible in both themes.
    selectContent: isDark
      ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white"
      : "bg-white border-gray-200 text-gray-900",
  };
}


export default function MarketingStoreDetailPage() {
  const [, params] = useRoute("/marketing/stores/:agencyId");
  const [, navigate] = useLocation();
  const agencyId = params?.agencyId ? Number(params.agencyId) : null;
  const { user } = useAuth();
  const { toast } = useToast();

  // Previous/Next Store navigation — browses /marketing's own currently
  // filtered Agences list (navIds), kept live-synced by marketing-page.tsx
  // (task: "Extend Store Navigation to Marketing, Academy, and Print").
  // Null when this page was opened directly, not from /marketing — both
  // buttons simply stay hidden rather than guessing, same convention as
  // the Coffee Owner Store Page's own Previous/Next Store buttons.
  const marketingStoreNavIds = useMarketingStoreNav((s) => s.navIds);
  const { prevId: prevAgencyId, nextId: nextAgencyId, hasNav: hasAgencyNav } = useCircularItemNav(
    agencyId,
    marketingStoreNavIds ?? [],
  );

  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);

  const { data, isLoading } = useMarketingProfileDetail(agencyId);
  const card = data?.card;

  const faved = useFavorites((s) => (card ? !!s.marketingAgencies[card.userId] : false));
  const toggleMarketingAgency = useFavorites((s) => s.toggleMarketingAgency);
  const favoritedServiceIds = useFavorites((s) => s.marketingServices);
  const toggleMarketingService = useFavorites((s) => s.toggleMarketingService);

  // Same taxonomy + shared resolver /marketing's own category filter and mapped
  // service cards use — never a second icon mapping
  // (docs/marketing_cards_final_layout_synchronization_audit.md).
  const { data: taxonomy = [] } = useMarketingTaxonomy();
  // Same subcategory icon source as /marketing's own main page (task:
  // "Academy, Print & Marketing Filter Consistency") — reused, not a second
  // mapping.
  const { data: subcategoryTaxonomy = [] } = useMarketingSubCategoryTaxonomy();

  const [categoryId, setCategoryId] = useState("");
  // Search + subcategory + sort (task: "Complete Store Page Filters") —
  // marketing services have no brand/flavor/size columns (only category/
  // subCategories/startingPriceInCents exist, see schema.ts's
  // marketingServices), so only the facets genuinely backed by real data
  // are added here. subCategories is a real multi-value array per service
  // (a service can belong to several subcategories at once), so this uses
  // the same checkbox multi-select pattern the main /marketing page already
  // uses for the same reason, instead of a single-select.
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filterSubCategories, setFilterSubCategories] = useState<string[]>([]);
  // Types/Notes/Villes (task: "Academy, Print & Marketing Filter
  // Consistency") — same facets as /marketing's own main page. Type/rating/
  // location are provider-level fields here (every service on this page
  // already belongs to the same agency), so each acts as an all-or-nothing
  // gate on the whole list rather than a per-service predicate — still real
  // data, just single-valued at this page's scope.
  const [filterType, setFilterType] = useState("");
  const [filterRating, setFilterRating] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [sortBy, setSortBy] = useState("");
  const toggleSubCategoryFilter = (name: string) => {
    setFilterSubCategories((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };
  const [infoOpen, setInfoOpen] = useState(false);
  const [previewServiceId, setPreviewServiceId] = useState<number | null>(null);
  const [quoteProvider, setQuoteProvider] = useState<MarketingMarketplaceCard | null>(null);

  // Avis + Signaler — same real data/hooks already used by MarketingDetailModal's
  // own identical icon row (docs/academy_print_marketing_store_synchronization_audit.md
  // Section 6-9), just added here next to Disponibilité.
  const { data: reviews = [] } = useMarketingReviews(agencyId);
  const { data: projects = [] } = useMarketingProjects();
  const createReview = useCreateMarketingReview();
  const submitReportMutation = useSubmitMarketingReport();
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [reviewProjectId, setReviewProjectId] = useState<number | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const eligibleProjects = useMemo(
    () => projects.filter((p) => p.marketingUserId === agencyId && p.status === "COMPLETED"),
    [projects, agencyId]
  );
  const myReviewByProject = useMemo(() => {
    const map = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews) if (r.cafeId === user?.id && r.marketingProjectId != null) map.set(r.marketingProjectId, r);
    return map;
  }, [reviews, user?.id]);
  const activeProjectId = reviewProjectId ?? eligibleProjects.find((p) => !myReviewByProject.has(p.id))?.id ?? eligibleProjects[0]?.id ?? null;
  const existingReview = activeProjectId ? myReviewByProject.get(activeProjectId) : undefined;

  const submitReview = async (rating: number, comment: string) => {
    if (!card || !activeProjectId) throw new Error("Aucun projet terminé à évaluer");
    await createReview.mutateAsync({ marketingUserId: card.userId, projectId: activeProjectId, rating, comment: comment.trim() || undefined });
  };

  const submitReport = async (rating: number, reason: string) => {
    if (!card) throw new Error("Prestataire introuvable");
    await submitReportMutation.mutateAsync({ targetUserId: card.userId, reason, rating });
  };

  useEffect(() => { window.scrollTo(0, 0); }, [agencyId]);

  const services = card?.services ?? [];
  const categories = useMemo(() => Array.from(new Set(services.map((s) => s.category).filter(Boolean))), [services]);
  const categoryFiltered = useMemo(() => (categoryId ? services.filter((s) => s.category === categoryId) : services), [services, categoryId]);
  const subCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    categoryFiltered.forEach((s) => (s.subCategories ?? []).forEach((name) => { if (name) set.add(name); }));
    return Array.from(set);
  }, [categoryFiltered]);
  // Type/Note/Ville options — same real fields as /marketing's own main page
  // (card.profileType/rating/location), single-valued here since this page
  // is scoped to one agency (task: "Academy, Print & Marketing Filter
  // Consistency").
  const allLocations = useMemo(() => (card?.location ? [card.location] : []), [card]);
  const filtered = useMemo(() => {
    let list = categoryFiltered;
    if (filterSubCategories.length > 0) list = list.filter((s) => filterSubCategories.some((name) => (s.subCategories ?? []).includes(name)));
    if (filterType && card?.profileType !== filterType) list = [];
    if (filterRating) { const min = parseFloat(filterRating) * 10; if (!card || card.rating < min) list = []; }
    if (filterLocation && card?.location !== filterLocation) list = [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => (s.title?.trim() || s.category || "").toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
    }
    if (sortBy === "price_asc") list = [...list].sort((a, b) => a.startingPriceInCents - b.startingPriceInCents);
    if (sortBy === "price_desc") list = [...list].sort((a, b) => b.startingPriceInCents - a.startingPriceInCents);
    return list;
  }, [categoryFiltered, filterSubCategories, filterType, filterRating, filterLocation, card, search, sortBy]);
  const hasActiveFilters = !!categoryId || filterSubCategories.length > 0 || !!filterType || !!filterRating || !!filterLocation || !!search.trim() || !!sortBy;

  // Previous/Next Service navigation (task: "Extend Detail Modal Navigation
  // to Marketing, Academy, and Print") — browses `filtered`, this store's
  // own currently-filtered mapped services, so navigation never crosses
  // into another agency's services and always respects the active
  // filters/search/sort, exactly like the main /marketing listing page's
  // own navigation.
  const storeServiceNavIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const { prevId: prevStoreServiceId, nextId: nextStoreServiceId, hasNav: hasStoreServiceNav } = useCircularItemNav(previewServiceId, storeServiceNavIds);
  const resetFilters = () => { setCategoryId(""); setFilterSubCategories([]); setFilterType(""); setFilterRating(""); setFilterLocation(""); setSearch(""); setSortBy(""); };

  // A Coffee Owner must not be able to reach a Store the marketplace itself
  // wouldn't show — same visibility intent as /print's Store page
  // (docs/marketing_store_mapping_audit.md).
  const isVisible = !!card && card.marketplaceVisible;

  if (isLoading) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
        <div className={`h-64 w-full animate-pulse ${t.skeletonBg}`} />
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => <div key={i} className={`h-56 rounded-2xl animate-pulse ${t.skeletonBg}`} />)}
        </div>
      </div>
    );
  }

  if (!card || !isVisible) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${t.pageBg} flex flex-col items-center justify-center py-24 gap-4 text-center`}>
        <Megaphone className={`w-14 h-14 ${t.emptyIcon}`} />
        <div>
          <p className={`font-semibold ${t.textPrimary}`}>Agence introuvable</p>
          <p className={`text-sm mt-1 ${t.textMuted}`}>Cette agence n'est plus disponible.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/marketing")}>Retour à la marketplace</Button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      <div className="relative h-64 sm:h-72 lg:h-80 overflow-hidden bg-gray-900">
        {card.coverImageUrl ? (
          <img src={card.coverImageUrl} alt={card.name} className="w-full h-full object-cover object-center" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Megaphone className="w-14 h-14 text-gray-500" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

        <button
          className="absolute top-4 left-4 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform z-10"
          onClick={() => navigate("/marketing")}
          data-testid="button-back-marketing-marketplace"
        >
          <ChevronLeft className="w-4.5 h-4.5 text-white" />
        </button>

        {/* Task: "Hero Theme Toggle Cleanup" — the redundant Dark/Light toggle that
            used to be here was removed; the navbar's own toggle, calling the same
            useThemeStore, remains the single theme control for this page. */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => toggleMarketingAgency({
              id: card.userId, name: card.name,
              initials: card.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
              type: "Agence", rating: card.rating / 10, portfolioImages: card.portfolioImages,
              location: card.location, available: !card.isOnVacation, profileImageUrl: card.profileImageUrl,
            })}
            data-testid="button-fav-marketing-store"
          >
            <Heart className={`w-4 h-4 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white/80"}`} />
          </button>
        </div>

        <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
          {card.reviewCount > 0 && (
            <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="text-xs font-bold text-white">{(card.rating / 10).toFixed(1)}</span>
              <span className="text-[10px] text-white/70">({card.reviewCount})</span>
            </div>
          )}
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setReportModalOpen(true)}
            data-testid="button-marketing-store-report"
            title="Signaler"
          >
            <Flag className="w-4 h-4 text-white/80" />
          </button>
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setInfoOpen(true)}
            data-testid="button-marketing-store-availability"
            title="Disponibilité"
          >
            <Clock className="w-4 h-4 text-white/80" />
          </button>
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setReviewsModalOpen(true)}
            data-testid="button-marketing-store-reviews"
            title="Avis"
          >
            <Star className="w-4 h-4 text-white/80" />
          </button>
          
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          {card.isOnVacation && <Badge className="bg-gray-900/80 text-white border-0 text-xs font-semibold shadow-sm">Indisponible</Badge>}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 relative z-20">
        <div className="flex items-end gap-4 -mt-8">
          <div className={`w-16 h-16 rounded-2xl border-4 shadow-lg overflow-hidden shrink-0 flex items-center justify-center transition-colors ${isDark ? "border-gray-900 bg-gray-800" : "border-gray-50 bg-white"}`}>
            {card.profileImageUrl ? (
              <img src={card.profileImageUrl} alt={card.name} className="w-full h-full object-cover" />
            ) : (
              <Megaphone className={`w-7 h-7 ${t.textMuted}`} />
            )}
          </div>
          <div className="relative top-4 min-w-0 flex-1 mt-2">
            <div className="flex items-start justify-between gap-x-3 gap-y-1 mt-4">
              <h1 className={`font-extrabold text-xl leading-tight break-words min-w-0 ${t.textPrimary}`} data-testid="text-marketing-store-name">{card.name}</h1>
              {hasAgencyNav && (
                <ItemNavButtons
                  isDark={isDark}
                  canPrev={prevAgencyId != null}
                  canNext={nextAgencyId != null}
                  onPrev={() => prevAgencyId != null && navigate(`/marketing/stores/${prevAgencyId}`)}
                  onNext={() => nextAgencyId != null && navigate(`/marketing/stores/${nextAgencyId}`)}
                  prevLabel="Agence précédente"
                  nextLabel="Agence suivante"
                  prevTestId="button-marketing-store-nav-prev"
                  nextTestId="button-marketing-store-nav-next"
                />
              )}
            </div>
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 ${isDark ? "text-purple-400" : "text-purple-600"}`}>
              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{services.length} service{services.length !== 1 ? "s" : ""}</span>
              {card.distanceKm != null && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{formatDistance(card.distanceKm)}</span>}
            </div>
          </div>
        </div>
        {card.description && <p className={`text-sm mt-6 ml-20 line-clamp-1 break-words ${t.textMuted}`}>{card.description}</p>}
      </div>

      {/* Sticky strip rendered whenever there's at least one service to search/
          sort, even if this agency happens to have no category taxonomy at
          all — same widened gating as store-detail-page.tsx's own search row
          (task: "Add Product and Pack Search to Individual Store Pages"). */}
      {(categories.length > 0 || services.length > 0) && (
        <div className={`sticky top-14 z-30 border-b mt-4 transition-colors ${t.stripBg}`}>
          <div className="max-w-7xl mx-auto px-4">
            {categories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto py-3" style={{ scrollbarWidth: "none" }}>
              <div className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                <button
                  onClick={() => { setCategoryId(""); setFilterSubCategories([]); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 transition-all text-[11px] font-semibold ${categoryId === "" ? t.switcherActive : t.switcherInactive}`}
                  data-testid="button-marketing-store-cat-all"
                >
                  <span className="text-base leading-none">📢</span>
                  <span>Tout</span>
                </button>
              </div>
              {categories.map((cat) => (
                <div key={cat} className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                  <button
                    onClick={() => { setCategoryId(categoryId === cat ? "" : cat); setFilterSubCategories([]); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${categoryId === cat ? t.switcherActive : t.switcherInactive}`}
                    data-testid={`button-marketing-store-cat-${cat}`}
                  >
                    <span className="text-base leading-none">{resolveMarketingCategoryIcon(cat, taxonomy)}</span>
                    <span className="whitespace-nowrap">{cat}</span>
                  </button>
                </div>
              ))}
            </div>
            )}

            {/* Search + subcategories (multi-select, real array data per
                service) + sort (task: "Complete Store Page Filters"). */}
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
                    data-testid="button-open-marketing-store-search"
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
                    placeholder="Rechercher un prestataire..."
                    className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
                    data-testid="input-marketing-store-search"
                  />
                </div>
              </div>
              {subCategoryOptions.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`h-7 text-xs rounded-full px-3 w-auto min-w-[150px] shrink-0 inline-flex items-center justify-between gap-1.5 border ${t.selectTrigger}`}
                      data-testid="select-marketing-store-subcategory"
                    >
                      {filterSubCategories.length > 0 ? `Sous-catégories (${filterSubCategories.length})` : "Sous-catégories"}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className={`${t.selectContent} max-h-56 overflow-y-auto [&::-webkit-scrollbar]:hidden`}
                    style={{ scrollbarWidth: "none" }}
                    align="start"
                  >
                    {subCategoryOptions.map((name) => (
                      <DropdownMenuCheckboxItem
                        key={name}
                        checked={filterSubCategories.includes(name)}
                        onCheckedChange={() => toggleSubCategoryFilter(name)}
                        data-testid={`checkbox-marketing-store-subcategory-${name}`}
                      >
                        {resolveMarketingSubCategoryIcon(name, subcategoryTaxonomy)} {name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Select value={filterType || "__all__"} onValueChange={(v) => setFilterType(v === "__all__" ? "" : v)}>
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] shrink-0 ${t.selectTrigger}`} data-testid="select-marketing-store-type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Types</SelectItem>
                  <SelectItem value="Agency">Agence</SelectItem>
                  <SelectItem value="Freelancer">Freelancer</SelectItem>
                  <SelectItem value="Studio">Studio</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRating || "__all__"} onValueChange={(v) => setFilterRating(v === "__all__" ? "" : v)}>
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`} data-testid="select-marketing-store-rating">
                  <SelectValue placeholder="Note min." />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Notes</SelectItem>
                  <SelectItem value="4.5">4.5+</SelectItem>
                  <SelectItem value="4.7">4.7+</SelectItem>
                  <SelectItem value="4.9">4.9+</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterLocation || "__all__"} onValueChange={(v) => setFilterLocation(v === "__all__" ? "" : v)}>
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] shrink-0 ${t.selectTrigger}`} data-testid="select-marketing-store-location">
                  <SelectValue placeholder="Ville" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Villes</SelectItem>
                  {allLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortBy || "recommended"} onValueChange={(v) => setSortBy(v === "recommended" ? "" : v)}>
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`}>
                  <SelectValue placeholder="Trier par" />
                </SelectTrigger>
                <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                  <SelectItem value="recommended" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Recommandé</SelectItem>
                  <SelectItem value="price_asc" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Prix croissant</SelectItem>
                  <SelectItem value="price_desc" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Prix décroissant</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className={`flex items-center gap-1 text-xs transition-colors ml-1 ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}
                  data-testid="button-reset-marketing-store-filters"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h2 className={`font-bold text-lg ${t.textPrimary}`}>Services Marketing</h2>
          <p className={`text-sm mt-0.5 ${t.textMuted}`}>{filtered.length} service{filtered.length !== 1 ? "s" : ""} disponible{filtered.length !== 1 ? "s" : ""}</p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Users className={`w-14 h-14 ${t.emptyIcon}`} />
            <div>
              <p className={`font-semibold ${t.textPrimary}`}>Aucun service trouvé</p>
              <p className={`text-sm mt-1 ${t.textMuted}`}>{hasActiveFilters ? "Essayez d'ajuster vos filtres." : "Cette agence n'a pas encore de service publié."}</p>
            </div>
            {hasActiveFilters && <Button size="sm" variant="outline" onClick={resetFilters}>Effacer tous les filtres</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((service) => (
              <MarketingMappedServiceCard
                key={service.id}
                id={service.id}
                title={service.title?.trim() || service.category}
                category={service.category}
                description={service.description}
                imageUrl={service.imageUrl}
                startingPriceInCents={service.startingPriceInCents}
                agencyName={card.name}
                agencyProfileImageUrl={card.profileImageUrl}
                agencyIsAvailable={!card.isOnVacation}
                rating={card.rating}
                reviewCount={card.reviewCount}
                categoryIcon={resolveMarketingCategoryIcon(service.category, taxonomy)}
                isFavorited={!!favoritedServiceIds[service.id]}
                onToggleFavorite={() => toggleMarketingService({
                  id: service.id, name: service.category, agencyUserId: card.userId, agencyName: card.name,
                  rating: card.rating / 10, image: service.imageUrl, location: card.location, priceInCents: service.startingPriceInCents,
                })}
                onClick={() => setPreviewServiceId(service.id)}
                isDark={isDark}
              />
            ))}
          </div>
        )}
      </div>

      <MarketingAvailabilityModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        providerName={card.name}
        weeklyHours={card.weeklyHours}
        isDark={isDark}
      />

      <ReviewModal
        open={reviewsModalOpen}
        onClose={() => setReviewsModalOpen(false)}
        targetName={card.name}
        reviewTypeLabel="Avis sur l'agence"
        existingReviews={reviews}
        myReview={existingReview ? { rating: existingReview.rating, comment: existingReview.comment } : null}
        defaultRating={5}
        canReview={eligibleProjects.length > 0}
        onSubmit={submitReview}
        isSubmitting={createReview.isPending}
        extraFormContent={eligibleProjects.length > 1 ? (
          <select
            className={`w-full text-xs rounded-lg border px-2 py-1.5 ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200"}`}
            value={activeProjectId ?? ""}
            onChange={(e) => setReviewProjectId(Number(e.target.value))}
            data-testid="select-store-review-project"
          >
            {eligibleProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.service || `Projet #${p.id}`} {myReviewByProject.has(p.id) ? "(déjà noté)" : ""}</option>
            ))}
          </select>
        ) : undefined}
      />

      {/* Signaler — redesigned on the Avis modal pattern (task: "Standardize
          the Remaining Report Modals Using the New Academy Design"), same
          shared ReportModal used by MarketingDetailModal and every other
          migrated report entry point. */}
      <ReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        targetName={card.name}
        onSubmit={submitReport}
        isSubmitting={submitReportMutation.isPending}
        accentClassName={isDark ? "text-purple-400" : "text-purple-600"}
      />

      <MarketingServiceDetailModal
        serviceId={previewServiceId}
        open={previewServiceId != null}
        onClose={() => setPreviewServiceId(null)}
        onRequestQuote={(p) => { setPreviewServiceId(null); setQuoteProvider(p); }}
        hasItemNav={hasStoreServiceNav}
        canNavPrev={prevStoreServiceId != null}
        canNavNext={nextStoreServiceId != null}
        onNavPrev={() => prevStoreServiceId != null && setPreviewServiceId(prevStoreServiceId)}
        onNavNext={() => nextStoreServiceId != null && setPreviewServiceId(nextStoreServiceId)}
      />

      <QuoteRequestDialog provider={quoteProvider} onClose={() => setQuoteProvider(null)} isDark={isDark} />
    </div>
  );
}
