import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import {
  useAcademyCourses, useAcademyCourseSessions, useCreateAcademyRegistration,
  useAcademyRegistrations, useUpdateAcademyRegistrationStatus,
  useCreateAcademyReview, useAcademyReviewForRegistration,
  type AcademyCourseCard, type AcademyCourseLevel, type AcademyRegistrationWithParties, type AcademyRegistrationStatus,
} from "@/hooks/use-barista-academy";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GraduationCap, Search, Clock, Award, MapPin, Star, Users, Calendar,
  CheckCircle, Send, RotateCcw, SlidersHorizontal, BookOpen,
} from "lucide-react";

// Personal Academy workspace for the Barista — reuses the EXACT SAME Academy
// ecosystem as Coffee Owner /academy, the Academy Account and Admin Academy:
// GET /api/academy/courses for discovery, GET/POST /api/academy/registrations
// for "Mes Formations" and enrollment. No duplicate formation/registration
// tables — a Barista's registration is the same academyRegistrations row a
// Coffee Owner's is, just with participantType='BARISTA_MARKETPLACE' (see
// shared/schema.ts). Design deliberately follows the Barista Marketplace
// account's own Card-based pattern (mirrors requests.tsx/missions.tsx), not
// the public /academy marketing page.

const LEVEL_LABELS: Record<AcademyCourseLevel, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };
const LEVEL_COLORS: Record<AcademyCourseLevel, string> = {
  BEGINNER: "bg-green-100 text-green-700", ADVANCED: "bg-blue-100 text-blue-700", EXPERT: "bg-purple-100 text-purple-700",
};
const REGISTRATION_STATUS_LABELS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "En attente", CONFIRMED: "Confirmée", CANCELLED: "Annulée", COMPLETED: "Terminée",
};
const REGISTRATION_STATUS_COLORS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700", CONFIRMED: "bg-indigo-100 text-indigo-700",
  CANCELLED: "bg-gray-100 text-gray-600", COMPLETED: "bg-green-100 text-green-700",
};

function StatusBadge({ status }: { status: AcademyRegistrationStatus }) {
  return <Badge variant="secondary" className={REGISTRATION_STATUS_COLORS[status]}>{REGISTRATION_STATUS_LABELS[status]}</Badge>;
}

// ── Enrollment dialog ─────────────────────────────────────────────────────────

