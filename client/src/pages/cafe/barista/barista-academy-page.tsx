import { useState, useMemo, useEffect } from "react";
import { useFormatCurrency } from "@/hooks/use-currency";
import baristaHeroImg from "@assets/8d80708f-be87-4e8d-8805-f60e3c292914-1000x562.5-rjZKXkudAsN4bH_1780680229193.jpg";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useThemeStore } from "@/store/theme-store";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Star,
  Clock,
  Award,
  Search,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle,
  GraduationCap,
  Heart,
  Sun,
  Moon,
  MapPin,
  Send,
} from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import {
  useAcademyCourses, useAcademyCourseSessions, useCreateAcademyRegistration,
  type AcademyCourseCard, type AcademyCourseLevel,
} from "@/hooks/use-barista-academy";

// Barista Academy — split out of the former combined /barista page into its
// own independent page/service (route /academy). This is now backed by REAL
// data: courses ("formations") published by Barista Academy accounts, read
// live from /api/academy/courses — no more static TRAINING_PROGRAMS array.
// See client/src/hooks/use-barista-academy.ts for the data layer and
// client/src/pages/barista-academy/courses.tsx for where Academies manage
// this content. Design/layout preserved exactly from the previous static
// version — only the data source and the "S'inscrire" action changed.

// ── Access helper (mirrors barista-page.tsx's own copy) ──────────────────────

type AccessLevel = "visitor" | "pending" | "approved";

function useAccessLevel(): AccessLevel {
  const { user } = useAuth();
  if (!user) return "visitor";
  if (["SUPER_ADMIN", "ADMIN", "SUPPLIER"].includes(user.role)) return "approved";
  if (user.role === "CAFE_OWNER" && (user as any).status === "approved") return "approved";
  return "pending";
}

function useTheme(isDark: boolean) {
  return {
    dk: isDark,
    pageBg: isDark ? "bg-gray-900" : "bg-gray-50",
    cardBg: isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    mutedBg: isDark ? "bg-gray-800" : "bg-gray-100",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    selectContent: isDark
      ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white"
      : "bg-white border-gray-200 text-gray-900",
  };
}

const LEVEL_COLORS: Record<AcademyCourseLevel, string> = {
  BEGINNER: "bg-green-100 text-green-700",
  ADVANCED: "bg-blue-100 text-blue-700",
  EXPERT: "bg-purple-100 text-purple-700",
};
const LEVEL_LABELS: Record<AcademyCourseLevel, string> = {
  BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      <Star className="w-3 h-3 fill-amber-400" />
      <span className="text-[11px] font-semibold text-gray-700">{rating.toFixed(1)}</span>
    </span>
  );
}

// ── Enrollment dialog ─────────────────────────────────────────────────────────

