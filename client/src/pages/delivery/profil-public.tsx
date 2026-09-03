import { useAuth } from "@/hooks/use-auth";
import { PublicProfilePreview } from "@/components/account/public-profile-preview";
import { Skeleton } from "@/components/ui/skeleton";

// Profil Public tab — the Delivery Company's own identity (name/photo/phone/
// address). Delivery Companies have no Coffee-Owner-facing marketplace
// listing today (delivery is assigned automatically, never browsed/chosen),
// so only real, already-stored account fields are shown — nothing invented.
export default function DeliveryProfilPublic() {
  const { user } = useAuth();

  if (!user) {
    return <div className="space-y-3"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  }

  const initials = (user.name ?? "").split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <PublicProfilePreview
      accentTextClass="text-teal-600 dark:text-teal-400"
      accentBgClass="bg-teal-600 hover:bg-teal-700"
      data={{
        name: user.name,
        initials,
        profileImageUrl: (user as any).profileImageUrl ?? null,
        typeLabel: "Entreprise de livraison",
        location: (user as any).locationAddress ?? null,
        phone: user.phone,
      }}
    />
  );
}
