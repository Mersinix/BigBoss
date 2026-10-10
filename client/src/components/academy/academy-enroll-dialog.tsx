import { useEffect, useState } from "react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { useCreateAcademyRegistration, useAcademyCourseSessions, type AcademyCourseCard } from "@/hooks/use-barista-academy";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send } from "lucide-react";

// Extracted from barista-academy-page.tsx (Coffee Owner's /academy) so Espace Barista
// Marketplace → Académie can reuse the exact same registration form instead of a
// duplicated implementation — analyse.md "Aligner Espace Barista Marketplace →
// Académie sur Coffee Owner /academy". Behavior unchanged — role-agnostic already
// (useCreateAcademyRegistration scopes to the authenticated session server-side,
// confirmed in server/routes.ts for both CAFE_OWNER and BARISTA_MARKETPLACE).
function useTheme(isDark: boolean) {
  return {
    cardBg: isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    selectContent: isDark
      ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white"
      : "bg-white border-gray-200 text-gray-900",
  };
}

export function EnrollDialog({ course, open, onClose, isDark }: { course: AcademyCourseCard | null; open: boolean; onClose: () => void; isDark: boolean }) {
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
      <DialogContent className={`sm:max-w-md rounded-2xl border-0 shadow-2xl ${t.cardBg} ${t.textPrimary}`}>
        <VisuallyHidden><DialogTitle>S'inscrire à {course.title}</DialogTitle></VisuallyHidden>
        <div className="space-y-3">
          <div>
            <h2 className={`font-bold text-base leading-tight ${t.textPrimary}`}>{course.title}</h2>
            <p className={`text-xs ${t.textMuted}`}>{course.academyName} · {fmt(course.priceInCents)} / participant</p>
          </div>
          {sessions.length > 0 && (
            <div>
              <label className={`text-xs font-medium mb-1 block ${t.textMuted}`}>Session</label>
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
            <label className={`text-xs font-medium mb-1 block ${t.textMuted}`}>Nombre de participants</label>
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
            <Button
              variant="outline"
              onClick={onClose}
              className={isDark ? "border-gray-700 text-gray-200 hover:bg-gray-700 hover:text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"}
            >
              Annuler
            </Button>
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
