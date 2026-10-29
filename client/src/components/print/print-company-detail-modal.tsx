import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useThemeStore } from "@/store/theme-store";
import { useQuery } from "@tanstack/react-query";
import {
  usePrintCompanyDetail, usePrintReviews, useCreatePrintReview, startPrintConversation,
} from "@/hooks/use-print-marketplace";
import { useSubmitPrintReport } from "@/hooks/use-print-reports";
import { ReportModal } from "@/components/report-modal";
import { useFavorites } from "@/hooks/use-favorites";
import type { PrintOrderWithParties, OpeningHoursMap } from "@shared/schema";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star, MapPin, Flag, MessageCircle, X, Printer, Package, Globe, Tag, Clock, Image as ImageIcon, Zap, Heart,
} from "lucide-react";
import { useFallbackImage } from "@/hooks/use-fallback-image";
import { MarketingPortfolioAlbumModal } from "@/components/marketing/marketing-portfolio-album-modal";
import { ReviewModal } from "@/components/review-modal";
import { AvailabilityModal } from "@/components/shared/availability-modal";
import { FlashPreviewModal } from "@/components/account/flash-preview-modal";

// Availability modal — now the shared Disponibilité modal (reference:
// client/src/components/marketing/marketing-detail-modal.tsx's
// MarketingAvailabilityModal, extracted to client/src/components/shared/
// availability-modal.tsx), kept under this name so both call sites
// (this file and print-store-detail-page.tsx) need no changes. Print's
// distinctive blue today-highlight accent is preserved via accentColor.
export function PrintCompanyAvailabilityModal({
  open, onClose, companyName, weeklyHours, isDark,
}: {
  open: boolean;
  onClose: () => void;
  companyName: string;
  weeklyHours: OpeningHoursMap | null;
  isDark: boolean;
}) {
  return (
    <AvailabilityModal
      open={open}
      onClose={onClose}
      targetName={companyName}
      weeklyHours={weeklyHours}
      isDark={isDark}
      accentColor="blue"
      noScheduleHint="Cette imprimerie n'a pas encore défini ses disponibilités."
    />
  );
}

