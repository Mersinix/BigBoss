import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useThemeStore } from "@/store/theme-store";
import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useFavorites } from "@/hooks/use-favorites";
import { useHeroActionSettings } from "@/hooks/use-hero-actions";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { MaintenanceFastSearch } from "@/components/maintenance/maintenance-fast-search";
import { MaintenanceBlacklistModal } from "@/components/maintenance/maintenance-blacklist-modal";
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
  RotateCcw, X, Heart, Clock, Calendar, Shield, Zap, Award, Users,
  Building2, User, Send, Flag, Navigation, Ban, Image as ImageIcon,
} from "lucide-react";

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
  const fmt = useFormatCurrency();
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
          <span className={`flex items-center gap-0.5 text-[11px] ${t.textSubtle}`}><MapPin className="w-2.5 h-2.5" />{agent.location || "—"}</span>
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
            hierarchy (reference only, Maintenance fields kept below). */}
        <div className={`mt-auto pt-2 border-t ${t.border}`}>
          <p className={`text-[10px] ${t.textSubtle}`}>Tarif / jour</p>
          <p className="font-bold text-sm text-orange-600">{fmt(agent.dailyRateInCents)}</p>
        </div>
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
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${dk ? "bg-amber-500/30 text-amber-300" : "bg-amber-100 text-amber-700"}`}>Today</span>
                        )}
                      </div>
                      {day?.closed ? (
                        <span className={`text-[12px] font-semibold ${closedColor}`}>Closed</span>
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
  agent, open, onClose, onContact, onReserve, isDark, readOnly = false,
}: {
  agent: MaintenanceMarketplaceCard | null;
  open: boolean;
  onClose: () => void;
  onContact: (agent: MaintenanceMarketplaceCard) => void;
  onReserve: (agent: MaintenanceMarketplaceCard, data: MaintenanceReservationData) => void;
  isDark: boolean;
  // Used by the Maintenance agent's own "preview my profile" (Eye icon on
  // Business → Profil): renders the exact same modal a Coffee Owner sees, but
  // Favorite/Report/Contacter/Réserver/Avis become inert (no self-favorite,
  // self-message, self-reservation, self-report, or self-review) — only
  // Disponibilité stays functional, since it just displays the agent's own
  // real saved availability.
  readOnly?: boolean;
}) {
  const fmt = useFormatCurrency();
  const t = useTheme(isDark);
  const queryClient = useQueryClient();
  const [booking, setBooking] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const { user } = useAuth();
  const [location, setLocation] = useState(user?.locationAddress ?? "");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(agent?.categories?.[0] ?? "");
  const [urgency, setUrgency] = useState("NORMAL");
  const [contactPhone, setContactPhone] = useState("");
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
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
    if (!booking) return;
    setLocation(user?.locationAddress ?? "");
    setContactPhone(user?.phone ?? "");
    setCategory(agent?.categories?.[0] ?? agent?.skills?.[0] ?? "");
  }, [booking, user?.locationAddress, user?.phone, agent?.userId]);
  useEffect(() => {
    setBooking(false);
    setDate("");
    setTime("");
    setDescription("");
    setLocation(user?.locationAddress ?? "");
    setContactPhone(user?.phone ?? "");
    setCategory(agent?.categories?.[0] ?? agent?.skills?.[0] ?? "");
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
            <Avatar className="w-full h-full rounded-none">
              <AvatarImage src={getAvatarUrl(agent as any)} alt={agent.name} className="object-cover" />
              <AvatarFallback className="rounded-none bg-gradient-to-br from-orange-500 to-amber-600">
                <span className="text-white font-bold text-6xl">{agent.initials}</span>
              </AvatarFallback>
            </Avatar>
            {/* Top right — Close + Favorite, unchanged position (Part 9/20) */}
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={() => { if (!readOnly) toggleMaintenance({ id: agent.userId, name: agent.name, initials: agent.initials, specialty: agent.specialty, categories: agent.categories, skills: agent.skills, location: agent.location, rating: Number(ratingValue(agent)) || 0, available: agent.available, profileImageUrl: agent.profileImageUrl }); }} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Heart className={`w-4 h-4 ${faved ? "fill-rose-500 text-rose-500" : "text-white"}`} /></button>
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
            </div>
            {/* Bottom right — Signaler (moved here) + new Disponibilité (Part 9-10) */}
            <div className="absolute bottom-3 right-3 flex gap-2">
              <button onClick={() => { if (!readOnly) setReportModalOpen(true); }} title="Signaler" data-testid="button-open-maintenance-report" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Flag className="w-4 h-4 text-white" /></button>
              <button onClick={() => setAvailabilityModalOpen(true)} title="Disponibilité" data-testid="button-open-maintenance-availability" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Clock className="w-4 h-4 text-white" /></button>
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

            {/* Tarif journalier + Expérience/Réponse — same 2-column boxed-tile
                treatment as the Barista modal's Tarif/Expérience grid (Part 6),
                adapted to Maintenance's own real fields (response time has no
                Barista equivalent, kept as a third tile). */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className={`p-3 rounded-xl ${t.mutedBg}`}>
                <p className={`text-[11px] ${t.textSubtle}`}>Tarif / jour</p>
                <p className="font-bold text-orange-600">{fmt(agent.dailyRateInCents)}</p>
              </div>
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
             {agent.portfolioImages.length > 0 && <div><h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><ImageIcon className="w-3.5 h-3.5" /> Portfolio</h3><div className="grid grid-cols-4 gap-2">{agent.portfolioImages.map((image, i) => <div key={i} className={`aspect-square rounded-lg overflow-hidden border ${t.border} ${isDark ? "bg-gray-800" : "bg-gray-100"}`}><img src={image} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover" /></div>)}</div></div>}
             <div>
               <h3 className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Avis ({reviewsQuery.data?.length ?? 0})</h3>
               {(reviewsQuery.data ?? []).length === 0 ? <p className={`text-xs ${t.textMuted}`}>Aucun avis pour le moment.</p> : <div className="space-y-2 max-h-40 overflow-y-auto">{reviewsQuery.data!.slice(0, 4).map((review) => <div key={review.id} className={`p-2.5 rounded-lg text-sm ${t.mutedBg}`}><div className="flex items-center justify-between"><span className={`font-medium text-xs ${t.textPrimary}`}>{review.cafeOwnerName || review.cafeName}</span><span className="flex items-center gap-0.5 text-amber-500 text-xs"><Star className="w-3 h-3 fill-amber-400" /> {review.rating}</span></div>{review.comment && <p className={`text-xs mt-1 ${t.textMuted}`}>{review.comment}</p>}</div>)}</div>}
             </div>
              {reviewReservation && (
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
                  >
                    {submitReview.isPending ? "Envoi…" : "Publier l'avis"}
                  </Button>
                </div>
              )}
            {!booking ? (
              // Tarif already shown once above (Part 8) — action bar keeps just
              // the two primary actions, matching the Barista modal's own
              // actions-row convention.
               <div className={`border-t ${t.border} pt-4 flex items-center justify-end gap-2`}>
                 <Button variant="outline" onClick={() => { if (!readOnly) onContact(agent); }} className={`rounded-xl px-4 ${isDark ? "border-gray-700 text-gray-300" : "border-gray-200 text-gray-600"}`}><MessageCircle className="w-4 h-4 mr-1.5" />Contacter</Button>
                 <Button onClick={() => { if (!readOnly) setBooking(true); }} disabled={!agent.available} className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl px-5"><Calendar className="w-4 h-4 mr-1.5" />{agent.available ? "Réserver" : "Indisponible"}</Button>
              </div>
            ) : (
               <div className={`border-t ${t.border} pt-4 space-y-3`}>
                 <h3 className={`font-semibold text-sm ${t.textPrimary}`}>Demander une intervention</h3>
                 <div className="grid grid-cols-2 gap-3"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
                 <div className="grid grid-cols-2 gap-3">
                   <Select value={category} onValueChange={setCategory}><SelectTrigger className={t.inputBg}><SelectValue placeholder="Compétence" /></SelectTrigger><SelectContent className={t.selectContent}>{Array.from(new Set([...agent.categories, ...agent.skills])).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
                   <Select value={urgency} onValueChange={setUrgency}><SelectTrigger className={t.inputBg}><SelectValue placeholder="Urgence" /></SelectTrigger><SelectContent className={t.selectContent}><SelectItem value="LOW">Faible</SelectItem><SelectItem value="NORMAL">Normale</SelectItem><SelectItem value="HIGH">Élevée</SelectItem><SelectItem value="URGENT">Urgente</SelectItem></SelectContent></Select>
                 </div>
                 <div className="flex gap-2"><Input className="flex-1" placeholder="Lieu d'intervention" value={location} onChange={(e) => setLocation(e.target.value)} /><Button type="button" variant="outline" onClick={() => setLocationPickerOpen(true)}><MapPin className="w-4 h-4" /></Button></div>
                 <Input placeholder="Téléphone pour cette intervention" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                <Input placeholder="Décrivez votre besoin" value={description} onChange={(e) => setDescription(e.target.value)} />
                 <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setBooking(false)}>Annuler</Button><Button disabled={!date || !category} onClick={() => onReserve(agent, { date, time, location, description, category, urgency, contactPhone })} className="bg-orange-600 hover:bg-orange-700 text-white"><Send className="w-4 h-4 mr-1.5" />Envoyer la demande</Button></div>
                 <LocationPickerModal open={locationPickerOpen} onClose={() => setLocationPickerOpen(false)} mode="delivery" title="Choisir le lieu de l'intervention" initialAddress={location} onConfirm={(picked: PickedLocation) => { setLocation(picked.address); setLocationPickerOpen(false); }} />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Signaler — own modal (Part 11), same mutation/validation/success-error
        behavior as before, just no longer an inline panel. */}
    <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
      {/* Explicit theme bg — this modal previously had none and relied on the
          inert bg-background default, which is exactly why it stayed white in
          Dark Mode (same fix as the Barista report modal reference). */}
      <DialogContent className={`sm:max-w-md ${isDark ? "bg-gray-900" : "bg-white"}`}>
        <VisuallyHidden><DialogTitle>Signaler {agent.name}</DialogTitle></VisuallyHidden>
        <div className="space-y-2">
          <p className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler {agent.name}</p>
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
    </>
  );
}

export type MaintenanceReservationData = {
  date: string;
  time: string;
  location: string;
  description: string;
  category: string;
  urgency: string;
  contactPhone: string;
};

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
  const [filterCategory, setFilterCategory] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterAvailability, setFilterAvailability] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<MaintenanceMarketplaceCard | null>(null);
  const [fastSearchOpen, setFastSearchOpen] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const { data: profiles = [], isLoading: profilesLoading } = useQuery<MaintenanceMarketplaceCard[]>({ queryKey: ["/api/maintenance/profiles"] });
  const { data: categories = [] } = useQuery<string[]>({ queryKey: ["/api/maintenance/categories"] });
  const { data: taxonomy } = useQuery<{ competencies: { name: string; icon: string | null }[]; zones: any[] }>({ queryKey: ["/api/maintenance/taxonomy"] });
  const categoryIcons = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of taxonomy?.competencies ?? []) if (c.icon) map.set(c.name, c.icon);
    return map;
  }, [taxonomy]);
  const { data: favoriteIds = [] } = useQuery<number[]>({ queryKey: ["/api/maintenance-favorites"], enabled: !!user && accessLevel === "approved" });
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
  const reserve = useMutation({
    mutationFn: ({ agent, data }: { agent: MaintenanceMarketplaceCard; data: MaintenanceReservationData }) =>
      apiRequest("POST", "/api/maintenance/reservations", {
        maintenanceUserId: agent.userId,
        service: agent.jobTitle,
        ...data,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] }); setDetailOpen(false); toast({ title: "Demande envoyée", description: "Le technicien pourra maintenant la confirmer." }); },
    onError: (error: Error) => toast({ title: "Impossible d'envoyer la demande", description: error.message, variant: "destructive" }),
  });
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
          <div className={`border-b sticky top-0 z-20 ${t.cardBg}`}><div className="max-w-7xl mx-auto px-4 py-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}><button onClick={() => setFilterCategory("")} className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 border ${!filterCategory ? "bg-orange-600 text-white border-orange-600" : `${t.mutedBg} ${t.textMuted} ${t.border}`}`}>Tous</button>{categories.map((category) => <button key={category} onClick={() => setFilterCategory(filterCategory === category ? "" : category)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 border ${filterCategory === category ? "bg-orange-600 text-white border-orange-600" : `${t.mutedBg} ${t.textMuted} ${t.border}`}`}><span>{categoryIcons.get(category) ?? DEFAULT_CATEGORY_ICON}</span>{category}</button>)}</div></div>
           <div className="max-w-7xl mx-auto px-4 py-8">
             <div className={`border rounded-2xl p-3 mb-5 shadow-sm ${t.cardBg}`}><div className="flex items-center gap-2 flex-wrap"><SlidersHorizontal className={`w-3.5 h-3.5 ${t.textSubtle}`} /><div className="relative flex-1 min-w-[180px] max-w-xs"><Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${t.textSubtle}`} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, compétence, service..." className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`} /></div><Select value={filterType || "__all__"} onValueChange={(value) => setFilterType(value === "__all__" ? "" : value)}><SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] ${t.inputBg}`}><SelectValue placeholder="Type" /></SelectTrigger><SelectContent className={t.selectContent}><SelectItem value="__all__">Tous types</SelectItem><SelectItem value="Freelance">Freelance</SelectItem><SelectItem value="Company">Entreprise</SelectItem><SelectItem value="Agency">Agence</SelectItem></SelectContent></Select><Select value={filterAvailability || "__all__"} onValueChange={(value) => setFilterAvailability(value === "__all__" ? "" : value)}><SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] ${t.inputBg}`}><SelectValue placeholder="Disponibilité" /></SelectTrigger><SelectContent className={t.selectContent}><SelectItem value="__all__">Toutes disponibilités</SelectItem><SelectItem value="available">Disponible</SelectItem><SelectItem value="unavailable">Indisponible</SelectItem></SelectContent></Select><Select value={filterLocation || "__all__"} onValueChange={(value) => setFilterLocation(value === "__all__" ? "" : value)}><SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] ${t.inputBg}`}><SelectValue placeholder="Ville" /></SelectTrigger><SelectContent className={t.selectContent}><SelectItem value="__all__">Toutes villes</SelectItem>{allLocations.map((location) => <SelectItem key={location} value={location}>{location}</SelectItem>)}</SelectContent></Select>{hasFilters && <button onClick={() => { setSearch(""); setFilterCategory(""); setFilterType(""); setFilterAvailability(""); setFilterLocation(""); }} className="flex items-center gap-1 text-xs text-destructive"><RotateCcw className="w-3 h-3" />Reset</button>}</div></div>
             {filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-16 gap-3 text-center"><Wrench className={`w-12 h-12 ${t.textSubtle}`} /><p className={`font-semibold ${t.textPrimary}`}>Aucun technicien trouvé</p><p className={`text-sm ${t.textMuted}`}>{profiles.length === 0 ? "Aucun profil Maintenance publié pour le moment." : "Essayez d'ajuster vos filtres."}</p></div> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{filtered.map((agent) => <AgentCard key={agent.userId} agent={agent} onOpenDetail={openDetail} onContact={contact} isDark={isDark} />)}</div>}
          </div>
           <AgentDetailModal agent={selectedAgent} open={detailOpen} onClose={() => setDetailOpen(false)} onContact={contact} onReserve={(agent, data) => reserve.mutate({ agent, data })} isDark={isDark} />
        </>
      )}
      {/* Fast Search / Blacklist (Parts 20-22) — same `profiles` list, own
          Maintenance-only components (no Barista data reused). */}
      <MaintenanceFastSearch open={fastSearchOpen} onClose={() => setFastSearchOpen(false)} providers={profiles} onOpenDetail={(agent) => { setFastSearchOpen(false); openDetail(agent); }} />
      <MaintenanceBlacklistModal open={blacklistOpen} onClose={() => setBlacklistOpen(false)} isDark={isDark} />
    </div>
  );
}