function EnrollDialog({ course, open, onClose, isDark }: { course: AcademyCourseCard | null; open: boolean; onClose: () => void; isDark: boolean }) {
  const t = useTheme(isDark);
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const createRegistration = useCreateAcademyRegistration();
  const { data: sessions = [] } = useAcademyCourseSessions(course?.id ?? null);
  const [sessionId, setSessionId] = useState<string>("");
  const [participantCount, setParticipantCount] = useState("1");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && course) {
      setSessionId("");
      setParticipantCount("1");
      setNotes("");
    }
  }, [open, course?.id]);

  if (!course) return null;

  const submit = () => {
    createRegistration.mutate(
      {
        courseId: course.id,
        sessionId: sessionId ? Number(sessionId) : null,
        participantCount: Math.max(1, parseInt(participantCount, 10) || 1),
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Inscription envoyée", description: `${course.academyName} confirmera votre inscription à "${course.title}".` });
          onClose();
        },
        onError: (error: Error) => {
          toast({ title: "Inscription impossible", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl">
        <VisuallyHidden><DialogTitle>S'inscrire à {course.title}</DialogTitle></VisuallyHidden>
        <div className="space-y-3">
          <div>
            <h2 className="font-bold text-base leading-tight">{course.title}</h2>
            <p className={`text-xs ${t.textMuted}`}>{course.academyName} · {fmt(course.priceInCents)} / participant</p>
          </div>
          {sessions.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Session</label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger className={t.inputBg} data-testid="select-enroll-session"><SelectValue placeholder="Choisir une session (optionnel)" /></SelectTrigger>
                <SelectContent className={t.selectContent}>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.startDate}{s.endDate ? ` → ${s.endDate}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre de participants</label>
            <Input type="number" min={1} value={participantCount} onChange={(e) => setParticipantCount(e.target.value)} className={t.inputBg} data-testid="input-enroll-participants" />
          </div>
          <Textarea
            placeholder="Message pour l'académie (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={t.inputBg}
            data-testid="input-enroll-notes"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              disabled={createRegistration.isPending}
              onClick={submit}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              data-testid="button-submit-enroll"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {createRegistration.isPending ? "Envoi…" : "S'inscrire"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Training Card ─────────────────────────────────────────────────────────────

function TrainingCard({
  course,
  canAct,
  onEnroll,
  isDark,
}: {
  course: AcademyCourseCard;
  canAct: boolean;
  onEnroll: (course: AcademyCourseCard) => void;
  isDark: boolean;
}) {
  const fmt = useFormatCurrency();
  const t = useTheme(isDark);
  const faved = useFavorites((s) => !!s.academy[course.id]);
  const toggleAcademy = useFavorites((s) => s.toggleAcademy);

  return (
    <div
      data-testid={`card-training-${course.id}`}
      className={`group rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col ${t.cardBg}`}
    >
      <div className="h-16 bg-gradient-to-br from-indigo-500 to-violet-700 flex items-center justify-center relative">
        <button
          className="absolute top-2 left-2 w-6 h-6 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform z-10"
          onClick={(e) => {
            e.stopPropagation();
            toggleAcademy({
              id: course.id,
              title: course.title,
              provider: course.academyName,
              duration: course.duration,
              rating: course.rating / 10,
              price: course.priceInCents,
            });
          }}
          data-testid={`button-fav-academy-${course.id}`}
        >
          <Heart className={`w-3 h-3 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>
        <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        {course.hasCertification && (
          <div className="absolute top-2 right-2">
            <Badge className="bg-amber-400/90 text-amber-900 text-[10px] border-0 px-1.5 py-0 font-semibold">
              <Award className="w-2.5 h-2.5 mr-0.5 inline" />
              Certifié
            </Badge>
          </div>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-1">
          <h3 className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-indigo-600 transition-colors">
            {course.title}
          </h3>
          <Badge className={`text-[10px] shrink-0 border-0 px-1.5 ${LEVEL_COLORS[course.level]}`}>
            {LEVEL_LABELS[course.level]}
          </Badge>
        </div>

        <p className={`text-xs font-medium ${t.textMuted}`}>{course.academyName}</p>
        <p className={`text-xs line-clamp-2 ${t.textSubtle}`}>{course.description}</p>

        <div className={`flex items-center gap-3 text-[11px] flex-wrap ${t.textMuted}`}>
          {course.reviewCount > 0 ? (
            <>
              <StarRating rating={course.rating / 10} />
              <span>({course.reviewCount})</span>
            </>
          ) : (
            <span className={t.textSubtle}>Aucun avis</span>
          )}
          {course.duration && (
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {course.duration}
            </span>
          )}
          {course.academyLocation && (
            <span className="flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />
              {course.academyLocation}
            </span>
          )}
        </div>

        <div className={`mt-auto pt-2 border-t ${t.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-[10px] ${t.textSubtle}`}>Prix</p>
              <p className="font-bold text-sm text-indigo-600">
                {fmt(course.priceInCents)}
              </p>
            </div>
            <Button
              size="sm"
              className="h-7 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3"
              onClick={() => onEnroll(course)}
              data-testid={`button-enroll-${course.id}`}
            >
              S'inscrire
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BaristaAcademyPage({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const accessLevel = useAccessLevel();
  const isDark = useThemeStore((s) => s.isDark);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const t = useTheme(isDark);

  const [trainingSearch, setTrainingSearch] = useState("");
  const [trainingLevel, setTrainingLevel] = useState("");
  const [trainingCert, setTrainingCert] = useState("");
  const [enrollTarget, setEnrollTarget] = useState<AcademyCourseCard | null>(null);

  const { data: courses = [], isLoading } = useAcademyCourses({
    search: trainingSearch || undefined,
    level: trainingLevel || undefined,
    certification: trainingCert || undefined,
  });

  const filteredTraining = useMemo(() => courses, [courses]);
  const hasTrainingFilters = !!(trainingSearch || trainingLevel || trainingCert);
  const certifiedCount = useMemo(() => courses.filter((c) => c.hasCertification).length, [courses]);

  const canAct = !!user && user.role === "CAFE_OWNER" && accessLevel === "approved";

  const handleEnroll = (course: AcademyCourseCard) => {
    if (!canAct) {
      if (!user) { navigate("/login"); return; }
      toast({ title: "Action réservée aux cafés approuvés", variant: "destructive" });
      return;
    }
    setEnrollTarget(course);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-5 pb-12 px-5 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80"
          style={{ backgroundImage: `url(${baristaHeroImg})` }}
        />
        <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-indigo-950/90" : "bg-gradient-to-br from-indigo-600/90 via-indigo-700/85 to-violet-700/90"}`} />
        <div className="relative">
          <div className="flex justify-end items-center gap-2 mb-9">
            <button onClick={toggleTheme} aria-label="Toggle theme" className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-amber-400" : "bg-white/20 hover:bg-white/30 text-white"}`}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
          <div className="max-w-3xl mx-auto text-center">
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-5 backdrop-blur-sm ${isDark ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}>
            <GraduationCap className={`w-8 h-8 ${isDark ? "text-amber-400" : "text-white"}`} />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
            BigBoss <span className={isDark ? "text-amber-400" : "text-amber-200"}>ACADEMY</span>
          </h1>
          <p className={`text-base mb-4 max-w-xl mx-auto ${isDark ? "text-gray-400" : "text-indigo-100"}`}>
            Formez votre équipe avec des programmes barista professionnels
          </p>
          <div className={`flex items-center justify-center gap-6 flex-wrap text-sm ${isDark ? "text-gray-400" : "text-indigo-100"}`}>
            <span className="flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4" />
              {courses.length} formations
            </span>
            <span className="flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              {certifiedCount} certifications
            </span>
          </div>
          </div>
        </div>
      </section>

      {comingSoon ? (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${t.mutedBg}`}>
            <Clock className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${t.textPrimary}`} data-testid="text-coming-soon-title">
            Bientôt disponible
          </h2>
          <p className={`text-sm max-w-md mx-auto ${t.textMuted}`}>
            Ce service est en cours de préparation. Revenez bientôt pour le découvrir.
          </p>
        </div>
      ) : (
      <>
      {accessLevel === "pending" && (
        <div className={`${isDark ? "bg-amber-950/40 border-amber-900/60" : "bg-amber-50 border-amber-200"} border-b px-4 py-3`}>
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-800 text-sm font-medium">
            <CheckCircle className="w-4 h-4 shrink-0" />
            Votre compte est en attente d'approbation. Vous pourrez vous inscrire aux formations une fois approuvé.
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        <section>
          {/* Training Filters */}
          <div className={`border rounded-2xl p-3 mb-5 shadow-sm ${t.cardBg}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <SlidersHorizontal className={`w-3.5 h-3.5 ${t.textSubtle} shrink-0`} />
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  value={trainingSearch}
                  onChange={(e) => setTrainingSearch(e.target.value)}
                  placeholder="Rechercher une formation..."
                  className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
                  data-testid="input-training-search"
                />
              </div>
              <Select
                value={trainingLevel || "__all__"}
                onValueChange={(v) => setTrainingLevel(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] ${t.inputBg}`} data-testid="select-training-level">
                  <SelectValue placeholder="Niveau" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Tous niveaux</SelectItem>
                  <SelectItem value="BEGINNER">Débutant</SelectItem>
                  <SelectItem value="ADVANCED">Avancé</SelectItem>
                  <SelectItem value="EXPERT">Expert</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={trainingCert || "__all__"}
                onValueChange={(v) => setTrainingCert(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] ${t.inputBg}`} data-testid="select-training-cert">
                  <SelectValue placeholder="Certification" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Toutes formations</SelectItem>
                  <SelectItem value="true">Avec certification</SelectItem>
                  <SelectItem value="false">Sans certification</SelectItem>
                </SelectContent>
              </Select>
              {hasTrainingFilters && (
                <button
                  onClick={() => {
                    setTrainingSearch("");
                    setTrainingLevel("");
                    setTrainingCert("");
                  }}
                  className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                  data-testid="button-reset-training-filters"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {[...Array(10)].map((_, i) => (
                <div key={i} className={`h-56 rounded-2xl border animate-pulse ${t.cardBg}`} />
              ))}
            </div>
          ) : filteredTraining.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <GraduationCap className="w-12 h-12 text-gray-200" />
              <p className="font-semibold text-gray-700">
                {courses.length === 0 && !hasTrainingFilters ? "Aucune formation disponible pour le moment" : "Aucune formation trouvée"}
              </p>
              <p className="text-sm text-gray-400">
                {courses.length === 0 && !hasTrainingFilters ? "Revenez bientôt : les académies publient régulièrement de nouvelles formations." : "Essayez d'ajuster vos filtres."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredTraining.map((course) => (
                <TrainingCard
                  key={course.id}
                  course={course}
                  canAct={canAct}
                  onEnroll={handleEnroll}
                  isDark={isDark}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      </>
      )}

      <EnrollDialog course={enrollTarget} open={!!enrollTarget} onClose={() => setEnrollTarget(null)} isDark={isDark} />
    </div>
  );
}
