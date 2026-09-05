import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useThemeStore } from "@/store/theme-store";
import { useDeliveries } from "@/hooks/use-deliveries";
import {
  useDeliveryCompanyProfileDetail,
  useDeliveryCompanyReviews,
  useCreateDeliveryCompanyReview,
  useReportDeliveryCompany,
} from "@/hooks/use-delivery-company-marketplace";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star, MapPin, Clock, Truck, Users as UsersIcon,
  Flag, Navigation, X, CheckCircle2,
} from "lucide-react";
import { WEEKLY_DAY_DEFS } from "@/lib/weekly-hours";
import type { DeliveryCompanyMarketplaceCard } from "@shared/schema";

// Same theming mechanism as barista-detail-modal.tsx / maintenance-page.tsx's
// AgentDetailModal (this app's dark mode branches literal Tailwind classes off
// a boolean, `.dark` is never added to the DOM) — reused rather than reinvented.
function useTheme(isDark: boolean) {
  return {
    modalBg: isDark ? "bg-gray-900" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    mutedBg: isDark ? "bg-gray-800" : "bg-gray-100",
    sectionBg: isDark ? "bg-gray-800/60" : "bg-gray-50",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
  };
}

// Availability modal — same UX concept/visual reference as
// BaristaAvailabilityModal / MaintenanceAvailabilityModal (Shop Opening Hours
// origin), reusing the same WEEKLY_DAY_DEFS/OpeningHoursMap shape.
function DeliveryCompanyAvailabilityModal({
  open, onClose, companyName, weeklyHours, isDark,
}: {
  open: boolean;
  onClose: () => void;
  companyName: string;
  weeklyHours: import("@shared/schema").OpeningHoursMap | null;
  isDark: boolean;
}) {
  const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const todayKey = WEEKLY_DAY_DEFS[todayIndex].key;
  const dk = isDark;
  const bg = dk ? "bg-gray-900" : "bg-white";
  const textPrimary = dk ? "text-white" : "text-gray-900";
  const textMuted = dk ? "text-gray-400" : "text-gray-500";
  const rowBg = dk ? "bg-gray-800 border-gray-700/60" : "bg-gray-50 border-gray-100";
  const rowToday = dk ? "bg-teal-500/15 border-teal-500/30" : "bg-teal-50 border-teal-200";
  const timeColor = dk ? "text-gray-300" : "text-gray-700";
  const closedColor = dk ? "text-red-400" : "text-red-500";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Disponibilité — {companyName}</DialogTitle></VisuallyHidden>
        <div className={`flex flex-col max-h-[88vh] overflow-hidden transition-colors duration-200 ${bg}`}>
          <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={onClose} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}>
                <X className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight leading-tight ${textPrimary}`}>{companyName}</span>
                <span className={`text-[11px] font-medium ${textMuted}`}>Disponibilité</span>
              </div>
              <div className="w-8 h-8" />
            </div>
            <div className={`h-px w-full ${dk ? "bg-gray-800" : "bg-gray-100"}`} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
            {weeklyHours ? (
              <div className="space-y-2 pb-2">
                {WEEKLY_DAY_DEFS.map(({ key, label }) => {
                  const day = weeklyHours[key];
                  const isToday = key === todayKey;
                  return (
                    <div key={key} className={`flex items-center justify-between border rounded-2xl px-4 py-3 transition-colors ${isToday ? rowToday : rowBg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-medium ${isToday ? (dk ? "text-teal-400" : "text-teal-600") : textPrimary}`}>{label}</span>
                        {isToday && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${dk ? "bg-teal-500/30 text-teal-300" : "bg-teal-100 text-teal-700"}`}>Today</span>}
                      </div>
                      {day?.closed ? (
                        <span className={`text-[12px] font-semibold ${closedColor}`}>Closed</span>
                      ) : day ? (
                        <span className={`text-[13px] font-medium tabular-nums ${isToday ? (dk ? "text-teal-300" : "text-teal-700") : timeColor}`}>{day.open}&thinsp;–&thinsp;{day.close}</span>
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
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Comprehensive Supplier-facing Delivery Company detail modal — same visual
// reference as barista-detail-modal.tsx's BaristaDetailModal (Part 10 of the
// task), adapted to Delivery Company content (Chauffeurs/Véhicules/delivery
// zones instead of skills/portfolio/cafés). Reuses the existing
// /api/delivery-company/profile/:userId route for both the Supplier-facing
// view (sanitized card+drivers+vehicles) and the Delivery Company's own Eye
// preview (readOnly) — no separate data copy.
export function DeliveryCompanyDetailModal({
  companyUserId, open, onClose, onSelect, onOpenDriver, readOnly = false,
}: {
  companyUserId: number | null;
  open: boolean;
  onClose: () => void;
  // Present only when opened from the Supplier's Order Delivery dispatch flow
  // (Part 23's "relevant delivery/selection action required by the dispatch
  // flow") — absent everywhere else (e.g. the Delivery Company's own preview).
  onSelect?: (card: DeliveryCompanyMarketplaceCard) => void;
  // Admin → Delivery → Entreprises + Chauffeurs: clicking a driver in the
  // "Chauffeurs" list below hands its id back to the caller, which opens the
  // existing DriverDetailModal — same nested-navigation-via-callback pattern
  // used by the Academy/Marketing modals (onOpenCourse/onOpenService), kept
  // as a callback rather than a direct import since the sanitized driver
  // shape here (id/name/photo/busy) isn't the full User the driver modal
  // needs — the caller already has the real User rows to resolve it from.
  onOpenDriver?: (driverId: number) => void;
  // The Delivery Company's own "preview my profile" (Eye icon on Business →
  // Profil): same modal a Supplier sees, but Avis/Report/selection become
  // inert (no self-review, self-report, or self-dispatch) — only
  // Disponibilité stays functional.
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);
  const { data, isLoading } = useDeliveryCompanyProfileDetail(companyUserId);
  const card = data?.card;
  const drivers = data?.drivers ?? [];
  const vehicles = data?.vehicles ?? [];
  const { data: reviews = [] } = useDeliveryCompanyReviews(companyUserId);
  const { data: deliveries = [] } = useDeliveries();
  const createReview = useCreateDeliveryCompanyReview();
  const reportCompany = useReportDeliveryCompany();

  const [reviewDeliveryId, setReviewDeliveryId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);

  // Review eligibility mirrors the existing server rule exactly (POST
  // /api/delivery-company/reviews): one review per DELIVERED delivery between
  // this Supplier and this Delivery Company. Only meaningful for a Supplier
  // viewer — never shown in the Delivery Company's own read-only preview.
  const eligibleDeliveries = useMemo(
    () => (user?.role === "SUPPLIER" ? deliveries.filter((d) => d.deliveryCompanyId === companyUserId && d.status === "DELIVERED") : []),
    [deliveries, companyUserId, user?.role]
  );
  const myReviewByDelivery = useMemo(() => {
    const map = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews) if (r.cafeId === user?.id && r.deliveryId != null) map.set(r.deliveryId, r);
    return map;
  }, [reviews, user?.id]);
  const activeDeliveryId = reviewDeliveryId ?? eligibleDeliveries.find((d) => !myReviewByDelivery.has(d.id))?.id ?? eligibleDeliveries[0]?.id ?? null;
  const existingReview = activeDeliveryId ? myReviewByDelivery.get(activeDeliveryId) : undefined;

  const handleClose = () => {
    setReviewDeliveryId(null);
    setReportModalOpen(false);
    setReportReason("");
    onClose();
  };

  const submitReview = () => {
    if (!card || !activeDeliveryId || readOnly) return;
    createReview.mutate(
      { deliveryCompanyUserId: card.userId, deliveryId: activeDeliveryId, rating: reviewRating, comment: reviewComment.trim() || undefined },
      {
        onSuccess: () => { toast({ title: "Avis envoyé" }); setReviewComment(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const submitReport = () => {
    if (!card || !reportReason.trim() || readOnly) return;
    reportCompany.mutate(
      { deliveryCompanyUserId: card.userId, reason: reportReason.trim() },
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
        <VisuallyHidden><DialogTitle>{card?.name ?? "Entreprise de livraison"}</DialogTitle></VisuallyHidden>
        {isLoading || !card ? (
          <div className="p-6 space-y-4">
            <Skeleton className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-40 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header — large real photo/logo, same treatment as the Barista modal. */}
            <div className={`w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={getAvatarUrl(card as any)} alt={card.name} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-teal-600 to-cyan-700">
                  <span className="text-white font-bold text-6xl">{card.initials}</span>
                </AvatarFallback>
              </Avatar>
              <div className="absolute top-3 right-3 flex gap-2">
                <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={handleClose} data-testid="button-close-delivery-company-modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={() => { if (!readOnly) setReportModalOpen(true); }} title="Signaler" data-testid="button-open-delivery-company-report" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Flag className="w-4 h-4 text-white" /></button>
                <button onClick={() => setAvailabilityModalOpen(true)} title="Disponibilité" data-testid="button-open-delivery-company-availability" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Clock className="w-4 h-4 text-white" /></button>
              </div>
              <span className={`absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm ${card.available ? "bg-green-500/90 text-white" : "bg-black/50 text-white/80"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${card.available ? "bg-white" : "bg-white/60"}`} />
                {card.available ? "Disponible" : "Indisponible"}
              </span>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{card.name}</h2>
                  <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${isDark ? "bg-teal-900/50 text-teal-300" : "bg-teal-100 text-teal-700"}`}>{card.companyType}</Badge>
                </div>
                {card.description && <p className={`text-sm leading-relaxed mt-1.5 ${t.textMuted}`}>{card.description}</p>}
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {(card.rating / 10).toFixed(1)} ({card.reviewCount} avis)</span>
                  {card.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {card.location}</span>}
                  {card.distanceKm != null && <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> {card.distanceKm} km</span>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textSubtle}`}>Tarif / livraison</p>
                  <p className="font-bold text-teal-600">{fmt(card.dailyRateInCents)}</p>
                </div>
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textSubtle}`}>Expérience</p>
                  <p className={`font-bold ${t.textPrimary}`}>{card.experienceYears} an{card.experienceYears > 1 ? "s" : ""}</p>
                </div>
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textSubtle}`}>Réponse</p>
                  <p className={`font-bold ${t.textPrimary}`}>{card.responseTime}</p>
                </div>
              </div>

              {card.deliveryZones && (
                <div className={`${t.sectionBg} rounded-xl p-3`}>
                  <h3 className={`text-xs font-semibold mb-2 ${t.textMuted}`}>Zone d'intervention</h3>
                  <div className={`flex items-center gap-2 text-sm ${t.textMuted}`}><MapPin className="w-3.5 h-3.5 text-teal-500" />{card.deliveryZones}</div>
                </div>
              )}

              {card.certifications.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Certifications</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.certifications.map((c) => <Badge key={c} variant="outline" className={isDark ? "border-gray-700 text-gray-200" : ""}>{c}</Badge>)}
                  </div>
                </div>
              )}

              {/* Chauffeurs — the exact same roster Business → Chauffeurs uses, sanitized. */}
              <div>
                <h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><UsersIcon className="w-3.5 h-3.5" /> Chauffeurs ({drivers.length})</h3>
                {drivers.length === 0 ? (
                  <p className={`text-xs ${t.textMuted}`}>Aucun chauffeur enregistré.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {drivers.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => onOpenDriver?.(d.id)}
                        disabled={!onOpenDriver}
                        className={`flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${t.sectionBg} ${onOpenDriver ? "hover:ring-1 hover:ring-teal-500 cursor-pointer" : ""}`}
                        data-testid={`button-delivery-company-driver-${d.id}`}
                      >
                        <Avatar className="w-7 h-7 shrink-0">
                          <AvatarImage src={d.profileImageUrl ?? undefined} alt={d.name} />
                          <AvatarFallback className="bg-teal-100 text-teal-700 text-xs">{d.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium truncate ${t.textPrimary}`}>{d.name}</p>
                          <p className={`text-[10px] ${d.busy ? "text-amber-500" : "text-green-600"}`}>{d.busy ? "En livraison" : "Disponible"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Véhicules — same real fleet Business → Véhicules uses. */}
              <div>
                <h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Truck className="w-3.5 h-3.5" /> Véhicules ({vehicles.length})</h3>
                {vehicles.length === 0 ? (
                  <p className={`text-xs ${t.textMuted}`}>Aucun véhicule enregistré.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {vehicles.map((v) => (
                      <div key={v.id} className={`p-2 rounded-lg text-xs ${t.sectionBg}`}>
                        <p className={`font-medium ${t.textPrimary}`}>{v.type}{(v.brand || v.model) ? ` — ${[v.brand, v.model].filter(Boolean).join(" ")}` : ""}</p>
                        <p className={t.textMuted}>{v.plateNumber || "—"} · <span className={v.isActive ? "text-green-600" : "text-gray-400"}>{v.isActive ? "Actif" : "Inactif"}</span></p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reviews */}
              <div>
                <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Avis ({reviews.length})</p>
                {reviews.length === 0 ? (
                  <p className={`text-xs ${t.textMuted}`}>Aucun avis pour le moment.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {reviews.map((r) => (
                      <div key={r.id} className={`p-2.5 rounded-lg text-sm ${t.sectionBg}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-medium text-xs ${t.textPrimary}`}>{r.cafeOwnerName || r.cafeName}</span>
                          <span className="flex items-center gap-0.5 text-amber-500 text-xs"><Star className="w-3 h-3 fill-amber-400" /> {r.rating}</span>
                        </div>
                        {r.comment && <p className={`text-xs mt-1 ${t.textMuted}`}>{r.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {!readOnly && eligibleDeliveries.length > 0 && (
                  <div className={`mt-3 p-3 rounded-xl border space-y-2 ${t.border}`}>
                    <p className={`text-xs font-medium ${t.textPrimary}`}>{existingReview ? "Modifier votre avis" : "Laisser un avis"}</p>
                    {eligibleDeliveries.length > 1 && (
                      <select
                        className={`w-full text-xs rounded-lg border px-2 py-1.5 ${t.inputBg}`}
                        value={activeDeliveryId ?? ""}
                        onChange={(e) => setReviewDeliveryId(Number(e.target.value))}
                        data-testid="select-review-delivery"
                      >
                        {eligibleDeliveries.map((d) => (
                          <option key={d.id} value={d.id}>Commande #{d.orderId} {myReviewByDelivery.has(d.id) ? "(déjà noté)" : ""}</option>
                        ))}
                      </select>
                    )}
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" onClick={() => setReviewRating(n)} data-testid={`button-star-${n}`}>
                          <Star className={`w-5 h-5 ${n <= (existingReview?.rating ?? reviewRating) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                        </button>
                      ))}
                    </div>
                    <Textarea
                      placeholder="Commentaire (facultatif)"
                      rows={2}
                      defaultValue={existingReview?.comment ?? ""}
                      onChange={(e) => setReviewComment(e.target.value)}
                      className={t.inputBg}
                      data-testid="input-review-comment"
                    />
                    <Button size="sm" onClick={submitReview} disabled={createReview.isPending} className="bg-teal-600 hover:bg-teal-700 text-white" data-testid="button-submit-review">
                      {createReview.isPending ? "Envoi…" : existingReview ? "Mettre à jour l'avis" : "Envoyer l'avis"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Actions — the relevant delivery/selection action required by the dispatch flow
                (Part 23); visually present in every context, but inert when readOnly (self
                preview) or when no dispatch is in progress (onSelect not provided). */}
            <div className={`p-5 sm:p-6 pt-0 flex flex-wrap gap-2 justify-end border-t mt-1 pt-4 ${t.border}`}>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5"
                onClick={() => { if (!readOnly) onSelect?.(card); }}
                disabled={!onSelect && !readOnly}
                data-testid="button-select-delivery-company"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Choisir cette entreprise
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
            <Button size="sm" variant="destructive" onClick={submitReport} disabled={!reportReason.trim() || reportCompany.isPending} data-testid="button-submit-report">
              {reportCompany.isPending ? "Envoi…" : "Envoyer le signalement"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <DeliveryCompanyAvailabilityModal
      open={availabilityModalOpen}
      onClose={() => setAvailabilityModalOpen(false)}
      companyName={card?.name ?? ""}
      weeklyHours={card?.weeklyHours ?? null}
      isDark={isDark}
    />
    </>
  );
}
