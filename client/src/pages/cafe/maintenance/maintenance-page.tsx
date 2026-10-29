import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useThemeStore } from "@/store/theme-store";
import { useAuth } from "@/hooks/use-auth";
import { useFavorites } from "@/hooks/use-favorites";
import { useHeroActionSettings } from "@/hooks/use-hero-actions";
import { useServiceHeroConfig } from "@/hooks/use-service-hero-config";
import { ServiceHeroShell, H_ALIGN_ICON_MX, H_ALIGN_ROW_JUSTIFY, getHeroSubtitleColorStyle } from "@/components/shared/service-hero";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MaintenanceFastSearch } from "@/components/maintenance/maintenance-fast-search";
import { MaintenanceBlacklistModal } from "@/components/maintenance/maintenance-blacklist-modal";
import { MarketingPortfolioAlbumModal } from "@/components/marketing/marketing-portfolio-album-modal";
import { ReviewModal } from "@/components/review-modal";
import { ReportModal } from "@/components/report-modal";
import { useSubmitMaintenanceReport, useMaintenancePublishedReports } from "@/hooks/use-maintenance-reports";
import { AvailabilityModal } from "@/components/shared/availability-modal";
import type { MaintenanceMarketplaceCard, OpeningHoursMap } from "@shared/schema";
import { encodeMaintenanceSubSkillKey, decodeMaintenanceSubSkillKey } from "@shared/maintenance-sub-skill-key";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { useCircularItemNav } from "@/hooks/use-circular-item-nav";
import { ItemNavButtons } from "@/components/shared/item-nav-buttons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { useFallbackImage } from "@/hooks/use-fallback-image";
import { formatDistance } from "@/lib/distance";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Wrench, Search, MapPin, Star, MessageCircle, SlidersHorizontal,
  RotateCcw, X, Heart, Clock, Shield, Zap, Award, Users,
  Building2, User, Flag, Navigation, Ban, Image as ImageIcon, ClipboardList, ListChecks,
} from "lucide-react";
import { MaintenanceJobManagementModal } from "@/components/maintenance/maintenance-job-management-modal";
import { MaintenanceJobTargetButton } from "@/components/maintenance/maintenance-job-target-button";

// Stable shared reference for the favorites-id query default below — a fresh
// `[]` literal there is a *different* array every render, which (while the
// query stays disabled for a non-approved/logged-out viewer) never lets the
// syncMaintenance effect's dependency settle: it re-fires every render,
// calling a store setter that always returns a new object, triggering
// another render, forever — surfaces as React's "Maximum update depth
// exceeded" inside whichever component last mounted (e.g. the Favorites
// panel). One shared reference breaks the cycle.
const EMPTY_IDS: number[] = [];

type AccessLevel = "visitor" | "pending" | "approved";

function useAccessLevel(): AccessLevel {
  const { user } = useAuth();
  if (!user) return "visitor";
  if (["SUPER_ADMIN", "ADMIN", "SUPPLIER"].includes(user.role)) return "approved";
  if (user.role === "CAFE_OWNER" && user.status === "approved") return "approved";
  return "pending";
}

// Fallback only — the real icon (Part 2-3) comes from Admin → Maintenance →
// Compétences demandées (maintenanceCompetencies.icon), fetched below via
// /api/maintenance/taxonomy and used wherever it's set. No separate icon
// definitions per frontend.
const DEFAULT_CATEGORY_ICON = "🛠️";
const TYPE_COLORS: Record<string, string> = {
  Freelance: "bg-blue-100 text-blue-700",
  Company: "bg-purple-100 text-purple-700",
  Agency: "bg-orange-100 text-orange-700",
};
const TYPE_ICONS: Record<string, any> = { Freelance: User, Company: Building2, Agency: Users };
// French label for the Type filter's real enum values (task: "Synchronize All
// Filters…") — the filter's options are now data-driven (typeOptions below),
// this only maps a present raw value to its existing display label.
const TYPE_LABELS: Record<string, string> = { Freelance: "Freelance", Company: "Entreprise", Agency: "Agence" };

// Shared competency-resolution utility (task: "Synchronize Maintenance
// Filters With Database Competencies and Profile Assignments") — same
// validity computation originally built for AgentDetailModal (task: "Use
// Database-Backed Competencies and Subcompetencies in the Maintenance Detail
// Modal"), factored out so the marketplace's own category/sub-competency
// filter-option generation (MaintenancePage below) validates against the
// exact same authoritative maintenance_competencies/
// maintenance_sub_competencies relationship, rather than trusting a
// profile's saved skills/subSkills name arrays unconditionally. Pure
// function — no hooks — so either component just wraps it in its own
// `useMemo` over its own already-fetched taxonomy query.
type MaintenanceTaxonomy = {
  competencies: { id: number; name: string; icon: string | null }[];
  subCompetencies: { id: number; competencyId: number; name: string; icon: string | null }[];
};
function buildMaintenanceCompetencyValidity(taxonomy: MaintenanceTaxonomy | undefined) {
  const validNames = new Set((taxonomy?.competencies ?? []).map((c) => c.name));
  const nameById = new Map((taxonomy?.competencies ?? []).map((c) => [c.id, c.name]));
  const validSubNamesByParent = new Map<string, Set<string>>();
  for (const sub of taxonomy?.subCompetencies ?? []) {
    const parentName = nameById.get(sub.competencyId);
    if (!parentName) continue;
    if (!validSubNamesByParent.has(parentName)) validSubNamesByParent.set(parentName, new Set());
    validSubNamesByParent.get(parentName)!.add(sub.name);
  }
  return { validNames, validSubNamesByParent };
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
    // Part 15 fix — SelectContent (the dropdown popup) previously had no
    // className override at all and relied on the shadcn base's inert
    // bg-popover CSS-var token (this app's dark mode never adds a `.dark`
    // class — see barista-detail-modal.tsx's note), so the picklists stayed
    // white regardless of the navbar theme.
    selectContent: isDark
      ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white"
      : "bg-white border-gray-200 text-gray-900",
  };
}

function ratingValue(agent: MaintenanceMarketplaceCard) {
  return agent.rating > 0 ? (agent.rating / 10).toFixed(1) : "—";
}

