import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useFavorites } from "@/hooks/use-favorites";
import { useThemeStore } from "@/store/theme-store";
import {
  useMarketingServiceDetail,
  useMarketingReviews,
  useMarketingProjects,
  useCreateMarketingReview,
  startMarketingConversation,
  type MarketingMarketplaceCard,
  type MarketingServiceCard,
} from "@/hooks/use-marketing";
import { useSubmitMarketingReport } from "@/hooks/use-marketing-reports";
import { ReportModal } from "@/components/report-modal";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ItemNavButtons } from "@/components/shared/item-nav-buttons";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star, MapPin, Navigation, Flag, Heart, MessageCircle, X, Megaphone, Layers, ListChecks,
} from "lucide-react";
import { ReviewModal } from "@/components/review-modal";

const PROVIDER_TYPE_LABELS: Record<string, string> = { Agency: "Agence", Freelancer: "Freelancer", Studio: "Studio" };

// Comprehensive Coffee-Owner-facing Marketing SERVICE details modal (Agency →
// Multiple Services) — mirrors AcademyDetailModal's exact structure/hierarchy/
// spacing/interaction pattern (a formation's own modal, adapted here to one
// agency service), reusing the same /api/marketing/services/:id route as the
// mapped card, and the existing favorites/review/report/messaging/quote
// systems — no separate data copy, no new design. The "Agence" section here
// plays the same role as the Formation modal's "Académie" section: clicking
// it hands the agencyUserId back to the caller (onOpenAgency), which opens the
// existing MarketingDetailModal — kept as a callback, not a direct import, so
// the two modal files never import each other (see marketing-detail-modal.tsx's
// own onOpenService callback for the reverse direction).
export function MarketingServiceDetailModal({
  serviceId,
  open,
  onClose,
  onRequestQuote,
  onOpenAgency,
  readOnly = false,
  // Optional — Previous/Next Marketing Service navigation (task: "Add
  // Consistent Previous/Next Navigation to All Coffee Owner Service Detail
  // Modals"). The owning page computes its own filtered service list and
  // the current position within it; this modal only renders the buttons
  // and calls the provided callbacks. Omitted by every other caller (Admin,
  // the Agency's own profile preview, etc.), so the buttons simply don't
  // render there.
  hasItemNav = false,
  canNavPrev = false,
  canNavNext = false,
  onNavPrev,
  onNavNext,
}: {
  serviceId: number | null;
  open: boolean;
  onClose: () => void;
  onRequestQuote?: (provider: MarketingMarketplaceCard) => void;
  onOpenAgency?: (agencyUserId: number) => void;
  readOnly?: boolean;
  hasItemNav?: boolean;
  canNavPrev?: boolean;
  canNavNext?: boolean;
  onNavPrev?: () => void;
  onNavNext?: () => void;
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
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    sectionBg: isDark ? "bg-gray-800/60" : "bg-gray-50",
    sectionBgAlt: isDark ? "bg-gray-800/40" : "bg-gray-50",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
  };
  const { data: service, isLoading } = useMarketingServiceDetail(serviceId);
  const { data: reviews = [] } = useMarketingReviews(service?.marketingUserId ?? null);
  const { data: projects = [] } = useMarketingProjects();
  const createReview = useCreateMarketingReview();
  const submitReportMutation = useSubmitMarketingReport();

  const faved = useFavorites((s) => (service ? !!s.marketingServices[service.id] : false));
  const toggleMarketingService = useFavorites((s) => s.toggleMarketingService);

  const [reviewProjectId, setReviewProjectId] = useState<number | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [messaging, setMessaging] = useState(false);

  // Review eligibility mirrors the existing server rule (POST /api/marketing/reviews):
  // one review per COMPLETED marketingProject — scoped to THIS service's category, since
  // reviews stay agency-level data but a project always records which service it was for.
  const eligibleProjects = useMemo(
    () => (service ? projects.filter((p) => p.marketingUserId === service.marketingUserId && p.service === service.category && p.status === "COMPLETED") : []),
    [projects, service]
  );
  const myReviewByProject = useMemo(() => {
    const map = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews) if (r.cafeId === user?.id && r.marketingProjectId != null) map.set(r.marketingProjectId, r);
    return map;
  }, [reviews, user?.id]);
  const activeProjectId = reviewProjectId ?? eligibleProjects.find((p) => !myReviewByProject.has(p.id))?.id ?? eligibleProjects[0]?.id ?? null;
  const existingReview = activeProjectId ? myReviewByProject.get(activeProjectId) : undefined;

  const heroImage = service ? (service.imageUrl || service.agencyProfileImageUrl) : null;

  const handleClose = () => {
    setReviewProjectId(null);
    setReportModalOpen(false);
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

  const handleMessage = async () => {
    if (!service || readOnly) return;
    setMessaging(true);
    try {
      const res = await startMarketingConversation(service.marketingUserId);
      navigate(`/cafe/messages?service=MARKETING&conversationId=${res.conversation.id}`);
      handleClose();
    } catch (err: any) {
      toast({ title: "Contact impossible", description: err?.message ?? "Veuillez réessayer.", variant: "destructive" });
    } finally {
      setMessaging(false);
    }
  };

  const submitReview = async (rating: number, comment: string) => {
    if (!service || !activeProjectId || readOnly) throw new Error("Aucun projet terminé à évaluer");
    await createReview.mutateAsync({ marketingUserId: service.marketingUserId, projectId: activeProjectId, rating, comment: comment.trim() || undefined });
  };

  const submitReport = async (rating: number, reason: string) => {
    if (!service || readOnly) throw new Error("Aperçu en lecture seule");
    await submitReportMutation.mutateAsync({ targetUserId: service.marketingUserId, reason, rating });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className={`sm:max-w-2xl rounded-2xl border-0 shadow-2xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${t.modalBg}`}
        style={dismissContentStyle}
        overlayStyle={dismissOverlayStyle}
        onWheel={onBodyWheel}
        onTouchStart={onBodyTouchStart}
        onTouchMove={onBodyTouchMove}
        onTouchEnd={onBodyTouchEnd}
      >
        <VisuallyHidden><DialogTitle>{service?.title?.trim() || service?.category || "Service"}</DialogTitle></VisuallyHidden>
        {isLoading || !service ? (
          <div className="p-6 space-y-4">
            <Skeleton className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-40 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header image — service image, agency photo fallback, same treatment/
                position as the Barista/Academy modals. */}
            <div className={`w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <ModalGrabber isDark={isDark} onImage />
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={getAvatarUrl({ profileImageUrl: heroImage })} alt={service.category} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-purple-600 to-violet-700">
                  <Megaphone className="w-16 h-16 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="absolute top-3 right-3 flex gap-2">
                <button
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"
                  onClick={() => { if (!readOnly) toggleMarketingService({
                    id: service.id, name: service.category, agencyUserId: service.marketingUserId, agencyName: service.agencyName,
                    rating: service.rating / 10, image: heroImage, location: service.agencyLocation, priceInCents: service.startingPriceInCents,
                  }); }}
                  data-testid={`button-fav-marketing-service-${service.id}`}
                >
                  <Heart className={`w-4 h-4 ${faved ? "fill-rose-400 text-rose-400" : "text-white"}`} />
                </button>
                <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={handleClose} data-testid="button-close-marketing-service-modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={() => { if (!readOnly) setReportModalOpen(true); }} title="Signaler" data-testid="button-open-marketing-service-report" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Flag className="w-4 h-4 text-white" /></button>
                <button onClick={() => setReviewsModalOpen(true)} title="Avis" data-testid="button-open-marketing-service-reviews" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Star className="w-4 h-4 text-white" /></button>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <div className="flex items-start justify-between gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h2 className={`font-bold text-xl leading-tight min-w-0 ${t.textPrimary}`}>{service.title?.trim() || service.category}</h2>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[10px] border-0 px-1.5">{service.category}</Badge>
                      <Badge className={`text-[10px] border-0 px-1.5 ${isDark ? "bg-purple-900/50 text-purple-300" : "bg-purple-100 text-purple-700"}`}>{PROVIDER_TYPE_LABELS[service.agencyProfileType] ?? service.agencyProfileType}</Badge>
                    </div>
                  </div>
                  {hasItemNav && (
                    <ItemNavButtons
                      isDark={isDark}
                      canPrev={canNavPrev}
                      canNext={canNavNext}
                      onPrev={() => onNavPrev?.()}
                      onNext={() => onNavNext?.()}
                      prevLabel="Service précédent"
                      nextLabel="Service suivant"
                      prevTestId="button-marketing-service-nav-prev"
                      nextTestId="button-marketing-service-nav-next"
                    />
                  )}
                </div>
                {/* Sous-catégories — only the ones actually saved for THIS service
                    (Categories & Subcategories: Complete End-to-End Integration),
                    never the parent category's full available list. */}
                {service.subCategories?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {service.subCategories.map((sub) => (
                      <Badge key={sub} variant="outline" className={`text-[10px] ${isDark ? "border-gray-700 text-gray-300" : ""}`}>{sub}</Badge>
                    ))}
                  </div>
                )}
                {service.description && <p className={`text-sm leading-relaxed mt-1.5 ${t.textMuted}`}>{service.description}</p>}
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {(service.rating / 10).toFixed(1)} ({service.reviewCount} avis)</span>
                  {service.agencyLocation && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {service.agencyLocation}</span>}
                  {service.distanceKm != null && <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> {service.distanceKm} km</span>}
                </div>
              </div>

              {/* Agence — immediately after the service identity
                  (docs/service_details_offer_details_and_desktop_navbar_audit.md):
                  Service → Agence → Prix/Temps de réponse → Détails de l'offre.
                  Clicking opens the Marketing Agency Details Modal (Part 2), the
                  same synchronized representation reused everywhere an agency is
                  shown. */}
              <button
                type="button"
                onClick={() => onOpenAgency?.(service.marketingUserId)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${t.border} ${isDark ? "hover:border-purple-600" : "hover:border-purple-300"} ${t.sectionBgAlt}`}
                data-testid="button-open-marketing-agency"
              >
                <p className={`text-xs font-semibold mb-2 flex items-center gap-1 ${t.textMuted}`}><Layers className="w-3.5 h-3.5" /> Agence</p>
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 shrink-0">
                    <AvatarImage src={getAvatarUrl({ profileImageUrl: service.agencyProfileImageUrl })} alt={service.agencyName} />
                    <AvatarFallback className="bg-purple-100 text-purple-700 font-bold text-sm">
                      {service.agencyName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm truncate ${t.textPrimary}`}>{service.agencyName}</p>
                    {service.agencyLocation && <p className={`text-xs flex items-center gap-1 ${t.textMuted}`}><MapPin className="w-3 h-3" /> {service.agencyLocation}</p>}
                  </div>
                </div>
                {service.agencyDescription && <p className={`text-xs mt-2.5 leading-relaxed ${t.textMuted}`}>{service.agencyDescription}</p>}
              </button>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textMuted}`}>Prix de départ</p>
                  <p className="font-bold text-purple-600">{fmt(service.startingPriceInCents)}</p>
                </div>
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textMuted}`}>Temps de réponse</p>
                  <p className={`font-bold ${t.textPrimary}`}>{service.responseTime}</p>
                </div>
              </div>

              {/* Offer details — real, agency-entered content only, never shown when empty
                  (docs/marketing_services_offer_details_admin_audit.md). Now the LAST
                  section, after Agence and Prix/Temps de réponse. */}
              {service.offerDetails?.trim() && (
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><ListChecks className="w-3.5 h-3.5" /> Détails de l'offre</p>
                  <p className={`text-sm whitespace-pre-wrap ${t.textPrimary}`}>{service.offerDetails}</p>
                </div>
              )}

              {/* Avis — moved into the dedicated Star-icon ReviewsModal, matching
                  MarketingDetailModal's own already-established pattern
                  (docs/print_marketing_ui_synchronization_audit.md Section 5/6/8),
                  no longer rendered inline here. */}
            </div>

            <div className={`p-5 sm:p-6 pt-0 flex flex-wrap gap-2 justify-end border-t mt-1 pt-4 ${t.border}`}>
              <Button variant="outline" size="sm" className={`gap-1.5 ${t.textPrimary} ${isDark ? "border-gray-700" : ""}`} onClick={handleMessage} disabled={messaging} data-testid="button-message-marketing-service">
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </Button>
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                onClick={() => { if (!readOnly) onRequestQuote?.({ userId: service.marketingUserId, name: service.agencyName, categories: [service.category] } as any); }}
                data-testid="button-quote-marketing-service-modal"
              >
                Demander un devis
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Signaler — redesigned on the Avis modal pattern (task: "Standardize
        the Remaining Report Modals Using the New Academy Design"), same
        shared ReportModal used by MarketingDetailModal and every other
        migrated report entry point. */}
    <ReportModal
      open={reportModalOpen}
      onClose={() => setReportModalOpen(false)}
      targetName={service?.agencyName ?? ""}
      onSubmit={submitReport}
      isSubmitting={submitReportMutation.isPending}
      accentClassName={isDark ? "text-purple-400" : "text-purple-600"}
    />

    {/* Avis — dedicated modal, opened via the Star icon. Same real project-based
        reviews and the same review form/mutation (submitReview) as before,
        relocated out of the main modal's body, mirroring MarketingDetailModal's
        identical pattern. */}
    <ReviewModal
      open={reviewsModalOpen}
      onClose={() => setReviewsModalOpen(false)}
      targetName={service?.agencyName ?? ""}
      reviewTypeLabel="Avis sur l'agence"
      existingReviews={reviews}
      myReview={existingReview ? { rating: existingReview.rating, comment: existingReview.comment } : null}
      defaultRating={5}
      canReview={!readOnly && eligibleProjects.length > 0}
      onSubmit={submitReview}
      isSubmitting={createReview.isPending}
      extraFormContent={eligibleProjects.length > 1 ? (
        <select
          className={`w-full text-xs rounded-lg border px-2 py-1.5 ${t.inputBg}`}
          value={activeProjectId ?? ""}
          onChange={(e) => setReviewProjectId(Number(e.target.value))}
          data-testid="select-review-project"
        >
          {eligibleProjects.map((p) => (
            <option key={p.id} value={p.id}>Projet #{p.id} {myReviewByProject.has(p.id) ? "(déjà noté)" : ""}</option>
          ))}
        </select>
      ) : undefined}
    />
    </>
  );
}
