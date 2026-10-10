import { useEffect, useMemo, useState } from "react";
import { useThemeStore } from "@/store/theme-store";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import {
  useAcademyCourses, useAcademyCompanies, useAcademyRegistrations, useUpdateAcademyRegistrationStatus,
  useCreateAcademyReview, useAcademyReviewForRegistration,
  type AcademyCourseCard, type AcademyCourseLevel, type AcademyRegistrationWithParties, type AcademyRegistrationStatus,
} from "@/hooks/use-barista-academy";
import { useFavorites } from "@/hooks/use-favorites";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GraduationCap, Search, Star, Calendar,
  RotateCcw, SlidersHorizontal, BookOpen, X,
} from "lucide-react";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { AcademyMappedCourseCard } from "@/components/academy/academy-mapped-course-card";
import { AcademyStoresSection } from "@/components/academy/academy-stores-section";
import { AcademyDetailModal } from "@/components/academy/academy-detail-modal";
import { AcademyProfileModal } from "@/components/academy/academy-profile-modal";
import { EnrollDialog } from "@/components/academy/academy-enroll-dialog";

// Personal Academy workspace for the Barista — reuses the EXACT SAME Academy
// ecosystem as Coffee Owner /academy, the Academy Account and Admin Academy:
// GET /api/academy/courses for discovery, GET/POST /api/academy/registrations
// for "Mes Formations" and enrollment. No duplicate formation/registration
// tables — a Barista's registration is the same academyRegistrations row a
// Coffee Owner's is, just with participantType='BARISTA_MARKETPLACE' (see
// shared/schema.ts).
//
// Formations discovery/detail/enrollment now reuses Coffee Owner /academy's own
// components directly (AcademyStoresSection, AcademyMappedCourseCard,
// AcademyDetailModal, AcademyProfileModal, EnrollDialog) instead of a separate,
// drifting implementation — analyse.md "Aligner Espace Barista Marketplace →
// Académie sur Coffee Owner /academy". Mes Formations keeps its own existing,
// Barista-specific enrollment-history card/dialog, unchanged — Coffee Owner has
// no equivalent page to match there.

const LEVEL_LABELS: Record<AcademyCourseLevel, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };
const LEVEL_COLORS: Record<AcademyCourseLevel, string> = {
  BEGINNER: "bg-green-100 text-green-700", ADVANCED: "bg-blue-100 text-blue-700", EXPERT: "bg-purple-100 text-purple-700",
};
const REGISTRATION_STATUS_LABELS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "En attente", CONFIRMED: "Confirmée", CANCELLED: "Annulée", COMPLETED: "Terminée",
};
const REGISTRATION_STATUS_COLORS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", CONFIRMED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300", COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
};

function StatusBadge({ status }: { status: AcademyRegistrationStatus }) {
  return <Badge variant="secondary" className={REGISTRATION_STATUS_COLORS[status]}>{REGISTRATION_STATUS_LABELS[status]}</Badge>;
}

// ── Training Card ─────────────────────────────────────────────────────────────
// Same wrapper as Coffee Owner /academy's own TrainingCard — maps a course onto
// the shared AcademyMappedCourseCard, reusing the exact same favorites store.

