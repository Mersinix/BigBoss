import { useState, useEffect, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Star, CheckCircle, Package, X, Sun, Moon } from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";

// Shared Coffee Owner -> Shop "Avis" modal — used by BOTH the Product Detail
// and Pack Detail modals (task: "Use One Shared Avis Modal for Products and
// Packs"). One visual/structural source of truth: this component owns the
// form UI, local rating/comment state, the submitted/success screen, the
// existing-reviews list rendering, and the swipe-to-dismiss/grabber
// behavior. It makes no network calls itself — each caller fetches its own
// existing reviews and performs its own target-specific submit mutation
// (different API route, payload shape, and cache invalidation for products
// vs packs), supplied here via props/callbacks.

export interface AvisReviewRow {
  id: number | string;
  cafeId?: number;
  cafeOwnerName?: string | null;
  cafeName?: string | null;
  rating: number;
  comment?: string | null;
  createdAt?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  // Target name shown in the header subtitle (product name or pack name).
  targetName: string;
  // Badge text under the header (e.g. "Avis sur le produit" / "Avis sur le
  // pack") — content differs per target, presentation does not.
  reviewTypeLabel: string;
  existingReviews: AvisReviewRow[];
  // The viewer's own existing review for this target, already resolved by
  // the caller (its own query/derivation) — null/undefined means "creating
  // a new review".
  myReview?: { rating: number; comment?: string | null } | null;
  // Performs the actual mutation (API call + cache invalidation) for
  // whichever target this instance represents. Throw to signal failure —
  // the generic error toast below handles presentation.
  onSubmit: (rating: number, comment: string) => Promise<void> | void;
  isSubmitting: boolean;
  // Additive, defaults to true — when false, the write-a-review form is
  // hidden and only the existing-reviews list is shown. Matches the Pack
  // Detail Avis modal's existing permission gating (canReview), preserved
  // as-is. The Product Detail Avis modal never needed this: its own "Avis"
  // button is already hidden for ineligible viewers by its caller, so it
  // always passes the default.
  canReview?: boolean;
  // Additive, defaults to undefined (no extra content) — a target-specific
  // slot rendered inside the form card, above the "Note *" rating label.
  // Only Barista uses this today (its mission-select dropdown, shown when
  // the viewer has more than one eligible completed mission to review) —
  // every other target omits it.
  extraFormContent?: ReactNode;
  // Additive, defaults to 0 — initial star rating when creating a new
  // review (myReview is null/undefined). Only Barista overrides this (its
  // existing workflow pre-selects 5 stars for a brand-new review); every
  // other target keeps the default.
  defaultRating?: number;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(i)}
          className="p-0.5"
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              i <= (hovered || value)
                ? "fill-amber-400 text-amber-400"
                : "text-gray-400"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-gray-600/25 dark:text-gray-400/25"}`}
        />
      ))}
    </div>
  );
}

