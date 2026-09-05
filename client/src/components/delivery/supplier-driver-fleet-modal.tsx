import { useMemo } from "react";
import { useThemeStore } from "@/store/theme-store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MapPin, Truck, Users as UsersIcon, X, Store } from "lucide-react";
import type { DeliveryWithDetails, User } from "@shared/schema";

// Same theming mechanism as delivery-company-detail-modal.tsx / driver-detail-modal.tsx
// (this app's dark mode branches literal Tailwind classes off a boolean, `.dark` is
// never added to the DOM) — reused rather than reinvented, so this modal looks like
// the same family everywhere it's opened from.
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

// Admin → Delivery → Chauffeurs fournisseurs: a Supplier running its own driver fleet
// has no marketplace/profile system (Suppliers aren't a browsable service the way
// Delivery Companies/Barista/Maintenance are) — so unlike DeliveryCompanyDetailModal,
// this is a lightweight, admin-only, read-only view built entirely from data the
// admin page has already fetched (/api/admin/users + /api/deliveries), no new route
// or duplicate data source. Same visual family (header banner, badges, stat tiles,
// a real clickable Chauffeurs list) as every other details modal in the app.
export function SupplierDriverFleetModal({
  supplier, drivers, deliveries, open, onClose, onOpenDriver,
}: {
  supplier: User | null;
  drivers: User[];
  deliveries: DeliveryWithDetails[];
  open: boolean;
  onClose: () => void;
  onOpenDriver: (driverId: number) => void;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);

  const driverStats = useMemo(() => {
    const map = new Map<number, { active: number; completed: number }>();
    for (const d of drivers) {
      const own = deliveries.filter((del) => del.driverId === d.id);
      map.set(d.id, {
        active: own.filter((del) => ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(del.status)).length,
        completed: own.filter((del) => del.status === "DELIVERED").length,
      });
    }
    return map;
  }, [drivers, deliveries]);

  const totalActive = Array.from(driverStats.values()).reduce((s, v) => s + v.active, 0);
  const totalCompleted = Array.from(driverStats.values()).reduce((s, v) => s + v.completed, 0);
  const totalDeliveries = drivers.reduce((s, d) => s + deliveries.filter((del) => del.driverId === d.id).length, 0);

  if (!supplier) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`sm:max-w-2xl rounded-2xl border-0 shadow-2xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>{supplier.name}</DialogTitle></VisuallyHidden>
        <div className="flex flex-col">
          <div className={`w-full h-56 sm:h-64 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
            <Avatar className="w-full h-full rounded-none">
              <AvatarImage src={getAvatarUrl(supplier as any)} alt={supplier.name} className="object-cover" />
              <AvatarFallback className="rounded-none bg-gradient-to-br from-slate-600 to-slate-800">
                <Store className="w-16 h-16 text-white" />
              </AvatarFallback>
            </Avatar>
            <div className="absolute top-3 right-3 flex gap-2">
              <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={onClose} data-testid="button-close-supplier-fleet-modal">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            <div>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{supplier.name}</h2>
                <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"}`}>Fournisseur</Badge>
              </div>
              <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                <Badge variant="outline" className={isDark ? "border-gray-700 text-gray-300" : ""}>{supplier.status}</Badge>
                {supplier.locationAddress && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {supplier.locationAddress}</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className={`flex gap-2 p-3 rounded-xl ${t.sectionBg}`}>
                <Mail className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <div className="min-w-0"><p className={`text-[11px] ${t.textSubtle}`}>Email</p><p className={`font-medium truncate ${t.textPrimary}`}>{supplier.email}</p></div>
              </div>
              <div className={`flex gap-2 p-3 rounded-xl ${t.sectionBg}`}>
                <Phone className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <div className="min-w-0"><p className={`text-[11px] ${t.textSubtle}`}>Téléphone</p><p className={`font-medium truncate ${t.textPrimary}`}>{supplier.phone || "—"}</p></div>
              </div>
            </div>

            <div className={`${t.sectionBg} rounded-xl p-3`}>
              <h3 className={`text-xs font-semibold mb-2 flex items-center gap-1 ${t.textMuted}`}><Truck className="w-3.5 h-3.5" /> Livraisons</h3>
              <div className={`flex items-center gap-4 text-sm ${t.textPrimary}`}>
                <span>{totalActive} en cours</span>
                <span>{totalCompleted} terminée(s)</span>
                <span className={t.textMuted}>{totalDeliveries} au total</span>
              </div>
            </div>

            {/* Chauffeurs — the real fleet this Supplier operates directly (users.supplierId),
                clicking one opens the same shared DriverDetailModal used everywhere a driver
                is shown (Part 40's "map the drivers, click one → driver details"). */}
            <div>
              <h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><UsersIcon className="w-3.5 h-3.5" /> Chauffeurs ({drivers.length})</h3>
              {drivers.length === 0 ? (
                <p className={`text-xs ${t.textMuted}`}>Aucun chauffeur enregistré.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {drivers.map((d) => {
                    const stats = driverStats.get(d.id) ?? { active: 0, completed: 0 };
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => onOpenDriver(d.id)}
                        className={`flex items-center gap-2 p-2 rounded-lg text-left transition-colors hover:ring-1 hover:ring-slate-500 cursor-pointer ${t.sectionBg}`}
                        data-testid={`button-supplier-fleet-driver-${d.id}`}
                      >
                        <Avatar className="w-7 h-7 shrink-0">
                          <AvatarImage src={d.profileImageUrl ?? undefined} alt={d.name} />
                          <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">{d.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium truncate ${t.textPrimary}`}>{d.name}</p>
                          <p className={`text-[10px] ${stats.active > 0 ? "text-amber-500" : "text-green-600"}`}>{stats.active} en cours · {stats.completed} livrée(s)</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
