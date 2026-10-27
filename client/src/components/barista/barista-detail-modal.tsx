import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useFavorites } from "@/hooks/use-favorites";
import { useThemeStore } from "@/store/theme-store";
import {
  useBaristaProfileDetail,
  useBaristaReviews,
  useBaristaMissions,
  useCreateBaristaReview,
  useReportBarista,
  startBaristaConversation,
  type BaristaMarketplaceCard,
} from "@/hooks/use-barista-marketplace";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { useFallbackImage } from "@/hooks/use-fallback-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star, MapPin, Clock, Award, Image as ImageIcon, Briefcase, MessageCircle,
  Flag, Heart, Navigation, X,
} from "lucide-react";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { AvailabilityModal } from "@/components/shared/availability-modal";
import { MarketingPortfolioAlbumModal } from "@/components/marketing/marketing-portfolio-album-modal";
import { ReviewModal } from "@/components/review-modal";
import { BaristaJobTargetButton } from "@/components/barista/barista-job-target-button";
import { ItemNavButtons } from "@/components/shared/item-nav-buttons";
import type { OpeningHoursMap } from "@shared/schema";

const LEVEL_LABELS: Record<string, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };

// This app's dark mode is NOT Tailwind's `dark:` class strategy — nothing in the
// Coffee Owner app ever adds a `.dark` class to the DOM (verified: useThemeStore,
// client/src/store/theme-store.ts, is a plain boolean with no DOM side effect).
// Every already-correctly-dark-mode-aware surface in this codebase (e.g.
// barista-page.tsx's own useTheme(isDark) helper) instead branches literal
// Tailwind classes off the `isDark` boolean directly. `dark:` variants and the
// bg-background/text-foreground/bg-muted/border-border CSS-var tokens are
// therefore inert here — that's why these modals stayed white. Reusing the same
// ternary-class mechanism that already works everywhere else in the Barista UI.
function levelColors(isDark: boolean): Record<string, string> {
  return isDark
    ? { BEGINNER: "bg-green-900/50 text-green-300", ADVANCED: "bg-blue-900/50 text-blue-300", EXPERT: "bg-purple-900/50 text-purple-300" }
    : { BEGINNER: "bg-green-100 text-green-700", ADVANCED: "bg-blue-100 text-blue-700", EXPERT: "bg-purple-100 text-purple-700" };
}

// Availability modal — now the shared Disponibilité modal (reference:
// client/src/components/marketing/marketing-detail-modal.tsx's
// MarketingAvailabilityModal, extracted to client/src/components/shared/
// availability-modal.tsx), kept under this name so the call site below
// needs no changes.
function BaristaAvailabilityModal({
  open, onClose, baristaName, weeklyHours, isDark,
}: {
  open: boolean;
  onClose: () => void;
  baristaName: string;
  weeklyHours: OpeningHoursMap | null;
  isDark: boolean;
}) {
  return (
    <AvailabilityModal
      open={open}
      onClose={onClose}
      targetName={baristaName}
      weeklyHours={weeklyHours}
      isDark={isDark}
      noScheduleHint="Ce Barista n'a pas encore défini ses disponibilités."
    />
  );
}

