import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import baristaHeroImg from "@assets/8d80708f-be87-4e8d-8805-f60e3c292914-1000x562.5-rjZKXkudAsN4bH_1780680229193.jpg";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useThemeStore } from "@/store/theme-store";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { useFallbackImage } from "@/hooks/use-fallback-image";
import { formatDistance } from "@/lib/distance";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Coffee,
  Star,
  Clock,
  MapPin,
  MessageCircle,
  Search,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle,
  Users,
  Heart,
  Send,
  Zap,
  Ban,
  Briefcase,
} from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import { useHeroActionSettings } from "@/hooks/use-hero-actions";
import { useServiceHeroConfig } from "@/hooks/use-service-hero-config";
import { ServiceHeroShell, H_ALIGN_ICON_MX, H_ALIGN_ROW_JUSTIFY, getHeroSubtitleColorStyle } from "@/components/shared/service-hero";
import {
  useBaristaProfiles,
  useBaristaSkills,
  useBaristaEducationLevels,
  useBaristaLanguages,
  useCreateBaristaRequest,
  type BaristaMarketplaceCard,
} from "@/hooks/use-barista-marketplace";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { BaristaDetailModal } from "@/components/barista/barista-detail-modal";
import { BaristaFastSearch } from "@/components/barista/barista-fast-search";
import { BaristaBlacklistModal } from "@/components/barista/barista-blacklist-modal";
import { JobManagementModal } from "@/components/barista/job-management-modal";

// This page is now Marketplace Baristas ONLY — Barista Academy was split out
// into its own independent page/service, client/src/pages/cafe/barista/barista-academy-page.tsx
// (route /academy). Nothing about the Marketplace functionality below changed
// as part of that split — filters, cards, recruitment, favorites, messaging,
// realtime are all exactly as they were.

// ── Access helper (mirrors browse-products.tsx pattern) ──────────────────────

// Stable shared reference for the favorites-id query default below — see
// maintenance-page.tsx's identical constant for the full "Maximum update
// depth exceeded" explanation (a fresh `[]` literal there never lets the
// syncBaristaMarket effect's dependency settle while the query stays
// disabled for a non-approved/logged-out viewer).
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
    // Add Icons to Barista Compétences — same switcher chip tokens/shape as
    // Maintenance's own parent-competency switcher (pages/cafe/maintenance/
    // maintenance-page.tsx), recolored to this page's green brand accent.
    switcherBg: isDark ? "bg-gray-800" : "bg-gray-100",
    switcherActive: isDark ? "bg-gray-700 text-white shadow-sm" : "bg-white text-green-700 shadow-sm",
    switcherInactive: isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700",
    // Match Barista Filter Section Layout and Styling — identical token to
    // /maintenance and /marketing's own `stripBg` (pages/cafe/maintenance/
    // maintenance-page.tsx, pages/cafe/marketing/marketing-page.tsx), used for
    // the same full-bleed sticky filter strips instead of a floating card.
    stripBg: isDark ? "bg-gray-900/95 border-gray-800" : "bg-white border-gray-100",
  };
}

// Add Icons to Barista Compétences — generic fallback for "Tous" and for any
// competency with no Admin-set icon yet, same convention as Maintenance's own
// DEFAULT_CATEGORY_ICON (pages/cafe/maintenance/maintenance-page.tsx).
const DEFAULT_SKILL_ICON = "☕";

const BARISTA_LEVEL_COLORS: Record<string, string> = {
  BEGINNER: "bg-black/55 backdrop-blur-sm text-green-400 border border-green-700",
  ADVANCED: "bg-black/55 backdrop-blur-sm text-blue-400 border border-blue-700",
  EXPERT: "bg-black/55 backdrop-blur-sm text-purple-400 border border-purple-700",
};

const BARISTA_LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Débutant",
  ADVANCED: "Avancé",
  EXPERT: "Expert",
};

// ── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ rating, isDark = false }: { rating: number; isDark?: boolean }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      <Star className="w-3 h-3 fill-amber-400" />
      <span className={`text-[11px] font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{rating.toFixed(1)}</span>
    </span>
  );
}

// ── Recruit Dialog ─────────────────────────────────────────────────────────────

export function RecruitDialog({
  barista,
  open,
  onClose,
  isDark,
}: {
  barista: BaristaMarketplaceCard | null;
  open: boolean;
  onClose: () => void;
  isDark: boolean;
}) {
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const createRequest = useCreateBaristaRequest();
  const [missionType, setMissionType] = useState("");
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [proposedRate, setProposedRate] = useState("");

  useEffect(() => {
    if (open && barista) {
      setMissionType("");
      setMessage("");
      setStartDate("");
      setEndDate("");
      setProposedRate(String(barista.dailyRateInCents / 100));
    }
  }, [open, barista?.userId]);

  if (!barista) return null;

  const submit = () => {
    createRequest.mutate(
      {
        baristaUserId: barista.userId,
        missionType: missionType.trim(),
        message: message.trim() || undefined,
        proposedRateInCents: proposedRate ? Math.round(parseFloat(proposedRate) * 100) : null,
        startDate,
        endDate: endDate || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Demande envoyée", description: `${barista.name} pourra maintenant l'accepter ou en discuter.` });
          onClose();
        },
        onError: (error: Error) => {
          toast({ title: "Impossible d'envoyer la demande", description: error.message, variant: "destructive" });
        },
      }
    );
  };

  // Theme fix: this app's dark mode is NOT Tailwind's `dark:` class strategy —
  // nothing ever adds a `.dark` class to the DOM (see useTheme() above), so
  // `bg-background`/`text-foreground`/the Input/Textarea base components' own
  // CSS-var tokens never actually change with the navbar toggle. Reusing the
  // same `useTheme(isDark)` ternary-class helper this page already relies on
  // everywhere else that IS correctly dark-mode-aware.
  const t = useTheme(isDark);
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className={`sm:max-w-md rounded-2xl border-0 shadow-2xl ${t.pageBg}`}>
        <VisuallyHidden><DialogTitle>Recruter {barista.name}</DialogTitle></VisuallyHidden>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={getAvatarUrl(barista as any)} alt={barista.name} />
              <AvatarFallback className={`font-bold text-sm ${isDark ? "bg-green-900/50 text-green-300" : "bg-green-100 text-green-700"}`}>{barista.initials}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className={`font-bold text-base leading-tight ${t.textPrimary}`}>{barista.name}</h2>
              <p className={`text-xs ${t.textMuted}`}>Tarif indicatif : {fmt(barista.dailyRateInCents)} / jour</p>
            </div>
          </div>
          <Input
            placeholder="Type de mission (ex: renfort événement, service quotidien...)"
            value={missionType}
            onChange={(e) => setMissionType(e.target.value)}
            className={t.inputBg}
            data-testid="input-recruit-mission-type"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={t.inputBg} data-testid="input-recruit-start-date" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={t.inputBg} data-testid="input-recruit-end-date" placeholder="Fin (optionnel)" />
          </div>
          <Input
            type="number"
            min={0}
            placeholder="Tarif proposé (optionnel)"
            value={proposedRate}
            onChange={(e) => setProposedRate(e.target.value)}
            className={t.inputBg}
            data-testid="input-recruit-rate"
          />
          <Textarea
            placeholder="Message pour le barista (optionnel)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className={t.inputBg}
            data-testid="input-recruit-message"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className={`${t.textPrimary} ${isDark ? "border-gray-700" : ""}`} onClick={onClose}>Annuler</Button>
            <Button
              disabled={!missionType.trim() || !startDate || createRequest.isPending}
              onClick={submit}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-submit-recruit"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {createRequest.isPending ? "Envoi…" : "Envoyer la demande"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Barista Profile Card ──────────────────────────────────────────────────────

