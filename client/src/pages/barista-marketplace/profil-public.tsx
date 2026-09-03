import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useMyBaristaProfile, type BaristaLevel } from "@/hooks/use-barista-marketplace";
import { PublicProfilePreview } from "@/components/account/public-profile-preview";
import { Skeleton } from "@/components/ui/skeleton";

const LEVEL_LABELS: Record<BaristaLevel, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };

// Profil Public tab — exactly what a Coffee Owner sees when opening this
// Barista's card on /barista (BaristaDetailModal), fed by the same
// useMyBaristaProfile query the Profil tab's own editor uses. No second
// profile representation: editing Profil and saving updates this preview
// immediately (same query cache), and it's what Coffee Owners already see.
export default function BaristaMarketplaceProfilPublic() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();
  const { data, isLoading } = useMyBaristaProfile(user?.id ?? null);
  const card = data?.card;

  if (isLoading || !card) {
    return <div className="space-y-3"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  }

  return (
    <PublicProfilePreview
      accentTextClass="text-green-600 dark:text-green-400"
      accentBgClass="bg-green-600 hover:bg-green-700"
      data={{
        name: card.name,
        initials: card.initials,
        profileImageUrl: card.profileImageUrl,
        typeLabel: LEVEL_LABELS[card.level],
        rating: card.rating / 10,
        reviewCount: card.reviewCount,
        location: card.location,
        description: card.bio,
        services: card.skills,
        pricingLabel: card.dailyRateInCents ? `${fmt(card.dailyRateInCents)} / jour` : null,
        responseTime: null,
        phone: card.phone,
        portfolioImages: card.portfolioUrls,
        available: card.available,
        visible: card.marketplaceVisible,
      }}
    />
  );
}
