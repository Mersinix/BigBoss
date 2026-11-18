import { useState, type ReactNode } from "react";
import { useThemeStore } from "@/store/theme-store";
import { useDeliveries } from "@/hooks/use-deliveries";
import { useDriverReviews, VEHICLE_TYPE_LABELS, type DeliveryVehicleType } from "@/hooks/use-delivery-ecosystem";
import { useDriverDetails } from "@/hooks/use-driver-profile";
import { useDriverDispatchStats } from "@/hooks/use-dispatch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MapPin, Clock, Truck, Mail, Phone, Award, Package, Building2, Store, X, Zap, Image as ImageIcon, Target } from "lucide-react";
import { MarketingPortfolioAlbumModal } from "@/components/marketing/marketing-portfolio-album-modal";
import { ReviewModal } from "@/components/review-modal";
import { AvailabilityModal } from "@/components/shared/availability-modal";
import { FlashPreviewModal } from "@/components/account/flash-preview-modal";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import type { User } from "@shared/schema";

// Same theming mechanism as barista-detail-modal.tsx / AgentDetailModal /
// DeliveryCompanyDetailModal (this app's dark mode branches literal Tailwind
// classes off a boolean, `.dark` is never added to the DOM) — reused rather
// than reinvented, so this modal looks like the same family everywhere it's
// opened from.
function useTheme(isDark: boolean) {
  return {
    modalBg: isDark ? "bg-gray-900" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    sectionBg: isDark ? "bg-gray-800/60" : "bg-gray-50",
  };
}

const STATUS_LABELS: Record<string, string> = { approved: "Approuvé", pending: "En attente", rejected: "Refusé" };

