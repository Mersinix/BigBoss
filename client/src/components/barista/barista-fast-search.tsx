import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Heart, X, ChevronRight, Users, Zap, SlidersHorizontal, Check, Info, MapPin, Star } from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import type { BaristaMarketplaceCard } from "@/hooks/use-barista-marketplace";

// Fast Search — visually inspired by the Shop hero's Flash Mode
// (client/src/components/flash-mode.tsx) per Part 30, but a fully independent
// component: its own state, own data source (the same /barista profiles list —
// no separate copy per Part 32), no shared code with Flash Mode besides the
// look. Favorite state reuses the exact same useFavorites store as /barista and
// the Favorites modal (Part 33) — a change here updates everywhere instantly.

export interface BaristaFastSearchProps {
  open: boolean;
  onClose: () => void;
  baristas: BaristaMarketplaceCard[];
  onRecruit: (barista: BaristaMarketplaceCard) => void;
  onOpenDetail: (barista: BaristaMarketplaceCard) => void;
}

export function BaristaFastSearch({ open, onClose, baristas, onRecruit, onOpenDetail }: BaristaFastSearchProps) {
  const [idx, setIdx] = useState(0);
  const [heartAnim, setHeartAnim] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pendingSkill, setPendingSkill] = useState("");
  const [pendingLocation, setPendingLocation] = useState("");
  const [activeSkill, setActiveSkill] = useState("");
  const [activeLocation, setActiveLocation] = useState("");

  const allSkills = useMemo(() => Array.from(new Set(baristas.flatMap((b) => b.skills))).sort(), [baristas]);
  const allLocations = useMemo(() => Array.from(new Set(baristas.map((b) => b.location).filter(Boolean))).sort(), [baristas]);

  const filtered = useMemo(() => {
    return baristas.filter((b) => {
      if (activeSkill && !b.skills.some((s) => s.toLowerCase() === activeSkill.toLowerCase())) return false;
      if (activeLocation && b.location.toLowerCase() !== activeLocation.toLowerCase()) return false;
      return true;
    });
  }, [baristas, activeSkill, activeLocation]);

  useEffect(() => { setIdx(0); setHeartAnim(false); }, [filtered.length, open]);

  const current = filtered[idx] ?? null;

  const faved = useFavorites((s) => (current ? !!s.baristaMarket[current.userId] : false));
  const toggleBaristaMarket = useFavorites((s) => s.toggleBaristaMarket);

  const triggerFavorite = useCallback(() => {
    if (!current) return;
    toggleBaristaMarket({
      id: current.userId, name: current.name, initials: current.initials, skills: current.skills,
      location: current.location, rating: current.rating / 10, available: current.available,
      profileImageUrl: current.profileImageUrl,
    });
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 800);
  }, [current, toggleBaristaMarket]);

  const goNext = useCallback(() => setIdx((i) => (i + 1) % Math.max(filtered.length, 1)), [filtered.length]);
  const goPrev = useCallback(() => setIdx((i) => (i === 0 ? Math.max(filtered.length - 1, 0) : i - 1)), [filtered.length]);

  const openFilter = () => { setPendingSkill(activeSkill); setPendingLocation(activeLocation); setFilterOpen(true); };
  const applyFilter = () => { setActiveSkill(pendingSkill); setActiveLocation(pendingLocation); setFilterOpen(false); };
  const hasActiveFilter = !!(activeSkill || activeLocation);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 border-0 w-[92vw] max-w-lg h-[90vh] rounded-3xl bg-black overflow-hidden">
        <div className="relative w-full h-full flex flex-col select-none overflow-hidden">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 pt-4 pb-3 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-green-400 fill-green-400" />
              <span className="text-white font-bold text-sm">Fast Search</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white/60 text-xs">{filtered.length > 0 ? `${idx + 1} / ${filtered.length}` : "0 / 0"}</span>
              <button className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center" onClick={onClose} data-testid="button-fastsearch-close">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 60px)" }}>
            {filtered.map((_, i) => (
              <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
                <div className={`h-full bg-white transition-all duration-300 ${i <= idx ? "w-full" : "w-0"}`} />
              </div>
            ))}
          </div>

          {/* Main image / info area */}
          {filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <Users className="w-16 h-16 text-gray-600" />
              <p className="text-white font-semibold">Aucun barista ne correspond à ce filtre</p>
              <button onClick={openFilter} className="px-5 py-2.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-semibold">
                Changer le filtre
              </button>
            </div>
          ) : (
            <div className="relative flex-1 bg-gray-900 overflow-hidden">
              {/* Same Avatar/AvatarImage/AvatarFallback pattern (and the same
                  getAvatarUrl default) used everywhere else in the app — real
                  profile picture when set, existing fallback otherwise. */}
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage key={idx} src={getAvatarUrl(current as any)} alt={current!.name} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-green-900 to-emerald-950">
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
                <h2 className="text-white font-bold text-xl leading-tight mb-1" data-testid="text-fastsearch-name">{current!.name}</h2>
                {current!.location && (
                  <p className="text-white/70 text-xs flex items-center gap-1 mb-2"><MapPin className="w-3 h-3" /> {current!.location}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {current!.skills.slice(0, 5).map((s) => (
                    <span key={s} className="bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">{s}</span>
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

          {/* Floating action buttons */}
          <div className="absolute right-4 bottom-24 flex flex-col gap-4 z-20">
            <button
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${hasActiveFilter ? "bg-green-500" : "bg-white/20 backdrop-blur-sm"}`}
              onClick={openFilter} data-testid="button-fastsearch-filter" title="Filtrer"
            >
              <SlidersHorizontal className="w-5 h-5 text-white" />
            </button>
            {current && (
              <button
                className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg transition-all active:scale-90"
                onClick={() => onOpenDetail(current)} data-testid="button-fastsearch-info" title="Détails"
              >
                <Info className="w-5 h-5 text-white" />
              </button>
            )}
            {current && (
              <button
                className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${faved ? "bg-rose-500" : "bg-white/20 backdrop-blur-sm"}`}
                onClick={triggerFavorite} data-testid="button-fastsearch-favorite"
              >
                <Heart className={`w-5 h-5 transition-colors ${faved ? "fill-white text-white" : "text-white"}`} />
              </button>
            )}
            {current && (
              <button
                className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shadow-lg transition-all active:scale-90 disabled:opacity-40"
                onClick={() => onRecruit(current)} disabled={!current.available} data-testid="button-fastsearch-recruit" title="Recruter"
              >
                <Users className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          {/* Prev/Next */}
          <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-4 z-30 pointer-events-none">
            <button onClick={goPrev} className="pointer-events-auto w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center active:scale-95 transition" data-testid="button-fastsearch-prev">
              <ChevronRight className="w-6 h-6 text-white rotate-180" />
            </button>
            <button onClick={goNext} className="pointer-events-auto w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center active:scale-95 transition" data-testid="button-fastsearch-next">
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Filter panel */}
          {filterOpen && <div className="absolute inset-0 z-[55]" onClick={() => setFilterOpen(false)} />}
          <div className={`absolute inset-x-0 top-0 z-[60] transition-transform duration-300 ease-in-out ${filterOpen ? "translate-y-0" : "-translate-y-full"}`}>
            <div className="bg-gray-900/95 backdrop-blur-xl rounded-b-3xl shadow-2xl">
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <h3 className="text-white font-bold text-base">Filtrer les baristas</h3>
                <button onClick={() => setFilterOpen(false)} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div>
                  <p className="text-gray-400 text-xs mb-2">Compétence</p>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    <button onClick={() => setPendingSkill("")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!pendingSkill ? "bg-green-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                      {!pendingSkill && <Check className="w-3 h-3" />} Toutes
                    </button>
                    {allSkills.map((s) => (
                      <button key={s} onClick={() => setPendingSkill(s)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${pendingSkill === s ? "bg-green-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                        {pendingSkill === s && <Check className="w-3 h-3" />} {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-2">Ville</p>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    <button onClick={() => setPendingLocation("")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!pendingLocation ? "bg-green-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                      {!pendingLocation && <Check className="w-3 h-3" />} Toutes
                    </button>
                    {allLocations.map((l) => (
                      <button key={l} onClick={() => setPendingLocation(l)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${pendingLocation === l ? "bg-green-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                        {pendingLocation === l && <Check className="w-3 h-3" />} {l}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={applyFilter} className="w-full py-3 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-2xl transition-colors active:scale-[.98]">
                  Appliquer
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
