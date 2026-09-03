import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useQuery } from "@tanstack/react-query";
import { PublicProfilePreview } from "@/components/account/public-profile-preview";
import { Skeleton } from "@/components/ui/skeleton";

// Profil Public tab — exactly what a Coffee Owner sees when opening this
// Maintenance provider's card on /maintenance, fed by the same
// /api/maintenance/profile/:userId query the Profil tab's own editor uses
// (same queryKey, so both stay in sync automatically). No second profile
// representation.
export default function MaintenanceProfilPublic() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();
  const { data, isLoading } = useQuery<{ user: any; profile: any }>({
    queryKey: ["/api/maintenance/profile", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/maintenance/profile/${user!.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load profile");
      return response.json();
    },
    enabled: !!user?.id,
  });

  if (isLoading || !data) {
    return <div className="space-y-3"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  }

  const p = data.profile;
  const name = data.user?.name ?? user?.name ?? "";
  const initials = name.split(/\s+/).filter(Boolean).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <PublicProfilePreview
      accentTextClass="text-orange-600 dark:text-orange-400"
      accentBgClass="bg-orange-600 hover:bg-orange-700"
      data={{
        name,
        initials,
        profileImageUrl: data.user?.profileImageUrl ?? null,
        typeLabel: p?.profileType ?? null,
        location: p?.coverageArea ?? null,
        description: p?.description ?? null,
        services: p?.skills ?? [],
        pricingLabel: p?.dailyRateInCents ? `${fmt(p.dailyRateInCents)} / jour` : null,
        responseTime: p?.responseTime ?? null,
        phone: data.user?.phone ?? null,
        portfolioImages: p?.portfolioImages ?? [],
        visible: p?.marketplaceVisible,
      }}
    />
  );
}
