import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { PublicProfilePreview } from "@/components/account/public-profile-preview";
import { Skeleton } from "@/components/ui/skeleton";

// Profil Public tab — what a Coffee Owner sees about this Printer on the
// /print marketplace (name/photo/location + the categories they offer), fed
// by the same account fields (Settings) and category mapping (Catégories tab)
// already used elsewhere. No printer-level aggregate rating exists yet (same
// as the Dashboard's own KPIs — deliberately not fabricated here either).
export default function PrinterProfilPublic() {
  const { user } = useAuth();
  const { data: mapping, isLoading } = useQuery<{ categories: string[]; subCategories: string[] }>({
    queryKey: ["/api/print/me/categories"],
    enabled: !!user,
  });

  if (isLoading || !user) {
    return <div className="space-y-3"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  }

  const initials = (user.name ?? "").split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <PublicProfilePreview
      accentTextClass="text-blue-600 dark:text-blue-400"
      accentBgClass="bg-blue-600 hover:bg-blue-700"
      data={{
        name: user.name,
        initials,
        profileImageUrl: (user as any).profileImageUrl ?? null,
        typeLabel: "Imprimerie",
        location: (user as any).locationAddress ?? null,
        services: mapping?.categories ?? [],
        phone: user.phone,
      }}
    />
  );
}
