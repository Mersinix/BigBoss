import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useThemeStore } from "@/store/theme-store";
import { useAuth } from "@/hooks/use-auth";
import { useFavorites } from "@/hooks/use-favorites";
import { useHeroActionSettings } from "@/hooks/use-hero-actions";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MaintenanceFastSearch } from "@/components/maintenance/maintenance-fast-search";
import { MaintenanceBlacklistModal } from "@/components/maintenance/maintenance-blacklist-modal";
import { MarketingPortfolioAlbumModal } from "@/components/marketing/marketing-portfolio-album-modal";
import { ReviewsModal } from "@/components/account/reviews-modal";
import type { MaintenanceMarketplaceCard, OpeningHoursMap } from "@shared/schema";
import { WEEKLY_DAY_DEFS } from "@/lib/weekly-hours";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Wrench, Search, MapPin, Star, MessageCircle, SlidersHorizontal,
  RotateCcw, X, Heart, Clock, Shield, Zap, Award, Users,
  Building2, User, Flag, Navigation, Ban, Image as ImageIcon, ClipboardList,
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
  agent, onOpenDetail, onContact, isDark,
}: {
  agent: MaintenanceMarketplaceCard;
  onOpenDetail: (agent: MaintenanceMarketplaceCard) => void;
  onContact: (agent: MaintenanceMarketplaceCard) => void;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const favoriteId = agent.userId;
  const faved = useFavorites((s) => !!s.maintenance[favoriteId]);
  const toggleMaintenance = useFavorites((s) => s.toggleMaintenance);
  const TypeIcon = TYPE_ICONS[agent.profileType] ?? User;

  // Wide card (Part 16) — left half = photo, right half = information, same
  // dimensions/visual-hierarchy concept as the /barista card redesign (visual
  // reference only — all data/logic below stays Maintenance-specific).
  return (
    <div
      data-testid={`card-maintenance-${agent.userId}`}
      className={`group relative rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex cursor-pointer ${t.cardBg}`}
      onClick={() => onOpenDetail(agent)}
    >
      <button
        className={`absolute top-2 right-2 z-10 w-6 h-6 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform ${isDark ? "bg-gray-700/90" : "bg-white/90"}`}
        onClick={(event) => {
          event.stopPropagation();
          toggleMaintenance({
            id: favoriteId, name: agent.name, initials: agent.initials,
            specialty: agent.specialty, categories: agent.categories, skills: agent.skills,
            location: agent.location, rating: Number(ratingValue(agent)) || 0,
            available: agent.available, profileImageUrl: agent.profileImageUrl,
          });
        }}
        data-testid={`button-fav-maintenance-${agent.userId}`}
      >
        <Heart className={`w-3 h-3 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
      </button>

      <div className="w-2/5 shrink-0 relative">
        <Avatar className="w-full h-full rounded-none">
          <AvatarImage src={getAvatarUrl(agent as any)} alt={agent.name} className="object-cover" />
          <AvatarFallback className="rounded-none bg-orange-100 text-orange-700 font-bold text-2xl">{agent.initials}</AvatarFallback>
        </Avatar>
        <span
          className={`absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full border-2 border-white ${agent.available ? "bg-green-500" : "bg-gray-300"}`}
          title={agent.available ? "Disponible" : "Indisponible"}
        />
      </div>

      <div className="flex-1 min-w-0 p-3 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight truncate group-hover:text-orange-600 transition-colors pr-5 ${t.textPrimary}`}>{agent.name}</h3>
        <p className={`text-[11px] truncate ${t.textMuted}`}>{agent.jobTitle}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-[10px] border-0 px-1.5 flex items-center gap-0.5 ${TYPE_COLORS[agent.profileType] ?? "bg-gray-100 text-gray-700"}`}>
            <TypeIcon className="w-2.5 h-2.5" />{agent.profileType}
          </Badge>
          <span className={`flex items-center gap-0.5 text-[11px] ${t.textSubtle}`}><MapPin className="w-2.5 h-2.5" />{agent.location || "—"}{agent.distanceKm != null && <> · {agent.distanceKm} km</>}</span>
          <span className={`flex items-center gap-0.5 text-[11px] ${t.textSubtle}`}><Zap className="w-2.5 h-2.5" />{agent.responseTime}</span>
        </div>
        <div className="flex items-center gap-2">
          <StarRating agent={agent} isDark={isDark} />
          <span className={`text-[11px] ${t.textSubtle}`}>({agent.reviewCount} avis)</span>
          <span className={`text-[11px] ${t.textSubtle}`}>· {agent.yearsExperience} ans exp.</span>
        </div>
        {/* Skills/certifications/actions intentionally removed from the card
            (Part 1) — the details modal already covers them; the marketplace
            card stays a compact summary, matching the Barista card's cleaner
            hierarchy (reference only, Maintenance fields kept below). The
            "Tarif / jour" tile that used to close this card was removed here
            (docs/maintenance_pricing_admin_performance_audit.md Section 2) —
            dailyRateInCents itself is preserved internally/Admin-managed, just
            no longer shown to Coffee Owners. */}
      </div>
    </div>
  );
}

// ── Availability modal (Parts 12-14) — visually inspired by the existing
// Shop Store → Opening Hours component (client/src/pages/cafe/store-detail-page.tsx's
// InfoModal), reusing the exact same day list (WEEKLY_DAY_DEFS, imported from
// the Maintenance account's own Disponibilités editor — no separate day/label
// list) and OpeningHoursMap data shape. No Shop business logic copied. ──────
function MaintenanceAvailabilityModal({
  open, onClose, agentName, weeklyHours, isDark,
}: {
  open: boolean;
  onClose: () => void;
  agentName: string;
  weeklyHours: OpeningHoursMap | null;
  isDark: boolean;
}) {
  const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const todayKey = WEEKLY_DAY_DEFS[todayIndex].key;

  const dk = isDark;
  const bg = dk ? "bg-gray-900" : "bg-white";
  const textPrimary = dk ? "text-white" : "text-gray-900";
  const textMuted = dk ? "text-gray-400" : "text-gray-500";
  const rowBg = dk ? "bg-gray-800 border-gray-700/60" : "bg-gray-50 border-gray-100";
  const rowToday = dk ? "bg-amber-500/15 border-amber-500/30" : "bg-amber-50 border-amber-200";
  const timeColor = dk ? "text-gray-300" : "text-gray-700";
  const closedColor = dk ? "text-red-400" : "text-red-500";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Disponibilité — {agentName}</DialogTitle></VisuallyHidden>
        <div className={`flex flex-col max-h-[88vh] overflow-hidden transition-colors duration-200 ${bg}`}>
          <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={onClose} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}>
                <X className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight leading-tight ${textPrimary}`}>{agentName}</span>
                <span className={`text-[11px] font-medium ${textMuted}`}>Disponibilité</span>
              </div>
              <div className="w-8 h-8" />
            </div>
            <div className={`h-px w-full ${dk ? "bg-gray-800" : "bg-gray-100"}`} />
          </div>
          <div
            className="flex-1 min-h-0 overflow-y-auto px-5 pb-6
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-gray-700
              hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {weeklyHours ? (
              <div className="space-y-2 pb-2">
                {WEEKLY_DAY_DEFS.map(({ key, label }) => {
                  const day = weeklyHours[key];
                  const isToday = key === todayKey;
                  return (
                    <div key={key} className={`flex items-center justify-between border rounded-2xl px-4 py-3 transition-colors ${isToday ? rowToday : rowBg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-medium ${isToday ? (dk ? "text-amber-400" : "text-amber-600") : textPrimary}`}>{label}</span>
                        {isToday && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${dk ? "bg-amber-500/30 text-amber-300" : "bg-amber-100 text-amber-700"}`}>Aujourd'hui</span>
                        )}
                      </div>
                      {day?.closed ? (
                        <span className={`text-[12px] font-semibold ${closedColor}`}>Fermé</span>
                      ) : day ? (
                        <span className={`text-[13px] font-medium tabular-nums ${isToday ? (dk ? "text-amber-300" : "text-amber-700") : timeColor}`}>{day.open}&thinsp;–&thinsp;{day.close}</span>
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
                <p className={`text-sm font-medium ${textPrimary}`}>Aucun horaire configuré</p>
                <p className="text-xs mt-1 opacity-50">Ce professionnel n'a pas encore défini ses disponibilités.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AgentDetailModal({
  agent, open, onClose, onContact, isDark, readOnly = false,
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
}) {
  const t = useTheme(isDark);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
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
  const eligibleReservations = reservations.filter((reservation) =>
    reservation.maintenanceUserId === agent?.userId && reservation.status === "COMPLETED",
  );
  const reviewedReservationIds = new Set((reviewsQuery.data ?? []).map((review) => review.reservationId).filter(Boolean));
  const reviewReservation = eligibleReservations.find((reservation) => !reviewedReservationIds.has(reservation.id));
  const submitReview = useMutation({
    mutationFn: () => {
      if (!agent || !reviewReservation || readOnly) throw new Error("Aucune intervention terminée à évaluer");
      return apiRequest("POST", "/api/maintenance/reviews", {
        maintenanceUserId: agent.userId,
        reservationId: reviewReservation.id,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reviews", agent?.userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/profiles"] });
      setReviewComment("");
      setReviewRating(5);
    },
  });
  useEffect(() => {
    setReviewComment("");
    setReviewRating(5);
  }, [agent?.userId]);
  const faved = useFavorites((s) => agent ? !!s.maintenance[agent.userId] : false);
  const toggleMaintenance = useFavorites((s) => s.toggleMaintenance);
  // Signaler (Part 11) now opens its own separate Dialog instead of an inline
  // collapsible panel inside the main modal — same mutation/validation/
  // success-error behavior, just presented in its own modal.
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  // Star (Phase 7) — new icon alongside the existing Signaler/Disponibilité
  // pair; opens its own dedicated modal instead of expanding inline, same
  // pattern as Signaler/Disponibilité already do. (The former Flash icon here
  // was replaced by MaintenanceJobTargetButton — see the icon row below.)
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const { toast } = useToast();
  const submitReport = useMutation({
    mutationFn: () => {
      if (readOnly) throw new Error("Aperçu en lecture seule");
      return apiRequest("POST", `/api/maintenance/${agent!.userId}/report`, { reason: reportReason.trim() });
    },
    onSuccess: () => { toast({ title: "Signalement envoyé", description: "L'équipe Admin va l'examiner." }); setReportModalOpen(false); setReportReason(""); },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });
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
      <DialogContent className={`sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl border-0 shadow-2xl [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${isDark ? "bg-gray-900" : "bg-white"}`}>
        <VisuallyHidden><DialogTitle>Profil Technicien Maintenance</DialogTitle></VisuallyHidden>
        <div className="flex flex-col">
          {/* Large real profile picture (Part 7) — same treatment as the
              Barista Details Modal reference: full-width banner instead of a
              small avatar, favorite/report/close overlaid on the image. */}
          <div className={`relative w-full h-56 sm:h-72 shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
            {/* Cover (Part 4) — banner background when set, logo demoted to a small
                corner badge; falls back to the existing full-banner avatar otherwise. */}
            {agent.coverImageUrl ? (
              <img src={agent.coverImageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={getAvatarUrl(agent as any)} alt={agent.name} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-orange-500 to-amber-600">
                  <span className="text-white font-bold text-6xl">{agent.initials}</span>
                </AvatarFallback>
              </Avatar>
            )}
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
              <button onClick={() => { if (!readOnly) toggleMaintenance({ id: agent.userId, name: agent.name, initials: agent.initials, specialty: agent.specialty, categories: agent.categories, skills: agent.skills, location: agent.location, rating: Number(ratingValue(agent)) || 0, available: agent.available, profileImageUrl: agent.profileImageUrl }); }} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Heart className={`w-4 h-4 ${faved ? "fill-rose-500 text-rose-500" : "text-white"}`} /></button>
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
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{agent.name}</h2>
                <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${TYPE_COLORS[agent.profileType] ?? "bg-gray-100 text-gray-700"}`}>{agent.profileType}</Badge>
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

            {/* Section headings unified to the same text-xs/muted style the
                Barista modal uses (Part 3/5/8-10) — content stays Maintenance's
                own real data throughout. */}
            <div><h3 className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>À propos</h3><p className={`text-sm leading-relaxed ${t.textMuted}`}>{agent.description || "Aucune description disponible."}</p></div>
            {/* Categories + skills deduplicated into one set — the same union
                already used by the booking form's Select below, so a taxonomy
                name stored in both arrays no longer renders as two identical
                chips (Part 8). Chips now carry a real dark-mode variant instead
                of the previous hardcoded light-only orange-50/amber-50 colors,
                which is exactly the "no mixed light/dark" bug this task flags. */}
            <div><h3 className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Catégories & Compétences</h3><div className="flex flex-wrap gap-1.5">{Array.from(new Set([...agent.categories, ...agent.skills])).map((item) => <span key={item} className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${isDark ? "bg-orange-900/30 text-orange-300 border-orange-800" : "bg-orange-50 text-orange-700 border-orange-200"}`}>{item}</span>)}</div></div>
             {agent.certifications.length > 0 && <div><h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Award className="w-3.5 h-3.5 text-amber-500" /> Certifications</h3><div className="flex flex-wrap gap-1.5">{agent.certifications.map((item) => <span key={item} className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${isDark ? "bg-amber-900/30 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{item}</span>)}</div></div>}
             {/* Old "Disponibilité / Horaires" section removed from the main
                 body (Part 8) — now reachable via the Disponibilité icon on
                 the profile picture, which opens MaintenanceAvailabilityModal. */}
             <div className={`${t.mutedBg} rounded-xl p-3`}><h3 className={`text-xs font-semibold mb-2 ${t.textMuted}`}>Zone d'intervention</h3><div className={`flex items-center gap-2 text-sm ${t.textMuted}`}><MapPin className="w-3.5 h-3.5 text-orange-500" />{agent.coverageArea || agent.location || "—"}</div></div>
             {agent.portfolioImages.length > 0 && <div><h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><ImageIcon className="w-3.5 h-3.5" /> Portfolio</h3><div className="grid grid-cols-4 gap-2">{agent.portfolioImages.map((image, i) => <button key={i} type="button" onClick={() => { setAlbumIndex(i); setAlbumOpen(true); }} className={`aspect-square rounded-lg overflow-hidden border ${t.border} ${isDark ? "bg-gray-800" : "bg-gray-100"}`} data-testid={`button-portfolio-thumb-${i}`}><img src={image} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover" /></button>)}</div></div>}
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

    {/* Signaler — same modal chrome as the Disponibilité modal below
        (rounded-[2rem] container, circular close button), close button on the
        right (docs/coffee_owner_favorites_reporting_nested_modal_audit.md
        Section 9). Content/functionality unchanged. */}
    <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
      <DialogContent className={`sm:max-w-md p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden ${isDark ? "bg-gray-900" : "bg-white"}`}>
        <VisuallyHidden><DialogTitle>Signaler {agent.name}</DialogTitle></VisuallyHidden>
        <div className="px-5 pt-5 pb-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8" />
            <span className={`text-[13px] font-semibold tracking-tight leading-tight ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler {agent.name}</span>
            <button onClick={() => { setReportModalOpen(false); setReportReason(""); }} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <Textarea placeholder="Décrivez le problème…" rows={3} value={reportReason} onChange={(e) => setReportReason(e.target.value)} className={t.inputBg} data-testid="input-maintenance-report-reason" />
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" className={t.textPrimary} onClick={() => { setReportModalOpen(false); setReportReason(""); }}>Annuler</Button>
            <Button size="sm" variant="destructive" onClick={() => submitReport.mutate()} disabled={!reportReason.trim() || submitReport.isPending} data-testid="button-submit-maintenance-report">
              {submitReport.isPending ? "Envoi…" : "Envoyer le signalement"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

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
    <ReviewsModal
      open={reviewsModalOpen}
      onClose={() => setReviewsModalOpen(false)}
      professionalName={agent.name}
      rating={Number(ratingValue(agent)) || 0}
      reviewCount={agent.reviewCount}
      reviews={reviewsQuery.data ?? []}
      isDark={isDark}
      reviewForm={!readOnly && reviewReservation ? (
        <div className={`${t.mutedBg} rounded-xl p-3 space-y-2.5`}>
          <h3 className={`font-semibold text-sm ${t.textPrimary}`}>Évaluer votre intervention</h3>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" onClick={() => setReviewRating(value)} aria-label={`${value} étoiles`}>
                <Star className={`w-5 h-5 ${value <= reviewRating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
              </button>
            ))}
          </div>
          <Textarea
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
            placeholder="Partagez votre expérience (facultatif)"
            rows={2}
            className={t.inputBg}
          />
          <Button
            size="sm"
            onClick={() => submitReview.mutate()}
            disabled={submitReview.isPending}
            className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl"
            data-testid="button-submit-maintenance-review"
          >
            {submitReview.isPending ? "Envoi…" : "Publier l'avis"}
          </Button>
        </div>
      ) : undefined}
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
  const [search, setSearch] = useState("");
  // Mobile collapsible search (mobile_filters_darkmode_audit.md) — presentation only.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterAvailability, setFilterAvailability] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<MaintenanceMarketplaceCard | null>(null);
  const [fastSearchOpen, setFastSearchOpen] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [jobManagementOpen, setJobManagementOpen] = useState(false);
  const [jobManagementJobId, setJobManagementJobId] = useState<number | null>(null);
  const { data: profiles = [], isLoading: profilesLoading } = useQuery<MaintenanceMarketplaceCard[]>({ queryKey: ["/api/maintenance/profiles"] });
  const { data: categories = [] } = useQuery<string[]>({ queryKey: ["/api/maintenance/categories"] });
  const { data: taxonomy } = useQuery<{ competencies: { name: string; icon: string | null }[]; zones: any[] }>({ queryKey: ["/api/maintenance/taxonomy"] });
  const categoryIcons = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of taxonomy?.competencies ?? []) if (c.icon) map.set(c.name, c.icon);
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
  const allLocations = useMemo(() => Array.from(new Set(profiles.map((item) => item.location).filter(Boolean))).sort(), [profiles]);
  const filtered = useMemo(() => {
    let list = profiles;
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter((item) => [item.name, item.jobTitle, item.description, item.location, ...item.skills, ...item.categories].join(" ").toLowerCase().includes(q)); }
    if (filterCategory) list = list.filter((item) => item.categories.includes(filterCategory));
    if (filterType) list = list.filter((item) => item.profileType === filterType);
    if (filterAvailability === "available") list = list.filter((item) => item.available);
    if (filterAvailability === "unavailable") list = list.filter((item) => !item.available);
    if (filterLocation) list = list.filter((item) => item.location === filterLocation);
    return list;
  }, [profiles, search, filterCategory, filterType, filterAvailability, filterLocation]);
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
  const hasFilters = !!(search || filterCategory || filterType || filterAvailability || filterLocation);
  const openDetail = (agent: MaintenanceMarketplaceCard) => { setSelectedAgent(agent); setDetailOpen(true); };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      {/* Fast Search (docs/maintenance_print_nested_modal_audit.md) — rendered
          FIRST so that when "Info/Détails" opens AgentDetailModal below, the
          detail dialog (mounted later in the DOM) stacks visually above this
          one instead of the other way around, and Fast Search simply stays
          open underneath rather than being closed when Details opens. */}
      <MaintenanceFastSearch open={fastSearchOpen} onClose={() => setFastSearchOpen(false)} providers={profiles} onOpenDetail={(agent) => openDetail(agent)} />
      <section className="relative pt-5 pb-12 px-5 overflow-hidden">
        {t.dk ? <><div className="absolute inset-0 bg-gray-900" /><div className="absolute inset-0 bg-gradient-to-br from-orange-900/25 via-gray-900 to-gray-900" /><div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" /></> : <><div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600" /><div className="absolute inset-0 bg-black/10" /></>}
        {/* The global navbar theme control is the single Dark/Light toggle
            now, so the duplicated hero one is gone; Fast Search/Report stay
            Admin-toggleable per service (see /api/hero-actions). */}
        <div className="relative flex justify-end items-center gap-2 mb-9">
          {accessLevel === "approved" && heroActions.MAINTENANCE.reportEnabled && (
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
        <div className="relative max-w-3xl mx-auto text-center">
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-5 backdrop-blur-sm ${t.dk ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}><Wrench className={`w-8 h-8 ${t.dk ? "text-amber-400" : "text-white"}`} /></div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">BigBoss <span className={t.dk ? "text-amber-400" : "text-amber-200"}>MAINTENANCE</span></h1>
          <p className={`text-base mb-4 max-w-xl mx-auto ${t.dk ? "text-gray-400" : "text-orange-100"}`}>Trouvez des techniciens certifiés pour la maintenance et réparation de vos équipements de café</p>
          <div className={`flex items-center justify-center gap-6 flex-wrap text-sm ${t.dk ? "text-gray-400" : "text-orange-100"}`}><span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{profiles.filter((item) => item.available).length} techniciens disponibles</span><span className="flex items-center gap-1.5"><Shield className="w-4 h-4" />{profiles.filter((item) => item.certifications.length > 0).length} certifiés</span><span className="flex items-center gap-1.5"><Zap className="w-4 h-4" />Intervention rapide</span></div>
        </div>
      </section>
      {comingSoon ? <div className="max-w-3xl mx-auto px-4 py-20 text-center"><Clock className="w-8 h-8 text-orange-600 mx-auto mb-5" /><h2 className={`text-xl font-bold mb-2 ${t.textPrimary}`}>Bientôt disponible</h2><p className={`text-sm ${t.textMuted}`}>Ce service est en cours de préparation. Revenez bientôt pour le découvrir.</p></div> : (
        <>
          <div className="sticky top-14 z-30">
            <div className={`border-b ${t.stripBg}`}>
              <div className="max-w-7xl mx-auto px-4">
                <div className="flex gap-1.5 overflow-x-auto py-3" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                  <div className={`flex gap-1 rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                    <button onClick={() => setFilterCategory("")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 transition-all text-[11px] font-semibold ${!filterCategory ? t.switcherActive : t.switcherInactive}`} data-testid="button-maintenance-cat-all">
                      <span className="text-base leading-none">🧰</span><span>Tous</span>
                    </button>
                  </div>
                  {categories.map((category) => (
                    <div key={category} className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                      <button onClick={() => setFilterCategory(filterCategory === category ? "" : category)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${filterCategory === category ? t.switcherActive : t.switcherInactive}`} data-testid={`button-maintenance-cat-${category}`}>
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
                <Select value={filterType || "__all__"} onValueChange={(value) => setFilterType(value === "__all__" ? "" : value)}><SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`}><SelectValue placeholder="Type" /></SelectTrigger><SelectContent className={t.selectContent}><SelectItem value="__all__">Tous types</SelectItem><SelectItem value="Freelance">Freelance</SelectItem><SelectItem value="Company">Entreprise</SelectItem><SelectItem value="Agency">Agence</SelectItem></SelectContent></Select>
                <Select value={filterAvailability || "__all__"} onValueChange={(value) => setFilterAvailability(value === "__all__" ? "" : value)}><SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] shrink-0 ${t.selectTrigger}`}><SelectValue placeholder="Disponibilité" /></SelectTrigger><SelectContent className={t.selectContent}><SelectItem value="__all__">Toutes disponibilités</SelectItem><SelectItem value="available">Disponible</SelectItem><SelectItem value="unavailable">Indisponible</SelectItem></SelectContent></Select>
                <Select value={filterLocation || "__all__"} onValueChange={(value) => setFilterLocation(value === "__all__" ? "" : value)}><SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] shrink-0 ${t.selectTrigger}`}><SelectValue placeholder="Ville" /></SelectTrigger><SelectContent className={t.selectContent}><SelectItem value="__all__">Toutes villes</SelectItem>{allLocations.map((location) => <SelectItem key={location} value={location}>{location}</SelectItem>)}</SelectContent></Select>
                {hasFilters && <button onClick={() => { setSearch(""); setFilterCategory(""); setFilterType(""); setFilterAvailability(""); setFilterLocation(""); }} className={`flex items-center gap-1 text-xs transition-colors ml-1 shrink-0 whitespace-nowrap ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}><RotateCcw className="w-3 h-3" />Reset</button>}
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 py-8">
             {filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-16 gap-3 text-center"><Wrench className={`w-12 h-12 ${t.textSubtle}`} /><p className={`font-semibold ${t.textPrimary}`}>Aucun technicien trouvé</p><p className={`text-sm ${t.textMuted}`}>{profiles.length === 0 ? "Aucun profil Maintenance publié pour le moment." : "Essayez d'ajuster vos filtres."}</p></div> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{filtered.map((agent) => <AgentCard key={agent.userId} agent={agent} onOpenDetail={openDetail} onContact={contact} isDark={isDark} />)}</div>}
          </div>
           <AgentDetailModal agent={selectedAgent} open={detailOpen} onClose={() => setDetailOpen(false)} onContact={contact} isDark={isDark} />
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