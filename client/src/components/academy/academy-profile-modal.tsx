import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useThemeStore } from "@/store/theme-store";
import {
  useAcademyProfileDetail,
  useAcademyReviews,
  useReportAcademy,
  startAcademyConversation,
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
  Star, MapPin, Clock, Flag, MessageCircle, X, GraduationCap, BookOpen, Calendar,
} from "lucide-react";

const LEVEL_LABELS: Record<AcademyCourseLevel, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };

function formatSessionDate(d: string): string {
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// Availability modal — same container/header/scrollbar chrome as the other
// availability modals (BaristaAvailabilityModal / AcademyAvailabilityModal in
// academy-detail-modal.tsx), but aggregated across ALL of this Academy's
// published formations (real academyCourseSessions rows, never fabricated
// opening hours — an Academy has no weeklyHours concept, same reasoning as
// the per-course availability modal it mirrors).
function AcademyProfileAvailabilityModal({
  open, onClose, academyName, sessions, isDark,
}: {
  open: boolean;
  onClose: () => void;
  academyName: string;
  sessions: { id: number; courseTitle: string; startDate: string; endDate: string | null; capacity: number | null }[];
  isDark: boolean;
}) {
  const dk = isDark;
  const bg = dk ? "bg-gray-900" : "bg-white";
  const textPrimary = dk ? "text-white" : "text-gray-900";
  const textMuted = dk ? "text-gray-400" : "text-gray-500";
  const rowBg = dk ? "bg-gray-800 border-gray-700/60" : "bg-gray-50 border-gray-100";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Disponibilité — {academyName}</DialogTitle></VisuallyHidden>
        <div className={`flex flex-col max-h-[88vh] overflow-hidden transition-colors duration-200 ${bg}`}>
          <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={onClose} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}>
                <X className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight leading-tight ${textPrimary}`}>{academyName}</span>
                <span className={`text-[11px] font-medium ${textMuted}`}>Disponibilité</span>
              </div>
              <div className="w-8 h-8" />
            </div>
            <div className={`h-px w-full ${dk ? "bg-gray-800" : "bg-gray-100"}`} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
            {sessions.length > 0 ? (
              <div className="space-y-2 pb-2">
                {sessions.map((session) => (
                  <div key={session.id} className={`flex items-center justify-between border rounded-2xl px-4 py-3 transition-colors ${rowBg}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className={`w-3.5 h-3.5 shrink-0 ${textMuted}`} />
                      <div className="min-w-0">
                        <p className={`text-[13px] font-medium truncate ${textPrimary}`}>{session.courseTitle}</p>
                        <p className={`text-[11px] ${textMuted}`}>
                          {formatSessionDate(session.startDate)}{session.endDate ? ` → ${formatSessionDate(session.endDate)}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`text-center py-12 ${textMuted}`}>
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className={`text-sm font-medium ${textPrimary}`}>Aucune session programmée</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Academy-level details modal (Part 43's "Academy Profile Details modal") —
// distinct from AcademyDetailModal (per-FORMATION) in academy-detail-modal.tsx,
// same visual reference (Barista details modal), reused identically from the
// Academy's own Eye preview, the "Académie" section inside a Formation modal,
// and Admin's Academy card. Fed by GET /api/academy/profile/:userId (same
// route/cache the self-editor and Admin overview already use) — no separate
// profile system.
export function AcademyProfileModal({
  academyUserId, open, onClose, onOpenCourse, readOnly = false,
}: {
  academyUserId: number | null;
  open: boolean;
  onClose: () => void;
  // Clicking a related formation closes this modal and hands the courseId back to the
  // caller, which opens the existing AcademyDetailModal — same nested-navigation pattern
  // used elsewhere (Part 16 "keep modal behavior clean and consistent").
  onOpenCourse?: (courseId: number) => void;
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const [, navigate] = useLocation();
  const isDark = useThemeStore((s) => s.isDark);
  const t = {
    modalBg: isDark ? "bg-gray-900" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    sectionBg: isDark ? "bg-gray-800/60" : "bg-gray-50",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
  };
  const { data, isLoading } = useAcademyProfileDetail(academyUserId);
  const card = data?.card;
  const { data: reviews = [] } = useAcademyReviews(academyUserId);
  const reportAcademy = useReportAcademy();

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [messaging, setMessaging] = useState(false);

  const handleClose = () => {
    setReportModalOpen(false);
    setReportReason("");
    onClose();
  };

  const handleMessage = async () => {
    if (!card || readOnly) return;
    setMessaging(true);
    try {
      const res = await startAcademyConversation(card.userId);
      navigate(`/cafe/messages?service=ACADEMY&conversationId=${res.conversation.id}`);
      handleClose();
    } catch (err: any) {
      toast({ title: "Contact impossible", description: err?.message ?? "Veuillez réessayer.", variant: "destructive" });
    } finally {
      setMessaging(false);
    }
  };

  const submitReport = () => {
    if (!card || !reportReason.trim() || readOnly) return;
    reportAcademy.mutate(
      { academyUserId: card.userId, reason: reportReason.trim() },
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
        <VisuallyHidden><DialogTitle>{card?.name ?? "Académie"}</DialogTitle></VisuallyHidden>
        {isLoading || !card ? (
          <div className="p-6 space-y-4">
            <Skeleton className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-40 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
          </div>
        ) : (
          <div className="flex flex-col">
            <div className={`w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={getAvatarUrl({ profileImageUrl: card.profileImageUrl })} alt={card.name} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-indigo-600 to-violet-700">
                  <GraduationCap className="w-16 h-16 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="absolute top-3 right-3 flex gap-2">
                <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={handleClose} data-testid="button-close-academy-profile-modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={() => { if (!readOnly) setReportModalOpen(true); }} title="Signaler" data-testid="button-open-academy-profile-report" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Flag className="w-4 h-4 text-white" /></button>
                <button onClick={() => setAvailabilityModalOpen(true)} title="Disponibilité" data-testid="button-open-academy-profile-availability" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Clock className="w-4 h-4 text-white" /></button>
              </div>
              {!card.marketplaceVisible && (
                <span className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm bg-black/50 text-white/80">
                  Profil masqué
                </span>
              )}
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{card.name}</h2>
                  <Badge className={`text-[10px] border-0 px-1.5 shrink-0 ${isDark ? "bg-indigo-900/50 text-indigo-300" : "bg-indigo-100 text-indigo-700"}`}>Académie</Badge>
                </div>
                {card.description && <p className={`text-sm leading-relaxed mt-1.5 ${t.textMuted}`}>{card.description}</p>}
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  {card.reviewCount > 0 && <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {(card.rating / 10).toFixed(1)} ({card.reviewCount} avis)</span>}
                  {card.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {card.location}</span>}
                </div>
              </div>

              {/* Formations — real published courses, clicking one opens the existing
                  per-formation AcademyDetailModal (Part 16). */}
              <div>
                <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${t.textMuted}`}><BookOpen className="w-3.5 h-3.5" /> Formations ({card.courses.length})</p>
                {card.courses.length === 0 ? (
                  <p className={`text-xs ${t.textMuted}`}>Aucune formation publiée pour le moment.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {card.courses.map((course) => (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => onOpenCourse?.(course.id)}
                        className={`text-left p-3 rounded-xl border transition-colors ${t.border} ${isDark ? "hover:border-indigo-600" : "hover:border-indigo-300"} ${t.sectionBg}`}
                        data-testid={`button-academy-profile-course-${course.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium truncate ${t.textPrimary}`}>{course.title}</p>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${isDark ? "border-gray-700 text-gray-300" : ""}`}>{LEVEL_LABELS[course.level]}</Badge>
                        </div>
                        <p className={`text-xs mt-1 ${t.textMuted}`}>{fmt(course.priceInCents)}{course.duration ? ` · ${course.duration}` : ""}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Reviews — read-only aggregate, same real data every course card shows. */}
              <div>
                <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Avis ({reviews.length})</p>
                {reviews.length === 0 ? (
                  <p className={`text-xs ${t.textMuted}`}>Aucun avis pour le moment.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {reviews.map((r) => (
                      <div key={r.id} className={`p-2.5 rounded-lg text-sm ${t.sectionBg}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-medium text-xs ${t.textPrimary}`}>{r.cafeOwnerName || r.cafeName}</span>
                          <span className="flex items-center gap-0.5 text-amber-500 text-xs"><Star className="w-3 h-3 fill-amber-400" /> {r.rating}</span>
                        </div>
                        {r.comment && <p className={`text-xs mt-1 ${t.textMuted}`}>{r.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={`p-5 sm:p-6 pt-0 flex flex-wrap gap-2 justify-end border-t mt-1 pt-4 ${t.border}`}>
              <Button variant="outline" size="sm" className={`gap-1.5 ${t.textPrimary} ${isDark ? "border-gray-700" : ""}`} onClick={handleMessage} disabled={messaging} data-testid="button-message-academy-profile">
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
      <DialogContent className={`sm:max-w-md ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>Signaler {card?.name ?? ""}</DialogTitle></VisuallyHidden>
        <div className="space-y-2">
          <p className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler {card?.name}</p>
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

    <AcademyProfileAvailabilityModal
      open={availabilityModalOpen}
      onClose={() => setAvailabilityModalOpen(false)}
      academyName={card?.name ?? ""}
      sessions={card?.upcomingSessions ?? []}
      isDark={isDark}
    />
    </>
  );
}
