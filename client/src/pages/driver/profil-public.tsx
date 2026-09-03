import { useAuth } from "@/hooks/use-auth";
import { PublicProfilePreview } from "@/components/account/public-profile-preview";
import { Skeleton } from "@/components/ui/skeleton";

// Profil Public tab — the Driver's own identity (name/photo/phone), the same
// information a Coffee Owner or operator sees during a live delivery. Drivers
// have no dedicated marketplace listing/rating column today (see account.tsx's
// own note), so only real, already-stored fields are shown — nothing invented.
export default function DriverProfilPublic() {
  const { user } = useAuth();

  if (!user) {
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
        typeLabel: "Chauffeur",
        location: (user as any).locationAddress ?? null,
        phone: user.phone,
      }}
    />
  );
}
