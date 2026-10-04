import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { AcademyFastSearch } from "@/components/academy/academy-fast-search";
import { PublicationStatusBadge } from "@/components/account/publication-status-badge";
import { useMyAcademyProfile, useUpdateAcademyProfile, useMyAcademyCourses, useAcademyCourses } from "@/hooks/use-barista-academy";
import { AcademyProfileModal } from "@/components/academy/academy-profile-modal";
import { AcademyDetailModal } from "@/components/academy/academy-detail-modal";
import { BusinessProfileIdentityCard } from "@/components/settings/business-profile-identity-card";
import { AccountAvailabilityCard } from "@/components/settings/account-availability-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, BookOpen, Eye, Image as ImageIcon, X, Zap, Rocket } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { buildWeeklyHoursFallback } from "@/lib/weekly-hours";
import type { OpeningHoursMap } from "@shared/schema";

const ACCENT = "bg-indigo-600 hover:bg-indigo-700 text-white";
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";
const MAX_PORTFOLIO_IMAGES = 4;

// Business → Profil — the Academy's complete public/business profile
// (identity summary/description/formations summary/visibility/availability).
// Single source of truth for this information (Settings/Business-Profil
// separation task) — Settings no longer duplicates any of it, only account
// management (Compte/Localisation/Notifications/Sécurité) stays there.
export default function AcademyProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useMyAcademyProfile(user?.id ?? null);
  const { data: courses = [] } = useMyAcademyCourses();
  // Aperçu Flash (docs/flash_academy_marketing_print_mapping_audit.md) — the
  // same public, already-enriched AcademyCourseCard list (academyName/
  // flashImageUrl/rating/etc. already joined server-side) the Coffee Owner's
  // own Fast Search reads, filtered client-side to this academy's own
  // academyUserId. This reuses the exact same mapping/visibility/publication
  // rules (GET /api/academy/courses only ever returns published courses from
  // approved, marketplace-visible academies) rather than re-implementing
  // them — a course that wouldn't yet be visible to a real Coffee Owner
  // (e.g. this academy's own GO-Live still pending) correctly won't appear
  // here either.
  const { data: publicCourses = [] } = useAcademyCourses();
  const myPublishedCourses = useMemo(
    () => publicCourses.filter((c) => c.academyUserId === user?.id),
    [publicCourses, user?.id],
  );
  const updateProfile = useUpdateAcademyProfile();
  const queryClient = useQueryClient();
  const [flashPreviewOpen, setFlashPreviewOpen] = useState(false);

  const [description, setDescription] = useState("");
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [portfolioDraft, setPortfolioDraft] = useState("");
  const [visible, setVisible] = useState(true);
  const [isOnVacation, setIsOnVacation] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<OpeningHoursMap>(buildWeeklyHoursFallback([], "09:00", "18:00"));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCourseId, setPreviewCourseId] = useState<number | null>(null);

  useEffect(() => {
    if (data?.profile) {
      setDescription(data.profile.description ?? "");
      setPortfolioImages(data.profile.portfolioImages ?? []);
      setVisible(data.profile.marketplaceVisible);
      setIsOnVacation(data.profile.isOnVacation ?? false);
      setWeeklyHours(data.profile.weeklyHours ?? buildWeeklyHoursFallback([], "09:00", "18:00"));
    }
  }, [data?.profile?.updatedAt]);

  const updateDayHours = (key: keyof OpeningHoursMap, patch: Partial<OpeningHoursMap[keyof OpeningHoursMap]>) => {
    setWeeklyHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const addPortfolioImage = () => {
    const v = portfolioDraft.trim();
    if (!v || portfolioImages.includes(v) || portfolioImages.length >= MAX_PORTFOLIO_IMAGES) return;
    setPortfolioImages((prev) => [...prev, v]);
    setPortfolioDraft("");
  };

  // Unified Save (Phase 4) — ONE button replaces the former separate
  // Description/Portfolio/Disponibilité saves and the instant-mutate Visibility
  // toggle. Every one of those fields already goes through the same
  // PATCH /api/academy/profile Zod schema (same as Printer), so a single
  // mutateAsync carries the whole page — no partial-failure case to report.
  // AccountAvailabilityCard is fully controlled (weeklyHours/isOnVacation live
  // here), so it only needs hideSaveButton, no ref.
  const saveAll = async (): Promise<boolean> => {
    try {
      await updateProfile.mutateAsync({ description, portfolioImages, marketplaceVisible: visible, isOnVacation, weeklyHours });
      toast({ title: "Profil sauvegardé" });
      return true;
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Sauvegarde impossible.", variant: "destructive" });
      return false;
    }
  };

  const goLive = useMutation({
    mutationFn: () => apiRequest("POST", "/api/academy/profile/go-live", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/academy/profile"] });
      toast({ title: "Profil soumis", description: "Un administrateur va examiner votre profil." });
    },
    onError: (error: Error) => toast({ title: "Impossible de soumettre le profil", description: error.message, variant: "destructive" }),
  });
  const handleGoLive = async () => {
    // Save first, only submit if that actually succeeded (Phase 5A).
    const saved = await saveAll();
    if (saved) goLive.mutate();
  };
  const publicationStatus = data?.profile?.publicationStatus ?? "DRAFT";
  const saving = updateProfile.isPending;

  const publishedCount = courses.filter((c) => c.isPublished).length;

  if (isLoading) {
    return <div className="flex flex-col gap-5"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Preview — opens the Academy Profile details modal (same design reference as the
          Barista modal), read-only here: Report/Message are inert, only Disponibilité
          and browsing related formations stay functional. */}
      <DashboardHero
        title="Profil"
        subtitle="Gérez la présentation publique de votre académie."
        icon={GraduationCap}
        gradientClass="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/20"
        iconBgClass="bg-indigo-500/15"
        iconTextClass="text-indigo-600 dark:text-indigo-400"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <PublicationStatusBadge status={publicationStatus} />
            <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setPreviewOpen(true)} data-testid="button-preview-profile">
              <Eye className="w-3.5 h-3.5" /> Aperçu
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setFlashPreviewOpen(true)} data-testid="button-flash-preview">
              <Zap className="w-3.5 h-3.5" /> Flash
            </Button>
          </div>
        }
      />

      <BusinessProfileIdentityCard nameLabel="Nom de l'académie" settingsPath="/barista-academy/settings" testIdPrefix="academy" className={CARD_CLASS} />

      <Card className={CARD_CLASS}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><GraduationCap className="w-4 h-4 text-indigo-500" />Description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Présentez votre académie, votre expérience, vos spécialités…" data-testid="input-academy-description" />
        </CardContent>
      </Card>

      <Card className={CARD_CLASS}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4 text-indigo-500" />Portfolio ({portfolioImages.length}/{MAX_PORTFOLIO_IMAGES})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground -mt-1">Ajoutez jusqu'à {MAX_PORTFOLIO_IMAGES} photos de votre activité.</p>
          <div className="flex gap-2">
            <Input
              value={portfolioDraft}
              onChange={(e) => setPortfolioDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPortfolioImage())}
              placeholder="https://…"
              disabled={portfolioImages.length >= MAX_PORTFOLIO_IMAGES}
              data-testid="input-new-portfolio-url"
            />
            <Button type="button" variant="outline" className="shrink-0" disabled={!portfolioDraft.trim() || portfolioImages.length >= MAX_PORTFOLIO_IMAGES} onClick={addPortfolioImage} data-testid="button-add-portfolio-url">Ajouter</Button>
          </div>
          {portfolioImages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {portfolioImages.map((image, index) => (
                <div key={`${image}-${index}`} className="relative group">
                  <img src={image} alt={`Portfolio ${index + 1}`} className="h-24 w-full rounded-xl object-cover bg-muted" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                  <button type="button" aria-label={`Supprimer l'image ${index + 1}`} onClick={() => setPortfolioImages((cur) => cur.filter((_, i) => i !== index))} className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={CARD_CLASS}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-500" />Formations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{publishedCount} formation{publishedCount > 1 ? "s" : ""} publiée{publishedCount > 1 ? "s" : ""} sur {courses.length} au total — gérées depuis Business → Formations.</p>
        </CardContent>
      </Card>

      <Card className={CARD_CLASS}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Visibilité</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Afficher mon académie sur /academy</p>
              <p className="text-xs text-muted-foreground mt-0.5">Lorsque désactivé, vos formations publiées ne sont plus visibles par les Coffee Owners.</p>
            </div>
            {/* Deferred like every other field now (Phase 4) — only takes effect
                when the unified Save button below is clicked. */}
            <Switch checked={visible} onCheckedChange={setVisible} disabled={saving} data-testid="switch-profile-visible" />
          </div>
        </CardContent>
      </Card>

      <AccountAvailabilityCard
        weeklyHours={weeklyHours}
        onChangeDay={updateDayHours}
        isOnVacation={isOnVacation}
        onChangeVacation={setIsOnVacation}
        hideSaveButton
        vacationDescription="Masque votre académie et stoppe les nouvelles inscriptions."
        accentClassName={ACCENT}
        testIdPrefix="academy"
        className={CARD_CLASS}
        summaryClassName="border-transparent bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-500/10 dark:to-violet-500/10"
        summaryTextClassName="text-indigo-700 dark:text-indigo-400"
      />

      {/* Phase 4 — single primary Save button for the whole page (description +
          portfolio + visibility + availability, via saveAll above). */}
      <Button onClick={saveAll} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-5" data-testid="button-save-profile-all">
        {saving ? "Sauvegarde…" : "Sauvegarder le profil"}
      </Button>

      {/* GO Live (Phase 5) — saves first, then submits for admin review.
          Disabled while a request is already pending (Phase 5C). */}
      <Button
        onClick={handleGoLive}
        disabled={saving || goLive.isPending || publicationStatus === "PENDING"}
        variant="outline"
        className="w-full rounded-2xl py-5 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 gap-2"
        data-testid="button-go-live"
      >
        <Rocket className="w-4 h-4" />
        {goLive.isPending ? "Envoi…" : publicationStatus === "PENDING" ? "En attente d'approbation" : "GO Live"}
      </Button>
      {publicationStatus === "REJECTED" && data?.profile?.publicationRejectionReason && (
        <p className="text-xs text-red-600 dark:text-red-400 text-center -mt-2">Motif du refus : {data.profile.publicationRejectionReason}</p>
      )}

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

      {/* Aperçu Flash (docs/flash_academy_marketing_print_mapping_audit.md) —
          the Coffee Owner's real AcademyFastSearch, previewMode on, fed by
          this academy's own real PUBLISHED courses (myPublishedCourses,
          above). "Info" opens the existing read-only AcademyDetailModal for
          that specific course (same as Coffee Owner's own Info button); if
          there are no published courses at all, the empty state's "Voir mon
          profil" falls back to the existing read-only AcademyProfileModal. */}
      <AcademyFastSearch
        open={flashPreviewOpen}
        onClose={() => setFlashPreviewOpen(false)}
        courses={myPublishedCourses}
        onEnroll={() => {}}
        onOpenDetail={(course) => { setFlashPreviewOpen(false); setPreviewCourseId(course.id); }}
        previewMode
        onOpenOwnDetail={() => { setFlashPreviewOpen(false); setPreviewCourseId(null); setPreviewOpen(true); }}
      />
    </div>
  );
}
