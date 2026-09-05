import { useState } from "react";
import { useThemeStore } from "@/store/theme-store";
import { useDeliveries } from "@/hooks/use-deliveries";
import { useDriverReviews, VEHICLE_TYPE_LABELS, type DeliveryVehicleType } from "@/hooks/use-delivery-ecosystem";
import { useDriverDetails } from "@/hooks/use-driver-profile";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MapPin, Clock, Truck, Mail, Phone, Award, Package, Building2, Store, X } from "lucide-react";
import { WEEKLY_DAY_DEFS } from "@/lib/weekly-hours";
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

function DriverAvailabilityModal({
  open, onClose, driverName, weeklyHours, isDark,
}: {
  open: boolean;
  onClose: () => void;
  driverName: string;
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
  const rowToday = dk ? "bg-blue-500/15 border-blue-500/30" : "bg-blue-50 border-blue-200";
  const timeColor = dk ? "text-gray-300" : "text-gray-700";
  const closedColor = dk ? "text-red-400" : "text-red-500";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Disponibilité — {driverName}</DialogTitle></VisuallyHidden>
        <div className={`flex flex-col max-h-[88vh] overflow-hidden transition-colors duration-200 ${bg}`}>
          <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={onClose} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}>
                <X className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight leading-tight ${textPrimary}`}>{driverName}</span>
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
                        <span className={`text-[13px] font-medium ${isToday ? (dk ? "text-blue-400" : "text-blue-600") : textPrimary}`}>{label}</span>
                        {isToday && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${dk ? "bg-blue-500/30 text-blue-300" : "bg-blue-100 text-blue-700"}`}>Today</span>}
                      </div>
                      {day?.closed ? (
                        <span className={`text-[12px] font-semibold ${closedColor}`}>Closed</span>
                      ) : day ? (
                        <span className={`text-[13px] font-medium tabular-nums ${isToday ? (dk ? "text-blue-300" : "text-blue-700") : timeColor}`}>{day.open}&thinsp;–&thinsp;{day.close}</span>
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

// ONE reusable Chauffeur details modal (Part 13/39-40) — used identically by
// Supplier → Delivery → Chauffeurs (driver-roster-view.tsx), Espace Livraison
// → Business → Chauffeurs (same component), Admin → Delivery → Chauffeurs,
// and the Driver's own Eye preview (Business → Profil). Same visual family as
// barista-detail-modal.tsx/AgentDetailModal/DeliveryCompanyDetailModal. Purely
// informational (no Favorite/Report/Message/Recruit actions exist for a
// Driver anywhere in the platform today — nothing to gate behind a readOnly
// flag, so self-preview is automatically safe by construction) — the only
// interactive element is the Disponibilité icon, which is real data in every
// context including self-preview.
export function DriverDetailModal({
  driver, open, onClose,
}: {
  driver: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);
  const { data, isLoading } = useDriverDetails(driver?.id ?? null);
  const { data: deliveries = [] } = useDeliveries();
  const { data: reviews = [] } = useDriverReviews(driver?.id ?? null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  if (!driver) return null;

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
      <DialogContent className={`sm:max-w-2xl rounded-2xl border-0 shadow-2xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>{driver.name}</DialogTitle></VisuallyHidden>
        {isLoading || !profile ? (
          <div className="p-6 space-y-4">
            <Skeleton className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-40 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
          </div>
        ) : (
          <div className="flex flex-col">
            <div className={`w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={getAvatarUrl(driver as any)} alt={driver.name} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-blue-600 to-indigo-700">
                  <span className="text-white font-bold text-6xl">{driver.name.charAt(0).toUpperCase()}</span>
                </AvatarFallback>
              </Avatar>
              <div className="absolute top-3 right-3 flex gap-2">
                <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={onClose} data-testid="button-close-driver-modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
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
                  <div className="min-w-0"><p className={`text-[11px] ${t.textSubtle}`}>Email</p><p className={`font-medium truncate ${t.textPrimary}`}>{driver.email}</p></div>
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

              {reviews.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Avis ({reviews.length})</p>
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
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <DriverAvailabilityModal
      open={availabilityOpen}
      onClose={() => setAvailabilityOpen(false)}
      driverName={driver.name}
      weeklyHours={profile?.weeklyHours ?? null}
      isDark={isDark}
    />
    </>
  );
}
