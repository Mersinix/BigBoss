import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMyAcademyProfile, useUpdateAcademyProfile, useMyAcademyCourses } from "@/hooks/use-barista-academy";
import { AcademyProfileModal } from "@/components/academy/academy-profile-modal";
import { AcademyDetailModal } from "@/components/academy/academy-detail-modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, BookOpen, Eye } from "lucide-react";

// Business → Profil — the Academy's real public profile (description +
// marketplace visibility, the only two fields academyProfiles actually has;
// name/photo/contact/location stay on the shared users table, edited via
// Account, same convention as settings.tsx). Same query/mutation as
// settings.tsx's own "Identité publique"/"Visibilité" cards — not a second
// profile system, just also reachable from here per the new Business
// structure, with the Eye preview added.
export default function AcademyProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useMyAcademyProfile(user?.id ?? null);
  const { data: courses = [] } = useMyAcademyCourses();
  const updateProfile = useUpdateAcademyProfile();

  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCourseId, setPreviewCourseId] = useState<number | null>(null);

  useEffect(() => {
    if (data?.profile) {
      setDescription(data.profile.description ?? "");
      setVisible(data.profile.marketplaceVisible);
    }
  }, [data?.profile?.updatedAt]);

  const saveDescription = () => {
    updateProfile.mutate(
      { description },
      {
        onSuccess: () => toast({ title: "Description mise à jour" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  const handleToggle = (value: boolean) => {
    setVisible(value);
    updateProfile.mutate(
      { marketplaceVisible: value },
      {
        onSuccess: () => toast({ title: value ? "Académie visible sur la marketplace" : "Académie masquée de la marketplace" }),
        onError: (err: Error) => { setVisible(!value); toast({ title: "Erreur", description: err.message, variant: "destructive" }); },
      },
    );
  };

  const publishedCount = courses.filter((c) => c.isPublished).length;

  if (isLoading) {
    return <div className="flex flex-col gap-5 p-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profil</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez la présentation publique de votre académie.</p>
        </div>
        {/* Preview — opens the Academy Profile details modal (same design reference as the
            Barista modal), read-only here: Report/Message are inert, only Disponibilité
            and browsing related formations stay functional. */}
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setPreviewOpen(true)} data-testid="button-preview-profile">
          <Eye className="w-3.5 h-3.5" /> Aperçu
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><GraduationCap className="w-4 h-4 text-indigo-500" />Description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Présentez votre académie, votre expérience, vos spécialités…" data-testid="input-academy-description" />
          <div className="flex justify-end">
            <Button onClick={saveDescription} disabled={updateProfile.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-save-description">
              {updateProfile.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-500" />Formations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{publishedCount} formation{publishedCount > 1 ? "s" : ""} publiée{publishedCount > 1 ? "s" : ""} sur {courses.length} au total — gérées depuis Business → Formations.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Visibilité</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Afficher mon académie sur /academy</p>
              <p className="text-xs text-muted-foreground mt-0.5">Lorsque désactivé, vos formations publiées ne sont plus visibles par les Coffee Owners.</p>
            </div>
            <Switch checked={visible} onCheckedChange={handleToggle} disabled={updateProfile.isPending} data-testid="switch-profile-visible" />
          </div>
        </CardContent>
      </Card>

      <AcademyProfileModal
        academyUserId={user?.id ?? null}
        open={previewOpen && previewCourseId == null}
        onClose={() => setPreviewOpen(false)}
        onOpenCourse={(courseId) => setPreviewCourseId(courseId)}
        readOnly
      />
      <AcademyDetailModal
        courseId={previewCourseId}
        open={previewCourseId != null}
        onClose={() => setPreviewCourseId(null)}
        onEnroll={() => {}}
        readOnly
      />
    </div>
  );
}