function EnrollDialog({ course, alreadyRegistered, onClose }: { course: AcademyCourseCard | null; alreadyRegistered: boolean; onClose: () => void }) {
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const createRegistration = useCreateAcademyRegistration();
  const { data: sessions = [] } = useAcademyCourseSessions(course?.id ?? null);
  const [sessionId, setSessionId] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (course) { setSessionId(""); setNotes(""); }
  }, [course?.id]);

  if (!course) return null;

  const submit = () => {
    createRegistration.mutate(
      { courseId: course.id, sessionId: sessionId ? Number(sessionId) : null, participantCount: 1, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          toast({ title: "Inscription envoyée", description: `${course.academyName} confirmera votre inscription à "${course.title}".` });
          onClose();
        },
        onError: (error: Error) => toast({ title: "Inscription impossible", description: error.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{course.title}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GraduationCap className="h-4 w-4 shrink-0" />{course.academyName}
            {course.academyLocation && <span className="flex items-center gap-1 ml-2"><MapPin className="h-3 w-3" />{course.academyLocation}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={LEVEL_COLORS[course.level]} variant="outline">{LEVEL_LABELS[course.level]}</Badge>
            {course.hasCertification && <Badge variant="outline" className="text-amber-600 border-amber-200"><Award className="h-3 w-3 mr-1" />Certifiante</Badge>}
            {course.duration && <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{course.duration}</Badge>}
            {course.trainingMode && <Badge variant="outline">{course.trainingMode}</Badge>}
          </div>
          {course.description && <p className="text-muted-foreground whitespace-pre-wrap">{course.description}</p>}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {course.reviewCount > 0 ? (
              <span className="flex items-center gap-1 text-amber-500"><Star className="h-3.5 w-3.5 fill-current" />{(course.rating / 10).toFixed(1)} ({course.reviewCount} avis)</span>
            ) : <span>Aucun avis</span>}
            {course.capacity != null && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />Capacité {course.capacity}</span>}
          </div>
          <div className="pt-2 border-t border-border/50 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Prix</span>
            <span className="font-bold text-indigo-600">{fmt(course.priceInCents)}</span>
          </div>

          {alreadyRegistered ? (
            <div className="rounded-xl bg-secondary/40 p-3 text-center text-sm">
              <CheckCircle className="h-5 w-5 mx-auto mb-1.5 text-green-600" />
              Vous êtes déjà inscrit à cette formation.
            </div>
          ) : (
            <>
              {sessions.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Session</label>
                  <Select value={sessionId} onValueChange={setSessionId}>
                    <SelectTrigger data-testid="select-enroll-session"><SelectValue placeholder="Choisir une session (optionnel)" /></SelectTrigger>
                    <SelectContent>
                      {sessions.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.startDate}{s.endDate ? ` → ${s.endDate}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Textarea placeholder="Message pour l'académie (optionnel)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="input-enroll-notes" />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{alreadyRegistered ? "Fermer" : "Annuler"}</Button>
          {!alreadyRegistered && (
            <Button disabled={createRegistration.isPending} onClick={submit} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-submit-enroll">
              <Send className="w-4 h-4 mr-1.5" />{createRegistration.isPending ? "Envoi…" : "S'inscrire"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Formations (discovery) tab ─────────────────────────────────────────────────

function FormationsTab({ myRegistrations, onGoToMyFormations }: { myRegistrations: AcademyRegistrationWithParties[]; onGoToMyFormations: () => void }) {
  const fmt = useFormatCurrency();
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [certification, setCertification] = useState("");
  const [target, setTarget] = useState<AcademyCourseCard | null>(null);

  const { data: courses = [], isLoading } = useAcademyCourses({
    search: search || undefined, level: level || undefined, certification: certification || undefined,
  });

  const registeredCourseIds = useMemo(
    () => new Set(myRegistrations.filter((r) => r.status !== "CANCELLED").map((r) => r.courseId)),
    [myRegistrations],
  );
  const hasFilters = !!(search || level || certification);

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

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">{hasFilters ? "Aucune formation trouvée" : "Aucune formation disponible"}</p>
            <p className="text-sm text-muted-foreground mt-1">{hasFilters ? "Essayez d'ajuster vos filtres." : "Revenez bientôt : les académies publient régulièrement de nouvelles formations."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((course) => {
            const registered = registeredCourseIds.has(course.id);
            return (
              <Card key={course.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setTarget(course)} data-testid={`card-formation-${course.id}`}>
                <CardContent className="p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{course.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><GraduationCap className="h-3 w-3" />{course.academyName}</p>
                    </div>
                    <Badge className={`text-[10px] shrink-0 border-0 px-1.5 ${LEVEL_COLORS[course.level]}`}>{LEVEL_LABELS[course.level]}</Badge>
                  </div>
                  {course.description && <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    {course.reviewCount > 0 ? (
                      <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-current" />{(course.rating / 10).toFixed(1)} ({course.reviewCount})</span>
                    ) : <span>Aucun avis</span>}
                    {course.duration && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration}</span>}
                    {course.hasCertification && <span className="flex items-center gap-1 text-amber-600"><Award className="w-3 h-3" />Certifiante</span>}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <p className="font-bold text-sm text-indigo-600">{fmt(course.priceInCents)}</p>
                    {registered ? (
                      <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">Déjà inscrit</Badge>
                    ) : (
                      <Button size="sm" className="h-7 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3" data-testid={`button-enroll-${course.id}`}>S'inscrire</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <EnrollDialog course={target} alreadyRegistered={!!target && registeredCourseIds.has(target.id)} onClose={() => setTarget(null)} />
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
  const { user } = useAuth();
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
      <DialogContent className="max-w-lg">
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

  if (isLoading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}</div>;
  }

  if (sorted.length === 0) {
    return (
      <Card>
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
        {sorted.map((r) => (
          <Card key={r.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetail(r)} data-testid={`card-my-formation-${r.id}`}>
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
      <RegistrationDetail registration={detail} onClose={() => setDetail(null)} />
    </>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

export default function BaristaAcademyMarketplacePage() {
  const [tab, setTab] = useState<"formations" | "mine">("formations");
  const { data: registrations = [], isLoading: registrationsLoading } = useAcademyRegistrations();

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Academy</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Formez-vous auprès des académies BigBoss et suivez vos inscriptions.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "formations" | "mine")}>
        <TabsList>
          <TabsTrigger value="formations" data-testid="tab-academy-formations">Formations</TabsTrigger>
          <TabsTrigger value="mine" data-testid="tab-academy-mine">Mes Formations {registrations.length > 0 ? `(${registrations.filter((r) => r.status !== "CANCELLED").length})` : ""}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "formations" ? (
        <FormationsTab myRegistrations={registrations} onGoToMyFormations={() => setTab("mine")} />
      ) : (
        <MesFormationsTab registrations={registrations} isLoading={registrationsLoading} onGoToFormations={() => setTab("formations")} />
      )}
    </div>
  );
}