function TrainingCard({
  course, isEnrolled, onOpenDetail, isDark,
}: {
  course: AcademyCourseCard;
  isEnrolled: boolean;
  onOpenDetail: (course: AcademyCourseCard) => void;
  isDark: boolean;
}) {
  const faved = useFavorites((s) => !!s.academyCourses[course.id]);
  const toggleAcademy = useFavorites((s) => s.toggleAcademyCourse);
  const coverImage = course.imageUrl || course.academyProfileImageUrl;

  return (
    <AcademyMappedCourseCard
      id={course.id}
      title={course.title}
      category={course.category}
      description={course.description}
      imageUrl={coverImage}
      priceInCents={course.priceInCents}
      academyName={course.academyName}
      academyProfileImageUrl={course.academyProfileImageUrl}
      academyIsAvailable={course.academyIsAvailable}
      rating={course.rating}
      reviewCount={course.reviewCount}
      levelLabel={LEVEL_LABELS[course.level]}
      levelColorClass={LEVEL_COLORS[course.level]}
      hasCertification={course.hasCertification}
      duration={course.duration}
      isFavorited={faved}
      onToggleFavorite={() => toggleAcademy({
        id: course.id, title: course.title, provider: course.academyName, duration: course.duration,
        rating: course.rating / 10, price: course.priceInCents, level: course.level,
        location: course.location || course.academyLocation, hasCertification: course.hasCertification,
        imageUrl: coverImage,
      })}
      onClick={() => onOpenDetail(course)}
      isDark={isDark}
      isEnrolled={isEnrolled}
    />
  );
}

// ── Formations (discovery) tab ─────────────────────────────────────────────────

function FormationsTab({ myRegistrations, onGoToMyFormations, isDark }: { myRegistrations: AcademyRegistrationWithParties[]; onGoToMyFormations: () => void; isDark: boolean }) {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [certification, setCertification] = useState("");
  const [detailCourseId, setDetailCourseId] = useState<number | null>(null);
  const [profileAcademyId, setProfileAcademyId] = useState<number | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<AcademyCourseCard | null>(null);

  const { data: courses = [], isLoading } = useAcademyCourses({
    search: search || undefined, level: level || undefined, certification: certification || undefined,
  });
  const { data: academyCompanies = [] } = useAcademyCompanies();

  const registeredCourseIds = useMemo(
    () => new Set(myRegistrations.filter((r) => r.status !== "CANCELLED").map((r) => r.courseId)),
    [myRegistrations],
  );
  const hasFilters = !!(search || level || certification);

  // Same usePagination/DataPagination pattern already used throughout the app (reference:
  // Espace Livraison → Business → Chauffeurs' driver-roster-view.tsx).
  const pagination = usePagination(courses.length);
  useEffect(() => { pagination.resetPage(); }, [search, level, certification]);
  const pageCourses = courses.slice(pagination.start, pagination.end);

  const handleEnroll = (course: AcademyCourseCard) => {
    setDetailCourseId(null);
    setEnrollTarget(course);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={`border rounded-2xl p-3 shadow-sm bg-card`}>
        <div className="flex items-center gap-2 flex-wrap">
          <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une formation…" className="h-8 text-xs pl-8" data-testid="input-academy-search" />
          </div>
          <Select value={level || "__all__"} onValueChange={(v) => setLevel(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[120px]" data-testid="select-academy-level"><SelectValue placeholder="Niveau" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tous niveaux</SelectItem>
              <SelectItem value="BEGINNER">Débutant</SelectItem>
              <SelectItem value="ADVANCED">Avancé</SelectItem>
              <SelectItem value="EXPERT">Expert</SelectItem>
            </SelectContent>
          </Select>
          <Select value={certification || "__all__"} onValueChange={(v) => setCertification(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[140px]" data-testid="select-academy-cert"><SelectValue placeholder="Certification" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toutes formations</SelectItem>
              <SelectItem value="true">Avec certification</SelectItem>
              <SelectItem value="false">Sans certification</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <button onClick={() => { setSearch(""); setLevel(""); setCertification(""); }} className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors" data-testid="button-reset-academy-filters">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Académies (discovery) — same shared section/card as Coffee Owner /academy,
          clicking opens the same AcademyProfileModal (Formations associated with
          that academy), not a new route. */}
      <AcademyStoresSection
        companies={academyCompanies}
        onSelect={(academyUserId) => setProfileAcademyId(academyUserId)}
        isDark={isDark}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-72 w-full rounded-2xl" />)}</div>
      ) : courses.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
          <CardContent className="py-16 text-center">
            <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">{hasFilters ? "Aucune formation trouvée" : "Aucune formation disponible"}</p>
            <p className="text-sm text-muted-foreground mt-1">{hasFilters ? "Essayez d'ajuster vos filtres." : "Revenez bientôt : les académies publient régulièrement de nouvelles formations."}</p>
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {pageCourses.map((course) => (
            <TrainingCard
              key={course.id}
              course={course}
              isEnrolled={registeredCourseIds.has(course.id)}
              onOpenDetail={(c) => setDetailCourseId(c.id)}
              isDark={isDark}
            />
          ))}
        </div>
        <DataPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={courses.length}
          totalPages={pagination.totalPages}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="formations"
        />
        </>
      )}

      <AcademyDetailModal
        courseId={detailCourseId}
        open={detailCourseId != null}
        onClose={() => setDetailCourseId(null)}
        onEnroll={handleEnroll}
        messagesBasePath="/barista-marketplace/messages"
      />

      <AcademyProfileModal
        academyUserId={profileAcademyId}
        open={profileAcademyId != null}
        onClose={() => setProfileAcademyId(null)}
        onOpenCourse={(courseId) => { setProfileAcademyId(null); setDetailCourseId(courseId); }}
        messagesBasePath="/barista-marketplace/messages"
      />

      <EnrollDialog course={enrollTarget} open={!!enrollTarget} onClose={() => setEnrollTarget(null)} isDark={isDark} />

      {registeredCourseIds.size > 0 && (
        <button onClick={onGoToMyFormations} className="text-xs text-indigo-600 hover:underline self-start" data-testid="link-goto-my-formations">
          Voir mes formations →
        </button>
      )}
    </div>
  );
}