// Comprehensive Coffee-Owner-facing Barista detail modal (Parts 26-29) — reuses
// the same /api/barista/profile/:userId route as the Barista's own self-view
// (sanitized to the public `card` for Coffee Owner viewers server-side), the
// existing recruitment/messaging/review/report systems — no separate data copy.
export function BaristaDetailModal({
  baristaUserId,
  open,
  onClose,
  onRecruit,
  readOnly = false,
  // Optional — Previous/Next Barista navigation (task: "Add Consistent
  // Previous/Next Navigation to All Coffee Owner Service Detail Modals").
  // The owning page computes its own filtered barista list and the
  // current position within it; this modal only renders the buttons and
  // calls the provided callbacks. Omitted by every caller that doesn't
  // provide a navigable list (e.g. the Barista's own "preview my profile"),
  // so the buttons simply don't render there.
  hasItemNav = false,
  canNavPrev = false,
  canNavNext = false,
  onNavPrev,
  onNavNext,
}: {
  baristaUserId: number | null;
  open: boolean;
  onClose: () => void;
  // Recruter was removed from this modal (Fast Search still has its own
  // Recruter button and keeps using this same handler via its own prop) —
  // kept optional rather than deleted so none of this modal's existing
  // callers need to change just to drop a now-unused prop.
  onRecruit?: (barista: BaristaMarketplaceCard) => void;
  // Used by the Barista's own "preview my profile" (Eye icon on Business →
  // Profil): renders the exact same modal a Coffee Owner sees, but Favorite/
  // Report/Message/Avis become inert (no self-favorite, self-message,
  // self-report, or self-review) — only Disponibilité stays functional, since
  // it's just displaying the Barista's own real saved availability.
  readOnly?: boolean;
  hasItemNav?: boolean;
  canNavPrev?: boolean;
  canNavNext?: boolean;
  onNavPrev?: () => void;
  onNavNext?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isDark = useThemeStore((s) => s.isDark);
  const LEVEL_COLORS = levelColors(isDark);
  // Local theme tokens — same mechanism/palette as barista-page.tsx's own
  // useTheme(isDark) helper, applied here since this modal renders outside
  // that page's scope.
  const t = {
    modalBg: isDark ? "bg-gray-900" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    sectionBg: isDark ? "bg-gray-800/60" : "bg-gray-50",
    sectionBgAlt: isDark ? "bg-gray-800/40" : "bg-gray-50",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
  };
  const { data, isLoading } = useBaristaProfileDetail(baristaUserId);
  const card = data?.card;
  // Cover is the detail modal's primary hero image; Photo de profil then Flash
  // are tried in order if it's missing or fails to load (analyse.md image-mapping task).
  const coverImage = useFallbackImage([card?.coverImageUrl, card?.profileImageUrl, card?.flashImageUrl], baristaUserId);
  const { data: reviews = [] } = useBaristaReviews(baristaUserId);
  const { data: missions = [] } = useBaristaMissions();
  const createReview = useCreateBaristaReview();
  const reportBarista = useReportBarista();

  const faved = useFavorites((s) => (baristaUserId ? !!s.baristaMarket[baristaUserId] : false));
  const toggleBaristaMarket = useFavorites((s) => s.toggleBaristaMarket);

  const [reviewMissionId, setReviewMissionId] = useState<number | null>(null);
  // Signaler now opens its own separate Dialog instead of an inline
  // collapsible panel — same mutation/validation/success-error behavior.
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  // Star — opens its own dedicated modal instead of expanding inline, same
  // pattern as Signaler/Disponibilité already do.
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [messaging, setMessaging] = useState(false);
  // Portfolio gallery — reuses the exact same lightbox already used by the
  // Marketing details modal (Part 25), no separate gallery component.
  const [albumOpen, setAlbumOpen] = useState(false);
  const [albumIndex, setAlbumIndex] = useState(0);

  // Review eligibility mirrors the existing server rule exactly (POST /api/barista/reviews):
  // one review per COMPLETED mission between this Coffee Owner and this Barista.
  const eligibleMissions = useMemo(
    () => missions.filter((m) => m.baristaUserId === baristaUserId && m.status === "COMPLETED"),
    [missions, baristaUserId]
  );
  const myReviewByMission = useMemo(() => {
    const map = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews) if (r.cafeId === user?.id) map.set(r.baristaMissionId, r);
    return map;
  }, [reviews, user?.id]);
  const activeMissionId = reviewMissionId ?? eligibleMissions.find((m) => !myReviewByMission.has(m.id))?.id ?? eligibleMissions[0]?.id ?? null;
  const existingReview = activeMissionId ? myReviewByMission.get(activeMissionId) : undefined;

  const handleClose = () => {
    setReviewMissionId(null);
    setReportModalOpen(false);
    setReportReason("");
    onClose();
  };

  // Scroll-direction dismissal (scroll down, back up, then up again past the
  // top closes the modal with a slide-down + fade) — same behavior and
  // timing as the Pack Detail Modal, via the shared hook; see
  // client/src/hooks/use-scroll-dismiss.ts. This modal's DialogContent is
  // itself the scroll container (no separate inner scroll div), so the
  // gesture handlers and dismiss styles attach directly to it below.
  const {
    onBodyWheel, onBodyTouchStart, onBodyTouchMove, onBodyTouchEnd,
    dismissContentStyle, dismissOverlayStyle,
  } = useScrollDismiss(open, handleClose, undefined, true);

  // Same swipe-to-dismiss, independently, for the nested Signaler dialog
  // (task: "Standardize Grabber Design and Swipe-to-Dismiss Across Store
  // Information and Service Modals") — a separate Dialog/open state, so a
  // separate hook instance; safe since this dialog is already rendered as a
  // sibling of the main modal's own gesture container, never a descendant.
  const {
    onBodyWheel: reportOnBodyWheel, onBodyTouchStart: reportOnBodyTouchStart,
    onBodyTouchMove: reportOnBodyTouchMove, onBodyTouchEnd: reportOnBodyTouchEnd,
    dismissContentStyle: reportDismissContentStyle, dismissOverlayStyle: reportDismissOverlayStyle,
  } = useScrollDismiss(reportModalOpen, () => { setReportModalOpen(false); setReportReason(""); }, undefined, true);

  const handleMessage = async () => {
    if (!card || readOnly) return;
    setMessaging(true);
    try {
      const res = await startBaristaConversation(card.userId);
      navigate(`/cafe/messages?service=BARISTA&conversationId=${res.conversation.id}`);
      handleClose();
    } catch (err: any) {
      toast({ title: "Contact impossible", description: err?.message ?? "Veuillez réessayer.", variant: "destructive" });
    } finally {
      setMessaging(false);
    }
  };

  const submitReport = () => {
    if (!card || !reportReason.trim() || readOnly) return;
    reportBarista.mutate(
      { baristaUserId: card.userId, reason: reportReason.trim() },
      {
        onSuccess: () => { toast({ title: "Signalement envoyé", description: "L'équipe Admin va l'examiner." }); setReportModalOpen(false); setReportReason(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      {/* Scrollbar treatment (Part 10) matches the existing My Favorites modal
          scroll container exactly (client/src/components/cafe/marketplace-layout.tsx) —
          same thin thumb/track/hover classes, not a new scrollbar style. */}
      <DialogContent
        className={`sm:max-w-2xl rounded-2xl border-0 shadow-2xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${t.modalBg}`}
        style={dismissContentStyle}
        overlayStyle={dismissOverlayStyle}
        onWheel={onBodyWheel}
        onTouchStart={onBodyTouchStart}
        onTouchMove={onBodyTouchMove}
        onTouchEnd={onBodyTouchEnd}
      >
        <VisuallyHidden><DialogTitle>{card?.name ?? "Profil Barista"}</DialogTitle></VisuallyHidden>
        {isLoading || !card ? (
          <div className="p-6 space-y-4">
            <Skeleton className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-40 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header — large image is now the dominant visual element (Part 2),
                with Name → Bio → remaining info directly underneath it (Part 4). */}
            <div className={`w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
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
                  <AvatarFallback className="rounded-none bg-gradient-to-br from-green-600 to-emerald-700">
                    <span className="text-white font-bold text-6xl">{card.initials}</span>
                  </AvatarFallback>
                </Avatar>
              )}
              {/* Small corner logo badge — kept tied to the raw coverImageUrl field
                  (not the resolved fallback) so it only appears when the banner is
                  genuinely showing a distinct Cover image, never a redundant repeat
                  of the same Photo de profil already filling the banner. */}
              {card.coverImageUrl && (
                <Avatar className="absolute top-3 left-3 w-11 h-11 rounded-xl border-2 border-white/80 shadow-md">
                  <AvatarImage src={getAvatarUrl(card as any)} alt={card.name} className="object-cover" />
                  <AvatarFallback className="rounded-xl bg-gradient-to-br from-green-600 to-emerald-700 text-white text-sm font-bold">
                    {card.initials}
                  </AvatarFallback>
                </Avatar>
              )}
              {/* Top right — Close + Favorite, unchanged position (same
                  placement as the Maintenance details modal). */}
              <div className="absolute top-3 right-3 flex gap-2">
                <button
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"
                  onClick={() => { if (!readOnly) toggleBaristaMarket({ id: card.userId, name: card.name, initials: card.initials, skills: card.skills, location: card.location, rating: card.rating / 10, available: card.available, profileImageUrl: card.profileImageUrl }); }}
                  data-testid={`button-fav-modal-${card.userId}`}
                >
                  <Heart className={`w-4 h-4 ${faved ? "fill-rose-400 text-rose-400" : "text-white"}`} />
                </button>
                <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={handleClose} aria-label="Fermer" data-testid="button-close-barista-modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              {/* Bottom right — Signaler, Disponibilité, Avis (Star) + "Associer
                  à une offre d'emploi" icons, same placement as the Maintenance
                  details modal. The Flash icon was removed from here (Phase 3) —
                  Fast Search is now the Flash experience for Coffee Owners
                  browsing baristas, and the Barista's own Flash preview still
                  lives on their Business → Profil page; nothing duplicates it
                  here anymore. */}
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={() => { if (!readOnly) setReportModalOpen(true); }} title="Signaler" data-testid="button-open-barista-report" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Flag className="w-4 h-4 text-white" /></button>
                <button onClick={() => setAvailabilityModalOpen(true)} title="Disponibilité" data-testid="button-open-barista-availability" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Clock className="w-4 h-4 text-white" /></button>
                <button onClick={() => setReviewsModalOpen(true)} title="Avis" data-testid="button-open-barista-reviews" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Star className="w-4 h-4 text-white" /></button>
                {!readOnly && (
                  <BaristaJobTargetButton
                    baristaUserId={card.userId}
                    baristaName={card.name}
                    className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"
                  />
                )}
              </div>
              <span
                className={`absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm ${card.available ? "bg-green-500/90 text-white" : "bg-black/50 text-white/80"}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${card.available ? "bg-white" : "bg-white/60"}`} />
                {card.available ? "Disponible" : "Indisponible"}
              </span>
            </div>

            {/* Body */}
            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <div className="flex items-start justify-between gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h2 className={`font-bold text-xl leading-tight min-w-0 ${t.textPrimary}`}>{card.name}</h2>
                    <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${LEVEL_COLORS[card.level]}`}>{LEVEL_LABELS[card.level]}</Badge>
                  </div>
                  {hasItemNav && (
                    <ItemNavButtons
                      isDark={isDark}
                      canPrev={canNavPrev}
                      canNext={canNavNext}
                      onPrev={() => onNavPrev?.()}
                      onNext={() => onNavNext?.()}
                      prevLabel="Barista précédent"
                      nextLabel="Barista suivant"
                      prevTestId="button-barista-nav-prev"
                      nextTestId="button-barista-nav-next"
                    />
                  )}
                </div>
                {card.bio && <p className={`text-sm leading-relaxed mt-1.5 ${t.textMuted}`}>{card.bio}</p>}
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {(card.rating / 10).toFixed(1)} ({card.reviewCount} avis)</span>
                  {card.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {card.location}</span>}
                  {card.distanceKm != null && <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> {card.distanceKm} km</span>}
                </div>
              </div>

              <div className={`grid ${card.educationLevel ? "grid-cols-2" : "grid-cols-1"} gap-3 text-sm`}>
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textMuted}`}>Expérience</p>
                  <p className={`font-bold ${t.textPrimary}`}>{card.experienceYears != null ? `${card.experienceYears} an${card.experienceYears > 1 ? "s" : ""}` : "Non renseignée"}</p>
                </div>
                {card.educationLevel && (
                  <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                    <p className={`text-[11px] ${t.textMuted}`}>Niveau d'étude</p>
                    <p className={`font-bold ${t.textPrimary}`}>{card.educationLevel}</p>
                  </div>
                )}
              </div>

              {/* Standardize Maintenance and Barista Detail Modal Layouts — every
                  logical section below is now its own visually separated
                  container (p-3 rounded-xl ${t.sectionBg}), same structural
                  pattern as the Academy detail modal's own sectionBg boxes
                  (components/academy/academy-detail-modal.tsx) and as already
                  used by the Expérience/Niveau d'étude tiles above in this
                  same modal — content/data/logic inside each box unchanged. */}
              {card.skills.length > 0 && (
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Compétences</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.skills.map((s) => (
                      <Badge key={s} variant="outline" className={isDark ? "border-gray-700 text-gray-200" : ""}>{s}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {card.languages?.length > 0 && (
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Langue</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.languages.map((l) => (
                      <Badge key={l} variant="outline" className={isDark ? "border-gray-700 text-gray-200" : ""}>{l}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {card.certifications.length > 0 && (
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Award className="w-3.5 h-3.5" /> Certifications</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.certifications.map((c) => (
                      <Badge key={c} variant="outline" className={isDark ? "border-gray-700 text-gray-200" : ""}>{c}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Old inline "Lun · Mar · Mer..." availability line removed from
                  the main body — now reachable via the Disponibilité icon on
                  the profile picture, which opens BaristaAvailabilityModal. */}

              {card.portfolioUrls.length > 0 && (
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><ImageIcon className="w-3.5 h-3.5" /> Portfolio</p>
                  <div className="grid grid-cols-4 gap-2">
                    {card.portfolioUrls.map((url, i) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => { setAlbumIndex(i); setAlbumOpen(true); }}
                        className={`aspect-square rounded-lg overflow-hidden border ${t.border} ${isDark ? "bg-gray-800" : "bg-gray-100"}`}
                        data-testid={`button-portfolio-thumb-${i}`}
                      >
                        <img src={url} alt="Portfolio" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cafés précédents — long employment history stays readable via
                  an internal max-height + scroll (same thin-scrollbar classes
                  as this modal's own DialogContent), same rationale as
                  Maintenance's "Détails de Service" section: this is the one
                  field explicitly prone to a long list, other sections above
                  stay uncapped. */}
              {card.workHistory.length > 0 && (
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Briefcase className="w-3.5 h-3.5" /> Cafés précédents</p>
                  <div className="max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
                    <div className="space-y-2">
                      {card.workHistory.map((w) => (
                        <div key={w.id} className={`p-2.5 rounded-lg border text-sm ${t.border} ${t.textPrimary}`}>
                          <p className="font-medium">{w.cafeName}{w.role ? ` — ${w.role}` : ""}</p>
                          <p className={`text-xs ${t.textMuted}`}>{w.startPeriod || "?"} → {w.endPeriod || "Aujourd'hui"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Avis — moved into the dedicated Star-icon ReviewsModal (Phase 7),
                  no longer rendered inline here. */}
            </div>

            {/* Actions — Signaler moved to the profile picture (Part 11);
                Recruter removed from this modal (job/mission association via
                the Briefcase icon above replaces it here — Fast Search keeps
                its own separate Recruter button/flow, untouched). */}
            <div className={`p-5 sm:p-6 pt-0 flex flex-wrap gap-2 justify-end border-t mt-1 pt-4 ${t.border}`}>
              <Button variant="outline" size="sm" className={`gap-1.5 ${t.textPrimary} ${isDark ? "border-gray-700" : ""}`} onClick={handleMessage} disabled={messaging} data-testid="button-message-barista">
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Signaler — same modal chrome as the Disponibilité modal above (rounded-[2rem]
        container, circular close button), close button on the right
        (docs/print_marketing_ui_synchronization_audit.md Section 14-17). Content/
        functionality unchanged. */}
    <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
      <DialogContent
        className={`sm:max-w-md p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden ${t.modalBg}`}
        style={reportDismissContentStyle}
        overlayStyle={reportDismissOverlayStyle}
      >
        <VisuallyHidden><DialogTitle>Signaler {card?.name ?? ""}</DialogTitle></VisuallyHidden>
        <div
          className="px-5 pt-1 pb-5 space-y-3"
          onWheel={reportOnBodyWheel}
          onTouchStart={reportOnBodyTouchStart}
          onTouchMove={reportOnBodyTouchMove}
          onTouchEnd={reportOnBodyTouchEnd}
        >
          <ModalGrabber isDark={isDark} />
          <div className="flex items-center justify-between">
            <div className="w-8 h-8" />
            <span className={`text-[13px] font-semibold tracking-tight leading-tight ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler {card?.name}</span>
            <button onClick={() => { setReportModalOpen(false); setReportReason(""); }} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <Textarea placeholder="Décrivez le problème…" rows={3} value={reportReason} onChange={(e) => setReportReason(e.target.value)} className={t.inputBg} data-testid="input-report-reason" />
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="outline" className={t.textPrimary} onClick={() => { setReportModalOpen(false); setReportReason(""); }}>Annuler</Button>
            <Button size="sm" variant="destructive" onClick={submitReport} disabled={!reportReason.trim() || reportBarista.isPending} data-testid="button-submit-report">
              {reportBarista.isPending ? "Envoi…" : "Envoyer le signalement"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Disponibilité — weekly schedule, Shop Opening Hours visual reference,
        real saved Barista data only. */}
    <BaristaAvailabilityModal
      open={availabilityModalOpen}
      onClose={() => setAvailabilityModalOpen(false)}
      baristaName={card?.name ?? ""}
      weeklyHours={card?.weeklyHours ?? null}
      isDark={isDark}
    />

    <MarketingPortfolioAlbumModal
      open={albumOpen}
      onClose={() => setAlbumOpen(false)}
      images={card?.portfolioUrls ?? []}
      initialIndex={albumIndex}
      providerName={card?.name ?? ""}
    />

    {/* Avis — renders the shared Avis modal (client/src/components/
        review-modal.tsx, task: "Extend the Shared Avis Modal Across Store,
        Barista, and Maintenance") instead of ReviewsModal + a local form.
        Same review data/mutation/eligibility as before (reviews/
        createReview/eligibleMissions) — only the presentation shell
        changed. The mission-select dropdown (only shown when there is more
        than one eligible completed mission to review) is this target's one
        genuinely extra field, passed via extraFormContent. */}
    <ReviewModal
      open={reviewsModalOpen}
      onClose={() => setReviewsModalOpen(false)}
      targetName={card?.name ?? ""}
      reviewTypeLabel="Avis sur le barista"
      existingReviews={reviews}
      myReview={existingReview ? { rating: existingReview.rating, comment: existingReview.comment } : null}
      defaultRating={5}
      canReview={!readOnly && eligibleMissions.length > 0}
      onSubmit={async (rating, comment) => {
        if (!card || !activeMissionId) throw new Error("Aucune mission terminée à évaluer");
        await createReview.mutateAsync({ baristaUserId: card.userId, missionId: activeMissionId, rating, comment: comment.trim() || undefined });
      }}
      isSubmitting={createReview.isPending}
      extraFormContent={eligibleMissions.length > 1 ? (
        <select
          className={`w-full text-xs rounded-lg border px-2 py-1.5 ${t.inputBg}`}
          value={activeMissionId ?? ""}
          onChange={(e) => setReviewMissionId(Number(e.target.value))}
          data-testid="select-review-mission"
        >
          {eligibleMissions.map((m) => (
            <option key={m.id} value={m.id}>{m.missionType || `Mission #${m.id}`} {myReviewByMission.has(m.id) ? "(déjà noté)" : ""}</option>
          ))}
        </select>
      ) : undefined}
    />
    </>
  );
}
