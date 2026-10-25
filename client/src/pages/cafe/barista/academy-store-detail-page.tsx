import { useState, useMemo, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useThemeStore } from "@/store/theme-store";
import { useFavorites } from "@/hooks/use-favorites";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import {
  useAcademyProfileDetail, useAcademyReviews, useReportAcademy,
} from "@/hooks/use-barista-academy";
import { AcademyProfileAvailabilityModal } from "@/components/academy/academy-profile-modal";
import { AcademyDetailModal } from "@/components/academy/academy-detail-modal";
import { ReviewsModal } from "@/components/account/reviews-modal";
import { EnrollDialog } from "@/pages/cafe/barista/barista-academy-page";
import { useAcademyStoreNav } from "@/hooks/use-academy-store-nav";
import { useItemNav } from "@/hooks/use-item-nav";
import { ItemNavButtons } from "@/components/shared/item-nav-buttons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  GraduationCap, ChevronLeft, Heart, Star, MapPin, Award, Clock, Flag, X, Search, SlidersHorizontal, RotateCcw,
} from "lucide-react";
import type { AcademyCourseCard, AcademyCourseLevel } from "@/hooks/use-barista-academy";
import { AcademyMappedCourseCard } from "@/components/academy/academy-mapped-course-card";
import { formatDistance } from "@/lib/distance";

// Coffee Owner /academy's dedicated Store page — the /academy equivalent of
// /stores/:storeId, /print/stores/:printerId and /marketing/stores/:agencyId
// (docs/academy_store_mapping_audit.md). Same Store-page experience/visual
// language as the Print/Marketing reference (cover + overlapping logo +
// name/meta, service/course grid, Info/hours modal, favorite, back
// navigation), fed entirely by the existing, real GET /api/academy/profile/:userId
// (via useAcademyProfileDetail — the exact same data/cache AcademyProfileModal
// already uses) — no second data source, no new backend. Clicking a course
// opens the existing AcademyDetailModal + EnrollDialog, same as the main
// /academy page; the existing per-course path is untouched.

const LEVEL_COLORS: Record<AcademyCourseLevel, string> = {
  BEGINNER: "bg-green-100 text-green-700",
  ADVANCED: "bg-blue-100 text-blue-700",
  EXPERT: "bg-purple-100 text-purple-700",
};
const LEVEL_LABELS: Record<AcademyCourseLevel, string> = {
  BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert",
};

function useTheme(isDark: boolean) {
  return {
    dk: isDark,
    pageBg: isDark ? "bg-gray-900" : "bg-gray-50",
    cardBg: isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    skeletonBg: isDark ? "bg-gray-800" : "bg-gray-100",
    emptyIcon: isDark ? "text-gray-700" : "text-gray-200",
    switcherBg: isDark ? "bg-gray-800" : "bg-gray-100",
    switcherActive: isDark ? "bg-gray-700 text-white shadow-sm" : "bg-white text-indigo-600 shadow-sm",
    switcherInactive: isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700",
    stripBg: isDark ? "bg-gray-900/95 border-gray-800" : "bg-white border-gray-100",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    selectTrigger: isDark ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700" : "border-gray-200 bg-gray-50",
  };
}


