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
  useReportMarketingProvider,
  startMarketingConversation,
  type MarketingMarketplaceCard,
  type MarketingServiceCard,
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
  Star, MapPin, Navigation, Flag, Heart, MessageCircle, X, Megaphone, Layers,
} from "lucide-react";

const PROVIDER_TYPE_LABELS: Record<string, string> = { Agency: "Agence", Freelancer: "Freelancer", Studio: "Studio" };

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
}: {
  serviceId: number | null;
  open: boolean;
  onClose: () => void;
  onRequestQuote?: (provider: MarketingMarketplaceCard) => void;
  onOpenAgency?: (agencyUserId: number) => void;
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
    sectionBgAlt: isDark ? "bg-gray-800/40" : "bg-gray-50",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
  };
  const { data: service, isLoading } = useMarketingServiceDetail(serviceId);
  const { data: reviews = [] } = useMarketingReviews(service?.marketingUserId ?? null);
  const { data: projects = [] } = useMarketingProjects();
  const createReview = useCreateMarketingReview();
  const reportProvider = useReportMarketingProvider();

  const faved = useFavorites((s) => (service ? !!s.marketing[service.marketingUserId] : false));
  const toggleMarketing = useFavorites((s) => s.toggleMarketing);

  const [reviewProjectId, setReviewProjectId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
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
    setReportReason("");
    onClose();
  };

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

  const submitReview = () => {
    if (!service || !activeProjectId || readOnly) return;
    createReview.mutate(
      { marketingUserId: service.marketingUserId, projectId: activeProjectId, rating: reviewRating, comment: reviewComment.trim() || undefined },
      {
        onSuccess: () => { toast({ title: "Avis envoyé" }); setReviewComment(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const submitReport = () => {
    if (!service || !reportReason.trim() || readOnly) return;
    reportProvider.mutate(
      { marketingUserId: service.marketingUserId, reason: reportReason.trim() },
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
        <VisuallyHidden><DialogTitle>{service?.category ?? "Service"}</DialogTitle></VisuallyHidden>
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
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={getAvatarUrl({ profileImageUrl: heroImage })} alt={service.category} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-purple-600 to-violet-700">
                  <Megaphone className="w-16 h-16 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="absolute top-3 right-3 flex gap-2">
                <button
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"
                  onClick={() => { if (!readOnly) toggleMarketing({
                    id: service.marketingUserId, name: service.agencyName, initials: service.agencyName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
                    type: PROVIDER_TYPE_LABELS[service.agencyProfileType] ?? service.agencyProfileType, rating: service.rating / 10,
                    portfolioImages: heroImage ? [heroImage] : [], location: service.agencyLocation, available: service.agencyIsAvailable,
                    profileImageUrl: service.agencyProfileImageUrl,
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
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{service.category}</h2>
                  <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${isDark ? "bg-purple-900/50 text-purple-300" : "bg-purple-100 text-purple-700"}`}>{PROVIDER_TYPE_LABELS[service.agencyProfileType] ?? service.agencyProfileType}</Badge>
                </div>
                {service.description && <p className={`text-sm leading-relaxed mt-1.5 ${t.textMuted}`}>{service.description}</p>}
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {(service.rating / 10).toFixed(1)} ({service.reviewCount} avis)</span>
                  {service.agencyLocation && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {service.agencyLocation}</span>}
                  {service.distanceKm != null && <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> {service.distanceKm} km</span>}
                </div>
              </div>

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

              {/* Agence — clicking opens the Marketing Agency Details Modal (Part 2), the same
                  synchronized representation reused everywhere an agency is shown. */}
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

              {/* Reviews — real agency-level reviews (reviews are tied to the agency, not
                  per-service — see supplierProductReviews.marketingUserId), same data the
                  Agency modal shows. */}
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

                {!readOnly && eligibleProjects.length > 0 && (
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
                          <option key={p.id} value={p.id}>Projet #{p.id} {myReviewByProject.has(p.id) ? "(déjà noté)" : ""}</option>
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

    <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
      <DialogContent className={`sm:max-w-md ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>Signaler {service?.agencyName ?? ""}</DialogTitle></VisuallyHidden>
        <div className="space-y-2">
          <p className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler {service?.agencyName}</p>
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
    </>
  );
}
