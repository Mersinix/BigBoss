import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Clock, Phone, Globe, Image as ImageIcon, Eye } from "lucide-react";

export interface PublicProfilePreviewData {
  name: string;
  initials: string;
  profileImageUrl?: string | null;
  typeLabel?: string | null;
  rating?: number | null; // 0-5 scale
  reviewCount?: number | null;
  location?: string | null;
  description?: string | null;
  services?: string[];
  pricingLabel?: string | null;
  responseTime?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  portfolioImages?: string[];
  available?: boolean | null;
  visible?: boolean | null; // marketplaceVisible / isPublished
}

// Generic "what a Coffee Owner sees" preview, reused as the Profil Public tab
// content across every professional account (Barista, Academy, Maintenance,
// Printer, Marketing, Delivery, Driver). It renders exactly the fields the
// Coffee-Owner-facing marketplace card/detail modal already shows for that
// provider type — fed by each account's OWN already-fetched "my profile" data
// (same query the provider's own editor tab uses), so this preview always
// stays in sync with what's actually saved: no separate profile system, no
// fabricated fields. Fields the caller doesn't pass are simply omitted, never
// filled with placeholder content.
export function PublicProfilePreview({ data, accentTextClass, accentBgClass }: {
  data: PublicProfilePreviewData;
  // Full Tailwind class strings, passed whole (never interpolated) so
  // Tailwind's JIT scanner sees the literal classes — e.g.
  // accentTextClass="text-fuchsia-600 dark:text-fuchsia-400"
  // accentBgClass="bg-fuchsia-600 hover:bg-fuchsia-700"
  accentTextClass: string;
  accentBgClass: string;
}) {
  const {
    name, initials, profileImageUrl, typeLabel, rating, reviewCount, location, description,
    services = [], pricingLabel, responseTime, phone, websiteUrl, portfolioImages = [], available, visible,
  } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2">
        <Eye className="w-3.5 h-3.5 shrink-0" />
        Aperçu exact de ce qu'un Coffee Owner voit sur votre profil public.
        {visible === false && (
          <span className="ml-auto shrink-0 font-semibold text-amber-600 dark:text-amber-400">Profil masqué</span>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 overflow-hidden">
        {/* Header banner */}
        <div className="h-28 sm:h-36 relative bg-gray-100 dark:bg-gray-700">
          <Avatar className="w-full h-full rounded-none">
            <AvatarImage src={profileImageUrl ?? undefined} alt={name} className="object-cover" />
            <AvatarFallback className={`rounded-none text-white text-3xl font-bold ${accentBgClass}`}>
              {initials}
            </AvatarFallback>
          </Avatar>
          {available != null && (
            <span
              className={`absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm ${
                available ? "bg-green-500/90 text-white" : "bg-black/50 text-white/80"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${available ? "bg-white" : "bg-white/60"}`} />
              {available ? "Disponible" : "Indisponible"}
            </span>
          )}
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white leading-tight">{name}</h3>
              {typeLabel && <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${accentBgClass} text-white`}>{typeLabel}</Badge>}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
              {rating != null && (
                <span className="flex items-center gap-1 text-amber-500">
                  <Star className="w-3 h-3 fill-amber-400" /> {rating.toFixed(1)}{reviewCount != null && ` (${reviewCount} avis)`}
                </span>
              )}
              {location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {location}</span>}
            </div>
          </div>

          {description && <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{description}</p>}

          {services.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5 text-gray-500 dark:text-gray-400">Services</p>
              <div className="flex flex-wrap gap-1.5">
                {services.map((s) => (
                  <span key={s} className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(pricingLabel || responseTime) && (
            <div className="grid grid-cols-2 gap-3">
              {pricingLabel && (
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Tarif</p>
                  <p className={`font-bold text-sm ${accentTextClass}`}>{pricingLabel}</p>
                </div>
              )}
              {responseTime && (
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Réponse</p>
                  <p className="font-bold text-sm text-gray-900 dark:text-white">{responseTime}</p>
                </div>
              )}
            </div>
          )}

          {(phone || websiteUrl) && (
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
              {phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {phone}</span>}
              {websiteUrl && (
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1 hover:underline ${accentTextClass}`}>
                  <Globe className="w-3 h-3" /> {websiteUrl}
                </a>
              )}
            </div>
          )}

          {portfolioImages.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5 flex items-center gap-1 text-gray-500 dark:text-gray-400"><ImageIcon className="w-3.5 h-3.5" /> Portfolio</p>
              <div className="grid grid-cols-4 gap-2">
                {portfolioImages.slice(0, 8).map((url, i) => (
                  <div key={url + i} className="aspect-square rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700 bg-gray-100 dark:bg-gray-700">
                    <img src={url} alt="Portfolio" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