function BaristaCard({
  barista,
  canAct,
  onChat,
  onOpenDetail,
  isDark,
}: {
  barista: BaristaMarketplaceCard;
  canAct: boolean;
  onChat: (barista: BaristaMarketplaceCard) => void;
  onOpenDetail: (barista: BaristaMarketplaceCard) => void;
  isDark: boolean;
}) {
  const fmt = useFormatCurrency();
  const t = useTheme(isDark);
  const faved = useFavorites((s) => !!s.baristaMarket[barista.userId]);
  const toggleBaristaMarket = useFavorites((s) => s.toggleBaristaMarket);
  const primarySkill = barista.skills[0];
  // Photo de profil is the card's primary image; Cover then Flash are tried in
  // order if it's missing or fails to load (analyse.md image-mapping task).
  const heroImage = useFallbackImage([barista.profileImageUrl, barista.coverImageUrl, barista.flashImageUrl], barista.userId);

  // Vertical card (docs/maintenance_barista_mapped_cards_marketing_design_audit.md)
  // — same visual grammar as MarketingMappedServiceCard (image with overlay
  // badges → title → description → footer), adapted to a professional-based
  // card (no Store/Service split exists for Barista): the top-left badge that
  // would show the provider name on a Marketing service card instead shows
  // the professional's level, since the title below already is the
  // professional's own name/identity.
  return (
    <div
      data-testid={`card-barista-${barista.userId}`}
      onClick={() => onOpenDetail(barista)}
      className={`group relative rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col cursor-pointer ${t.cardBg}`}
    >
      <div className={`relative aspect-[4/3] overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
        <Avatar className="w-full h-full rounded-none">
          <AvatarImage
            src={heroImage.src ?? undefined}
            alt={barista.name}
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            onLoadingStatusChange={(status) => { if (status === "error") heroImage.onError(); }}
          />
          <AvatarFallback className="rounded-none bg-green-100 text-green-700 font-bold text-2xl">
            {barista.initials}
          </AvatarFallback>
        </Avatar>

        {/* Level — top-left badge over the image (was a plain body Badge, moved here to match Marketing's overlay badge slot) */}
        <span className={`absolute top-2 left-2 max-w-[62%] truncate text-[10px] font-semibold px-2 py-1 rounded-full border-0 ${BARISTA_LEVEL_COLORS[barista.level]}`}>
          {BARISTA_LEVEL_LABELS[barista.level]}
        </span>

        {/* Favorite — top-right, same mapped-marketplace favorite style/behavior everywhere */}
        <button
          className={`absolute top-2 right-2 z-10 w-6 h-6 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform ${isDark ? "bg-gray-700/90" : "bg-white/90"}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleBaristaMarket({
              id: barista.userId,
              name: barista.name,
              initials: barista.initials,
              skills: barista.skills,
              location: barista.location,
              rating: barista.rating / 10,
              available: barista.available,
              profileImageUrl: barista.profileImageUrl,
            });
          }}
          data-testid={`button-fav-barista-${barista.userId}`}
        >
          <Heart className={`w-3 h-3 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>

        {/* Availability — bottom-left dot over the image, real barista.available state */}
        <span
          className={`absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full border-2 border-white ${barista.available ? "bg-green-500" : "bg-gray-300"}`}
          title={barista.available ? "Disponible" : "Indisponible"}
        />

        {/* Skill — bottom-right badge, real primary skill (same data already used in Fast Search's skill chips) */}
        {primarySkill && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
            {primarySkill}
          </span>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight truncate group-hover:text-green-600 transition-colors ${t.textPrimary}`}>
          {barista.name}
        </h3>
        {barista.bio && <p className={`text-xs line-clamp-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{barista.bio}</p>}

        {barista.location && (
          <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
            <MapPin className="w-2.5 h-2.5" />
            {barista.distanceKm != null ? formatDistance(barista.distanceKm) : barista.location}
          </span>
        )}

        {/* Recruter moved into the details modal (Part 6/8) — the card itself
            is now the primary click target for it; the quick Message shortcut
            stays here since only Recruter was asked to move. */}
        <div className={`mt-auto pt-2 border-t ${t.border}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <StarRating rating={barista.rating / 10} isDark={isDark} />
              <span className="text-[11px] text-gray-400">({barista.reviewCount})</span>
            </span>
            <div onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg px-2"
                data-testid={`button-chat-barista-${barista.userId}`}
                disabled={!canAct}
                onClick={() => onChat(barista)}
              >
                <MessageCircle className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BaristaPage({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user } = useAuth();
  const accessLevel = useAccessLevel();
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);
  const { settings: heroActions } = useHeroActionSettings();
  const { config: heroConfig } = useServiceHeroConfig("BARISTA");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Hiring filters
  const [baristaSearch, setBaristaSearch] = useState("");
  // Mobile collapsible search (mobile_filters_darkmode_audit.md) — the input
  // itself/its state/filtering logic are unchanged; only its mobile
  // presentation (icon ⇄ expanded input) is new.
  const [baristaSearchOpen, setBaristaSearchOpen] = useState(false);
  const baristaSearchInputRef = useRef<HTMLInputElement>(null);
  const [baristaLevel, setBaristaLevel] = useState("");
  const [baristaAvailability, setBaristaAvailability] = useState("");
  const [baristaSkill, setBaristaSkill] = useState("");
  const [baristaLocation, setBaristaLocation] = useState("");
  const [baristaEducation, setBaristaEducation] = useState("");
  const [baristaLanguages, setBaristaLanguages] = useState<string[]>([]);

  const [detailBaristaId, setDetailBaristaId] = useState<number | null>(null);
  const [fastSearchOpen, setFastSearchOpen] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [jobManagementOpen, setJobManagementOpen] = useState(false);

  const { data: profiles = [], isLoading: profilesLoading, isError: profilesError } = useBaristaProfiles();
  const { data: skillOptions = [] } = useBaristaSkills();
  const { data: educationOptions = [] } = useBaristaEducationLevels();
  const { data: languageOptions = [] } = useBaristaLanguages();

  // Hydrate favorite hearts from the database, mirroring maintenance-page.tsx's pattern.
  const { data: favoriteIds = EMPTY_IDS } = useQuery<number[]>({
    queryKey: ["/api/barista-favorites"],
    enabled: !!user && accessLevel === "approved",
  });
  const syncBaristaMarket = useFavorites((s) => s.syncBaristaMarket);
  useEffect(() => {
    if (profilesLoading) return;
    syncBaristaMarket(favoriteIds, profiles);
  }, [favoriteIds, profiles, profilesLoading, syncBaristaMarket]);

  const filteredBaristas = useMemo(() => {
    let list = profiles;
    if (baristaSearch.trim()) {
      const q = baristaSearch.toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.skills.some((s) => s.toLowerCase().includes(q))
      );
    }
    if (baristaLevel) list = list.filter((b) => b.level === baristaLevel);
    if (baristaAvailability === "available")
      list = list.filter((b) => b.available);
    if (baristaAvailability === "unavailable")
      list = list.filter((b) => !b.available);
    if (baristaSkill)
      list = list.filter((b) =>
        b.skills.some((s) => s.toLowerCase() === baristaSkill.toLowerCase())
      );
    if (baristaLocation)
      list = list.filter(
        (b) => b.location.toLowerCase() === baristaLocation.toLowerCase()
      );
    if (baristaEducation)
      list = list.filter((b) => (b.educationLevel ?? "").toLowerCase() === baristaEducation.toLowerCase());
    // Multiple selected languages use OR semantics (matches any one of them) —
    // the same intuitive "has at least one of" convention as the Compétence
    // filter above, just extended to multiple values at once.
    if (baristaLanguages.length > 0)
      list = list.filter((b) =>
        b.languages?.some((lang) => baristaLanguages.some((sel) => sel.toLowerCase() === lang.toLowerCase()))
      );
    return list;
  }, [
    profiles,
    baristaSearch,
    baristaLevel,
    baristaAvailability,
    baristaSkill,
    baristaLocation,
    baristaEducation,
    baristaLanguages,
  ]);

  // ── Data-driven, cross-filter-aware option derivation ───────────────────────
  // (task: "Synchronize All Filters and Display Only Options With Matching
  // Results") — mirrors the /products and /maintenance fix: a single
  // search-only base, then a `withoutDim` helper that narrows by every OTHER
  // active filter but never by the dimension being derived, so a filter's own
  // currently selected value can never vanish from its own option list while
  // still correctly narrowing in response to its siblings. Admin taxonomy
  // (skillOptions/educationOptions/languageOptions) is now used ONLY for
  // icon/id metadata lookup — the SELECTABLE values always come from eligible
  // `profiles`, since an admin-configured skill/education level/language can
  // exist with zero matching baristas (the root cause of the reported bug).
  const searchFiltered = useMemo(() => {
    if (!baristaSearch.trim()) return profiles;
    const q = baristaSearch.toLowerCase();
    return profiles.filter((b) => b.name.toLowerCase().includes(q) || b.skills.some((s) => s.toLowerCase().includes(q)));
  }, [profiles, baristaSearch]);

  type BaristaDim = "level" | "availability" | "skill" | "location" | "education" | "languages";
  const withoutDim = (exclude: BaristaDim) => {
    let list = searchFiltered;
    if (exclude !== "level" && baristaLevel) list = list.filter((b) => b.level === baristaLevel);
    if (exclude !== "availability" && baristaAvailability) list = list.filter((b) => (baristaAvailability === "available" ? b.available : !b.available));
    if (exclude !== "skill" && baristaSkill) list = list.filter((b) => b.skills.some((s) => s.toLowerCase() === baristaSkill.toLowerCase()));
    if (exclude !== "location" && baristaLocation) list = list.filter((b) => b.location.toLowerCase() === baristaLocation.toLowerCase());
    if (exclude !== "education" && baristaEducation) list = list.filter((b) => (b.educationLevel ?? "").toLowerCase() === baristaEducation.toLowerCase());
    if (exclude !== "languages" && baristaLanguages.length > 0) list = list.filter((b) => b.languages?.some((lang) => baristaLanguages.some((sel) => sel.toLowerCase() === lang.toLowerCase())));
    return list;
  };

  const skillChipOptions = useMemo(() => {
    const iconByName = new Map(skillOptions.map((s) => [s.name, s.icon] as const));
    const names = new Set<string>();
    withoutDim("skill").forEach((b) => b.skills.forEach((s) => names.add(s)));
    return Array.from(names).sort().map((name) => ({ name, icon: iconByName.get(name) ?? null }));
  }, [searchFiltered, baristaLevel, baristaAvailability, baristaLocation, baristaEducation, baristaLanguages, skillOptions]);

  const levelOptions = useMemo(() => {
    const set = new Set<string>();
    withoutDim("level").forEach((b) => { if (b.level) set.add(b.level); });
    return Array.from(set);
  }, [searchFiltered, baristaAvailability, baristaSkill, baristaLocation, baristaEducation, baristaLanguages]);

  const availabilityOptions = useMemo(() => {
    const base = withoutDim("availability");
    return { available: base.some((b) => b.available), unavailable: base.some((b) => !b.available) };
  }, [searchFiltered, baristaLevel, baristaSkill, baristaLocation, baristaEducation, baristaLanguages]);

  const allLocations = useMemo(() => {
    const set = new Set<string>();
    withoutDim("location").forEach((b) => { if (b.location) set.add(b.location); });
    return Array.from(set).sort();
  }, [searchFiltered, baristaLevel, baristaAvailability, baristaSkill, baristaEducation, baristaLanguages]);

  const educationFilterOptions = useMemo(() => {
    const present = new Set<string>();
    withoutDim("education").forEach((b) => { if (b.educationLevel) present.add(b.educationLevel.toLowerCase()); });
    return educationOptions.filter((e) => present.has(e.name.toLowerCase()));
  }, [searchFiltered, baristaLevel, baristaAvailability, baristaSkill, baristaLocation, baristaLanguages, educationOptions]);

  const languageFilterOptions = useMemo(() => {
    const present = new Set<string>();
    withoutDim("languages").forEach((b) => (b.languages ?? []).forEach((lang) => present.add(lang.toLowerCase())));
    return languageOptions.filter((l) => present.has(l.name.toLowerCase()));
  }, [searchFiltered, baristaLevel, baristaAvailability, baristaSkill, baristaLocation, baristaEducation, languageOptions]);

  // Reconcile existing selections a sibling filter change just made invalid —
  // clears only the one no longer compatible, never resets unrelated filters;
  // each effect only ever clears a value (never sets a new one), so this can't
  // loop — React settles after at most one extra pass per genuine conflict.
  useEffect(() => { if (baristaLevel && !levelOptions.includes(baristaLevel)) setBaristaLevel(""); }, [levelOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (baristaAvailability === "available" && !availabilityOptions.available) setBaristaAvailability("");
    if (baristaAvailability === "unavailable" && !availabilityOptions.unavailable) setBaristaAvailability("");
  }, [availabilityOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (baristaSkill && !skillChipOptions.some((s) => s.name === baristaSkill)) setBaristaSkill(""); }, [skillChipOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (baristaLocation && !allLocations.includes(baristaLocation)) setBaristaLocation(""); }, [allLocations]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (baristaEducation && !educationFilterOptions.some((e) => e.name === baristaEducation)) setBaristaEducation(""); }, [educationFilterOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setBaristaLanguages((prev) => prev.filter((l) => languageFilterOptions.some((o) => o.name === l))); }, [languageFilterOptions]);

  const hasBaristaFilters = !!(
    baristaSearch ||
    baristaLevel ||
    baristaAvailability ||
    baristaSkill ||
    baristaLocation ||
    baristaEducation ||
    baristaLanguages.length > 0
  );

  const canAct = !!user && user.role === "CAFE_OWNER" && accessLevel === "approved";

  const handleChat = async (barista: BaristaMarketplaceCard) => {
    if (!canAct) {
      if (!user) { navigate("/login"); return; }
      toast({ title: "Action réservée aux cafés approuvés", variant: "destructive" });
      return;
    }
    try {
      const response = await apiRequest("POST", "/api/messages/conversations", {
        targetUserId: barista.userId,
        service: "BARISTA",
      });
      const data = await response.json() as { conversation: { id: number } };
      navigate(`/cafe/messages?service=BARISTA&conversationId=${data.conversation.id}`);
    } catch (error) {
      toast({ title: "Contact impossible", description: error instanceof Error ? error.message : "Veuillez réessayer.", variant: "destructive" });
    }
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
            <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-green-950/90" : "bg-gradient-to-br from-green-600/90 via-green-700/85 to-emerald-700/90"}`} />
          </>
        }
        controlsRow={
          /* The global navbar theme control is the single Dark/Light toggle
              now, so the duplicated hero one is gone; Fast Search/Report stay
              Admin-toggleable per service (see /api/hero-actions). */
          <div className="relative flex justify-end items-center gap-2 mb-9">
            {canAct && heroActions.BARISTA.reportEnabled && (
              <button
                onClick={() => setBlacklistOpen(true)}
                aria-label="Baristas signalés"
                title="Baristas signalés"
                data-testid="button-open-blacklist"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-red-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Ban className="w-4 h-4" />
              </button>
            )}
            {canAct && heroActions.BARISTA.fastSearchEnabled && (
              <button
                onClick={() => setFastSearchOpen(true)}
                aria-label="Fast Search"
                title="Fast Search — parcourir les baristas"
                data-testid="button-open-fast-search"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-green-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Zap className="w-4 h-4" />
              </button>
            )}
            {canAct && (
              <button
                onClick={() => setJobManagementOpen(true)}
                aria-label="Offres d'emploi"
                title="Offres d'emploi — publier et gérer"
                data-testid="button-open-job-management"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-blue-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Briefcase className="w-4 h-4" />
              </button>
            )}
          </div>
        }
      >
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-5 backdrop-blur-sm ${H_ALIGN_ICON_MX[heroConfig.horizontalAlign]} ${isDark ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}>
          <Coffee className={`w-8 h-8 ${isDark ? "text-amber-400" : "text-white"}`} />
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
          BigBoss <span className={isDark ? "text-amber-400" : "text-amber-200"}>BARISTA</span>
        </h1>
        {heroConfig.subtitleEnabled && (
          <p className={`text-base mb-4 max-w-xl ${H_ALIGN_ICON_MX[heroConfig.horizontalAlign]} ${isDark ? "text-white" : "text-green-100"}`} style={getHeroSubtitleColorStyle(heroConfig, isDark)}>
            {heroConfig.subtitle ?? "Trouvez et recrutez des baristas professionnels pour votre établissement"}
          </p>
        )}
        {heroConfig.infoRowEnabled && (
          <div className={`flex items-center gap-6 flex-wrap text-sm ${H_ALIGN_ROW_JUSTIFY[heroConfig.horizontalAlign]} ${isDark ? "text-white" : "text-green-100"}`}>
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {profiles.length} baristas disponibles
            </span>
          </div>
        )}
      </ServiceHeroShell>

      {comingSoon ? (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${t.mutedBg}`}>
            <Clock className="w-8 h-8 text-green-600" />
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
      {/* ── Pending notice ──────────────────────────────────────────────── */}
      {accessLevel === "pending" && (
        <div className={`${isDark ? "bg-amber-950/40 border-amber-900/60" : "bg-amber-50 border-amber-200"} border-b px-4 py-3`}>
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-800 text-sm font-medium">
            <CheckCircle className="w-4 h-4 shrink-0" />
            Votre compte est en attente d'approbation. Vous pourrez accéder aux tarifs et réservations une fois approuvé.
          </div>
        </div>
      )}

      {/* Match Barista Filter Section Layout and Styling — same full-bleed sticky
          strip structure as /maintenance and /marketing (two separate border-b
          strips, each its own stripBg, outside the max-w-7xl content wrapper)
          instead of the previous single rounded, bordered, padded card nested
          inside it. Same sticky-below-navbar positioning (top-14 z-30) as before. */}
      <div className="sticky top-14 z-30">
        <div className={`border-b ${t.stripBg}`}>
          <div className="max-w-7xl mx-auto px-4">
            {/* Compétence — Add Icons to Barista Compétences: a "Tous" + per-competency
                chip switcher, same visual pattern as Maintenance's own parent-competency
                switcher (pages/cafe/maintenance/maintenance-page.tsx — icon placement,
                spacing, switcherActive/switcherInactive selected-state classes). Icons
                come from the Admin-managed taxonomy (skillChipOptions above), never a
                hardcoded mapping. */}
            <div className="flex gap-1.5 overflow-x-auto py-3" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
              <div className={`flex gap-1 rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                <button
                  onClick={() => setBaristaSkill("")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 transition-all text-[11px] font-semibold ${!baristaSkill ? t.switcherActive : t.switcherInactive}`}
                  data-testid="button-barista-skill-all"
                >
                  <span className="text-base leading-none">{DEFAULT_SKILL_ICON}</span><span>Tous</span>
                </button>
              </div>
              {skillChipOptions.map((skill) => (
                <div key={skill.name} className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                  <button
                    onClick={() => setBaristaSkill(baristaSkill === skill.name ? "" : skill.name)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${baristaSkill === skill.name ? t.switcherActive : t.switcherInactive}`}
                    data-testid={`button-barista-skill-${skill.name}`}
                  >
                    <span className="text-base leading-none">{skill.icon || DEFAULT_SKILL_ICON}</span>
                    <span className="max-w-[88px] truncate">{skill.name}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={`border-b py-2 px-4 ${t.stripBg}`}>
          <div
            className="max-w-7xl mx-auto flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
             <SlidersHorizontal className={`w-3.5 h-3.5 ${t.textSubtle} shrink-0`} />
              <div className="relative shrink-0 sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
                {!baristaSearchOpen && (
                  <button
                    type="button"
                    className={`sm:hidden h-7 w-7 rounded-full border flex items-center justify-center shrink-0 ${t.inputBg}`}
                    onClick={() => { setBaristaSearchOpen(true); setTimeout(() => baristaSearchInputRef.current?.focus(), 0); }}
                    aria-label="Rechercher"
                    data-testid="button-open-barista-search"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className={`${baristaSearchOpen ? "flex" : "hidden"} sm:flex items-center relative w-44 sm:w-full`}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    ref={baristaSearchInputRef}
                    value={baristaSearch}
                    onChange={(e) => setBaristaSearch(e.target.value)}
                    onBlur={() => { if (!baristaSearch) setBaristaSearchOpen(false); }}
                    placeholder="Nom ou compétence..."
                     className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
                    data-testid="input-barista-search"
                  />
                </div>
              </div>
              <Select
                value={baristaLevel || "__all__"}
                onValueChange={(v) => setBaristaLevel(v === "__all__" ? "" : v)}
              >
                 <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.inputBg}`} data-testid="select-barista-level">
                  <SelectValue placeholder="Niveau" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Niveaux</SelectItem>
                  {levelOptions.map((v) => <SelectItem key={v} value={v}>{BARISTA_LEVEL_LABELS[v] ?? v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                value={baristaAvailability || "__all__"}
                onValueChange={(v) => setBaristaAvailability(v === "__all__" ? "" : v)}
              >
                 <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] shrink-0 ${t.inputBg}`} data-testid="select-barista-availability">
                  <SelectValue placeholder="Disponibilité" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Disponibilités</SelectItem>
                  {availabilityOptions.available && <SelectItem value="available">Disponible</SelectItem>}
                  {availabilityOptions.unavailable && <SelectItem value="unavailable">Indisponible</SelectItem>}
                </SelectContent>
              </Select>
              <Select
                value={baristaLocation || "__all__"}
                onValueChange={(v) => setBaristaLocation(v === "__all__" ? "" : v)}
              >
                 <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] shrink-0 ${t.inputBg}`} data-testid="select-barista-location">
                  <SelectValue placeholder="Ville" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Villes</SelectItem>
                  {allLocations.map((loc) => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={baristaEducation || "__all__"}
                onValueChange={(v) => setBaristaEducation(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[140px] shrink-0 ${t.inputBg}`} data-testid="select-barista-education">
                  <SelectValue placeholder="Niveau d'étude" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Niveaux</SelectItem>
                  {educationFilterOptions.map((e) => (
                    <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] shrink-0 inline-flex items-center justify-between gap-1.5 border ${t.inputBg}`}
                    data-testid="select-barista-language"
                  >
                    {baristaLanguages.length > 0 ? `Langue (${baristaLanguages.length})` : "Langue"}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className={t.selectContent} align="start">
                  {languageFilterOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Aucune langue configurée</div>
                  ) : languageFilterOptions.map((lang) => (
                    <DropdownMenuCheckboxItem
                      key={lang.id}
                      checked={baristaLanguages.includes(lang.name)}
                      onCheckedChange={(checked) =>
                        setBaristaLanguages((prev) => checked ? [...prev, lang.name] : prev.filter((l) => l !== lang.name))
                      }
                      data-testid={`checkbox-barista-language-${lang.id}`}
                    >
                      {lang.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {hasBaristaFilters && (
                <button
                  onClick={() => {
                    setBaristaSearch("");
                    setBaristaLevel("");
                    setBaristaAvailability("");
                    setBaristaSkill("");
                    setBaristaLocation("");
                    setBaristaEducation("");
                    setBaristaLanguages([]);
                  }}
                  className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors shrink-0 whitespace-nowrap"
                  data-testid="button-reset-barista-filters"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>
          </div>
        </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <section>
          {profilesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-80 rounded-2xl" />
              ))}
            </div>
          ) : profilesError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Users className="w-12 h-12 text-gray-200" />
              <p className="font-semibold text-gray-700">Impossible de charger les baristas</p>
              <p className="text-sm text-gray-400">Veuillez réessayer plus tard.</p>
            </div>
          ) : filteredBaristas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Users className="w-12 h-12 text-gray-200" />
              <p className="font-semibold text-gray-700">Aucun barista trouvé</p>
              <p className="text-sm text-gray-400">Essayez d'ajuster vos filtres.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredBaristas.map((barista) => (
                 <BaristaCard
                  key={barista.userId}
                  barista={barista}
                  canAct={canAct}
                  onChat={handleChat}
                  onOpenDetail={(b) => setDetailBaristaId(b.userId)}
                  isDark={isDark}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      </>
      )}

      {/* Fast Search (Parts 30-32) — same `profiles` list as the grid above,
          same visibility/availability rules, no separate data copy. Rendered
          BEFORE Details/Recruit below so — when both are open at once — the
          Details/Recruit dialog mounts later in the DOM and stacks visually
          above Fast Search, which stays open underneath instead of closing. */}
      <BaristaFastSearch
        open={fastSearchOpen}
        onClose={() => setFastSearchOpen(false)}
        baristas={profiles}
        onOpenDetail={(b) => setDetailBaristaId(b.userId)}
      />

      <BaristaDetailModal
        baristaUserId={detailBaristaId}
        open={detailBaristaId != null}
        onClose={() => setDetailBaristaId(null)}
      />

      <BaristaBlacklistModal open={blacklistOpen} onClose={() => setBlacklistOpen(false)} />

      <JobManagementModal open={jobManagementOpen} onClose={() => setJobManagementOpen(false)} />
    </div>
  );
}
