import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Star, X } from "lucide-react";

// Shared dedicated reviews modal (Phase 7) — the "Avis" block that used to
// render inline inside each of the 7 professional Details Modals, now opened
// via a Star icon instead. Takes raw review rows as-is (same shape every
// account type's existing GET /api/<type>/reviews/:userId already returns —
// supplierProductReviews with a reviewType discriminator, see the shared
// table) so nothing is recalculated/duplicated here, only re-presented.
// `reviewForm` is each caller's own EXISTING "write a review" block (its
// eligibility check, mutation, and validation are account-specific and stay
// exactly as they were — only relocated here alongside the list it updates),
// omitted entirely when the viewer can't review (not Coffee Owner / no
// completed order / already reviewed / viewing their own read-only preview).
export function ReviewsModal({
  open, onClose, professionalName, rating, reviewCount, reviews, isDark, reviewForm,
}: {
  open: boolean;
  onClose: () => void;
  professionalName: string;
  rating: number | string;
  reviewCount: number;
  reviews: { id: number | string; cafeOwnerName?: string | null; cafeName?: string | null; rating: number; comment?: string | null; createdAt?: string }[];
  isDark: boolean;
  reviewForm?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* Close button synchronized to the Hero Signaler modal's standardized
          design (docs/coffee_owner_avis_close_icon_audit.md) — default shadcn
          close hidden, replaced with the same circular button. */}
      <DialogContent className={`sm:max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border-0 shadow-2xl [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${isDark ? "bg-gray-900 text-white" : "bg-white text-gray-900"}`}>
        <DialogHeader>
          <VisuallyHidden><DialogTitle>Avis — {professionalName}</DialogTitle></VisuallyHidden>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Star className="w-5 h-5 fill-amber-400 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-base leading-tight">{professionalName}</p>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {reviewCount > 0 ? `${Number(rating).toFixed(1)} · ${reviewCount} avis` : "Aucun avis pour le moment"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-2.5 mt-2">
          {reviews.length === 0 ? (
            <p className={`text-sm text-center py-6 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              Ce professionnel n'a pas encore reçu d'avis.
            </p>
          ) : (
            reviews.map((review) => (
              <div key={review.id} className={`p-3 rounded-xl ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-medium text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                    {review.cafeOwnerName || review.cafeName || "Client"}
                  </span>
                  <span className="flex items-center gap-0.5 text-amber-500 text-xs shrink-0">
                    <Star className="w-3 h-3 fill-amber-400" /> {review.rating}
                  </span>
                </div>
                {review.comment && <p className={`text-sm mt-1.5 ${isDark ? "text-gray-300" : "text-gray-600"}`}>{review.comment}</p>}
                {review.createdAt && (
                  <p className={`text-[11px] mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {new Date(review.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {reviewForm && <div className="mt-2">{reviewForm}</div>}
      </DialogContent>
    </Dialog>
  );
}
