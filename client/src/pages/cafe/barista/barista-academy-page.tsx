import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import baristaHeroImg from "@assets/8d80708f-be87-4e8d-8805-f60e3c292914-1000x562.5-rjZKXkudAsN4bH_1780680229193.jpg";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useThemeStore } from "@/store/theme-store";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { useFallbackImage } from "@/hooks/use-fallback-image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Star,
  Clock,
  Award,
  Search,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle,
  GraduationCap,
  Zap,
  Ban,
} from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import { useHeroActionSettings } from "@/hooks/use-hero-actions";
import { useServiceHeroConfig } from "@/hooks/use-service-hero-config";
import { ServiceHeroShell, H_ALIGN_ICON_MX, H_ALIGN_ROW_JUSTIFY, getHeroSubtitleColorStyle } from "@/components/shared/service-hero";
import {
  useAcademyCourses, useAcademyCompanies,
  type AcademyCourseCard, type AcademyCourseLevel,
} from "@/hooks/use-barista-academy";
import { AcademyDetailModal } from "@/components/academy/academy-detail-modal";
import { AcademyFastSearch } from "@/components/academy/academy-fast-search";
import { AcademyBlacklistModal } from "@/components/academy/academy-blacklist-modal";
import { AcademyMappedCourseCard } from "@/components/academy/academy-mapped-course-card";
import { AcademyStoresSection } from "@/components/academy/academy-stores-section";
import { EnrollDialog } from "@/components/academy/academy-enroll-dialog";

// Barista Academy — split out of the former combined /barista page into its
// own independent page/service (route /academy). This is now backed by REAL
// data: courses ("formations") published by Barista Academy accounts, read
// live from /api/academy/courses — no more static TRAINING_PROGRAMS array.
// See client/src/hooks/use-barista-academy.ts for the data layer and
// client/src/pages/barista-academy/courses.tsx for where Academies manage
// this content. Design/layout preserved exactly from the previous static
// version — only the data source and the "S'inscrire" action changed.

// ── Access helper (mirrors barista-page.tsx's own copy) ──────────────────────

// Stable shared reference for the favorites-id query default below — see
// maintenance-page.tsx's identical constant for the full "Maximum update
// depth exceeded" explanation (a fresh `[]` literal there never lets the
// syncAcademy effect's dependency settle while the query stays disabled for
// a non-approved/logged-out viewer).
const EMPTY_IDS: number[] = [];

type AccessLevel = "visitor" | "pending" | "approved";

function useAccessLevel(): AccessLevel {
  const { user } = useAuth();
  if (!user) return "visitor";
  if (["SUPER_ADMIN", "ADMIN", "SUPPLIER"].includes(user.role)) return "approved";
  if (user.role === "CAFE_OWNER" && (user as any).status === "approved") return "approved";
  return "pending";
}

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
    selectContent: isDark
      ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white"
      : "bg-white border-gray-200 text-gray-900",
    // Academy Filter Design — identical token to /barista, /maintenance and
    // /marketing's own `stripBg`, used for the same full-bleed sticky filter
    // strip instead of a floating card.
    stripBg: isDark ? "bg-gray-900/95 border-gray-800" : "bg-white border-gray-100",
  };
}

const LEVEL_COLORS: Record<AcademyCourseLevel, string> = {
  BEGINNER: "bg-green-100 text-green-700",
  ADVANCED: "bg-blue-100 text-blue-700",
  EXPERT: "bg-purple-100 text-purple-700",
};
const LEVEL_LABELS: Record<AcademyCourseLevel, string> = {
  BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert",
};