// PRINT Company Details Modal — the printing COMPANY itself (identity/
// description/website/categories/real services/reviews/availability), distinct
// from PrintServiceDetailModal (one item). Opened from Espace Imprimerie's own
// Business → Profil "Aperçu" (readOnly there), from the Service modal's
// "Imprimerie" section, and from Admin PRINT's printer card — one synchronized
// representation everywhere, fed by GET /api/print/company/:userId.
export function PrintCompanyDetailModal({
  printerUserId,
  open,
  onClose,
  onOpenService,
  readOnly = false,
}: {
  printerUserId: number | null;
  open: boolean;
  onClose: () => void;
  // Clicking a service in the "Services" list hands the serviceId back to the caller,
  // which opens PrintServiceDetailModal — same nested-navigation pattern as
  // AcademyProfileModal/MarketingDetailModal, kept as a callback so the two modal
  // files never import each other.
  onOpenService?: (serviceId: number) => void;
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
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    sectionBg: isDark ? "bg-gray-800/60" : "bg-gray-50",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
  };
  const { data, isLoading } = usePrintCompanyDetail(printerUserId);
  const card = data?.card;
  // Cover is the detail modal's primary hero image; Photo de profil then Flash
  // are tried in order if it's missing or fails to load (analyse.md image-mapping task).
  const coverImage = useFallbackImage([card?.coverImageUrl, card?.profileImageUrl, card?.flashImageUrl], printerUserId);
  const faved = useFavorites((s) => (card ? !!s.printCompanies[card.userId] : false));
  const togglePrintCompany = useFavorites((s) => s.togglePrintCompany);
  const { data: reviews = [] } = usePrintReviews(printerUserId);
  const { data: myOrders = [] } = useQuery<PrintOrderWithParties[]>({
    queryKey: ["/api/print/orders"],
    enabled: !readOnly && user?.role === "CAFE_OWNER",
  });
  const createReview = useCreatePrintReview();
  const submitReportMutation = useSubmitPrintReport();

  const [reviewOrderId, setReviewOrderId] = useState<number | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [flashModalOpen, setFlashModalOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [albumIndex, setAlbumIndex] = useState(0);
  const [messaging, setMessaging] = useState(false);

  const eligibleOrders = useMemo(
    () => myOrders.filter((o) => card && o.printerId === card.userId && o.status === "DELIVERED"),
    [myOrders, card]
  );
  const myReviewByOrder = useMemo(() => {
    const map = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews) if (r.cafeId === user?.id && r.printOrderId != null) map.set(r.printOrderId, r);
    return map;
  }, [reviews, user?.id]);
  const activeOrderId = reviewOrderId ?? eligibleOrders.find((o) => !myReviewByOrder.has(o.id))?.id ?? eligibleOrders[0]?.id ?? null;
  const existingReview = activeOrderId ? myReviewByOrder.get(activeOrderId) : undefined;

  const handleClose = () => {
    setReviewOrderId(null);
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
    if (!card || readOnly) return;
    setMessaging(true);
    try {
      const res = await startPrintConversation(card.userId);
      navigate(`/cafe/messages?service=PRINT&conversationId=${res.conversation.id}`);
      handleClose();
    } catch (err: any) {
      toast({ title: "Contact impossible", description: err?.message ?? "Veuillez réessayer.", variant: "destructive" });
    } finally {
      setMessaging(false);
    }
  };

  const submitReview = async (rating: number, comment: string) => {
    if (!card || !activeOrderId || readOnly) throw new Error("Aucune commande livrée à évaluer");
    await createReview.mutateAsync({ printerId: card.userId, printOrderId: activeOrderId, rating, comment: comment.trim() || undefined });
  };

  const submitReport = async (rating: number, reason: string) => {
    if (!card || readOnly) throw new Error("Aperçu en lecture seule");
    await submitReportMutation.mutateAsync({ targetUserId: card.userId, reason, rating });
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
        <VisuallyHidden><DialogTitle>{card?.name ?? "Imprimerie"}</DialogTitle></VisuallyHidden>
        {isLoading || !card ? (
          <div className="p-6 space-y-4">
            <Skeleton className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-40 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
          </div>
        ) : (
          <div className="flex flex-col">
            <div className={`w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <ModalGrabber isDark={isDark} onImage />
              {/* Cover (Part 4) — when set (or Profile/Flash fall back in, see
                  analyse.md image-mapping task), shown as the banner background with
                  the logo demoted to a small corner badge; falls back to the existing
                  icon treatment only when all three image URLs are missing or fail
                  to load. */}
              {coverImage.src ? (
                <img src={coverImage.src} onError={coverImage.onError} alt="" className="w-full h-full object-cover" />
              ) : (
                <Avatar className="w-full h-full rounded-none">
                  <AvatarFallback className="rounded-none bg-gradient-to-br from-blue-600 to-cyan-700">
                    <Printer className="w-16 h-16 text-white" />
                  </AvatarFallback>
                </Avatar>
              )}
              {/* Small corner logo badge — kept tied to the raw coverImageUrl field
                  (not the resolved fallback) so it only appears when the banner is
                  genuinely showing a distinct Cover image, never a redundant repeat
                  of the same Photo de profil already filling the banner. */}
              {card.coverImageUrl && (
                <Avatar className="absolute top-3 left-3 w-11 h-11 rounded-xl border-2 border-white/80 shadow-md">
                  <AvatarImage src={card.profileImageUrl ?? undefined} alt={card.name} className="object-cover" />
                  <AvatarFallback className="rounded-xl bg-gradient-to-br from-blue-600 to-cyan-700 text-white">
                    <Printer className="w-5 h-5" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="absolute top-3 right-3 flex gap-2">
                <button
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"
                  onClick={() => { if (!readOnly) togglePrintCompany({
                    id: card.userId, name: card.name, initials: card.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
                    type: "Imprimerie", rating: card.rating / 10, portfolioImages: card.portfolioImages, location: card.location,
                    available: !card.isOnVacation, profileImageUrl: card.profileImageUrl,
                  }); }}
                  data-testid={`button-fav-print-company-${card.userId}`}
                >
                  <Heart className={`w-4 h-4 ${faved ? "fill-rose-400 text-rose-400" : "text-white"}`} />
                </button>
                <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={handleClose} data-testid="button-close-print-company-modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={() => { if (!readOnly) setReportModalOpen(true); }} title="Signaler" data-testid="button-open-print-company-report" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Flag className="w-4 h-4 text-white" /></button>
                <button onClick={() => setAvailabilityModalOpen(true)} title="Disponibilité" data-testid="button-open-print-company-availability" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Clock className="w-4 h-4 text-white" /></button>
                <button onClick={() => setReviewsModalOpen(true)} title="Avis" data-testid="button-open-print-company-reviews" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Star className="w-4 h-4 text-white" /></button>
                {!readOnly && card.flashImageUrl && (
                  <button onClick={() => setFlashModalOpen(true)} title="Flash" data-testid="button-open-print-company-flash" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Zap className="w-4 h-4 text-white" /></button>
                )}
              </div>
              {!card.marketplaceVisible ? (
                <span className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm bg-black/50 text-white/80">
                  Profil masqué
                </span>
              ) : (
                <span className={`absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm ${!card.isOnVacation ? "bg-green-500/90 text-white" : "bg-black/50 text-white/80"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${!card.isOnVacation ? "bg-white" : "bg-white/60"}`} />
                  {!card.isOnVacation ? "Disponible" : "Indisponible"}
                </span>
              )}
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{card.name}</h2>
                  <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${isDark ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>Imprimerie</Badge>
                </div>
                {card.description && <p className={`text-sm leading-relaxed mt-1.5 ${t.textMuted}`}>{card.description}</p>}
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  {card.reviewCount > 0 && <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {(card.rating / 10).toFixed(1)} ({card.reviewCount} avis)</span>}
                  {card.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {card.location}</span>}
                </div>
              </div>

              {/* Categories — this printer's own real category selection (Business →
                  Catégories), the same source Coffee Owner's /print marketplace derives from. */}
              {card.categories.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Tag className="w-3.5 h-3.5" /> Catégories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.categories.map((c) => (
                      <span key={c} className={`text-xs px-2.5 py-1 rounded-full font-medium ${t.sectionBg} ${t.textPrimary}`}>{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {card.portfolioImages.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><ImageIcon className="w-3.5 h-3.5" /> Portfolio</p>
                  <div className="grid grid-cols-4 gap-2">
                    {card.portfolioImages.map((url, i) => (
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

              {/* Services — real active catalog items, clicking one opens the existing
                  per-item PrintServiceDetailModal. */}
              <div>
                <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Package className="w-3.5 h-3.5" /> Services ({card.services.length})</p>
                {card.services.length === 0 ? (
                  <p className={`text-xs ${t.textMuted}`}>Aucun service actif pour le moment.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {card.services.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => onOpenService?.(service.id)}
                        className={`text-left p-3 rounded-xl border transition-colors ${t.border} ${isDark ? "hover:border-blue-600" : "hover:border-blue-300"} ${t.sectionBg}`}
                        data-testid={`button-print-company-service-${service.id}`}
                      >
                        <p className={`text-sm font-medium truncate ${t.textPrimary}`}>{service.name}</p>
                        <p className={`text-xs mt-1 ${t.textMuted}`}>{service.category}{service.category ? " · " : ""}{fmt(service.priceInCents)}/{service.unit} · Min. {service.minQuantity} · {service.productionTimeDays}j</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {card.websiteUrl && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Globe className="w-3.5 h-3.5" /> Site web</p>
                  <a href={card.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all" data-testid="link-print-website">
                    {card.websiteUrl}
                  </a>
                </div>
              )}

              {/* Avis — moved into the dedicated Star-icon ReviewsModal (Phase 7),
                  no longer rendered inline here. */}
            </div>

            <div className={`p-5 sm:p-6 pt-0 flex flex-wrap gap-2 justify-end border-t mt-1 pt-4 ${t.border}`}>
              <Button variant="outline" size="sm" className={`gap-1.5 ${t.textPrimary} ${isDark ? "border-gray-700" : ""}`} onClick={handleMessage} disabled={messaging} data-testid="button-message-print-company">
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Signaler — redesigned on the Avis modal pattern (task: "Extend the
        Shared Reporting System to Print, Academy, and Marketing"), same
        shared ReportModal Maintenance/Barista use: 5-level sadness rating +
        comment. Submitted reports are never shown anywhere until an Admin
        explicitly publishes them (see PrintBlacklistModal). */}
    <ReportModal
      open={reportModalOpen}
      onClose={() => setReportModalOpen(false)}
      targetName={card?.name ?? ""}
      onSubmit={submitReport}
      isSubmitting={submitReportMutation.isPending}
      accentClassName={isDark ? "text-blue-400" : "text-blue-600"}
    />

    <PrintCompanyAvailabilityModal
      open={availabilityModalOpen}
      onClose={() => setAvailabilityModalOpen(false)}
      companyName={card?.name ?? ""}
      weeklyHours={card?.weeklyHours ?? null}
      isDark={isDark}
    />

    <MarketingPortfolioAlbumModal
      open={albumOpen}
      onClose={() => setAlbumOpen(false)}
      images={card?.portfolioImages ?? []}
      initialIndex={albumIndex}
      providerName={card?.name ?? ""}
    />

    {/* Avis (Phase 7) — dedicated modal, opened via the Star icon. Same real
        order-based reviews (usePrintReviews) and the same existing review
        form/mutation (submitReview) as before, relocated out of the main
        modal's body. card.rating is stored in tenths (see the header's
        (card.rating / 10) display), hence the /10 here. */}
    <ReviewModal
      open={reviewsModalOpen}
      onClose={() => setReviewsModalOpen(false)}
      targetName={card?.name ?? ""}
      reviewTypeLabel="Avis sur l'imprimerie"
      existingReviews={reviews.map((r) => ({ ...r, createdAt: r.createdAt ? String(r.createdAt) : undefined }))}
      myReview={existingReview ? { rating: existingReview.rating, comment: existingReview.comment } : null}
      defaultRating={5}
      canReview={!readOnly && eligibleOrders.length > 0}
      onSubmit={submitReview}
      isSubmitting={createReview.isPending}
      extraFormContent={eligibleOrders.length > 1 ? (
        <select
          className={`w-full text-xs rounded-lg border px-2 py-1.5 ${t.inputBg}`}
          value={activeOrderId ?? ""}
          onChange={(e) => setReviewOrderId(Number(e.target.value))}
          data-testid="select-review-order"
        >
          {eligibleOrders.map((o) => (
            <option key={o.id} value={o.id}>Commande #{o.id} {myReviewByOrder.has(o.id) ? "(déjà notée)" : ""}</option>
          ))}
        </select>
      ) : undefined}
    />

    {/* Flash (Phase 3/5E) — Coffee Owner-facing destination for the Flash URL
        configured in Settings → Compte; same component the printer's own
        self-preview uses, not preview mode here. */}
    <FlashPreviewModal
      open={flashModalOpen}
      onClose={() => setFlashModalOpen(false)}
      name={card?.name ?? ""}
      typeLabel="Imprimerie"
      flashImageUrl={card?.flashImageUrl}
      coverImageUrl={card?.coverImageUrl}
      profileImageUrl={card?.profileImageUrl}
      accentBgClass="bg-blue-600"
    />
    </>
  );
}