export function ReviewModal({
  open, onClose, targetName, reviewTypeLabel, existingReviews, myReview, onSubmit, isSubmitting, canReview = true,
  extraFormContent, defaultRating = 0,
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rating, setRating] = useState(defaultRating);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { isDark, toggle } = useThemeStore();

  // ── Theme tokens ─────────────────────────────────────────────────────────────
  const dk = isDark;
  const bg          = dk ? "bg-gray-900"                        : "bg-white";
  const textPrimary = dk ? "text-white"                         : "text-gray-900";
  const textMuted   = dk ? "text-gray-400"                      : "text-gray-500";
  const divider     = dk ? "bg-gray-800"                        : "bg-gray-100";
  const iconBtn     = dk
    ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
    : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800";
  const inputCls    = dk
    ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-xl text-sm focus-visible:border-amber-500 focus-visible:ring-amber-500/20"
    : "border-gray-200 text-gray-900 rounded-xl text-sm focus-visible:border-amber-500 focus-visible:ring-amber-500/20";
  const labelCls    = dk ? "text-xs font-semibold text-gray-300" : "text-xs font-semibold text-gray-700";
  const reviewCardBg = dk ? "bg-gray-800/60 border-gray-700/40" : "bg-gray-50 border-gray-100";

  // Pre-populate (or reset) the form whenever the caller's resolved
  // "my review" changes — same behavior the Product Detail modal already
  // had, now also covering Pack (which previously never reset to empty
  // when no review existed).
  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating ?? 0);
      setComment(myReview.comment ?? "");
    } else {
      setRating(defaultRating);
      setComment("");
    }
  }, [myReview, defaultRating]);

  const isEditing = !!myReview;

  const handleClose = () => {
    setRating(0);
    setComment("");
    setSubmitted(false);
    onClose();
  };

  const handleSubmit = async () => {
    try {
      await onSubmit(rating, comment);
      setSubmitted(true);
      toast({ title: isEditing ? "Avis mis à jour" : "Avis publié", description: "Votre avis a été enregistré." });
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Veuillez réessayer.", variant: "destructive" });
    }
  };

  const canSubmit = rating > 0;

  const ratingLabel = ["", "Médiocre", "Correct", "Bien", "Très bien", "Excellent"][rating] ?? "";

  // Swipe-to-dismiss on the grabber — same shared hook/parameters as every
  // other modal in the app (liveDrag=true, 70px threshold, 520ms exit).
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
        <VisuallyHidden><DialogTitle>Écrire un avis</DialogTitle></VisuallyHidden>

        <div className={`flex flex-col max-h-[90vh] overflow-hidden transition-colors duration-200 ${bg}`}>

          {/* ── Fixed header ── */}
          <div className={`shrink-0 ${bg} px-5 pt-1 pb-4`}>
            <ModalGrabber isDark={dk} />
            <div className="flex items-center justify-between mb-4 mt-1">
              {/* Dark / light toggle */}
              <button
                onClick={toggle}
                aria-label="Changer de thème"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
              </button>

              {/* Centered title */}
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight ${textPrimary}`}>
                  {isEditing ? "Modifier votre avis" : "Écrire un avis"}
                </span>
                <span className={`text-[11px] font-medium ${textMuted}`}>{targetName}</span>
              </div>

              {/* Close */}
              <button
                onClick={handleClose}
                aria-label="Fermer"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Divider */}
            <div className={`mt-4 h-px w-full ${divider}`} />
          </div>

          {/* ── Scrollable content ── */}
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
            {/* Review type label */}
            <div className={`flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold rounded-xl ${dk ? "bg-gray-800 text-gray-200" : "bg-gray-100 text-gray-700"}`}>
              <Package className="w-3.5 h-3.5" /> {reviewTypeLabel}
            </div>
            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${dk ? "bg-emerald-500/15" : "bg-emerald-50"}`}>
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <p className={`font-semibold ${textPrimary}`}>{isEditing ? "Avis mis à jour !" : "Avis publié !"}</p>
                <p className={`text-sm ${textMuted}`}>Merci pour votre retour.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5 py-1">

                {canReview && (
                  <div className={`p-3 rounded-xl border space-y-2 ${dk ? "border-gray-700" : "border-gray-200"}`}>
                    {extraFormContent}
                    <div className="space-y-1">
                      <label className={labelCls}>Note *</label>
                      <StarPicker value={rating} onChange={setRating} />
                      {rating > 0 && (
                        <p className={`text-xs ${textMuted}`}>{ratingLabel}</p>
                      )}
                    </div>

                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Partagez votre expérience…"
                      className={`resize-none text-sm rounded-xl ${inputCls}`}
                      rows={2}
                    />

                    <Button
                      size="sm"
                      onClick={handleSubmit}
                      disabled={!canSubmit || isSubmitting}
                      className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white border-0"
                    >
                      {isSubmitting ? "Enregistrement…" : isEditing ? "Mettre à jour l'avis" : "Publier l'avis"}
                    </Button>
                  </div>
                )}

                {/* Existing reviews */}
                {existingReviews.length > 0 && (
                  <div className="mt-2">
                    <div className={`h-px w-full ${divider} mb-4`} />
                    <div className={`flex items-center justify-center gap-1.5 py-2 mb-3 text-[11px] font-semibold rounded-xl ${dk ? "bg-gray-800 text-gray-200" : "bg-gray-100 text-gray-700"}`}>
                      <Star className="w-3.5 h-3.5" /> {existingReviews.length} avis
                    </div>
                    <div className="flex flex-col gap-3">
                      {existingReviews.map((r) => (
                        <div key={r.id} className={`border rounded-2xl p-4 space-y-2 ${reviewCardBg}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-semibold ${textPrimary}`}>
                                {r.cafeName || r.cafeOwnerName || "Propriétaire de café"}
                                {user && r.cafeId === user.id && (
                                  <span className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${dk ? "bg-amber-500/20 text-amber-400" : "bg-amber-50 text-amber-600"}`}>Vous</span>
                                )}
                              </p>
                              <StarDisplay rating={r.rating} />
                            </div>
                            {r.createdAt && (
                              <p className={`text-[10px] ${textMuted}`}>
                                {new Date(r.createdAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          {r.comment && (
                            <p className={`text-sm leading-relaxed ${textMuted}`}>{r.comment}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