function StarRating({ rating, isDark = false }: { rating: number; isDark?: boolean }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      <Star className="w-3 h-3 fill-amber-400" />
      <span className={`text-[11px] font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{rating.toFixed(1)}</span>
    </span>
  );
}

// ── Enrollment dialog ─────────────────────────────────────────────────────────

// EnrollDialog moved to components/academy/academy-enroll-dialog.tsx (analyse.md
// "Aligner Espace Barista Marketplace → Académie sur Coffee Owner /academy") so Barista
// Marketplace can reuse it instead of a duplicated implementation. Re-exported here so
// no other existing import of `EnrollDialog` from this page breaks.
export { EnrollDialog };

// ── Academy Store card/section ──────────────────────────────────────────────
// Extracted to components/academy/academy-stores-section.tsx (analyse.md
// "Aligner Espace Barista Marketplace → Académie sur Coffee Owner /academy")
// so Barista Marketplace can reuse the exact same academy-discovery card/
// section instead of a duplicated implementation. Behavior unchanged here —
// Selecting a card still navigates to a dedicated Academy Store page
// (/academy/stores/:academyUserId) — the existing per-course AcademyDetailModal
// path is untouched, both continue to exist for their respective purposes.

// ── Training Card ─────────────────────────────────────────────────────────────
// Barista marketplace card as the visual/UX reference (Part 3): left = photo,
// right = info, whole card is the click target opening the details modal.
// Unlike Marketing's card, Barista's OWN card keeps its action buttons
// (Heart favorite + primary action) with stopPropagation — Academy follows
// that same reference exactly (Part 24).

function TrainingCard({
  course,
  canAct,
  onOpenDetail,
  isDark,
}: {
  course: AcademyCourseCard;
  canAct: boolean;
  onOpenDetail: (course: AcademyCourseCard) => void;
  isDark: boolean;
}) {
  const faved = useFavorites((s) => !!s.academyCourses[course.id]);
  const toggleAcademy = useFavorites((s) => s.toggleAcademyCourse);
  const coverImage = course.imageUrl || course.academyProfileImageUrl;

  return (
    <AcademyMappedCourseCard
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
      isFavorited={faved}
      onToggleFavorite={() => toggleAcademy({
        id: course.id, title: course.title, provider: course.academyName, duration: course.duration,
        rating: course.rating / 10, price: course.priceInCents, level: course.level,
        location: course.location || course.academyLocation, hasCertification: course.hasCertification,
        imageUrl: coverImage,
      })}
      onClick={() => onOpenDetail(course)}
      isDark={isDark}
    />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BaristaAcademyPage({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const accessLevel = useAccessLevel();
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);
  const { settings: heroActions } = useHeroActionSettings();
  const { config: heroConfig } = useServiceHeroConfig("ACADEMY");

  const [trainingSearch, setTrainingSearch] = useState("");
  // Mobile collapsible search (mobile_filters_darkmode_audit.md) — presentation only.
  const [trainingSearchOpen, setTrainingSearchOpen] = useState(false);
  const trainingSearchInputRef = useRef<HTMLInputElement>(null);
  const [trainingLevel, setTrainingLevel] = useState("");
  const [trainingCert, setTrainingCert] = useState("");
  // "Recommandé" sort (task: "Academy, Print & Marketing Filter Consistency")
  // — same Recommandé/Prix croissant/Prix décroissant pattern already added
  // to the Academy store page in a previous task; applied client-side on
  // top of the already-fetched/filtered course list, same as there.
  const [trainingSortBy, setTrainingSortBy] = useState("");
  const [enrollTarget, setEnrollTarget] = useState<AcademyCourseCard | null>(null);
  const [detailCourseId, setDetailCourseId] = useState<number | null>(null);
  const [fastSearchOpen, setFastSearchOpen] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);

  // Fetch the FULL eligible course set once (task: "Synchronize All Filters
  // and Display Only Options With Matching Results") — search/level/
  // certification used to be passed straight through to the server
  // (useAcademyCourses({search, level, certification})), so the client only
  // ever held ONE already-filtered combination and had no way to know which
  // Niveau/Formations options would actually produce results under the other
  // active filters (the two Selects below were a hardcoded 3- and 2-value
  // list regardless of data). The endpoint already supports an unfiltered
  // call (confirmed in server/storage.ts getPublishedAcademyCourses — filters
  // are optional), so filtering moves client-side here, matching every other
  // marketplace page's architecture and avoiding any extra API requests.
  const { data: courses = [], isLoading } = useAcademyCourses();
  const { data: academyCompanies = [] } = useAcademyCompanies();
  // Unify Service and Store Search + Remove Navbar Search Inputs — same query
  // as the courses search above, matched against this academy's own name/
  // description, so a provider is discoverable even when none of its own
  // course names match. Deliberately NOT filtered by trainingLevel/
  // trainingCert — those are course-specific attributes, not relevant to an
  // academy's own store card. AcademyStoresSection itself stays untouched
  // (it's also reused by Espace Barista Marketplace → Académie); only the
  // list passed into it here is narrowed.
  const filteredAcademyCompanies = useMemo(() => {
    if (!trainingSearch.trim()) return academyCompanies;
    const q = trainingSearch.trim().toLowerCase();
    return academyCompanies.filter((c) => c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q));
  }, [academyCompanies, trainingSearch]);

  // Same search haystack as the server's own getPublishedAcademyCourses
  // (title/description/academyName/category) so client-side filtering stays
  // behaviorally identical to what the server used to do.
  const searchFilteredCourses = useMemo(() => {
    if (!trainingSearch.trim()) return courses;
    const q = trainingSearch.trim().toLowerCase();
    return courses.filter((c) => [c.title, c.description, c.academyName, c.category].join(" ").toLowerCase().includes(q));
  }, [courses, trainingSearch]);

  type AcademyDim = "level" | "certification";
  const withoutDim = (exclude: AcademyDim) => {
    let list = searchFilteredCourses;
    if (exclude !== "level" && trainingLevel) list = list.filter((c) => c.level === trainingLevel);
    if (exclude !== "certification" && trainingCert) list = list.filter((c) => String(c.hasCertification) === trainingCert);
    return list;
  };

  // Niveau/Formations options — only levels/certification-states actually
  // represented by at least one eligible, currently-matching course, derived
  // with its own dimension excluded so the current selection never vanishes
  // from its own list while still narrowing in response to the other filter.
  const levelOptions = useMemo(() => {
    const set = new Set<string>();
    withoutDim("level").forEach((c) => { if (c.level) set.add(c.level); });
    return Array.from(set);
  }, [searchFilteredCourses, trainingCert]);

  const certOptions = useMemo(() => {
    const base = withoutDim("certification");
    return { withCert: base.some((c) => c.hasCertification), withoutCert: base.some((c) => !c.hasCertification) };
  }, [searchFilteredCourses, trainingLevel]);

  useEffect(() => { if (trainingLevel && !levelOptions.includes(trainingLevel)) setTrainingLevel(""); }, [levelOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (trainingCert === "true" && !certOptions.withCert) setTrainingCert("");
    if (trainingCert === "false" && !certOptions.withoutCert) setTrainingCert("");
  }, [certOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredTraining = useMemo(() => {
    let list = searchFilteredCourses;
    if (trainingLevel) list = list.filter((c) => c.level === trainingLevel);
    if (trainingCert) list = list.filter((c) => String(c.hasCertification) === trainingCert);
    if (trainingSortBy === "price_asc") list = [...list].sort((a, b) => a.priceInCents - b.priceInCents);
    if (trainingSortBy === "price_desc") list = [...list].sort((a, b) => b.priceInCents - a.priceInCents);
    return list;
  }, [searchFilteredCourses, trainingLevel, trainingCert, trainingSortBy]);
  const hasTrainingFilters = !!(trainingSearch || trainingLevel || trainingCert || trainingSortBy);
  const certifiedCount = useMemo(() => courses.filter((c) => c.hasCertification).length, [courses]);

  const canAct = !!user && user.role === "CAFE_OWNER" && accessLevel === "approved";

  // Hydrate favorite hearts from the database, mirroring barista-page.tsx's
  // pattern — without this Academy favorites never survived a page reload.
  const { data: favoriteIds = EMPTY_IDS } = useQuery<number[]>({
    queryKey: ["/api/academy-favorites"],
    enabled: !!user && accessLevel === "approved",
  });
  const syncAcademy = useFavorites((s) => s.syncAcademyCourse);
  useEffect(() => {
    if (isLoading) return;
    syncAcademy(favoriteIds, courses);
  }, [favoriteIds, courses, isLoading, syncAcademy]);

  // Organisation (academy) favorites — independent of the course favorites
  // above (docs/coffee_owner_favorites_marketplace_audit.md); derived from
  // the same already-fetched course cards.
  const { data: organisationFavoriteIds = EMPTY_IDS } = useQuery<number[]>({
    queryKey: ["/api/academy-favorites/organisations"],
    enabled: !!user && accessLevel === "approved",
  });
  const syncAcademyOrganisation = useFavorites((s) => s.syncAcademyOrganisation);
  useEffect(() => {
    if (isLoading) return;
    syncAcademyOrganisation(organisationFavoriteIds, courses);
  }, [organisationFavoriteIds, courses, isLoading, syncAcademyOrganisation]);

  const handleEnroll = (course: AcademyCourseCard) => {
    if (!canAct) {
      if (!user) { navigate("/login"); return; }
      toast({ title: "Action réservée aux cafés approuvés", variant: "destructive" });
      return;
    }
    setEnrollTarget(course);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <ServiceHeroShell
        config={heroConfig}
        defaultBackground={
          <>
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80"
              style={{ backgroundImage: `url(${baristaHeroImg})` }}
            />
            <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-indigo-950/90" : "bg-gradient-to-br from-indigo-600/90 via-indigo-700/85 to-violet-700/90"}`} />
          </>
        }
        controlsRow={
          /* The global navbar theme control is the single Dark/Light toggle
              now, so the duplicated hero one is gone; Fast Search/Report stay
              Admin-toggleable per service (see /api/hero-actions). */
          <div className="relative flex justify-end items-center gap-2 mb-9">
            {canAct && heroActions.ACADEMY.reportEnabled && (
              <button
                onClick={() => setBlacklistOpen(true)}
                aria-label="Académies signalées"
                title="Académies signalées"
                data-testid="button-open-blacklist"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-red-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Ban className="w-4 h-4" />
              </button>
            )}
            {canAct && heroActions.ACADEMY.fastSearchEnabled && (
              <button
                onClick={() => setFastSearchOpen(true)}
                aria-label="Fast Search"
                title="Fast Search — parcourir les formations"
                data-testid="button-open-fast-search"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-indigo-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Zap className="w-4 h-4" />
              </button>
            )}
          </div>
        }
      >
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-5 backdrop-blur-sm ${H_ALIGN_ICON_MX[heroConfig.horizontalAlign]} ${isDark ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}>
          <GraduationCap className={`w-8 h-8 ${isDark ? "text-amber-400" : "text-white"}`} />
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
          BigBoss <span className={isDark ? "text-amber-400" : "text-amber-200"}>ACADEMY</span>
        </h1>
        {heroConfig.subtitleEnabled && (
          <p className={`text-base mb-4 max-w-xl ${H_ALIGN_ICON_MX[heroConfig.horizontalAlign]} ${isDark ? "text-white" : "text-indigo-100"}`} style={getHeroSubtitleColorStyle(heroConfig, isDark)}>
            {heroConfig.subtitle ?? "Formez votre équipe avec des programmes barista professionnels"}
          </p>
        )}
        {heroConfig.infoRowEnabled && (
          <div className={`flex items-center gap-6 flex-wrap text-sm ${H_ALIGN_ROW_JUSTIFY[heroConfig.horizontalAlign]} ${isDark ? "text-white" : "text-indigo-100"}`}>
            <span className="flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4" />
              {courses.length} formations
            </span>
            <span className="flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              {certifiedCount} certifications
            </span>
          </div>
        )}
      </ServiceHeroShell>

      {comingSoon ? (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${t.mutedBg}`}>
            <Clock className="w-8 h-8 text-indigo-600" />
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
      {accessLevel === "pending" && (
        <div className={`${isDark ? "bg-amber-950/40 border-amber-900/60" : "bg-amber-50 border-amber-200"} border-b px-4 py-3`}>
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-800 text-sm font-medium">
            <CheckCircle className="w-4 h-4 shrink-0" />
            Votre compte est en attente d'approbation. Vous pourrez vous inscrire aux formations une fois approuvé.
          </div>
        </div>
      )}

      {/* Academy Filter Design — same full-bleed sticky strip structure as
          /barista, /maintenance and /marketing (border-b + stripBg, outside the
          max-w-7xl content wrapper) instead of the previous single rounded,
          bordered, padded card nested inside it. Academy has only one filter
          row (no parent-category chip switcher), so it gets one strip — the
          same shape as those pages' own second ("controls") strip. Same
          sticky-below-navbar positioning (top-14 z-30) as before. */}
      <div className="sticky top-14 z-30">
        <div className={`border-b py-2 px-4 ${t.stripBg}`}>
          <div
            className="max-w-7xl mx-auto flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            <SlidersHorizontal className={`w-3.5 h-3.5 ${t.textSubtle} shrink-0`} />
            <div className="relative shrink-0 sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
              {!trainingSearchOpen && (
                <button
                  type="button"
                  className={`sm:hidden h-7 w-7 rounded-full border flex items-center justify-center shrink-0 ${t.inputBg}`}
                  onClick={() => { setTrainingSearchOpen(true); setTimeout(() => trainingSearchInputRef.current?.focus(), 0); }}
                  aria-label="Rechercher"
                  data-testid="button-open-training-search"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              )}
              <div className={`${trainingSearchOpen ? "flex" : "hidden"} sm:flex items-center relative w-44 sm:w-full`}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  ref={trainingSearchInputRef}
                  value={trainingSearch}
                  onChange={(e) => setTrainingSearch(e.target.value)}
                  onBlur={() => { if (!trainingSearch) setTrainingSearchOpen(false); }}
                  placeholder="Rechercher une formation..."
                  className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
                  data-testid="input-training-search"
                />
              </div>
            </div>
            <Select
              value={trainingLevel || "__all__"}
              onValueChange={(v) => setTrainingLevel(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.inputBg}`} data-testid="select-training-level">
                <SelectValue placeholder="Niveau" />
              </SelectTrigger>
              <SelectContent className={t.selectContent}>
                <SelectItem value="__all__">Niveaux</SelectItem>
                {levelOptions.map((v) => <SelectItem key={v} value={v}>{LEVEL_LABELS[v as AcademyCourseLevel] ?? v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={trainingCert || "__all__"}
              onValueChange={(v) => setTrainingCert(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] shrink-0 ${t.inputBg}`} data-testid="select-training-cert">
                <SelectValue placeholder="Certification" />
              </SelectTrigger>
              <SelectContent className={t.selectContent}>
                <SelectItem value="__all__">Formations</SelectItem>
                {certOptions.withCert && <SelectItem value="true">Avec certification</SelectItem>}
                {certOptions.withoutCert && <SelectItem value="false">Sans certification</SelectItem>}
              </SelectContent>
            </Select>
            <Select value={trainingSortBy || "recommended"} onValueChange={(v) => setTrainingSortBy(v === "recommended" ? "" : v)}>
              <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.inputBg}`} data-testid="select-training-sort">
                <SelectValue placeholder="Trier par" />
              </SelectTrigger>
              <SelectContent className={t.selectContent}>
                <SelectItem value="recommended">Recommandé</SelectItem>
                <SelectItem value="price_asc">Prix croissant</SelectItem>
                <SelectItem value="price_desc">Prix décroissant</SelectItem>
              </SelectContent>
            </Select>
            {hasTrainingFilters && (
              <button
                onClick={() => {
                  setTrainingSearch("");
                  setTrainingLevel("");
                  setTrainingCert("");
                  setTrainingSortBy("");
                }}
                className={`flex items-center gap-1 text-xs transition-colors shrink-0 whitespace-nowrap ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}
                data-testid="button-reset-training-filters"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <section>
          {/* Académies (Store section) — rendered after the filters bar, same
              organizational order as /print's Imprimeries and /marketing's
              Agences (docs/academy_print_marketing_store_synchronization_audit.md
              Section 10-13). */}
          <AcademyStoresSection
            companies={filteredAcademyCompanies}
            onSelect={(academyUserId) => navigate(`/academy/stores/${academyUserId}`)}
            isDark={isDark}
          />

          <div className="mb-4">
            <h2 className={`font-bold text-lg ${t.textPrimary}`}>Formations</h2>
            <p className={`text-sm mt-0.5 ${t.textMuted}`}>{filteredTraining.length} formation{filteredTraining.length !== 1 ? "s" : ""} disponible{filteredTraining.length !== 1 ? "s" : ""}</p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className={`h-72 rounded-2xl border animate-pulse ${t.cardBg}`} />
              ))}
            </div>
          ) : filteredTraining.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <GraduationCap className="w-12 h-12 text-gray-200" />
              <p className="font-semibold text-gray-700">
                {courses.length === 0 && !hasTrainingFilters ? "Aucune formation disponible pour le moment" : "Aucune formation trouvée"}
              </p>
              <p className="text-sm text-gray-400">
                {courses.length === 0 && !hasTrainingFilters ? "Revenez bientôt : les académies publient régulièrement de nouvelles formations." : "Essayez d'ajuster vos filtres."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredTraining.map((course) => (
                <TrainingCard
                  key={course.id}
                  course={course}
                  canAct={canAct}
                  onOpenDetail={(c) => setDetailCourseId(c.id)}
                  isDark={isDark}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      </>
      )}

      {/* Fast Search — same `courses` list as the grid above, rendered before
          the Details modal so it stays open underneath when both are mounted. */}
      <AcademyFastSearch
        open={fastSearchOpen}
        onClose={() => setFastSearchOpen(false)}
        courses={courses}
        onEnroll={(c) => handleEnroll(c)}
        onOpenDetail={(c) => setDetailCourseId(c.id)}
      />

      <AcademyDetailModal
        courseId={detailCourseId}
        open={detailCourseId != null}
        onClose={() => setDetailCourseId(null)}
        onEnroll={(c) => { setDetailCourseId(null); handleEnroll(c); }}
      />

      <AcademyBlacklistModal open={blacklistOpen} onClose={() => setBlacklistOpen(false)} />

      <EnrollDialog course={enrollTarget} open={!!enrollTarget} onClose={() => setEnrollTarget(null)} isDark={isDark} />
    </div>
  );
}
