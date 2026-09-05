import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useFavorites } from "@/hooks/use-favorites";
import { useThemeStore } from "@/store/theme-store";
import {
  useMarketingProfileDetail,
  useMarketingReviews,
  useMarketingProjects,
  useCreateMarketingReview,
  useReportMarketingProvider,
  startMarketingConversation,
  type MarketingMarketplaceCard,
} from "@/hooks/use-marketing";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star, MapPin, Clock, Image as ImageIcon, Globe, MessageCircle,
  Flag, Heart, Navigation, X, Megaphone,
} from "lucide-react";
import { WEEKLY_DAY_DEFS } from "@/lib/weekly-hours";
import type { OpeningHoursMap } from "@shared/schema";
import { MarketingPortfolioAlbumModal } from "@/components/marketing/marketing-portfolio-album-modal";

const PROVIDER_TYPE_LABELS: Record<string, string> = { Agency: "Agence", Freelancer: "Freelancer", Studio: "Studio" };
const PROVIDER_TYPE_COLORS: Record<string, string> = {
  Agency: "bg-blue-100 text-blue-700", Freelancer: "bg-orange-100 text-orange-700", Studio: "bg-violet-100 text-violet-700",
};
function providerTypeLabel(type: string) { return PROVIDER_TYPE_LABELS[type] ?? type; }
function providerTypeColor(type: string) { return PROVIDER_TYPE_COLORS[type] ?? "bg-gray-100 text-gray-700"; }

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} data-testid={`button-star-${n}`}>
          <Star className={`w-5 h-5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

// Availability modal — same structure/scrollbar/today-highlight treatment as
// BaristaAvailabilityModal (client/src/components/barista/barista-detail-modal.tsx),
// fed by marketingProfiles.weeklyHours (same OpeningHoursMap shape, reused not duplicated).
function MarketingAvailabilityModal({
  open, onClose, providerName, weeklyHours, isDark,
}: {
  open: boolean;
  onClose: () => void;
  providerName: string;
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
        <VisuallyHidden><DialogTitle>Disponibilité — {providerName}</DialogTitle></VisuallyHidden>
        <div className={`flex flex-col max-h-[88vh] overflow-hidden transition-colors duration-200 ${bg}`}>
          <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={onClose} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}>
                <X className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight leading-tight ${textPrimary}`}>{providerName}</span>
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
                <p className="text-xs mt-1 opacity-50">Ce prestataire n'a pas encore défini ses disponibilités.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Comprehensive Coffee-Owner-facing Marketing details modal — mirrors
