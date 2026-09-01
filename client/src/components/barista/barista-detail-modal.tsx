import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star, MapPin, Clock, Award, Image as ImageIcon, Briefcase, MessageCircle,
  Flag, Heart, CalendarDays, Navigation,
} from "lucide-react";

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

// Comprehensive Coffee-Owner-facing Barista detail modal (Parts 26-29) — reuses
// the same /api/barista/profile/:userId route as the Barista's own self-view
// (sanitized to the public `card` for Coffee Owner viewers server-side), the
// existing recruitment/messaging/review/report systems — no separate data copy.
export function BaristaDetailModal({
  baristaUserId,
  open,
  onClose,
  onRecruit,
}: {
  baristaUserId: number | null;
  open: boolean;
  onClose: () => void;
  onRecruit: (barista: BaristaMarketplaceCard) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fmt = useFormatCurrency();
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
  const { data: reviews = [] } = useBaristaReviews(baristaUserId);
  const { data: missions = [] } = useBaristaMissions();
  const createReview = useCreateBaristaReview();
  const reportBarista = useReportBarista();

  const faved = useFavorites((s) => (baristaUserId ? !!s.baristaMarket[baristaUserId] : false));
  const toggleBaristaMarket = useFavorites((s) => s.toggleBaristaMarket);

  const [reviewMissionId, setReviewMissionId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [messaging, setMessaging] = useState(false);

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
    setReportOpen(false);
    setReportReason("");
    onClose();
  };

  const handleMessage = async () => {
    if (!card) return;
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

  const submitReview = () => {
    if (!card || !activeMissionId) return;
    createReview.mutate(
      { baristaUserId: card.userId, missionId: activeMissionId, rating: reviewRating, comment: reviewComment.trim() || undefined },
      {
        onSuccess: () => { toast({ title: "Avis envoyé" }); setReviewComment(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const submitReport = () => {
    if (!card || !reportReason.trim()) return;
    reportBarista.mutate(
      { baristaUserId: card.userId, reason: reportReason.trim() },
      {
        onSuccess: () => { toast({ title: "Signalement envoyé", description: "L'équipe Admin va l'examiner." }); setReportOpen(false); setReportReason(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      {/* Scrollbar treatment (Part 10) matches the existing My Favorites modal
          scroll container exactly (client/src/components/cafe/marketplace-layout.tsx) —
          same thin thumb/track/hover classes, not a new scrollbar style. */}
      <DialogContent className={`sm:max-w-2xl rounded-2xl border-0 shadow-2xl max-h-[90vh] overflow-y-auto p-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${t.modalBg}`}>
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
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={getAvatarUrl(card as any)} alt={card.name} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-green-600 to-emerald-700">
                  <span className="text-white font-bold text-6xl">{card.initials}</span>
                </AvatarFallback>
              </Avatar>
              <button
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"
                onClick={() => toggleBaristaMarket({ id: card.userId, name: card.name, initials: card.initials, skills: card.skills, location: card.location, rating: card.rating / 10, available: card.available, profileImageUrl: card.profileImageUrl })}
                data-testid={`button-fav-modal-${card.userId}`}
              >
                <Heart className={`w-4 h-4 ${faved ? "fill-rose-400 text-rose-400" : "text-white"}`} />
              </button>
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
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{card.name}</h2>
                  <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${LEVEL_COLORS[card.level]}`}>{LEVEL_LABELS[card.level]}</Badge>
                </div>
                {card.bio && <p className={`text-sm leading-relaxed mt-1.5 ${t.textMuted}`}>{card.bio}</p>}
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {(card.rating / 10).toFixed(1)} ({card.reviewCount} avis)</span>
                  {card.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {card.location}</span>}
                  {card.distanceKm != null && <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> {card.distanceKm} km</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textMuted}`}>Tarif / jour</p>
                  <p className="font-bold text-green-600">{fmt(card.dailyRateInCents)}</p>
                </div>
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textMuted}`}>Expérience</p>
                  <p className={`font-bold ${t.textPrimary}`}>{card.experienceYears != null ? `${card.experienceYears} an${card.experienceYears > 1 ? "s" : ""}` : "Non renseignée"}</p>
                </div>
              </div>

              {card.skills.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Compétences</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.skills.map((s) => (
                      <Badge key={s} variant="outline" className={isDark ? "border-gray-700 text-gray-200" : ""}>{s}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {card.certifications.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Award className="w-3.5 h-3.5" /> Certifications</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.certifications.map((c) => (
                      <Badge key={c} variant="outline" className={isDark ? "border-gray-700 text-gray-200" : ""}>{c}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {card.availableDays.length > 0 && (
                <div className={`flex items-center gap-1.5 text-xs ${t.textMuted}`}>
                  <CalendarDays className="w-3.5 h-3.5" /> {card.availableDays.join(" · ")}
                </div>
              )}

              {card.portfolioUrls.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><ImageIcon className="w-3.5 h-3.5" /> Portfolio</p>
                  <div className="grid grid-cols-4 gap-2">
                    {card.portfolioUrls.map((url) => (
                      <div key={url} className={`aspect-square rounded-lg overflow-hidden border ${t.border} ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                        <img src={url} alt="Portfolio" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {card.workHistory.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Briefcase className="w-3.5 h-3.5" /> Cafés précédents</p>
                  <div className="space-y-2">
                    {card.workHistory.map((w) => (
                      <div key={w.id} className={`p-2.5 rounded-lg border text-sm ${t.border} ${t.textPrimary}`}>
                        <p className="font-medium">{w.cafeName}{w.role ? ` — ${w.role}` : ""}</p>
                        <p className={`text-xs ${t.textMuted}`}>{w.startPeriod || "?"} → {w.endPeriod || "Aujourd'hui"}</p>
                      </div>
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

                {/* Review submission — only offered when a completed mission with this
                    Barista exists, exactly matching the server-side eligibility rule. */}
                {eligibleMissions.length > 0 && (
                  <div className={`mt-3 p-3 rounded-xl border space-y-2 ${t.border}`}>
                    <p className={`text-xs font-medium ${t.textPrimary}`}>{existingReview ? "Modifier votre avis" : "Laisser un avis"}</p>
                    {eligibleMissions.length > 1 && (
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
                    <Button size="sm" onClick={submitReview} disabled={createReview.isPending} className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-submit-review">
                      {createReview.isPending ? "Envoi…" : existingReview ? "Mettre à jour l'avis" : "Envoyer l'avis"}
                    </Button>
                  </div>
                )}
              </div>

              {reportOpen && (
                <div className={`p-3 rounded-xl border space-y-2 ${isDark ? "border-red-900/50 bg-red-950/20" : "border-red-200 bg-red-50/50"}`}>
                  <p className={`text-xs font-medium ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler ce Barista</p>
                  <Textarea placeholder="Décrivez le problème…" rows={2} value={reportReason} onChange={(e) => setReportReason(e.target.value)} className={t.inputBg} data-testid="input-report-reason" />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className={t.textPrimary} onClick={() => setReportOpen(false)}>Annuler</Button>
                    <Button size="sm" variant="destructive" onClick={submitReport} disabled={!reportReason.trim() || reportBarista.isPending} data-testid="button-submit-report">
                      {reportBarista.isPending ? "Envoi…" : "Envoyer le signalement"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className={`p-5 sm:p-6 pt-0 flex flex-wrap gap-2 justify-end border-t mt-1 pt-4 ${t.border}`}>
              <Button variant="outline" size="sm" className={`gap-1.5 text-red-500 hover:text-red-500 ${isDark ? "border-gray-700" : ""}`} onClick={() => setReportOpen((v) => !v)} data-testid="button-report-barista">
                <Flag className="w-3.5 h-3.5" /> Signaler
              </Button>
              <Button variant="outline" size="sm" className={`gap-1.5 ${t.textPrimary} ${isDark ? "border-gray-700" : ""}`} onClick={handleMessage} disabled={messaging} data-testid="button-message-barista">
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1.5" disabled={!card.available} onClick={() => onRecruit(card)} data-testid="button-recruit-barista-modal">
                {card.available ? "Recruter" : "Indisponible"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
