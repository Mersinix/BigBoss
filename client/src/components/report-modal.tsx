import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle, Flag, X, Sun, Moon } from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { useToast } from "@/hooks/use-toast";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import { SadnessRatingPicker } from "@/components/shared/sadness-rating";

// Shared Coffee Owner "report a professional" modal (task: "Redesign
// Maintenance Reports Using the Avis Modal Pattern and Add Admin
// Moderation") — deliberately built to mirror client/src/components/
// review-modal.tsx's ReviewModal structure (header with grabber/theme toggle/
// centered title/close, divider, type badge, form card, submitted
// confirmation screen) so the two feel like the same design system, with the
// star picker swapped for the 5-level sadness rating. Built generic from the
// start so Print/Barista/Academy/Marketing/Shop can reuse it unchanged when
// they get the same redesign — only Maintenance wires it up in this task.
// Makes no network calls itself: the caller supplies its own target-specific
// submit mutation, same division of responsibility as ReviewModal.

interface Props {
  open: boolean;
  onClose: () => void;
  // Name of the professional/account being reported, shown in the header.
  targetName: string;
  // Performs the actual mutation — throw to signal failure (the generic
  // error toast here handles presentation).
  onSubmit: (rating: number, comment: string) => Promise<void> | void;
  isSubmitting: boolean;
  // Theme accent — lets each module keep its own palette (Maintenance:
  // orange/amber) instead of hardcoding one color here.
  accentClassName?: string;
}

export function ReportModal({ open, onClose, targetName, onSubmit, isSubmitting, accentClassName = "text-orange-500" }: Props) {
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { isDark, toggle } = useThemeStore();

  const dk = isDark;
  const bg          = dk ? "bg-gray-900"                        : "bg-white";
  const textPrimary = dk ? "text-white"                         : "text-gray-900";
  const textMuted   = dk ? "text-gray-400"                      : "text-gray-500";
  const divider     = dk ? "bg-gray-800"                        : "bg-gray-100";
  const iconBtn     = dk
    ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
    : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800";
  const inputCls    = dk
    ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-xl text-sm focus-visible:border-red-500 focus-visible:ring-red-500/20"
    : "border-gray-200 text-gray-900 rounded-xl text-sm focus-visible:border-red-500 focus-visible:ring-red-500/20";
  const labelCls    = dk ? "text-xs font-semibold text-gray-300" : "text-xs font-semibold text-gray-700";

  // Reset whenever the modal is (re)opened for a fresh target — never
  // carries a half-filled form from one report to another.
  useEffect(() => {
    if (open) { setRating(0); setComment(""); setSubmitted(false); }
  }, [open, targetName]);

  const handleClose = () => {
    setRating(0);
    setComment("");
    setSubmitted(false);
    onClose();
  };

  const canSubmit = rating > 0 && comment.trim().length > 0;

  const handleSubmit = async () => {
    try {
      await onSubmit(rating, comment.trim());
      setSubmitted(true);
      toast({ title: "Signalement envoyé", description: "L'équipe Admin va l'examiner." });
      setTimeout(() => { handleClose(); }, 1500);
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Veuillez réessayer.", variant: "destructive" });
    }
  };

  const {
    onBodyWheel, onBodyTouchStart, onBodyTouchMove, onBodyTouchEnd,
    dismissContentStyle, dismissOverlayStyle,
  } = useScrollDismiss(open, handleClose, undefined, true);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="sm:max-w-[480px] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden"
        style={dismissContentStyle}
        overlayStyle={dismissOverlayStyle}
      >
        <VisuallyHidden><DialogTitle>Signaler un problème — {targetName}</DialogTitle></VisuallyHidden>

        <div className={`flex flex-col max-h-[90vh] overflow-hidden transition-colors duration-200 ${bg}`}>
          <div className={`shrink-0 ${bg} px-5 pt-1 pb-4`}>
            <ModalGrabber isDark={dk} />
            <div className="flex items-center justify-between mb-4 mt-1">
              <button
                onClick={toggle}
                aria-label="Changer de thème"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
              </button>

              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight ${textPrimary}`}>Signaler un problème</span>
                <span className={`text-[11px] font-medium ${textMuted}`}>{targetName}</span>
              </div>

              <button
                onClick={handleClose}
                aria-label="Fermer"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className={`mt-4 h-px w-full ${divider}`} />
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto px-5 pb-6
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-gray-700
              hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
            style={{ WebkitOverflowScrolling: "touch" }}
            onWheel={onBodyWheel}
            onTouchStart={onBodyTouchStart}
            onTouchMove={onBodyTouchMove}
            onTouchEnd={onBodyTouchEnd}
          >
            <div className={`flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold rounded-xl ${dk ? "bg-gray-800 text-gray-200" : "bg-gray-100 text-gray-700"}`}>
              <Flag className="w-3.5 h-3.5" /> Signalement envoyé à l'équipe Admin
            </div>

            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${dk ? "bg-emerald-500/15" : "bg-emerald-50"}`}>
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <p className={`font-semibold ${textPrimary}`}>Signalement envoyé !</p>
                <p className={`text-sm ${textMuted}`}>L'équipe Admin va l'examiner avant toute publication.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5 py-1">
                <div className={`p-3 rounded-xl border space-y-3 ${dk ? "border-gray-700" : "border-gray-200"}`}>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Note *</label>
                    <SadnessRatingPicker value={rating} onChange={setRating} isDark={dk} accentClassName={accentClassName} />
                  </div>

                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Décrivez le problème…"
                    className={`resize-none text-sm rounded-xl ${inputCls}`}
                    rows={3}
                    data-testid="input-report-comment"
                  />

                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!canSubmit || isSubmitting}
                    className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white border-0"
                    data-testid="button-submit-report"
                  >
                    {isSubmitting ? "Envoi…" : "Envoyer le signalement"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