export default function AcademyStoreDetailPage() {
  const [, params] = useRoute("/academy/stores/:academyUserId");
  const [, navigate] = useLocation();
  const academyUserId = params?.academyUserId ? Number(params.academyUserId) : null;

  // Previous/Next Store navigation — browses /academy's own currently
  // filtered Académies list (navIds), kept live-synced by
  // barista-academy-page.tsx (task: "Extend Store Navigation to
  // Marketing, Academy, and Print"). Null when this page was opened
  // directly, not from /academy — both buttons simply stay hidden rather
  // than guessing, same convention as the Coffee Owner Store Page's own
  // Previous/Next Store buttons.
  const academyStoreNavIds = useAcademyStoreNav((s) => s.navIds);
  const { prevId: prevAcademyUserId, nextId: nextAcademyUserId, hasNav: hasAcademyNav } = useItemNav(
    academyUserId,
    academyStoreNavIds ?? [],
  );

  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);

  const { data, isLoading } = useAcademyProfileDetail(academyUserId);
  const card = data?.card;
  const { toast } = useToast();

  const faved = useFavorites((s) => (card ? !!s.academyOrganisations[card.userId] : false));
  const toggleAcademyOrganisation = useFavorites((s) => s.toggleAcademyOrganisation);
  const favoritedCourses = useFavorites((s) => s.academyCourses);
  const toggleAcademy = useFavorites((s) => s.toggleAcademyCourse);

  const [levelId, setLevelId] = useState<AcademyCourseLevel | "">("");
  // Search + sort (task: "Complete Store Page Filters") — courses have no
  // subcategory/brand/flavor/size columns (see schema.ts's academyCourses:
  // only title/description/level/category/priceInCents exist), so only the
  // facets genuinely backed by real data are added: free-text search over
  // title/description, and price-based sort (recommended = no sort applied).
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [sortBy, setSortBy] = useState("");
  // Certification ("Formations") filter — same facet as /academy's own main
  // page "Certification" Select (task: "Academy, Print & Marketing Filter
  // Consistency"), added here for full parity.
  const [certFilter, setCertFilter] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [previewCourseId, setPreviewCourseId] = useState<number | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<AcademyCourseCard | null>(null);

  // Avis + Signaler — same real data/hooks already used by AcademyProfileModal's
  // own identical icon row (docs/academy_print_marketing_store_synchronization_audit.md
  // Section 6-9), just added here next to Disponibilité. Avis is read-only here —
  // AcademyProfileModal's own org-level Avis has no review-submission form either,
  // since a Coffee Owner's review is tied to a specific course/registration
  // (surfaced in AcademyDetailModal), not the organisation itself.
  const { data: reviews = [] } = useAcademyReviews(academyUserId);
  const reportAcademy = useReportAcademy();
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const submitReport = () => {
    if (!card || !reportReason.trim()) return;
    reportAcademy.mutate(
      { academyUserId: card.userId, reason: reportReason.trim() },
      {
        onSuccess: () => { toast({ title: "Signalement envoyé", description: "L'équipe Admin va l'examiner." }); setReportModalOpen(false); setReportReason(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  useEffect(() => { window.scrollTo(0, 0); }, [academyUserId]);

  const courses = card?.courses ?? [];
  // Level filter — scoped to this one academy's own courses, same filter
  // dimension /academy's own main-page filter bar already uses (Academy
  // courses have no `category` field the way Print/Marketing services do)
  // (docs/academy_print_marketing_store_previous_work_audit.md Section F).
  const filtered = useMemo(() => {
    let list = levelId ? courses.filter((c) => c.level === levelId) : courses;
    if (certFilter) list = list.filter((c) => String(c.hasCertification) === certFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q));
    }
    if (sortBy === "price_asc") list = [...list].sort((a, b) => a.priceInCents - b.priceInCents);
    if (sortBy === "price_desc") list = [...list].sort((a, b) => b.priceInCents - a.priceInCents);
    return list;
  }, [courses, levelId, certFilter, search, sortBy]);
  const hasActiveFilters = !!levelId || !!certFilter || !!search.trim() || !!sortBy;

  // Previous/Next Formation navigation (task: "Extend Detail Modal
  // Navigation to Marketing, Academy, and Print") — browses `filtered`,
  // this store's own currently-filtered mapped formations, so navigation
  // never crosses into another academy's formations and always respects
  // the active filters/search/sort, exactly like the main /academy
  // listing page's own navigation.
  const storeCourseNavIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const { prevId: prevStoreCourseId, nextId: nextStoreCourseId, hasNav: hasStoreCourseNav } = useItemNav(previewCourseId, storeCourseNavIds);
  const resetFilters = () => { setLevelId(""); setCertFilter(""); setSearch(""); setSortBy(""); };

  // A Coffee Owner must not be able to reach a Store the marketplace itself
  // wouldn't show — same visibility intent as /print's/marketing's Store
  // pages (docs/academy_store_mapping_audit.md).
  const isVisible = !!card && card.marketplaceVisible;

  if (isLoading) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
        <div className={`h-64 w-full animate-pulse ${t.skeletonBg}`} />
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(10)].map((_, i) => <div key={i} className={`h-72 rounded-2xl animate-pulse ${t.skeletonBg}`} />)}
        </div>
      </div>
    );
  }

  if (!card || !isVisible) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${t.pageBg} flex flex-col items-center justify-center py-24 gap-4 text-center`}>
        <GraduationCap className={`w-14 h-14 ${t.emptyIcon}`} />
        <div>
          <p className={`font-semibold ${t.textPrimary}`}>Académie introuvable</p>
          <p className={`text-sm mt-1 ${t.textMuted}`}>Cette académie n'est plus disponible.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/academy")}>Retour à la marketplace</Button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      <div className="relative h-64 sm:h-72 lg:h-80 overflow-hidden bg-gray-900">
        {card.coverImageUrl ? (
          <img src={card.coverImageUrl} alt={card.name} className="w-full h-full object-cover object-center" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><GraduationCap className="w-14 h-14 text-gray-500" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

        <button
          className="absolute top-4 left-4 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform z-10"
          onClick={() => navigate("/academy")}
          data-testid="button-back-academy-marketplace"
        >
          <ChevronLeft className="w-4.5 h-4.5 text-white" />
        </button>

        {/* Task: "Hero Theme Toggle Cleanup" — the redundant Dark/Light toggle that
            used to be here was removed; the navbar's own toggle, calling the same
            useThemeStore, remains the single theme control for this page. */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => toggleAcademyOrganisation({
              id: card.userId, name: card.name,
              initials: card.name.split(/\s+/).filter(Boolean).map((p: string) => p[0]).join("").slice(0, 2).toUpperCase(),
              type: "Académie", rating: card.rating / 10, portfolioImages: card.portfolioImages,
              location: card.location, available: !card.isOnVacation, profileImageUrl: card.profileImageUrl,
            })}
            data-testid="button-fav-academy-store"
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
            onClick={() => setInfoOpen(true)}
            data-testid="button-academy-store-availability"
            title="Disponibilité"
          >
            <Clock className="w-4 h-4 text-white/80" />
          </button>
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setReviewsModalOpen(true)}
            data-testid="button-academy-store-reviews"
            title="Avis"
          >
            <Star className="w-4 h-4 text-white/80" />
          </button>
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setReportModalOpen(true)}
            data-testid="button-academy-store-report"
            title="Signaler"
          >
            <Flag className="w-4 h-4 text-white/80" />
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
              <GraduationCap className={`w-7 h-7 ${t.textMuted}`} />
            )}
          </div>
          <div className="relative top-4 min-w-0 flex-1 mt-2">
            <div className="flex items-start justify-between gap-x-3 gap-y-1 mt-4">
              <h1 className={`font-extrabold text-xl leading-tight break-words min-w-0 ${t.textPrimary}`} data-testid="text-academy-store-name">{card.name}</h1>
              {hasAcademyNav && (
                <ItemNavButtons
                  isDark={isDark}
                  canPrev={prevAcademyUserId != null}
                  canNext={nextAcademyUserId != null}
                  onPrev={() => prevAcademyUserId != null && navigate(`/academy/stores/${prevAcademyUserId}`)}
                  onNext={() => nextAcademyUserId != null && navigate(`/academy/stores/${nextAcademyUserId}`)}
                  prevLabel="Académie précédente"
                  nextLabel="Académie suivante"
                  prevTestId="button-academy-store-nav-prev"
                  nextTestId="button-academy-store-nav-next"
                />
              )}
            </div>
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
              <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" />{courses.length} formation{courses.length !== 1 ? "s" : ""}</span>
              {card.distanceKm != null && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{formatDistance(card.distanceKm)}</span>}
            </div>
          </div>
        </div>
        {card.description && <p className={`text-sm mt-6 ml-20 line-clamp-1 break-words ${t.textMuted}`}>{card.description}</p>}
      </div>

      {/* Task: "Academy, Print & Marketing Filter Consistency" — the separate
          level-shortcut pill group (Tout/Expert/Avancé/Débutant) that used to
          live here is removed; level filtering is still available, now via
          the same "Niveaux" Select /academy's own main page uses, alongside
          the same Certification ("Formations") Select and search, so this
          store page's filter set matches /academy exactly. */}
      {courses.length > 0 && (
        <div className={`sticky top-14 z-30 border-b mt-4 transition-colors ${t.stripBg}`}>
          <div className="max-w-7xl mx-auto px-4">
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
                    data-testid="button-open-academy-store-search"
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
                    placeholder="Rechercher une formation..."
                    className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
                    data-testid="input-academy-store-search"
                  />
                </div>
              </div>
              <Select value={levelId || "__all__"} onValueChange={(v) => setLevelId(v === "__all__" ? "" : v as AcademyCourseLevel)}>
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`} data-testid="select-academy-store-level">
                  <SelectValue placeholder="Niveau" />
                </SelectTrigger>
                <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                  <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Niveaux</SelectItem>
                  <SelectItem value="BEGINNER" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Débutant</SelectItem>
                  <SelectItem value="ADVANCED" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Avancé</SelectItem>
                  <SelectItem value="EXPERT" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Expert</SelectItem>
                </SelectContent>
              </Select>
              <Select value={certFilter || "__all__"} onValueChange={(v) => setCertFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] shrink-0 ${t.selectTrigger}`} data-testid="select-academy-store-cert">
                  <SelectValue placeholder="Certification" />
                </SelectTrigger>
                <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                  <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Formations</SelectItem>
                  <SelectItem value="true" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Avec certification</SelectItem>
                  <SelectItem value="false" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Sans certification</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy || "recommended"} onValueChange={(v) => setSortBy(v === "recommended" ? "" : v)}>
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`} data-testid="select-academy-store-sort">
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
                  className={`flex items-center gap-1 text-xs transition-colors ml-1 shrink-0 whitespace-nowrap ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}
                  data-testid="button-reset-academy-store-filters"
                >
                  <RotateCcw className="w-3 h-3" /> Réinitialiser
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 mt-4">
        <div className="mb-4">
          <h2 className={`font-bold text-lg ${t.textPrimary}`}>Formations</h2>
          <p className={`text-sm mt-0.5 ${t.textMuted}`}>{filtered.length} formation{filtered.length !== 1 ? "s" : ""} disponible{filtered.length !== 1 ? "s" : ""}</p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <GraduationCap className={`w-14 h-14 ${t.emptyIcon}`} />
            <div>
              <p className={`font-semibold ${t.textPrimary}`}>{courses.length === 0 ? "Aucune formation disponible" : "Aucune formation trouvée"}</p>
              <p className={`text-sm mt-1 ${t.textMuted}`}>{courses.length === 0 ? "Cette académie n'a pas encore de formation publiée." : "Essayez d'ajuster vos filtres."}</p>
            </div>
            {hasActiveFilters && courses.length > 0 && <Button size="sm" variant="outline" onClick={resetFilters}>Effacer tous les filtres</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((course) => {
              const coverImage = course.imageUrl || course.academyProfileImageUrl;
              return (
                <AcademyMappedCourseCard
                  key={course.id}
                  id={course.id}
                  title={course.title}
                  category={course.category}
                  description={course.description}
                  imageUrl={coverImage}
                  priceInCents={course.priceInCents}
                  academyName={course.academyName}
                  academyProfileImageUrl={course.academyProfileImageUrl}
                  academyIsAvailable={course.academyIsAvailable}
                  rating={course.rating}
                  reviewCount={course.reviewCount}
                  levelLabel={LEVEL_LABELS[course.level]}
                  levelColorClass={LEVEL_COLORS[course.level]}
                  hasCertification={course.hasCertification}
                  duration={course.duration}
                  isFavorited={!!favoritedCourses[course.id]}
                  onToggleFavorite={() => toggleAcademy({
                    id: course.id, title: course.title, provider: course.academyName, duration: course.duration,
                    rating: course.rating / 10, price: course.priceInCents, level: course.level,
                    location: course.location || course.academyLocation, hasCertification: course.hasCertification,
                    imageUrl: coverImage,
                  })}
                  onClick={() => setPreviewCourseId(course.id)}
                  isDark={isDark}
                />
              );
            })}
          </div>
        )}
      </div>

      <AcademyProfileAvailabilityModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        academyName={card.name}
        weeklyHours={card.weeklyHours}
        isDark={isDark}
      />

      <ReviewsModal
        open={reviewsModalOpen}
        onClose={() => setReviewsModalOpen(false)}
        professionalName={card.name}
        rating={card.rating / 10}
        reviewCount={card.reviewCount ?? reviews.length}
        reviews={reviews}
        isDark={isDark}
      />

      {/* Signaler — same modal chrome as the Disponibilité modal above
          (rounded-[2rem] container, circular close button), close button on
          the right, standardized across the app this session. */}
      <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
        <DialogContent className={`sm:max-w-md p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden ${isDark ? "bg-gray-900" : "bg-white"}`}>
          <VisuallyHidden><DialogTitle>Signaler {card.name}</DialogTitle></VisuallyHidden>
          <div className="px-5 pt-5 pb-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8" />
              <span className={`text-[13px] font-semibold tracking-tight leading-tight ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler {card.name}</span>
              <button onClick={() => { setReportModalOpen(false); setReportReason(""); }} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <Textarea
              placeholder="Décrivez le problème…"
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className={isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200"}
              data-testid="input-store-report-reason"
            />
            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="outline" className={t.textPrimary} onClick={() => { setReportModalOpen(false); setReportReason(""); }}>Annuler</Button>
              <Button size="sm" variant="destructive" onClick={submitReport} disabled={!reportReason.trim() || reportAcademy.isPending} data-testid="button-submit-store-report">
                {reportAcademy.isPending ? "Envoi…" : "Envoyer le signalement"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AcademyDetailModal
        courseId={previewCourseId}
        open={previewCourseId != null}
        onClose={() => setPreviewCourseId(null)}
        onEnroll={(c) => { setPreviewCourseId(null); setEnrollTarget(c); }}
        hasItemNav={hasStoreCourseNav}
        canNavPrev={prevStoreCourseId != null}
        canNavNext={nextStoreCourseId != null}
        onNavPrev={() => prevStoreCourseId != null && setPreviewCourseId(prevStoreCourseId)}
        onNavNext={() => nextStoreCourseId != null && setPreviewCourseId(nextStoreCourseId)}
      />

      <EnrollDialog course={enrollTarget} open={!!enrollTarget} onClose={() => setEnrollTarget(null)} isDark={isDark} />
    </div>
  );
}
