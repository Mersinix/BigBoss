import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GraduationCap, Heart, Star, MapPin } from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import { useFallbackImage } from "@/hooks/use-fallback-image";
import { formatDistance } from "@/lib/distance";
import type { AcademyCompanyListCard } from "@/hooks/use-barista-academy";

// Extracted from barista-academy-page.tsx (Coffee Owner's /academy) so Espace Barista
// Marketplace → Académie can reuse the exact same academy-discovery card/section instead
// of a duplicated implementation — analyse.md "Aligner Espace Barista Marketplace →
// Académie sur Coffee Owner /academy". Behavior/markup unchanged from the original.

function useTheme(isDark: boolean) {
  return {
    cardBg: isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
  };
}

// Mirrors print-page.tsx's PrintStoreCardTile/PrintStoresSection (itself mirroring
// browse-products.tsx's StoreCardTile/StoresSection) — same card shape/positioning,
// adapted to real Academy data (GET /api/academy/companies,
// docs/academy_store_mapping_audit.md).
export function AcademyStoreCardTile({ company, onClick, isDark }: {
  company: AcademyCompanyListCard;
  onClick: () => void;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const faved = useFavorites((s) => !!s.academyOrganisations[company.userId]);
  const toggleAcademyOrganisation = useFavorites((s) => s.toggleAcademyOrganisation);
  // Photo de profil is the card's primary image; Cover then Flash are tried in
  // order if it's missing or fails to load (analyse.md image-mapping task).
  const cardImage = useFallbackImage([company.profileImageUrl, company.coverImageUrl, company.flashImageUrl], company.userId);

  return (
    <div
      data-testid={`card-academy-store-${company.userId}`}
      className={`group cursor-pointer border rounded-2xl overflow-hidden flex flex-col transition-all hover:shadow-xl hover:-translate-y-0.5 ${t.cardBg}`}
      onClick={onClick}
    >
      {/* Image area — same ~1.5× scale/visual language as Marketing's agency card
          (MarketingStoreCardTile), grid/scroll-item sizing handled by the parent
          AcademyStoresSection — docs/academy_marketing_design_synchronization_audit.md. */}
      <div className={`relative aspect-[16/9] overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
        {cardImage.src ? (
          <img src={cardImage.src} onError={cardImage.onError} alt={company.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><GraduationCap className={`w-14 h-14 ${t.textSubtle}`} /></div>
        )}

        {/* Organization type — top-left badge over the image. Academy has no
            per-account "type" field the way Marketing has Agency/Freelancer/Studio
            (confirmed via schema audit); "Académie" is the same fixed, real
            descriptor already used by this exact card's own favorite-toggle call
            below, not a fabricated per-record value. */}
        <span className="absolute top-3 left-3 bg-black/55 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
          Académie
        </span>

        <button
          className="absolute top-3 right-3 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            toggleAcademyOrganisation({
              id: company.userId, name: company.name,
              initials: company.name.split(/\s+/).filter(Boolean).map((p: string) => p[0]).join("").slice(0, 2).toUpperCase(),
              type: "Académie", rating: company.rating / 10, portfolioImages: company.portfolioImages,
              location: company.location, available: !company.isOnVacation, profileImageUrl: company.profileImageUrl,
            });
          }}
          data-testid={`button-fav-academy-store-${company.userId}`}
        >
          <Heart className={`w-4 h-4 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white/80"}`} />
        </button>

        {/* Avis — bottom-right overlay, real rating/reviewCount, same reviewCount>0 gate used everywhere else */}
        {company.reviewCount > 0 && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/55 backdrop-blur-sm rounded-full px-2.5 py-1">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-bold text-white">{(company.rating / 10).toFixed(1)}</span>
            <span className="text-[11px] text-white/70">({company.reviewCount} avis)</span>
          </div>
        )}
      </div>
      <div className="p-4 flex gap-4 relative z-20">
        <div className={`w-16 h-16 rounded-xl border-2 -mt-12 overflow-hidden shrink-0 flex items-center justify-center ${isDark ? "bg-gray-700 border-gray-800" : "bg-white border-white shadow-sm"}`}>
          {company.profileImageUrl ? (
            <img src={company.profileImageUrl} alt={company.name} className="w-full h-full object-cover" />
          ) : (
            <GraduationCap className={`w-6 h-6 ${t.textMuted}`} />
          )}
        </div>
        <div className="flex-1 min-w-0 pt-1.5">
          <h3 className={`font-bold text-base leading-tight truncate ${t.textPrimary}`}>{company.name}</h3>
          {company.description && <p className={`text-sm line-clamp-1 mt-1 ${t.textMuted}`}>{company.description}</p>}
          <div className={`flex items-center gap-3 text-xs mt-2 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
            <span className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" />{company.courseCount} formation{company.courseCount !== 1 ? "s" : ""}</span>
            {company.distanceKm != null && <span className="flex items-center gap-1 text-current"><MapPin className="w-3.5 h-3.5" />{formatDistance(company.distanceKm)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AcademyStoresSection({ companies, onSelect, isDark }: {
  companies: AcademyCompanyListCard[];
  onSelect: (academyUserId: number) => void;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const [expanded, setExpanded] = useState(false);
  const INITIAL_LIMIT = 5;

  if (!companies.length) return null;
  const showToggle = companies.length > INITIAL_LIMIT;
  const visible = expanded ? companies : companies.slice(0, INITIAL_LIMIT);

  const renderTile = (company: AcademyCompanyListCard) => (
    <AcademyStoreCardTile key={company.userId} company={company} onClick={() => onSelect(company.userId)} isDark={isDark} />
  );

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className={`font-bold text-lg ${t.textPrimary}`}>Académies</h2>
          <p className={`text-xs mt-0.5 ${t.textMuted}`}>{companies.length} académie{companies.length !== 1 ? "s" : ""}</p>
        </div>
        {showToggle && (
          <Button
            variant="ghost"
            size="sm"
            className={`text-xs font-semibold h-8 px-3 ${isDark ? "text-gray-300 hover:text-white hover:bg-gray-800" : "text-gray-600 hover:text-gray-900"}`}
            onClick={() => setExpanded((e) => !e)}
            data-testid="button-toggle-academy-stores"
          >
            {expanded ? "Voir moins" : `Voir plus (${companies.length - INITIAL_LIMIT}+)`}
          </Button>
        )}
      </div>
      {/* Same grid/breakpoints as the Formations grid below, mirroring Marketing's
          Agency-card/Service-card grid unification (same column width, no separate
          horizontal-scroll/fixed-width mode) — docs/academy_marketing_design_synchronization_audit.md. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {visible.map(renderTile)}
      </div>
    </div>
  );
}
