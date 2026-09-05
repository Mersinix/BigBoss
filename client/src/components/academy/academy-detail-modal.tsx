import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useFavorites } from "@/hooks/use-favorites";
import { useThemeStore } from "@/store/theme-store";
import {
  useAcademyCourseDetail,
  useAcademyReviews,
  useAcademyRegistrations,
  useAcademyCourseSessions,
  useCreateAcademyReview,
  useReportAcademy,
  startAcademyConversation,
  type AcademyCourseCard,
  type AcademyCourseLevel,
} from "@/hooks/use-barista-academy";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star, MapPin, Clock, Award, MessageCircle,
  Flag, Heart, X, GraduationCap, Layers, Users, Calendar,
} from "lucide-react";
import { AcademyProfileModal } from "@/components/academy/academy-profile-modal";

const LEVEL_LABELS: Record<AcademyCourseLevel, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };
// This app's dark mode is NOT Tailwind's `dark:` class strategy on the Coffee
// Owner side — nothing in the Coffee Owner app ever adds a `.dark` class to
// the DOM (see barista-detail-modal.tsx's own note). Every already-correct
// dark-mode-aware surface here branches literal Tailwind classes off the
// `isDark` boolean directly instead.
function levelColors(isDark: boolean): Record<AcademyCourseLevel, string> {
  return isDark
    ? { BEGINNER: "bg-green-900/50 text-green-300", ADVANCED: "bg-blue-900/50 text-blue-300", EXPERT: "bg-purple-900/50 text-purple-300" }
    : { BEGINNER: "bg-green-100 text-green-700", ADVANCED: "bg-blue-100 text-blue-700", EXPERT: "bg-purple-100 text-purple-700" };
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} data-testid={`button-star-${n}`}>
          <Star className={`w-5 h-5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Inscription en attente", CONFIRMED: "Inscription confirmée", COMPLETED: "Formation terminée",
};

function formatSessionDate(d: string): string {
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// Availability modal — same container/header/scrollbar chrome as
// BaristaAvailabilityModal (client/src/components/barista/barista-detail-modal.tsx),
// but Academy availability is real upcoming COURSE SESSIONS (academyCourseSessions)
// rather than a weekly schedule — Academy has no weeklyHours concept, so this
// reuses the exact same data the registration flow's own session picker
// already shows (useAcademyCourseSessions), never fabricated opening hours.
function AcademyAvailabilityModal({
  open, onClose, courseId, courseTitle, isDark,
}: {
  open: boolean;
  onClose: () => void;
  courseId: number | null;
  courseTitle: string;
  isDark: boolean;
}) {
  const { data: sessions = [], isLoading } = useAcademyCourseSessions(open ? courseId : null);

  const dk = isDark;
  const bg = dk ? "bg-gray-900" : "bg-white";
  const textPrimary = dk ? "text-white" : "text-gray-900";
  const textMuted = dk ? "text-gray-400" : "text-gray-500";
  const rowBg = dk ? "bg-gray-800 border-gray-700/60" : "bg-gray-50 border-gray-100";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Disponibilité — {courseTitle}</DialogTitle></VisuallyHidden>
        <div className={`flex flex-col max-h-[88vh] overflow-hidden transition-colors duration-200 ${bg}`}>
          <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={onClose} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}>
                <X className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight leading-tight ${textPrimary}`}>{courseTitle}</span>
                <span className={`text-[11px] font-medium ${textMuted}`}>Disponibilité</span>
              </div>
              <div className="w-8 h-8" />
            </div>
            <div className={`h-px w-full ${dk ? "bg-gray-800" : "bg-gray-100"}`} />
          </div>
          <div
            className="flex-1 min-h-0 overflow-y-auto px-5 pb-6
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-gray-700
              hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {isLoading ? (
              <div className={`text-center py-12 ${textMuted}`}>Chargement…</div>
            ) : sessions.length > 0 ? (
              <div className="space-y-2 pb-2">
                {sessions.map((session) => (
                  <div key={session.id} className={`flex items-center justify-between border rounded-2xl px-4 py-3 transition-colors ${rowBg}`}>
                    <div className="flex items-center gap-2">
                      <Calendar className={`w-3.5 h-3.5 ${textMuted}`} />
                      <span className={`text-[13px] font-medium ${textPrimary}`}>
                        {formatSessionDate(session.startDate)}
                        {session.endDate ? ` → ${formatSessionDate(session.endDate)}` : ""}
                      </span>
                    </div>
                    {session.capacity != null && (
                      <span className={`text-[12px] font-medium tabular-nums flex items-center gap-1 ${textMuted}`}>
                        <Users className="w-3 h-3" /> {session.capacity} places
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`text-center py-12 ${textMuted}`}>
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className={`text-sm font-medium ${textPrimary}`}>Aucune session programmée</p>
                <p className="text-xs mt-1 opacity-50">Cette académie n'a pas encore planifié de session pour cette formation.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Comprehensive Coffee-Owner-facing Academy formation details modal — mirrors
// BaristaDetailModal's/MarketingDetailModal's exact structure/hierarchy/
// spacing/interaction pattern, reusing the same GET /api/academy/courses/:id
// route as the mapped card, and the existing registration/review/report/
// messaging systems — no separate data copy, no new design.
export function AcademyDetailModal({
  courseId,
  open,
  onClose,
  onEnroll,
  readOnly = false,
}: {
  courseId: number | null;
  open: boolean;
  onClose: () => void;
  onEnroll: (course: AcademyCourseCard) => void;
  // Used by the Academy's own "preview my formation" (Eye icon on Business →
  // Formations/Profil): renders the exact same modal a Coffee Owner sees, but
  // Favorite/Report/Message/Avis/S'inscrire become inert (no self-favorite,
  // self-message, self-report, or self-registration) — only Disponibilité
  // stays functional, and the "Académie" section still opens the real
  // AcademyProfileModal (also read-only there).
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const [, navigate] = useLocation();
  const isDark = useThemeStore((s) => s.isDark);
  const LEVEL_COLORS = levelColors(isDark);
  const t = {
    modalBg: isDark ? "bg-gray-900" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    sectionBg: isDark ? "bg-gray-800/60" : "bg-gray-50",
    sectionBgAlt: isDark ? "bg-gray-800/40" : "bg-gray-50",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
  };
  // Nested navigation (Part 16): clicking a related formation inside the Academy Profile
  // modal (opened from the "Académie" section below) swaps which course this SAME dialog
  // queries, instead of requiring every caller to manage a second piece of state.
  const [navCourseId, setNavCourseId] = useState<number | null>(null);
  const [academyProfileOpen, setAcademyProfileOpen] = useState(false);
  const effectiveCourseId = navCourseId ?? courseId;
  const { data: course, isLoading } = useAcademyCourseDetail(effectiveCourseId);
  const { data: reviews = [] } = useAcademyReviews(course?.academyUserId ?? null);
  const { data: registrations = [] } = useAcademyRegistrations();
  const createReview = useCreateAcademyReview();
  const reportAcademy = useReportAcademy();

  const faved = useFavorites((s) => (courseId ? !!s.academy[courseId] : false));
  const toggleAcademy = useFavorites((s) => s.toggleAcademy);

  const [reviewRegistrationId, setReviewRegistrationId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [messaging, setMessaging] = useState(false);

  // Review eligibility mirrors the existing server rule exactly: one review
  // per COMPLETED registration with this Academy (rating aggregates at the
  // Academy level — same as every course card already shows).
  const eligibleRegistrations = useMemo(
    () => (course ? registrations.filter((r) => r.academyUserId === course.academyUserId && r.status === "COMPLETED") : []),
    [registrations, course]
  );
  const myReviewByRegistration = useMemo(() => {
    const map = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews) if (r.cafeId === user?.id) map.set(r.academyRegistrationId, r);
    return map;
  }, [reviews, user?.id]);
  const activeRegistrationId = reviewRegistrationId ?? eligibleRegistrations.find((r) => !myReviewByRegistration.has(r.id))?.id ?? eligibleRegistrations[0]?.id ?? null;
  const existingReview = activeRegistrationId ? myReviewByRegistration.get(activeRegistrationId) : undefined;

  // Existing registration state for THIS course (Part 9) — never a second
  // registration mechanism, just a read of the same academyRegistrations data.
  const myActiveRegistration = useMemo(
    () => (course ? registrations.find((r) => r.courseId === course.id && ["PENDING", "CONFIRMED", "COMPLETED"].includes(r.status)) : undefined),
    [registrations, course]
  );

  const heroImage = course ? (course.imageUrl || course.academyProfileImageUrl) : null;

  const handleClose = () => {
    setReviewRegistrationId(null);
    setReportModalOpen(false);
    setReportReason("");
    setNavCourseId(null);
    setAcademyProfileOpen(false);
    onClose();
  };

  const handleMessage = async () => {
    if (!course || readOnly) return;
    setMessaging(true);
    try {
      const res = await startAcademyConversation(course.academyUserId);
      navigate(`/cafe/messages?service=ACADEMY&conversationId=${res.conversation.id}`);
      handleClose();
    } catch (err: any) {
      toast({ title: "Contact impossible", description: err?.message ?? "Veuillez réessayer.", variant: "destructive" });
    } finally {
      setMessaging(false);
    }
  };

  const submitReview = () => {
    if (!course || !activeRegistrationId || readOnly) return;
    createReview.mutate(
      { academyUserId: course.academyUserId, registrationId: activeRegistrationId, rating: reviewRating, comment: reviewComment.trim() || undefined },
      {
        onSuccess: () => { toast({ title: "Avis envoyé" }); setReviewComment(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const submitReport = () => {
    if (!course || !reportReason.trim() || readOnly) return;
    reportAcademy.mutate(
      { academyUserId: course.academyUserId, reason: reportReason.trim() },
      {
        onSuccess: () => { toast({ title: "Signalement envoyé", description: "L'équipe Admin va l'examiner." }); setReportModalOpen(false); setReportReason(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className={`sm:max-w-2xl rounded-2xl border-0 shadow-2xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>{course?.title ?? "Formation"}</DialogTitle></VisuallyHidden>
        {isLoading || !course ? (
          <div className="p-6 space-y-4">
            <Skeleton className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-40 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Header image — formation image, Academy public photo fallback,
                same treatment/position as Barista's modal. */}
            <div className={`w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={getAvatarUrl({ profileImageUrl: heroImage })} alt={course.title} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-indigo-600 to-violet-700">
                  <GraduationCap className="w-16 h-16 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="absolute top-3 right-3 flex gap-2">
                <button
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"
                  onClick={() => { if (!readOnly) toggleAcademy({
                    id: course.id, title: course.title, provider: course.academyName, duration: course.duration,
                    rating: course.rating / 10, price: course.priceInCents, level: course.level,
                    location: course.location || course.academyLocation, hasCertification: course.hasCertification,
                    imageUrl: heroImage,
                  }); }}
                  data-testid={`button-fav-modal-${course.id}`}
                >
                  <Heart className={`w-4 h-4 ${faved ? "fill-rose-400 text-rose-400" : "text-white"}`} />
                </button>
                <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={handleClose} data-testid="button-close-academy-modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={() => { if (!readOnly) setReportModalOpen(true); }} title="Signaler" data-testid="button-open-academy-report" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Flag className="w-4 h-4 text-white" /></button>
                <button onClick={() => setAvailabilityModalOpen(true)} title="Disponibilité" data-testid="button-open-academy-availability" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Clock className="w-4 h-4 text-white" /></button>
              </div>
              {course.hasCertification && (
                <span className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm bg-amber-400/90 text-amber-900">
                  <Award className="w-3 h-3" /> Certifié
                </span>
              )}
            </div>

            {/* Body */}
            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{course.title}</h2>
                  <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${LEVEL_COLORS[course.level]}`}>{LEVEL_LABELS[course.level]}</Badge>
                </div>
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {(course.rating / 10).toFixed(1)} ({course.reviewCount} avis)</span>
                  {(course.location || course.academyLocation) && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {course.location || course.academyLocation}</span>}
                  {course.duration && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {course.duration}</span>}
                </div>
                {course.description && <p className={`text-sm leading-relaxed mt-2.5 ${t.textMuted}`}>{course.description}</p>}
              </div>

              {/* Formation */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textMuted}`}>Prix</p>
                  <p className="font-bold text-indigo-600">{fmt(course.priceInCents)}</p>
                </div>
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textMuted}`}>Catégorie</p>
                  <p className={`font-bold ${t.textPrimary}`}>{course.category || "—"}</p>
                </div>
                {course.trainingMode && (
                  <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                    <p className={`text-[11px] ${t.textMuted}`}>Format</p>
                    <p className={`font-bold ${t.textPrimary}`}>{course.trainingMode}</p>
                  </div>
                )}
                {course.capacity != null && (
                  <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                    <p className={`text-[11px] ${t.textMuted} flex items-center gap-1`}><Users className="w-3 h-3" /> Places</p>
                    <p className={`font-bold ${t.textPrimary}`}>{course.capacity}</p>
                  </div>
                )}
              </div>

              {/* Academy — clicking opens the Academy Profile Details modal (Part 14),
                  the same synchronized representation reused everywhere an Academy is
                  shown (Eye preview, Admin card). */}
              <button
                type="button"
                onClick={() => setAcademyProfileOpen(true)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${t.border} ${isDark ? "hover:border-indigo-600" : "hover:border-indigo-300"} ${t.sectionBgAlt}`}
                data-testid="button-open-academy-profile"
              >
                <p className={`text-xs font-semibold mb-2 flex items-center gap-1 ${t.textMuted}`}><Layers className="w-3.5 h-3.5" /> Académie</p>
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 shrink-0">
                    <AvatarImage src={getAvatarUrl({ profileImageUrl: course.academyProfileImageUrl })} alt={course.academyName} />
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold text-sm">
                      {course.academyName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm truncate ${t.textPrimary}`}>{course.academyName}</p>
                    {course.academyLocation && <p className={`text-xs flex items-center gap-1 ${t.textMuted}`}><MapPin className="w-3 h-3" /> {course.academyLocation}</p>}
                  </div>
                </div>
                {course.academyDescription && <p className={`text-xs mt-2.5 leading-relaxed ${t.textMuted}`}>{course.academyDescription}</p>}
              </button>

              {/* Reviews */}
              <div>
                <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Avis ({reviews.length})</p>
                {reviews.length === 0 ? (
                  <p className={`text-xs ${t.textMuted}`}>Aucun avis pour le moment.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {reviews.map((r) => (
                      <div key={r.id} className={`p-2.5 rounded-lg text-sm ${t.sectionBgAlt}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-medium text-xs ${t.textPrimary}`}>{r.cafeOwnerName || r.cafeName}</span>
                          <span className="flex items-center gap-0.5 text-amber-500 text-xs"><Star className="w-3 h-3 fill-amber-400" /> {r.rating}</span>
                        </div>
                        {r.comment && <p className={`text-xs mt-1 ${t.textMuted}`}>{r.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {eligibleRegistrations.length > 0 && (
                  <div className={`mt-3 p-3 rounded-xl border space-y-2 ${t.border}`}>
                    <p className={`text-xs font-medium ${t.textPrimary}`}>{existingReview ? "Modifier votre avis" : "Laisser un avis"}</p>
                    {eligibleRegistrations.length > 1 && (
                      <select
                        className={`w-full text-xs rounded-lg border px-2 py-1.5 ${t.inputBg}`}
                        value={activeRegistrationId ?? ""}
                        onChange={(e) => setReviewRegistrationId(Number(e.target.value))}
                        data-testid="select-review-registration"
                      >
                        {eligibleRegistrations.map((r) => (
                          <option key={r.id} value={r.id}>{r.courseTitle || `Formation #${r.courseId}`} {myReviewByRegistration.has(r.id) ? "(déjà noté)" : ""}</option>
                        ))}
                      </select>
                    )}
                    <StarPicker value={existingReview?.rating ?? reviewRating} onChange={setReviewRating} />
                    <Textarea
                      placeholder="Commentaire (facultatif)"
                      rows={2}
                      defaultValue={existingReview?.comment ?? ""}
                      onChange={(e) => setReviewComment(e.target.value)}
                      className={t.inputBg}
                      data-testid="input-review-comment"
                    />
                    <Button size="sm" onClick={submitReview} disabled={createReview.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-submit-review">
                      {createReview.isPending ? "Envoi…" : existingReview ? "Mettre à jour l'avis" : "Envoyer l'avis"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className={`p-5 sm:p-6 pt-0 flex flex-wrap gap-2 justify-end border-t mt-1 pt-4 ${t.border}`}>
              <Button variant="outline" size="sm" className={`gap-1.5 ${t.textPrimary} ${isDark ? "border-gray-700" : ""}`} onClick={handleMessage} disabled={messaging} data-testid="button-message-academy">
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </Button>
              {myActiveRegistration ? (
                <Badge className={`px-3 py-1.5 border-0 text-xs ${isDark ? "bg-indigo-900/50 text-indigo-300" : "bg-indigo-100 text-indigo-700"}`}>
                  {REGISTRATION_STATUS_LABELS[myActiveRegistration.status] ?? myActiveRegistration.status}
                </Badge>
              ) : (
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5" onClick={() => { if (!readOnly) onEnroll(course); }} data-testid="button-enroll-academy-modal">
                  S'inscrire
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
      <DialogContent className={`sm:max-w-md ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>Signaler {course?.academyName ?? ""}</DialogTitle></VisuallyHidden>
        <div className="space-y-2">
          <p className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler {course?.academyName}</p>
          <Textarea placeholder="Décrivez le problème…" rows={3} value={reportReason} onChange={(e) => setReportReason(e.target.value)} className={t.inputBg} data-testid="input-report-reason" />
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" className={t.textPrimary} onClick={() => { setReportModalOpen(false); setReportReason(""); }}>Annuler</Button>
            <Button size="sm" variant="destructive" onClick={submitReport} disabled={!reportReason.trim() || reportAcademy.isPending} data-testid="button-submit-report">
              {reportAcademy.isPending ? "Envoi…" : "Envoyer le signalement"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AcademyAvailabilityModal
      open={availabilityModalOpen}
      onClose={() => setAvailabilityModalOpen(false)}
      courseId={course?.id ?? null}
      courseTitle={course?.title ?? ""}
      isDark={isDark}
    />

    <AcademyProfileModal
      academyUserId={course?.academyUserId ?? null}
      open={academyProfileOpen}
      onClose={() => setAcademyProfileOpen(false)}
      onOpenCourse={(newCourseId) => { setNavCourseId(newCourseId); setAcademyProfileOpen(false); }}
      readOnly={readOnly}
    />
    </>
  );
}
