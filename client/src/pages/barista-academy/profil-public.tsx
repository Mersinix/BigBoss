import { useAuth } from "@/hooks/use-auth";
import { useMyAcademyProfile, useMyAcademyCourses } from "@/hooks/use-barista-academy";
import { PublicProfilePreview } from "@/components/account/public-profile-preview";
import { Skeleton } from "@/components/ui/skeleton";

// Profil Public tab — what a Coffee Owner sees about this Academy across its
// course cards on /academy (name/photo/location/description + its published
// formations), fed by the same academy profile + courses queries the
// Formations/Settings tabs already use. No second profile representation.
export default function AcademyProfilPublic() {
  const { user } = useAuth();
  const { data, isLoading } = useMyAcademyProfile(user?.id ?? null);
  const { data: courses = [] } = useMyAcademyCourses();

  if (isLoading || !data) {
    return <div className="space-y-3"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  }

  const name = data.user?.name ?? user?.name ?? "";
  const initials = name.split(/\s+/).filter(Boolean).map((p: string) => p[0]).join("").slice(0, 2).toUpperCase();
  const publishedCourses = courses.filter((c) => c.isPublished);

  return (
    <PublicProfilePreview
      accentTextClass="text-indigo-600 dark:text-indigo-400"
      accentBgClass="bg-indigo-600 hover:bg-indigo-700"
      data={{
        name,
        initials,
        profileImageUrl: data.user?.profileImageUrl ?? null,
        typeLabel: "Academy",
        location: data.user?.locationAddress ?? null,
        description: data.profile?.description ?? null,
        services: publishedCourses.map((c) => c.title),
        phone: data.user?.phone ?? null,
        visible: data.profile?.marketplaceVisible,
      }}
    />
  );
}