// BaristaDetailModal's exact structure/hierarchy/spacing/interaction pattern
// (client/src/components/barista/barista-detail-modal.tsx), reusing the same
// /api/marketing/profile/:userId route, favorites/review/report/messaging
// systems built in the Marketing sync task. No new design, no duplicate systems.
export function MarketingDetailModal({
  marketingUserId,
  open,
  onClose,
  onRequestQuote,
  onOpenService,
  readOnly = false,
}: {
  marketingUserId: number | null;
  open: boolean;
  onClose: () => void;
  onRequestQuote: (provider: MarketingMarketplaceCard) => void;
  // Clicking a service in the "Services" list (Part 2-3) hands the serviceId back to the
  // caller, which opens the Service Details Modal — same nested-navigation pattern as
  // AcademyDetailModal/AcademyProfileModal, kept as a callback (not a direct import) so
  // the two modal files never import each other.
  onOpenService?: (serviceId: number) => void;
  // Used by the Marketing provider's own "preview my profile" (Eye icon on
  // Business → Profil) and by Admin's inspection view: renders the exact same
  // modal a Coffee Owner sees, but Favorite/Report/Message/Avis/Devis become
  // inert (no self-favorite, self-message, self-report, self-review, or
  // self-quote-request) — only Disponibilité and the Portfolio album stay
  // functional, since they're just displaying real saved data.
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const [, navigate] = useLocation();
  const isDark = useThemeStore((s) => s.isDark);
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
  const { data, isLoading } = useMarketingProfileDetail(marketingUserId);
  const card = data?.card;
  const { data: reviews = [] } = useMarketingReviews(marketingUserId);
  const { data: projects = [] } = useMarketingProjects();
  const createReview = useCreateMarketingReview();
  const reportProvider = useReportMarketingProvider();

  const faved = useFavorites((s) => (marketingUserId ? !!s.marketing[marketingUserId] : false));
  const toggleMarketing = useFavorites((s) => s.toggleMarketing);

  const [reviewProjectId, setReviewProjectId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [albumIndex, setAlbumIndex] = useState(0);
  const [messaging, setMessaging] = useState(false);
  const services = card?.services ?? [];

  // Review eligibility mirrors the existing server rule exactly (POST /api/marketing/reviews):
  // one review per COMPLETED marketingProject between this Coffee Owner and this provider.
  const eligibleProjects = useMemo(
    () => projects.filter((p) => p.marketingUserId === marketingUserId && p.status === "COMPLETED"),
    [projects, marketingUserId]
  );
  const myReviewByProject = useMemo(() => {
    const map = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews) if (r.cafeId === user?.id && r.marketingProjectId != null) map.set(r.marketingProjectId, r);
    return map;
  }, [reviews, user?.id]);
  const activeProjectId = reviewProjectId ?? eligibleProjects.find((p) => !myReviewByProject.has(p.id))?.id ?? eligibleProjects[0]?.id ?? null;
  const existingReview = activeProjectId ? myReviewByProject.get(activeProjectId) : undefined;

  const portfolioImages = card?.portfolioImages ?? [];
  // First image is already the marketplace card's cover — the modal's own
  // Portfolio section shows the rest, while the album lightbox still opens
  // over the FULL set (Part 9 requires "all images" in the album).
  const remainingPortfolio = portfolioImages.slice(1);

  const handleClose = () => {
    setReviewProjectId(null);
    setReportModalOpen(false);
    setReportReason("");
    onClose();
  };

  const handleMessage = async () => {
    if (!card || readOnly) return;
    setMessaging(true);
    try {
      const res = await startMarketingConversation(card.userId);
      navigate(`/cafe/messages?service=MARKETING&conversationId=${res.conversation.id}`);
      handleClose();
    } catch (err: any) {
      toast({ title: "Contact impossible", description: err?.message ?? "Veuillez réessayer.", variant: "destructive" });
    } finally {
      setMessaging(false);
    }
  };

  const submitReview = () => {
    if (!card || !activeProjectId || readOnly) return;
    createReview.mutate(
      { marketingUserId: card.userId, projectId: activeProjectId, rating: reviewRating, comment: reviewComment.trim() || undefined },
      {
        onSuccess: () => { toast({ title: "Avis envoyé" }); setReviewComment(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const submitReport = () => {
    if (!card || !reportReason.trim() || readOnly) return;
    reportProvider.mutate(
      { marketingUserId: card.userId, reason: reportReason.trim() },
      {
        onSuccess: () => { toast({ title: "Signalement envoyé", description: "L'équipe Admin va l'examiner." }); setReportModalOpen(false); setReportReason(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className={`sm:max-w-2xl rounded-2xl border-0 shadow-2xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>{card?.name ?? "Profil prestataire"}</DialogTitle></VisuallyHidden>
        {isLoading || !card ? (
          <div className="p-6 space-y-4">
            <Skeleton className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-40 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header image — real profile picture with existing avatar fallback,
                same treatment/position as Barista's modal. */}
            <div className={`w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={getAvatarUrl(card as any)} alt={card.name} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-purple-600 to-violet-700">
                  <span className="text-white font-bold text-6xl">{card.initials}</span>
                </AvatarFallback>
              </Avatar>
              <div className="absolute top-3 right-3 flex gap-2">
                <button
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"
                  onClick={() => { if (!readOnly) toggleMarketing({ id: card.userId, name: card.name, initials: card.initials, type: providerTypeLabel(card.profileType), rating: card.rating / 10, portfolioImages: card.portfolioImages, location: card.location, available: card.isAvailable, profileImageUrl: card.profileImageUrl }); }}
                  data-testid={`button-fav-modal-${card.userId}`}
                >
                  <Heart className={`w-4 h-4 ${faved ? "fill-rose-400 text-rose-400" : "text-white"}`} />
                </button>
                <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={handleClose} data-testid="button-close-marketing-modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={() => { if (!readOnly) setReportModalOpen(true); }} title="Signaler" data-testid="button-open-marketing-report" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Flag className="w-4 h-4 text-white" /></button>
                <button onClick={() => setAvailabilityModalOpen(true)} title="Disponibilité" data-testid="button-open-marketing-availability" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Clock className="w-4 h-4 text-white" /></button>
              </div>
              <span
                className={`absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm ${card.isAvailable ? "bg-green-500/90 text-white" : "bg-black/50 text-white/80"}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${card.isAvailable ? "bg-white" : "bg-white/60"}`} />
                {card.isAvailable ? "Disponible" : "Indisponible"}
              </span>
            </div>

            {/* Body */}
            <div className="p-5 sm:p-6 space-y-5">
              {/* Provider */}
              <div>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{card.name}</h2>
                  <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${providerTypeColor(card.profileType)}`}>{providerTypeLabel(card.profileType)}</Badge>
                </div>
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {(card.rating / 10).toFixed(1)} ({card.reviewCount} avis)</span>
                  {card.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {card.location}</span>}
                  {card.distanceKm != null && <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> {card.distanceKm} km</span>}
                </div>
              </div>

              {/* About — the agency's own description (never a service's) */}
              {card.description && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>À propos</p>
                  <p className={`text-sm leading-relaxed ${t.textMuted}`}>{card.description}</p>
                </div>
              )}

              {/* Services — the agency's real published services (Part 3), each with its own
                  price/response time; clicking one opens the Service Details Modal. */}
              <div>
                <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Megaphone className="w-3.5 h-3.5" /> Services ({services.length})</p>
                {services.length === 0 ? (
                  <p className={`text-xs ${t.textMuted}`}>Aucun service publié pour le moment.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {services.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => onOpenService?.(service.id)}
                        className={`text-left p-3 rounded-xl border transition-colors ${t.border} ${isDark ? "hover:border-purple-600" : "hover:border-purple-300"} ${t.sectionBg}`}
                        data-testid={`button-agency-service-${service.id}`}
                      >
                        <p className={`text-sm font-medium truncate ${t.textPrimary}`}>{service.category}</p>
                        <p className={`text-xs mt-1 ${t.textMuted}`}>{fmt(service.startingPriceInCents)} · {service.responseTime}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Website — never fabricated, omitted entirely when not set */}
              {card.websiteUrl && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Globe className="w-3.5 h-3.5" /> Site web</p>
                  <a
                    href={card.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-purple-600 hover:underline break-all"
                    data-testid="link-marketing-website"
                  >
                    {card.websiteUrl}
                  </a>
                </div>
              )}

              {/* Portfolio — first image already used as the marketplace card cover */}
              {remainingPortfolio.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><ImageIcon className="w-3.5 h-3.5" /> Portfolio</p>
                  <div className="grid grid-cols-4 gap-2">
                    {remainingPortfolio.map((url, i) => (
                      <button
                        key={url + i}
                        type="button"
                        onClick={() => { setAlbumIndex(i + 1); setAlbumOpen(true); }}
                        className={`aspect-square rounded-lg overflow-hidden border ${t.border} ${isDark ? "bg-gray-800" : "bg-gray-100"}`}
                        data-testid={`button-portfolio-thumb-${i}`}
                      >
                        <img src={url} alt="Portfolio" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reviews */}
              <div>
                <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Avis ({reviews.length})</p>
                {reviews.length === 0 ? (
                  <p className={`text-xs ${t.textMuted}`}>Aucun avis pour le moment.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {reviews.map((r) => (
                      <div key={r.id} className={`p-2.5 rounded-lg text-sm ${t.sectionBgAlt}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-medium text-xs ${t.textPrimary}`}>{r.cafeOwnerName || r.cafeName}</span>
                          <span className="flex items-center gap-0.5 text-amber-500 text-xs"><Star className="w-3 h-3 fill-amber-400" /> {r.rating}</span>
                        </div>
                        {r.comment && <p className={`text-xs mt-1 ${t.textMuted}`}>{r.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {eligibleProjects.length > 0 && (
                  <div className={`mt-3 p-3 rounded-xl border space-y-2 ${t.border}`}>
                    <p className={`text-xs font-medium ${t.textPrimary}`}>{existingReview ? "Modifier votre avis" : "Laisser un avis"}</p>
                    {eligibleProjects.length > 1 && (
                      <select
                        className={`w-full text-xs rounded-lg border px-2 py-1.5 ${t.inputBg}`}
                        value={activeProjectId ?? ""}
                        onChange={(e) => setReviewProjectId(Number(e.target.value))}
                        data-testid="select-review-project"
                      >
                        {eligibleProjects.map((p) => (
                          <option key={p.id} value={p.id}>{p.service || `Projet #${p.id}`} {myReviewByProject.has(p.id) ? "(déjà noté)" : ""}</option>
                        ))}
                      </select>
                    )}
                    <StarPicker value={existingReview?.rating ?? reviewRating} onChange={setReviewRating} />
                    <Textarea
                      placeholder="Commentaire (facultatif)"
                      rows={2}
                      defaultValue={existingReview?.comment ?? ""}
                      onChange={(e) => setReviewComment(e.target.value)}
                      className={t.inputBg}
                      data-testid="input-review-comment"
                    />
                    <Button size="sm" onClick={submitReview} disabled={createReview.isPending} className="bg-purple-600 hover:bg-purple-700 text-white" data-testid="button-submit-review">
                      {createReview.isPending ? "Envoi…" : existingReview ? "Mettre à jour l'avis" : "Envoyer l'avis"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className={`p-5 sm:p-6 pt-0 flex flex-wrap gap-2 justify-end border-t mt-1 pt-4 ${t.border}`}>
              <Button variant="outline" size="sm" className={`gap-1.5 ${t.textPrimary} ${isDark ? "border-gray-700" : ""}`} onClick={handleMessage} disabled={messaging} data-testid="button-message-marketing">
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </Button>
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5" onClick={() => { if (!readOnly) onRequestQuote(card); }} data-testid="button-quote-marketing-modal">
                Demander un devis
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
      <DialogContent className={`sm:max-w-md ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>Signaler {card?.name ?? ""}</DialogTitle></VisuallyHidden>
        <div className="space-y-2">
          <p className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler {card?.name}</p>
          <Textarea placeholder="Décrivez le problème…" rows={3} value={reportReason} onChange={(e) => setReportReason(e.target.value)} className={t.inputBg} data-testid="input-report-reason" />
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" className={t.textPrimary} onClick={() => { setReportModalOpen(false); setReportReason(""); }}>Annuler</Button>
            <Button size="sm" variant="destructive" onClick={submitReport} disabled={!reportReason.trim() || reportProvider.isPending} data-testid="button-submit-report">
              {reportProvider.isPending ? "Envoi…" : "Envoyer le signalement"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <MarketingAvailabilityModal
      open={availabilityModalOpen}
      onClose={() => setAvailabilityModalOpen(false)}
      providerName={card?.name ?? ""}
      weeklyHours={card?.weeklyHours ?? null}
      isDark={isDark}
    />

    <MarketingPortfolioAlbumModal
      open={albumOpen}
      onClose={() => setAlbumOpen(false)}
      images={portfolioImages}
      initialIndex={albumIndex}
      providerName={card?.name ?? ""}
    />
    </>
  );
}
