import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Heart, X, ChevronRight, Wrench, Zap, SlidersHorizontal, Check, Info, MapPin, Star } from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import type { MaintenanceMarketplaceCard } from "@shared/schema";

// Maintenance equivalent of BaristaFastSearch (Parts 20-21) — own component,
// own data source (the same /maintenance/profiles list the grid uses — no
// separate copy), Maintenance fields only. Favorite state reuses the exact
// same useFavorites().maintenance store as the grid/Favorites modal.
export interface MaintenanceFastSearchProps {
  open: boolean;
  onClose: () => void;
  providers: MaintenanceMarketplaceCard[];
  onOpenDetail: (agent: MaintenanceMarketplaceCard) => void;
}

export function MaintenanceFastSearch({ open, onClose, providers, onOpenDetail }: MaintenanceFastSearchProps) {
  const [idx, setIdx] = useState(0);
  const [heartAnim, setHeartAnim] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pendingCategory, setPendingCategory] = useState("");
  const [pendingLocation, setPendingLocation] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeLocation, setActiveLocation] = useState("");

  const allCategories = useMemo(() => Array.from(new Set(providers.flatMap((p) => p.categories))).sort(), [providers]);
  const allLocations = useMemo(() => Array.from(new Set(providers.map((p) => p.location).filter(Boolean))).sort(), [providers]);

  const filtered = useMemo(() => providers.filter((p) => {
    if (activeCategory && !p.categories.some((c) => c.toLowerCase() === activeCategory.toLowerCase())) return false;
    if (activeLocation && p.location.toLowerCase() !== activeLocation.toLowerCase()) return false;
    return true;
  }), [providers, activeCategory, activeLocation]);

  useEffect(() => { setIdx(0); setHeartAnim(false); }, [filtered.length, open]);
  const current = filtered[idx] ?? null;

  const faved = useFavorites((s) => (current ? !!s.maintenance[current.userId] : false));
  const toggleMaintenance = useFavorites((s) => s.toggleMaintenance);

  const triggerFavorite = useCallback(() => {
    if (!current) return;
    toggleMaintenance({
      id: current.userId, name: current.name, initials: current.initials, specialty: current.specialty,
      categories: current.categories, skills: current.skills, location: current.location,
      rating: current.rating / 10, available: current.available, profileImageUrl: current.profileImageUrl,
    });
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 800);
  }, [current, toggleMaintenance]);

  const goNext = useCallback(() => setIdx((i) => (i + 1) % Math.max(filtered.length, 1)), [filtered.length]);
  const goPrev = useCallback(() => setIdx((i) => (i === 0 ? Math.max(filtered.length - 1, 0) : i - 1)), [filtered.length]);

  const openFilter = () => { setPendingCategory(activeCategory); setPendingLocation(activeLocation); setFilterOpen(true); };
  const applyFilter = () => { setActiveCategory(pendingCategory); setActiveLocation(pendingLocation); setFilterOpen(false); };
  const hasActiveFilter = !!(activeCategory || activeLocation);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 border-0 w-[92vw] max-w-lg h-[90vh] rounded-3xl bg-black overflow-hidden">
        <div className="relative w-full h-full flex flex-col select-none overflow-hidden">
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 pt-4 pb-3 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-400 fill-orange-400" />
              <span className="text-white font-bold text-sm">Fast Search</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white/60 text-xs">{filtered.length > 0 ? `${idx + 1} / ${filtered.length}` : "0 / 0"}</span>
              <button className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center" onClick={onClose} data-testid="button-maintenance-fastsearch-close">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 60px)" }}>
            {filtered.map((_, i) => (
              <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
                <div className={`h-full bg-white transition-all duration-300 ${i <= idx ? "w-full" : "w-0"}`} />
              </div>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <Wrench className="w-16 h-16 text-gray-600" />
              <p className="text-white font-semibold">Aucun professionnel ne correspond à ce filtre</p>
              <button onClick={openFilter} className="px-5 py-2.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-semibold">Changer le filtre</button>
            </div>
          ) : (
            <div className="relative flex-1 bg-gray-900 overflow-hidden">
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage key={idx} src={getAvatarUrl(current as any)} alt={current!.name} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-orange-900 to-amber-950">
                  <span className="text-white/80 font-bold text-6xl">{current!.initials}</span>
                </AvatarFallback>
              </Avatar>

              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

              <div className="absolute inset-x-0 bottom-0 px-5 pb-6 pointer-events-none">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full ${current!.available ? "bg-green-500/80" : "bg-gray-500/80"}`}>
                    {current!.available ? "Disponible" : "Indisponible"}
                  </span>
                  <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-300 text-amber-300" /> {(current!.rating / 10).toFixed(1)}
                  </span>
                </div>
                <h2 className="text-white font-bold text-xl leading-tight mb-1" data-testid="text-maintenance-fastsearch-name">{current!.name}</h2>
                <p className="text-white/70 text-xs mb-1">{current!.jobTitle}</p>
                {current!.location && <p className="text-white/70 text-xs flex items-center gap-1 mb-2"><MapPin className="w-3 h-3" /> {current!.location}</p>}
                <div className="flex flex-wrap gap-2">
                  {current!.categories.slice(0, 5).map((c) => (
                    <span key={c} className="bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">{c}</span>
                  ))}
                </div>
              </div>

              {heartAnim && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Heart className="w-24 h-24 fill-rose-500 text-rose-500 animate-ping opacity-80" />
                </div>
              )}
            </div>
          )}

          <div className="absolute right-4 bottom-24 flex flex-col gap-4 z-20">
            <button
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${hasActiveFilter ? "bg-orange-500" : "bg-white/20 backdrop-blur-sm"}`}
              onClick={openFilter} data-testid="button-maintenance-fastsearch-filter" title="Filtrer"
            >
              <SlidersHorizontal className="w-5 h-5 text-white" />
            </button>
            {current && (
              <button
                className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg transition-all active:scale-90"
                onClick={() => onOpenDetail(current)} data-testid="button-maintenance-fastsearch-info" title="Détails / Réserver"
              >
                <Info className="w-5 h-5 text-white" />
              </button>
            )}
            {current && (
              <button
                className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${faved ? "bg-rose-500" : "bg-white/20 backdrop-blur-sm"}`}
                onClick={triggerFavorite} data-testid="button-maintenance-fastsearch-favorite"
              >
                <Heart className={`w-5 h-5 transition-colors ${faved ? "fill-white text-white" : "text-white"}`} />
              </button>
            )}
          </div>

          <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-4 z-30 pointer-events-none">
            <button onClick={goPrev} className="pointer-events-auto w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center active:scale-95 transition" data-testid="button-maintenance-fastsearch-prev">
              <ChevronRight className="w-6 h-6 text-white rotate-180" />
            </button>
            <button onClick={goNext} className="pointer-events-auto w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center active:scale-95 transition" data-testid="button-maintenance-fastsearch-next">
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          </div>

          {filterOpen && <div className="absolute inset-0 z-[55]" onClick={() => setFilterOpen(false)} />}
          <div className={`absolute inset-x-0 top-0 z-[60] transition-transform duration-300 ease-in-out ${filterOpen ? "translate-y-0" : "-translate-y-full"}`}>
            <div className="bg-gray-900/95 backdrop-blur-xl rounded-b-3xl shadow-2xl">
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <h3 className="text-white font-bold text-base">Filtrer les professionnels</h3>
                <button onClick={() => setFilterOpen(false)} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div>
                  <p className="text-gray-400 text-xs mb-2">Catégorie</p>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    <button onClick={() => setPendingCategory("")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!pendingCategory ? "bg-orange-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                      {!pendingCategory && <Check className="w-3 h-3" />} Toutes
                    </button>
                    {allCategories.map((c) => (
                      <button key={c} onClick={() => setPendingCategory(c)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${pendingCategory === c ? "bg-orange-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                        {pendingCategory === c && <Check className="w-3 h-3" />} {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-2">Ville</p>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    <button onClick={() => setPendingLocation("")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!pendingLocation ? "bg-orange-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                      {!pendingLocation && <Check className="w-3 h-3" />} Toutes
                    </button>
                    {allLocations.map((l) => (
                      <button key={l} onClick={() => setPendingLocation(l)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${pendingLocation === l ? "bg-orange-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                        {pendingLocation === l && <Check className="w-3 h-3" />} {l}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={applyFilter} className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-2xl transition-colors active:scale-[.98]">Appliquer</button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
