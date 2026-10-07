import { Heart, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFormatCurrency } from "@/hooks/use-currency";

// Single shared presentational card for a mapped Marketing SERVICE, used
// identically by both Coffee Owner /marketing (one card per published service,
// across every agency) and the Marketing Store Details page
// (/marketing/stores/:agencyId, one card per that agency's own published
// services) — docs/marketing_cards_final_layout_synchronization_audit.md.
// Both callers normalize their own data shape (MarketingServiceCard vs. the
// agency `card` + MarketingService pair) into this one prop shape rather than
// each page keeping a separate, drifting card implementation.

export type MarketingMappedServiceCardProps = {
  id: number;
  // The service's own real title — callers pass `service.title?.trim() || service.category`
  // so a pre-existing service without a title ever set still shows something real, never blank.
  title: string;
  category: string;
  description: string;
  imageUrl: string | null;
  startingPriceInCents: number;
  agencyName: string;
  agencyProfileImageUrl: string | null;
  agencyIsAvailable: boolean;
  rating: number; // x10 convention (47 = 4.7), same as everywhere else in this codebase
  reviewCount: number;
  categoryIcon: string;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
  isDark: boolean;
};

export function MarketingMappedServiceCard({
  id, title, category, description, imageUrl, startingPriceInCents, agencyName, agencyProfileImageUrl,
  agencyIsAvailable, rating, reviewCount, categoryIcon, isFavorited, onToggleFavorite, onClick, isDark,
}: MarketingMappedServiceCardProps) {
  const fmt = useFormatCurrency();
  const cardBg = isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100";
  const textPrimary = isDark ? "text-white" : "text-gray-900";
  const textSubtle = isDark ? "text-gray-500" : "text-gray-400";
  const border = isDark ? "border-gray-700/60" : "border-gray-100";

  return (
    <div
      data-testid={`card-mapped-marketing-service-${id}`}
      onClick={onClick}
      className={`group relative rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col cursor-pointer ${cardBg}`}
    >
      <div className={`relative aspect-[4/3] overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <Avatar className="w-full h-full rounded-none">
            <AvatarImage src={agencyProfileImageUrl ?? undefined} alt={agencyName} className="object-cover" />
            <AvatarFallback className="rounded-none bg-purple-100 text-purple-700 font-bold text-2xl">
              {agencyName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Agency name — top-left badge over the image */}
        <span className="absolute top-2 left-2 max-w-[62%] truncate bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
          {agencyName}
        </span>

        {/* Favorite — top-right, same mapped-marketplace favorite style/behavior everywhere */}
        <button
          className={`absolute top-2 right-2 z-10 w-6 h-6 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform ${isDark ? "bg-gray-700/90" : "bg-white/90"}`}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          data-testid="button-fav-mapped-marketing-service"
        >
          <Heart className={`w-3 h-3 transition-colors ${isFavorited ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>

        {/* Availability — bottom-left dot over the image, real agencyIsAvailable state */}
        <span
          className={`absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full border-2 border-white ${agencyIsAvailable ? "bg-green-500" : "bg-gray-300"}`}
          title={agencyIsAvailable ? "Disponible" : "Indisponible"}
        />

        {/* Category — bottom-right badge over the image, same taxonomy icon as the filter strip */}
        <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
          <span className="text-xs leading-none">{categoryIcon}</span>{category}
        </span>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight truncate group-hover:text-purple-600 transition-colors ${textPrimary}`}>
          {title}
        </h3>
        {description && <p className={`text-xs line-clamp-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{description}</p>}

        <div className={`mt-auto pt-2 border-t ${border}`}>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[10px] ${textSubtle}`}>À partir de</p>
            <span className="flex items-center gap-1 shrink-0">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className={`text-[11px] font-semibold ${textPrimary}`}>{(rating / 10).toFixed(1)}</span>
              <span className="text-[11px] text-gray-400">({reviewCount})</span>
            </span>
          </div>
          <p className="font-bold text-sm text-purple-600">{fmt(startingPriceInCents)}</p>
        </div>
      </div>
    </div>
  );
}
