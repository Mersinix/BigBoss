import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useMyMarketingProfile } from "@/hooks/use-marketing";
import { PublicProfilePreview } from "@/components/account/public-profile-preview";
import { Skeleton } from "@/components/ui/skeleton";

const PROVIDER_TYPE_LABELS: Record<string, string> = { Agency: "Agence", Freelancer: "Freelancer", Studio: "Studio" };

// Profil Public tab — exactly what a Coffee Owner sees when opening this
// provider's card on /marketing (MarketingDetailModal), fed by the same
// useMyMarketingProfile query the Services tab's own editor uses. No second
// profile representation: editing Services and saving updates this preview
// immediately (same query cache), and it's what Coffee Owners already see.
export default function MarketingProfilPublic() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();
  const { data, isLoading } = useMyMarketingProfile(user?.id ?? null);
  const card = data?.card;

  if (isLoading || !card) {
    return <div className="space-y-3"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  }

  return (
    <PublicProfilePreview
      accentTextClass="text-fuchsia-600 dark:text-fuchsia-400"
      accentBgClass="bg-fuchsia-600 hover:bg-fuchsia-700"
      data={{
        name: card.name,
        initials: card.initials,
        profileImageUrl: card.profileImageUrl,
        typeLabel: PROVIDER_TYPE_LABELS[card.profileType] ?? card.profileType,
        rating: card.rating / 10,
        reviewCount: card.reviewCount,
        location: card.location,
        description: card.description,
        services: card.categories,
        pricingLabel: card.startingPriceInCents ? `À partir de ${fmt(card.startingPriceInCents)}` : null,
        responseTime: card.responseTime,
        phone: card.phone,
        websiteUrl: card.websiteUrl,
        portfolioImages: card.portfolioImages,
        available: card.isAvailable,
        visible: card.marketplaceVisible,
      }}
    />
  );
}