// ── Mes Formations tab ────────────────────────────────────────────────────────

function RegistrationDetail({ registration, onClose }: { registration: AcademyRegistrationWithParties | null; onClose: () => void }) {
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const updateStatus = useUpdateAcademyRegistrationStatus();
  const { data: existingReview } = useAcademyReviewForRegistration(registration?.id ?? null);
  const createReview = useCreateAcademyReview();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  if (!registration) return null;

  const cancel = () => {
    updateStatus.mutate({ id: registration.id, status: "CANCELLED" }, {
      onSuccess: () => { toast({ title: "Inscription annulée" }); onClose(); },
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const submitReview = () => {
    createReview.mutate(
      { academyUserId: registration.academyUserId, registrationId: registration.id, rating, comment: comment.trim() || undefined },
      {
        onSuccess: () => toast({ title: "Avis envoyé" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideClose className="max-w-lg">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-registration-detail">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader><DialogTitle>{registration.courseTitle}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="sm:col-span-2"><StatusBadge status={registration.status} /></div>
          <div><p className="text-xs text-muted-foreground">Académie</p><p className="font-medium">{registration.academyName}</p></div>
          <div><p className="text-xs text-muted-foreground">Prix</p><p className="font-medium">{fmt(registration.priceInCents)}</p></div>
          <div><p className="text-xs text-muted-foreground">Session</p><p>{registration.sessionStartDate ? `${registration.sessionStartDate}${registration.sessionEndDate ? ` → ${registration.sessionEndDate}` : ""}` : "Non spécifiée"}</p></div>
          <div><p className="text-xs text-muted-foreground">Inscrit le</p><p>{new Date(registration.createdAt).toLocaleDateString("fr-FR")}</p></div>
          {registration.notes && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Message</p><p className="whitespace-pre-wrap">{registration.notes}</p></div>}
        </div>

        {registration.status === "PENDING" && (
          <div className="flex justify-end pt-2 border-t border-border/50">
            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={cancel} disabled={updateStatus.isPending} data-testid="button-cancel-registration">
              Annuler l'inscription
            </Button>
          </div>
        )}

        {registration.status === "COMPLETED" && (
          <div className="pt-3 border-t border-border/50 space-y-2">
            {existingReview ? (
              <div className="rounded-xl bg-secondary/40 p-3 text-sm">
                <p className="font-medium flex items-center gap-1 text-amber-500">{"★".repeat(existingReview.rating)}{"☆".repeat(5 - existingReview.rating)}</p>
                {existingReview.comment && <p className="text-muted-foreground mt-1">{existingReview.comment}</p>}
              </div>
            ) : (
              <>
                <p className="text-sm font-medium">Laisser un avis</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button key={v} type="button" onClick={() => setRating(v)} data-testid={`star-${v}`}>
                      <Star className={`w-5 h-5 ${v <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                    </button>
                  ))}
                </div>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Votre avis (optionnel)" data-testid="input-review-comment" />
                <div className="flex justify-end">
                  <Button size="sm" onClick={submitReview} disabled={createReview.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-submit-review">
                    {createReview.isPending ? "Envoi…" : "Envoyer l'avis"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MesFormationsTab({ registrations, isLoading, onGoToFormations }: { registrations: AcademyRegistrationWithParties[]; isLoading: boolean; onGoToFormations: () => void }) {
  const fmt = useFormatCurrency();
  const [detail, setDetail] = useState<AcademyRegistrationWithParties | null>(null);
  const sorted = useMemo(() => [...registrations].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)), [registrations]);

  // Same usePagination/DataPagination pattern already used throughout the app (reference:
  // Espace Livraison → Business → Chauffeurs' driver-roster-view.tsx).
  const pagination = usePagination(sorted.length);
  useEffect(() => { pagination.resetPage(); }, [sorted.length]);
  const pageSorted = sorted.slice(pagination.start, pagination.end);

  if (isLoading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}</div>;
  }

  if (sorted.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
        <CardContent className="py-16 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="font-semibold">Aucune formation pour le moment</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Découvrez les formations disponibles auprès des académies BigBoss.</p>
          <Button size="sm" onClick={onGoToFormations} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-discover-formations">
            Découvrir les formations
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pageSorted.map((r) => (
          <Card key={r.id} className="hover:shadow-md transition-shadow cursor-pointer bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl" onClick={() => setDetail(r)} data-testid={`card-my-formation-${r.id}`}>
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{r.courseTitle}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><GraduationCap className="h-3 w-3" />{r.academyName}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              {r.sessionStartDate && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="w-3 h-3 text-amber-500" />{r.sessionStartDate}{r.sessionEndDate ? ` → ${r.sessionEndDate}` : ""}</p>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <span>Inscrit le {new Date(r.createdAt).toLocaleDateString("fr-FR")}</span>
                <span className="font-semibold text-foreground">{fmt(r.priceInCents)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <DataPagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={sorted.length}
        totalPages={pagination.totalPages}
        start={pagination.start}
        end={pagination.end}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
        itemLabel="formations"
      />
      <RegistrationDetail registration={detail} onClose={() => setDetail(null)} />
    </>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

export default function BaristaAcademyMarketplacePage() {
  const [tab, setTab] = useState<"formations" | "mine">("formations");
  const isDark = useThemeStore((s) => s.isDark);
  const { data: registrations = [], isLoading: registrationsLoading } = useAcademyRegistrations();

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Académie"
        subtitle="Formez-vous auprès des académies BigBoss et suivez vos inscriptions."
        icon={GraduationCap}
        gradientClass="bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent border-green-500/20"
        iconBgClass="bg-green-500/15"
        iconTextClass="text-green-600 dark:text-green-400"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "formations" | "mine")}>
        <TabsList>
          <TabsTrigger value="formations" data-testid="tab-academy-formations">Formations</TabsTrigger>
          <TabsTrigger value="mine" data-testid="tab-academy-mine">Mes Formations {registrations.length > 0 ? `(${registrations.filter((r) => r.status !== "CANCELLED").length})` : ""}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "formations" ? (
        <FormationsTab myRegistrations={registrations} onGoToMyFormations={() => setTab("mine")} isDark={isDark} />
      ) : (
        <MesFormationsTab registrations={registrations} isLoading={registrationsLoading} onGoToFormations={() => setTab("formations")} />
      )}
    </div>
  );
}
