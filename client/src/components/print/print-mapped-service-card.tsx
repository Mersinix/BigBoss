import { Clock, Heart, Package, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { useFormatCurrency } from "@/hooks/use-currency";

// Single shared presentational card for a mapped Print SERVICE (catalog item), used
// identically by both Coffee Owner /print (one card per active service, across every
// printer) and the Print Store Details page (/print/stores/:printerId, one card per
// that printer's own active services) — mirrors MarketingMappedServiceCard's exact
// visual architecture (Marketing is the visual reference, Print keeps its own
// terminology/content/categories) — docs/print_marketing_design_synchronization_audit.md.
// Both callers normalize their own data shape into this one prop shape rather than
// each page keeping a separate, drifting card implementation.

export type PrintMappedServiceCardProps = {
  id: number;
  name: string;
  category: string; // real, admin-managed Print category — shown only when non-empty
  description: string;
  imageUrl: string | null;
  priceInCents: number;
  unit: string;
  minQuantity: number;
  productionTimeDays: number;
  printerName: string;
  printerImageUrl: string | null;
  printerIsAvailable: boolean;
  rating: number; // x10 convention (47 = 4.7)
  reviewCount: number;
  categoryIcon: string;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
  isDark: boolean;
};

export function PrintMappedServiceCard({
  id, name, category, description, imageUrl, priceInCents, unit, minQuantity, productionTimeDays,
  printerName, printerImageUrl, printerIsAvailable, rating, reviewCount, categoryIcon,
  isFavorited, onToggleFavorite, onClick, isDark,
}: PrintMappedServiceCardProps) {
  const fmt = useFormatCurrency();
  const cardBg = isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100";
  const textPrimary = isDark ? "text-white" : "text-gray-900";
  const textSubtle = isDark ? "text-gray-500" : "text-gray-400";
  const border = isDark ? "border-gray-700/60" : "border-gray-100";

  return (
    <div
      data-testid={`card-mapped-print-service-${id}`}
      onClick={onClick}
      className={`group relative rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col cursor-pointer ${cardBg}`}
    >
      <div className={`relative aspect-[4/3] overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <Avatar className="w-full h-full rounded-none">
            <AvatarImage src={getAvatarUrl({ profileImageUrl: printerImageUrl })} alt={printerName} className="object-cover" />
            <AvatarFallback className="rounded-none bg-blue-100 text-blue-700 font-bold text-2xl">
              <Package className="w-8 h-8" />
            </AvatarFallback>
          </Avatar>
        )}

        {/* Printer name — top-left badge over the image */}
        <span className="absolute top-2 left-2 max-w-[62%] truncate bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
          {printerName}
        </span>

        {/* Favorite — top-right, same mapped-marketplace favorite style/behavior everywhere */}
        <button
          className={`absolute top-2 right-2 z-10 w-6 h-6 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform ${isDark ? "bg-gray-700/90" : "bg-white/90"}`}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          data-testid={`button-fav-print-${id}`}
        >
          <Heart className={`w-3 h-3 transition-colors ${isFavorited ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>

        {/* Availability — bottom-left dot over the image, real printerIsAvailable state */}
        <span
          className={`absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full border-2 border-white ${printerIsAvailable ? "bg-green-500" : "bg-gray-300"}`}
          title={printerIsAvailable ? "Disponible" : "Indisponible"}
        />

        {/* Category — bottom-right badge over the image, real admin-managed Print category/icon */}
        {category && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
            <span className="text-xs leading-none">{categoryIcon}</span>{category}
          </span>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors ${textPrimary}`}>
          {name}
        </h3>
        {description && <p className={`text-xs line-clamp-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{description}</p>}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`flex items-center gap-1 text-[10px] ${textSubtle}`}>
            <Clock className="w-2.5 h-2.5" />{productionTimeDays}j
          </span>
          {minQuantity > 1 && <span className={`text-[10px] ${textSubtle}`}>Min. {minQuantity} {unit}s</span>}
        </div>

        <div className={`mt-auto pt-2 border-t ${border}`}>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[10px] ${textSubtle}`}>À partir de</p>
            <span className="flex items-center gap-1 shrink-0">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className={`text-[11px] font-semibold ${textPrimary}`}>{(rating / 10).toFixed(1)}</span>
              <span className="text-[11px] text-gray-400">({reviewCount})</span>
            </span>
          </div>
          <p className="font-bold text-sm text-blue-600">{fmt(priceInCents)}<span className={`text-[10px] font-normal ${textSubtle}`}>/{unit}</span></p>
        </div>
      </div>
    </div>
  );
}