// ONE reusable Chauffeur details modal (Part 13/39-40) — used identically by
// Supplier → Delivery → Chauffeurs (driver-roster-view.tsx), Espace Livraison
// → Business → Chauffeurs (same component), Admin → Delivery → Chauffeurs,
// and the Driver's own Eye preview (Business → Profil). Same visual family as
// barista-detail-modal.tsx/AgentDetailModal/DeliveryCompanyDetailModal. Purely
// informational (no Favorite/Report/Message/Recruit actions exist for a
// Driver anywhere in the platform today — nothing to gate behind a readOnly
// flag, so self-preview is automatically safe by construction) — the only
// interactive element is the Disponibilité icon, which is real data in every
// context including self-preview. The Avis (Star) and Flash icons sit next to
// it — both read-only, safe for every viewer context.
//
// `adminSlot` — optional extra block rendered at the very end of the body,
// passed ONLY by Admin → Delivery (GO Live publication approve/reject for the
// driver). Omitted by every other caller, so their rendering is unchanged.
export function DriverDetailModal({
  driver, open, onClose, adminSlot, readOnly = false,
}: {
  driver: User | null;
  open: boolean;
  onClose: () => void;
  adminSlot?: ReactNode;
  // Opt-in (default false → unchanged for every existing caller): the
  // Driver's own Aperçu self-preview passes this to hide the Flash icon,
  // which would otherwise duplicate the dedicated Flash preview button
  // already on Business → Profil. No other action in this modal needs
  // gating (see the comment above).
  readOnly?: boolean;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);
  const { data, isLoading } = useDriverDetails(driver?.id ?? null);
  const { data: deliveries = [] } = useDeliveries();
  const { data: reviews = [] } = useDriverReviews(driver?.id ?? null);
  // Smart Driver Dispatch System (task: "BigBossCoffee — Smart Driver Dispatch System",
  // Phase 7) — single shared source (getDriverDispatchStats), reusing the same
  // reviewCount/avgRating it already computes rather than a second computation from
  // `reviews` above (that one stays purely for ReviewModal's own list display).
  const { data: dispatchStats } = useDriverDispatchStats(driver?.id ?? null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [albumIndex, setAlbumIndex] = useState(0);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [flashOpen, setFlashOpen] = useState(false);

  // Grabber + swipe-to-dismiss (task: "Add Grabber to Supplier Driver Detail
  // Modal") — same shared hook/call signature as the Pack Detail Modal
  // reference (pack-quick-view-modal.tsx's own useScrollDismiss(dialogOpen,
  // close, undefined, true)). Called unconditionally, before the early
  // return below — a Hook can't be called conditionally.
  const {
    onBodyWheel, onBodyTouchStart, onBodyTouchMove, onBodyTouchEnd,
    dismissContentStyle, dismissOverlayStyle,
  } = useScrollDismiss(open, onClose, undefined, true);

  if (!driver) return null;

  // Prefer the details route's own users-row value (always fresh), falling back
  // to whatever the caller's User object carries.
  const flashImageUrl = data?.flashImageUrl ?? driver.flashImageUrl ?? null;

  const profile = data?.profile;
  const vehicle = data?.vehicle;
  const operator = data?.operator;
  const active = deliveries.filter((d) => d.driverId === driver.id && ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(d.status)).length;
  const completed = deliveries.filter((d) => d.driverId === driver.id && d.status === "DELIVERED").length;
  const total = deliveries.filter((d) => d.driverId === driver.id).length;
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const available = profile ? !profile.isOnVacation : true;

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className={`sm:max-w-2xl rounded-2xl border-0 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden p-0 [&>button]:hidden ${t.modalBg}`}
        style={dismissContentStyle}
        overlayStyle={dismissOverlayStyle}
      >
        <VisuallyHidden><DialogTitle>{driver.name}</DialogTitle></VisuallyHidden>
        {/* Scrollable body — grabber/swipe-to-dismiss handlers attached here
            (not on DialogContent itself), same separation as the Pack Detail
            Modal reference, so the drag gesture never fights native scroll. */}
        <div
          className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          onWheel={onBodyWheel}
          onTouchStart={onBodyTouchStart}
          onTouchMove={onBodyTouchMove}
          onTouchEnd={onBodyTouchEnd}
        >
        {isLoading || !profile ? (
          <div className="p-6 space-y-4">
            <Skeleton className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-40 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
          </div>
        ) : (
          <div className="flex flex-col">
            <div className={`w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <ModalGrabber isDark={isDark} onImage />
              {/* Cover (Part 4) — banner background when set, logo demoted to a small
                  corner badge; falls back to the existing full-banner avatar otherwise.
                  driver is the raw User row, so driver.coverImageUrl is already live. */}
              {(driver as any).coverImageUrl ? (
                <img src={(driver as any).coverImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Avatar className="w-full h-full rounded-none">
                  <AvatarImage src={getAvatarUrl(driver as any)} alt={driver.name} className="object-cover" />
                  <AvatarFallback className="rounded-none bg-gradient-to-br from-blue-600 to-indigo-700">
                    <span className="text-white font-bold text-6xl">{driver.name.charAt(0).toUpperCase()}</span>
                  </AvatarFallback>
                </Avatar>
              )}
              {(driver as any).coverImageUrl && (
                <Avatar className="absolute top-3 left-3 w-11 h-11 rounded-xl border-2 border-white/80 shadow-md">
                  <AvatarImage src={getAvatarUrl(driver as any)} alt={driver.name} className="object-cover" />
                  <AvatarFallback className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-sm font-bold">
                    {driver.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="absolute top-3 right-3 flex gap-2">
                <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={onClose} data-testid="button-close-driver-modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={() => setReviewsOpen(true)} title="Avis" data-testid="button-open-driver-reviews" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Star className="w-4 h-4 text-white" /></button>
                {!readOnly && flashImageUrl && (
                  <button onClick={() => setFlashOpen(true)} title="Flash" data-testid="button-open-driver-flash" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Zap className="w-4 h-4 text-white" /></button>
                )}
                <button onClick={() => setAvailabilityOpen(true)} title="Disponibilité" data-testid="button-open-driver-availability" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Clock className="w-4 h-4 text-white" /></button>
              </div>
              <span className={`absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm ${available ? "bg-green-500/90 text-white" : "bg-black/50 text-white/80"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${available ? "bg-white" : "bg-white/60"}`} />
                {available ? "Disponible" : "Indisponible"}
              </span>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{driver.name}</h2>
                  <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${isDark ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>{STATUS_LABELS[driver.status] ?? driver.status}</Badge>
                </div>
                {profile.bio && <p className={`text-sm leading-relaxed mt-1.5 ${t.textMuted}`}>{profile.bio}</p>}
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  {reviews.length > 0 && <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {avgRating.toFixed(1)} ({reviews.length} avis)</span>}
                  {driver.locationAddress && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{driver.locationAddress}</span>}
                  {operator && (
                    <span className="flex items-center gap-1">
                      {operator.type === "DELIVERY_COMPANY" ? <Building2 className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                      {operator.name}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className={`flex gap-2 p-3 rounded-xl ${t.sectionBg}`}>
                  <Mail className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <div className="min-w-0"><p className={`text-[11px] ${t.textSubtle}`}>E-mail</p><p className={`font-medium truncate ${t.textPrimary}`}>{driver.email}</p></div>
                </div>
                <div className={`flex gap-2 p-3 rounded-xl ${t.sectionBg}`}>
                  <Phone className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <div className="min-w-0"><p className={`text-[11px] ${t.textSubtle}`}>Téléphone</p><p className={`font-medium truncate ${t.textPrimary}`}>{driver.phone || "—"}</p></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textSubtle}`}>Expérience</p>
                  <p className={`font-bold ${t.textPrimary}`}>{profile.experienceYears > 0 ? `${profile.experienceYears} an${profile.experienceYears > 1 ? "s" : ""}` : "Non renseignée"}</p>
                </div>
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textSubtle}`}>Véhicule</p>
                  <p className={`font-bold ${t.textPrimary}`}>{vehicle ? VEHICLE_TYPE_LABELS[vehicle.type as DeliveryVehicleType] : "Aucun"}</p>
                </div>
              </div>

              {vehicle && (
                <div className={`${t.sectionBg} rounded-xl p-3`}>
                  <h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Truck className="w-3.5 h-3.5 text-blue-500" /> Véhicule</h3>
                  <p className={`text-sm ${t.textPrimary}`}>{[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || VEHICLE_TYPE_LABELS[vehicle.type as DeliveryVehicleType]}{vehicle.plateNumber ? ` (${vehicle.plateNumber})` : ""}</p>
                </div>
              )}

              {profile.portfolioImages.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><ImageIcon className="w-3.5 h-3.5" /> Portfolio</p>
                  <div className="grid grid-cols-4 gap-2">
                    {profile.portfolioImages.map((url, i) => (
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

              {profile.certifications.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><Award className="w-3.5 h-3.5 text-amber-500" /> Certifications</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.certifications.map((c) => <Badge key={c} variant="outline" className={isDark ? "border-gray-700 text-gray-200" : ""}>{c}</Badge>)}
                  </div>
                </div>
              )}

              <div className={`${t.sectionBg} rounded-xl p-3`}>
                <h3 className={`text-xs font-semibold mb-2 flex items-center gap-1 ${t.textMuted}`}><Package className="w-3.5 h-3.5" /> Livraisons</h3>
                <div className={`flex items-center gap-4 text-sm ${t.textPrimary}`}>
                  <span>{active} en cours</span>
                  <span>{completed} terminée(s)</span>
                  <span className={t.textMuted}>{total} au total</span>
                </div>
              </div>

              {/* Smart Driver Dispatch System (task: "BigBossCoffee — Smart Driver Dispatch
                  System") — worded distinctly from the "Disponible"/"Indisponible" pill
                  above (that one is isOnVacation; this is the separate acceptingNewOffers
                  dispatch preference) so the two concepts are never confused in this modal. */}
              {dispatchStats && (
                <div className={`${t.sectionBg} rounded-xl p-3`}>
                  <h3 className={`text-xs font-semibold mb-2 flex items-center gap-1 ${t.textMuted}`}><Target className="w-3.5 h-3.5 text-primary" /> Répartition automatique</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><p className={`text-[11px] ${t.textSubtle}`}>Offres</p><p className={`font-semibold ${t.textPrimary}`}>{dispatchStats.totalOffers}</p></div>
                    <div><p className={`text-[11px] ${t.textSubtle}`}>Acceptées</p><p className="font-semibold text-emerald-500">{dispatchStats.accepted}</p></div>
                    <div><p className={`text-[11px] ${t.textSubtle}`}>Refusées</p><p className="font-semibold text-red-500">{dispatchStats.refused}</p></div>
                    <div><p className={`text-[11px] ${t.textSubtle}`}>Expirées</p><p className="font-semibold text-amber-500">{dispatchStats.expired}</p></div>
                    <div><p className={`text-[11px] ${t.textSubtle}`}>Taux d'acceptation</p><p className={`font-semibold ${t.textPrimary}`}>{dispatchStats.acceptanceRate != null ? `${dispatchStats.acceptanceRate}%` : "—"}</p></div>
                    <div><p className={`text-[11px] ${t.textSubtle}`}>Note moyenne</p><p className={`font-semibold ${t.textPrimary}`}>{dispatchStats.avgRating != null ? `${dispatchStats.avgRating.toFixed(1)} (${dispatchStats.reviewCount})` : "—"}</p></div>
                  </div>
                  <p className={`text-[11px] mt-2 ${t.textSubtle}`}>
                    {profile.acceptingNewOffers ? "Accepte les offres automatiques." : "Offres automatiques en pause (préférence du chauffeur)."}
                  </p>
                </div>
              )}

              {/* Avis — moved out of the inline body into ReviewModal (Star icon above). */}

              {adminSlot}
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>

    <AvailabilityModal
      open={availabilityOpen}
      onClose={() => setAvailabilityOpen(false)}
      targetName={driver.name}
      weeklyHours={profile?.weeklyHours ?? null}
      isDark={isDark}
      accentColor="blue"
      noScheduleHint="Ce chauffeur n'a pas encore configuré ses disponibilités."
    />

    <MarketingPortfolioAlbumModal
      open={albumOpen}
      onClose={() => setAlbumOpen(false)}
      images={profile?.portfolioImages ?? []}
      initialIndex={albumIndex}
      providerName={driver.name}
    />

    {/* Reviews are only ever submitted elsewhere (after a completed delivery),
        so canReview=false — list only, same view-only pattern already used by
        e.g. academy-profile-modal.tsx's own ReviewModal usage. */}
    <ReviewModal
      open={reviewsOpen}
      onClose={() => setReviewsOpen(false)}
      targetName={driver.name}
      reviewTypeLabel="Avis sur le chauffeur"
      existingReviews={reviews}
      myReview={null}
      canReview={false}
      onSubmit={() => {}}
      isSubmitting={false}
    />

    <FlashPreviewModal
      open={flashOpen}
      onClose={() => setFlashOpen(false)}
      name={driver.name}
      typeLabel="Chauffeur"
      flashImageUrl={flashImageUrl}
      profileImageUrl={driver.profileImageUrl}
      accentBgClass="bg-blue-600"
    />
    </>
  );
}
