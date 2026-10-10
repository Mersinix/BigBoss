import { Award, Clock, Heart, GraduationCap, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { useFormatCurrency } from "@/hooks/use-currency";

// Single shared presentational card for a mapped Academy FORMATION (course), used
// identically by both Coffee Owner /academy (one card per published course, across
// every academy) and the Academy Store Details page (/academy/stores/:academyUserId,
// one card per that academy's own published courses) — mirrors
// MarketingMappedServiceCard's exact visual architecture (Marketing is the visual
// reference, Academy keeps its own terminology/content) —
// docs/academy_marketing_design_synchronization_audit.md. Both callers normalize
// their own data shape into this one prop shape rather than each page keeping a
// separate, drifting card implementation.

export type AcademyMappedCourseCardProps = {
  id: number;
  title: string;
  category: string; // real, free-text Academy category — shown only when non-empty, never fabricated
  description: string;
  imageUrl: string | null;
  priceInCents: number;
  academyName: string;
  academyProfileImageUrl: string | null;
  academyIsAvailable: boolean;
  rating: number; // x10 convention (47 = 4.7)
  reviewCount: number;
  levelLabel: string;
  levelColorClass: string;
  hasCertification: boolean;
  duration: string; // Academy-specific (e.g. "3 jours") — Marketing has no equivalent, kept here only
  isFavorited: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
  isDark: boolean;
  // Optional — omitted by Coffee Owner's own TrainingCard (no equivalent concept there),
  // so its appearance is unchanged. Barista Marketplace passes this to satisfy "a clear
  // indication when the barista is already enrolled" (analyse.md "Aligner Espace Barista
  // Marketplace → Académie sur Coffee Owner /academy").
  isEnrolled?: boolean;
};

export function AcademyMappedCourseCard({
  id, title, category, description, imageUrl, priceInCents, academyName, academyProfileImageUrl,
  academyIsAvailable, rating, reviewCount, levelLabel, levelColorClass, hasCertification, duration,
  isFavorited, onToggleFavorite, onClick, isDark, isEnrolled = false,
}: AcademyMappedCourseCardProps) {
  const fmt = useFormatCurrency();
  const cardBg = isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100";
  const textPrimary = isDark ? "text-white" : "text-gray-900";
  const textSubtle = isDark ? "text-gray-500" : "text-gray-400";
  const border = isDark ? "border-gray-700/60" : "border-gray-100";

  return (
    <div
      data-testid={`card-mapped-academy-course-${id}`}
      onClick={onClick}
      className={`group relative rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col cursor-pointer ${cardBg}`}
    >
      <div className={`relative aspect-[4/3] overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <Avatar className="w-full h-full rounded-none">
            <AvatarImage src={getAvatarUrl({ profileImageUrl: academyProfileImageUrl })} alt={academyName} className="object-cover" />
            <AvatarFallback className="rounded-none bg-indigo-100 text-indigo-700 font-bold text-2xl">
              <GraduationCap className="w-8 h-8" />
            </AvatarFallback>
          </Avatar>
        )}

        {/* Academy name — top-left badge over the image */}
        <span className="absolute top-2 left-2 max-w-[62%] truncate bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
          {academyName}
        </span>

        {/* Favorite — top-right, same mapped-marketplace favorite style/behavior everywhere */}
        <button
          className={`absolute top-2 right-2 z-10 w-6 h-6 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform ${isDark ? "bg-gray-700/90" : "bg-white/90"}`}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          data-testid={`button-fav-academy-${id}`}
        >
          <Heart className={`w-3 h-3 transition-colors ${isFavorited ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>

        {/* Availability — bottom-left dot over the image, real academyIsAvailable state */}
        <span
          className={`absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full border-2 border-white ${academyIsAvailable ? "bg-green-500" : "bg-gray-300"}`}
          title={academyIsAvailable ? "Disponible" : "Indisponible"}
        />

        {/* Category — bottom-right badge over the image, real Academy category (free text, no fake icon mapping) */}
        {category && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
            <GraduationCap className="w-3 h-3" />{category}
          </span>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight line-clamp-2 group-hover:text-indigo-600 transition-colors ${textPrimary}`}>
          {title}
        </h3>
        {description && <p className={`text-xs line-clamp-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{description}</p>}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${levelColorClass}`}>{levelLabel}</span>
          {hasCertification && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-400/90 text-amber-900">
              <Award className="w-2.5 h-2.5" /> Certifié
            </span>
          )}
          {duration && (
            <span className={`flex items-center gap-1 text-[10px] ${textSubtle}`}>
              <Clock className="w-2.5 h-2.5" />{duration}
            </span>
          )}
        </div>

        <div className={`mt-auto pt-2 border-t ${border}`}>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[10px] ${textSubtle}`}>Prix</p>
            <span className="flex items-center gap-1 shrink-0">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className={`text-[11px] font-semibold ${textPrimary}`}>{(rating / 10).toFixed(1)}</span>
              <span className="text-[11px] text-gray-400">({reviewCount})</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-sm text-indigo-600">{fmt(priceInCents)}</p>
            {isEnrolled && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isDark ? "bg-green-900/40 text-green-300" : "bg-green-100 text-green-700"}`}>
                Déjà inscrit
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
