import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Heart, X, ChevronRight, GraduationCap, Zap, SlidersHorizontal, Check, Info, MapPin, Star, Award } from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import type { AcademyCourseCard } from "@/hooks/use-barista-academy";
import { getAvatarUrl } from "@/lib/avatar";

// Fast Search — mirrors BaristaFastSearch/MarketingFastSearch exactly: same
// visual language/interaction, own state, own real data source (the same
// /academy courses list passed in — no separate copy). Favorite state reuses
// the exact same useFavorites store as /academy and the Favorites modal — a
// change here updates everywhere instantly.
export interface AcademyFastSearchProps {
  open: boolean;
  onClose: () => void;
  courses: AcademyCourseCard[];
  onEnroll: (course: AcademyCourseCard) => void;
  onOpenDetail: (course: AcademyCourseCard) => void;
}

export function AcademyFastSearch({ open, onClose, courses, onEnroll, onOpenDetail }: AcademyFastSearchProps) {
  const [idx, setIdx] = useState(0);
  const [heartAnim, setHeartAnim] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pendingLevel, setPendingLevel] = useState("");
  const [pendingCert, setPendingCert] = useState("");
  const [activeLevel, setActiveLevel] = useState("");
  const [activeCert, setActiveCert] = useState("");

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      if (activeLevel && c.level !== activeLevel) return false;
      if (activeCert === "true" && !c.hasCertification) return false;
      if (activeCert === "false" && c.hasCertification) return false;
      return true;
    });
  }, [courses, activeLevel, activeCert]);

  useEffect(() => { setIdx(0); setHeartAnim(false); }, [filtered.length, open]);

  const current = filtered[idx] ?? null;

  const faved = useFavorites((s) => (current ? !!s.academy[current.id] : false));
  const toggleAcademy = useFavorites((s) => s.toggleAcademy);

  const triggerFavorite = useCallback(() => {
    if (!current) return;
    toggleAcademy({
      id: current.id, title: current.title, provider: current.academyName, duration: current.duration,
      rating: current.rating / 10, price: current.priceInCents, level: current.level,
      location: current.location || current.academyLocation, hasCertification: current.hasCertification,
      imageUrl: current.imageUrl ?? current.academyProfileImageUrl,
    });
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 800);
  }, [current, toggleAcademy]);

  const goNext = useCallback(() => setIdx((i) => (i + 1) % Math.max(filtered.length, 1)), [filtered.length]);
  const goPrev = useCallback(() => setIdx((i) => (i === 0 ? Math.max(filtered.length - 1, 0) : i - 1)), [filtered.length]);

  const openFilter = () => { setPendingLevel(activeLevel); setPendingCert(activeCert); setFilterOpen(true); };
  const applyFilter = () => { setActiveLevel(pendingLevel); setActiveCert(pendingCert); setFilterOpen(false); };
  const hasActiveFilter = !!(activeLevel || activeCert);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 border-0 w-[92vw] max-w-lg h-[90vh] rounded-3xl bg-black overflow-hidden">
        <div className="relative w-full h-full flex flex-col select-none overflow-hidden">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 pt-4 pb-3 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400 fill-indigo-400" />
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
              <GraduationCap className="w-16 h-16 text-gray-600" />
              <p className="text-white font-semibold">Aucune formation ne correspond à ce filtre</p>
              <button onClick={openFilter} className="px-5 py-2.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-semibold">
                Changer le filtre
              </button>
            </div>
          ) : (
            <div className="relative flex-1 bg-gray-900 overflow-hidden">
              <img
                key={idx}
                src={getAvatarUrl({ profileImageUrl: current!.imageUrl || current!.academyProfileImageUrl })}
                alt={current!.title}
                className="w-full h-full object-cover"
              />

              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

              <div className="absolute inset-x-0 bottom-0 px-5 pb-6 pointer-events-none">
                <div className="flex items-center gap-2 mb-1.5">
                  {current!.hasCertification && (
                    <span className="backdrop-blur-sm text-amber-900 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400/90 flex items-center gap-1">
                      <Award className="w-3 h-3" /> Certifié
                    </span>
                  )}
                  <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-300 text-amber-300" /> {(current!.rating / 10).toFixed(1)}
                  </span>
                </div>
                <h2 className="text-white font-bold text-xl leading-tight mb-1" data-testid="text-fastsearch-name">{current!.title}</h2>
                <p className="text-white/70 text-xs mb-2">{current!.academyName}</p>
                {(current!.location || current!.academyLocation) && (
                  <p className="text-white/70 text-xs flex items-center gap-1 mb-2"><MapPin className="w-3 h-3" /> {current!.location || current!.academyLocation}</p>
                )}
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
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${hasActiveFilter ? "bg-indigo-500" : "bg-white/20 backdrop-blur-sm"}`}
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
                className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg transition-all active:scale-90"
                onClick={() => onEnroll(current)} data-testid="button-fastsearch-enroll" title="S'inscrire"
              >
                <GraduationCap className="w-4 h-4 text-white" />
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
                <h3 className="text-white font-bold text-base">Filtrer les formations</h3>
                <button onClick={() => setFilterOpen(false)} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="px-5 pb-5 space-y-4">
                <div>
                  <p className="text-gray-400 text-xs mb-2">Niveau</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setPendingLevel("")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!pendingLevel ? "bg-indigo-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                      {!pendingLevel && <Check className="w-3 h-3" />} Tous
                    </button>
                    {[["BEGINNER", "Débutant"], ["ADVANCED", "Avancé"], ["EXPERT", "Expert"]].map(([value, label]) => (
                      <button key={value} onClick={() => setPendingLevel(value)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${pendingLevel === value ? "bg-indigo-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                        {pendingLevel === value && <Check className="w-3 h-3" />} {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-2">Certification</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setPendingCert("")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!pendingCert ? "bg-indigo-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                      {!pendingCert && <Check className="w-3 h-3" />} Toutes
                    </button>
                    <button onClick={() => setPendingCert("true")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${pendingCert === "true" ? "bg-indigo-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                      {pendingCert === "true" && <Check className="w-3 h-3" />} Avec certification
                    </button>
                    <button onClick={() => setPendingCert("false")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${pendingCert === "false" ? "bg-indigo-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/15"}`}>
                      {pendingCert === "false" && <Check className="w-3 h-3" />} Sans certification
                    </button>
                  </div>
                </div>
                <button onClick={applyFilter} className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold rounded-2xl transition-colors active:scale-[.98]">
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