function StarRating({ agent, isDark = false }: { agent: MaintenanceMarketplaceCard; isDark?: boolean }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      <Star className="w-3 h-3 fill-amber-400" />
      <span className={`text-[11px] font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{ratingValue(agent)}</span>
    </span>
  );
}

function AgentCard({
  agent, onOpenDetail, onContact, categoryIcons, isDark,
}: {
  agent: MaintenanceMarketplaceCard;
  onOpenDetail: (agent: MaintenanceMarketplaceCard) => void;
  onContact: (agent: MaintenanceMarketplaceCard) => void;
  categoryIcons: Map<string, string>;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const favoriteId = agent.userId;
  const faved = useFavorites((s) => !!s.maintenance[favoriteId]);
  const toggleMaintenance = useFavorites((s) => s.toggleMaintenance);
  const TypeIcon = TYPE_ICONS[agent.profileType] ?? User;
  // agent.skills is the one authoritative Maintenance competency field — agent.categories
  // is a deprecated, no-longer-written duplicate (see maintenanceProfiles.categories's
  // own schema comment).
  const primaryCategory = agent.skills[0];
  // Photo de profil is the card's primary image; Cover then Flash are tried in
  // order if it's missing or fails to load (analyse.md image-mapping task).
  const heroImage = useFallbackImage([agent.profileImageUrl, agent.coverImageUrl, agent.flashImageUrl], agent.userId);

  // Vertical card (docs/maintenance_barista_mapped_cards_marketing_design_audit.md)
  // — same visual grammar as MarketingMappedServiceCard (image with overlay
  // badges → title → description → footer), adapted to a professional-based
  // card (no Store/Service split exists for Maintenance): the top-left badge
  // that would show the provider name on a Marketing service card instead
  // shows the professional's type, since the title below already is the
  // professional's own name/identity.
  return (
    <div
      data-testid={`card-maintenance-${agent.userId}`}
      className={`group relative rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col cursor-pointer ${t.cardBg}`}
      onClick={() => onOpenDetail(agent)}
    >
      <div className={`relative aspect-[4/3] overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
        <Avatar className="w-full h-full rounded-none">
          <AvatarImage
            src={heroImage.src ?? undefined}
            alt={agent.name}
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            onLoadingStatusChange={(status) => { if (status === "error") heroImage.onError(); }}
          />
          <AvatarFallback className="rounded-none bg-orange-100 text-orange-700 font-bold text-2xl">{agent.initials}</AvatarFallback>
        </Avatar>

        {/* Type — top-left badge over the image (was a plain body Badge, moved here to match Marketing's overlay badge slot) */}
        <span className="absolute top-2 left-2 max-w-[62%] truncate flex items-center gap-1 bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
          <TypeIcon className="w-2.5 h-2.5" />{agent.profileType}
        </span>

        {/* Favorite — top-right, same mapped-marketplace favorite style/behavior everywhere */}
        <button
          className={`absolute top-2 right-2 z-10 w-6 h-6 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform ${isDark ? "bg-gray-700/90" : "bg-white/90"}`}
          onClick={(event) => {
            event.stopPropagation();
            // categories: agent.skills — the favorites item's own `categories` field is
            // populated from the one authoritative source (agent.skills), never the
            // deprecated agent.categories duplicate.
            toggleMaintenance({
              id: favoriteId, name: agent.name, initials: agent.initials,
              specialty: agent.specialty, categories: agent.skills, skills: agent.skills,
              location: agent.location, rating: Number(ratingValue(agent)) || 0,
              available: agent.available, profileImageUrl: agent.profileImageUrl,
            });
          }}
          data-testid={`button-fav-maintenance-${agent.userId}`}
        >
          <Heart className={`w-3 h-3 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>

        {/* Availability — bottom-left dot over the image, real agent.available state */}
        <span
          className={`absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full border-2 border-white ${agent.available ? "bg-green-500" : "bg-gray-300"}`}
          title={agent.available ? "Disponible" : "Indisponible"}
        />

        {/* Category — bottom-right badge, real admin-managed Maintenance category + icon (same taxonomy/icon source as the filter strip) */}
        {primaryCategory && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
            <span className="text-xs leading-none">{categoryIcons.get(primaryCategory) ?? DEFAULT_CATEGORY_ICON}</span>{primaryCategory}
          </span>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight truncate group-hover:text-orange-600 transition-colors ${t.textPrimary}`}>{agent.name}</h3>
        <p className={`text-xs truncate ${t.textMuted}`}>{agent.jobTitle}</p>
        {agent.description && <p className={`text-xs line-clamp-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{agent.description}</p>}

        <div className="flex items-center gap-2 flex-wrap">
          <span className={`flex items-center gap-0.5 text-[11px] ${t.textSubtle}`}>
            <MapPin className="w-2.5 h-2.5" />{agent.distanceKm != null ? formatDistance(agent.distanceKm) : (agent.location || "—")}
          </span>
          <span className={`flex items-center gap-0.5 text-[11px] ${t.textSubtle}`}><Zap className="w-2.5 h-2.5" />{agent.responseTime}</span>
        </div>

        <div className={`mt-auto pt-2 border-t ${t.border}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <StarRating agent={agent} isDark={isDark} />
              <span className={`text-[11px] ${t.textSubtle}`}>({agent.reviewCount})</span>
            </span>
            <span className={`text-[11px] ${t.textSubtle}`}>{agent.yearsExperience} ans exp.</span>
          </div>
        </div>
        {/* Skills/certifications/actions intentionally kept out of the card
            (Part 1) — the details modal already covers them; the marketplace
            card stays a compact summary. The "Tarif / jour" tile that used to
            close this card was removed here
            (docs/maintenance_pricing_admin_performance_audit.md Section 2) —
            dailyRateInCents itself is preserved internally/Admin-managed, just
            no longer shown to Coffee Owners. */}
      </div>
    </div>
  );
}

// Availability modal — now the shared Disponibilité modal (reference:
// client/src/components/marketing/marketing-detail-modal.tsx's
// MarketingAvailabilityModal, extracted to client/src/components/shared/
// availability-modal.tsx), kept under this name so the call site below
// needs no changes. The old close-button-on-the-left layout is replaced by
// the shared component's reference layout (close button on the right),
// correcting a pre-existing inconsistency with the other sections.
function MaintenanceAvailabilityModal({
  open, onClose, agentName, weeklyHours, isDark,
}: {
  open: boolean;
  onClose: () => void;
  agentName: string;
  weeklyHours: OpeningHoursMap | null;
  isDark: boolean;
}) {
  return (
    <AvailabilityModal
      open={open}
      onClose={onClose}
      targetName={agentName}
      weeklyHours={weeklyHours}
      isDark={isDark}
      noScheduleHint="Ce professionnel n'a pas encore défini ses disponibilités."
    />
  );
}

export function AgentDetailModal({
  agent, open, onClose, onContact, isDark, readOnly = false,
  // Optional — Previous/Next Maintenance provider navigation (task: "Add
  // Consistent Previous/Next Navigation to All Coffee Owner Service Detail
  // Modals"). The owning page computes its own filtered provider list and
  // the current position within it; this modal only renders the buttons
  // and calls the provided callbacks. Omitted by every caller that doesn't
  // provide a navigable list (e.g. the provider's own "preview my
  // profile"), so the buttons simply don't render there.
  hasItemNav = false,
  canNavPrev = false,
  canNavNext = false,
  onNavPrev,
  onNavNext,
}: {
  agent: MaintenanceMarketplaceCard | null;
  open: boolean;
  onClose: () => void;
  onContact: (agent: MaintenanceMarketplaceCard) => void;
  isDark: boolean;
  // Used by the Maintenance agent's own "preview my profile" (Eye icon on
  // Business → Profil): renders the exact same modal a Coffee Owner sees, but
  // Favorite/Report/Contacter/Avis become inert (no self-favorite, self-
  // message, self-report, or self-review), and Intervention targeting is
  // hidden (see the icon row below) — only Disponibilité stays functional,
  // since it just displays the agent's own real saved availability.
  readOnly?: boolean;
  hasItemNav?: boolean;
  canNavPrev?: boolean;
  canNavNext?: boolean;
  onNavPrev?: () => void;
  onNavNext?: () => void;
}) {
  const t = useTheme(isDark);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Portfolio gallery — reuses the exact same lightbox already used by the
  // Marketing details modal (Part 25), no separate gallery component.
  const [albumOpen, setAlbumOpen] = useState(false);
  const [albumIndex, setAlbumIndex] = useState(0);
  const reviewsQuery = useQuery<any[]>({
    queryKey: ["/api/maintenance/reviews", agent?.userId],
    enabled: open && !!agent,
  });
  const { data: reservations = [] } = useQuery<any[]>({
    queryKey: ["/api/maintenance/reservations"],
    enabled: open && !!agent && !!user,
  });
  // Database-backed taxonomy (task: "Use Database-Backed Competencies and
  // Subcompetencies in the Maintenance Detail Modal") — same query/key as
  // maintenance-page.tsx's own top-level `taxonomy` (already active/non-frozen
  // only, see storage.getAvailableMaintenanceTaxonomy), so this dedupes
  // against the cache with zero extra request whenever that page is already
  // mounted; call sites that don't already have it (Admin's own maintenance
  // page, the Maintenance account's own profile preview, etc.) get one small,
  // already-public, unauthenticated query. `agent.skills`/`agent.subSkills`
  // stay the source of WHICH names this account selected (the deprecated
  // `maintenance_profiles.categories` column is still never read here) — this
  // taxonomy is used only to validate that each saved name still corresponds
  // to a real, currently-configured maintenance_competencies/
  // maintenance_sub_competencies record, so a renamed/deleted admin entry
  // can no longer linger in the modal as a stale, orphaned chip.
  const { data: maintenanceTaxonomy } = useQuery<MaintenanceTaxonomy>({
    queryKey: ["/api/maintenance/taxonomy"], enabled: open && !!agent,
  });
  const { validNames: validCompetencyNames, validSubNamesByParent: validSubCompetencyNamesByParent } = useMemo(
    () => buildMaintenanceCompetencyValidity(maintenanceTaxonomy),
    [maintenanceTaxonomy],
  );
  // Only this account's own selected competencies that still resolve to a
  // real, configured maintenance_competencies record — deduplicated, in the
  // profile's own saved order.
  const validSkills = useMemo(() => {
    const seen = new Set<string>();
    return (agent?.skills ?? []).filter((name) => {
      if (!validCompetencyNames.has(name) || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  }, [agent?.skills, validCompetencyNames]);
  // Bug fix: agent.subSkills stores PARENT-QUALIFIED keys ("<competency>::<subSkill>",
  // see shared/maintenance-sub-skill-key.ts), never bare sub-skill names — the same
  // sub-skill label legitimately exists under several different parent competencies, so
  // the previous bare-name match here (`agent.subSkills.includes(sub.name)` against
  // every taxonomy sub-competency regardless of its own parent) could show a sub-skill
  // under the WRONG parent, or under every parent that happens to share that label.
  // Decoding each saved key directly gives the correct parent unambiguously. Each decoded
  // pair is now also validated against the real maintenance_sub_competencies relationship
  // (validSubCompetencyNamesByParent) — a stale/renamed/deleted sub-competency can no
  // longer be displayed just because the profile's own saved array still names it.
  const subSkillsByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of agent?.subSkills ?? []) {
      const decoded = decodeMaintenanceSubSkillKey(key);
      if (!decoded) continue;
      if (!validCompetencyNames.has(decoded.competency)) continue;
      const validSubs = validSubCompetencyNamesByParent.get(decoded.competency);
      if (!validSubs?.has(decoded.subSkill)) continue;
      const list = map.get(decoded.competency) ?? [];
      if (!list.includes(decoded.subSkill)) list.push(decoded.subSkill);
      map.set(decoded.competency, list);
    }
    return map;
  }, [agent?.subSkills, validCompetencyNames, validSubCompetencyNamesByParent]);
  const eligibleReservations = reservations.filter((reservation) =>
    reservation.maintenanceUserId === agent?.userId && reservation.status === "COMPLETED",
  );
  const reviewedReservationIds = new Set((reviewsQuery.data ?? []).map((review) => review.reservationId).filter(Boolean));
  const reviewReservation = eligibleReservations.find((reservation) => !reviewedReservationIds.has(reservation.id));
  const submitReview = useMutation({
    mutationFn: ({ rating, comment }: { rating: number; comment: string }) => {
      if (!agent || !reviewReservation || readOnly) throw new Error("Aucune intervention terminée à évaluer");
      return apiRequest("POST", "/api/maintenance/reviews", {
        maintenanceUserId: agent.userId,
        reservationId: reviewReservation.id,
        rating,
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reviews", agent?.userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/profiles"] });
    },
  });
  const faved = useFavorites((s) => agent ? !!s.maintenance[agent.userId] : false);
  const toggleMaintenance = useFavorites((s) => s.toggleMaintenance);
  // Cover is the detail modal's primary hero image; Photo de profil then Flash
  // are tried in order if it's missing or fails to load (analyse.md image-mapping task).
  const coverImage = useFallbackImage([agent?.coverImageUrl, agent?.profileImageUrl, agent?.flashImageUrl], agent?.userId);
  // Signaler — now the shared ReportModal (task: "Redesign Maintenance
  // Reports Using the Avis Modal Pattern and Add Admin Moderation"), same
  // open/close state as before, the rating+comment form and its own
  // scroll-dismiss now live inside ReportModal itself.
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  // Star (Phase 7) — new icon alongside the existing Signaler/Disponibilité
  // pair; opens its own dedicated modal instead of expanding inline, same
  // pattern as Signaler/Disponibilité already do. (The former Flash icon here
  // was replaced by MaintenanceJobTargetButton — see the icon row below.)
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const submitReportMutation = useSubmitMaintenanceReport();
  const submitReport = async (rating: number, reason: string) => {
    if (readOnly) throw new Error("Aperçu en lecture seule");
    await submitReportMutation.mutateAsync({ targetUserId: agent!.userId, reason, rating });
  };

  // Scroll-direction dismissal (scroll down, back up, then up again past the
  // top closes the modal with a slide-down + fade) — same behavior and
  // timing as the Pack Detail Modal, via the shared hook; see
  // client/src/hooks/use-scroll-dismiss.ts. This modal's DialogContent is
  // itself the scroll container (no separate inner scroll div), so the
  // gesture handlers and dismiss styles attach directly to it below. Called
  // before the `!agent` early return so it always runs (rules of hooks).
  const {
    onBodyWheel, onBodyTouchStart, onBodyTouchMove, onBodyTouchEnd,
    dismissContentStyle, dismissOverlayStyle,
  } = useScrollDismiss(open, onClose, undefined, true);

  if (!agent) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      {/* Scrollbar treatment (Part 10) matches the existing My Favorites modal
          scroll container exactly (marketplace-layout.tsx) — same thin
          thumb/track/hover classes, not a new scrollbar style. */}
      {/* Dimensions/scrolling now match the Barista Details Modal exactly:
          same sm:max-w-2xl, same themed background on DialogContent itself
          (not just an inner wrapper), same scrollbar treatment. */}
      <DialogContent
        className={`sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl border-0 shadow-2xl [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${isDark ? "bg-gray-900" : "bg-white"}`}
        style={dismissContentStyle}
        overlayStyle={dismissOverlayStyle}
        onWheel={onBodyWheel}
        onTouchStart={onBodyTouchStart}
        onTouchMove={onBodyTouchMove}
        onTouchEnd={onBodyTouchEnd}
      >
        <VisuallyHidden><DialogTitle>Profil Technicien Maintenance</DialogTitle></VisuallyHidden>
        <div className="flex flex-col">
          {/* Large real profile picture (Part 7) — same treatment as the
              Barista Details Modal reference: full-width banner instead of a
              small avatar, favorite/report/close overlaid on the image. */}
          <div className={`relative w-full h-56 sm:h-72 shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
            <ModalGrabber isDark={isDark} onImage />
            {/* Cover (Part 4) — when set (or Profile/Flash fall back in, see
                analyse.md image-mapping task), shown as the banner background with
                the logo demoted to a small corner badge; falls back to the existing
                initials treatment only when all three image URLs are missing or
                fail to load. */}
            {coverImage.src ? (
              <img src={coverImage.src} onError={coverImage.onError} alt="" className="w-full h-full object-cover" />
            ) : (
              <Avatar className="w-full h-full rounded-none">
                <AvatarFallback className="rounded-none bg-gradient-to-br from-orange-500 to-amber-600">
                  <span className="text-white font-bold text-6xl">{agent.initials}</span>
                </AvatarFallback>
              </Avatar>
            )}
            {/* Small corner logo badge — kept tied to the raw coverImageUrl field
                (not the resolved fallback) so it only appears when the banner is
                genuinely showing a distinct Cover image, never a redundant repeat
                of the same Photo de profil already filling the banner. */}
            {agent.coverImageUrl && (
              <Avatar className="absolute top-3 left-3 w-11 h-11 rounded-xl border-2 border-white/80 shadow-md">
                <AvatarImage src={getAvatarUrl(agent as any)} alt={agent.name} className="object-cover" />
                <AvatarFallback className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white text-sm font-bold">
                  {agent.initials}
                </AvatarFallback>
              </Avatar>
            )}
            {/* Top right — Close + Favorite, unchanged position (Part 9/20) */}
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={() => { if (!readOnly) toggleMaintenance({ id: agent.userId, name: agent.name, initials: agent.initials, specialty: agent.specialty, categories: agent.skills, skills: agent.skills, location: agent.location, rating: Number(ratingValue(agent)) || 0, available: agent.available, profileImageUrl: agent.profileImageUrl }); }} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Heart className={`w-4 h-4 ${faved ? "fill-rose-500 text-rose-500" : "text-white"}`} /></button>
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
            </div>
            {/* Bottom right — Signaler, Disponibilité, new Avis (Star) + Flash icons */}
            <div className="absolute bottom-3 right-3 flex gap-2">
              <button onClick={() => { if (!readOnly) setReportModalOpen(true); }} title="Signaler" data-testid="button-open-maintenance-report" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Flag className="w-4 h-4 text-white" /></button>
              <button onClick={() => setAvailabilityModalOpen(true)} title="Disponibilité" data-testid="button-open-maintenance-availability" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Clock className="w-4 h-4 text-white" /></button>
              <button onClick={() => setReviewsModalOpen(true)} title="Avis" data-testid="button-open-maintenance-reviews" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Star className="w-4 h-4 text-white" /></button>
              {/* Intervention — Coffee Owner-facing only; replaces the former
                  Flash action here (docs/maintenance_interventions_implementation_audit.md
                  Section 10). Associates this specific provider with one of
                  the owner's own MANUAL+PUBLISHED intervention posts. */}
              {!readOnly && (
                <MaintenanceJobTargetButton
                  maintenanceUserId={agent.userId}
                  maintenanceName={agent.name}
                  maintenanceSkills={agent.skills}
                  maintenanceSubSkills={agent.subSkills}
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"
                />
              )}
            </div>
            <span className={`absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm ${agent.available ? "bg-green-500/90 text-white" : "bg-black/50 text-white/80"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${agent.available ? "bg-white" : "bg-white/60"}`} />
              {agent.available ? "Disponible" : "Indisponible"}
            </span>
          </div>
          <div className="p-5 sm:p-6 space-y-5">
            {/* Name + type badge share a row, subtitle underneath — same DOM
                shape as the Barista modal's Name+Level/bio header (Part 5). */}
            <div>
              <div className="flex items-start justify-between gap-x-3 gap-y-1">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h2 className={`font-bold text-xl leading-tight min-w-0 ${t.textPrimary}`}>{agent.name}</h2>
                  <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${TYPE_COLORS[agent.profileType] ?? "bg-gray-100 text-gray-700"}`}>{agent.profileType}</Badge>
                </div>
                {hasItemNav && (
                  <ItemNavButtons
                    isDark={isDark}
                    canPrev={canNavPrev}
                    canNext={canNavNext}
                    onPrev={() => onNavPrev?.()}
                    onNext={() => onNavNext?.()}
                    prevLabel="Prestataire précédent"
                    nextLabel="Prestataire suivant"
                    prevTestId="button-maintenance-nav-prev"
                    nextTestId="button-maintenance-nav-next"
                  />
                )}
              </div>
              <p className={`text-sm leading-relaxed mt-1.5 ${t.textMuted}`}>{agent.jobTitle}</p>
              {/* Rating / location / distance inline row — same treatment as
                  the Barista modal's identity-row. */}
              <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {ratingValue(agent)} ({agent.reviewCount} avis)</span>
                {agent.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {agent.location}</span>}
                {agent.distanceKm != null && <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> {agent.distanceKm} km</span>}
              </div>
            </div>

            {/* Expérience/Réponse — same boxed-tile treatment as before; the
                "Tarif / jour" tile that used to lead this row was removed here
                (docs/maintenance_pricing_admin_performance_audit.md Section 2),
                grid narrowed from 3 to 2 columns accordingly. */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className={`p-3 rounded-xl ${t.mutedBg}`}>
                <p className={`text-[11px] ${t.textSubtle}`}>Expérience</p>
                <p className={`font-bold ${t.textPrimary}`}>{agent.yearsExperience} ans</p>
              </div>
              <div className={`p-3 rounded-xl ${t.mutedBg}`}>
                <p className={`text-[11px] ${t.textSubtle}`}>Réponse</p>
                <p className={`font-bold ${t.textPrimary}`}>{agent.responseTime}</p>
              </div>
            </div>

            {/* Standardize Maintenance and Barista Detail Modal Layouts — every
                logical section below is now its own visually separated
                container (p-3 rounded-xl ${t.mutedBg}), same structural
                pattern as the Academy detail modal's own sectionBg boxes
                (components/academy/academy-detail-modal.tsx) — reusing
                Maintenance's own already-established mutedBg token (already
                used by Expérience/Réponse above and Zone d'intervention below)
                rather than importing Academy's distinct color values into a
                different module. Content/data/logic inside each box
                unchanged. */}
            <div className={`p-3 rounded-xl ${t.mutedBg}`}>
              <h3 className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>À propos</h3>
              <p className={`text-sm leading-relaxed ${t.textPrimary}`}>{agent.description || "Aucune description disponible."}</p>
            </div>
            {/* Détails de Service — real, professional-entered content only, never
                shown when empty, same convention as marketingServices.offerDetails
                (docs/service_details_offer_details_and_desktop_navbar_audit.md).
                Distinct from the short "À propos" blurb above. Internal
                max-height + scroll (same thin-scrollbar classes as this modal's
                own DialogContent) added here specifically because this is the
                one field explicitly prone to long bullet-list content — other,
                typically-short sections stay uncapped, matching the Academy
                reference's own "don't force a fixed height everywhere" approach. */}
            {agent.serviceDetails?.trim() && (
              <div className={`p-3 rounded-xl ${t.mutedBg}`}>
                <h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><ListChecks className="w-3.5 h-3.5" /> Détails de Service</h3>
                <div className="max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${t.textPrimary}`}>{agent.serviceDetails}</p>
                </div>
              </div>
            )}
            {/* validSkills is agent.skills (the one authoritative Maintenance competency
                field — no longer unioned with agent.categories, the deprecated duplicate,
                see maintenanceProfiles.categories's own schema comment) narrowed to names
                that still resolve to a real, currently-configured maintenance_competencies
                record (task: "Use Database-Backed Competencies and Subcompetencies in the
                Maintenance Detail Modal") — a stale/renamed/deleted admin entry can no
                longer linger here just because it's still present in the saved array.
                Chips carry a real dark-mode variant instead of the previous hardcoded
                light-only orange-50/amber-50 colors (Part 8's own fix, unrelated). */}
            <div className={`p-3 rounded-xl ${t.mutedBg}`}>
              <h3 className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Compétences</h3>
              <div className="space-y-2">
                {validSkills.map((item) => {
                  const subs = subSkillsByParent.get(item) ?? [];
                  return (
                    <div key={item}>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${isDark ? "bg-orange-900/30 text-orange-300 border-orange-800" : "bg-orange-50 text-orange-700 border-orange-200"}`}>{item}</span>
                      {subs.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 ml-1">
                          {subs.map((subName) => (
                            <span key={subName} className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${isDark ? "bg-gray-800 text-white border-gray-700" : "bg-gray-50 text-gray-700 border-gray-200"}`}>{subName}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
             {agent.certifications.length > 0 && (
               <div className={`p-3 rounded-xl ${t.mutedBg}`}>
                 <h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Award className="w-3.5 h-3.5 text-amber-500" /> Certifications</h3>
                 <div className="flex flex-wrap gap-1.5">{agent.certifications.map((item) => <span key={item} className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${isDark ? "bg-amber-900/30 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{item}</span>)}</div>
               </div>
             )}
             {/* Old "Disponibilité / Horaires" section removed from the main
                 body (Part 8) — now reachable via the Disponibilité icon on
                 the profile picture, which opens MaintenanceAvailabilityModal. */}
             <div className={`${t.mutedBg} rounded-xl p-3`}><h3 className={`text-xs font-semibold mb-2 ${t.textMuted}`}>Zone d'intervention</h3><div className={`flex items-center gap-2 text-sm ${t.textPrimary}`}><MapPin className="w-3.5 h-3.5 text-orange-500" />{agent.coverageArea || agent.location || "—"}</div></div>
             {agent.portfolioImages.length > 0 && (
               <div className={`p-3 rounded-xl ${t.mutedBg}`}>
                 <h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><ImageIcon className="w-3.5 h-3.5" /> Portfolio</h3>
                 <div className="grid grid-cols-4 gap-2">{agent.portfolioImages.map((image, i) => <button key={i} type="button" onClick={() => { setAlbumIndex(i); setAlbumOpen(true); }} className={`aspect-square rounded-lg overflow-hidden border ${t.border} ${isDark ? "bg-gray-800" : "bg-gray-100"}`} data-testid={`button-portfolio-thumb-${i}`}><img src={image} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover" /></button>)}</div>
               </div>
             )}
            {/* Avis — moved into the dedicated Star-icon ReviewsModal (Phase 7),
                no longer rendered inline here. The old "Réserver" button/modal
                was removed here (docs/maintenance_intervention_reservation_cleanup_audit.md
                Section 4) — the Intervention action (corner icon above) is now
                the only way to engage a Maintenance professional from this
                modal; Contacter stays for messaging. */}
             <div className={`border-t ${t.border} pt-4 flex items-center justify-end gap-2`}>
               <Button variant="outline" onClick={() => { if (!readOnly) onContact(agent); }} className={`rounded-xl px-4 ${isDark ? "border-gray-700 text-gray-300" : "border-gray-200 text-gray-600"}`}><MessageCircle className="w-4 h-4 mr-1.5" />Contacter</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Signaler — redesigned on the Avis modal pattern (task: "Redesign
        Maintenance Reports Using the Avis Modal Pattern and Add Admin
        Moderation"): 5-level sadness rating + comment, same shared
        ReportModal every future module (Print/Barista/Academy/Marketing/
        Shop) will reuse. Submitted reports are never shown anywhere until
        an Admin explicitly publishes them (see MaintenanceBlacklistModal). */}
    <ReportModal
      open={reportModalOpen}
      onClose={() => setReportModalOpen(false)}
      targetName={agent.name}
      onSubmit={submitReport}
      isSubmitting={submitReportMutation.isPending}
      accentClassName={isDark ? "text-amber-400" : "text-orange-500"}
    />

    {/* Disponibilité (Part 12-14) — weekly schedule, Shop Opening Hours
        visual reference, real saved Maintenance data only. */}
    <MaintenanceAvailabilityModal
      open={availabilityModalOpen}
      onClose={() => setAvailabilityModalOpen(false)}
      agentName={agent.name}
      weeklyHours={agent.weeklyHours ?? null}
      isDark={isDark}
    />

    <MarketingPortfolioAlbumModal
      open={albumOpen}
      onClose={() => setAlbumOpen(false)}
      images={agent.portfolioImages}
      initialIndex={albumIndex}
      providerName={agent.name}
    />

    {/* Avis (Phase 7) — dedicated modal, opened via the new Star icon. Same
        review data/mutation as before (reviewsQuery/submitReview), just
        relocated out of the main modal's body into this one. */}
    <ReviewModal
      open={reviewsModalOpen}
      onClose={() => setReviewsModalOpen(false)}
      targetName={agent.name}
      reviewTypeLabel="Avis sur l'intervention"
      existingReviews={reviewsQuery.data ?? []}
      myReview={null}
      canReview={!readOnly && !!reviewReservation}
      onSubmit={async (rating, comment) => { await submitReview.mutateAsync({ rating, comment }); }}
      isSubmitting={submitReview.isPending}
    />

    </>
  );
}

export default function MaintenancePage({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user } = useAuth();
  const accessLevel = useAccessLevel();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);
  const { settings: heroActions } = useHeroActionSettings();
  const { config: heroConfig } = useServiceHeroConfig("MAINTENANCE");
  const [search, setSearch] = useState("");
  // Mobile collapsible search (mobile_filters_darkmode_audit.md) — presentation only.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filterCategory, setFilterCategory] = useState("");
  // Encoded "<competency>::<subSkill>" keys (shared/maintenance-sub-skill-key.ts) — never
  // bare sub-skill names, so a selection always stays unambiguous even when the same
  // sub-skill label exists under several parent competencies (the exact collision the
  // qualified-key format was introduced to prevent, see that file's own comment).
  // Single-selection (task: "...and Single-Selection Picklists") — was a
  // multi-select array; a Coffee Owner now picks one sous-compétence at a
  // time, same as every other filter on this page.
  const [filterSubSkill, setFilterSubSkill] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterAvailability, setFilterAvailability] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<MaintenanceMarketplaceCard | null>(null);
  const [fastSearchOpen, setFastSearchOpen] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  // Hero report icon visibility (task: "Centralize Report Moderation in
  // Admin Communication and Fix Real-Time Publication", Phase 8) — same
  // query/cache key MaintenanceBlacklistModal itself reads (page 1, limit
  // 10), so this never fires a second network request; React Query shares
  // the one cached result between both call sites. Fails OPEN (icon stays
  // visible) while loading or on error — only a confirmed total of 0 hides
  // it, per spec ("never permanently hide just because data hasn't loaded").
  const { data: publishedReportsPreview, isLoading: publishedReportsLoading, error: publishedReportsError } = useMaintenancePublishedReports(1, 10);
  const hasPublishedMaintenanceReports = publishedReportsLoading || publishedReportsError
    ? true
    : (publishedReportsPreview?.total ?? 0) > 0;
  const [detailOpen, setDetailOpen] = useState(false);
  const [jobManagementOpen, setJobManagementOpen] = useState(false);
  const [jobManagementJobId, setJobManagementJobId] = useState<number | null>(null);
  const { data: profiles = [], isLoading: profilesLoading } = useQuery<MaintenanceMarketplaceCard[]>({ queryKey: ["/api/maintenance/profiles"] });
  // Admin taxonomy — kept ONLY for icon lookups (categoryIcons/subSkillIconByKey below).
  // Task: "Synchronize All Filters and Display Only Options With Matching Results" —
  // the SELECTABLE option lists themselves (categories/subSkillFilterOptions/
  // typeOptions/availabilityOptions/allLocations further down) must come from
  // eligible `profiles`, never from this global admin-configured list, since a
  // competency/sub-skill can exist here with zero providers actually offering it.
  // The old `/api/maintenance/categories` query (the prior, taxonomy-sourced
  // pill list) has been removed — nothing else in this file read it.
  const { data: taxonomy } = useQuery<{
    competencies: { id: number; name: string; icon: string | null }[];
    zones: any[];
    subCompetencies: { id: number; competencyId: number; name: string; icon: string | null }[];
  }>({ queryKey: ["/api/maintenance/taxonomy"] });
  // Database-backed validity (task: "Synchronize Maintenance Filters With
  // Database Competencies and Profile Assignments") — same shared utility
  // AgentDetailModal uses, applied here so the CATEGORY/SOUS-COMPÉTENCE
  // filter options (categories/subSkillFilterOptions below) require a name
  // to resolve to a real, currently-configured maintenance_competencies/
  // maintenance_sub_competencies record, in addition to already requiring at
  // least one matching eligible profile (the cross-filter-aware part already
  // fixed by prior tasks) — a profile's own skills/subSkills arrays are
  // trusted for WHICH names it claims, never for whether those names are
  // still valid taxonomy entries.
  const { validNames: validCompetencyNames, validSubNamesByParent: validSubCompetencyNamesByParent } = useMemo(
    () => buildMaintenanceCompetencyValidity(taxonomy),
    [taxonomy],
  );
  const categoryIcons = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of taxonomy?.competencies ?? []) if (c.icon) map.set(c.name, c.icon);
    return map;
  }, [taxonomy]);
  const subSkillIconByKey = useMemo(() => {
    const nameById = new Map((taxonomy?.competencies ?? []).map((c) => [c.id, c.name]));
    const map = new Map<string, string | null>();
    for (const sub of taxonomy?.subCompetencies ?? []) {
      const parentName = nameById.get(sub.competencyId);
      if (!parentName) continue;
      map.set(encodeMaintenanceSubSkillKey(parentName, sub.name), sub.icon);
    }
    return map;
  }, [taxonomy]);
  const { data: favoriteIds = EMPTY_IDS } = useQuery<number[]>({ queryKey: ["/api/maintenance-favorites"], enabled: !!user && accessLevel === "approved" });
  const syncMaintenance = useFavorites((s) => s.syncMaintenance);

  useEffect(() => {
    if (profilesLoading) return;
    syncMaintenance(favoriteIds, profiles);
  }, [favoriteIds, profiles, profilesLoading, syncMaintenance]);
  const providerId = Number(new URLSearchParams(location.split("?")[1] ?? "").get("providerId"));
  useEffect(() => {
    if (!providerId || !profiles.length) return;
    const provider = profiles.find((profile) => profile.userId === providerId);
    if (provider) {
      setSelectedAgent(provider);
      setDetailOpen(true);
    }
  }, [profiles, providerId]);
  useEffect(() => {
    if (!selectedAgent) return;
    const freshAgent = profiles.find((profile) => profile.userId === selectedAgent.userId);
    if (freshAgent && freshAgent !== selectedAgent) setSelectedAgent(freshAgent);
  }, [profiles, selectedAgent?.userId]);

  // ── Data-driven, cross-filter-aware option derivation ───────────────────────
  // (task: "Synchronize All Filters...") — mirrors the /products fix: a single
  // search-only base, then a `withoutDim` helper that narrows by every OTHER
  // active filter but never by the dimension being derived, so a filter's own
  // currently selected value can never vanish from its own option list while
  // still correctly narrowing in response to its siblings.
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return profiles;
    const q = search.toLowerCase();
    return profiles.filter((item) => [item.name, item.jobTitle, item.description, item.location, ...item.skills].join(" ").toLowerCase().includes(q));
  }, [profiles, search]);

  type MaintenanceDim = "category" | "subSkill" | "type" | "availability" | "location";
  const withoutDim = (exclude: MaintenanceDim) => {
    let list = searchFiltered;
    if (exclude !== "category" && filterCategory) list = list.filter((item) => item.skills.includes(filterCategory));
    if (exclude !== "subSkill" && filterSubSkill) list = list.filter((item) => item.subSkills?.includes(filterSubSkill));
    if (exclude !== "type" && filterType) list = list.filter((item) => item.profileType === filterType);
    if (exclude !== "availability" && filterAvailability) list = list.filter((item) => (filterAvailability === "available" ? item.available : !item.available));
    if (exclude !== "location" && filterLocation) list = list.filter((item) => item.location === filterLocation);
    return list;
  };

  // Category pills — real competencies actually offered by an eligible, currently
  // matching provider (root cause: previously the full admin taxonomy list,
  // regardless of whether any provider had that competency), AND now also
  // required to resolve to a real, currently-configured maintenance_competencies
  // record (task: "Synchronize Maintenance Filters With Database Competencies
  // and Profile Assignments") — a profile's saved `skills` name is no longer
  // trusted on its own. When a sub-skill IS selected, a provider's full
  // `skills` list must not be unioned in wholesale — a provider can
  // legitimately have several unrelated categories (e.g. Caméras AND Chicha),
  // and only the sub-skill's OWN real parent (carried directly by its encoded
  // key, see shared/maintenance-sub-skill-key.ts) is genuinely related.
  const categories = useMemo(() => {
    const base = withoutDim("category");
    if (filterSubSkill) {
      const decoded = decodeMaintenanceSubSkillKey(filterSubSkill);
      if (!decoded || !validCompetencyNames.has(decoded.competency) || !validSubCompetencyNamesByParent.get(decoded.competency)?.has(decoded.subSkill)) return [];
      return base.some((item) => item.subSkills?.includes(filterSubSkill)) ? [decoded.competency] : [];
    }
    const set = new Set<string>();
    base.forEach((item) => item.skills.forEach((s) => { if (validCompetencyNames.has(s)) set.add(s); }));
    return Array.from(set).sort();
  }, [searchFiltered, filterSubSkill, filterType, filterAvailability, filterLocation, validCompetencyNames, validSubCompetencyNamesByParent]);

  // Sub-skills — same fix: derived from providers' own real `subSkills` field,
  // genuinely restricted to keys whose OWN encoded parent equals the selected
  // category (root cause of the Caméras/Chicha bug — a provider matching
  // filterCategory can still carry other categories' sub-skill keys in its
  // flattened `subSkills` array), AND now also required to resolve to a real,
  // currently-configured maintenance_sub_competencies record under that exact
  // parent (task: "Synchronize Maintenance Filters With Database Competencies
  // and Profile Assignments"). Same parent-qualified-label-on-collision
  // behavior as before.
  const subSkillFilterOptions = useMemo(() => {
    const base = withoutDim("subSkill");
    const present = new Set<string>();
    base.forEach((item) => (item.subSkills ?? []).forEach((key) => {
      const d = decodeMaintenanceSubSkillKey(key);
      if (!d) return;
      if (filterCategory && d.competency !== filterCategory) return;
      if (!validCompetencyNames.has(d.competency) || !validSubCompetencyNamesByParent.get(d.competency)?.has(d.subSkill)) return;
      present.add(key);
    }));
    const decoded = new Map<string, { competency: string; subSkill: string }>();
    const nameCounts = new Map<string, number>();
    present.forEach((key) => {
      const d = decodeMaintenanceSubSkillKey(key);
      if (!d) return;
      decoded.set(key, d);
      nameCounts.set(d.subSkill, (nameCounts.get(d.subSkill) ?? 0) + 1);
    });
    const options: { key: string; label: string; icon: string | null }[] = [];
    present.forEach((key) => {
      const d = decoded.get(key);
      if (!d) return;
      options.push({
        key,
        label: !filterCategory && (nameCounts.get(d.subSkill) ?? 0) > 1 ? `${d.subSkill} · ${d.competency}` : d.subSkill,
        icon: subSkillIconByKey.get(key) ?? null,
      });
    });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [searchFiltered, filterCategory, filterType, filterAvailability, filterLocation, subSkillIconByKey, validCompetencyNames, validSubCompetencyNamesByParent]);

  // Type ("Freelance"/"Entreprise"/"Agence") — real values present among eligible
  // providers, not a hardcoded 3-item enum (root cause: the old Select always
  // rendered all 3 regardless of data).
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    withoutDim("type").forEach((item) => { if (item.profileType) set.add(item.profileType); });
    return Array.from(set).sort();
  }, [searchFiltered, filterCategory, filterSubSkill, filterAvailability, filterLocation]);

  // Availability — only offer "Disponible"/"Indisponible" when at least one
  // eligible provider (under the other active filters) is actually in that state.
  const availabilityOptions = useMemo(() => {
    const base = withoutDim("availability");
    return { available: base.some((item) => item.available), unavailable: base.some((item) => !item.available) };
  }, [searchFiltered, filterCategory, filterSubSkill, filterType, filterLocation]);

  const allLocations = useMemo(() => {
    const set = new Set<string>();
    withoutDim("location").forEach((item) => { if (item.location) set.add(item.location); });
    return Array.from(set).sort();
  }, [searchFiltered, filterCategory, filterSubSkill, filterType, filterAvailability]);

  // Reconcile existing selections that a sibling filter change just made invalid —
  // clears only the one no longer compatible, never resets unrelated filters, and
  // can't loop (each effect only ever clears, it never re-sets a value), so React
  // settles after at most one extra pass per genuine conflict (task Phase 5/6).
  useEffect(() => { if (filterCategory && !categories.includes(filterCategory)) setFilterCategory(""); }, [categories]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (filterSubSkill && !subSkillFilterOptions.some((o) => o.key === filterSubSkill)) setFilterSubSkill(""); }, [subSkillFilterOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (filterType && !typeOptions.includes(filterType)) setFilterType(""); }, [typeOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (filterAvailability === "available" && !availabilityOptions.available) setFilterAvailability("");
    if (filterAvailability === "unavailable" && !availabilityOptions.unavailable) setFilterAvailability("");
  }, [availabilityOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (filterLocation && !allLocations.includes(filterLocation)) setFilterLocation(""); }, [allLocations]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let list = profiles;
    // item.skills is the one authoritative Maintenance competency field — item.categories
    // (deprecated duplicate, see maintenanceProfiles.categories's own schema comment) is no
    // longer read here, in the search haystack below, or in the parent-skill filter.
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter((item) => [item.name, item.jobTitle, item.description, item.location, ...item.skills].join(" ").toLowerCase().includes(q)); }
    if (filterCategory) list = list.filter((item) => item.skills.includes(filterCategory));
    // Parent-qualified match only — a provider's subSkills are stored as
    // "<competency>::<subSkill>" keys (see shared/maintenance-sub-skill-key.ts), so this
    // can never match a same-named sub-skill the provider only has under an unrelated
    // parent (the exact bug this task fixes, applied here to the Coffee Owner filter too).
    if (filterSubSkill) list = list.filter((item) => item.subSkills?.includes(filterSubSkill));
    if (filterType) list = list.filter((item) => item.profileType === filterType);
    if (filterAvailability === "available") list = list.filter((item) => item.available);
    if (filterAvailability === "unavailable") list = list.filter((item) => !item.available);
    if (filterLocation) list = list.filter((item) => item.location === filterLocation);
    return list;
  }, [profiles, search, filterCategory, filterSubSkill, filterType, filterAvailability, filterLocation]);

  // Previous/Next Maintenance provider navigation (task: "Add Consistent
  // Previous/Next Navigation to All Coffee Owner Service Detail Modals") —
  // browses `filtered`, the same list already shown above, so navigation
  // always respects the currently active filters.
  const maintenanceNavIds = useMemo(() => filtered.map((a) => a.userId), [filtered]);
  const { prevId: prevAgentId, nextId: nextAgentId, hasNav: hasAgentNav } = useCircularItemNav(selectedAgent?.userId ?? null, maintenanceNavIds);
  const navToAgent = (id: number | null) => {
    if (id == null) return;
    const agent = filtered.find((a) => a.userId === id);
    if (agent) setSelectedAgent(agent);
  };

  const contact = async (agent: MaintenanceMarketplaceCard) => {
      try {
        const response = await apiRequest("POST", "/api/messages/conversations", {
          targetUserId: agent.userId,
          service: "MAINTENANCE",
        });
        const conversation = await response.json() as { conversation: { id: number } };
        navigate(`/cafe/messages?service=MAINTENANCE&conversationId=${conversation.conversation.id}`);
      }
    catch (error) { toast({ title: "Contact impossible", description: error instanceof Error ? error.message : "Veuillez réessayer.", variant: "destructive" }); }
  };
  const hasFilters = !!(search || filterCategory || filterSubSkill || filterType || filterAvailability || filterLocation);
  const openDetail = (agent: MaintenanceMarketplaceCard) => { setSelectedAgent(agent); setDetailOpen(true); };
  // Selecting (or switching) a parent competency keeps the selected sub-skill
  // only if it still belongs to it — it never blanket-clears an otherwise-
  // still-compatible selection.
  const selectCategory = (category: string) => {
    setFilterCategory(category);
    if (category) setFilterSubSkill((prev) => (decodeMaintenanceSubSkillKey(prev)?.competency === category ? prev : ""));
  };
  // Single-selection (task: "...and Single-Selection Picklists") — selecting
  // the same value again clears it (same "toggle off" affordance the old
  // multi-select checkbox had), selecting a different value replaces it.
  // Direct selection also resolves the parent category deterministically —
  // the key itself carries its own real competency (never ambiguous, so
  // never arbitrarily forced the way a cross-category attribute would be).
  const selectSubSkill = (key: string) => {
    const next = filterSubSkill === key ? "" : key;
    setFilterSubSkill(next);
    if (next) {
      const decoded = decodeMaintenanceSubSkillKey(next);
      if (decoded) setFilterCategory(decoded.competency);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      {/* Fast Search (docs/maintenance_print_nested_modal_audit.md) — rendered
          FIRST so that when "Info/Détails" opens AgentDetailModal below, the
          detail dialog (mounted later in the DOM) stacks visually above this
          one instead of the other way around, and Fast Search simply stays
          open underneath rather than being closed when Details opens. */}
      <MaintenanceFastSearch open={fastSearchOpen} onClose={() => setFastSearchOpen(false)} providers={profiles} onOpenDetail={(agent) => openDetail(agent)} />
      <ServiceHeroShell
        config={heroConfig}
        defaultBackground={t.dk ? <><div className="absolute inset-0 bg-gray-900" /><div className="absolute inset-0 bg-gradient-to-br from-orange-900/25 via-gray-900 to-gray-900" /><div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" /></> : <><div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600" /><div className="absolute inset-0 bg-black/10" /></>}
        controlsRow={
          /* The global navbar theme control is the single Dark/Light toggle
             now, so the duplicated hero one is gone; Fast Search/Report stay
             Admin-toggleable per service (see /api/hero-actions). */
          <div className="relative flex justify-end items-center gap-2 mb-9">
            {accessLevel === "approved" && heroActions.MAINTENANCE.reportEnabled && hasPublishedMaintenanceReports && (
              <button onClick={() => setBlacklistOpen(true)} aria-label="Professionnels signalés" title="Professionnels signalés" data-testid="button-open-maintenance-blacklist" className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${t.dk ? "bg-gray-800 hover:bg-gray-700 text-red-400" : "bg-white/20 hover:bg-white/30 text-white"}`}>
                <Ban className="w-4 h-4" />
              </button>
            )}
            {accessLevel === "approved" && heroActions.MAINTENANCE.fastSearchEnabled && (
              <button onClick={() => setFastSearchOpen(true)} aria-label="Fast Search" title="Fast Search — parcourir les professionnels" data-testid="button-open-maintenance-fastsearch" className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${t.dk ? "bg-gray-800 hover:bg-gray-700 text-orange-400" : "bg-white/20 hover:bg-white/30 text-white"}`}>
                <Zap className="w-4 h-4" />
              </button>
            )}
            {accessLevel === "approved" && (
              <button onClick={() => { setJobManagementJobId(null); setJobManagementOpen(true); }} aria-label="Intervention" title="Intervention — publier et gérer" data-testid="button-open-maintenance-job-management" className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${t.dk ? "bg-gray-800 hover:bg-gray-700 text-blue-400" : "bg-white/20 hover:bg-white/30 text-white"}`}>
                <ClipboardList className="w-4 h-4" />
              </button>
            )}
          </div>
        }
      >
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-5 backdrop-blur-sm ${H_ALIGN_ICON_MX[heroConfig.horizontalAlign]} ${t.dk ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}><Wrench className={`w-8 h-8 ${t.dk ? "text-amber-400" : "text-white"}`} /></div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">BigBoss <span className={t.dk ? "text-amber-400" : "text-amber-200"}>MAINTENANCE</span></h1>
        {heroConfig.subtitleEnabled && (
          <p className={`text-base mb-4 max-w-xl ${H_ALIGN_ICON_MX[heroConfig.horizontalAlign]} ${t.dk ? "text-white" : "text-orange-100"}`} style={getHeroSubtitleColorStyle(heroConfig, t.dk)}>{heroConfig.subtitle ?? "Trouvez des techniciens certifiés pour la maintenance et réparation de vos équipements de café"}</p>
        )}
        {heroConfig.infoRowEnabled && (
          <div className={`flex items-center gap-6 flex-wrap text-sm ${H_ALIGN_ROW_JUSTIFY[heroConfig.horizontalAlign]} ${t.dk ? "text-white" : "text-orange-100"}`}><span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{profiles.filter((item) => item.available).length} techniciens</span><span className="flex items-center gap-1.5"><Shield className="w-4 h-4" />{profiles.filter((item) => item.certifications.length > 0).length} certifiés</span><span className="flex items-center gap-1.5"><Zap className="w-4 h-4" />Intervention</span></div>
        )}
      </ServiceHeroShell>
      {comingSoon ? <div className="max-w-3xl mx-auto px-4 py-20 text-center"><Clock className="w-8 h-8 text-orange-600 mx-auto mb-5" /><h2 className={`text-xl font-bold mb-2 ${t.textPrimary}`}>Bientôt disponible</h2><p className={`text-sm ${t.textMuted}`}>Ce service est en cours de préparation. Revenez bientôt pour le découvrir.</p></div> : (
        <>
          <div className="sticky top-14 z-30">
            <div className={`border-b ${t.stripBg}`}>
              <div className="max-w-7xl mx-auto px-4">
                <div className="flex gap-1.5 overflow-x-auto py-3" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                  <div className={`flex gap-1 rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                    <button onClick={() => selectCategory("")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 transition-all text-[11px] font-semibold ${!filterCategory ? t.switcherActive : t.switcherInactive}`} data-testid="button-maintenance-cat-all">
                      <span className="text-base leading-none">🧰</span><span>Tous</span>
                    </button>
                  </div>
                  {categories.map((category) => (
                    <div key={category} className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                      {/* Selecting (or switching) a parent prunes only the now-incompatible
                          sub-skill selections — see selectCategory above — it no longer
                          blanket-resets the whole sub-skill filter. */}
                      <button onClick={() => selectCategory(filterCategory === category ? "" : category)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${filterCategory === category ? t.switcherActive : t.switcherInactive}`} data-testid={`button-maintenance-cat-${category}`}>
                        <span className="text-base leading-none">{categoryIcons.get(category) ?? DEFAULT_CATEGORY_ICON}</span>
                        <span className="max-w-[72px] truncate">{category}</span>
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
                <SlidersHorizontal className={`w-3.5 h-3.5 shrink-0 ${t.textSubtle}`} />
                <div className="relative shrink-0 sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
                  {!searchOpen && (
                    <button
                      type="button"
                      className={`sm:hidden h-7 w-7 rounded-full border flex items-center justify-center shrink-0 ${t.inputBg}`}
                      onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
                      aria-label="Rechercher"
                      data-testid="button-open-maintenance-search"
                    >
                      <Search className={`w-3.5 h-3.5 ${t.textSubtle}`} />
                    </button>
                  )}
                  <div className={`${searchOpen ? "flex" : "hidden"} sm:flex items-center relative w-44 sm:w-full`}>
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${t.textSubtle}`} />
                    <Input
                      ref={searchInputRef}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onBlur={() => { if (!search) setSearchOpen(false); }}
                      placeholder="Nom, compétence, service..."
                      className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
                      data-testid="input-maintenance-search"
                    />
                  </div>
                </div>
                {/* Sous-compétences — Keep Sous-compétences Filters Always Visible: a
                    permanent picklist (never conditionally hidden), scoped to the selected
                    parent when one is active or the union across every parent otherwise
                    (subSkillFilterOptions above). Single-selection (task: "...and
                    Single-Selection Picklists") — a RadioGroup/RadioItem pair replaces the
                    old CheckboxItem array, same dropdown shell/styling, exactly one value
                    selectable at a time. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`h-7 text-xs rounded-full px-3 w-auto min-w-[150px] shrink-0 inline-flex items-center justify-between gap-1.5 border ${t.inputBg}`}
                      data-testid="select-maintenance-subskill"
                    >
                      {subSkillFilterOptions.find((o) => o.key === filterSubSkill)?.label ?? "Sous-compétences"}
                    </button>
                  </DropdownMenuTrigger>
                  {/* Reduce Subcategory Picklist Scroller Height — caps the list at a
                      compact height instead of the default's "up to the viewport edge"
                      max-height, while staying internally scrollable. Remove Visible
                      Scrollbars: matches /products' "All Sub-Categories" filter (no
                      visible scrollbar, scroll still works) — same cross-browser
                      hide-but-keep-scrolling combo already used by this very filter
                      bar's own horizontal chip row just above ([&::-webkit-scrollbar]:hidden
                      + scrollbarWidth: "none"), applied here to vertical scroll instead. */}
                  <DropdownMenuContent
                    className={`${t.selectContent} max-h-56 overflow-y-auto [&::-webkit-scrollbar]:hidden`}
                    style={{ scrollbarWidth: "none" }}
                    align="start"
                  >
                    {subSkillFilterOptions.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Aucune sous-compétence configurée</div>
                    ) : (
                      <DropdownMenuRadioGroup value={filterSubSkill} onValueChange={selectSubSkill}>
                        <DropdownMenuRadioItem value="" data-testid="radio-maintenance-subskill-all">
                          Toutes les sous-compétences
                        </DropdownMenuRadioItem>
                        {subSkillFilterOptions.map((opt) => (
                          <DropdownMenuRadioItem
                            key={opt.key}
                            value={opt.key}
                            data-testid={`radio-maintenance-subskill-${opt.key}`}
                          >
                            {opt.icon ? `${opt.icon} ${opt.label}` : opt.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Select value={filterType || "__all__"} onValueChange={(value) => setFilterType(value === "__all__" ? "" : value)}><SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`}><SelectValue placeholder="Type" /></SelectTrigger><SelectContent className={t.selectContent}><SelectItem value="__all__">Types</SelectItem>{typeOptions.map((v) => <SelectItem key={v} value={v}>{TYPE_LABELS[v] ?? v}</SelectItem>)}</SelectContent></Select>
                <Select value={filterAvailability || "__all__"} onValueChange={(value) => setFilterAvailability(value === "__all__" ? "" : value)}><SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] shrink-0 ${t.selectTrigger}`}><SelectValue placeholder="Disponibilité" /></SelectTrigger><SelectContent className={t.selectContent}><SelectItem value="__all__">Disponibilités</SelectItem>{availabilityOptions.available && <SelectItem value="available">Disponible</SelectItem>}{availabilityOptions.unavailable && <SelectItem value="unavailable">Indisponible</SelectItem>}</SelectContent></Select>
                <Select value={filterLocation || "__all__"} onValueChange={(value) => setFilterLocation(value === "__all__" ? "" : value)}><SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] shrink-0 ${t.selectTrigger}`}><SelectValue placeholder="Ville" /></SelectTrigger><SelectContent className={t.selectContent}><SelectItem value="__all__">Villes</SelectItem>{allLocations.map((location) => <SelectItem key={location} value={location}>{location}</SelectItem>)}</SelectContent></Select>
                {hasFilters && <button onClick={() => { setSearch(""); setFilterCategory(""); setFilterSubSkill(""); setFilterType(""); setFilterAvailability(""); setFilterLocation(""); }} className={`flex items-center gap-1 text-xs transition-colors ml-1 shrink-0 whitespace-nowrap ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}><RotateCcw className="w-3 h-3" />Reset</button>}
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 py-8">
             {filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-16 gap-3 text-center"><Wrench className={`w-12 h-12 ${t.textSubtle}`} /><p className={`font-semibold ${t.textPrimary}`}>Aucun technicien trouvé</p><p className={`text-sm ${t.textMuted}`}>{profiles.length === 0 ? "Aucun profil Maintenance publié pour le moment." : "Essayez d'ajuster vos filtres."}</p></div> : <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{filtered.map((agent) => <AgentCard key={agent.userId} agent={agent} onOpenDetail={openDetail} onContact={contact} categoryIcons={categoryIcons} isDark={isDark} />)}</div>}
          </div>
           <AgentDetailModal
             agent={selectedAgent}
             open={detailOpen}
             onClose={() => setDetailOpen(false)}
             onContact={contact}
             isDark={isDark}
             hasItemNav={hasAgentNav}
             canNavPrev={prevAgentId != null}
             canNavNext={nextAgentId != null}
             onNavPrev={() => navToAgent(prevAgentId)}
             onNavNext={() => navToAgent(nextAgentId)}
           />
        </>
      )}
      {/* Blacklist (Parts 20-22) — same `profiles` list, own
          Maintenance-only component (no Barista data reused). Fast Search
          itself is rendered at the top of this component now — see the
          comment there. */}
      <MaintenanceBlacklistModal open={blacklistOpen} onClose={() => setBlacklistOpen(false)} isDark={isDark} />
      <MaintenanceJobManagementModal
        open={jobManagementOpen}
        onClose={() => setJobManagementOpen(false)}
        initialJobId={jobManagementJobId}
      />
    </div>
  );
}